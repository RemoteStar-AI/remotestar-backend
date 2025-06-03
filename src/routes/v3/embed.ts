import { Router } from "express";
import { upload } from "../../middleware/upload";
import { authenticate } from "../../middleware/firebase-auth";
import { z } from "zod";
import { extractPrompt, reformatPrompt, culturalFitPrompt, skillsPrompt } from "../../utils/prompts";
import { openai } from "../../utils/openai";
import { resumeSchema, culturalFitSchema, skillsSchema } from "../../utils/schema";
import { extractJsonFromMarkdown, getCanonicalSkillNames, saveNewSkillsIfNotExist } from "../../utils/helper-functions";
import { User, CulturalFit, Skills, Job } from "../../utils/db";
import { uploadPDFToS3 } from "../../utils/s3";
import mongoose from "mongoose";
import pdfParse from "pdf-parse";
import { v4 as uuidv4 } from 'uuid';

const resumeUploadRouter = Router();

const extractSchema = z.object({
  jobId: z.string().optional().nullable(),
  organisation_id: z.string().optional().nullable().transform(val => val ?? null),
  webhook_url: z.string().url().optional()
});

// Store processing status
const processingStatus = new Map<string, {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results?: any[];
  error?: string;
  progress?: number;
}>();

// Function to process a single file
async function processFile(
  file: Express.Multer.File,
  firebase_id: string,
  email: string,
  organisation: string,
  displayName: string,
  jobId: string | null,
  organisation_id: string | null
) {
  try {
    console.log(`[PROCESS] Starting file: ${file.originalname}`);
    // Extract text from PDF
    const data = await pdfParse(file.buffer);
    let extractedText = data.text || "";
    console.log(`[PROCESS] Extracted text from PDF: ${file.originalname}`);

    // Extract links from PDF
    const extractedLinks: { url: string, text: string }[] = [];
    try {
      const linkBuffer = Buffer.from(file.buffer);
      await pdfParse(linkBuffer, {
        pagerender: function(pageData: any) {
          if (!pageData.getAnnotations) return pageData;
          return pageData.getAnnotations().then(function(annotations: any[]) {
            if (!annotations || !annotations.length) return pageData;
            annotations.forEach(function(annotation: any) {
              if (
                annotation.subtype === 'Link' && 
                annotation.url && 
                typeof annotation.url === 'string'
              ) {
                extractedLinks.push({
                  url: annotation.url,
                  text: annotation.title || ''
                });
              }
            });
            return pageData;
          }).catch(function() {
            return pageData;
          });
        }
      });
      if (extractedLinks.length > 0) {
        console.log(`[PROCESS] Extracted ${extractedLinks.length} links from PDF: ${file.originalname}`);
      }
    } catch (linkError) {
      console.error(`[PROCESS] Link extraction error for ${file.originalname}:`, linkError);
    }

    // Add links to the text if any were found
    if (extractedLinks.length > 0) {
      extractedText += "\n\nLinks found in document:\n";
      extractedLinks.forEach(link => {
        extractedText += `${link.text ? link.text + ": " : ""}${link.url}\n`;
      });
    }

    // Extract structured data using OpenAI
    const extractPromptText = extractPrompt(extractedText);
    console.log(`[OPENAI] Sending extraction prompt for: ${file.originalname}`);
    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: extractPromptText }],
    });
    console.log(`[OPENAI] Received extraction response for: ${file.originalname}`);

    let extractedData = response.choices[0].message.content?.trim();
    if (!extractedData) throw new Error("Empty response from OpenAI");

    // Parse and validate the extracted data
    let validJson = extractJsonFromMarkdown(extractedData).replace(/(\r\n|\n|\r)/gm, "");
    let parsedJson = JSON.parse(validJson);
    let validation = resumeSchema.safeParse(parsedJson);
    if (!validation.success) {
      console.log(`[VALIDATION] Extraction did not match schema for: ${file.originalname}`);
      // Try reformatting if validation fails
      const errorDetails = validation.error.errors
        .map((err) => `Path: ${err.path.join(".") || "root"} - ${err.message}`)
        .join("\n");
      const reformatText = reformatPrompt(extractedData, errorDetails);
      console.log(`[OPENAI] Sending reformat prompt for: ${file.originalname}`);
      response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: reformatText }],
      });
      console.log(`[OPENAI] Received reformatted response for: ${file.originalname}`);
      extractedData = response.choices[0].message.content?.trim();
      if (!extractedData) throw new Error("Empty reformatted response from OpenAI");
      validJson = extractJsonFromMarkdown(extractedData).replace(/(\r\n|\n|\r)/gm, "");
      parsedJson = JSON.parse(validJson);
      validation = resumeSchema.safeParse(parsedJson);
      if (!validation.success) {
        console.error(`[VALIDATION] Reformatted response still does not match schema for: ${file.originalname}`);
        throw new Error("Failed to format response into the required schema");
      }
    }
    console.log(`[VALIDATION] Extraction validated for: ${file.originalname}`);

    // Upload PDF to S3
    let resume_url: string | null = null;
    try {
      resume_url = await uploadPDFToS3(
        file.buffer,
        file.originalname,
        file.mimetype
      );
      console.log(`[S3] Uploaded PDF to S3 for: ${file.originalname}`);
    } catch (e) {
      console.error(`[S3] S3 upload failed for ${file.originalname}:`, e);
      throw new Error("Resume upload to S3 failed");
    }

    // Create unique ID for the user
    const uniqueId = new mongoose.Types.ObjectId();
    console.log(`[DB] Creating user document for: ${file.originalname}`);

    // Get cultural fit
    const cfPrompt = culturalFitPrompt(JSON.stringify(parsedJson));
    console.log(`[OPENAI] Sending cultural fit prompt for: ${file.originalname}`);
    const cfRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: cfPrompt }],
    });
    const cfText = cfRes.choices[0].message.content?.trim();
    if (!cfText) throw new Error("Empty cultural fit response");
    const cfJson = extractJsonFromMarkdown(cfText).replace(/[\r\n]/g, "");
    const cfParsed = JSON.parse(cfJson);
    if (!culturalFitSchema.safeParse(cfParsed).success) {
      console.error(`[VALIDATION] Cultural fit validation failed for: ${file.originalname}`);
      throw new Error("Cultural fit validation failed");
    }
    console.log(`[VALIDATION] Cultural fit validated for: ${file.originalname}`);

    // Get skills
    const canon = await getCanonicalSkillNames();
    const skPrompt = skillsPrompt(JSON.stringify(parsedJson), canon);
    console.log(`[OPENAI] Sending skills prompt for: ${file.originalname}`);
    const skRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: skPrompt }],
    });
    const skText = skRes.choices[0].message.content?.trim();
    if (!skText) throw new Error("Empty skills response");
    const skJson = extractJsonFromMarkdown(skText).replace(/[\r\n]/g, "");
    const skParsed = JSON.parse(skJson);
    if (!skillsSchema.safeParse(skParsed).success) {
      console.error(`[VALIDATION] Skills validation failed for: ${file.originalname}`);
      throw new Error("Skills validation failed");
    }
    console.log(`[VALIDATION] Skills validated for: ${file.originalname}`);

    // Save to database
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      // Create user document
      const user = await User.create([{
        _id: uniqueId,
        firebase_id,
        firebase_email: email,
        organisation_id: organisation,
        firebase_uploader_name: displayName,
        job: jobId,
        resume_url,
        ...parsedJson,
      }], { session });
      // Create cultural fit document
      await CulturalFit.create([{
        ...cfParsed,
        userId: uniqueId
      }], { session });
      // Create skills document
      await Skills.create([{
        skills: skParsed,
        userId: uniqueId
      }], { session });
      // Update job revaluation status if needed
      if (jobId) {
        await Job.findByIdAndUpdate(jobId, { needRevaluation: true });
        console.log(`[DB] Job revaluation set for jobId: ${jobId}`);
      } else {
        await Job.updateMany(
          { organisation_id: organisation },
          { needRevaluation: true }
        );
        console.log(`[DB] Organisation revaluation set for organisation: ${organisation}`);
      }
      await session.commitTransaction();
      session.endSession();
      console.log(`[DB] All documents saved for: ${file.originalname}`);
      return {
        success: true,
        data: {
          userId: uniqueId.toString(),
          ...parsedJson
        }
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error(`[DB] Transaction failed for: ${file.originalname}`, error);
      throw error;
    }
  } catch (error: any) {
    console.error(`[PROCESS] Error processing file ${file.originalname}:`, error);
    return {
      success: false,
      error: error.message || "Failed to process file"
    };
  }
}

// Function to send webhook notification
async function sendWebhookNotification(webhookUrl: string, data: any) {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    console.error('Failed to send webhook notification:', error);
  }
}

resumeUploadRouter.post("/", authenticate, upload.array('files'), async (req: any, res: any) => {
  try {
    console.log(`[ROUTE] Resume upload started. Files: ${req.files?.length || 0}`);
    // Validate input
    const validation = extractSchema.safeParse(req.body);
    if (!validation.success) {
      console.error(`[ROUTE] Validation error:`, validation.error.format());
      return res.status(400).json({ error: validation.error.format() });
    }
    const { jobId, organisation_id, webhook_url } = validation.data;
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      console.error(`[ROUTE] No files provided.`);
      return res.status(400).json({ error: "No files provided" });
    }
    // Generate a unique processing ID
    const processingId = uuidv4();
    // Initialize processing status
    processingStatus.set(processingId, {
      status: 'pending',
      progress: 0
    });
    // Start processing in the background
    (async () => {
      try {
        processingStatus.set(processingId, {
          status: 'processing',
          progress: 0
        });
        const results = [];
        const { firebase_id, email, organisation, displayName } = req.user;
        for (let i = 0; i < files.length; i++) {
          console.log(`[ROUTE] Processing file ${i + 1}/${files.length}: ${files[i].originalname}`);
          const file = files[i];
          const result = await processFile(
            file,
            firebase_id,
            email,
            organisation,
            displayName,
            jobId ?? null,
            organisation_id ?? null
          );
          results.push({
            filename: file.originalname,
            ...result
          });
          // Update progress
          const progress = Math.round(((i + 1) / files.length) * 100);
          processingStatus.set(processingId, {
            status: 'processing',
            progress,
            results
          });
          // Send progress update if webhook URL is provided
          if (webhook_url) {
            await sendWebhookNotification(webhook_url, {
              processingId,
              status: 'processing',
              progress,
              results
            });
          }
        }
        // Mark as completed
        processingStatus.set(processingId, {
          status: 'completed',
          progress: 100,
          results
        });
        // Send final webhook notification
        if (webhook_url) {
          await sendWebhookNotification(webhook_url, {
            processingId,
            status: 'completed',
            progress: 100,
            results
          });
        }
        console.log(`[ROUTE] All files processed for processingId: ${processingId}`);
      } catch (error: any) {
        processingStatus.set(processingId, {
          status: 'failed',
          error: error.message || "Processing failed"
        });
        if (webhook_url) {
          await sendWebhookNotification(webhook_url, {
            processingId,
            status: 'failed',
            error: error.message || "Processing failed"
          });
        }
        console.error(`[ROUTE] Processing failed for processingId: ${processingId}`, error);
      }
    })();
    // Immediately return the processing ID
    return res.status(202).json({
      message: "Resume processing started",
      processingId,
      status: "pending"
    });
  } catch (error) {
    console.error(`[ROUTE] Error during resume processing:`, error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Add a status check endpoint
resumeUploadRouter.get("/status/:processingId", authenticate, (req: any, res: any) => {
  const { processingId } = req.params;
  const status = processingStatus.get(processingId);
  if (!status) {
    console.error(`[ROUTE] Status check: Processing ID not found: ${processingId}`);
    return res.status(404).json({ error: "Processing ID not found" });
  }
  console.log(`[ROUTE] Status check: Processing ID found: ${processingId}`);
  console.log(`[ROUTE] Status:`, status);
  return res.status(200).json(status);
});

export { resumeUploadRouter }; 