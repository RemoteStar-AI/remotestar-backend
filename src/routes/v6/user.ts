import { Router, text } from "express";
import { Bookmark, JobAnalysisOfCandidate, User, CulturalFit, Skills } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import { analyseJdWithCv } from "../../utils/helper-functions";
import { deleteFileFromS3, getSignedUrlForResume } from "../../utils/s3";
import mongoose from "mongoose";
import logger from "../../utils/loggers";
import { z } from "zod";

export const userRouter = Router();

userRouter.get("/:jobId/:userId", authenticate, async (req: any, res: any) => {
  const { jobId, userId } = req.params;
  const memberId = req.user?.firebase_id;

  if (!req.user || !memberId) {
    logger.warn(`[GET_USER] Unauthorized access attempt.`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await User.findById(userId)
      .select({
        _id: 1,
        name: 1,
        email: 1,
        years_of_experience: 1,
        designation: 1,
        firebase_email: 1,
        current_location: 1,
        total_bookmarks: 1,
        resume_url: 1,
        organisation_id: 1,
        createdAt: 1,
        updatedAt: 1,
      });
    if (!user) {
      logger.warn(`[GET_USER] User not found for ID: ${userId}`);
      return res.status(404).json({ error: "User not found" });
    }
    //testing
    let userAnalysis = await JobAnalysisOfCandidate.findOne({
      jobId: jobId,
      userId: userId,
    });

    let warning: string | undefined = undefined;
    if (!userAnalysis) {
      logger.info(`[GET_USER] No existing analysis found for user ${userId} and job ${jobId}. Generating new one.`);
      try {
        await analyseJdWithCv(jobId, userId);
        userAnalysis = await JobAnalysisOfCandidate.findOne({
          jobId: jobId,
          userId: userId,
        });
      } catch (error: any) {
        logger.error(`[GET_USER] Error analyzing JD with CV for user ${userId} and job ${jobId}:`, error);
        warning = "Failed to fetch resume for analysis. Please re-upload your resume or try again later.";
      }
    }

    const [userSkills, userCulturalFit, userBookmarks] = await Promise.all([
      Skills.find({ userId: userId }).select({ skills: 1, userId: 1 }).lean(),
      CulturalFit.find({ userId: userId }).select({ userId: 1, product_score: 1, service_score: 1, startup_score: 1, mnc_score: 1, loyalty_score: 1, coding_score: 1, leadership_score: 1, architecture_score: 1 }).lean(),
      Bookmark.find({ userId: userId }).select({ _id: 1, userId: 1, memberId: 1 }).lean()
    ]);

    if (user.resume_url) {
      user.resume_url = await getSignedUrlForResume(user.resume_url);
    }

    const userProfile: any = {
      ...user.toObject(),
      isBookmarked: userBookmarks.some(
        (bookmark: any) => bookmark.memberId === memberId
      ),
      analysis: userAnalysis ? userAnalysis.data : {},
      bookmarkedBy: userBookmarks
        .filter((bookmark: any) => bookmark.memberId === memberId)
        .map((bookmark: any) => bookmark.userId),
      skills: userSkills.map((skill: any) => skill.skills)
    };
    if (warning) {
      userProfile.warning = warning;
    }

    logger.info(`[GET_USER] Successfully fetched profile for user: ${userId}`);
    return res.status(200).json(userProfile);

  } catch (error: any) {
    logger.error(`[GET_USER] Error fetching user profile for user ${userId} and job ${jobId}:`, error?.stack || error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

userRouter.delete("/:id", authenticate, async (req: any, res: any) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const id = req.params.id;

  try {
    const user = await User.findById(id).session(session);
    if (!user) {
      await session.abortTransaction();
      logger.warn(`[DELETE_USER] User not found for ID: ${id}`);
      return res.status(404).json({ error: "User not found" });
    }

    logger.info(`[DELETE_USER] Deleting user ${id} and all related data.`);
    await Promise.all([
      User.findByIdAndDelete(id).session(session),
      Skills.deleteMany({ userId: id }).session(session),
      CulturalFit.deleteMany({ userId: id }).session(session),
      Bookmark.deleteMany({ userId: id }).session(session),
      JobAnalysisOfCandidate.deleteMany({ userId: id }).session(session),
    ]);

    await session.commitTransaction();

    if (user.resume_url) {
      try {
        logger.info(`[DELETE_USER] Deleting resume from S3 for user ${id}.`);
        await deleteFileFromS3(user.resume_url);
      } catch (s3Error) {
        logger.error(`[DELETE_USER] Failed to delete resume from S3 for user ${id}:`, s3Error);
        // Not throwing, as DB transaction is already committed
      }
    }

    logger.info(`[DELETE_USER] Successfully deleted user ${id}.`);
    return res.status(200).json({ message: "User deleted successfully" });

  } catch (error: any) {
    await session.abortTransaction();
    logger.error(`[DELETE_USER] Error deleting user ${id}:`, error?.stack || error);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    await session.endSession();
  }
});

userRouter.post("/fuzzy-search", authenticate, async (req: any, res: any) => {
  const body = req.body;
  const parsed = z.object({ text: z.string().min(2), limit: z.number().int().min(1).max(50).optional() }).safeParse(body);
  if (!parsed.success) {
    return res.status(400).json({ error: "'text' is required (min 2 chars)" });
  }

  const escapeRegex = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const textRaw = parsed.data.text.trim();
  if (!textRaw) {
    return res.status(400).json({ error: "'text' is required (min 2 chars)" });
  }

  // Scope by organisation for performance (middleware sets req.user.organisation)
  const organisationId = req.user?.organisation ?? req.user?.organisation_id ?? "";

  const safe = escapeRegex(textRaw);
  const ciRegex = new RegExp(safe, "i");

  const orConditions: any[] = [
    { name: { $regex: ciRegex } },
    { email: { $regex: ciRegex } },
    { designation: { $regex: ciRegex } },
    { current_location: { $regex: ciRegex } },
  ];

  const asNumber = Number(textRaw);
  if (!Number.isNaN(asNumber)) {
    // Avoid regex on numeric field; exact match is fast
    orConditions.push({ years_of_experience: asNumber });
  }

  const query: any = { $or: orConditions, organisation_id: organisationId };

  const users = await User.find(query)
    .select({
      _id: 1,
      name: 1,
      email: 1,
      designation: 1,
      current_location: 1,
      years_of_experience: 1,
      organisation_id: 1,
      total_bookmarks: 1,
      createdAt: 1,
    })
    .limit(parsed.data.limit ?? 20)
    .lean();

  return res.status(200).json(users);
});