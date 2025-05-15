import { Router } from "express";
import { Bookmark, Job, User } from "../../utils/db";
import { bookmarkSchema } from "../../utils/schema";
import mongoose from "mongoose";

export const bookmarksRouter = Router();

bookmarksRouter.get("/:companyId", async (req, res) => {
  try {
    const { companyId } = req.params;
    const bookmarks = await Bookmark.find({ companyId });
    res.status(200).json(bookmarks);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});

bookmarksRouter.post("/", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const body = req.body;
    const parsedBody = bookmarkSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const jobId = req.body.jobId;
    const memberId = req.body.memberId;
    const userId = req.body.userId;
    const job = await Job.findById(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const user = await User.findById(parsedBody.data.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const companyId = job.companyId;
    const bookmarkData = {
      userId,
      companyId,
      jobId,
      memberId,
    };
    const [bookmark] = await Bookmark.create([bookmarkData], { session });
    await User.findByIdAndUpdate(user._id, { $inc: { total_bookmarks: 1 } }, { session });
    await session.commitTransaction();
    res.status(200).json(bookmark);
  } catch (e) {
    console.error(e);
    await session.abortTransaction();
    res.status(500).json({ error: "Internal Server Error" });
    return;
  } finally {
    await session.endSession();
  }
});

bookmarksRouter.delete("/:id", async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const { id } = req.params;
    const bookmark = await Bookmark.findByIdAndDelete(id, { session });
    if (!bookmark) {
      res.status(404).json({ error: "Bookmark not found" });
      return;
    }
    await User.findByIdAndUpdate(bookmark.userId, { $inc: { total_bookmarks: -1 } }, { session });
    await session.commitTransaction();
    res.status(200).json(bookmark);
  } catch (e) {
    console.error(e);
    await session.abortTransaction();
    res.status(500).json({ error: "Internal Server Error" });
    return;
  } finally {
    await session.endSession();
  }
});
