import { Router } from "express";
export const jobRouter = Router();
import { Job, JobSearchResponse } from "../../utils/db";
import { jobSchema } from "../../utils/schema";
import {
  jobEmbeddingPrompt,
  VapiSystemPrompt3 as VapiSystemPrompt,
} from "../../utils/prompts";
import { openai } from "../../utils/openai";
import { createAndStoreEmbedding, extractJsonFromMarkdown } from "../../utils/helper-functions";
import { authenticate } from "../../middleware/firebase-auth";
import { z } from "zod";
import { systemPrompt } from "../../utils/vapi";

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
    const organisationName = req.user.organisationName;

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
        await createAndStoreEmbedding(
          jobResponse._id.toString(),
          jobEmbeddingText || "",
          namespace,
          organisation_id,
          jobResponse._id.toString()
        );
        console.log("Job embedding stored successfully");
      } catch (error) {
        console.error("Embedding Storage Error:", error);
        throw new Error("Failed to store job embedding");
      }

      // Generate prompt
      try {
        const openaiPrompt = VapiSystemPrompt(
          data.description,
          organisationName
        );
        const openaiResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: openaiPrompt }],
          response_format: { type: "json_object" }
        });
        const prompt = openaiResponse.choices[0].message.content;
        if (prompt && prompt !== "null") {
          const jsonPrompt = extractJsonFromMarkdown(prompt);
          const parsedPrompt = JSON.parse(jsonPrompt);
          const parsedPromptSchema = VapiPromptSchema.safeParse(parsedPrompt);
          if (!parsedPromptSchema.success) {
            throw new Error("Invalid prompt format");
          }
          jobResponse.prompt = parsedPrompt;
          await jobResponse.save();
          console.log("Prompt generated successfully");
        }
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
  const organisationName = req.user.organisationName;
  const openaiPrompt = VapiSystemPrompt(job.description, organisationName);
  const openaiResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [{ role: "user", content: openaiPrompt }],
    response_format: { type: "json_object" }
  });
  const prompt = openaiResponse.choices[0].message.content;
  if (prompt && prompt !== "null") {
    job.prompt = prompt +`\n \n [JOB_DESCRIPTION] : ${job.description}`;
    await job.save();
    res.status(200).json({ message: "Prompt regenerated successfully", prompt:prompt });
  } else {
    res.status(200).json({ message: "Prompt regeneration failed", data: job });
  }
});

jobRouter.put("/", authenticate, async (req: any, res: any) => {
  const body = req.body;
  const parsedBody = jobSchema.safeParse(body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: parsedBody.error.format() });
  }
  const data = parsedBody.data;
  if (!data._id) {
    return res.status(400).json({ error: "Missing job _id for update" });
  }
  try {
    let updatedJob: any;
    // Fetch the existing job
    const existingJob = await Job.findById(data._id);
    if (!existingJob) {
      return res.status(404).json({ error: "Job not found" });
    }
    // Check if description changed
    const descriptionChanged = data.description !== existingJob.description;
    if (descriptionChanged) {
      // Delete old embedding
      try {
        const { deleteEmbedding } = require("../../utils/helper-functions");
        await deleteEmbedding(
          existingJob._id.toString(),
          namespace,
          req.user.organisation
        );
      } catch (error) {
        console.error("Failed to delete old embedding:", error);
        // Not a hard failure, continue
      }
      // Generate new embedding
      let jobEmbeddingText;
      try {
        const jobEmbeddingPromptText = jobEmbeddingPrompt(data.description);
        const jobEmbedding = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: jobEmbeddingPromptText }],
        });
        jobEmbeddingText = jobEmbedding.choices[0].message.content;
      } catch (error) {
        console.error("OpenAI API Error (PUT):", error);
        return res.status(500).json({ error: "Failed to generate job embedding" });
      }
      // Update job record (all fields)
      updatedJob = await Job.findByIdAndUpdate(
        data._id,
        { $set: data },
        { new: true }
      );
      if (!updatedJob) {
        return res.status(404).json({ error: "Job not found after update" });
      }
      // Store new embedding
      try {
        await createAndStoreEmbedding(
          updatedJob._id.toString(),
          jobEmbeddingText || "",
          namespace,
          req.user.organisation,
          updatedJob._id.toString()
        );
      } catch (error) {
        console.error("Embedding Storage Error (PUT):", error);
        return res.status(500).json({ error: "Failed to store job embedding" });
      }
      // Generate new prompt
      try {
        const openaiPrompt = VapiSystemPrompt(
          data.description,
          req.user.organisationName
        );
        const openaiResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: openaiPrompt }],
          response_format: { type: "json_object" }
        });
        const prompt = openaiResponse.choices[0].message.content;
        if (prompt && prompt !== "null") {
          updatedJob.prompt = prompt +`\n \n [JOB_DESCRIPTION] : ${data.description}`;
          await updatedJob.save();
        }
      } catch (error) {
        console.error("Prompt Generation Error (PUT):", error);
        return res.status(500).json({ error: "Failed to generate prompt" });
      }
      // Re-analyse top 10 candidates
      (async () => {
        try {
          const PINECONE_INDEX_NAME = "remotestar";
          // 1. Fetch job embedding
          const jobEmbeddingResponse = await require("../../utils/pinecone")
            .pinecone.index(PINECONE_INDEX_NAME)
            .namespace("job-pool-v2")
            .fetch([updatedJob._id.toString()]);
          const jobEmbedding =
            jobEmbeddingResponse.records[updatedJob._id.toString()]?.values;
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
              analyseJdWithCv(updatedJob._id.toString(), userId)
            )
          );
        } catch (err) {
          console.error(
            "Background analysis for top 10 candidates failed (PUT):",
            err
          );
        }
      })();
    } else {
      // Just update the fields as usual
      updatedJob = await Job.findByIdAndUpdate(
        data._id,
        { $set: data },
        { new: true }
      );
      if (!updatedJob) {
        return res.status(404).json({ error: "Job not found after update" });
      }
    }
    return res.status(200).json({ message: "Job updated successfully", data: updatedJob });
  } catch (error) {
    console.error("Job update error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
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
