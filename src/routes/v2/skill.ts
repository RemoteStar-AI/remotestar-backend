import { Router } from "express";
import { Skills } from "../../utils/db";
const skillRouter = Router();

skillRouter.get("/:userId", async (req, res) => {
  const userId = req.params.userId;
  const skills = await Skills.find({ userId });
  res.json(skills);
});

export { skillRouter };
