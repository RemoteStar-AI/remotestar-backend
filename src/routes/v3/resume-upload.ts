import { Router } from "express";

const resumeUploadRouter = Router();

resumeUploadRouter.post("/", (req, res) => {
  const { resume } = req.body;
  console.log(resume);
  res.status(200).json({ message: "Resume uploaded successfully" });
});

export default resumeUploadRouter;