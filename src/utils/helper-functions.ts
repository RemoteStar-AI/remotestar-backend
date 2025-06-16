import { CanonicalSkills as Skill } from "./db";
import { pinecone } from "./pinecone";
import { openai } from "./openai";

const PINECONE_INDEX_NAME = 'remotestar';
const SIMILARITY_THRESHOLD = 0.70;

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
    // Use summary for embedding if provided, otherwise fallback to skillName
    const skillForEmbedding = summary ? summary : skillName;

    // 1. Get embedding for the summary (or skill name)
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: skillForEmbedding,
    });
    const embedding = embeddingResponse.data[0].embedding;

    // 2. Query Pinecone for the closest match
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
      console.log(`[PINECONE] Skill normalization: '${skillName}' top match '${canonicalName}' with similarity ${(score * 100).toFixed(2)}%`);
      if (score >= SIMILARITY_THRESHOLD && canonicalName) {
        return canonicalName;
      }
    }

    // 3. If not found, upsert the new skill to Pinecone (with summary)
    await index.namespace("skills").upsert([
      {
        id: String(skillName).toLowerCase(),
        values: embedding,
        metadata: { canonicalName: String(skillName), summary: skillForEmbedding },
      },
    ]);
    return skillName;
  }