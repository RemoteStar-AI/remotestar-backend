import { Router } from "express";
export const searchRouter = Router();
import { z } from "zod";
import { openai } from "../../utils/openai";
import { pinecone } from "../../utils/pinecone";

const schema = z.object({
  query: z.string(),
});

searchRouter.post("/", async (req: any, res: any) => {
  let body = await req.body;
  const validation = schema.safeParse(body);
  if (!validation.success) {
    console.log(validation.error);
    return res.status(400).json({ error: "Invalid request" });
  }
  body = validation.data;
  const { query } = body;

  const embeddingResponse = await openai.embeddings.create({
    model:"text-embedding-3-large",
    input: query,
  })

  const embedding = embeddingResponse.data[0].embedding;
  console.log(embedding);

  const index = pinecone.index("remotestar");
  const queryResponse = await index.namespace("talent-pool").query({
    vector: embedding,
    topK: 10,
    includeValues: false,
    includeMetadata: true,
  })



  res.status(200).json({
    results: queryResponse.matches.map((match) => ({
      id: match.id,
      score: match.score,
      metadata: match.metadata,
    })),
  });
  console.log("Query response:", queryResponse);
})
