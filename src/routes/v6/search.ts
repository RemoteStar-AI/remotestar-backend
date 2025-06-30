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
import { markAnalysisAsNotNew } from "../../utils/helper-functions";
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

    // 1. Fetch all analyses for this job
    let jobAnalyses = [];
    try {
      jobAnalyses = await JobAnalysisOfCandidate.find({ jobId: Id });
    } catch (error) {
      logger.error(`[DB] Error finding job analyses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving job analyses" });
    }

    // 2. If enough analyses, return top 'limit' sorted by percentageMatchScore
    if (jobAnalyses.length >= start + limit) {
      // Get userIds for the top candidates
      const sortedAnalyses = jobAnalyses.sort((a: any, b: any) => (b.data?.percentageMatchScore || 0) - (a.data?.percentageMatchScore || 0));
      const paginatedAnalyses = sortedAnalyses.slice(start, start + limit);
      const userIds = paginatedAnalyses.map((a: any) => a.userId);

      // Fetch user details
      let users = [];
      try {
        users = await User.find({ _id: { $in: userIds },organisation_id: job.organisation_id });
      } catch (error) {
        logger.error(`[DB] Error finding users: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({ error: "Error retrieving user details" });
      }

      // Fetch bookmarks
      let userBookmarks = [];
      try {
        userBookmarks = await Bookmark.find({ userId: { $in: userIds } });
      } catch (error) {
        logger.error(`[DB] Error finding bookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({ error: "Error retrieving bookmark details" });
      }

      // Prepare userProfiles
      const userProfiles = await Promise.all(users.map(async (user) => {
        const bookmark = userBookmarks.find((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.memberId === memberId);
        const analysis = paginatedAnalyses.find((a: any) => a.userId === user._id.toString());
        let isNewlyAnalysed = false;
        if (analysis?.newlyAnalysed) {
          isNewlyAnalysed = true;
          await markAnalysisAsNotNew(job._id.toString(), user._id.toString());
        }
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
          analysis: analysis?.data,
          isNewlyAnalysed,
        };
      }));

      const finalResponse = {
        jobTitle: job.title,
        jobId: job._id,
        start: start,
        limit: limit,
        totalCandidates: jobAnalyses.length,
        data: userProfiles,
      };
      logger.info(`[RESPONSE] Successfully prepared response with ${userProfiles.length} profiles (from analyses only)`);
      return res.status(200).json(finalResponse);
    }

    // 3. Not enough analyses, fetch more candidates from Pinecone
    // Fetch job embedding
    let jobEmbedding;
    try {
      const jobEmbeddingResponse = await pinecone
        .index(PINECONE_INDEX_NAME)
        .namespace("job-pool-v2")
        .fetch([Id]);
      logger.info(`[PINECONE] Successfully fetched job embedding for job ${Id}`);
      jobEmbedding = jobEmbeddingResponse.records[Id]?.values;
      if (!jobEmbedding) {
        logger.error(`[PINECONE] Job embedding not found for job ${Id}`);
        return res.status(404).json({ error: "Job embedding not found" });
      }
    } catch (error) {
      logger.error(`[PINECONE] Error fetching job embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error fetching job embedding" });
    }

    // Query for matching candidates
    let topMatches;
    try {
      // topMatches = await pinecone.index(PINECONE_INDEX_NAME).namespace("talent-pool-v2").query({
      topMatches = await pinecone.index(PINECONE_INDEX_NAME).namespace("talent-pool-v2").query({
        filter: {
          organisation_id: job.organisation_id,
        },
        vector: jobEmbedding,
        topK: fetchK,
        includeMetadata: true,
        includeValues: false,
      })  ;
      // topMatches = await pinecone.index(PINECONE_INDEX_NAME).namespace("talent-pool-v2").query({
      //   vector: jobEmbedding,
      //   topK: fetchK,
      //   includeMetadata: true,
      //   includeValues: false,
      // });
      logger.info(`[PINECONE] Successfully queried for matching candidates. Found ${topMatches.matches.length} matches`);
    } catch (error) {
      logger.error(`[PINECONE] Error querying for matches: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error finding matching candidates" });
    }

    // Exclude already analysed userIds
    const analysedUserIds = new Set(jobAnalyses.map((a: any) => a.userId.toString()));
    const newMatches = topMatches.matches.filter((match: any) => !analysedUserIds.has(match.id));
    // Only fetch as many as needed (or batch of 10)
    const needed = (start + limit) - jobAnalyses.length;
    const toAnalyse = newMatches.slice(0, Math.max(needed, 10));
    const toAnalyseUserIds = toAnalyse.map((m: any) => m.id);

    // Run analyseJdWithCv for each new candidate
    if (toAnalyseUserIds.length > 0) {
      logger.info(`[ANALYSIS] Running analyseJdWithCv for userIds: ${toAnalyseUserIds.join(", ")}`);
      const { analyseJdWithCv } = require("../../utils/helper-functions");
      // Filter out userIds that do not exist in User collection
      const existingUsers = await User.find({ _id: { $in: toAnalyseUserIds } });
      const existingUserIds = new Set(existingUsers.map((u: any) => u._id.toString()));
      const validToAnalyseUserIds = toAnalyseUserIds.filter((id: string) => existingUserIds.has(id));
      await Promise.all(validToAnalyseUserIds.map((userId: string) => analyseJdWithCv(Id, userId)));
    }

    // Re-fetch all analyses for this job
    let allAnalyses = [];
    try {
      allAnalyses = await JobAnalysisOfCandidate.find({ jobId: Id });
    } catch (error) {
      logger.error(`[DB] Error re-fetching job analyses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving job analyses after update" });
    }

    // Sort and paginate
    const sortedAnalyses = allAnalyses.sort((a: any, b: any) => (b.data?.percentageMatchScore || 0) - (a.data?.percentageMatchScore || 0));
    const paginatedAnalyses = sortedAnalyses.slice(start, start + limit);
    const userIds = paginatedAnalyses.map((a: any) => a.userId);

    // Fetch user details
    let users = [];
    try {
      users = await User.find({ _id: { $in: userIds },organisation_id: job.organisation_id });
    } catch (error) {
      logger.error(`[DB] Error finding users: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving user details" });
    }

    // Fetch bookmarks
    let userBookmarks = [];
    try {
      userBookmarks = await Bookmark.find({ userId: { $in: userIds }});
    } catch (error) {
      logger.error(`[DB] Error finding bookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving bookmark details" });
    }

    // Prepare userProfiles
    const userProfiles = await Promise.all(users.map(async (user) => {
      const bookmark = userBookmarks.find((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.memberId === memberId);
      const analysis = paginatedAnalyses.find((a: any) => a.userId === user._id.toString());
      let isNewlyAnalysed = false;
      if (analysis?.newlyAnalysed) {
        isNewlyAnalysed = true;
        await markAnalysisAsNotNew(job._id.toString(), user._id.toString());
      }
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
        analysis: analysis?.data,
        isNewlyAnalysed,
      };
    }));

    const finalResponse = {
      jobTitle: job.title,
      jobId: job._id,
      start: start,
      limit: limit,
      totalCandidates: allAnalyses.length,
      data: userProfiles,
    };
    logger.info(`[RESPONSE] Successfully prepared response with ${userProfiles.length} profiles (after new analyses)`);
    return res.status(200).json(finalResponse);
  } catch (error) {
    console.error("Unexpected error in search route:", error);
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
});

export default searchRouter;
