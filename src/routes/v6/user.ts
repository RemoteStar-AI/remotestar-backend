import { Router } from "express";
import { Bookmark, JobAnalysisOfCandidate, User, CulturalFit, Skills } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import { analyseJdWithCv } from "../../utils/helper-functions";
import { deleteFileFromS3 } from "../../utils/s3";
import mongoose from "mongoose";
import logger from "../../utils/loggers";

export const userRouter = Router();

userRouter.get("/:jobId/:userId", authenticate, async (req: any, res: any) => {
  const { jobId, userId } = req.params;
  const memberId = req.user.firebase_id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`[GET_USER] User not found for ID: ${userId}`);
      return res.status(404).json({ error: "User not found" });
    }

    let userAnalysis = await JobAnalysisOfCandidate.findOne({
      jobId: jobId,
      userId: userId,
    });
    
    if (!userAnalysis) {
        logger.info(`[GET_USER] No existing analysis found for user ${userId} and job ${jobId}. Generating new one.`);
        await analyseJdWithCv(jobId, userId);
        userAnalysis = await JobAnalysisOfCandidate.findOne({
            jobId: jobId,
            userId: userId,
        });
    }

    const [userSkills, userCulturalFit, userBookmarks] = await Promise.all([
        Skills.find({ userId: userId }),
        CulturalFit.find({ userId: userId }),
        Bookmark.find({ userId: userId })
    ]);

    const userProfile = {
      ...user.toObject(),
      isBookmarked: userBookmarks.some(
        (bookmark: any) => bookmark.memberId === memberId
      ),
      analysis: userAnalysis ? userAnalysis.data : {},
      bookmarkedBy: userBookmarks
        .filter((bookmark: any) => bookmark.memberId === memberId)
        .map((bookmark: any) => bookmark.userId),
      skills: userSkills.map((skill: any) => skill.skills),
      culturalFit: userCulturalFit.map((fit: any) => fit.culturalFit),
    };

    logger.info(`[GET_USER] Successfully fetched profile for user: ${userId}`);
    return res.status(200).json(userProfile);

  } catch (error) {
    logger.error(`[GET_USER] Error fetching user profile for user ${userId} and job ${jobId}:`, error);
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

    if (user.resume_url) {
      logger.info(`[DELETE_USER] Deleting resume from S3 for user ${id}.`);
      await deleteFileFromS3(user.resume_url);
    }

    await session.commitTransaction();
    logger.info(`[DELETE_USER] Successfully deleted user ${id}.`);
    return res.status(200).json({ message: "User deleted successfully" });

  } catch (error) {
    await session.abortTransaction();
    logger.error(`[DELETE_USER] Error deleting user ${id}:`, error);
    return res.status(500).json({ error: "Internal Server Error" });
  } finally {
    session.endSession();
  }
});