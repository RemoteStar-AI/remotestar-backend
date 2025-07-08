import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
dotenv.config();

export const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

/**
 * Get the total number of vectors in a Pinecone index (optionally by namespace).
 * @param indexName The name of the Pinecone index.
 * @param namespace (Optional) The namespace to count vectors in.
 * @returns The total number of vectors.
 */
export async function getPineconeVectorCount(indexName: string, namespace?: string): Promise<number> {
  const index = pinecone.index(indexName);
  const stats = await index.describeIndexStats();
  if (namespace) {
    return stats.namespaces?.[namespace]?.recordCount || 0;
  } else {
    // Sum all namespaces if no namespace specified
    return Object.values(stats.namespaces || {}).reduce((sum, ns: any) => sum + (ns.recordCount || 0), 0);
  }
}