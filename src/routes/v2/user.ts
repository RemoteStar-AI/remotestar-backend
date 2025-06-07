import { Router } from "express";
export const userRouter = Router();
import { authenticate } from "../../middleware/firebase-auth";
import {User, Skills, CulturalFit} from "../../utils/db";
import { getSignedUrlForResume } from "../../utils/s3";
import mongoose from "mongoose";
import { deleteFileFromS3 } from "../../utils/s3";

userRouter.get("/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    const skills = await Skills.find({ userId: id });
    const culturalFit = await CulturalFit.find({ userId: id });
    const link = user?.resume_url;
    const uploader_name = user?.firebase_uploader_name;
    let signed_url: string | null = null;
    if (link !="https://conasems-ava-prod.s3.sa-east-1.amazonaws.com/aulas/ava/dummy-1641923583.pdf") {
      // Extract key from the full S3 URL
      const key = link!.split(".amazonaws.com/")[1];
      if (key) {
        signed_url = await getSignedUrlForResume(key);
      }
    }
    else {
      signed_url = link;
    }

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    } else {
      res.status(200).json({ user, skills, culturalFit, link: signed_url, uploader_name });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


userRouter.delete("/:id", authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const id = req.params.id;
    const user = await User.findByIdAndDelete(id, { session });
    if (!user) {
      await session.abortTransaction();
      res.status(404).json({ error: "User not found" });
      return;
    }
    await Skills.deleteMany({ userId: id }, { session });
    await CulturalFit.deleteMany({ userId: id }, { session });
    await session.commitTransaction();
    // Delete resume from S3 if present (not atomic, but after DB commit)
    if (user.resume_url) {
      try {
        await deleteFileFromS3(user.resume_url);
      } catch (e) {
        console.error("Failed to delete resume from S3:", e);
      }
    }
    res.status(200).json({ message: "User deleted successfully" });
  } catch (e) {
    await session.abortTransaction();
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    await session.endSession();
  }
});