import { Router } from "express";
import { upload } from "../../middleware/upload";
import { authenticate } from "../../middleware/firebase-auth";
import { z } from "zod";
import {
  extractPrompt,
  reformatPrompt,
  culturalFitPrompt,
  skillsPromptNoCanon,
} from "../../utils/prompts";
import { openai } from "../../utils/openai";
import {
  resumeSchema,
  culturalFitSchema,
  skillsSchema,
} from "../../utils/schema";
import {
  extractJsonFromMarkdown,
  normalizeSkillNameWithPinecone,
} from "../../utils/helper-functions";
import { User, CulturalFit, Skills, Job } from "../../utils/db";
import { uploadPDFToS3 } from "../../utils/s3";
import mongoose from "mongoose";
import pdfParse from "pdf-parse";
import { v4 as uuidv4 } from "uuid";
import logger from "../../utils/loggers";

const resumeUploadRouter = Router();

const extractSchema = z.object({
  jobId: z.string().optional().nullable(),
  organisation_id: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val ?? null),
  webhook_url: z.string().url().optional(),
});

// Store processing status
const processingStatus = new Map<
  string,
  {
    status: "pending" | "processing" | "completed" | "failed";
    results?: any[];
    error?: string;
    progress?: number;
  }
>();

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
    logger.info(`[PROCESS] Starting file: ${file.originalname}`);
    // Extract text from PDF
    const data = await pdfParse(file.buffer);
    let extractedText = data.text || "";
    logger.info(`[PROCESS] Extracted text from PDF: ${file.originalname}`);

    // Extract links from PDF
    const extractedLinks: { url: string; text: string }[] = [];
    try {
      const linkBuffer = Buffer.from(file.buffer);
      await pdfParse(linkBuffer, {
        pagerender: function (pageData: any) {
          if (!pageData.getAnnotations) return pageData;
          return pageData
            .getAnnotations()
            .then(function (annotations: any[]) {
              if (!annotations || !annotations.length) return pageData;
              annotations.forEach(function (annotation: any) {
                if (
                  annotation.subtype === "Link" &&
                  annotation.url &&
                  typeof annotation.url === "string"
                ) {
                  extractedLinks.push({
                    url: annotation.url,
                    text: annotation.title || "",
                  });
                }
              });
              return pageData;
            })
            .catch(function () {
              return pageData;
            });
        },
      });
      if (extractedLinks.length > 0) {
        logger.info(
          `[PROCESS] Extracted ${extractedLinks.length} links from PDF: ${file.originalname}`
        );
      }
    } catch (linkError) {
      logger.error(
        `[PROCESS] Link extraction error for ${file.originalname}:`,
        linkError
      );
    }

    // Add links to the text if any were found
    if (extractedLinks.length > 0) {
      extractedText += "\n\nLinks found in document:\n";
      extractedLinks.forEach((link) => {
        extractedText += `${link.text ? link.text + ": " : ""}${link.url}\n`;
      });
    }

    // Extract structured data using OpenAI
    const extractPromptText = extractPrompt(extractedText);
    logger.info(`[OPENAI] Sending extraction prompt for: ${file.originalname}`);
    let response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: extractPromptText }],
    });
    logger.info(
      `[OPENAI] Received extraction response for: ${file.originalname}`
    );

    let extractedData = response.choices[0].message.content?.trim();
    console.log("extractedData", extractedData);
    if (!extractedData) throw new Error("Empty response from OpenAI");

    // Parse and validate the extracted data
    let validJson = extractJsonFromMarkdown(extractedData).replace(
      /(\r\n|\n|\r)/gm,
      ""
    );
    console.log("validJson", validJson);
    let parsedJson = JSON.parse(validJson);
    console.log("parsedJson", parsedJson);
    let validation = resumeSchema.safeParse(parsedJson);
    if (!validation.success) {
      logger.info(
        `[VALIDATION] Extraction did not match schema for: ${file.originalname}`
      );
      // Try reformatting if validation fails
      const errorDetails = validation.error.errors
        .map((err) => `Path: ${err.path.join(".") || "root"} - ${err.message}`)
        .join("\n");
      const reformatText = reformatPrompt(extractedData, errorDetails);
      logger.info(`[OPENAI] Sending reformat prompt for: ${file.originalname}`);
      response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: reformatText }],
      });
      logger.info(
        `[OPENAI] Received reformatted response for: ${file.originalname}`
      );
      extractedData = response.choices[0].message.content?.trim();
      if (!extractedData)
        throw new Error("Empty reformatted response from OpenAI");
      validJson = extractJsonFromMarkdown(extractedData).replace(
        /(\r\n|\n|\r)/gm,
        ""
      );
      parsedJson = JSON.parse(validJson);
      validation = resumeSchema.safeParse(parsedJson);
      if (!validation.success) {
        logger.error(
          `[VALIDATION] Reformatted response still does not match schema for: ${file.originalname}`
        );
        throw new Error("Failed to format response into the required schema");
      }
    }
    logger.info(`[VALIDATION] Extraction validated for: ${file.originalname}`);

    // Duplicate check: email + organisation_id
    const existingUser = await User.findOne({
      email: parsedJson.email,
      organisation_id: organisation,
    });
    if (existingUser) {
      logger.warn(
        `[DUPLICATE] User with email ${parsedJson.email} already exists in organisation ${organisation}. Skipping file: ${file.originalname}`
      );
      return {
        success: false,
        error: "Resume already exists in organisation",
      };
    }

    // Upload PDF to S3
    let resume_url: string | null = null;
    try {
      resume_url = await uploadPDFToS3(
        file.buffer,
        file.originalname,
        file.mimetype
      );
      logger.info(`[S3] Uploaded PDF to S3 for: ${file.originalname}`);
    } catch (e) {
      logger.error(`[S3] S3 upload failed for ${file.originalname}:`, e);
      throw new Error("Resume upload to S3 failed");
    }

    // Create unique ID for the user
    const uniqueId = new mongoose.Types.ObjectId();
    logger.info(`[DB] Creating user document for: ${file.originalname}`);

    // Get cultural fit
    const cfPrompt = culturalFitPrompt(JSON.stringify(parsedJson));
    logger.info(
      `[OPENAI] Sending cultural fit prompt for: ${file.originalname}`
    );
    const cfRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: cfPrompt }],
    });
    const cfText = cfRes.choices[0].message.content?.trim();
    if (!cfText) throw new Error("Empty cultural fit response");
    const cfJson = extractJsonFromMarkdown(cfText).replace(/[\r\n]/g, "");
    const cfParsed = JSON.parse(cfJson);
    if (!culturalFitSchema.safeParse(cfParsed).success) {
      logger.error(
        `[VALIDATION] Cultural fit validation failed for: ${file.originalname}`
      );
      throw new Error("Cultural fit validation failed");
    }
    logger.info(
      `[VALIDATION] Cultural fit validated for: ${file.originalname}`
    );

    // Get skills
    const skPrompt = skillsPromptNoCanon(JSON.stringify(validJson));
    logger.info(`[SKILLS] Skills prompt: ${skPrompt}`);
    logger.info(`[OPENAI] Sending skills prompt for: ${file.originalname}`);
    const skRes = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: skPrompt }],
    });
    const skText = skRes.choices[0].message.content?.trim();
    if (!skText) throw new Error("Empty skills response");
    const skJson = extractJsonFromMarkdown(skText).replace(/[\r\n]/g, "");
    let skParsed = JSON.parse(skJson);
    if (!skillsSchema.safeParse(skParsed).success) {
      logger.error(
        `[VALIDATION] Skills validation failed for: ${file.originalname}`
      );
      throw new Error("Skills validation failed");
    }
    logger.info(
      `[SKILLS] Skills before normalization : ${JSON.stringify(skParsed)}`
    );
    // Normalize skill names using Pinecone
    for (const skill of skParsed) {
      skill.name = await normalizeSkillNameWithPinecone(
        skill.name,
        skill.summary
      );
    }
    logger.info(`[VALIDATION] Skills validated for: ${file.originalname}`);
    logger.info(
      `[SKILLS] Skills after normalization for: ${JSON.stringify(skParsed)}`
    );
    // Save to database
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      // Create user document
      const user = await User.create(
        [
          {
            _id: uniqueId,
            firebase_id,
            firebase_email: email,
            organisation_id: organisation,
            firebase_uploader_name: displayName,
            job: jobId,
            resume_url,
            ...parsedJson,
          },
        ],
        { session }
      );
      // Create cultural fit document
      await CulturalFit.create(
        [
          {
            ...cfParsed,
            userId: uniqueId,
          },
        ],
        { session }
      );
      // Create skills document
      await Skills.create(
        [
          {
            skills: skParsed,
            userId: uniqueId,
          },
        ],
        { session }
      );
      // Update job revaluation status if needed
      if (jobId) {
        await Job.findByIdAndUpdate(jobId, { needRevaluation: true });
        logger.info(`[DB] Job revaluation set for jobId: ${jobId}`);
      } else {
        await Job.updateMany(
          { organisation_id: organisation },
          { needRevaluation: true }
        );
        logger.info(
          `[DB] Organisation revaluation set for organisation: ${organisation}`
        );
      }
      await session.commitTransaction();
      session.endSession();
      logger.info(`[DB] All documents saved for: ${file.originalname}`);
      return {
        success: true,
        data: {
          userId: uniqueId.toString(),
          ...parsedJson,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      logger.error(`[DB] Transaction failed for: ${file.originalname}`, error);
      throw error;
    }
  } catch (error: any) {
    logger.error(
      `[PROCESS] Error processing file ${file.originalname}:`,
      error
    );
    return {
      success: false,
      error: error.message || "Failed to process file",
    };
  }
}

// Function to send webhook notification
async function sendWebhookNotification(webhookUrl: string, data: any) {
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  } catch (error) {
    logger.error("Failed to send webhook notification:", error);
  }
}

resumeUploadRouter.post(
  "/",
  authenticate,
  upload.array("files"),
  async (req: any, res: any) => {
    try {
      logger.info(
        `[ROUTE] Resume upload started. Files: ${req.files?.length || 0}`
      );
      // Validate input
      const validation = extractSchema.safeParse(req.body);
      if (!validation.success) {
        logger.error(`[ROUTE] Validation error:`, validation.error.format());
        return res.status(400).json({ error: validation.error.format() });
      }
      const { jobId, organisation_id, webhook_url } = validation.data;
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        logger.error(`[ROUTE] No files provided.`);
        return res.status(400).json({ error: "No files provided" });
      }
      // Generate a unique processing ID
      const processingId = uuidv4();
      // Initialize processing status
      processingStatus.set(processingId, {
        status: "pending",
        progress: 0,
      });
      // Start processing in the background
      (async () => {
        try {
          processingStatus.set(processingId, {
            status: "processing",
            progress: 0,
          });
          const { firebase_id, email, organisation, displayName } = req.user;
          const fileProcessPromises = files.map((file, i) =>
            processFile(
              file,
              firebase_id,
              email,
              organisation,
              displayName,
              jobId ?? null,
              organisation_id ?? null
            ).then((result) => ({ _index: i, filename: file.originalname, ...result }))
          );
          let results: any[] = await Promise.all(fileProcessPromises);
          results = results.sort((a, b) => a._index - b._index);
          for (let i = 0; i < results.length; i++) {
            const progress = Math.round(((i + 1) / results.length) * 100);
            const outputResults = results.slice(0, i + 1).map(({ _index, ...rest }) => rest);
            processingStatus.set(processingId, {
              status: i === results.length - 1 ? "completed" : "processing",
              progress,
              results: outputResults,
            });
            if (webhook_url) {
              await sendWebhookNotification(webhook_url, {
                processingId,
                status: i === results.length - 1 ? "completed" : "processing",
                progress,
                results: outputResults,
              });
            }
          }
          logger.info(`[ROUTE] All files processed for processingId: ${processingId}`);
        } catch (error: any) {
          processingStatus.set(processingId, {
            status: "failed",
            error: error.message || "Processing failed",
          });
          if (webhook_url) {
            await sendWebhookNotification(webhook_url, {
              processingId,
              status: "failed",
              error: error.message || "Processing failed",
            });
          }
          logger.error(
            `[ROUTE] Processing failed for processingId: ${processingId}`,
            error
          );
        }
      })();
      // Immediately return the processing ID
      return res.status(202).json({
        message: "Resume processing started",
        processingId,
        status: "pending",
      });
    } catch (error) {
      logger.error(`[ROUTE] Error during resume processing:`, error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Convert GET /reanalyse/:id to POST with file upload
resumeUploadRouter.post(
  "/reanalyse/:id",
  upload.single("file"),
  async (req: any, res: any) => {
    logger.info(
      `[REANALYSE] Starting reanalysis for user ID: ${req.params.id}`
    );
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      logger.info(`[REANALYSE] User not found with ID: ${id}`);
      return res.status(404).json({ error: "User not found" });
    }
    const transaction = await mongoose.startSession();
    transaction.startTransaction();
    logger.info(`[REANALYSE] Started transaction for user ID: ${id}`);
    try {
      // Remove old skills and cultural fit
      logger.info(
        `[REANALYSE] Deleting existing skills and cultural fit for user ID: ${id}`
      );
      await Skills.deleteMany({ userId: id });
      await CulturalFit.deleteMany({ userId: id });

      // Get canonical skills
      logger.info(`[REANALYSE] Fetching canonical skills`);

      let resumeText: string | null = null;
      let resume_url = user.resume_url;
      let parsedJson = user.toObject();
      let file = req.file as Express.Multer.File | undefined;

      if (file) {
        logger.info(
          `[REANALYSE] Processing new resume file for user ID: ${id}`
        );
        // New resume uploaded: parse, upload to S3, extract text, and reanalyse
        const data = await pdfParse(file.buffer);
        resumeText = data.text || "";
        // Upload new PDF to S3
        logger.info(`[REANALYSE] Uploading PDF to S3 for user ID: ${id}`);
        resume_url = await uploadPDFToS3(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        // Extract structured data using OpenAI
        logger.info(
          `[REANALYSE] Extracting structured data using OpenAI for user ID: ${id}`
        );
        const extractPromptText = extractPrompt(resumeText);
        let response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: extractPromptText }],
        });
        let extractedData = response.choices[0].message.content?.trim();
        if (!extractedData) throw new Error("Empty response from OpenAI");
        let validJson = extractJsonFromMarkdown(extractedData).replace(
          /(\r\n|\n|\r)/gm,
          ""
        );
        parsedJson = JSON.parse(validJson);
        let validation = resumeSchema.safeParse(parsedJson);
        if (!validation.success) {
          logger.info(
            `[REANALYSE] Initial validation failed, attempting reformatting for user ID: ${id}`
          );
          // Try reformatting if validation fails
          const errorDetails = validation.error.errors
            .map(
              (err) => `Path: ${err.path.join(".") || "root"} - ${err.message}`
            )
            .join("\n");
          const reformatText = reformatPrompt(extractedData, errorDetails);
          response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: reformatText }],
          });
          extractedData = response.choices[0].message.content?.trim();
          if (!extractedData)
            throw new Error("Empty reformatted response from OpenAI");
          validJson = extractJsonFromMarkdown(extractedData).replace(
            /(\r\n|\n|\r)/gm,
            ""
          );
          parsedJson = JSON.parse(validJson);
          validation = resumeSchema.safeParse(parsedJson);
          if (!validation.success) {
            throw new Error(
              "Failed to format response into the required schema"
            );
          }
        }
      } else if (
        resume_url &&
        resume_url !==
          "https://conasems-ava-prod.s3.sa-east-1.amazonaws.com/aulas/ava/dummy-1641923583.pdf"
      ) {
        logger.info(
          `[REANALYSE] Fetching existing resume from URL for user ID: ${id}`
        );
        // No new file, but user has a resume_url: fetch and parse
        try {
          const fetch = (await import("node-fetch")).default;
          const pdfParse = (await import("pdf-parse")).default;
          const response = await fetch(resume_url);
          if (!response.ok) throw new Error("Failed to fetch resume PDF");
          const buffer = await response.buffer();
          const data = await pdfParse(buffer);
          if (data.text) {
            resumeText = data.text;
          }
        } catch (err) {
          logger.error(
            `[REANALYSE] Failed to fetch/parse resume PDF for user ID: ${id}`,
            err
          );
        }
      }

      // Reanalyse cultural fit
      logger.info(`[REANALYSE] Analyzing cultural fit for user ID: ${id}`);
      const cfPrompt = culturalFitPrompt(
        resumeText ? { ...parsedJson, resumeText } : parsedJson
      );
      const cfRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: cfPrompt }],
      });
      const cfText = cfRes.choices[0].message.content?.trim();
      if (!cfText) throw new Error("Empty cultural fit response");
      const cfJson = extractJsonFromMarkdown(cfText).replace(/[\r\n]/g, "");
      const cfParsed = JSON.parse(cfJson);
      if (!culturalFitSchema.safeParse(cfParsed).success) {
        throw new Error("Cultural fit validation failed");
      }
      await CulturalFit.create([{ ...cfParsed, userId: id }], {
        session: transaction,
      });

      // Reanalyse skills
      logger.info(`[REANALYSE] Analyzing skills for user ID: ${id}`);
      const skPrompt = skillsPromptNoCanon(
        resumeText ? { ...parsedJson, resumeText } : parsedJson
      );
      const skRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: skPrompt }],
      });
      const skText = skRes.choices[0].message.content?.trim();
      if (!skText) throw new Error("Empty skills response");
      const skJson = extractJsonFromMarkdown(skText).replace(/[\r\n]/g, "");
      const skParsed = JSON.parse(skJson);
      if (!skillsSchema.safeParse(skParsed).success) {
        throw new Error("Skills validation failed");
      }
      // Normalize skill names using Pinecone
      for (const skill of skParsed) {
        skill.name = await normalizeSkillNameWithPinecone(
          skill.name,
          skill.summary
        );
      }
      await Skills.create([{ skills: skParsed, userId: id }], {
        session: transaction,
      });

      // Update user document with new resume_url and parsed fields if new file uploaded
      let updatedUser;
      if (file) {
        logger.info(
          `[REANALYSE] Updating user document with new resume data for user ID: ${id}`
        );
        await User.findByIdAndUpdate(
          id,
          {
            ...parsedJson,
            resume_url,
          },
          { session: transaction }
        );
        updatedUser = await User.findById(id);
      } else {
        // If no file, just fetch the latest user (no update)
        updatedUser = await User.findById(id);
      }

      await transaction.commitTransaction();
      transaction.endSession();
      logger.info(
        `[REANALYSE] Successfully completed reanalysis for user ID: ${id}`
      );

      return res.status(200).json({
        message: "Reanalysis complete",
        user: updatedUser,
        skills: skParsed,
        culturalFit: cfParsed,
      });
    } catch (error: any) {
      await transaction.abortTransaction();
      transaction.endSession();
      logger.error(
        `[REANALYSE] Error during reanalysis for user ID: ${id}:`,
        error
      );
      return res
        .status(500)
        .json({ error: error.message || "Failed to reanalyse user" });
    }
  }
);

// Add a status check endpoint
resumeUploadRouter.get(
  "/status/:processingId",
  authenticate,
  (req: any, res: any) => {
    const { processingId } = req.params;
    const status = processingStatus.get(processingId);
    if (!status) {
      logger.error(
        `[ROUTE] Status check: Processing ID not found: ${processingId}`
      );
      return res.status(404).json({ error: "Processing ID not found" });
    }
    logger.info(`[ROUTE] Status check: Processing ID found: ${processingId}`);
    logger.info(`[ROUTE] Status:`, status);
    return res.status(200).json(status);
  }
);

export { resumeUploadRouter };
