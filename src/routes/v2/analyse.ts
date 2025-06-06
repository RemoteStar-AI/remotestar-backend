import { Router } from "express";
import { Job, User, Analysis } from "../../utils/db";
import { analyseUserPrompt } from "../../utils/prompts";
import { openai } from "../../utils/openai";
export const analyseRouter = Router();

analyseRouter.post("/", async (req: any, res: any) => {
  try {
    // Validate request body
    if (!req.body.userId || !req.body.jobId) {
      return res.status(400).json({ error: "Missing required fields: userId and jobId" });
    }

    const { userId, jobId } = req.body;

    // Find user and job
    let user, job;
    try {
      user = await User.findById(userId);
      job = await Job.findById(jobId);
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    try{
      const analysis = await Analysis.findOne({ userId, jobId });
      if (analysis) {
        return res.status(200).json({ content: analysis.analysis });
      }
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    const userData = user.toObject();
    const jobData = job.toObject();

    const prompt = analyseUserPrompt(userData, jobData);
    console.log("Analysis started");

    // Call OpenAI API
    let response;
    try {
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        stream: false
      });
    } catch (err) {
      console.error("OpenAI API error:", err);
      return res.status(503).json({ error: "AI service temporarily unavailable" });
    }

    if (!response.choices?.[0]?.message?.content) {
      return res.status(500).json({ error: "Invalid response from AI service" });
    }

    const content = response.choices[0].message.content;
    try{
      await Analysis.create({ userId, jobId, analysis: content });
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }
    return res.status(200).json({ content });

  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
});

analyseRouter.post("/reanalyse", async (req: any, res: any) => {
  try {
    // Validate request body
    if (!req.body.userId || !req.body.jobId) {
      return res.status(400).json({ error: "Missing required fields: userId and jobId" });
    }

    const { userId, jobId } = req.body;

    // Find user and job
    let user, job;
    try {
      user = await User.findById(userId);
      job = await Job.findById(jobId);
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    // Check if analysis exists
    try {
      const existingAnalysis = await Analysis.findOne({ userId, jobId });
      if (!existingAnalysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    const userData = user.toObject();
    const jobData = job.toObject();

    const prompt = analyseUserPrompt(userData, jobData);
    console.log("Reanalysis started");

    // Call OpenAI API
    let response;
    try {
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        stream: false
      });
    } catch (err) {
      console.error("OpenAI API error:", err);
      return res.status(503).json({ error: "AI service temporarily unavailable" });
    }

    if (!response.choices?.[0]?.message?.content) {
      return res.status(500).json({ error: "Invalid response from AI service" });
    }

    const content = response.choices[0].message.content;
    try {
      const updatedAnalysis = await Analysis.findOneAndUpdate(
        { userId, jobId },
        { analysis: content },
        { new: true }
      );
      if (!updatedAnalysis) {
        return res.status(404).json({ error: "Failed to update analysis" });
      }
    } catch (err) {
      console.error("Database error:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }
    return res.status(200).json({ content });

  } catch (err) {
    console.error("Unexpected error:", err);
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
});