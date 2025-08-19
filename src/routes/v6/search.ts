import { Router } from "express";
import {
  Job,
  User,
  Bookmark,
  JobAnalysisOfCandidate
} from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import { getPineconeVectorCount, pinecone } from "../../utils/pinecone";
import mongoose from 'mongoose';
import logger from "../../utils/loggers";
import { markAnalysisAsNotNew } from "../../utils/helper-functions";
import { PINECONE_INDEX_NAME, MAX_TOP_K } from "../../utils/consts";
import { getFirebaseEmailFromUID } from "../../utils/firebase";


export const searchRouter = Router();

// Tiny in-memory TTL cache for hot items
type CacheEntry<T> = { value: T; expiresAt: number };
const ttlCache = new Map<string, CacheEntry<any>>();
const setCache = <T>(key: string, value: T, ttlMs: number) => {
  ttlCache.set(key, { value, expiresAt: Date.now() + ttlMs });
};
const getCache = <T>(key: string): T | null => {
  const entry = ttlCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    ttlCache.delete(key);
    return null;
  }
  return entry.value as T;
};

searchRouter.get("/:jobId", authenticate, async (req: any, res: any) => {
  try {
    const Id = req.params.jobId;
    if (!mongoose.Types.ObjectId.isValid(Id)) {
      return res.status(400).json({ error: "Invalid job ID format" });
    }
    const memberId = req.user.firebase_id;
    const onlyBookmarked = String(req.query.isBookmarked ?? 'false') === 'true';
    console.log("onlyBookmarked", onlyBookmarked);

    // Pagination params
    const start = parseInt(req.query.start) || 0;
    let limit = parseInt(req.query.limit) || 10;
    console.log("start", start);
    console.log("limit", limit);
    const fetchK = MAX_TOP_K;

    let job;
    try {
      // Cache job object briefly to avoid repeated deserialization
      const cacheKey = `job:${Id}`;
      const cachedJob = getCache<any>(cacheKey);
      if (cachedJob) {
        job = cachedJob;
      } else {
        job = await Job.findById(Id).select({
          _id: 1,
          title: 1,
          organisation_id: 1,
        }).lean();
        if (job) setCache(cacheKey, job, 5_000);
      }
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
    
    const totalCandidatesResponse = await getPineconeVectorCount(PINECONE_INDEX_NAME, "talent-pool-v2", job.organisation_id)
    const totalCandidates = Math.min(50,totalCandidatesResponse);

    // Note: When isBookmarked=true, we now filter by candidates that have been bookmarked by ANY member for this job.
    // The isBookmarked flag in each profile also reflects whether ANY member bookmarked that candidate for this job.

    // 2. If enough analyses, return top 'limit' sorted by percentageMatchScore
    if (jobAnalyses.length >= start + limit) {
      console.log("enough analyses");
      // Get userIds for the top candidates
      const sortedAnalyses = jobAnalyses.sort((a: any, b: any) => (b.data?.percentageMatchScore || 0) - (a.data?.percentageMatchScore || 0));
      const paginatedAnalyses = sortedAnalyses.slice(start, start + limit);
      const userIds = paginatedAnalyses.map((a: any) => a.userId);

      // Fetch user details
      let users = [] as any[];
      try {
        users = await User.find({ _id: { $in: userIds }, organisation_id: job.organisation_id })
          .select({
            _id: 1,
            name: 1,
            email: 1,
            years_of_experience: 1,
            designation: 1,
            firebase_email: 1,
            current_location: 1,
            total_bookmarks: 1,
          })
          .lean();
      } catch (error) {
        logger.error(`[DB] Error finding users: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({ error: "Error retrieving user details" });
      }

      // Fetch bookmarks
      let userBookmarks = [] as any[];
      try {
        userBookmarks = await Bookmark.find({ userId: { $in: userIds }, jobId: Id })
          .select({ _id: 1, userId: 1, memberId: 1, jobId: 1 })
          .lean();
      } catch (error) {
        logger.error(`[DB] Error finding bookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({ error: "Error retrieving bookmark details" });
      }

      // Build a cache of memberId (UID) -> email for all bookmarkers in this result set
      const uniqueMemberIds = Array.from(new Set(userBookmarks.map((b: any) => b.memberId)));
      const memberIdToEmail = new Map<string, string>();
      await Promise.all(uniqueMemberIds.map(async (uid: string) => {
        try {
          const email = await getFirebaseEmailFromUID(uid);
          memberIdToEmail.set(uid, email ?? uid);
        } catch (error) {
          logger.warn(`[FIREBASE] Failed to resolve email for uid ${uid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          memberIdToEmail.set(uid, uid);
        }
      }));

      // Prepare userProfiles
      let userProfiles = await Promise.all(users.map(async (user) => {
        const anyBookmarkForUser = userBookmarks.find((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.jobId === Id);
        const myBookmark = userBookmarks.find((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.memberId === memberId && bookmark.jobId === Id);
        const analysis = paginatedAnalyses.find((a: any) => a.userId === user._id.toString());
        let isNewlyAnalysed = false;
        if (analysis?.newlyAnalysed) {
          isNewlyAnalysed = true;
          await markAnalysisAsNotNew(job._id.toString(), user._id.toString());
        }
        const bookmarkedByUids = userBookmarks
          .filter((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.jobId === Id)
          .map((bookmark: any) => bookmark.memberId);
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
          totalBookmarks: user.total_bookmarks,
          bookmarkedBy: bookmarkedByUids.map((uid: string) => memberIdToEmail.get(uid) ?? uid),
          analysis: analysis?.data,
          isNewlyAnalysed,
        };
      }));

      if (onlyBookmarked) {
        userProfiles = userProfiles.filter((p: any) => p.isBookmarked === true);
      }

      const finalResponse = {
        jobTitle: job.title,
        jobId: job._id,
        start: start,
        limit: limit,
        totalCandidates: totalCandidates,
        data: userProfiles,
      };
      logger.info(`[RESPONSE] Successfully prepared response with ${userProfiles.length} profiles (from analyses only)`);
      return res.status(200).json(finalResponse);
    }

    // 3. Not enough analyses, fetch more candidates from Pinecone
    // Fetch job embedding
      let jobEmbedding: number[] | undefined;
      try {
        const cacheKey = `jobEmbedding:${Id}`;
        const cached = getCache<number[]>(cacheKey);
        if (cached) {
          jobEmbedding = cached;
        } else {
          const jobEmbeddingResponse = await pinecone
            .index(PINECONE_INDEX_NAME)
            .namespace("job-pool-v2")
            .fetch([Id]);
          logger.info(`[PINECONE] Successfully fetched job embedding for job ${Id}`);
          jobEmbedding = jobEmbeddingResponse.records[Id]?.values as number[] | undefined;
          if (!jobEmbedding) {
            logger.error(`[PINECONE] Job embedding not found for job ${Id}`);
            return res.status(404).json({ error: "Job embedding not found" });
          }
          setCache(cacheKey, jobEmbedding, 10_000);
        }
      } catch (error) {
        logger.error(`[PINECONE] Error fetching job embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return res.status(500).json({ error: "Error fetching job embedding" });
      }

    // Query for matching candidates
    let topMatches;
    try {
      topMatches = await pinecone.index(PINECONE_INDEX_NAME).namespace("talent-pool-v2").query({
        filter: {
          organisation_id: job.organisation_id,
        },
        vector: jobEmbedding,
        topK: fetchK,
        includeMetadata: true,
        includeValues: false,
      });
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
    let allAnalyses = [] as any[];
    try {
      allAnalyses = await JobAnalysisOfCandidate.find({ jobId: Id })
        .select({ userId: 1, data: 1 })
        .lean();
    } catch (error) {
      logger.error(`[DB] Error re-fetching job analyses: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving job analyses after update" });
    }

    // Sort and paginate
    const sortedAnalyses = allAnalyses.sort((a: any, b: any) => (b.data?.percentageMatchScore || 0) - (a.data?.percentageMatchScore || 0));
    const paginatedAnalyses = sortedAnalyses.slice(start, start + limit);
    const userIds = paginatedAnalyses.map((a: any) => a.userId);

    // Fetch user details
    let users = [] as any[];
    try {
      users = await User.find({ _id: { $in: userIds }, organisation_id: job.organisation_id })
        .select({
          _id: 1,
          name: 1,
          email: 1,
          years_of_experience: 1,
          designation: 1,
          firebase_email: 1,
          current_location: 1,
          total_bookmarks: 1,
        })
        .lean();
    } catch (error) {
      logger.error(`[DB] Error finding users: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving user details" });
    }

    // Fetch bookmarks
    let userBookmarks = [] as any[];
    try {
      userBookmarks = await Bookmark.find({ userId: { $in: userIds }, jobId: Id })
        .select({ _id: 1, userId: 1, memberId: 1, jobId: 1 })
        .lean();
    } catch (error) {
      logger.error(`[DB] Error finding bookmarks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return res.status(500).json({ error: "Error retrieving bookmark details" });
    }

    // Build a cache of memberId (UID) -> email for all bookmarkers in this result set
    const uniqueMemberIds = Array.from(new Set(userBookmarks.map((b: any) => b.memberId)));
    const memberIdToEmail = new Map<string, string>();
    await Promise.all(uniqueMemberIds.map(async (uid: string) => {
      try {
        const email = await getFirebaseEmailFromUID(uid);
        memberIdToEmail.set(uid, email ?? uid);
      } catch (error) {
        logger.warn(`[FIREBASE] Failed to resolve email for uid ${uid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        memberIdToEmail.set(uid, uid);
      }
    }));

    // Prepare userProfiles
    let userProfiles = await Promise.all(users.map(async (user) => {
      const anyBookmarkForUser = userBookmarks.find((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.jobId === Id);
      const myBookmark = userBookmarks.find((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.memberId === memberId && bookmark.jobId === Id);
      const analysis = paginatedAnalyses.find((a: any) => a.userId === user._id.toString());
      let isNewlyAnalysed = false;
      if (analysis?.newlyAnalysed) {
        isNewlyAnalysed = true;
        await markAnalysisAsNotNew(job._id.toString(), user._id.toString());
      }
      const bookmarkedByUids = userBookmarks
        .filter((bookmark: any) => bookmark.userId === user._id.toString() && bookmark.jobId === Id)
        .map((bookmark: any) => bookmark.memberId);
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
        totalBookmarks: user.total_bookmarks,
        bookmarkedBy: bookmarkedByUids.map((uid: string) => memberIdToEmail.get(uid) ?? uid),
        analysis: analysis?.data,
        isNewlyAnalysed,
      };
    }));

    if (onlyBookmarked) {
      userProfiles = userProfiles.filter((p: any) => p.isBookmarked === true);
    }

    const finalResponse = {
      jobTitle: job.title,
      jobId: job._id,
      start: start,
      limit: limit,
      totalCandidates: totalCandidates,
      data: userProfiles.sort((a: any, b: any) => (b.analysis?.percentageMatchScore || 0) - (a.analysis?.percentageMatchScore || 0)),
    };

    
    logger.info(`[RESPONSE] Successfully prepared response with ${userProfiles.length} profiles (after new analyses)`);
    return res.status(200).json(finalResponse);
  } catch (error) {
    console.error("Unexpected error in search route:", error);
    return res.status(500).json({ error: "An unexpected error occurred" });
  }
});

export default searchRouter;