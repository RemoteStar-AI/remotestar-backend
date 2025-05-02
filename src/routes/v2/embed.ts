import { Router } from "express";
export const embedRouter = Router();
import { culturalFitPrompt, skillsPrompt } from "../../utils/prompts";
import { CulturalFit, Skills } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import {
  culturalFitSchema,
  skillsSchema,
} from "../../utils/schema";
import { openai } from "../../utils/openai";
import { extractJsonFromMarkdown, getCanonicalSkillNames, saveNewSkillsIfNotExist } from "../../utils/helper-functions";
import User from "../../utils/db";
import mongoose from "mongoose";
import { z } from "zod";

const embedSchema = z.object({
  schema: z.record(z.unknown()), // or z.any()
});

const bulkEmbedSchema = z.array(embedSchema);

embedRouter.post("/", authenticate, async (req: any, res: any) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    let userId = req.user.firebase_id;

    // making cultural fit
    const body = req.body;
    const parsedSchema = embedSchema.safeParse(body);
    if (!parsedSchema.success) {
      console.log("error in parsed schema\n", parsedSchema.error);
      res.status(400).json({ error: parsedSchema.error });
      return;
    }
    const data = body.schema;

    const firebaseId = req.user.firebase_id;
    const userEmail = req.user.email;

    const uniqueId = new mongoose.Types.ObjectId();
    const responce = await User.create(
      [
        {
          _id: uniqueId,
          firebase_id: firebaseId,
          firebase_email: userEmail,
          ...data,
        },
      ],
      { session },
    );
    if (!responce) {
      throw new Error("Failed to create user");
    }
    userId = uniqueId;
    console.log("parsed schema received\n", data);
    const culturalFitPromptText = culturalFitPrompt(JSON.stringify(data));

    console.log("sending request to openai for cultural fit\n");
    const culturalFitResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: culturalFitPromptText }],
    });
    console.log("cultural fit response received\n", culturalFitResponse);
    let extractedCulturalFit = culturalFitResponse.choices[0].message.content
      ?.trim();
    if (!extractedCulturalFit) {
      throw new Error("Empty response from OpenAI");
    }
    let validJson = extractJsonFromMarkdown(extractedCulturalFit).replace(
      /(\r\n|\n|\r)/gm,
      "",
    );
    let parsedCulturalFit = JSON.parse(validJson);
    console.log("parsed cultural fit received\n", parsedCulturalFit);

    let validation = culturalFitSchema.safeParse(parsedCulturalFit);
    if (!validation.success) {
      console.log("error in parsed cultural fit\n", validation.error);
      res.status(400).json({ error: validation.error });
      return;
    }
    const culturalFitResponce = await CulturalFit.create({
      ...parsedCulturalFit,
      userId: uniqueId,
    });

    //making skills
    const canonicalSkills = await getCanonicalSkillNames();
    const skillsPromptText = skillsPrompt(JSON.stringify(data), canonicalSkills);
    console.log("sending request to openai for skills\n");
    const skillsResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: skillsPromptText }],
    });
    console.log("skills response received\n", skillsResponse);
    let extractedSkills = skillsResponse.choices[0].message.content?.trim();
    if (!extractedSkills) {
      throw new Error("Empty response from OpenAI");
    }
    let skillValidJson = extractJsonFromMarkdown(extractedSkills).replace(
      /(\r\n|\n|\r)/gm,
      "",
    );
    let parsedSkills = JSON.parse(skillValidJson);
    console.log("parsed skills received\n", parsedSkills);
    let Skillsvalidation = skillsSchema.safeParse(parsedSkills);
    if (!Skillsvalidation.success) {
      console.log("error in parsed skills\n", Skillsvalidation.error);
      res.status(400).json({ error: Skillsvalidation.error });
      return;
    }
    const newSkills = await saveNewSkillsIfNotExist(parsedSkills);
    console.log("new skills received\n", newSkills);
    const skillsResponce = await Skills.create({
      skills: parsedSkills,
      userId: uniqueId,
    });
    await session.commitTransaction();
    session.endSession();
    console.log("skills and cultural fit created successfully")
    res.json({
      message: "skills and cultural fit created successfully",
      skillsResponce,
      culturalFitResponce,
    });
  } catch (error) {
    await session.abortTransaction(); // Rollback transaction
    session.endSession();
    console.error("Error during embedding:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

embedRouter.post("/bulk", authenticate, async (req: any, res: any) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    let userId = req.user.firebase_id;
    const firebaseId = req.user.firebase_id;
    const userEmail = req.user.email;

    // Parse and validate the bulk request body
    const body = req.body;
    console.log("Bulk Request Body Received:\n", body);

    const result = bulkEmbedSchema.safeParse(body);
    if (!result.success) {
      console.log("Validation Error:\n", result.error.format());
      res.status(400).json({
        error: result.error.format(),
      });
      return;
    }

    // Arrays to store results for response
    const userDocs = [];
    const culturalFitResults = [];
    const skillsResults = [];

    // Process each item in the array
    for (const item of result.data) {
      const data = item.schema;
      const uniqueId = new mongoose.Types.ObjectId();

      // Create user document
      userDocs.push({
        _id: uniqueId,
        firebase_id: firebaseId,
        firebase_email: userEmail,
        ...data,
      });

      // Process cultural fit
      console.log("Processing cultural fit for item:", data);
      const culturalFitPromptText = culturalFitPrompt(JSON.stringify(data));
      
      const culturalFitResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: culturalFitPromptText }],
      });
      
      let extractedCulturalFit = culturalFitResponse.choices[0].message.content?.trim();
      if (!extractedCulturalFit) {
        throw new Error("Empty response from OpenAI for cultural fit");
      }
      
      let validJson = extractJsonFromMarkdown(extractedCulturalFit).replace(
        /(\r\n|\n|\r)/gm,
        "",
      );
      
      let parsedCulturalFit = JSON.parse(validJson);
      let validation = culturalFitSchema.safeParse(parsedCulturalFit);
      
      if (!validation.success) {
        console.log("Error in parsed cultural fit\n", validation.error);
        throw new Error("Cultural fit validation failed");
      }
      
      culturalFitResults.push({
        ...parsedCulturalFit,
        userId: uniqueId,
      });

      // Process skills
      console.log("Processing skills for item:", data);
      const canonicalSkills = await getCanonicalSkillNames();
      const skillsPromptText = skillsPrompt(JSON.stringify(data), canonicalSkills);
      
      const skillsResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: skillsPromptText }],
      });
      
      let extractedSkills = skillsResponse.choices[0].message.content?.trim();
      if (!extractedSkills) {
        throw new Error("Empty response from OpenAI for skills");
      }
      
      let skillValidJson = extractJsonFromMarkdown(extractedSkills).replace(
        /(\r\n|\n|\r)/gm,
        "",
      );
      
      let parsedSkills = JSON.parse(skillValidJson);
      let skillsValidation = skillsSchema.safeParse(parsedSkills);
      
      if (!skillsValidation.success) {
        console.log("Error in parsed skills\n", skillsValidation.error);
        throw new Error("Skills validation failed");
      }
      
      skillsResults.push({
        skills: parsedSkills,
        userId: uniqueId,
      });
    }

    // Batch insert all user documents
    await User.insertMany(userDocs, { session });

    // Batch insert all cultural fit results
    await CulturalFit.insertMany(culturalFitResults, { session });

    // Batch insert all skills results
    await Skills.insertMany(skillsResults, { session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Bulk processing completed successfully",
      count: userDocs.length,
      userIds: userDocs.map(doc => doc._id.toString()),
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk Error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});