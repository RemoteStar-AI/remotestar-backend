import { Router } from "express";
import { Job, User, Analysis } from "../../utils/db";
import { analyseUserPrompt } from "../../utils/prompts";
import { openai } from "../../utils/openai";
export const analyseRouter = Router();

analyseRouter.post("/", async (req: any, res: any) => {
  try {
    console.log("[POST /analyse] Request received", { userId: req.body.userId, jobId: req.body.jobId });

    // Validate request body
    if (!req.body.userId || !req.body.jobId) {
      console.warn("[POST /analyse] Missing required fields");
      return res.status(400).json({ error: "Missing required fields: userId and jobId" });
    }

    const { userId, jobId } = req.body;

    // Find user and job
    let user, job;
    try {
      console.log("[POST /analyse] Fetching user and job data", { userId, jobId });
      user = await User.findById(userId);
      job = await Job.findById(jobId);
    } catch (err) {
      console.error("[POST /analyse] Database error while fetching user/job:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    if (!user) {
      console.warn("[POST /analyse] User not found", { userId });
      return res.status(404).json({ error: "User not found" });
    }
    if (!job) {
      console.warn("[POST /analyse] Job not found", { jobId });
      return res.status(404).json({ error: "Job not found" });
    }

    try{
      console.log("[POST /analyse] Checking for existing analysis");
      const analysis = await Analysis.findOne({ userId, jobId });
      if (analysis) {
        console.log("[POST /analyse] Existing analysis found, returning cached result");
        return res.status(200).json({ content: analysis.analysis });
      }
    } catch (err) {
      console.error("[POST /analyse] Database error while checking existing analysis:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    const userData = user.toObject();
    const jobData = job.toObject();

    const prompt = analyseUserPrompt(userData, jobData);
    console.log("[POST /analyse] Analysis started", { userId, jobId });

    // Call OpenAI API
    let response;
    try {
      console.log("[POST /analyse] Calling OpenAI API");
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        stream: false
      });
    } catch (err) {
      console.error("[POST /analyse] OpenAI API error:", err);
      return res.status(503).json({ error: "AI service temporarily unavailable" });
    }

    if (!response.choices?.[0]?.message?.content) {
      console.error("[POST /analyse] Invalid response from OpenAI");
      return res.status(500).json({ error: "Invalid response from AI service" });
    }

    const content = response.choices[0].message.content;
    try{
      console.log("[POST /analyse] Saving analysis result to database");
      await Analysis.create({ userId, jobId, analysis: content });
    } catch (err) {
      console.error("[POST /analyse] Database error while saving analysis:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    console.log("[POST /analyse] Analysis completed successfully", { userId, jobId });
    return res.status(200).json({ content });

  } catch (err) {
    console.error("[POST /analyse] Unexpected error:", err);
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
});

analyseRouter.post("/reanalyse", async (req: any, res: any) => {
  try {
    console.log("[POST /analyse/reanalyse] Request received", { userId: req.body.userId, jobId: req.body.jobId });

    // Validate request body
    if (!req.body.userId || !req.body.jobId) {
      console.warn("[POST /analyse/reanalyse] Missing required fields");
      return res.status(400).json({ error: "Missing required fields: userId and jobId" });
    }

    const { userId, jobId } = req.body;

    // Find user and job
    let user, job;
    try {
      console.log("[POST /analyse/reanalyse] Fetching user and job data", { userId, jobId });
      user = await User.findById(userId);
      job = await Job.findById(jobId);
    } catch (err) {
      console.error("[POST /analyse/reanalyse] Database error while fetching user/job:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    if (!user) {
      console.warn("[POST /analyse/reanalyse] User not found", { userId });
      return res.status(404).json({ error: "User not found" });
    }
    if (!job) {
      console.warn("[POST /analyse/reanalyse] Job not found", { jobId });
      return res.status(404).json({ error: "Job not found" });
    }

    // Check if analysis exists
    try {
      console.log("[POST /analyse/reanalyse] Checking for existing analysis");
      const existingAnalysis = await Analysis.findOne({ userId, jobId });
      if (!existingAnalysis) {
        console.warn("[POST /analyse/reanalyse] No existing analysis found", { userId, jobId });
        return res.status(404).json({ error: "Analysis not found" });
      }
    } catch (err) {
      console.error("[POST /analyse/reanalyse] Database error while checking existing analysis:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    const userData = user.toObject();
    const jobData = job.toObject();

    const prompt = analyseUserPrompt(userData, jobData);
    console.log("[POST /analyse/reanalyse] Reanalysis started", { userId, jobId });

    // Call OpenAI API
    let response;
    try {
      console.log("[POST /analyse/reanalyse] Calling OpenAI API");
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        stream: false
      });
    } catch (err) {
      console.error("[POST /analyse/reanalyse] OpenAI API error:", err);
      return res.status(503).json({ error: "AI service temporarily unavailable" });
    }

    if (!response.choices?.[0]?.message?.content) {
      console.error("[POST /analyse/reanalyse] Invalid response from OpenAI");
      return res.status(500).json({ error: "Invalid response from AI service" });
    }

    const content = response.choices[0].message.content;
    try {
      console.log("[POST /analyse/reanalyse] Updating analysis in database");
      const updatedAnalysis = await Analysis.findOneAndUpdate(
        { userId, jobId },
        { analysis: content },
        { new: true }
      );
      if (!updatedAnalysis) {
        console.error("[POST /analyse/reanalyse] Failed to update analysis", { userId, jobId });
        return res.status(404).json({ error: "Failed to update analysis" });
      }
    } catch (err) {
      console.error("[POST /analyse/reanalyse] Database error while updating analysis:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    console.log("[POST /analyse/reanalyse] Reanalysis completed successfully", { userId, jobId });
    return res.status(200).json({ content });

  } catch (err) {
    console.error("[POST /analyse/reanalyse] Unexpected error:", err);
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
});

analyseRouter.post("/refresh", async (req: any, res: any) => {
  try {
    console.log("[POST /analyse/refresh] Request received", { userId: req.body.userId, jobId: req.body.jobId });

    // Validate request body
    if (!req.body.userId || !req.body.jobId) {
      console.warn("[POST /analyse/refresh] Missing required fields");
      return res.status(400).json({ error: "Missing required fields: userId and jobId" });
    }

    const { userId, jobId } = req.body;

    // Find user and job
    let user, job;
    try {
      console.log("[POST /analyse/refresh] Fetching user and job data", { userId, jobId });
      user = await User.findById(userId);
      job = await Job.findById(jobId);
    } catch (err) {
      console.error("[POST /analyse/refresh] Database error while fetching user/job:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    if (!user) {
      console.warn("[POST /analyse/refresh] User not found", { userId });
      return res.status(404).json({ error: "User not found" });
    }
    if (!job) {
      console.warn("[POST /analyse/refresh] Job not found", { jobId });
      return res.status(404).json({ error: "Job not found" });
    }

    // Delete existing analysis (if any)
    try {
      console.log("[POST /analyse/refresh] Deleting existing analysis if present");
      await Analysis.deleteOne({ userId, jobId });
    } catch (err) {
      console.error("[POST /analyse/refresh] Database error while deleting existing analysis:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    const userData = user.toObject();
    const jobData = job.toObject();

    const prompt = analyseUserPrompt(userData, jobData);
    console.log("[POST /analyse/refresh] Generating new analysis", { userId, jobId });

    // Call OpenAI API
    let response;
    try {
      console.log("[POST /analyse/refresh] Calling OpenAI API");
      response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        stream: false
      });
    } catch (err) {
      console.error("[POST /analyse/refresh] OpenAI API error:", err);
      return res.status(503).json({ error: "AI service temporarily unavailable" });
    }

    if (!response.choices?.[0]?.message?.content) {
      console.error("[POST /analyse/refresh] Invalid response from OpenAI");
      return res.status(500).json({ error: "Invalid response from AI service" });
    }

    const content = response.choices[0].message.content;
    try {
      console.log("[POST /analyse/refresh] Saving new analysis result to database");
      await Analysis.create({ userId, jobId, analysis: content });
    } catch (err) {
      console.error("[POST /analyse/refresh] Database error while saving new analysis:", err);
      return res.status(500).json({ error: "Database error occurred" });
    }

    console.log("[POST /analyse/refresh] New analysis created successfully", { userId, jobId });
    return res.status(200).json({ content });

  } catch (err) {
    console.error("[POST /analyse/refresh] Unexpected error:", err);
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
});