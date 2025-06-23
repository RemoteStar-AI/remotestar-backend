import { Router } from "express";
export const jobRouter = Router();
import { Job, JobSearchResponse } from "../../utils/db";
import { jobSchema } from "../../utils/schema";
import { jobEmbeddingPrompt } from "../../utils/prompts";
import { openai } from "../../utils/openai";
import { createAndStoreEmbedding } from "../../utils/helper-functions";
import { authenticate } from "../../middleware/firebase-auth";

const namespace = "job-pool-v2";

jobRouter.get("/", authenticate, async (req: any, res: any) => {
  const params = req.query;
  const { companyId, organisation_id } = params;
  // console.log("companyId", companyId);
  // console.log("organisation_id", organisation_id);
  try {
    const response = await Job.find({ companyId, organisation_id });
    if (!response) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    console.log("response", response);
    console.log("Jobs fetched successfully");
    res.status(200).json({
      message: "Jobs fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

jobRouter.post("/", authenticate, async (req: any, res: any) => {
  try {
    console.log("Job creation started");
    const body = req.body;
    const organisation_id = req.user.organisation;

    try {
      const parsedBody = jobSchema.safeParse(body);
      if (!parsedBody.success) {
        return res.status(400).json({ error: parsedBody.error.format() });
      }
      console.log("Request data validated successfully");
      const data = parsedBody.data;
      // data.organisation_id = organisation_id;
      // Generate job embedding
      let jobEmbeddingText;
      try {
        const jobEmbeddingPromptText = jobEmbeddingPrompt(data.description);
        console.log("Job embedding prompt text", jobEmbeddingPromptText);
        const jobEmbedding = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: jobEmbeddingPromptText }],
        });
        jobEmbeddingText = jobEmbedding.choices[0].message.content;
        console.log("Job embedding text", jobEmbeddingText);
        console.log("Job embedding generated successfully");
      } catch (error) {
        console.error("OpenAI API Error:", error);
        throw new Error("Failed to generate job embedding");
      }

      // Create job record
      let jobResponse;
      try {
        jobResponse = await Job.create(data);
        console.log("Job record created successfully");
      } catch (error) {
        console.error("Job Creation Error:", error);
        throw new Error("Failed to create job record");
      }

      // Store embedding
      try {
        await createAndStoreEmbedding(jobResponse._id.toString(), jobEmbeddingText || '', namespace);
        console.log("Job embedding stored successfully");
      } catch (error) {
        console.error("Embedding Storage Error:", error);
        throw new Error("Failed to store job embedding");
      }

      return res.status(200).json({
        message: "Job created successfully",
        data: jobResponse,
      });

    } catch (error: any) {
      console.error("Validation Error:", error);
      throw new Error(error.message);
    }

  } catch (err: any) {
    console.error("Final Error:", err);
    return res.status(500).json({ 
      error: "Internal Server Error",
      message: err.message 
    });
  }
});

jobRouter.delete("/:id", authenticate, async (req: any, res: any) => {
  try {
    const id = req.params.id;
    const job = await Job.findByIdAndDelete(id);
    const jobSearchResponse = await JobSearchResponse.findByIdAndDelete(
      job?._id
    );
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!jobSearchResponse) {
      return res.status(404).json({ error: "Job search response not found" });
    }
    res.status(200).json({ message: "Job deleted successfully", data: job });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
