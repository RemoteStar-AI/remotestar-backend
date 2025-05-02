import { Router } from "express";
import { Job } from "../../utils/db";
import User from "../../utils/db";
import { analyseUserPrompt } from "../../utils/prompts";
import { openai } from "../../utils/openai";
export const analyseRouter = Router();

analyseRouter.post("/", async (req: any, res: any) => {
  const { userId, jobId } = req.body;


  const user = await User.findById(userId);
  const job = await Job.findById(jobId);

  if (!user || !job) {
    return res.status(404).json({ error: "User or job not found" });
  }

  const userData = user.toObject();
  const jobData = job.toObject();

  const prompt = analyseUserPrompt(userData, jobData);
  console.log("analysis started");

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    stream: true
  });

  // Set headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let fullResponse = '';

  for await (const chunk of response) {
    const content = chunk.choices[0]?.delta?.content || '';
    fullResponse += content;
    
    // Send the chunk to the client
    res.write(`data: ${JSON.stringify({ content })}\n\n`);
  }

  // End the stream
  res.write(`data: ${JSON.stringify({ done: true, fullResponse })}\n\n`);
  res.end();
});


