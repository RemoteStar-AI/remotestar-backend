import { Job, User, CanonicalSkills as Skill, JobAnalysisOfCandidate } from "./db";
import { pinecone } from "./pinecone";
import { openai } from "./openai";
import {pineconeLogger as logger} from "./pinecone-logger";
import { getSignedUrlForResume } from "./s3";
import { jdCvMatchingPrompt } from "./prompts";
import "isomorphic-fetch";

const PINECONE_INDEX_NAME = 'remotestar';
const SIMILARITY_THRESHOLD = 0.60;

export function extractJsonFromMarkdown(text:string) {
    const regex = /```json\s*([\s\S]*?)```/;
    const match = text.match(regex);
    if (match) {
      return match[1].trim();
    }
    return text;
  }
  
  export async function getCanonicalSkillNames(): Promise<string[]> {
    const skills = await Skill.find({}, 'name');
    console.log("skills\n", skills.map(skill => skill.name));
    return skills.map(skill => skill.name);
  }

  export async function saveNewSkillsIfNotExist(skillsObj: { skills: any[] }) {
    const skills = skillsObj.skills;
    if (!Array.isArray(skills)) {
      console.error("saveNewSkillsIfNotExist expected an array but got:", skills);
      return [];
    }
    console.log("Starting saveNewSkillsIfNotExist with skills:", skills);
    
    const existing = await Skill.find({}, 'name');
    console.log("Found existing skills:", existing);
    
    const existingSet = new Set(existing.map(s => s.name.toLowerCase()));
    console.log("Created set of existing skill names:", Array.from(existingSet));
  
    const newSkills = skills.filter(skill => !existingSet.has(skill.name.toLowerCase()));
    console.log("Filtered new skills to add:", newSkills);
  
    for (const skill of newSkills) {
      console.log("Creating new skill:", skill.name);
      await Skill.create({
        name: skill.name.toLowerCase(),
        aliases: []
      });
    }
  
    const result = newSkills.map(s => s.name);
    console.log("Returning newly added skill names:", result);
    return result;
  }
  /**
   * Normalize a skill name using Pinecone vector DB, using the summary for embedding.
   * @param skillName The skill name to normalize.
   * @param summary The summary/description of the skill (should start with the skill name and describe it).
   * @returns The canonical skill name (if found), or the original name (if new, and also adds to Pinecone).
   */
  export async function normalizeSkillNameWithPinecone(skillName: string, summary?: string): Promise<string> {
    logger.info(`[PINECONE] Starting skill normalization for: ${skillName}`);
    
    // Use summary for embedding if provided, otherwise fallback to skillName
    const skillForEmbedding = summary ? summary : skillName;
    logger.debug(`[PINECONE] Using embedding text: ${skillForEmbedding}`);

    try {
      // 1. Get embedding for the summary (or skill name)
      logger.info('[PINECONE] Generating embedding using OpenAI');
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-large",
        input: skillForEmbedding,
      });
      const embedding = embeddingResponse.data[0].embedding;
      logger.debug('[PINECONE] Successfully generated embedding');

      // 2. Query Pinecone for the closest match
      logger.info('[PINECONE] Querying Pinecone for similar skills');
      const index = pinecone.index(PINECONE_INDEX_NAME);
      const queryResult = await index.namespace("skills").query({
        vector: embedding,
        topK: 1,
        includeMetadata: true,
        includeValues: false,
      });

      if (queryResult.matches && queryResult.matches.length > 0) {
        const match = queryResult.matches[0];
        const score = typeof match.score === 'number' ? match.score : 0;
        const canonicalName = typeof match.metadata?.canonicalName === 'string' ? match.metadata.canonicalName : undefined;
        
        logger.info(`[PINECONE] Found match: ${canonicalName} with similarity ${(score * 100).toFixed(2)}%`);
        
        if (score >= SIMILARITY_THRESHOLD && canonicalName) {
          logger.info(`[PINECONE] Returning canonical name: ${canonicalName}`);
          return canonicalName;
        }
      }

      // 3. If not found, upsert the new skill to Pinecone (with summary)
      logger.info(`[PINECONE] No matching skill found above threshold. Adding new skill: ${skillName}`);
      await index.namespace("skills").upsert([
        {
          id: String(skillName).toLowerCase(),
          values: embedding,
          metadata: { canonicalName: String(skillName), summary: skillForEmbedding },
        },
      ]);
      logger.info(`[PINECONE] Successfully added new skill to Pinecone: ${skillName}`);
      return skillName;
    } catch (error) {
      logger.error(`[PINECONE] Error in normalizeSkillNameWithPinecone: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

/**
 * Creates an embedding for a given text and stores it in the 'talent-pool-v2' namespace in Pinecone.
 * @param userId The ID of the user, which will be used as the vector ID.
 * @param embeddingText The text to create an embedding from (e.g., a resume summary).
 */
export async function createAndStoreEmbedding(id: string, embeddingText: string, namespace: string): Promise<void> {
  const type = namespace === 'jobs' ? 'job' : 'user';
  logger.info(`[PINECONE_EMBED] Starting embedding generation for ${type}: ${id}`);

  if (!embeddingText) {
    logger.warn(`[PINECONE_EMBED] embeddingText is empty for ${type}: ${id}. Skipping.`);
    return;
  }
  
  try {
    // 1. Get embedding for the text
    logger.debug(`[PINECONE_EMBED] Generating embedding for ${type}: ${id}`);
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: embeddingText,
    });
    const embedding = embeddingResponse.data[0].embedding;
    logger.debug(`[PINECONE_EMBED] Successfully generated embedding for ${type}: ${id}`);

    // 2. Upsert to Pinecone
    logger.info(`[PINECONE_EMBED] Upserting embedding to Pinecone for ${type}: ${id}`);
    const index = pinecone.index(PINECONE_INDEX_NAME);
    await index.namespace(namespace).upsert([
      {
        id: id,
        values: embedding,
      },
    ]);
    logger.info(`[PINECONE_EMBED] Successfully stored embedding in Pinecone for ${type}: ${id}`);
  } catch (error) {
    logger.error(`[PINECONE_EMBED] Error in createAndStoreEmbedding for ${type} ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // Do not rethrow, just log the error.
  }
}

export async function analyseJdWithCv(jobId:string, userId:string){
  const job = await Job.findById(jobId);
  const user = await User.findById(userId);
  if (!job || !user) {
    throw new Error("Job or user not found");
  }
  console.log("resume_url", user.resume_url);
  const resumeUrl = await getSignedUrlForResume(user.resume_url);
  if (!resumeUrl) {
    throw new Error("User resume not found");
  }

  const response = await fetch(resumeUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch resume from ${resumeUrl}`);
  }

  const resumeBuffer = await response.arrayBuffer();
  const fileName = user.resume_url.split('/').pop() || 'resume.pdf';
  const contentType = response.headers.get('content-type') || 'application/pdf';


  const uploadedFile = await openai.files.create({
    file: new File([new Uint8Array(resumeBuffer)], fileName, {
      type: contentType,
    }),
    purpose: "user_data",
  });
  const promptText = await jdCvMatchingPrompt(job.description, jobId);
  const analysisResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: [{ type: "file", file: { file_id: uploadedFile.id } }, { type: "text", text: promptText }],
      }
    ],
  });

  const analysisText = analysisResponse.choices[0].message.content;
  if (!analysisText) {
    throw new Error("Analysis text not found");
  }
  const analysisJson = JSON.parse(extractJsonFromMarkdown(analysisText));
  const analysis = await JobAnalysisOfCandidate.create({ jobId: jobId, userId: userId, data: analysisJson });
  console.log("Analysis created", JSON.stringify(analysis));
  if (!analysis) {
    throw new Error("Analysis not found");
  }
}
