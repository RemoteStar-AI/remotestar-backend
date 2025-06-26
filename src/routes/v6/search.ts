import { Router } from "express";
import {
  Job,
  CulturalFit,
  Skills,
  User,
  Bookmark,
  JobSearchResponse,
  JobAnalysisOfCandidate
} from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import admin from '../../utils/firebase';
import { pinecone } from "../../utils/pinecone";
import mongoose from 'mongoose';
import logger from "../../utils/loggers";
const PINECONE_INDEX_NAME = 'remotestar';
const MAX_TOP_K = 50;


export const searchRouter = Router();

searchRouter.get("/:jobId", authenticate, async (req: any, res: any) => {
  try {
    const Id = req.params.jobId;
    if (!mongoose.Types.ObjectId.isValid(Id)) {
      return res.status(400).json({ error: "Invalid job ID format" });
    }
    const memberId = req.user.firebase_id;

    // Pagination params
    const start = parseInt(req.query.start) || 0;
    let limit = parseInt(req.query.limit) || 20;
    const fetchK = MAX_TOP_K;

    let job;
    try {
      job = await Job.findById(Id);
      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }
    } catch (error) {
      console.error("Error finding job:", error);
      return res.status(500).json({ error: "Error retrieving job details" });
    }

    // 1. Fetch job embedding
    let jobEmbedding;
    try {
      const jobEmbeddingResponse = await pinecone
        .index(PINECONE_INDEX_NAME)
        .namespace("job-pool-v2")
        .fetch([Id]);
      logger.info(`[PINECONE] Successfully fetched job embedding for job ${Id}`);
      logger.debug(`[PINECONE] Job embedding response: ${JSON.stringify(jobEmbeddingResponse)}`);
      
      jobEmbedding = jobEmbeddingResponse.records[Id]?.values;
      if (!jobEmbedding) {
        logger.error(`[PINECONE] Job embedding not found for job ${Id}`);
        return res.status(404).json({ error: "Job embedding not found" });
      }
    } catch (error) {
      logger.error(`[PINECONE] Error fetching job embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error fetching job embedding" });
    }

    // 2. Query for matching candidates
    let topMatches;
    try {
      topMatches = await pinecone.index(PINECONE_INDEX_NAME).namespace("talent-pool-v2").query({
        vector: jobEmbedding,
        topK: fetchK,
        includeMetadata: true,
        includeValues: false,
      });
      logger.info(`[PINECONE] Successfully queried for matching candidates. Found ${topMatches.matches.length} matches`);
      logger.debug(`[PINECONE] Top matches: ${JSON.stringify(topMatches)}`);
    } catch (error) {
      logger.error(`[PINECONE] Error querying for matches: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error finding matching candidates" });
    }

    const totalCandidates = topMatches.matches.length;
    const paginatedMatches = topMatches.matches.slice(start, start + limit);
    const userIds = paginatedMatches.map((record: any) => record.id);

    // Log similarity percentage for each candidate being sent
    paginatedMatches.forEach((match: any) => {
      const similarity = match.score !== undefined ? (match.score * 100).toFixed(2) : 'N/A';
      logger.info(`[SIMILARITY] Candidate userId: ${match.id}, similarity: ${similarity}%`);
    });

    // 3. Fetch user details
    let users;
    try {
      users = await User.find({ _id: { $in: userIds } });
      logger.info(`[DB] Successfully fetched ${users.length} user details`);
    } catch (error) {
      logger.error(`[DB] Error finding users: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving user details" });
    }

    // 4. Fetch bookmarks
    let userBookmarks;
    try {
      userBookmarks = await Bookmark.find({ userId: { $in: userIds } });
      logger.info(`[DB] Successfully fetched ${userBookmarks.length} bookmarks`);
    } catch (error) {
      logger.error(`[DB] Error finding bookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving bookmark details" });
    }

    // 5. Fetch job analysis (first pass)
    let jobAnalysis = [];
    try {
      jobAnalysis = await JobAnalysisOfCandidate.find({ jobId: Id, userId: { $in: userIds } });
      logger.info(`[DB] Successfully fetched ${jobAnalysis.length} job analysis`);
    } catch (error) {
      logger.error(`[DB] Error finding job analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving job analysis" });
    }

    // 6. Find missing analyses and run them in parallel
    const existingUserIds = users.map((u: any) => u._id.toString());
    const analysedUserIds = new Set(jobAnalysis.map((a: any) => a.userId.toString()));
    const missingUserIds = existingUserIds.filter((id: string) => !analysedUserIds.has(id));
    if (missingUserIds.length > 0) {
      logger.info(`[ANALYSIS] Missing JobAnalysisOfCandidate for userIds: ${missingUserIds.join(", ")}`);
      const { analyseJdWithCv } = require("../../utils/helper-functions");
      await Promise.all(missingUserIds.map((userId: string) => analyseJdWithCv(Id, userId)));
      // Re-fetch job analysis after running
      try {
        jobAnalysis = await JobAnalysisOfCandidate.find({ jobId: Id, userId: { $in: userIds } });
        logger.info(`[DB] Re-fetched job analysis after running missing analyses. Now have ${jobAnalysis.length} analyses.`);
      } catch (error) {
        logger.error(`[DB] Error re-fetching job analysis: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({ error: "Error retrieving job analysis after update" });
      }
    }

    // 7. Prepare response
    try {
      const userProfiles = users.map((user) => {
        const bookmark = userBookmarks.find((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.memberId === memberId);
        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          years_of_experience: user.years_of_experience,
          designation: user.designation,
          uploader_email: user.firebase_email,
          current_location: user.current_location,
          isBookmarked: !!bookmark,
          bookmarkId: bookmark ? bookmark._id.toString() : null,
          total_bookmarks: user.total_bookmarks,
          bookmarkedBy: userBookmarks.filter((bookmark: any) => bookmark.memberId === memberId).map((bookmark: any) => bookmark.userId),
          analysis: jobAnalysis.find((analysis: any) => analysis.userId === user._id.toString())?.data,
        };
      });

      const finalResponse = {
        jobTitle: job.title,
        jobId: job._id,
        start: start,
        limit: limit,
        totalCandidates: totalCandidates,
        data: userProfiles.sort((a: any, b: any) => b.analysis.percentageMatchScore - a.analysis.percentageMatchScore),
      }

      logger.info(`[RESPONSE] Successfully prepared response with ${userProfiles.length} profiles`);
      return res.status(200).json(finalResponse);
    } catch (error) {
      logger.error(`[RESPONSE] Error preparing response: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error preparing response" });
    }

  } catch (error) {
    console.error("Unexpected error in search route:", error);
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
});

export default searchRouter;
