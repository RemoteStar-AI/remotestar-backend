import { Router } from "express";
import { upload } from "../../middleware/upload";
import { authenticate } from "../../middleware/firebase-auth";
import { z } from "zod";
import {
  extractPrompt,
  reformatPrompt,
  updatedCulturalFitPrompt as culturalFitPrompt,
  skillsPromptNoCanon,
  resumeEmbeddingPrompt,
} from "../../utils/prompts";
import { openai } from "../../utils/openai";
import {
  resumeSchema,
  culturalFitSchema,
  skillsSchema,
} from "../../utils/schema";
import {
  extractJsonFromMarkdown,
  createAndStoreEmbedding,
} from "../../utils/helper-functions";
import { User, CulturalFit, Skills, Job } from "../../utils/db";
import { uploadPDFToS3, generateResumeUploadPresignedUrl, getResumeObjectBuffer } from "../../utils/s3";
import mongoose from "mongoose";
import pdfParse from "pdf-parse";
import { v4 as uuidv4 } from "uuid";
import logger from "../../utils/loggers";

const resumeUploadRouter = Router();
const namespace = "talent-pool-v2";

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
  organisation_id: string,
  displayName: string,
  jobId: string | null,
  existingS3Key?: string | null
) {
  try {
    logger.info(`[PROCESS] Starting file: ${file.originalname}`);
    // --- Upload PDF to OpenAI (start immediately) ---
    logger.info(`[OPENAI] Uploading PDF to OpenAI for: ${file.originalname}`);
    const uploadedFile = await openai.files.create({
      file: new File([new Uint8Array(file.buffer)], file.originalname, {
        type: file.mimetype,
      }),
      purpose: "user_data",
    });
    logger.info(`[OPENAI] Uploaded PDF to OpenAI with file_id: ${uploadedFile.id}`);

    // Prepare prompts
    const extractPromptText = extractPrompt(
      "a file has been uploaded of that candidate use that to extract the data"
    );
    const cfPromptText = culturalFitPrompt(
      "a file has been uploaded of that candidate use that to extract the data"
    );
    const skPromptText = skillsPromptNoCanon(
      "a file has been uploaded of that candidate use that to extract the data"
    );

    // Kick off three OpenAI requests in parallel: extraction (with reformat fallback), cultural fit, skills
    const extractionPromise = (async () => {
      logger.info(`[OPENAI] Sending extraction prompt for: ${file.originalname}`);
      let response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "file", file: { file_id: uploadedFile.id } },
              { type: "text", text: extractPromptText },
            ],
          },
        ],
      });
      logger.info(`[OPENAI] Received extraction response for: ${file.originalname}`);
      let extractedData = response.choices[0].message.content?.trim();
      if (!extractedData) throw new Error("Empty response from OpenAI");
      let validJson = extractJsonFromMarkdown(extractedData).replace(/(\r\n|\n|\r)/gm, "");
      let parsedJson = JSON.parse(validJson);
      let validation = resumeSchema.safeParse(parsedJson);
      if (!validation.success) {
        const errorDetails = validation.error.errors
          .map((err) => `Path: ${err.path.join(".") || "root"} - ${err.message}`)
          .join("\n");
        const reformatText = reformatPrompt(extractedData, errorDetails);
        logger.info(`[OPENAI] Sending reformat prompt for: ${file.originalname}`);
        response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "user",
              content: [
                { type: "file", file: { file_id: uploadedFile.id } },
                { type: "text", text: reformatText },
              ],
            },
          ],
        });
        logger.info(`[OPENAI] Received reformatted response for: ${file.originalname}`);
        extractedData = response.choices[0].message.content?.trim();
        if (!extractedData) throw new Error("Empty reformatted response from OpenAI");
        validJson = extractJsonFromMarkdown(extractedData).replace(/(\r\n|\n|\r)/gm, "");
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
      return parsedJson;
    })();

    const culturalFitPromise = (async () => {
      logger.info(`[OPENAI] Sending cultural fit prompt for: ${file.originalname}`);
      const cfRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "file", file: { file_id: uploadedFile.id } },
              { type: "text", text: cfPromptText },
            ],
          },
        ],
      });
      const cfText = cfRes.choices[0].message.content?.trim();
      if (!cfText) throw new Error("Empty cultural fit response");
      const cfJson = extractJsonFromMarkdown(cfText).replace(/[\r\n]/g, "");
      const cfParsed = JSON.parse(cfJson);
      if (!culturalFitSchema.safeParse(cfParsed).success) {
        logger.error(`[VALIDATION] Cultural fit validation failed for: ${file.originalname}`);
        throw new Error("Cultural fit validation failed");
      }
      logger.info(`[VALIDATION] Cultural fit validated for: ${file.originalname}`);
      return cfParsed;
    })();

    const skillsPromise = (async () => {
      logger.info(`[OPENAI] Sending skills prompt for: ${file.originalname}`);
      const skRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "file", file: { file_id: uploadedFile.id } },
              { type: "text", text: skPromptText },
            ],
          },
        ],
      });
      const skText = skRes.choices[0].message.content?.trim();
      if (!skText) throw new Error("Empty skills response");
      const skJson = extractJsonFromMarkdown(skText).replace(/[\r\n]/g, "");
      let skParsed = JSON.parse(skJson);
      // Sanitize years_experience
      skParsed = skParsed.map((skill: any) => ({
        ...skill,
        years_experience:
          typeof skill.years_experience === "number" && !isNaN(skill.years_experience)
            ? skill.years_experience
            : 0,
      }));
      if (!skillsSchema.safeParse(skParsed).success) {
        logger.error(`[VALIDATION] Skills validation failed for: ${file.originalname}`);
        throw new Error("Skills validation failed");
      }
      logger.info(`[SKILLS] Skills before normalization : ${JSON.stringify(skParsed)}`);
      return skParsed;
    })();

    // Wait for extraction to do duplicate-check dependent work
    const parsedJson = await extractionPromise;

    // Duplicate check: email + organisation_id
    const existingUser = await User.findOne({
      email: parsedJson.email,
      organisation_id: organisation_id,
    });
    if (existingUser) {
      logger.warn(
        `[DUPLICATE] User with email ${parsedJson.email} already exists in organisation ${organisation_id}. Skipping file: ${file.originalname}`
      );
      return {
        success: false,
        error: "Resume already exists in organisation",
      };
    }

    // Wait for cultural fit and skills in parallel with S3 upload (after duplicate check)
    const cfAndSkills = Promise.all([culturalFitPromise, skillsPromise]);

    // Decide resume URL: reuse existing S3 object if key provided; otherwise upload
    let resume_url: string | null = null;
    let uploadedByServer = false;
    try {
      if (existingS3Key) {
        resume_url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${existingS3Key}`;
        logger.info(`[S3] Using existing S3 object for: ${file.originalname} -> ${existingS3Key}`);
      } else {
        resume_url = await uploadPDFToS3(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        uploadedByServer = true;
        logger.info(`[S3] Uploaded PDF to S3 for: ${file.originalname}`);
      }
    } catch (e) {
      logger.error(`[S3] S3 handling failed for ${file.originalname}:`, e);
      throw new Error("Resume upload to S3 failed");
    }

    // Create unique ID for the user
    const uniqueId = new mongoose.Types.ObjectId();
    logger.info(`[DB] Creating user document for: ${file.originalname}`);

    // Resolve cultural fit and skills
    const [cfParsed, skParsed] = await cfAndSkills;
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
            organisation_id: organisation_id,
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
          { organisation_id: organisation_id },
          { needRevaluation: true }
        );
        logger.info(
          `[DB] Organisation revaluation set for organisation: ${organisation_id}`
        );
      }
      await session.commitTransaction();
      session.endSession();
      logger.info(`[DB] All documents saved for: ${file.originalname}`);

      // --- Generate and store embedding ---
      logger.info(`[EMBEDDING] Starting embedding generation for: ${uniqueId}`);
      const resumeEmbeddingPromptText = resumeEmbeddingPrompt(
        "a file has been uploaded of that candidate use that to extract the data"
      );
      const embeddingRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "file", file: { file_id: uploadedFile.id } },
              { type: "text", text: resumeEmbeddingPromptText },
            ],
          },
        ],
      });
      const embeddingText = embeddingRes.choices[0].message.content?.trim();

      if (embeddingText) {
        await createAndStoreEmbedding(uniqueId.toString(), embeddingText, namespace, organisation_id);
      } else {
        logger.warn(
          `[EMBEDDING] Could not generate embedding text for user ${uniqueId}. Skipping storage.`
        );
      }

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
      // If S3 file was uploaded by server, delete it to avoid orphaned files
      if (resume_url && uploadedByServer) {
        try {
          await import("../../utils/s3").then(mod => mod.deleteFileFromS3(resume_url!));
          logger.info(`[S3] Deleted orphaned S3 file after DB transaction failure: ${resume_url}`);
        } catch (deleteErr) {
          logger.error(`[S3] Failed to delete orphaned S3 file: ${resume_url}`, deleteErr);
        }
      }
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

// Deprecated: server-side file upload endpoint. Enforce direct-to-S3 flow.
resumeUploadRouter.post(
  "/",
  authenticate,
  async (_req: any, res: any) => {
    return res.status(410).json({
      error: "Deprecated endpoint. Use direct S3 upload via presigned URL and then /process-resume(-s)-by-key(s).",
    });
  }
);

// Convert GET /reanalyse/:id to POST with file upload
resumeUploadRouter.post(
  "/reanalyse/:id",
  upload.single("file"),
  authenticate,
  async (req: any, res: any) => {
    logger.info(
      `[REANALYSE] Starting reanalysis for user ID: ${req.params.id}`
    );
    const { id } = req.params;
    const organisation_id = req.user.organisation;
    const user = await User.findById(id);
    if (!user) {
      logger.info(`[REANALYSE] User not found with ID: ${id}`);
      return res.status(404).json({ error: "User not found" });
    }
    const jobId = user.job;
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
      let skParsed = JSON.parse(skJson);
      // Sanitize years_experience: ensure it's a number, set to 0 if not
      skParsed = skParsed.map((skill: any) => ({
        ...skill,
        years_experience: typeof skill.years_experience === 'number' && !isNaN(skill.years_experience)
          ? skill.years_experience
          : 0,
      }));
      if (!skillsSchema.safeParse(skParsed).success) {
        throw new Error("Skills validation failed");
      }

      await Skills.create([{ skills: skParsed, userId: id }], {
        session: transaction,
      });

      logger.info(
        `[EMBEDDING] Starting embedding generation for re-analysed user: ${id}`
      );
      const embeddingTextResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: resumeEmbeddingPrompt(
              resumeText ? resumeText : JSON.stringify(parsedJson)
            ),
          },
        ],
      });

      const embeddingTextReanalysis =
        embeddingTextResponse.choices[0].message.content?.trim();
      if (embeddingTextReanalysis) {
        await createAndStoreEmbedding(id.toString(), embeddingTextReanalysis, namespace, organisation_id);
      } else {
        logger.warn(
          `[EMBEDDING] Could not generate embedding text for re-analysed user ${id}. Skipping storage.`
        );
      }

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

// New endpoint: get presigned URL for direct resume upload to S3
resumeUploadRouter.post(
  "/get-resume-presigned-url",
  authenticate,
  async (req: any, res: any) => {
    try {
      const { filename, contentType } = req.body || {};
      if (!filename || !contentType) {
        return res.status(400).json({ error: "filename and contentType are required" });
      }
      const result = await generateResumeUploadPresignedUrl(filename, contentType);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      logger.error("[S3] Failed to generate resume presigned URL:", error);
      return res.status(500).json({ error: "Failed to generate presigned URL" });
    }
  }
);

// Direct-to-S3 flow: process a resume by existing S3 key
resumeUploadRouter.post(
  "/process-resume-by-key",
  authenticate,
  async (req: any, res: any) => {
    try {
      const schema = z.object({
        key: z.string().min(1),
        filename: z.string().min(1),
        contentType: z.string().min(1),
        jobId: z.string().optional().nullable(),
        organisation_id: z.string().optional().nullable(),
        webhook_url: z.string().url().optional(),
      });
      const { key, filename, contentType, jobId, organisation_id, webhook_url } = schema.parse(req.body || {});

      const processingId = uuidv4();
      processingStatus.set(processingId, { status: "pending", progress: 0 });

      const orgId = organisation_id ?? req.user.organisation;
      const { firebase_id, email, displayName } = req.user;

      // Kick off background processing
      (async () => {
        try {
          processingStatus.set(processingId, { status: "processing", progress: 0 });
          // Fetch object bytes
          const buffer = await getResumeObjectBuffer(key);
          const fauxFile: Express.Multer.File = {
            fieldname: "file",
            originalname: filename,
            encoding: "7bit",
            mimetype: contentType,
            size: buffer.byteLength,
            buffer,
            stream: undefined as any,
            destination: "",
            filename: filename,
            path: "",
          };
          const result = await processFile(
            fauxFile,
            firebase_id,
            email,
            orgId,
            displayName,
            jobId ?? null,
            key
          );
          processingStatus.set(processingId, {
            status: "completed",
            progress: 100,
            results: [{ filename, ...result }],
          });
          if (webhook_url) {
            await sendWebhookNotification(webhook_url, {
              processingId,
              status: "completed",
              progress: 100,
              results: [{ filename, ...result }],
            });
          }
        } catch (err: any) {
          processingStatus.set(processingId, {
            status: "failed",
            error: err?.message || "Processing failed",
          });
          if (webhook_url) {
            await sendWebhookNotification(webhook_url, {
              processingId,
              status: "failed",
              error: err?.message || "Processing failed",
            });
          }
          logger.error("[PROCESS-BY-KEY] Failed:", err);
        }
      })();

      return res.status(202).json({ processingId, status: "pending" });
    } catch (error: any) {
      logger.error("[PROCESS-BY-KEY] Error:", error);
      return res.status(400).json({ error: error?.message || "Invalid request" });
    }
  }
);

// Direct-to-S3 flow: process multiple resumes by existing S3 keys with one processingId
resumeUploadRouter.post(
  "/process-resumes-by-keys",
  authenticate,
  async (req: any, res: any) => {
    try {
      const itemSchema = z.object({
        key: z.string().min(1),
        filename: z.string().min(1),
        contentType: z.string().min(1),
      });
      const schema = z.object({
        items: z.array(itemSchema).min(1),
        jobId: z.string().optional().nullable(),
        organisation_id: z.string().optional().nullable(),
        webhook_url: z.string().url().optional(),
      });
      const { items, jobId, organisation_id, webhook_url } = schema.parse(req.body || {});

      const processingId = uuidv4();
      processingStatus.set(processingId, { status: "pending", progress: 0 });

      const orgId = organisation_id ?? req.user.organisation;
      const { firebase_id, email, displayName } = req.user;

      ;(async () => {
        try {
          processingStatus.set(processingId, { status: "processing", progress: 0 });
          const results: any[] = [];
          let completed = 0;
          const total = items.length;

          const runOne = async (item: { key: string; filename: string; contentType: string }) => {
            const { key, filename, contentType } = item;
            try {
              const buffer = await getResumeObjectBuffer(key);
              const fauxFile: Express.Multer.File = {
                fieldname: "file",
                originalname: filename,
                encoding: "7bit",
                mimetype: contentType,
                size: buffer.byteLength,
                buffer,
                stream: undefined as any,
                destination: "",
                filename: filename,
                path: "",
              };
          const result = await processFile(
                fauxFile,
                firebase_id,
                email,
                orgId,
                displayName,
            jobId ?? null,
            key
              );
              results.push({ filename, ...result });
            } catch (err: any) {
              results.push({ filename, success: false, error: err?.message || "Failed" });
            } finally {
              completed += 1;
              const progress = Math.round((completed / total) * 100);
              const status = completed === total ? "completed" : "processing";
              processingStatus.set(processingId, { status, progress, results: [...results] });
              if (webhook_url) {
                await sendWebhookNotification(webhook_url, { processingId, status, progress, results: [...results] });
              }
            }
          };

          await Promise.all(items.map((it) => runOne(it)));
        } catch (err: any) {
          processingStatus.set(processingId, { status: "failed", error: err?.message || "Processing failed" });
          if (webhook_url) {
            await sendWebhookNotification(webhook_url, { processingId, status: "failed", error: err?.message || "Processing failed" });
          }
          logger.error("[PROCESS-BY-KEYS] Failed:", err);
        }
      })();

      return res.status(202).json({ processingId, status: "pending" });
    } catch (error: any) {
      logger.error("[PROCESS-BY-KEYS] Error:", error);
      return res.status(400).json({ error: error?.message || "Invalid request" });
    }
  }
);