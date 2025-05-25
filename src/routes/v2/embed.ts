import { Router } from "express";
export const embedRouter = Router();
import { culturalFitPrompt, skillsPrompt } from "../../utils/prompts";
import { CulturalFit, Skills, User } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import {
  culturalFitSchema,
  skillsSchema,
} from "../../utils/schema";
import { openai } from "../../utils/openai";
import { extractJsonFromMarkdown, getCanonicalSkillNames, saveNewSkillsIfNotExist } from "../../utils/helper-functions";
import mongoose from "mongoose";
import { z } from "zod";
import { upload } from "../../middleware/upload";
import { uploadPDFToS3 } from "../../utils/s3";
import { Organisation } from "../../utils/db";


const embedSchema = z.object({
  schema: z.record(z.unknown()), // or z.any()
  job: z.string().optional(),
});

const bulkEmbedSchema = z.array(embedSchema);


embedRouter.post(
  "/bulk",
  authenticate,
  upload.array("resumes"),
  async (req: any, res: any) => {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const { firebase_id, email, organisation_id, displayName } = req.user;
      let organisation_id_to_use = organisation_id;
      console.log("Raw multipart body:", req.body);

      // ─── Parse JSON payload ───────────────────────────────────────────────────
      let parsedBody: any;
      try {
        parsedBody = JSON.parse(req.body.data);
      } catch (err) {
        return res.status(400).json({ error: "Invalid JSON in `data` field" });
      }

      // ─── Validate with Zod ─────────────────────────────────────────────────────
      const result = bulkEmbedSchema.safeParse(parsedBody);
      if (!result.success) {
        console.error("Validation Error:", result.error.format());
        return res.status(400).json({ error: result.error.format() });
      }

      const userDocs: any[] = [];
      const culturalFitResults: any[] = [];
      const skillsResults: any[] = [];

      // ─── Main loop ─────────────────────────────────────────────────────────────
      for (let i = 0; i < result.data.length; i++) {
        const { schema: data, job } = result.data[i];
        const uniqueId = new mongoose.Types.ObjectId();

        console.log(data.name+"\n");

        // ↪️ Upload PDF to S3
        let resume_url: string | null = null;
        const file = req.files?.[i];
        if (file) {
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
        }

        // ↪️ Build user document
       
        userDocs.push({
          _id: uniqueId,
          firebase_id,
          firebase_email: email,
          organisation_id: organisation_id_to_use,
          firebase_uploader_name: displayName,
          job,
          resume_url,          // ← new field
          ...data,
        });

        // ↪️ Cultural Fit
        const cfPrompt = culturalFitPrompt(JSON.stringify(data));
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

        // ↪️ Skills
        const canon = await getCanonicalSkillNames();
        const skPrompt = skillsPrompt(JSON.stringify(data), canon);
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
      }

      // ─── Commit ────────────────────────────────────────────────────────────────
      await User.insertMany(userDocs, { session });
      await CulturalFit.insertMany(culturalFitResults, { session });
      await Skills.insertMany(skillsResults, { session });

      await session.commitTransaction();
      session.endSession();

      return res.status(200).json({
        message: "Bulk processing completed successfully",
        count: userDocs.length,
        userIds: userDocs.map((d) => d._id.toString()),
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error("Bulk Error:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);