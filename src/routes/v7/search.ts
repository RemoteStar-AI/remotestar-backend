import express from "express";
import { Job, JobAnalysisOfCandidate, User } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import { maximum_limit_of_search_results } from "../../utils/consts";
import { getSignedUrlForResume } from "../../utils/s3";
import { openai } from "../../utils/openai";
import { jdCvMatchingPrompt } from "../../utils/prompts";
import { extractJsonFromMarkdown } from "../../utils/helper-functions";
import { pinecone } from "../../utils/pinecone";
import { PINECONE_INDEX_NAME, pinecodeJobPoolNamespace } from "../../utils/consts";

const MAX_TOP_K = maximum_limit_of_search_results;

export const searchRouter = express.Router();

async function analyseJDwithCV(job: any, user: any) {
  const jobId = job._id;
  const candidateId = user._id;

  // check if already exists
  try {
    const existingAnalysis = await JobAnalysisOfCandidate.findOne({
      jobId,
      userId: candidateId,
    });
    if (existingAnalysis) {
      return {
        success: true,
        message: "Job analysis of candidate already exists",
        data: existingAnalysis,
      };
    }
  } catch (error) {
    console.error(
      "Error checking if job analysis of candidate already exists:",
      error
    );
    throw new Error(
      "Failed to check if job analysis of candidate already exists"
    );
  }
  console.log("resume_url", user.resume_url);
  const resumeUrl = await getSignedUrlForResume(user.resume_url);
  if (!resumeUrl) {
    throw new Error("Resume not found");
  }

  console.log("fetching resume from: ", resumeUrl);
  const response = await fetch(resumeUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch resume");
  }
  const resumeBuffer = await response.arrayBuffer();
  console.log("Resume buffer size:", resumeBuffer.byteLength, "bytes");

  let fileName = "resume.pdf";
  try {
    if (user.resume_url.includes("/")) {
      const urlParts = user.resume_url.split("/");
      const lastPart = urlParts[urlParts.length - 1];
      // Remove any query parameters
      fileName = lastPart.split("?")[0] || "resume.pdf";
    }
  } catch (error) {
    console.warn("Error extracting filename, using default:", error);
  }

  const contentType = response.headers.get("content-type") || "application/pdf";
  console.log("Content type:", contentType, "File name:", fileName);

  // Broader content type validation
  const validTypes = ["pdf", "doc", "docx", "txt", "rtf"];
  const isValidType = validTypes.some((type) =>
    contentType.toLowerCase().includes(type)
  );
  if (!isValidType) {
    console.warn(
      `Unexpected content type: ${contentType} for file: ${fileName}`
    );
  }
  let uploadedFile;
  try {
    console.log("Uploading file to OpenAI...");
    uploadedFile = await openai.files.create({
      file: new File([new Uint8Array(resumeBuffer)], fileName, {
        type: contentType,
      }),
      purpose: "user_data",
    });
    console.log("File uploaded to OpenAI with ID:", uploadedFile.id);
  } catch (error) {
    console.error("Error uploading file to OpenAI:", error);
    throw new Error("Failed to upload file to OpenAI");
  }
  let analysisText;
  try {
    const promptText = jdCvMatchingPrompt(job.description);
    const analysisResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "file", file: { file_id: uploadedFile.id } },
            { type: "text", text: promptText },
          ],
        },
      ],
    });
    analysisText = analysisResponse.choices[0].message.content;
  } catch (error) {
    console.error("Error analysing JD with CV:", error);
    throw new Error("Failed to analyse JD with CV openai error");
  }
  if (!analysisText) {
    throw new Error("Analysis text not found");
  }
  console.log("[DEBUG] Raw analysisText from OpenAI:", analysisText);
  const extractedJsonString = extractJsonFromMarkdown(analysisText);
  console.log("[DEBUG] Extracted JSON string:", extractedJsonString);
  const analysisJson = JSON.parse(extractedJsonString);

  try {
    const res = await JobAnalysisOfCandidate.create({
      jobId,
      userId: candidateId,
      data: analysisJson,
      newlyAnalysed: true,
    });
    return {
      success: true,
      message: "Job analysis of candidate created successfully",
      data: res,
    };
  } catch (error) {
    console.error("Error creating job analysis of candidate:", error);
    throw new Error("Failed to create job analysis of candidate");
    return {
      success: false,
      message: "Failed to create job analysis of candidate",
      error: error,
    };
  }
}

searchRouter.get("/:jobId", async (req: any, res: any) => {
  const Id = req.params.jobId;
  const start = parseInt(req.query.start as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const { isBookmarked } = req.query;

  if (isBookmarked !== "true" && isBookmarked !== "false") {
    return res.status(400).json({
      error: "Invalid value for isBookmarked. Use 'true' or 'false'.",
    });
  }
  const isBookmarkedBool = isBookmarked === "true";

  const fetchK = Math.min(MAX_TOP_K, limit);

  // find job embedding of the job
  const jobEmbedding = await pinecone
                    .index(PINECONE_INDEX_NAME)
                    .namespace(pinecodeJobPoolNamespace)
                    .fetch([Id]);
  console.log("jobEmbedding", jobEmbedding);


  return res.status(200).json({
    success: true,
    message: "Job embedding fetched successfully",

    data: jobEmbedding,
  });
});


searchRouter.get("/:jobId/getTopKCandidates", async (req: any, res: any) => {
  try {
    const Id = req.params.jobId;
    const n = parseInt(req.query.n as string) || 10;
    const start = parseInt(req.query.start as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const { isBookmarked } = req.query;

    if (isBookmarked !== "true" && isBookmarked !== "false") {
      return res.status(400).json({
        error: "Invalid value for isBookmarked. Use 'true' or 'false'.",
      });
    }
    const isBookmarkedBool = isBookmarked === "true";

    const fetchK = Math.min(MAX_TOP_K, limit);

    // find job embedding of the job
    const jobEmbeddingResponse = await pinecone
                      .index(PINECONE_INDEX_NAME)
                      .namespace(pinecodeJobPoolNamespace)
                      .fetch([Id]);
    
    if (!jobEmbeddingResponse.records[Id]) {
      return res.status(404).json({
        error: "Job embedding not found",
      });
    }

    const jobEmbedding = jobEmbeddingResponse.records[Id].values as number[];
    console.log(`[SEARCH] Job embedding fetched for job ${Id}`);

    // Get job details for organisation_id filter
    const job = await Job.findById(Id).select({ organisation_id: 1 }).lean();
    if (!job) {
      return res.status(404).json({
        error: "Job not found",
      });
    }

    // Query for matching candidates
    const topMatches = await pinecone
      .index(PINECONE_INDEX_NAME)
      .namespace("talent-pool-v2")
      .query({
        filter: {
          organisation_id: job.organisation_id,
        },
        vector: jobEmbedding,
        topK: n,
        includeMetadata: true,
        includeValues: true,
      });

    console.log(`[SEARCH] Found ${topMatches.matches.length} candidates for job ${Id}`);

    // Get user details for the matched candidates
    const candidateIds = topMatches.matches.map((match: any) => match.id);
    const users = await User.find({ _id: { $in: candidateIds } })
      .select({ _id: 1, name: 1, email: 1 })
      .lean();

    // Create a map of userId to user details
    const userMap = new Map();
    users.forEach((user: any) => {
      userMap.set(user._id.toString(), user);
    });

    // Prepare response with embeddings, names, and similarity scores
    const candidates = topMatches.matches.map((match: any) => {
      const user = userMap.get(match.id);
      return {
        userId: match.id,
        name: user?.name || "Unknown",
        email: user?.email || "Unknown",
        similarityScore: match.score,
      };
    });

    return res.status(200).json({
      success: true,
      message: `Top ${candidates.length} candidates fetched successfully`,
      data: candidates,
    });
  } catch (error) {
    console.error("[SEARCH] Error in getTopKCandidates:", error);
    return res.status(500).json({
      error: "Internal server error",
    });
  }
});

// http://localhost:3002/api/v7/search/68a4f27949fb8997309fb5fa/getTopKCandidates?n=2&isBookmarked=false
    
                
