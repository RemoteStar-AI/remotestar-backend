import { Router } from "express";
export const jobRouter = Router();
import { z } from "zod";
import { Job } from "../../utils/db";

export const jobSchema = z.object({
  _id: z.string().optional(),
  companyId: z.string(),
  title: z.string(),
  description: z.string(),
  location: z.string(),
  jobType: z.enum(["full-time", "part-time", "contract", "internship"]),
  salaryFrequency: z.enum(["yearly", "monthly", "hourly"]),
  salary: z.string().optional(),
  useRanges: z.boolean(),
  minSalary: z.string().optional(),
  maxSalary: z.string().optional(),
  applicationProcess: z.enum(["interview", "assessment", "direct"]),
  formLink: z.string().optional(),
  automatedCommunications: z.boolean(),
  autoDirectToApply: z.boolean(),
  yearsOfExperience: z.object({
    min: z.string(),
    max: z.string(),
  }),
  additionalRequirements: z.string().optional(),
  createdAt: z.string().or(z.date()).optional(),
});

const deleteJobSchema = z.object({
  _id: z.string(),
});

jobRouter.get("/", async (req, res) => {
  const params = req.query;
  const { companyId } = params;
  try {
    const response = await Job.find({ companyId });
    if (!response) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    res.status(200).json({
      message: "Jobs fetched successfully",
      data: response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

jobRouter.post("/", async (req, res) => {
  try {
    const body = req.body;
    const parsedBody = jobSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.format() });
      return;
    }
    const response = await Job.create(parsedBody.data);
    if (!response) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    res.status(201).json({
      message: "Job created successfully",
      data: response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

jobRouter.put("/", async (req, res) => {
  try {
    const body = req.body;
    const parsedBody = jobSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.format() });
      return;
    }
    const { _id, ...rest } = parsedBody.data;
    const response = await Job.findByIdAndUpdate(_id, rest, { new: true });
    if (!response) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    res.status(200).json({
      message: "Job updated successfully",
      data: response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

jobRouter.delete("/", async (req, res) => {
  try {
    const data = req.body;
    const parsedBody = deleteJobSchema.safeParse(data);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.format() });
      return;
    }
    const { _id } = parsedBody.data;
    const response = await Job.findByIdAndDelete(_id);
    if (!response) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    res.status(200).json({
      message: "Job deleted successfully",
      data: response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
