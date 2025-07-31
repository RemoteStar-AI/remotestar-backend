import { Router } from "express";
import { Bookmark, JobAnalysisOfCandidate, User, CulturalFit, Skills } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import { analyseJdWithCv } from "../../utils/helper-functions";
import { deleteFileFromS3, getSignedUrlForResume } from "../../utils/s3";
import mongoose from "mongoose";
import logger from "../../utils/loggers";

export const userRouter = Router();

userRouter.get("/:jobId/:userId", authenticate, async (req: any, res: any) => {
  const { jobId, userId } = req.params;
  const memberId = req.user?.firebase_id;

  if (!req.user || !memberId) {
    logger.warn(`[GET_USER] Unauthorized access attempt.`);
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = await User.findById(userId);
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
      Skills.find({ userId: userId }),
      CulturalFit.find({ userId: userId }),
      Bookmark.find({ userId: userId })
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