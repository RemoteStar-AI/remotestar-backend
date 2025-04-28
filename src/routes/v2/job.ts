import { Router } from "express";
export const jobRouter = Router();
import { Job } from "../../utils/db";
import { jobSchema, deleteJobSchema } from "../../utils/schema";
import {
  expectedCulturalFitPrompt,
  expectedSkillsPrompt,
} from "../../utils/prompts";
import { openai } from "../../utils/openai";
import { extractJsonFromMarkdown } from "../../utils/helper-functions";

jobRouter.get("/", async (req: any, res: any) => {
  const params = req.query;
  const { companyId } = params;
  try {
    const response = await Job.find({ companyId });
    if (!response) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    res.status(200).json({
      message: "Jobs fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

jobRouter.post("/", async (req: any, res: any) => {
  try {
    console.log("job creation started");
    const body = req.body;
    const parsedBody = jobSchema.safeParse(body);
    console.log("data received");
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.format() });
      return;
    }
    const data = parsedBody.data;

    //cultural fit
    console.log("cultural fit creation started");

    const culturalFitPrompt = expectedCulturalFitPrompt(JSON.stringify(data));

    const culturalFitResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: culturalFitPrompt }],
      response_format: { type: "json_object" },
    });

    if (!culturalFitResponse.choices[0].message.content) {
      throw new Error("Empty response from OpenAI");
    }
    let culturalFitJson = extractJsonFromMarkdown(
      culturalFitResponse.choices[0].message.content
    ).replace(/(\r\n|\n|\r)/gm, "");
    let parsedCulturalFit = JSON.parse(culturalFitJson);
    console.log("parsed cultural fit received\n", parsedCulturalFit);

    //skills
    console.log("cultural fit creation started");
    const skillsPrompt = expectedSkillsPrompt(JSON.stringify(data));
    console.log("sending request to openai for skills\n");
    const skillsResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: skillsPrompt }],
      response_format: { type: "json_object" },
    });
    console.log("skills response received\n", skillsResponse.choices[0].message.content);
    if (!skillsResponse.choices[0].message.content) {
      throw new Error("Empty response from OpenAI");
    }
    let skillsJson = extractJsonFromMarkdown(
      skillsResponse.choices[0].message.content
    ).replace(/(\r\n|\n|\r)/gm, "");
    let parsedSkills = JSON.parse(skillsJson);

    const finalBody = {...data, expectedCulturalFit: parsedCulturalFit, expectedSkills: {...parsedSkills}};
    const jobResponce = await Job.create(finalBody);
    res.status(200).json({
      message: "Job created successfully",
      data: jobResponce,
    });
  } catch (err) {
    console.log("error found")
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
