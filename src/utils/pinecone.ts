import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
dotenv.config();

export const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

/**
 * Get the total number of vectors in a Pinecone index (optionally by namespace and organisationId).
 * @param indexName The name of the Pinecone index.
 * @param namespace (Optional) The namespace to count vectors in.
 * @param organisationId (Optional) The organisation_id to filter vectors by.
 * @returns The total number of vectors.
 *
 * WARNING: Filtering by organisationId is inefficient for large datasets in Pinecone Node SDK v5.x.
 * For best performance, upgrade to SDK v6.x+ and use describeIndexStats({ filter: { organisation_id: ... } })
 */
export async function getPineconeVectorCount(indexName: string, namespace?: string, organisationId?: string): Promise<number> {
  const index = pinecone.index(indexName);
  if (organisationId && namespace) {
    // Inefficient workaround: fetch all vector IDs in the namespace, filter by organisation_id
    let count = 0;
    let paginationToken: string | undefined = undefined;
    do {
      const listResp = await index.namespace(namespace).listPaginated({
        limit: 100,
        paginationToken
      });
      const ids = (listResp.vectors || [])
        .map((v: { id?: string }) => v.id)
        .filter((id: string | undefined): id is string => typeof id === 'string');
      if (ids.length > 0) {
        const fetchResp = await index.namespace(namespace).fetch(ids);
        for (const id of ids) {
          const vector = fetchResp.records[id];
          if (vector && vector.metadata && vector.metadata.organisation_id === organisationId) {
            count++;
          }
        }
      }
      paginationToken = listResp.pagination?.next;
    } while (paginationToken);
    return count;
  } else {
    const stats = await index.describeIndexStats();
    if (namespace) {
      return stats.namespaces?.[namespace]?.recordCount || 0;
    } else {
      // Sum all namespaces if no namespace specified
      return Object.values(stats.namespaces || {}).reduce((sum, ns: any) => sum + (ns.recordCount || 0), 0);
    }
  }
}