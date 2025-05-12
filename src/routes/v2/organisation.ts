import { Router } from "express";
import { organisationSchema } from "../../utils/schema";
import { Organisation } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
const OrganisationRouter = Router();
import { z } from "zod";

const addMemberSchema = z.object({
  email: z.string().email(),
});

OrganisationRouter.get("/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const organisation = await Organisation.findById(id);
    if (!organisation) {
    res.status(404).json({ message: "Organisation not found" });
    return;
    }
    res.status(200).json({ message: "Organisation found", organisation });
  } catch (error) {
    console.error("Error getting organisation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

OrganisationRouter.post("/", authenticate, async (req, res) => {
  const body = req.body;
  const parsedBody = organisationSchema.safeParse(body);
  if (!parsedBody.success) {
    res.status(400).json({ message: "Invalid organisation data", errors: parsedBody.error.errors });
    return;
  }
  const userEmail = req.user!.email;
  const payload = {
    ...parsedBody.data,
    admin: [userEmail],
    members: [userEmail],
  };
  const organisation = new Organisation(payload);
  await organisation.save();
  res.status(200).json({ message: "Organisation created successfully", organisation });
});

OrganisationRouter.post("/:id/add", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const parsedBody = addMemberSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Invalid add member data", errors: parsedBody.error.errors });
      return;
    }
    const userEmail = req.user!.email;
    const organisation = await Organisation.findById(id);
    if (!organisation) {
      res.status(404).json({ message: "Organisation not found" });
      return;
    }
    if (!organisation.admin.includes(userEmail!)) {
      res.status(403).json({ message: "You are not authorized to add members to this organisation" });
      return;
    }
    organisation.members.push(parsedBody.data.email);
    await organisation.save();
    res.status(200).json({ message: "Member added to organisation successfully", organisation });
  } catch (error) {
    console.error("Error adding member to organisation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

OrganisationRouter.delete("/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const userEmail = req.user!.email;
    const organisation = await Organisation.findById(id);
    if (!organisation) {
      res.status(404).json({ message: "Organisation not found" });
      return;
    }
    if (!organisation.admin.includes(userEmail!)) {
      res.status(403).json({ message: "You are not authorized to delete this organisation" });
      return;
    }
    await Organisation.findByIdAndDelete(id);
    res.status(200).json({ message: "Organisation deleted successfully" });
  } catch (error) {
    console.error("Error deleting organisation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

export default OrganisationRouter;