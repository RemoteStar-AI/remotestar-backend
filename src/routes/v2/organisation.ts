import { Router } from "express";
import { organisationSchema } from "../../utils/schema";
import { Organisation } from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
const organisationRouter = Router();
import { z } from "zod";

const addOrRemoveMemberSchema = z.object({
  email: z.array(z.string().email()),
});

organisationRouter.get("/:id", authenticate, async (req, res) => {
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

organisationRouter.get("/", authenticate, async (req, res) => {
  const userEmail = req.user!.email;
  const organisation = await Organisation.find({ members: { $in: [userEmail] } });
  const orgs = organisation.map(org => ({
    organisation_id: org._id,
    name: org.name
  }));
  res.status(200).json({ message: "Organisations found", organisations: orgs });
});

organisationRouter.post("/", authenticate, async (req, res) => {
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

organisationRouter.post("/:id/add", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const parsedBody = addOrRemoveMemberSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Invalid add member data", errors: parsedBody.error.errors });
      return;
    }
    const userEmail = req.user!.email;
    console.log("Requesting user:", userEmail);
    const organisation = await Organisation.findById(id);
    if (!organisation) {
      res.status(404).json({ message: "Organisation not found" });
      return;
    }
    console.log("Organisation admins:", organisation.admin);
    // Normalize email addresses for comparison
    const normalizedUserEmail = userEmail!.toLowerCase().trim();
    const normalizedAdminList = organisation.admin.map(email => email.toLowerCase().trim());
    if (!normalizedAdminList.includes(normalizedUserEmail)) {
      console.log("User not found in admin list");
      res.status(403).json({ 
        message: "You are not authorized to add members to this organisation",
        requestingUser: userEmail,
        adminList: organisation.admin,
        normalizedUserEmail: normalizedUserEmail,
        normalizedAdminList: normalizedAdminList
      });
      return;
    }
    if(parsedBody.data.email.includes(userEmail!)) {
      res.status(403).json({ message: "You cannot add yourself as a member" });
      return;
    }
    const existingMembers = parsedBody.data.email.filter(email => 
      organisation.members.map(m => m.toLowerCase().trim()).includes(email.toLowerCase().trim())
    );
    if(existingMembers.length === parsedBody.data.email.length) {
      console.log("All emails are already members of this organisation");
      res.status(400).json({ 
        message: "All emails are already members of this organisation",
        existingMembers
      });
      return;
    }
    // Filter out existing members and add only unique ones
    const newMembers = parsedBody.data.email.filter(email => 
      !organisation.members.map(m => m.toLowerCase().trim()).includes(email.toLowerCase().trim())
    );
    organisation.members.push(...newMembers);
    await organisation.save();
    res.status(200).json({ message: "Member added to organisation successfully", organisation });
  } catch (error) {
    console.error("Error adding member to organisation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

organisationRouter.post("/:id/remove", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const parsedBody = addOrRemoveMemberSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Invalid remove member data", errors: parsedBody.error.errors });
      return;
    }
    const userEmail = req.user!.email;
    const organisation = await Organisation.findById(id);
    if (!organisation) {
      res.status(404).json({ message: "Organisation not found" });
      return;
    }
    // Normalize email addresses for comparison
    const normalizedUserEmail = userEmail!.toLowerCase().trim();
    const normalizedAdminList = organisation.admin.map(email => email.toLowerCase().trim());
    if (!normalizedAdminList.includes(normalizedUserEmail)) {
      res.status(403).json({ 
        message: "You are not authorized to remove members from this organisation",
        requestingUser: userEmail,
        adminList: organisation.admin,
        normalizedUserEmail: normalizedUserEmail,
        normalizedAdminList: normalizedAdminList
      });
      return;
    }
    // Remove specified emails from members array
    organisation.members = organisation.members.filter(memberEmail => {
      const normalizedMemberEmail = memberEmail.toLowerCase().trim();
      return !parsedBody.data.email.map(e => e.toLowerCase().trim()).includes(normalizedMemberEmail);
    });
    await organisation.save();
    res.status(200).json({ message: "Member(s) removed from organisation successfully", organisation });
  } catch (error) {
    console.error("Error removing member from organisation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

organisationRouter.post("/:id/admin/add", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const parsedBody = addOrRemoveMemberSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Invalid add admin data", errors: parsedBody.error.errors });
      return;
    }
    const userEmail = req.user!.email;
    const organisation = await Organisation.findById(id);
    if (!organisation) {
      res.status(404).json({ message: "Organisation not found" });
      return;
    }
    const normalizedUserEmail = userEmail!.toLowerCase().trim();
    const normalizedAdminList = organisation.admin.map(email => email.toLowerCase().trim());
    if (!normalizedAdminList.includes(normalizedUserEmail)) {
      res.status(403).json({ 
        message: "You are not authorized to add admins to this organisation",
        requestingUser: userEmail,
        adminList: organisation.admin,
        normalizedUserEmail: normalizedUserEmail,
        normalizedAdminList: normalizedAdminList
      });
      return;
    }
    // Prevent adding self as admin
    const normalizedRequestEmails = parsedBody.data.email.map(email => email.toLowerCase().trim());
    if (normalizedRequestEmails.includes(normalizedUserEmail)) {
      res.status(403).json({ message: "You cannot add yourself as an admin" });
      return;
    }
    // Filter out emails that are already admins
    const existingAdmins = normalizedRequestEmails.filter(email =>
      normalizedAdminList.includes(email)
    );
    if (existingAdmins.length > 0) {
      res.status(400).json({ 
        message: "Some emails are already admins of this organisation",
        existingAdmins
      });
      return;
    }
    // Add only unique new admins and also add to members if not present
    const normalizedMemberList = organisation.members.map(email => email.toLowerCase().trim());
    normalizedRequestEmails.forEach(email => {
      if (!normalizedAdminList.includes(email)) {
        organisation.admin.push(email);
      }
      if (!normalizedMemberList.includes(email)) {
        organisation.members.push(email);
      }
    });
    await organisation.save();
    res.status(200).json({ message: "Admin added to organisation successfully", organisation });
  } catch (error) {
    console.error("Error adding admin to organisation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

organisationRouter.post("/:id/admin/remove", authenticate, async (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body;
    const parsedBody = addOrRemoveMemberSchema.safeParse(body);
    if (!parsedBody.success) {
      res.status(400).json({ message: "Invalid remove admin data", errors: parsedBody.error.errors });
      return;
    }
    const userEmail = req.user!.email;
    const organisation = await Organisation.findById(id);
    if (!organisation) {
      res.status(404).json({ message: "Organisation not found" });
      return;
    }
    const normalizedUserEmail = userEmail!.toLowerCase().trim();
    const normalizedAdminList = organisation.admin.map(email => email.toLowerCase().trim());
    if (!normalizedAdminList.includes(normalizedUserEmail)) {
      res.status(403).json({ 
        message: "You are not authorized to remove admins from this organisation",
        requestingUser: userEmail,
        adminList: organisation.admin,
        normalizedUserEmail: normalizedUserEmail,
        normalizedAdminList: normalizedAdminList
      });
      return;
    }
    parsedBody.data.email.forEach(email => {
      organisation.admin = organisation.admin.filter(adminEmail => adminEmail !== email);
    });
    await organisation.save();
    res.status(200).json({ message: "Admin removed from organisation successfully", organisation });
  } catch (error) {
    console.error("Error removing admin from organisation:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

organisationRouter.delete("/:id", authenticate, async (req, res) => {
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

export { organisationRouter };