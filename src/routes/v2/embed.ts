import { Router } from "express";
export const embedRouter = Router();
import { culturalFitPrompt, skillsPrompt } from "../../utils/prompts";
import { CulturalFit, Skills } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import {
  skillsSchema,
  culturalFitSchema,
  resumeSchema,
} from "../../utils/schema";
import { openai } from "../../utils/openai";
import { extractJsonFromMarkdown } from "../../utils/helper-functions";
import User from "../../utils/db";
import mongoose from "mongoose";

embedRouter.post("/", authenticate, async (req: any, res: any) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const userId = req.user.firebase_id;

    // making cultural fit
    const { schema } = req.body;
    const parsedSchema = resumeSchema.safeParse(schema);
    if (!parsedSchema.success) {
      console.log("error in parsed schema\n", parsedSchema.error);
      res.status(400).json({ error: parsedSchema.error });
      return;
    }
    const data = schema;

    const firebaseId = req.user.firebase_id;
    const userEmail = req.user.email;

    const uniqueId = new mongoose.Types.ObjectId();
    const responce = await User.create(
      [
        {
          _id: uniqueId,
          firebase_id: firebaseId,
          firebase_email: userEmail,
          ...schema,
        },
      ],
      { session }
    );
    console.log("parsed schema received\n", data);
    const culturalFitPromptText = culturalFitPrompt(JSON.stringify(data));

    console.log("sending request to openai for cultural fit\n");
    const culturalFitResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: culturalFitPromptText }],
    });
    console.log("cultural fit response received\n", culturalFitResponse);
    let extractedCulturalFit =
      culturalFitResponse.choices[0].message.content?.trim();
    if (!extractedCulturalFit) {
      throw new Error("Empty response from OpenAI");
    }
    let validJson = extractJsonFromMarkdown(extractedCulturalFit).replace(
      /(\r\n|\n|\r)/gm,
      ""
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
      userId,
    });

    //making skills
    const skillsPromptText = skillsPrompt(JSON.stringify(data));
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
      ""
    );
    let parsedSkills = JSON.parse(skillValidJson);
    console.log("parsed skills received\n", parsedSkills);
    let Skillsvalidation = skillsSchema.safeParse(parsedSkills);
    if (!Skillsvalidation.success) {
      console.log("error in parsed skills\n", Skillsvalidation.error);
      res.status(400).json({ error: Skillsvalidation.error });
      return;
    }
    const skillsResponce = await Skills.create({
      skills: parsedSkills,
      userId,
    });
    await session.commitTransaction();
    session.endSession();
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
