/**
 * @file src/utils/migration.ts
 *
 * @description
 *   This script provides a utility function to add a default organisation_id to all User, Company, and Job documents in the database.
 *   It is intended for use as a one-time or ad-hoc migration to ensure all relevant documents have the specified organisation ID.
 *
 *   Main Function:
 *     - addOrganisationId(MongoURI: string):
 *         Connects to the MongoDB instance, updates all User, Company, and Job records to set the organisation_id field to the hardcoded ORG_ID, then disconnects.
 *
 *   Usage:
 *     - Uncomment the last line and provide the correct MongoDB URI to run the migration.
 *     - Example: node -r ts-node/register src/utils/migration.ts
 *
 * @disclaimer
 *   This script performs bulk updates on production data. Use with caution and ensure you have backups before running.
 *   Only run this script if you understand its impact. It is not intended for regular application use.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { User, Company, Job, JobAnalysisOfCandidate } from "./db";
import { pinecone } from "./pinecone";
import { PINECONE_INDEX_NAME, pinecodeTalentPoolNamespace } from "./consts";

const ORG_ID = "6835782f4ec996c8f13dca2d";

// export async function addOrganisationId(MongoURI: string) {
//   try {
//     await mongoose.connect(MongoURI);
//     // Update all users
//     await User.updateMany({}, { $set: { organisation_id: ORG_ID } });
//     console.log("Updated all users");

//     // Update all companies
//     await Company.updateMany({}, { $set: { organisation_id: ORG_ID } });
//     console.log("Updated all companies");

//     // Update all jobs
//     await Job.updateMany({}, { $set: { organisation_id: ORG_ID } });
//     console.log("Updated all jobs");
//   } catch (err) {
//     console.error(err);
//   } finally {
//     await mongoose.disconnect();
//   }
// }

// export async function deleteRecentJobAnalyses(MongoURI: string) {
//   try {
//     await mongoose.connect(MongoURI);
//     const minutes = 60;
//     const minutesAgo = new Date(Date.now() - minutes * 60 * 1000);
//     const result = await JobAnalysisOfCandidate.deleteMany({
//       createdAt: { $gte: minutesAgo },
//     });
//     console.log(
//       `Deleted ${result.deletedCount} documents from JobAnalysisOfCandidate created in the last ${minutes} minutes.`
//     );
//   } catch (err) {
//     console.error(err);
//   } finally {
//     await mongoose.disconnect();
//   }
// }

/**
//  * Deletes all JobAnalysisOfCandidate documents whose userId is NOT in the allowedUserIds array.
//  * @param {string} MongoURI - The MongoDB connection string.
//  */
// export async function deleteJobAnalysisExceptUserIds(MongoURI: string) {
//   const allowedUserIds = [
//     "685bf5b15ec7d03d6d40bac8",
//     "687512a06125099b3950f6f9",
//     "68585bb37aa3838420441f00",
//     "6859a50d38d37fa072f06bac",
//     "685d2f1cf94542290e366954",
//     "685d2f94f94542290e366b0e"
//   ];
//   try {
//     await mongoose.connect(MongoURI);
//     // Delete all JobAnalysisOfCandidate documents whose userId is NOT in the allowedUserIds array
//     const result = await JobAnalysisOfCandidate.deleteMany({ userId: { $nin: allowedUserIds } });
//     console.log(`Deleted ${result.deletedCount} JobAnalysisOfCandidate documents not in the allowed user list.`);
//   } catch (err) {
//     console.error(err);
//   } finally {
//     await mongoose.disconnect();
//   }
// }

/**
 * Deletes all users except those whose userId is in the hardcoded allowedUserIds array.
 * @param {string} MongoURI - The MongoDB connection string.
 */
// export async function deleteUsersExceptList(MongoURI: string) {
//   // Hardcoded user IDs from the provided response
//   const allowedUserIds = [
//     "685bf5b15ec7d03d6d40bac8",
//     "687512a06125099b3950f6f9",
//     "68585bb37aa3838420441f00",
//     "6859a50d38d37fa072f06bac",
//     "685d2f1cf94542290e366954",
//     "685d2f94f94542290e366b0e"
//   ];
//   try {
//     await mongoose.connect(MongoURI);
//     // Delete all users whose _id is NOT in the allowedUserIds array
//     const result = await User.deleteMany({ _id: { $nin: allowedUserIds } });
//     console.log(`Deleted ${result.deletedCount} users not in the allowed list.`);
//   } catch (err) {
//     console.error(err);
//   } finally {
//     await mongoose.disconnect();
//   }
// }

// Example usage (uncomment and provide your MongoDB URI):
// deleteUsersExceptList(process.env.MONGO_URI!);


export async function deleteNonExistingUsersFromPinecode() {
  try {
    // Collect current user IDs from MongoDB
    const users = await User.find({}, { _id: 1 }).lean();
    const existingUserIds = new Set<string>(users.map((u: any) => u._id.toString()));
    const namespace = pinecodeTalentPoolNamespace;
    const index = pinecone.index(PINECONE_INDEX_NAME);

    console.log(`[PINECONE_MIGRATION] Loaded ${existingUserIds.size} user IDs from MongoDB`);

    // List all vector IDs from Pinecone namespace with pagination (limit must be < 100 per SDK)
    let paginationToken: string | undefined = undefined;
    const pineconeIds: string[] = [];
    do {
      const listResp = await index
        .namespace(namespace)
        .listPaginated({ limit: 99, paginationToken });
      const ids = (listResp.vectors || [])
        .map((v: { id?: string }) => v.id)
        .filter((id: string | undefined): id is string => typeof id === "string");
      pineconeIds.push(...ids);
      paginationToken = listResp.pagination?.next;
      console.log(`[PINECONE_MIGRATION] Listed ${ids.length} vectors (total so far: ${pineconeIds.length})`);
    } while (paginationToken);

    console.log(`[PINECONE_MIGRATION] Total vectors in namespace '${namespace}': ${pineconeIds.length}`);

    if (pineconeIds.length === 0) {
      console.log("[PINECONE_MIGRATION] No vectors found; nothing to delete.");
      return;
    }

    // Determine IDs present in Pinecone but not in MongoDB
    const idsToDelete = pineconeIds.filter((id) => !existingUserIds.has(id));
    console.log(`[PINECONE_MIGRATION] Vectors to delete (not present in MongoDB): ${idsToDelete.length}`);

    if (idsToDelete.length === 0) {
      console.log("[PINECONE_MIGRATION] No stale vectors to delete.");
      return;
    }

    // Delete in chunks to avoid request size limits
    const CHUNK_SIZE = 99;
    for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
      const chunk = idsToDelete.slice(i, i + CHUNK_SIZE);
      try {
        await index.namespace(namespace).deleteMany({ ids: chunk });
        console.log(`[PINECONE_MIGRATION] Deleted ${chunk.length} vectors (${i + chunk.length}/${idsToDelete.length})`);
      } catch (err: any) {
        console.error(`[PINECONE_MIGRATION] Error deleting vectors chunk [${i}-${i + chunk.length}]:`, err?.message || err);
        // Continue with next chunk
      }
    }

    console.log(`[PINECONE_MIGRATION] Cleanup complete. Deleted ${idsToDelete.length} vectors from '${namespace}'.`);
  } catch (err: any) {
    console.error("[PINECONE_MIGRATION] Unhandled error:", err?.message || err);
  }
}