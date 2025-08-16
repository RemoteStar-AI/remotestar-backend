import { Router } from "express";
export const jobRouter = Router();
import { Job, JobSearchResponse } from "../../utils/db";
import { jobSchema } from "../../utils/schema";
import {
  jobEmbeddingPrompt,
} from "../../utils/prompts";
import { openai } from "../../utils/openai";
import { createAndStoreEmbedding, extractJsonFromMarkdown, insertErrorSection, getVapiSystemPrompt } from "../../utils/helper-functions";
import { authenticate } from "../../middleware/firebase-auth";
import { z } from "zod";
import { systemPrompt, updateScriptforAssistant} from "../../utils/vapi";
import { firstMessage } from "../../utils/consts";

const namespace = "job-pool-v2";


const VapiPromptSchema = z.object({
  firstMessage: z.string(),
  systemPrompt: z.string(),
});

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
    console.log("Jobs fetched successfully");
    res.status(200).json({
      message: "Jobs fetched successfully",
      data: response.reverse(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

jobRouter.get("/:id", authenticate, async (req: any, res: any) => {
  try {
    const id = req.params.id;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    res.status(200).json({ message: "Job fetched successfully", data: job });
  } catch (error) {
    console.error("[GET /job/:id] Error:", error);
    res.status(500).json({ error: "Internal Server Error", message: error instanceof Error ? error.message : String(error) });
  }
});

jobRouter.post("/", authenticate, async (req: any, res: any) => {
  try {
    console.log("Job creation started");
    const body = req.body;
    const organisation_id = req.user.organisation;
    const organisationName = req.user.organisationName;

    try {
      const parsedBody = jobSchema.safeParse(body);
      if (!parsedBody.success) {
        console.log("Request data validation failed", parsedBody.error.format());
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
        await createAndStoreEmbedding(
          jobResponse._id.toString(),
          jobEmbeddingText || "",
          namespace,
          organisation_id
        );
        console.log("Job embedding stored successfully");
      } catch (error) {
        console.error("Embedding Storage Error:", error);
        throw new Error("Failed to store job embedding");
      }

      // Generate prompt
      try {
        console.log("Generating prompt");
        const vapiSystemPrompt = getVapiSystemPrompt(
          JSON.stringify(data.description)
        );
        jobResponse.prompt.systemPrompt = vapiSystemPrompt;
        jobResponse.prompt.firstMessage = firstMessage;
  
        await jobResponse.save();
        console.log("Prompt generated successfully");
      } catch (error) {
        console.error("Prompt Generation Error:", error);
        throw new Error("Failed to generate prompt");
      }

      // Start background analysis for top 10 candidates
      (async () => {
        try {
          const PINECONE_INDEX_NAME = "remotestar";
          // 1. Fetch job embedding
          const jobEmbeddingResponse = await require("../../utils/pinecone")
            .pinecone.index(PINECONE_INDEX_NAME)
            .namespace("job-pool-v2")
            .fetch([jobResponse._id.toString()]);
          const jobEmbedding =
            jobEmbeddingResponse.records[jobResponse._id.toString()]?.values;
          if (!jobEmbedding) throw new Error("Job embedding not found");

          // 2. Query Pinecone for top 10 candidates
          const topMatches = await require("../../utils/pinecone")
            .pinecone.index(PINECONE_INDEX_NAME)
            .namespace("talent-pool-v2")
            .query({
              vector: jobEmbedding,
              topK: 10,
              includeMetadata: true,
              includeValues: false,
            });

          // 3. Extract user IDs
          const userIds = topMatches.matches.map((record: any) => record.id);

          // 4. Analyse each user (in parallel)
          const { analyseJdWithCv } = require("../../utils/helper-functions");
          await Promise.all(
            userIds.map((userId: string) =>
              analyseJdWithCv(jobResponse._id.toString(), userId)
            )
          );
          console.log("Background analysis for top 10 candidates completed");
        } catch (err) {
          console.error(
            "Background analysis for top 10 candidates failed:",
            err
          );
        }
      })();

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
      message: err.message,
    });
  }
});

jobRouter.get("/:id/regenerate-prompt", authenticate, async (req: any, res: any) => {
  const id = req.params.id;
  const job = await Job.findById(id);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  
  try {
    const vapiSystemPrompt = await getVapiSystemPrompt(job.description);
    job.prompt.systemPrompt = vapiSystemPrompt;
    job.prompt.firstMessage = firstMessage;
    // Persist the new prompt fields to the database
    console.log(job.prompt);
    await Job.findByIdAndUpdate(job._id, { $set: { prompt: job.prompt } });
    await job.save();
    res.status(200).json({ message: "Prompt regenerated successfully", prompt: JSON.stringify(job.prompt) });
  } catch (error) {
    console.error("Prompt regeneration failed:", error);
    res.status(200).json({ message: "Prompt regeneration failed", data: job });
  }
});

jobRouter.put("/", authenticate, async (req: any, res: any) => {
  try {
    console.log("[PUT /job] Starting job update request");
    const body = req.body;
    const parsedBody = jobSchema.safeParse(body);
    if (!parsedBody.success) {
      console.log("[PUT /job] Invalid request body:", parsedBody.error.format());
      return res.status(400).json({ error: parsedBody.error.format() });
    }

    const data = parsedBody.data;
    if (!data._id) {
      console.log("[PUT /job] Missing job _id in request");
      return res.status(400).json({ error: "Missing job _id for update" });
    }

    let updatedJob: any;
    console.log(`[PUT /job] Fetching existing job with ID: ${data._id}`);
    
    // Fetch the existing job
    const existingJob = await Job.findById(data._id);
    if (!existingJob) {
      console.log(`[PUT /job] Job not found with ID: ${data._id}`);
      return res.status(404).json({ error: "Job not found" });
    }

    // Check if description changed
    const descriptionChanged = data.description !== existingJob.description;
    const promptChanged = data.prompt !== existingJob.prompt;
    console.log(`[PUT /job] Description changed: ${descriptionChanged}`);

    // if (promptChanged) {
    //   console.log("[PUT /job] Processing prompt change");
    //   console.log("[PUT /job] Assistant ID:", assistantId);
    //   const script = existingJob.prompt.systemPrompt;
    //   const updatedAssistant = await updateScriptforAssistant(assistantId, script, data.description);
    //   console.log("[PUT /job] Prompt updated successfully");
    // }

    if (descriptionChanged) {
      console.log("[PUT /job] Processing description change");
      
      // Delete old embedding
      try {
        console.log("[PUT /job] Deleting old embedding");
        const { deleteEmbedding } = require("../../utils/helper-functions");
        await deleteEmbedding(
          existingJob._id.toString(),
          namespace,
          req.user.organisation
        );
      } catch (error) {
        console.error("[PUT /job] Failed to delete old embedding:", error);
        // Not a hard failure, continue
      }

      // Generate new embedding
      let jobEmbeddingText;
      try {
        console.log("[PUT /job] Generating new job embedding");
        const jobEmbeddingPromptText = jobEmbeddingPrompt(data.description);
        const jobEmbedding = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: jobEmbeddingPromptText }],
        });
        jobEmbeddingText = jobEmbedding.choices[0].message.content;
      } catch (error) {
        console.error("[PUT /job] OpenAI API Error:", error);
        return res.status(500).json({ error: "Failed to generate job embedding" });
      }

      // Update job record
      try {
        console.log("[PUT /job] Updating job record");
        updatedJob = await Job.findByIdAndUpdate(
          data._id,
          { $set: data },
          { new: true }
        );
        if (!updatedJob) {
          console.log("[PUT /job] Job not found after update");
          return res.status(404).json({ error: "Job not found after update" });
        }
      } catch (error) {
        console.error("[PUT /job] Failed to update job record:", error);
        return res.status(500).json({ error: "Failed to update job record" });
      }

      // Store new embedding
      try {
        console.log("[PUT /job] Storing new embedding");
        await createAndStoreEmbedding(
          updatedJob._id.toString(),
          jobEmbeddingText || "",
          namespace,
          req.user.organisation
        );
      } catch (error) {
        console.error("[PUT /job] Embedding Storage Error:", error);
        return res.status(500).json({ error: "Failed to store job embedding" });
      }

      // Generate new prompt
      try {
        console.log("[PUT /job] Generating new prompt");
        const vapiSystemPrompt = await getVapiSystemPrompt(data.description);
        // Ensure updatedJob.prompt is an object
        if (typeof updatedJob.prompt === "string") {
          try {
            updatedJob.prompt = JSON.parse(updatedJob.prompt);
          } catch (e) {
            console.error("[PUT /job] Failed to parse existing prompt:", e);
            updatedJob.prompt = {};
          }
        }
        updatedJob.prompt.systemPrompt = vapiSystemPrompt;
        updatedJob.prompt.firstMessage = firstMessage;
        await updatedJob.save();
      } catch (error) {
        console.error("[PUT /job] Prompt Generation Error:", error);
        return res.status(500).json({ error: "Failed to generate prompt" });
      }

      // Re-analyse top 10 candidates
      (async () => {
        try {
          console.log("[PUT /job] Starting background analysis of top 10 candidates");
          const PINECONE_INDEX_NAME = "remotestar";
          
          console.log("[PUT /job] Fetching job embedding");
          const jobEmbeddingResponse = await require("../../utils/pinecone")
            .pinecone.index(PINECONE_INDEX_NAME)
            .namespace("job-pool-v2")
            .fetch([updatedJob._id.toString()]);
          
          const jobEmbedding =
            jobEmbeddingResponse.records[updatedJob._id.toString()]?.values;
          if (!jobEmbedding) {
            console.error("[PUT /job] Job embedding not found in background analysis");
            throw new Error("Job embedding not found");
          }

          console.log("[PUT /job] Querying Pinecone for top matches");
          const topMatches = await require("../../utils/pinecone")
            .pinecone.index(PINECONE_INDEX_NAME)
            .namespace("talent-pool-v2")
            .query({
              vector: jobEmbedding,
              topK: 10,
              includeMetadata: true,
              includeValues: false,
            });

          const userIds = topMatches.matches.map((record: any) => record.id);
          console.log(`[PUT /job] Analyzing ${userIds.length} candidates`);
          
          const { analyseJdWithCv } = require("../../utils/helper-functions");
          await Promise.all(
            userIds.map((userId: string) =>
              analyseJdWithCv(updatedJob._id.toString(), userId)
            )
          );
          console.log("[PUT /job] Background analysis completed successfully");
        } catch (err) {
          console.error("[PUT /job] Background analysis failed:", err);
        }
      })();
    } else {
      console.log("[PUT /job] No description change, performing simple update");
      try {
        updatedJob = await Job.findByIdAndUpdate(
          data._id,
          { $set: data },
          { new: true }
        );
        if (!updatedJob) {
          console.log("[PUT /job] Job not found after simple update");
          return res.status(404).json({ error: "Job not found after update" });
        }
      } catch (error) {
        console.error("[PUT /job] Simple update failed:", error);
        return res.status(500).json({ error: "Failed to update job" });
      }
    }

    console.log("[PUT /job] Job update completed successfully");
    return res.status(200).json({ message: "Job updated successfully", data: updatedJob });
  } catch (error) {
    console.error("[PUT /job] Unhandled error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

jobRouter.delete("/:id", authenticate, async (req: any, res: any) => {
  try {
    const id = req.params.id;
    const job = await Job.findByIdAndDelete(id);
    const jobSearchResponse = await JobSearchResponse.deleteOne({jobId:id});
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
