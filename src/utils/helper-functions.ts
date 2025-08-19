import { Job, User, CanonicalSkills as Skill, JobAnalysisOfCandidate } from "./db";
import { pinecone } from "./pinecone";
import { openai } from "./openai";
import {pineconeLogger as logger} from "./pinecone-logger";
import { getSignedUrlForResume } from "./s3";
import { jdCvMatchingPrompt, VapiSystemPrompt } from "./prompts";
import { vapi_system_prompt, pinecodeTalentPoolNamespace } from "./consts";
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
export async function createAndStoreEmbedding(id: string, embeddingText: string, namespace: string, organisation_id: string): Promise<void> {
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
    console.log("organisation_id", organisation_id);
    await index.namespace(namespace).upsert([
      {
        id: id,
        values: embedding,  
        metadata: {
          organisation_id: organisation_id,
        }
      },
    ]);
    logger.info(`[PINECONE_EMBED] Successfully stored embedding in Pinecone for ${type}: ${id}`);
  } catch (error) {
    logger.error(`[PINECONE_EMBED] Error in createAndStoreEmbedding for ${type} ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // Do not rethrow, just log the error.
  }
}

/**
 * Deletes an embedding from Pinecone by vector id and namespace.
 * @param id The vector ID to delete.
 * @param namespace The Pinecone namespace.
 * @param organisation_id (Optional) The organisation ID for logging.
 */
export async function deleteEmbedding(id: string, namespace: string, organisation_id?: string): Promise<void> {
  logger.info(`[PINECONE_EMBED] Deleting embedding for id: ${id} in namespace: ${namespace}`);
  try {
    const index = pinecone.index(PINECONE_INDEX_NAME);
    await index.namespace(namespace).deleteOne(id);
    logger.info(`[PINECONE_EMBED] Successfully deleted embedding for id: ${id} in namespace: ${namespace}`);
  } catch (error) {
    logger.error(`[PINECONE_EMBED] Error deleting embedding for id: ${id} in namespace: ${namespace}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  console.log("Fetching resume from:", resumeUrl);
  const response = await fetch(resumeUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch resume from ${resumeUrl}: ${response.status} ${response.statusText}`);
  }

  const resumeBuffer = await response.arrayBuffer();
  console.log("Resume buffer size:", resumeBuffer.byteLength, "bytes");
  
  // Better filename extraction
  let fileName = 'resume.pdf'; // default
  try {
    if (user.resume_url.includes('/')) {
      const urlParts = user.resume_url.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      // Remove any query parameters
      fileName = lastPart.split('?')[0] || 'resume.pdf';
    }
  } catch (error) {
    console.warn("Error extracting filename, using default:", error);
  }
  
  const contentType = response.headers.get('content-type') || 'application/pdf';
  console.log("Content type:", contentType, "File name:", fileName);

  // Broader content type validation
  const validTypes = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
  const isValidType = validTypes.some(type => contentType.toLowerCase().includes(type));
  if (!isValidType) {
    console.warn(`Unexpected content type: ${contentType} for file: ${fileName}`);
  }

  try {
    console.log("Uploading file to OpenAI...");
    const uploadedFile = await openai.files.create({
      file: new File([new Uint8Array(resumeBuffer)], fileName, {
        type: contentType,
      }),
      purpose: "user_data",
    });
    console.log("File uploaded to OpenAI with ID:", uploadedFile.id);
    
    const promptText = jdCvMatchingPrompt(job.description);
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
    console.log("[DEBUG] Raw analysisText from OpenAI:", analysisText);
    const extractedJsonString = extractJsonFromMarkdown(analysisText);
    console.log("[DEBUG] Extracted JSON string:", extractedJsonString);
    const analysisJson = JSON.parse(extractedJsonString);

    // Compute rank
    let rank = 1;
    if (typeof analysisJson.percentageMatchScore === 'number') {
      // Get all existing analyses for this job
      const existingAnalyses = await JobAnalysisOfCandidate.find({ jobId });
      // Count how many have a higher percentageMatchScore
      const higherRankCount = existingAnalyses.filter(a => (a.data?.percentageMatchScore || 0) > analysisJson.percentageMatchScore).length;
      rank = higherRankCount + 1;
    } else {
      // If no score, append to end
      const existingCount = await JobAnalysisOfCandidate.countDocuments({ jobId });
      rank = existingCount + 1;
    }

    const analysis = await JobAnalysisOfCandidate.create({ jobId: jobId, userId: userId, data: analysisJson, newlyAnalysed: true, rank });
    console.log("Analysis created", JSON.stringify(analysis));
    if (!analysis) {
      throw new Error("Analysis not found");
    }
  } catch (error) {
    console.error("Error in file upload or analysis:", error);
    throw error;
  }
}

export async function markAnalysisAsNotNew(jobId: string, userId: string) {
  await JobAnalysisOfCandidate.updateOne({ jobId, userId }, { $set: { newlyAnalysed: false } });
}

export function insertErrorSection(prompt: string): string {
  const marker = '[Ratings & Feedback]';
  const index = prompt.indexOf(marker);
  const testSection = `[Error Handling / Fallback]
- If the prospect is unsure or has questions, offer to provide more details: "I can help clarify any questions you might have. What would you like to know about the role?"
- For unclear responses, ask for clarification: "Could you please repeat that? I want to ensure I provide you with the best information."
- If they inquire about the employer: "We cannot reveal that information just yet. I will share the summary of our call with the hiring manager, and if you are selected, we will share the employer details and invite you to a video interview."`;

  if (index !== -1) {
    // Insert the test section before the [Ratings & Feedback] marker
    return `${prompt.slice(0, index)}${testSection.trim()}\n\n${prompt.slice(index)}`;
  } else {
    // If the marker is not found, append the test section at the end
    return `${prompt.trim()}\n\n${testSection.trim()}`;
  }
}

export async function getVapiSystemPrompt(jobDescription: string) {
  const vapi_sp_generatation_prompt = VapiSystemPrompt(jobDescription);

  const openaiResponse = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: vapi_sp_generatation_prompt }],
  });

  const vapi_sp_generatation_prompt_response = openaiResponse.choices[0].message.content;
  
  // Clean up the response by removing escaped characters and formatting JSON properly
  const cleanedResponse = vapi_sp_generatation_prompt_response
    ?.replace(/\\\[/g, '[')
    ?.replace(/\\\]/g, ']')
    ?.replace(/\\"/g, '"')
    ?.trim();

  // Parse the cleaned JSON response
  let skillsData;
  try {
    skillsData = JSON.parse(cleanedResponse || '[]');
  } catch (error) {
    console.error('Error parsing skills JSON:', error);
    skillsData = [];
  }

  // Generate skill-related questions section
  let skillRelatedQuestions = '';
  
  if (Array.isArray(skillsData) && skillsData.length > 0) {
    skillRelatedQuestions = '3. Skill Assessment:\n';
    
    skillsData.forEach((skill, index) => {
      skillRelatedQuestions += `\n${skill.skill} (Weightage: ${skill.weightage}%):\n`;
      
      // Add the specific questions for this skill
      if (Array.isArray(skill.questions)) {
        skill.questions.forEach((question: string) => {
          skillRelatedQuestions += `- "${question}"\n`;
          skillRelatedQuestions += `  <wait for candidate response>\n`;
        });
      }
      
      skillRelatedQuestions += '\n';
    });
  }

  // Populate the vapi_system_prompt template
  const populatedSystemPrompt = vapi_system_prompt
    .replace('{{skill_related_questions}}', skillRelatedQuestions)
    .replace('{{job_description}}', jobDescription);

  return populatedSystemPrompt;
}
