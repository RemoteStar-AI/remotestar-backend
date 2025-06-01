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

const embedRouter3 = Router();

const extractSchema = z.object({
  jobId: z.string().optional().nullable(),
  organisation_id: z.string().optional().nullable()
});

embedRouter3.post("/", authenticate, upload.array('files'), async (req: any, res: any) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const { firebase_id, email, organisation, displayName } = req.user;
    let organisation_id_to_use = organisation;

    // Validate input
    const validation = extractSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.format() });
    }

    const { jobId, organisation_id } = validation.data;
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "No files provided" });
    }

    const results = [];
    const userDocs = [];
    const culturalFitResults = [];
    const skillsResults = [];

    for (const file of files) {
      try {
        // Extract text from PDF
        const data = await pdfParse(file.buffer);
        let extractedText = data.text || "";

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
        } catch (linkError) {
          console.error("Link extraction error:", linkError);
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
        let response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: extractPromptText }],
        });

        let extractedData = response.choices[0].message.content?.trim();
        if (!extractedData) throw new Error("Empty response from OpenAI");

        // Parse and validate the extracted data
        let validJson = extractJsonFromMarkdown(extractedData).replace(/(\r\n|\n|\r)/gm, "");
        let parsedJson = JSON.parse(validJson);
        let validation = resumeSchema.safeParse(parsedJson);

        if (!validation.success) {
          // Try reformatting if validation fails
          const errorDetails = validation.error.errors
            .map((err) => `Path: ${err.path.join(".") || "root"} - ${err.message}`)
            .join("\n");

          const reformatText = reformatPrompt(extractedData, errorDetails);
          response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: reformatText }],
          });

          extractedData = response.choices[0].message.content?.trim();
          if (!extractedData) throw new Error("Empty reformatted response from OpenAI");
          
          validJson = extractJsonFromMarkdown(extractedData).replace(/(\r\n|\n|\r)/gm, "");
          parsedJson = JSON.parse(validJson);
          validation = resumeSchema.safeParse(parsedJson);

          if (!validation.success) {
            throw new Error("Failed to format response into the required schema");
          }
        }

        // Upload PDF to S3
        let resume_url: string | null = null;
        try {
          resume_url = await uploadPDFToS3(
            file.buffer,
            file.originalname,
            file.mimetype
          );
        } catch (e) {
          console.error(`S3 upload failed for ${file.originalname}:`, e);
          throw new Error("Resume upload to S3 failed");
        }

        // Create unique ID for the user
        const uniqueId = new mongoose.Types.ObjectId();

        // Build user document
        userDocs.push({
          _id: uniqueId,
          firebase_id,
          firebase_email: email,
          organisation_id: organisation_id_to_use,
          firebase_uploader_name: displayName,
          job: jobId,
          resume_url,
          ...parsedJson,
        });

        // Get cultural fit
        const cfPrompt = culturalFitPrompt(JSON.stringify(parsedJson));
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
        culturalFitResults.push({ ...cfParsed, userId: uniqueId });

        // Get skills
        const canon = await getCanonicalSkillNames();
        const skPrompt = skillsPrompt(JSON.stringify(parsedJson), canon);
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
        await saveNewSkillsIfNotExist({
          skills: Array.isArray(skParsed) ? skParsed : skParsed.skills,
        });
        skillsResults.push({ skills: skParsed, userId: uniqueId });

        results.push({
          filename: file.originalname,
          success: true,
          data: parsedJson
        });

      } catch (error: any) {
        console.error(`Error processing file ${file.originalname}:`, error);
        results.push({
          filename: file.originalname,
          success: false,
          error: error.message || "Failed to process file"
        });
      }
    }

    // Update job revaluation status if needed
    if (jobId) {
      try {
        await Job.findByIdAndUpdate(jobId, { needRevaluation: true });
        console.log("Job revaluation successfully");
      } catch (err) {
        console.error("Error updating job:", err);
      }
    } else {
      try {
        await Job.updateMany(
          { organisation_id: organisation_id_to_use },
          { needRevaluation: true }
        );
        console.log("Organisation revaluation successfully");
      } catch (err) {
        console.error("Error updating jobs:", err);
      }
    }

    // Save all documents
    await User.insertMany(userDocs, { session });
    await CulturalFit.insertMany(culturalFitResults, { session });
    await Skills.insertMany(skillsResults, { session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      results,
      message: "Resume processing completed successfully",
      count: userDocs.length,
      userIds: userDocs.map((d) => d._id.toString()),
      ...(jobId && { jobId })
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error during resume processing:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export { embedRouter3 };