import { Router } from "express";
import { Bookmark, Job, User } from "../../utils/db";
import { bookmarkSchema } from "../../utils/schema";

export const bookmarksRouter = Router();

bookmarksRouter.get("/", async (req, res) => {
  try {
    const { companyId } = req.query;
    const bookmarks = await Bookmark.find({ companyId });
    res.status(200).json(bookmarks);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});

bookmarksRouter.post("/", async (req, res) => {
  try {
    const body = req.body;
    const parsedBody = bookmarkSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const jobId = req.body.jobId;
    const job = await Job.findById(jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const companyId = job.companyId;
    const bookmark = await Bookmark.create({ ...parsedBody.data, companyId });
    res.status(200).json(bookmark);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});

bookmarksRouter.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const bookmark = await Bookmark.findByIdAndDelete(id);
    if (!bookmark) {
      res.status(404).json({ error: "Bookmark not found" });
      return;
    }
    res.status(200).json(bookmark);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
});
