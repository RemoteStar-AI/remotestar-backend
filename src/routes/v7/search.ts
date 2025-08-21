import express from "express";
import { Job, JobAnalysisOfCandidate, User, Bookmark } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import { maximum_limit_of_search_results, pinecodeTalentPoolNamespace } from "../../utils/consts";
import { getSignedUrlForResume } from "../../utils/s3";
import { openai } from "../../utils/openai";
import { jdCvMatchingPrompt } from "../../utils/prompts";
import { extractJsonFromMarkdown, markAnalysisAsNotNew } from "../../utils/helper-functions";
import { pinecone } from "../../utils/pinecone";
import { PINECONE_INDEX_NAME, pinecodeJobPoolNamespace } from "../../utils/consts";
import { getFirebaseEmailFromUID } from "../../utils/firebase";

const MAX_TOP_K = maximum_limit_of_search_results;

export const searchRouter = express.Router();

async function analyseJDwithCV(job: any, candidateId: any) {
  const startTime = Date.now();
  const stepTimes: { [key: string]: number } = {};
  
  console.log(`[ANALYSIS] Starting analysis for jobId=${job._id} candidateId=${candidateId}`);
  
  const jobId = job._id;

  // Step 1: Check if analysis already exists
  const step1Start = Date.now();
  try {
    const existingAnalysis = await JobAnalysisOfCandidate.findOne({
      jobId,
      userId: candidateId,
    });
    if (existingAnalysis) {
      stepTimes.step1_checkExisting = Date.now() - step1Start;
      console.log(`[ANALYSIS] Step 1 - Check existing: ${stepTimes.step1_checkExisting}ms | Found existing analysis`);
      return {
        success: true,
        message: "Job analysis of candidate already exists",
        data: existingAnalysis,
      };
    }
  } catch (error) {
    stepTimes.step1_checkExisting = Date.now() - step1Start;
    console.error(`[ANALYSIS] Step 1 - Check existing: ${stepTimes.step1_checkExisting}ms | Error:`, error);
    throw new Error("Failed to check if job analysis of candidate already exists");
  }
  stepTimes.step1_checkExisting = Date.now() - step1Start;
  console.log(`[ANALYSIS] Step 1 - Check existing: ${stepTimes.step1_checkExisting}ms | No existing analysis found`);

  // Step 1.5: Create the analysis document immediately
  const step1_5Start = Date.now();
  let analysisDoc;
  try {
    console.log(`[ANALYSIS] Step 1.5 - Creating analysis document`);
    analysisDoc = await JobAnalysisOfCandidate.create({
      jobId,
      userId: candidateId,
      userData: {},
      data: {},
      newlyAnalysed: true,
      uniqueId: `${jobId}-${candidateId}`,
    });
    stepTimes.step1_5_createDoc = Date.now() - step1_5Start;
    console.log(`[ANALYSIS] Step 1.5 - Create document: ${stepTimes.step1_5_createDoc}ms | Document created with ID: ${analysisDoc._id}`);
  } catch (error) {
    stepTimes.step1_5_createDoc = Date.now() - step1_5Start;
    console.error(`[ANALYSIS] Step 1.5 - Create document: ${stepTimes.step1_5_createDoc}ms | Error:`, error);
    throw new Error("Failed to create analysis document");
  }

  // Step 2: Fetch user details
  const step2Start = Date.now();
  const user = await User.findById(candidateId);
  if (!user) {
    stepTimes.step2_fetchUser = Date.now() - step2Start;
    console.error(`[ANALYSIS] Step 2 - Fetch user: ${stepTimes.step2_fetchUser}ms | User not found`);
    throw new Error("User not found");
  }
  stepTimes.step2_fetchUser = Date.now() - step2Start;
  console.log(`[ANALYSIS] Step 2 - Fetch user: ${stepTimes.step2_fetchUser}ms | User found: ${user.name}`);

  // Step 3: Get signed URL for resume
  const step3Start = Date.now();
  console.log(`[ANALYSIS] Step 3 - Getting signed URL for: ${user.resume_url}`);
  const resumeUrl = await getSignedUrlForResume(user.resume_url);
  if (!resumeUrl) {
    stepTimes.step3_getSignedUrl = Date.now() - step3Start;
    console.error(`[ANALYSIS] Step 3 - Get signed URL: ${stepTimes.step3_getSignedUrl}ms | Resume not found`);
    throw new Error("Resume not found");
  }
  stepTimes.step3_getSignedUrl = Date.now() - step3Start;
  console.log(`[ANALYSIS] Step 3 - Get signed URL: ${stepTimes.step3_getSignedUrl}ms | URL obtained`);

  // Step 4: Fetch resume from S3
  const step4Start = Date.now();
  console.log(`[ANALYSIS] Step 4 - Fetching resume from: ${resumeUrl}`);
  const response = await fetch(resumeUrl);
  if (!response.ok) {
    stepTimes.step4_fetchResume = Date.now() - step4Start;
    console.error(`[ANALYSIS] Step 4 - Fetch resume: ${stepTimes.step4_fetchResume}ms | Failed to fetch resume: ${response.status}`);
    throw new Error("Failed to fetch resume");
  }
  const resumeBuffer = await response.arrayBuffer();
  stepTimes.step4_fetchResume = Date.now() - step4Start;
  console.log(`[ANALYSIS] Step 4 - Fetch resume: ${stepTimes.step4_fetchResume}ms | Buffer size: ${resumeBuffer.byteLength} bytes`);

  // Step 5: Process file metadata
  const step5Start = Date.now();
  let fileName = "resume.pdf";
  try {
    if (user.resume_url.includes("/")) {
      const urlParts = user.resume_url.split("/");
      const lastPart = urlParts[urlParts.length - 1];
      fileName = lastPart.split("?")[0] || "resume.pdf";
    }
  } catch (error) {
    console.warn("Error extracting filename, using default:", error);
  }

  const contentType = response.headers.get("content-type") || "application/pdf";
  console.log(`[ANALYSIS] Step 5 - File metadata: Content type: ${contentType}, File name: ${fileName}`);

  // Broader content type validation
  const validTypes = ["pdf", "doc", "docx", "txt", "rtf"];
  const isValidType = validTypes.some((type) =>
    contentType.toLowerCase().includes(type)
  );
  if (!isValidType) {
    console.warn(`Unexpected content type: ${contentType} for file: ${fileName}`);
  }
  stepTimes.step5_processMetadata = Date.now() - step5Start;
  console.log(`[ANALYSIS] Step 5 - Process metadata: ${stepTimes.step5_processMetadata}ms`);

  // Step 6: Upload file to OpenAI
  const step6Start = Date.now();
  let uploadedFile;
  try {
    console.log(`[ANALYSIS] Step 6 - Uploading file to OpenAI: ${fileName}`);
    uploadedFile = await openai.files.create({
      file: new File([new Uint8Array(resumeBuffer)], fileName, {
        type: contentType,
      }),
      purpose: "user_data",
    });
    stepTimes.step6_uploadToOpenAI = Date.now() - step6Start;
    console.log(`[ANALYSIS] Step 6 - Upload to OpenAI: ${stepTimes.step6_uploadToOpenAI}ms | File ID: ${uploadedFile.id}`);
  } catch (error) {
    stepTimes.step6_uploadToOpenAI = Date.now() - step6Start;
    console.error(`[ANALYSIS] Step 6 - Upload to OpenAI: ${stepTimes.step6_uploadToOpenAI}ms | Error:`, error);
    throw new Error("Failed to upload file to OpenAI");
  }

  // Step 7: Analyze with OpenAI
  const step7Start = Date.now();
  let analysisText;
  try {
    const promptText = jdCvMatchingPrompt(job.description);
    console.log(`[ANALYSIS] Step 7 - Starting OpenAI analysis with file ID: ${uploadedFile.id}`);
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
    stepTimes.step7_openAIAnalysis = Date.now() - step7Start;
    console.log(`[ANALYSIS] Step 7 - OpenAI analysis: ${stepTimes.step7_openAIAnalysis}ms | Response received`);
  } catch (error) {
    stepTimes.step7_openAIAnalysis = Date.now() - step7Start;
    console.error(`[ANALYSIS] Step 7 - OpenAI analysis: ${stepTimes.step7_openAIAnalysis}ms | Error:`, error);
    throw new Error("Failed to analyse JD with CV openai error");
  }

  if (!analysisText) {
    console.error(`[ANALYSIS] Step 7 - OpenAI analysis: ${stepTimes.step7_openAIAnalysis}ms | No analysis text received`);
    throw new Error("Analysis text not found");
  }

  // Step 8: Process analysis response
  const step8Start = Date.now();
  console.log(`[ANALYSIS] Step 8 - Processing analysis response (${analysisText.length} characters)`);
  const extractedJsonString = extractJsonFromMarkdown(analysisText);
  const analysisJson = JSON.parse(extractedJsonString);
  stepTimes.step8_processResponse = Date.now() - step8Start;
  console.log(`[ANALYSIS] Step 8 - Process response: ${stepTimes.step8_processResponse}ms | JSON parsed successfully`);

  // Step 9: Update the analysis document with results
  const step9Start = Date.now();
  try {
    console.log(`[ANALYSIS] Step 9 - Updating analysis document with results`);
    const updatedDoc = await JobAnalysisOfCandidate.findByIdAndUpdate(
      analysisDoc._id,
      {
        userData: user,
        data: analysisJson,
      },
      { new: true }
    );
    if (!updatedDoc) {
      throw new Error("Failed to update analysis document");
    }
    stepTimes.step9_saveToDB = Date.now() - step9Start;
    console.log(`[ANALYSIS] Step 9 - Update DB: ${stepTimes.step9_saveToDB}ms | Analysis updated with ID: ${updatedDoc._id}`);
    console.log('grep help' , updatedDoc);
    
    // Calculate total time
    const totalTime = Date.now() - startTime;
    stepTimes.totalTime = totalTime;
    
    // Log summary
    console.log(`[ANALYSIS] SUMMARY for jobId=${jobId} candidateId=${candidateId}:`);
    console.log(`[ANALYSIS] Total time: ${totalTime}ms`);
    console.log(`[ANALYSIS] Step breakdown:`);
    Object.entries(stepTimes).forEach(([step, time]) => {
      if (step !== 'totalTime') {
        const percentage = ((time / totalTime) * 100).toFixed(1);
        console.log(`[ANALYSIS]   ${step}: ${time}ms (${percentage}%)`);
      }
    });
    
    return {
      success: true,
      message: "Job analysis of candidate created successfully",
      data: updatedDoc,
    };
  } catch (error) {
    stepTimes.step9_saveToDB = Date.now() - step9Start;
    console.error(`[ANALYSIS] Step 9 - Save to DB: ${stepTimes.step9_saveToDB}ms | Error:`, error);
    return {
      success: "failed",
      message: "Failed to create job analysis of candidate - analysis might already exist",
      error: error,
    };
  }
}

searchRouter.get("/:jobId", authenticate,async (req: any, res: any) => {
  const routeStartTime = Date.now();
  console.log(`[SEARCH] Starting route for jobId=${req.params.jobId}`);
  
  const Id = req.params.jobId;
  const limit = parseInt(req.query.limit as string) || 10;
  const { isBookmarked } = req.query;

  if (isBookmarked !== "true" && isBookmarked !== "false") {
    return res.status(400).json({
      error: "Invalid value for isBookmarked. Use 'true' or 'false'.",
    });
  }
  const isBookmarkedBool = isBookmarked === "true";

  let loadMoreExists: boolean;

  const fetchK = Math.min(MAX_TOP_K, limit);

  // Step 1: Fetch job and embedding in parallel
  const step1Start = Date.now();
  let job, jobEmbedding;
  try {
    [job, jobEmbedding] = await Promise.all([
      Job.findById(Id),
      pinecone.index(PINECONE_INDEX_NAME).namespace(pinecodeJobPoolNamespace).fetch([Id])
    ]);
    
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }
    if (!jobEmbedding.records[Id]) {
      return res.status(404).json({ error: "Job embedding not found" });
    }
    
    console.log(`[SEARCH] Step 1 - Job & embedding fetch: ${Date.now() - step1Start}ms`);
  } catch (error) {
    console.error("Error fetching job or embedding:", error);
    return res.status(500).json({ error: "Failed to fetch job or embedding" });
  }

  // Step 2: Fetch top matches from Pinecone
  const step2Start = Date.now();
  let topMatches;
  try {
    topMatches = await pinecone.index(PINECONE_INDEX_NAME).namespace(pinecodeTalentPoolNamespace).query({
      filter: { organisation_id: job.organisation_id },
      vector: jobEmbedding.records[Id]?.values as number[],
      topK: fetchK+1,
      includeMetadata: true,
      includeValues: false,
    });
    console.log(`[SEARCH] Step 2 - Pinecone query: ${Date.now() - step2Start}ms | Found ${topMatches.matches.length} matches`);
  } catch (error) {
    console.error("Error fetching top matches:", error);
    return res.status(500).json({ error: "Failed to fetch top matches" });
  }

  if(topMatches.matches.length > fetchK && fetchK !== MAX_TOP_K){
    loadMoreExists = true;
  }else{
    loadMoreExists = false;
  }

  // Step 3: Check existing analyses in batch
  const step3Start = Date.now();
  const candidateIds = topMatches.matches.map((match: any) => match.id);
  const existingAnalyses = await JobAnalysisOfCandidate.find({ 
    jobId: Id, 
    userId: { $in: candidateIds } 
  }).select({ userId: 1, _id: 1 });
  
  const existingAnalysisUserIds = new Set(existingAnalyses.map((a: any) => a.userId.toString()));
  const notAnalysedCandidates = candidateIds.filter(id => !existingAnalysisUserIds.has(id));
  
  console.log(`[SEARCH] Step 3 - Check existing analyses: ${Date.now() - step3Start}ms | Existing: ${existingAnalyses.length}, New: ${notAnalysedCandidates.length}`);

  // Step 4: Analyze new candidates in parallel with timeout
  if (notAnalysedCandidates.length > 0) {
    const step4Start = Date.now();
    console.log(`[SEARCH] Step 4 - Starting analysis for ${notAnalysedCandidates.length} candidates`);
    
    // Process in smaller batches to avoid overwhelming OpenAI
    const BATCH_SIZE = 3; // Process 3 at a time
    const analysisPromises = [];
    
    for (let i = 0; i < notAnalysedCandidates.length; i += BATCH_SIZE) {
      const batch = notAnalysedCandidates.slice(i, i + BATCH_SIZE);
      const batchPromises = batch.map(async (candidateId) => {
        try {
          // Add timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Analysis timeout')), 300000); // 5 minutes timeout
          });
          
          const analysisPromise = analyseJDwithCV(job, candidateId);
          return await Promise.race([analysisPromise, timeoutPromise]);
                 } catch (error: any) {
           console.error(`[SEARCH] Analysis failed for candidate ${candidateId}:`, error);
           return { success: false, error: error?.message || 'Unknown error' };
         }
      });
      
      // Wait for current batch to complete before starting next batch
      const batchResults = await Promise.allSettled(batchPromises);
      analysisPromises.push(...batchResults);
      
      console.log(`[SEARCH] Batch ${Math.floor(i/BATCH_SIZE) + 1} completed: ${batchResults.length} candidates`);
    }
    
    console.log(`[SEARCH] Step 4 - Analysis completed: ${Date.now() - step4Start}ms`);
  }

  // Step 5: Fetch final results with pagination
  const step5Start = Date.now();
  const finalAnalysedCandidates = await JobAnalysisOfCandidate.find({ jobId: Id })
    .sort({ 'data.percentageMatchScore': -1 })
    .select({
      _id: 1,
      userId: 1,
      data: 1,
      newlyAnalysed: 1,
      createdAt: 1,
      userData: 1
    });
  const finalRankedCandidates = finalAnalysedCandidates.sort((a: any, b: any) => b.data.percentageMatchScore - a.data.percentageMatchScore);
  
  // Transform data to match v6 structure
  let preFinalResponse: any;
  if(isBookmarkedBool){
    preFinalResponse = finalRankedCandidates;
  }else{
    preFinalResponse = finalRankedCandidates.slice(0, limit);
  }
  const finalResponse = await Promise.all(preFinalResponse.map(async (analysis: any) => {
    const userId = analysis.userId;
    
    // Fetch user details
    const user = await User.findById(userId).select({
      _id: 1,
      name: 1,
      email: 1,
      years_of_experience: 1,
      designation: 1,
      firebase_email: 1,
      current_location: 1,
      total_bookmarks: 1
    });

    if (!user) {
      return null;
    }

    // Check if user is bookmarked by current user
    let anyBookmarkForUser = null;
    let myBookmark = null;
    let bookmarkedByUids: string[] = [];

    if (req.user && req.user.uid) {
      try {
        [anyBookmarkForUser, myBookmark] = await Promise.all([
          Bookmark.findOne({ userId: userId, jobId: Id }),
          Bookmark.findOne({ userId: userId, memberId: req.user.uid, jobId: Id })
        ]);

        // Get all bookmarks for this user and job to build bookmarkedBy array
        const userBookmarks = await Bookmark.find({ userId: userId, jobId: Id })
          .select({ memberId: 1 })
          .lean();
        
        bookmarkedByUids = userBookmarks.map((bookmark: any) => bookmark.memberId);
      } catch (error) {
        console.error(`Error fetching bookmark data for user ${userId}:`, error);
      }
    }

    // Get bookmarked by emails (simplified - just return the UIDs for now)
    const bookmarkedByEmails = await Promise.all(bookmarkedByUids.map(async (uid: string) => {
      const email = await getFirebaseEmailFromUID(uid);
      return email ?? uid;
    }));

    if(isBookmarkedBool && !!!anyBookmarkForUser){
      return null;
    }

    return {
      userId: user._id,
      name: user.name,
      email: user.email,
      years_of_experience: user.years_of_experience,
      designation: user.designation,
      uploader_email: user.firebase_email,
      current_location: user.current_location,
      isBookmarked: !!anyBookmarkForUser,
      bookmarkId: myBookmark ? myBookmark._id.toString() : "not by you bruh",
      total_bookmarks: user.total_bookmarks,
      bookmarkedBy: bookmarkedByEmails,
      analysis: analysis?.data,
      isNewlyAnalysed: analysis?.newlyAnalysed || false,
    };
  }));

  // Filter out null values (users that don't exist)
  const filteredResponse = finalResponse.filter((item: any) => item !== null);
  
  console.log(`[SEARCH] Step 5 - Final results: ${Date.now() - step5Start}ms | Returning ${filteredResponse.length} candidates`);

  const totalRouteTime = Date.now() - routeStartTime;
  console.log(`[SEARCH] ROUTE COMPLETE: Total time: ${totalRouteTime}ms`);

  // Store newly analyzed candidates to mark them as not new after response
  const newlyAnalyzedCandidates = filteredResponse
    .filter((item: any) => item.isNewlyAnalysed)
    .map((item: any) => ({ jobId: Id, userId: item.userId }));

  // Send response first
  res.status(200).json({
    success: true,
    jobId: Id,
    jobTitle: job.title,
    limit: limit,
    message: `Analysis completed in ${totalRouteTime}ms`,
    data: filteredResponse,
    loadMoreExists:isBookmarkedBool ? false : loadMoreExists,
    metadata: {
      totalTime: totalRouteTime,
      candidatesAnalyzed: notAnalysedCandidates.length,
      totalCandidates: candidateIds.length
    }
  });

  // Mark newly analyzed candidates as not new after response is sent
  if (newlyAnalyzedCandidates.length > 0) {
    console.log(`[SEARCH] Marking ${newlyAnalyzedCandidates.length} candidates as not newly analyzed`);
    try {
      await Promise.all(
        newlyAnalyzedCandidates.map(({ jobId, userId }) => 
          markAnalysisAsNotNew(jobId, userId)
        )
      );
      console.log(`[SEARCH] Successfully marked ${newlyAnalyzedCandidates.length} candidates as not newly analyzed`);
    } catch (error) {
      console.error(`[SEARCH] Error marking candidates as not newly analyzed:`, error);
    }
  }
});


// testing route do not touch if you dont know what you are doing
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
    
                
