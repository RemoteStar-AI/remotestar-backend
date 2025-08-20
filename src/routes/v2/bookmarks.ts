import { Router } from "express";
import { Bookmark, Job, User } from "../../utils/db";
import { bookmarkSchema } from "../../utils/schema";
import mongoose from "mongoose";
import { authenticate } from "../../middleware/firebase-auth";
export const bookmarksRouter = Router();

bookmarksRouter.get("/:companyId", authenticate, async (req, res) => {
  const { companyId } = req.params;
  console.log(`[GET /bookmarks/${companyId}] Getting bookmarks for company`);
  try {
    const bookmarks = await Bookmark.find({ companyId });
    console.log(`[GET /bookmarks/${companyId}] Found ${bookmarks.length} bookmarks`);
    res.status(200).json(bookmarks);
  } catch (error) {
    console.error(`[GET /bookmarks/${companyId}] Error fetching bookmarks:`, error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

bookmarksRouter.post("/", authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  console.log("[POST /bookmarks] Starting bookmark creation");
  try {
    session.startTransaction();
    const body = req.body;
    const parsedBody = bookmarkSchema.safeParse(body);
    if (!parsedBody.success) {
      console.warn("[POST /bookmarks] Invalid request body:", parsedBody.error.message);
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }

    const jobId = req.body.jobId;
    const memberId = req.user?.firebase_id;
    const memeberEmail = req.user?.email;
    const userId = req.body.userId;

    // fetch existing bookmark
    try{
      const existingBookmark = await Bookmark.findOne({ userId, jobId });
      if (existingBookmark) {
        console.warn(`[POST /bookmarks] Bookmark already exists for user ${userId} and job ${jobId}`);
        res.status(400).json({ error: "Someone else has already bookmarked this candidate" });
        return;
      }
    } catch (error) {
      console.error(`[POST /bookmarks] Error checking for existing bookmark:`, error);
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }

    console.log(`[POST /bookmarks] Processing bookmark - Job: ${jobId}, User: ${userId}, Member: ${memberId}`);

    const job = await Job.findById(jobId);
    if (!job) {
      console.warn(`[POST /bookmarks] Job not found with ID: ${jobId}`);
      res.status(404).json({ error: "Job not found" });
      return;
    }

    const user = await User.findById(parsedBody.data.userId);
    if (!user) {
      console.warn(`[POST /bookmarks] User not found with ID: ${userId}`);
      res.status(404).json({ error: "User not found" });
      return;
    }

    const companyId = job.companyId;
    const bookmarkData = {
      userId,
      companyId,
      jobId,
      memberId,
      memeberEmail,
    };

    const [bookmark] = await Bookmark.create([bookmarkData], { session });
    await User.findByIdAndUpdate(user._id, { $inc: { total_bookmarks: 1 } }, { session });
    await session.commitTransaction();
    
    console.log(`[POST /bookmarks] Successfully created bookmark: ${bookmark._id}`);
    res.status(200).json(bookmark);
  } catch (error) {
    console.error("[POST /bookmarks] Error creating bookmark:", error);
    await session.abortTransaction();
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    console.log("[POST /bookmarks] Ending session");
    await session.endSession();
  }
});

bookmarksRouter.delete("/:id", authenticate, async (req, res) => {
  const session = await mongoose.startSession();
  const { id } = req.params;
  console.log(`[DELETE /bookmarks/${id}] Starting bookmark deletion`);
  try {
    session.startTransaction();
    const bookmark = await Bookmark.findByIdAndDelete(id, { session });
    
    if (!bookmark) {
      console.warn(`[DELETE /bookmarks/${id}] Bookmark not found`);
      res.status(404).json({ error: "Bookmark not found" });
      return;
    }

    await User.findByIdAndUpdate(bookmark.userId, { $inc: { total_bookmarks: -1 } }, { session });
    await session.commitTransaction();
    
    console.log(`[DELETE /bookmarks/${id}] Successfully deleted bookmark`);
    res.status(200).json(bookmark);
  } catch (error) {
    console.error(`[DELETE /bookmarks/${id}] Error deleting bookmark:`, error);
    await session.abortTransaction();
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    console.log(`[DELETE /bookmarks/${id}] Ending session`);
    await session.endSession();
  }
});
