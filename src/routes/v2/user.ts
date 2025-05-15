import { Router } from "express";
export const userRouter = Router();
import { authenticate } from "../../middleware/firebase-auth";
import {User, Skills, CulturalFit} from "../../utils/db";

userRouter.get("/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    const skills = await Skills.find({ userId: id });
    const culturalFit = await CulturalFit.find({ userId: id });
    const link = user?.resume_url;
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    } else {
      res.status(200).json({ user, skills, culturalFit, link });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal Server Error" });
  }
});