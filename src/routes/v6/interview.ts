import { Router, Request, Response } from "express";
import { Interview, Job } from "../../utils/db";
import { defaultReachoutEmail, sendEmail } from "../../utils/mail";
import { authenticate } from "../../middleware/firebase-auth";
import { createSupportAssistant, updateScriptforAssistant } from "../../utils/vapi";
import { VapiSystemPrompt3 as VapiSystemPrompt, VapiAnalysisPrompt } from "../../utils/prompts";
import { generateVideoUploadPresignedUrl, getVideoChunkSignedUrl } from "../../utils/s3";
import { z } from "zod";
import crypto from "crypto";

export const interviewRouter = Router();
const firstMessage = "Hi this is Riley from RemoteStar. Do you have a couple of minutes to talk?";

interviewRouter.post("/email", async (req: Request, res: Response) => {
  const { name, JobName, interviewLink, toEmail } = req.body;    
  const emailText = defaultReachoutEmail(name, JobName, interviewLink);
  await sendEmail(toEmail, "Interview Scheduled", emailText);
  res.status(200).json({ success: true });
});

interviewRouter.get("/:id", async (req: any, res: any) => {
  try {
    const { id } = req.params;
    
    if(!id){
      console.log("Error: Interview ID is missing in request");
      return res.status(400).json({ success: false, error: "Interview ID is required" });
    }

    console.log(`Fetching interview with ID: ${id}`);
    const interview = await Interview.findOne({interviewLink: id});
    
    if(!interview){
      console.log(`Error: Interview not found with ID: ${id}`);
      return res.status(404).json({ success: false, error: "Interview not found" });
    }

    console.log(`Interview found, fetching job details for jobId: ${interview.jobId}`);
    const job = await Job.findById(interview.jobId);
    
    if(!job){
      console.log(`Warning: Job not found for jobId: ${interview.jobId}`);
    }

    console.log(`Successfully retrieved interview data for ID: ${id}`);
    res.status(200).json({ 
      success: true, 
      interviewId: interview._id,
      assistantId: interview.assistantId, 
      jobName: job?.title, 
      jobDescription: job?.description, 
      location: job?.location 
    });
  } catch (error) {
    console.error("Error fetching interview:", error);
    res.status(500).json({ 
      success: false, 
      error: "Internal server error while fetching interview" 
    });
  }
});

interviewRouter.post("/", authenticate, async (req: any, res: any) => {
  try {
    console.log("Creating new interview with data:", { 
      name: req.body.name, 
      candidateEmail: req.body.candidateEmail, 
      candidateId: req.body.candidateId,
      jobId: req.body.jobId 
    });

    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      JobName: z.string().min(1),
      candidateEmail: z.string().email(),
      candidateId: z.string().min(1),
      jobId: z.string().min(1),
      systemPrompt: z.string().min(1)
    });

    const { name, email, JobName, candidateEmail, candidateId, jobId, systemPrompt} = schema.parse(req.body);    
    const userId = req.user?.firebase_id;
    
    if (!userId) {
      console.log("Error: User ID not found in authentication");
      return res.status(401).json({ success: false, error: "User authentication required" });
    }

    const interviewLink = crypto.randomBytes(16).toString("hex");
    console.log(`Generated interview link: ${interviewLink}`);
   
    // Check if candidate already has an interview - get the latest one
    console.log(`Checking for existing interviews for candidate: ${candidateId}`);
    const existingInterview = await Interview.findOne({ candidateId }).sort({ createdAt: -1 });
    
    const analysisPrompt = VapiAnalysisPrompt();
    
    let assistantId: string;
    
    if (existingInterview) {
      console.log(`Found existing interview for candidate ${candidateId} with assistant ID: ${existingInterview.assistantId}`);
      
      // Check if system prompt is the same
      if (existingInterview.systemPrompt === systemPrompt) {
        // Use existing assistant ID
        assistantId = existingInterview.assistantId;
        console.log(`Reusing existing assistant ${assistantId} for candidate ${candidateId} - system prompt unchanged`);
      } else {
        // Update existing assistant with new system prompt
        console.log(`Updating assistant ${existingInterview.assistantId} with new system prompt for candidate ${candidateId}`);
        try {
          await updateScriptforAssistant(existingInterview.assistantId, firstMessage, systemPrompt);
          assistantId = existingInterview.assistantId;
          console.log(`Successfully updated assistant ${assistantId} for candidate ${candidateId}`);
        } catch (updateError) {
          console.error(`Error updating assistant ${existingInterview.assistantId}:`, updateError);
          throw new Error(`Failed to update assistant: ${updateError}`);
        }
      }
    } else {
      // Create new assistant
      console.log(`Creating new assistant for candidate ${candidateId}`);
      try {
        const assistantCreationResponse = await createSupportAssistant(systemPrompt, firstMessage, analysisPrompt, `${name.substring(0, 30)}-interview`);
        assistantId = assistantCreationResponse.id;
        console.log(`Successfully created new assistant ${assistantId} for candidate ${candidateId}`);
      } catch (createError) {
        console.error(`Error creating assistant for candidate ${candidateId}:`, createError);
        throw new Error(`Failed to create assistant: ${createError}`);
      }
    }

    console.log(`Creating interview record in database for candidate ${candidateId}`);
    const interview = await Interview.create({
      userId,
      candidateEmail,
      candidateId,
      jobId,
      interviewLink,
      assistantId,
      systemPrompt,
      analysisPrompt,
      firstMessage
    });

    console.log(`Interview record created with ID: ${interview._id}`);

    // Send email notification
    console.log(`Sending email notification to ${candidateEmail}`);
    try {
      const emailText = defaultReachoutEmail(name, JobName, interviewLink);
      await sendEmail(candidateEmail, "Interview Scheduled", emailText);
      console.log(`Email sent successfully to ${candidateEmail}`);
    } catch (emailError) {
      console.error(`Error sending email to ${candidateEmail}:`, emailError);
      // Don't fail the entire request if email fails
    }

    console.log(`Interview created successfully for candidate ${candidateId} with ID: ${interview._id}`);

    res.status(200).json({ 
      success: true, 
      interviewId: interview._id,
      assistantId: assistantId,

      message: "Interview created and email sent successfully" 
    });
  } catch (error) {
    console.error("Error creating interview:", error);
    
    // Handle specific error types
    if (error instanceof z.ZodError) {
      console.error("Validation error:", error.errors);
      return res.status(400).json({ 
        success: false, 
        error: "Invalid request data", 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to create interview or send email" 
    });
  }
});

interviewRouter.post("/get-presigned-url", async (req: any, res: any) => {
  try {
    console.log("Generating presigned URL for video upload with data:", {
      sessionId: req.body.sessionId,
      chunkNumber: req.body.chunkNumber,
      userId: req.body.userId
    });

    const schema = z.object({
      sessionId: z.string().min(1),
      chunkNumber: z.number().int().positive(),
      userId: z.string().min(1),
      interviewId: z.string().min(1).optional() // Optional for validation
    });

    const { sessionId, chunkNumber, userId, interviewId } = schema.parse(req.body);

    // Optional: Validate interview exists if interviewId is provided
    if (interviewId) {
      const interview = await Interview.findById(interviewId);
      if (!interview) {
        console.log(`Error: Interview not found with ID: ${interviewId}`);
        return res.status(404).json({ success: false, error: "Interview not found" });
      }
    }

    // Optional: Add rate limiting or quota checking here
    // For example, check total session bytes, interview duration, or user quotas
    
    console.log(`Generating presigned URL for user ${userId}, session ${sessionId}, chunk ${chunkNumber}`);
    
    const presignedUrlData = await generateVideoUploadPresignedUrl(
      userId,
      sessionId,
      chunkNumber
    );

    console.log(`Successfully generated presigned URL for chunk ${chunkNumber} in session ${sessionId}`);

    res.status(200).json({
      success: true,
      presignedUrl: presignedUrlData.presignedUrl,
      key: presignedUrlData.key,
      filename: presignedUrlData.filename,
      metadata: presignedUrlData.metadata,
      expiresIn: 300 // 5 minutes
    });

  } catch (error) {
    console.error("Error generating presigned URL:", error);
    
    // Handle specific error types
    if (error instanceof z.ZodError) {
      console.error("Validation error:", error.errors);
      return res.status(400).json({ 
        success: false, 
        error: "Invalid request data", 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: "Failed to generate presigned URL" 
    });
  }
});


interviewRouter.post("/get-call-details", async (req: any, res: any) => {
  const body = req.body;
  res.status(200).json({ success: true, message: "Call details fetched successfully" });
});


