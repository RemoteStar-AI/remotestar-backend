import { Router } from "express";
import { pinecone } from "../../utils/pinecone";
import { z } from "zod";
import { openai } from "../../utils/openai";
import { config } from "dotenv";
config();
export const embedRouter = Router();
import User from "../../utils/db";
import mongoose from "mongoose";
import { authenticate } from "../../middleware/firebase-auth";

const embedSchema = z.object({
  text: z.string(),
  schema: z.record(z.unknown()), // or z.any()
});

const bulkEmbedSchema = z.array(embedSchema);

embedRouter.post("/", authenticate, async (req: any, res: any) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const body = req.body;
    console.log("Request body Received:\n");
    const result = embedSchema.safeParse(body);
    console.log("Parsed Result:\n", result);
    if (!result.success) {
      res.status(400).json({
        error: result.error.format(),
      });
      console.log("Error:", result.error.format());
      return;
    }
    const { text, schema } = result.data;
    const firebaseId = req.user.firebase_id;
    const userEmail = req.user.email;

    const embeddingresponce = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: text,
    });
    const embedding = embeddingresponce.data[0].embedding;
    const uniqueId = new mongoose.Types.ObjectId();

    const index = pinecone.Index("remotestar");

    await User.create(
      [
        {
          _id: uniqueId,
          firebase_id: firebaseId,
          firebase_email: userEmail,
          ...schema,
        },
      ],
      { session }
    );

    // Convert schema to a valid metadata format for Pinecone
    const metadata = Object.entries(schema).reduce(
      (acc, [key, value]) => {
        // Convert values to string, number, or boolean to match RecordMetadataValue
        if (value !== null && value !== undefined) {
          acc[key] = String(value);
        }
        return acc;
      },
      {
        firebase_id: firebaseId,
        firebase_email: userEmail,
      } as Record<string, string>
    );

    await index.namespace("talent-pool").upsert([
      {
        id: uniqueId.toString(),
        values: embedding,
        metadata,
      },
    ]);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Embedding created successfully",
      data: {
        id: uniqueId.toString(),
      },
    });
  } catch (error) {
    await session.abortTransaction(); // Rollback transaction
    session.endSession();
    console.error("Error during embedding:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

embedRouter.post("/bulk", authenticate, async (req: any, res: any) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const body = req.body;
    console.log("Bulk Request Body Received:\n", body);

    const result = bulkEmbedSchema.safeParse(body);
    if (!result.success) {
      res.status(400).json({
        error: result.error.format(),
      });
      console.log("Validation Error:\n", result.error.format());
      return;
    }

    const firebaseId = req.user.firebase_id;
    const userEmail = req.user.email;

    const index = pinecone.Index("remotestar");
    const pineconePayload = [];
    const mongoDocs = [];

    for (const embed of result.data) {
      const { text, schema } = embed;

      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-large",
        input: text,
      });
      const embedding = embeddingResponse.data[0].embedding;
      const uniqueId = new mongoose.Types.ObjectId();

      mongoDocs.push({
        _id: uniqueId,
        firebase_id: firebaseId,
        firebase_email: userEmail,
        ...schema,
      });

      const metadata = Object.entries(schema).reduce(
        (acc, [key, value]) => {
          // Convert values to string, number, or boolean to match RecordMetadataValue
          if (value !== null && value !== undefined) {
            acc[key] = String(value);
          }
          return acc;
        },
        {
          firebase_id: firebaseId,
          firebase_email: userEmail,
        } as Record<string, string>
      );

      pineconePayload.push({
        id: uniqueId.toString(),
        values: embedding,
        metadata,
      });
    }

    await User.insertMany(mongoDocs, { session });

    await index.namespace("talent-pool").upsert(pineconePayload);

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Bulk embedding created successfully",
      count: mongoDocs.length,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Bulk Error:", error);
    res.status(500).json({
      error: "Internal server error",
    });
  }
});
