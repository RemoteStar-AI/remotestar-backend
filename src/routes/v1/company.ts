import { Router } from "express";
export const companyRouter = Router();
import { z } from "zod";
import { Company } from "../../utils/db";
import { Job } from "../../utils/db";
import mongoose from "mongoose";
import { authenticate } from "../../middleware/firebase-auth";

const companySchema = z.object({
  _id: z.string().optional(),
  name: z.string().min(1).max(255),
  website: z.string(),
  organisation_id: z.string().optional(),
});

companyRouter.get("/", async (req, res) => {
  try {
    const response = await Company.find();
    if (!response) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    res.status(200).json({
      message: "Companies fetched successfully",
      data: response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

companyRouter.get("/:organisation_id", async (req, res) => {
 const organisation_id = req.params.organisation_id;
 const company = await Company.find({ organisation_id: organisation_id });
 res.status(200).json({ message: "Company fetched successfully", data: company });
});

companyRouter.post("/", async (req, res) => {
  try {
    const body = req.body;
    const parsedBody = companySchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.format() });
      return;
    }
    const { name, website, organisation_id } = parsedBody.data;
    const response = await Company.create({
      name,
      website,
      organisation_id,
    });
    if (!response) {
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
    res.status(201).json({
      message: "Company created successfully",
      data: response,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

companyRouter.put("/", async (req, res) => {
  const body = req.body;
  const parsedBody = companySchema.safeParse(body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.format() });
    return;
  }
  const { _id, name, website } = parsedBody.data;
  const response = await Company.findByIdAndUpdate(
    _id,
    {
      name,
      website,
    },
    { new: true }
  );
  if (!response) {
    res.status(500).json({ error: "Internal Server Error" });
    return;
  }
  res.status(200).json({
    message: "Company updated successfully",
    data: response,
  });
});

companyRouter.delete("/", async (req, res) => {
  const body = req.body;
  const parsedBody = companySchema.safeParse(body);

  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.format() });
    return;
  }

  const { _id } = parsedBody.data;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      // Delete the company within the transaction
      const companyResponse = await Company.findByIdAndDelete(_id, { session });

      if (!companyResponse) {
        // If the company isn't found, throw an error to abort the transaction.
        throw new Error("Company not found");
      }

      // Delete all jobs associated with the company within the same transaction
      await Job.deleteMany({ companyId: _id }, { session });
    });

    // If the transaction succeeded, send a success response.
    res.status(200).json({
      message: "Company and its related jobs deleted successfully",
      data: _id,
    });
  } catch (error) {
    // If any error occurs during the transaction, it will be rolled back.
    res.status(500).json({
      error: error || "Internal Server Error",
    });
  } finally {
    session.endSession();
  }
});
