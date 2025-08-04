import { Router, Request, Response } from "express";
import { Interview } from "../../utils/db";
import { defaultReachoutEmail, sendEmail } from "../../utils/mail";
import { authenticate } from "../../middleware/firebase-auth";
import crypto from "crypto";

const reachoutRouter = Router();

reachoutRouter.post("/email", async (req: Request, res: Response) => {
  const { name, email, JobName, interviewLink, toEmail } = req.body;    
  const emailText = defaultReachoutEmail(name, email, JobName, interviewLink);
  await sendEmail(toEmail, "Interview Scheduled", emailText);
  res.status(200).json({ success: true });
});

reachoutRouter.post("/interview", authenticate, async (req: any, res: any) => {
  try {
    const { name, email, JobName, candidateEmail,candidateId, jobId } = req.body;    
    const userId = req.user?.firebase_id;
    const interviewLink = crypto.randomBytes(16).toString("hex");
   
    // Validate required fields
    if (!candidateEmail || !candidateId || !jobId || !interviewLink) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing required fields: candidateEmail, candidateId, jobId, interviewLink" 
      });
    }

    // Create interview record in database
    const interview = await Interview.create({
      userId,
      candidateEmail,
      candidateId,
      jobId,
      interviewLink
    });

    // Send email notification
    const emailText = defaultReachoutEmail(name, email, JobName, interviewLink);
    await sendEmail(candidateEmail, "Interview Scheduled", emailText);

    console.log(`Interview created for candidate ${candidateId} with ID: ${interview._id}`);

    res.status(200).json({ 
      success: true, 
      interviewId: interview._id,
      message: "Interview created and email sent successfully" 
    });
  } catch (error) {
    console.error("Error creating interview:", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to create interview or send email" 
    });
  }
});


export default reachoutRouter;