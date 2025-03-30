import { Router } from "express";
export const extractRouter = Router();
import { z } from "zod";
import { extractPrompt } from "../utils/prompts";
import { openai } from "../utils/openai";
import { config } from "dotenv";
config();

const extractSchema = z.object({
    text: z.string(),
});

extractRouter.post("/", async (req: any, res: any) => {
    try{
    const body = req.body;
    const result = extractSchema.safeParse(body);
    if (!result.success) {
        return res.status(400).json({
            error: result.error.format(),
        });
    }
    const { text } = result.data;
    const extractPromptext = extractPrompt(text);

    // Simulate OpenAI API call
    console.log("sending request to openai")
    const responce = await openai.chat.completions.create({
        model:"gpt-3.5-turbo",
        messages:[{role:"user", content:extractPromptext}],
    })   
    // Simulate text extraction
    console.log("received responce from chatgpt")
    const extractedText = responce.choices[0].message.content!;
    const validJson = extractedText.replace(/(\r\n|\n|\r)/gm, "");
    const parsedJson = JSON.parse(validJson);
    console.log("Parsed JSON: ", parsedJson);

    // Check if the parsed JSON is valid
    if (typeof parsedJson !== "object" || parsedJson === null) {
        return res.status(400).json({
            error: "Invalid JSON response from OpenAI",
        });
    }
    console.log("Extract Prompt: ", parsedJson);

  res.status(200).json({
    responce: parsedJson
  });
}
catch (error) {
    console.error("Error during extraction:", error);
    res.status(500).json({
        error: "Internal server error",
    });
}
});
