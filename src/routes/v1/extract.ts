import { Router } from "express";
export const extractRouter = Router();
import { z } from "zod";
import { extractPrompt, reformatPrompt } from "../../utils/prompts";
import { openai } from "../../utils/openai";
import { config } from "dotenv";
import { resumeSchema } from "../../utils/schema";
import { extractJsonFromMarkdown } from "../../utils/helper-functions";
config();

extractRouter.post("/", async (req: any, res: any) => {
  try {
    // Validate input text
    const inputValidation = z.object({ text: z.string() }).safeParse(req.body);
    if (!inputValidation.success) {
      return res.status(400).json({ error: inputValidation.error.format() });
    }
    const { text } = req.body;
    const extractPromptext = extractPrompt(text);

    console.log("Sending request to OpenAI...\n");
    let response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: extractPromptext }],
    });

    console.log("Received response from OpenAI\n");
    let extractedText = response.choices[0].message.content?.trim();
    if (!extractedText) throw new Error("Empty response from OpenAI");

    // Remove potential newlines before parsing
    let validJson = extractJsonFromMarkdown(extractedText).replace(
      /(\r\n|\n|\r)/gm,
      ""
    );
    let parsedJson = JSON.parse(validJson);
    console.log("\n Parsed JSON received✅\n");
    console.log(parsedJson);
    // Validate against resume schema
    let validation = resumeSchema.safeParse(parsedJson);
    if (!validation.success) {
      console.log(
        "Response does not match schema. Requesting reformatting...\n"
      );

      // Extract error details
      const errorDetails = validation.error.errors
        .map((err) => {
          return `Path: ${err.path.join(".") || "root"} - ${err.message}`;
        })
        .join("\n");

      console.log("Zod safe Parse Error details:", errorDetails);

      const reformatText = reformatPrompt(extractedText, errorDetails);

      response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: reformatText }],
      });

      console.log("Received reformatted response from OpenAI\n");
      extractedText = response.choices[0].message.content?.trim();
      if (!extractedText)
        throw new Error("Empty reformatted response from OpenAI");
      validJson = extractJsonFromMarkdown(extractedText).replace(
        /(\r\n|\n|\r)/gm,
        ""
      );
      parsedJson = JSON.parse(validJson);
      validation = resumeSchema.safeParse(parsedJson);

      if (!validation.success) {
        console.log("Reformatted response still does not match schema.");
        console.log(validation.error.format());
        res
          .status(400)
          .json({
            error: "Failed to format response into the required schema.",
          });
        return;
      }
    }

    res.status(200).json({ response: parsedJson });
  } catch (error) {
    console.error("Error during extraction:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
