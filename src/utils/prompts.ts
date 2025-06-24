import { ScriptTarget } from "typescript";
import { JobRequiredSkills } from "./db";

export function extractPrompt(scrapedText: string): string {
  return `
You are an advanced AI assistant. Your task is to process the following scraped text and structure it into a predefined JSON schema.

### **Instructions:**
1. **Strictly follow the schema** provided below while formatting the data and include everything which is given in the schema and is present in the scraped text.
2. **If something is not present then send empty string or empty array** for that field.
3. **Ensure numerical scores are initialized to zero** for:
   - \`profile_completeness\`
   - Skill \`score\`
   - AI interview \`score\`
   - Soft skill ratings (communication, teamwork, problem-solving, leadership)
4. **Extract relevant details** from the provided text and organize them under the appropriate schema fields.
4. **Descriptions for experience and projects must be arrays of bullet points**. Each bullet should be a string. if description only has one sentence then put it one value in the array.
6. **If a field is missing from the text**, leave it as an empty string (\`""\`) or an empty array (\`[]\`) where applicable.
7. **Ensure JSON validity**—output must be correctly formatted without syntax errors.
8. **Only exeption is the summary field. It should be a string of around 100 words with the summary of the user. The summary should be written in a way that is telling about the user from a third person perspective.**
9. **The top level field years_of_experience should be the number of years of experience the user has in total.**

---

### **Schema:**
\`\`\`json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "address": "string",
  "current_location": "string",
  "summary": "string",
  "profile_completeness": 0,
  "years_of_experience": 0,
  "designation": "string",
  "experience": [
    {
      "company": "string",
      "role": "string",
      "start_date": "string",
      "end_date": "string",
      "description": ["string"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "start_date": "string",
      "end_date": "string"
    }
  ],
  "skills": [
    {
      "name": "string",
      "category": "string",
      "years_experience": "number",
      "proficiency": "string",
      "score": 0
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": ["string"],
      "repository": "string",
      "technologies_used": ["string"],
      "features": ["string"]
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string"
    }
  ],
  "languages": [
    { "language": "string", "proficiency": "string" }
  ],
  "social_links": {
    "linkedin": "string",
    "github": "string",
    "portfolio": "string"
  },
  "culturalFit": {
    "product_score": 0,
    "service_score": 0,
    "startup_score": 0,
    "mnc_score": 0,
    "loyalty_score": 0,
    "coding_score": 0,
    "leadership_score": 0,
    "architecture_score": 0,
  },
  "ai_interviews": [
    {
      "title": "string",
      "date": "string",
      "score": 0,
      "responses": {
        "question_1": "string",
        "question_2": "string"
      },
      "feedback": "string"
    }
  ],
  "soft_skills": {
    "communication": 0,
    "teamwork": 0,
    "problem_solving": 0,
    "leadership": 0
  }
}
\`\`\`

---

### **Important Notes:**
- Certification and Participation are of the same type. If any section or field in the provided JSON output could be interpreted as either certification or participation, treat them equivalently and format them accordingly.
- Ensure that embedded link references such as '• Video' or '• Link' are removed from the text.
- Descriptions in \`experience\` and \`projects\` must be structured as **arrays of strings**. Each string should be a concise, meaningful bullet point extracted from the text. Make sure to not change any text from the description of the project or experience.

### **Scraped Text:**  
[${scrapedText}]

### **Expected Output Format:**
- The output must be valid JSON.
- Use placeholders (\`""\`, \`[]\`) for missing data instead of omitting fields.
- All scores must explicitly be \`0\`.

Return only the JSON output, without additional commentary.
`;
}

export function analyseUserPrompt(user: any, job: any): string {
  user = JSON.stringify(user);
  job = JSON.stringify(job);
  return `
  You are an advanced AI recruiter who analyse the user data and the job data and give a analysis of the user based on the job data.
  your job is to analyse the user data and the job data and give a analysis of the user based on the job data.
  the analysis should be in a way that is helpful for recruiter to understand the user is fit for the job or not.
  ### **User Data:**
  [${user}]
  ### **Job Data:**
  [${job}]
  ### **Expected Output Format:**
  {
    "analysis": "string"
  }
    important:
    - do not add any extra text or comments in the output.
    - do not add any extra fields in the output.
    - make sure the output is max to max 120 words.
    - analyse the user like a recruiter and give the analysis in a way that is helpful for recruiter to understand the user is fit for the job or not.
  `;
}

export function reformatPrompt(
  responseText: string,
  errorDetails: string
): string {
  return `
You are an advanced AI assistant. The JSON output you provided earlier does not strictly follow the required schema. Your task is to reformat the provided JSON output to exactly match the JSON schema below.

### **Instructions:**
1. **Strictly follow the schema** provided below. Ensure that all fields are present.
2. **If something is not present, use an empty string (""") or empty array ([])** for that field.
3. **Initialize all numerical scores to zero** for:
   - \`profile_completeness\`
   - Each skill's \`score\`
   - Each AI interview's \`score\`
   - Soft skill ratings (communication, teamwork, problem_solving, leadership)
4. **Descriptions for experience and projects must be arrays of bullet points**. Each bullet should be a string. if description only has one sentence then put it one value in the array.
5. **Ensure JSON validity**—output must be correctly formatted without any additional commentary.
6. **The top level field years_of_experience should be the number of years of experience the user has in total.**

---

### **Schema:**
\`\`\`json
{
  "name": "string",
  "email": "string",
  "phone": "string",
  "address": "string",
  "current_location": "string",
  "summary": "string",
  "profile_completeness": 0,
  "years_of_experience": 0,
  "experience": [
    {
      "company": "string",
      "role": "string",
      "start_date": "string",
      "end_date": "string",
      "description": ["string"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "start_date": "string",
      "end_date": "string"
    }
  ],
  "skills": [
    {
      "name": "string",
      "category": "string",
      "years_experience": number,
      "proficiency": "string",
      "score": 0
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": ["string"],
      "repository": "string",
      "technologies_used": ["string"],
      "features": ["string"]
    }
  ],
  "certifications": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string"
    }
  ],
  "languages": [
    { "language": "string", "proficiency": "string" }
  ],
  "social_links": {
    "linkedin": "string",
    "github": "string",
    "portfolio": "string"
  },
  "culturalFit": {
    "product_score": 0,
    "service_score": 0,
    "startup_score": 0,
    "mnc_score": 0,
    "loyalty_score": 0,
    "coding_score": 0,
    "leadership_score": 0,
    "architecture_score": 0,
  },
  "ai_interviews": [
    {
      "title": "string",
      "date": "string",
      "score": 0,
      "responses": {
        "question_1": "string",
        "question_2": "string"
      },
      "feedback": "string"
    }
  ],
  "soft_skills": {
    "communication": 0,
    "teamwork": 0,
    "problem_solving": 0,
    "leadership": 0
  }
}
\`\`\`

---

### **Validation Errors Identified:**
${errorDetails}

---

### **Previous JSON Output:**
[${responseText}]

---

Return only the JSON output that exactly matches the schema above.
  `;
}

export function culturalFitPrompt(schema: any): string {
  schema = JSON.stringify(schema);
  return `
  You are an advanced AI assistant.
  do not add any extra text or comments in the output other than specified in the instructions.
  your job is to analyze the User Data and give each of the fields a score between 1 and 5.
  product_score: 1 if he has no experience in product based companies and 5 if has worked in really good product based companies.
  service_score: 1 if he has no experience in service based companies and 5 if has worked in really good service based companies.
  startup_score: 1 if he has no experience in startup companies and 5 if has worked in really good startup companies.
  mnc_score: 1 if he has no experience in mnc companies and 5 if has worked in really good mnc companies.
  loyalty_score: 1 if he has done a lot of frequent job changes and 5 if he has worked in the same company for a long time.
  coding_score: 1 if he has no hand on experience in coding and 5 if he has built a things using his own coding skills.
  leadership_score: 1 if he has no experience in leading a team and 3 if he has managed a team of 5 or more people and 5 if he has led a team of 1 or more people.
  architecture_score: 1 if he has no experience in designing system architecture and 3 if he has designed a system architecture for a medium scale application and 5 if he has designed a system architecture for a large scale application.
  ### **Schema:**
\`\`\`json
const culturalFitSchema = new Schema({
  product_score: { type: Number, min: 0, max: 5},
  service_score: { type: Number, min: 0, max: 5},
  startup_score: { type: Number, min: 0, max: 5},
  mnc_score: { type: Number, min: 0, max: 5},
  loyalty_score: { type: Number, min: 0, max: 5},
  coding_score: { type: Number, min: 0, max: 5},
  leadership_score: { type: Number, min: 0, max: 5},
  architecture_score: { type: Number, min: 0, max: 5},
})
\`\`\`

### **User Data:**
[${schema}]

## **Instructions:**
- give each of the fields a score between 1 and 5.
- give the score based on the user data and the criteria given above.
- give the score according to mongoose format above.
- make sure to follow the output format strictly.
- all the scores are a number and not a string.
- do not add any extra text or comments in the output.

### **Expected Output Format:**

{
  "product_score": 0,
  "service_score": 0,
  "startup_score": 0,
  "mnc_score": 0,
  "loyalty_score": 0,
  "coding_score": 0,
  "leadership_score": 0,
  "architecture_score": 0
}
`;
}

export function expectedCulturalFitPrompt(schema: any): string {
  schema = JSON.stringify(schema);
  return `
  You are an advanced AI assistant.
  do not add any extra text or comments in the output other than specified in the instructions.
  your job is to analyze the Job Description and give each of the fields an expected score between 0 and 5.
  product_score: 1 if the job is mostly for service companies and 5 if it is clearly for a strong product based company.
  service_score: 1 if the job is mostly for product companies and 5 if it is clearly for a strong service based company.
  startup_score: 1 if the job is mostly for large companies and 5 if it is clearly for startups or high-growth companies.
  mnc_score: 1 if the job is mostly for startups and 5 if it is clearly for MNCs (large multinational companies).
  loyalty_score: 1 if the company is known for short-term contracts or temp work, and 5 if it encourages long-term employment.
  coding_score: 1 if the job is mostly for non-coding jobs and 5 if it is clearly for coding jobs.
  leadership_score: 1 if the job is mostly for non-leadership jobs and 5 if it is clearly for leadership jobs.
  architecture_score: 1 if the job is mostly for non-architecture jobs and 5 if it is clearly for architecture jobs.

  ### **Schema:**
\`\`\`json
const culturalFitSchema = new Schema({
  product_score: { type: Number, min: 0, max: 5},
  service_score: { type: Number, min: 0, max: 5},
  startup_score: { type: Number, min: 0, max: 5},
  mnc_score: { type: Number, min: 0, max: 5},
  loyalty_score: { type: Number, min: 0, max: 5},
  coding_score: { type: Number, min: 0, max: 5},
  leadership_score: { type: Number, min: 0, max: 5},
  architecture_score: { type: Number, min: 0, max: 5},
})
\`\`\`

### **Job Description:**
[${schema}]

## **Instructions:**
- give each of the fields a score between 1 and 5.
- give the score based on the job description and the criteria given above.
- give the score according to mongoose format above.
- make sure to follow the output format strictly.
- all the scores are a number and not a string.
- do not add any extra text or comments in the output.

### **Expected Output Format:**

{
  "product_score": 1,
  "service_score": 1,
  "startup_score": 1,
  "mnc_score": 1,
  "loyalty_score": 1,
  "coding_score": 1,
  "leadership_score": 1,
  "architecture_score": 1
}
  `;
}

export function skillsPrompt(schema: any, canonicalSkills: any): string {
  const skillsList = canonicalSkills.map((s: any) => `"${s}"`).join(", ");
  schema = JSON.stringify(schema);

  return `
You are an advanced AI assistant.
Your job is to analyze the user resume and evaluate each technical skill the user has.
Do not add any extra text or comments in the output other than specified in the instructions.

- Score each skill from 1 to 5:
  - 1 = no real experience or only brief exposure
  - 5 = deep industry-level or solid project experience
- Estimate years_experience from the resume context if available.
- Make sure the final output should only contain the skills that were present in the user resume.


### Schema:
\`\`\`json
const skillsSchema = new Schema({
  name: { type: String },
  years_experience: { type: Number },
  score: { type: Number, min: 0, max: 5 }
})
\`\`\`

### User Data:
[${schema}]

### Instructions:
- Normalize any new skill names to lowercase.
- All scores and years_experience must be numbers (not strings).
- Return each skill as an object using the schema provided.
- Do not include any other text or comments.
- i have added a list of canonical skills in the prompt so that you know how to name a skill like .Net or dotnet or .net 
- use the canonical skills list to name the skills.
- if the skill is not present in the canonical skills list then use the general naming convention to name the skill.
- If not in the list, include it using lowercase consistently.
- For any specific or lower-level technology, infer knowledge of its parent technology. For example:
- make sure to not miss any skill from the user resume.
- make sure years_experience is throughly analysed and is not a guess and is a number.

If someone knows .NET Framework or .NET Core, infer .NET

If someone knows Chi, infer Go

If someone knows Express, infer Node.js
and add all the skills to the list.
Apply this logic consistently for similar tech stacks.

### Canonical Skills List:
[${skillsList}]

### Expected Output Format:
[
  {
    "name": "string",
    "years_experience": Number,
    "score": Number
  }
]
`;
}

export function skillsPromptNoCanon(schema: any): string {
  schema = JSON.stringify(schema);
  return `
You are an advanced AI assistant.
Your job is to analyze the user resume and evaluate each technical skill the user has.
Do not add any extra text or comments in the output other than specified in the instructions.
For each skill, generate a short, clear summary (1-2 sentences) describing what the skill or technology is and what it is used for. This summary should be suitable for a recruiter or developer who may not be familiar with the technology. Do not add any extra text or comments in the output other than specified in the instructions.
the summary should start with the name of the skill then describe what it is used for.
for example: summary:"Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine. It allows developers to build server-side and network applications."

- Score each skill from 1 to 5:
  - 1 = no real experience or only brief exposure
  - 5 = deep industry-level or solid project experience
- Estimate years_experience from the resume context if available.
- Make sure the final output should only contain the skills that were present in the user resume.

### Schema:
\`\`\`json
const skillsSchema = new Schema({
  name: { type: String },
  summary: { type: String }, // A short, clear description of the skill or technology
  years_experience: { type: Number },
  score: { type: Number, min: 0, max: 5 }
})
\`\`\`

### User Data:
[${schema}]

### Instructions:
- Normalize all skill names to lowercase (e.g., "Node.js" → "node.js").
- All scores and years_experience must be numbers (not strings).
- For each skill, generate a short summary (1-2 sentences) describing what the skill is and what it is used for. The summary should be clear and concise, suitable for a recruiter or developer.
- Return each skill as an object using the schema provided.
- Do not include any other text or comments.
- For any specific or lower-level technology, infer knowledge of its parent technology. For example:
  - If someone knows .NET Framework or .NET Core, infer .NET
  - If someone knows Chi, infer Go
  - If someone knows Express, infer Node.js
  - Apply this logic consistently for similar tech stacks.
- Make sure to not miss any skill from the user resume.
- Make sure years_experience is thoroughly analysed and is not a guess and is a number.

### Expected Output Format:
[
  {
    "name": "string",
    "summary": "string",
    "years_experience": Number,
    "score": Number
  }
]
`;
}

export function expectedSkillsPrompt(
  schema: any,
  canonicalSkills: any
): string {
  const skillsList = canonicalSkills.map((s: any) => `"${s}"`).join(", ");
  schema = JSON.stringify(schema);

  return `
You are an advanced AI assistant.
Do not add any extra text or comments in the output other than specified in the instructions.

Your job is to carefully read the Job Description and extract a list of all the technical skills mentioned, implied, or required for the role.

- Include only technical skills: programming languages, frameworks, tools, libraries, databases, cloud services, devops, machine learning tools, etc.
- Do not include soft skills (e.g., communication, leadership) or general attributes.
- If the skill is not found in the list, still include it using consistent lowercase naming.
- Assign a score based on the emphasis of the skill in the job description:
  - 1: Skill is mentioned briefly or is optional.
  - 2-4: Skill has moderate importance.
  - 5: Skill is clearly mandatory or heavily emphasized.
- Estimate years_experience required for each skill based on the job description wording:
  - Junior: 0-1 years
  - Mid-level: 2-4 years
  - Senior: 5+ years
  - Expert: 7+ years
- Determine if a skill is explicitly stated as "mandatory", "required", or is so central to the job description (e.g., "Flutter" for a Flutter Developer, "Node.js" for a Node.js Developer) that it is clearly non-negotiable. Only mark a skill as mandatory if the job title or description strongly indicates its essential nature for the core responsibilities.
- make sure only important skills are marked as mandatory.

### Schema:
\`\`\`json
const skillsSchema = new Schema({
  name: { type: String },
  years_experience: { type: Number },
  score: { type: Number, min: 0, max: 5 },
  mandatory: { type: Boolean, default: false }
})
\`\`\`

### Job Description:
[${schema}]

### Instructions:
- Return the skills as a strict JSON array in the format specified below.
- Normalize any new skill names to lowercase.
- Do not include any extra text or explanations in the output.
- use the general naming convention for the skills. for example node.js is a skill but nodejs is not.
- i have added a list of canonical skills in the prompt so that you know how to name a skill like .Net or dotnet or .net 
- use the canonical skills list to name the skills.
- if the skill is not present in the canonical skills list then use the general naming convention to name the skill.
-For any specific or lower-level technology, infer knowledge of its parent technology. For example:

If someone knows .NET Framework or .NET Core, infer .NET

If someone knows Chi, infer Go

If someone knows Express, infer Node.js
Apply this logic consistently for similar tech stacks.

### Canonical Skills List:
[${skillsList}]

### Expected Output Format:
[
  {
    "name": "string",
    "years_experience": Number,
    "score": Number,
    "mandatory": Boolean
  }
]
`;
}

export function expectedSkillsPromptNoCanon(schema: any): string {
  schema = JSON.stringify(schema);
  return `
You are an advanced AI assistant.
Do not add any extra text or comments in the output other than specified in the instructions.

Your job is to carefully read the Job Description and extract a list of all the technical skills mentioned, implied, or required for the role.
For each skill, generate a short, clear summary (1-2 sentences) describing what the skill or technology is and what it is used for. This summary should be suitable for a recruiter or developer who may not be familiar with the technology. Do not add any extra text or comments in the output other than specified in the instructions.
the summary should start with the name of the skill then describe what it is used for.
for example: summary:"Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine. It allows developers to build server-side and network applications."

- Include only technical skills: programming languages, frameworks, tools, libraries, databases, cloud services, devops, machine learning tools, etc.
- Do not include soft skills (e.g., communication, leadership) or general attributes.
- Assign a score based on the emphasis of the skill in the job description:
  - 1: Skill is mentioned briefly or is optional.
  - 2-4: Skill has moderate importance.
  - 5: Skill is clearly mandatory or heavily emphasized.
- Estimate years_experience required for each skill based on the job description wording:
  - Junior: 0-1 years
  - Mid-level: 2-4 years
  - Senior: 5+ years
  - Expert: 7+ years
- Determine if a skill is explicitly stated as "mandatory", "required", or is so central to the job description (e.g., "Flutter" for a Flutter Developer, "Node.js" for a Node.js Developer) that it is clearly non-negotiable. Only mark a skill as mandatory if the job title or description strongly indicates its essential nature for the core responsibilities.
- Make sure only important skills are marked as mandatory.

### Schema:
\`\`\`json
const skillsSchema = new Schema({
  name: { type: String },
  summary: { type: String }, // A short, clear description of the skill or technology
  years_experience: { type: Number },
  score: { type: Number, min: 0, max: 5 },
  mandatory: { type: Boolean, default: false }
})
\`\`\`

### Job Description:
[${schema}]

### Instructions:
- Normalize all skill names to lowercase (e.g., "Node.js" → "node.js").
- All scores and years_experience must be numbers (not strings).
- For each skill, generate a short summary (1-2 sentences) describing what the skill is and what it is used for. The summary should be clear and concise, suitable for a recruiter or developer.
- Return each skill as an object using the schema provided.
- Do not include any other text or comments.
- For any specific or lower-level technology, infer knowledge of its parent technology. For example:
  - If someone knows .NET Framework or .NET Core, infer .NET
  - If someone knows Chi, infer Go
  - If someone knows Express, infer Node.js
  - Apply this logic consistently for similar tech stacks.
- Make sure to not miss any skill from the job description.
- Make sure years_experience is thoroughly analysed and is not a guess and is a number.

### Expected Output Format:
[
  {
    "name": "string",
    "summary": "string",
    "years_experience": Number,
    "score": Number,
    "mandatory": Boolean
  }
]

### Instructions:
- Do not include any comments, explanations, or additional text before, during, or after the JSON output.
`;
}

export function updatedExpectedSkillsPrompt(schema: any): string {
  schema = JSON.stringify(schema);
  return `You are an expert AI assistant. Your sole function is to analyze the provided Job Description (JD) text and extract the required professional skills.
**Your Task:**
1.  **Identify**: Meticulously scan the JD to identify all required professional skills, tools, software, platforms, and methodologies. Exclude soft skills (e.g., communication, teamwork).
2.  **Handle Umbrella Skills**: Treat both general categories (e.g., "Cloud Platforms") and specific tools within them (e.g., "AWS") as separate, individual skills.
3.  **Evaluate**: For each identified skill, you will provide:
    *   A score (from 1 to 5) indicating its importance.
    *   An estimated years_experience required.
    *   A  summary defining the skill within the scope of the role.
    *   A weightage score representing its relative importance.
    *   If that skill is mandatory for that skill or not.
4.  **Output**: Produce a single, clean JSON array containing an object for each skill.
---
### **Detailed Instructions & Evaluation Guidelines**
For each skill, you must generate the following four fields:
*   **score (1-5 Scale)**: Assess the absolute importance of the skill to the role.
    *   Lower Score: The skill is mentioned as optional, a "plus," or is a minor part of the responsibilities.
    *   Mid-Range Score: The skill is a standard requirement and part of the day-to-day responsibilities but not the single most critical element.
    *   Higher Score: The skill is explicitly mandatory, central to the job title (e.g., "React Developer"), or repeatedly emphasized as a core, non-negotiable requirement.
*   **years_experience (Integer)**: Estimate the required years of experience based on the role's seniority (e.g., "Senior," "Lead," "Junior") and the complexity of the tasks described. Provide a reasonable integer estimate. If impossible to determine, use 0.
*   **summary (String)**: This is a critical instruction. Provide a definition of what the skill entails, specifically scoped to how the job description requires it to be used.
    *   Your goal is to define the term itself, but only using the evidence within the JD. Answer the question: "For this role, what does proficiency in this skill actually mean?"
    *   This is NOT a copy-paste of the JD's responsibilities. It is a synthesized definition of the skill's application.
    *   Example:
        *   JD Text: "The candidate will build and maintain ETL pipelines using SQL to transform data in our Snowflake data warehouse."
        *   Skill: SQL
        *   Correct summary: "A query language required for designing, building, and maintaining ETL data transformation pipelines within a data warehouse environment."
*   **weightage (Integer)**: This is the most important field for ranking. Assign a relative importance value to each skill.
    *   The sum of all weightage values for all skills in the output must equal 100.
    *   Base this value on the score and overall emphasis. A skill with a high score must receive a proportionally larger share of the 100 total points than a skill with a low score. This reflects its true priority in the role.
*  **Determine if a skill is explicitly stated as "mandatory", "required", or is so central to the job description (e.g., "Flutter" for a Flutter Developer, "Node.js" for a Node.js Developer) that it is clearly non-negotiable. Only mark a skill as mandatory if the job title or description strongly indicates its essential nature for the core responsibilities    
### Schema:
const skillsSchema = new Schema({
  name: { type: String },
  summary: { type: String }, // A definition of the skill as required for this role
  years_experience: { type: Number },
  score: { type: Number, min: 1, max: 5 },
  weightage: { type: Number },
  mandatory: { type: Boolean, default: false }
})

### Job Description:
[${schema}]

### Expected Output Format:
[
  {
    "name": "string",
    "summary": "string",
    "years_experience": Number,
    "score": Number,
    "weightage": Number,
    "mandatory": Boolean
  }
]

### Instructions:
  - Do not include any comments, explanations, or additional text before, during, or after the JSON output.
  `;
}

export function updatedExpectedCulturalFitPrompt(schema: any): string {
  schema = JSON.stringify(schema);
  return `
---
You are an advanced AI assistant.
Your task is to analyze the provided **Job Description (JD)** and assign an **expected score** from 1 to 5 for each of the specified fields. These scores must reflect the ideal candidate profile and company culture as implied or stated in the JD.
You must only return the result in the specified JSON format. Do not include any comments, explanations, or additional text before, during, or after the JSON output.
---
### **SCORING PARAMETERS:**
-   **product_score**: Reflects the degree to which the role is centered within a **product-based company**, where the primary focus is on a proprietary product (e.g., SaaS, consumer app).
    *   **Description**: Assess the company and role type based on the JD.
        *   **Lower Score**: The role is explicitly in a service, consulting, or agency environment, focused on client delivery.
        *   **Mid-Range Score**: The role exists in a hybrid company (e.g., product with a strong services arm) or the JD is ambiguous, blending product and client-service responsibilities.
        *   **Higher Score**: The role is unambiguously within a product-centric company, with responsibilities tied directly to building, maintaining, or growing a specific product.
-   **service_score**: Reflects the degree to which the role is centered within a **service-based company**, focusing on client delivery, consulting, or managed services.
    *   **Description**: Assess the role's orientation toward external client work.
        *   **Lower Score**: The role is internally focused at a product company with minimal or no required client delivery responsibilities.
        *   **Mid-Range Score**: The role is a hybrid, such as "Solutions Engineer" or "Customer Success," requiring significant client interaction alongside product expertise.
        *   **Higher Score**: The role's primary function is serving external clients within a consulting, outsourcing, or professional services firm.
-   **startup_score**: Reflects the degree to which the role operates in a **startup-like environment**, characterized by a fast pace, ambiguity, broad responsibilities, and building from scratch.
    *   **Description**: Determine the expected work environment.
        *   **Lower Score**: The JD describes a highly structured, corporate environment with well-defined and specialized roles.
        *   **Mid-Range Score**: The role is in a "scale-up" or a new, agile division within a larger company that adopts startup principles.
        *   **Higher Score**: The JD describes a startup culture, emphasizing a need for a proactive, self-starting individual comfortable with rapid change and undefined processes.
-   **mnc_score**: Reflects the degree to which the role operates within a **large, multinational corporation (MNC)**, characterized by formal processes, global teams, and matrixed organizational structures.
    *   **Description**: Gauge the organizational structure and scale.
        *   **Lower Score**: The company is described as a startup or a small/medium business.
        *   **Mid-Range Score**: The company is a mid-to-large size national company or a less structured MNC.
        *   **Higher Score**: The JD is for a large, established global corporation, and the role requires navigating its complex, structured environment.
-   **loyalty_score**: Reflects the company's **implied desire for long-term commitment** based on the nature of the role.
    *   **Description**: Evaluate the implicit expectation for employee tenure.
        *   **Lower Score**: The role is explicitly a short-term contract, temporary, or project-based with a defined end.
        *   **Mid-Range Score**: The role is a standard permanent position with no specific language implying tenure expectations.
        *   **Higher Score**: The role is described as foundational or strategic, where stability and long-term investment are implicitly crucial for success.
-   **coding_score**: Reflects the extent to which the role is a hands-on **"doer" or Individual Contributor (IC)**.
    *   **Description**: Assess the primary function of the role.
        *   **Lower Score**: The role is predominantly managerial or strategic, focusing on overseeing others, planning, and delegation.
        *   **Mid-Range Score**: The role is a hybrid (e.g., "Team Lead") that involves both hands-on execution and supervisory duties.
        *   **Higher Score**: The role's responsibilities are centered on direct, personal execution of tasks (e.g., "Software Engineer," "Digital Marketer").
-   **people_management_score**: Reflects the requirement for **formal people management** skills and responsibilities.
    *   **Description**: Determine if the role manages people's careers.
        *   **Lower Score**: The role is an Individual Contributor or a lead without formal reports.
        *   **Mid-Range Score**: The role mentions "leading a team" or "mentorship" but lacks explicit details about formal management duties like performance reviews or hiring.
        *   **Higher Score**: The JD explicitly states responsibilities for the full people management lifecycle, including performance reviews, career development, and hiring for the team.
-   **technical_leadership_score**: Reflects the requirement for guiding **technical direction and strategy**, separate from managing people.
    *   **Description**: Gauge the role's influence over technical decisions.
        *   **Lower Score**: The role is focused on implementation, following a pre-defined technical direction.
        *   **Mid-Range Score**: The role is for a senior team member expected to mentor others and contribute to design decisions.
        *   **Higher Score**: The role is explicitly a "Technical Lead," "Staff Engineer," or "Architect" responsible for setting technical standards and making critical design decisions.
---
### Job Description:
[${schema}]

### Expected Output Format:
{
  "product_score": Number,
  "service_score": Number,
  "startup_score": Number,
  "mnc_score": Number,
  "loyalty_score": Number,
  f"coding_score": Number,
  "people_management_score": Number,
  "technical_leadership_score": Number
}

### Instructions:
  - Do not include any comments, explanations, or additional text before, during, or after the JSON output.
`;
}

export function updatedSkillsPrompt(schema: any): string {
  schema = JSON.stringify(schema);
  return `
You are an expert AI resume analyzer. Your sole function is to analyze the provided resume text and evaluate the specialized skills, tools, and platforms mentioned within it.
**Your Task:**
1.  **Identify**: Meticulously scan the resume to identify all professional skills, tools, software, platforms, and methodologies.
2.  **Handle Umbrella Skills**: Treat both general categories (e.g., "CRM") and specific tools (e.g., "Salesforce") as separate, individual skills.
3.  **Evaluate**: For each identified skill, you will provide:
    *   A \`skill_score\` (from 1 to 5).
    *   An estimated \`years_experience\`.
    *   A \`summary\` that defines the skill based on its application in the resume.
4.  **Output**: Produce a single, clean JSON array containing an object for each skill.
---
### **Detailed Instructions**
#### **Rule for General Categories and Specific Tools (Umbrella Skills)**
If the resume mentions a general category and specific examples, capture **both** as separate items. For example, if it says *"experienced with cloud platforms like AWS and Azure,"* create entries for "Cloud Platforms," "AWS," and "Azure."
#### **Evaluation Guidelines**
For each skill, you must generate the following three fields:
*   **\`skill_score\` (1-5 Scale)**: Assess the depth of experience.
    *   **Lower Score**: For skills listed without context or used in minor projects.
    *   **Mid-Range Score**: For skills used as a regular part of a job but not as a core focus.
    *   **Higher Score**: For skills fundamental to the candidate's primary responsibilities and achievements.
*   **\`years_experience\` (Integer)**: Estimate the professional years of use based on job timelines. If impossible to determine, use \`0\`.
*   **\`summary\` (String)**: **This is the most critical instruction.** For each skill, provide a definition of what that skill entails, **specifically scoped to how the candidate has applied it**.
    *   **Your goal is to define the term itself, but only using the evidence present in the resume.** Answer the question: "What does this skill mean in the context of this person's experience?"
    *   This is **NOT** a list of the candidate's achievements or a copy-paste from the resume. It is a synthesized definition.
    *   **Example 1**:
        *   **Resume Text**: "Managed network security by configuring and optimizing Check Point firewall rule-bases and monitoring traffic logs."
        *   **Skill**: \`Firewall Management\`
        *   **Correct \`summary\`**: "The administration of network firewalls, specifically involving the configuration and optimization of rule-sets and the analysis of traffic logs."
        *   **Incorrect meaning**: "The candidate managed firewalls and optimized rules." (This is what they *did*, not what the skill *means* in this context).
    *   **Example 2**:
        *   **Resume Text**: "Led project teams by tracking tasks in Jira, running daily stand-ups, and reporting on progress to leadership."
        *   **Skill**: \`Project Management\`
        *   **Correct \`summary\`**: "The practice of overseeing project execution through task tracking, conducting daily team meetings, and status reporting."
        *   **Incorrect meaning (too broad)**: "The process of leading the work of a team to achieve all project goals." (This is a generic definition, not tailored to the resume).
        ### Schema:
      \`\`\`json
        const skillsSchema = new Schema({
        name: { type: String },
        summary: { type: String }, // A short, clear description of the skill or technology
        years_experience: { type: Number },
        score: { type: Number, min: 0, max: 5 }
        })
      \`\`\`

      ### User Data:
      [${schema}]
   ### Expected Output Format:
   [
    {
     "name": "string",
     "summary": "string",
     "years_experience": Number,
     "score": Number
    }
  ]

`;
}

export function updatedCulturalFitPrompt(schema: any): string {
  schema = JSON.stringify(schema);
  return `
You are an advanced AI assistant.
  Your task is to analyze the provided resume content and assign a score from 1 to 5 for each of the specified fields. These scores should reflect your objective judgment of the candidate's cultural alignment and experience depth *solely based on the information present in the resume*.
  You must only return the result in the specified JSON format. Do not include any comments, explanations, or additional text before, during, or after the JSON output.
  ## SCORING PARAMETERS:
  -   **product_score**: Reflects how much time the individual has spent working **within product-based companies**. This includes companies where the core revenue comes from a product (e.g., SaaS platforms, consumer apps), and not just from services or client work.
      * **Description**: Evaluate the candidate's career trajectory. A lower score signifies minimal to no experience focused on product development within product-based organizations. A mid-range score indicates some involvement in product environments, possibly alongside significant service-based roles, or limited direct product impact. A higher score denotes extensive and deep exposure to product company culture, evidenced by consistent roles emphasizing product roadmaps, cross-functional collaboration, and direct contribution to product success.
  -   **service_score**: Reflects experience in **service-based companies**, such as IT consulting, managed services, outsourcing firms, or professional services. This includes experience working on client projects, delivery models, SLAs, and multi-client handling.
      * **Description**: Assess the candidate's background in service-oriented roles. A lower score implies negligible experience in service delivery. A mid-range score suggests a blend of service and other experiences, or a moderate engagement with client projects and delivery models. A higher score indicates a career heavily embedded in service delivery culture, with extensive experience managing client relationships, project lifecycles, and adherence to SLAs.
  -   **startup_score**: Reflects experience working in **startup environments**, characterized by fast-paced work, small teams, ambiguity, broad responsibilities, and building from scratch. It does not include just working in a small team inside a big company.
      * **Description**: Determine the candidate's exposure to startup culture. A lower score means no explicit or clear startup experience. A mid-range score might suggest indirect exposure or roles within larger entities that possessed some startup-like characteristics. A higher score points to strong, verifiable experience in multiple startup environments, demonstrating comfort with rapid change, broad responsibilities, and building solutions from the ground up.
  -   **mnc_score**: Reflects experience in **multinational corporations (MNCs)** — large, global companies with mature processes, regulatory compliance, distributed teams, and layered hierarchies.
      * **Description**: Gauge the candidate's familiarity with MNC structures. A lower score signifies limited to no experience in large, global corporate settings. A mid-range score suggests some exposure to MNCs, possibly in more localized roles or for shorter durations. A higher score reflects extensive and consistent experience navigating the complexities of large-scale MNC organizations, including mature processes, global collaboration, and compliance.
  -   **loyalty_score**: Represents **job stability and retention behavior (job switch)**. Focus especially on **recent roles**. Early-career frequent switches are acceptable, but consistent short stints (e.g., <1.5 years) in recent roles reduce this score.
      * **Description**: Evaluate the candidate's job tenure patterns, particularly in recent years. A lower score indicates frequent job switching, with consistently short tenures. A higher score signifies consistent long tenures in recent professional history, demonstrating predictability and dependability in commitment to roles.
  -   **coding_score**: Reflects the degree of the candidate's direct, hands-on execution of the core functions of their role. This score measures the extent to which the individual is a "doer," personally creating the tangible outputs and deliverables central to their job, regardless of the field (e.g., writing code for an engineer, creating campaigns for a marketer, closing deals for a salesperson). This score is inversely related to time spent on delegation, high-level strategy, or management.
  Description: Assess the candidate's role as a direct, hands-on contributor.
  Lower Score: Reserved for roles that are predominantly focused on oversight, delegation, strategy, or management. The candidate is primarily responsible for directing the work of others with minimal personal execution of core tasks.
  Mid-Range Score: Indicates a hybrid role where the candidate performs some hands-on work but also has significant responsibilities in management, coordination, or strategy.
  Higher Score: Assigned to a classic Individual Contributor (IC). The candidate's primary responsibility is the direct creation of tangible deliverables, and their resume shows consistent, active, and personal involvement in producing the core work of their function.
  -   **leadership_score**: Strictly reflects formal people management experience. This involves explicit responsibilities for the careers and performance of direct reports, such as conducting performance reviews, managing compensation, hiring and firing, approving time off, and being formally responsible for team members' career growth and mentorship. This score is only awarded when there is clear evidence of these specific duties.
  Description: Determine the depth of the candidate's formal people management experience.
  Lower Score: No evidence of formal people management. The candidate is an individual contributor, a project lead, or a technical lead without formal HR-related authority over team members.
  Mid-Range Score: Some supervisory duties are mentioned (e.g., "managed a team of 5," "had direct reports"), but there are no specific details about performance reviews, hiring, or other core people management functions. The role may be supervisory without full managerial authority.
  Higher Score: Assigned to candidates with clear, repeated, and detailed experience as a true people manager. The resume explicitly mentions responsibilities like conducting performance reviews, managing career development, and direct involvement in hiring/firing decisions for their team.

  -   **architecture_score**: 
  Assesses the candidate's experience in guiding the technical direction, strategy, and quality for a team or project, distinct from people management. This includes making key technical decisions, establishing best practices, leading system design, mentoring engineers on technical skills, and taking ownership of the overall technical execution and health of a project or system. This is the realm of a Technical Lead, Staff/Principal Engineer, or Architect who guides the "how" of the work.
  Description: Gauge the candidate's influence over technical direction and execution.
  Lower Score: The candidate is primarily an implementer who executes assigned tasks. There is no evidence of influencing technical decisions, mentoring others, or setting technical direction.
  Mid-Range Score: Indicates emerging technical leadership. The candidate may have led a small project, been the "go-to" person for a specific domain, actively participated in code reviews, or mentored junior team members on technical tasks.
  Higher Score: Assigned to candidates who are a clear technical authority. They are responsible for setting the technical vision for their team, making critical architecture and design decisions, enforcing technical standards, and are ultimately accountable for the technical success of their projects, even if they don't manage the people directly.

  ### resume content:
  [${schema}]

  ### Expected Output Format:
  {
    "product_score": Number,
    "service_score": Number,
    "startup_score": Number,
    "mnc_score": Number,
    "loyalty_score": Number,
    "coding_score": Number,
    "leadership_score": Number,
    "architecture_score": Number
  }

### Instructions:
  - Do not include any comments, explanations, or additional text before, during, or after the JSON output.
`;
}

export function resumeEmbeddingPrompt(text: string): string {
  return `
You are a highly skilled recruitment assistant specialized in semantic matching. Your task is to analyze the provided resume text and generate a dense, keyword-rich summary. This summary will be used to create a vector embedding for matching the candidate against job descriptions.

### **Instructions:**
1.  **Focus on Core Competencies:** Extract and emphasize the candidate's key skills, technologies, and areas of expertise.
2.  **Highlight Experience:** Summarize the candidate's professional experience, mentioning roles, key responsibilities, and significant achievements. Quantify achievements where possible (e.g., "managed a team of 5," "increased efficiency by 15%").
3.  **Include Education and Certifications:** Briefly mention the candidate's educational background and any relevant certifications.
4.  **Be Concise and Factual:** The output should be a single, dense paragraph. Do not use bullet points or markdown. Stick to the information present in the resume.
5.  **Optimize for Matching:** The language should be tailored for semantic comparison with job descriptions. Use industry-standard terminology.

### **Resume Text:**
\`\`\`
${text}
\`\`\`

### **Expected Output:**
A single paragraph of dense, keyword-rich text summarizing the candidate's profile. Do not include any other text or explanation.
`;
}

export function jobEmbeddingPrompt(text: string): string {
  return `
You are an intelligent text analysis model. Your task is to extract key information from the following job description and structure it into a JSON object. Focus on identifying the core skills, required experience, and key responsibilities.

### **Job Description:**
[${text}]

### **Instructions:**
1.  Extract the essential skills, tools, and technologies mentioned.
2.  Summarize the primary responsibilities and qualifications.
3.  Structure the output as a clean, well-formed JSON object.
`;
}

export async function jdCvMatchingPrompt(jdText: string, jobId: string) {
  const jobRequiredSkills = await JobRequiredSkills.findOne({ jobId: jobId });
  const skills = jobRequiredSkills?.skills || [];

  let primaryInstructions: string;
  let skillScoringInstructions: string;

  if (skills.length > 0) {
    const skillsString = skills.join(", ");
    primaryInstructions = `
1.  **Use Pre-defined Skills**: You have been given a specific list of skills to evaluate.
2.  **Analyze the Resume**: Read the candidate's resume file to find evidence for the provided skills.
3.  **Score and Calculate**: Perform the scoring and calculations as detailed below.
4.  **Format Output**: Assemble the results into the required JSON structure.`;

    skillScoringInstructions = `
-   You have been provided with a pre-defined list of required technical skills for this job. **Your task is to score the candidate ONLY on these skills.**
-   **Required Skills List**: [${skillsString}]
-   For each skill in the list, you must find evidence in the candidate's resume and assign a score from 1 to 5.
-   **Score 1-2**: The skill is mentioned but with little context, or in relation to education/minor projects.
-   **Score 3-4**: The skill is clearly used in a professional context and is part of their regular responsibilities.
-   **Score 5**: The skill is central to the candidate's major achievements and core responsibilities in their recent roles.
-   If a skill from the provided list is **not found** in the resume, its score must be \`null\`.
-   The "skill" name in the output array must be the skill from the provided list.`;
  } else {
    primaryInstructions = `
1.  **Analyze the Job Description**: First, identify all the technical skills required by the job description. These skills will form the basis of your skill-based evaluation.
2.  **Analyze the Resume**: Read the candidate's resume file to understand their experience, skills, and career history.
3.  **Score and Calculate**: Perform the scoring and calculations as detailed in the sections below.
4.  **Format Output**: Assemble the results into the required JSON structure.`;

    skillScoringInstructions = `
-   For each technical skill you identified in the JD, you must find evidence in the candidate's resume and assign a score from 1 to 5.
-   **Score 1-2**: The skill is mentioned but with little context, or in relation to education/minor projects.
-   **Score 3-4**: The skill is clearly used in a professional context and is part of their regular responsibilities.
-   **Score 5**: The skill is central to the candidate's major achievements and core responsibilities in their recent roles.
-   If a skill from the JD is **not found** in the resume, its score must be \`null\`.
-   The "skill" name in the output array must be the skill from the JD.`;
  }

  return `
You are a world-class AI recruitment assistant. Your task is to perform a deep analysis of a candidate's resume against a provided job description (JD). You will receive the JD as text and will be given access to the candidate's resume file.

Your final output must be a single, valid JSON object and nothing else.

---
### **Primary Instructions**
${primaryInstructions}
---
### **Step 1: Candidate Skill Scoring (\`perSkillMatch\`)**
${skillScoringInstructions}
---
### **Step 2: Candidate Cultural Fit Scoring (\`perCulturalFitMatch\`)**

-   Analyze the entire resume to score the candidate against the following 8 traits. Use the detailed descriptions below for your evaluation. The score for each trait must be between 1 and 5.

*   **product_score**: Reflects experience in **product-based companies**.
    *   **Description**: A lower score signifies minimal experience focused on product development. A higher score denotes extensive exposure to product company culture, evidenced by roles emphasizing product roadmaps and direct contribution to product success.
*   **service_score**: Reflects experience in **service-based companies** (e.g., IT consulting, outsourcing).
    *   **Description**: A lower score implies negligible experience in service delivery. A higher score indicates a career heavily embedded in service delivery culture, with extensive experience managing client relationships and project lifecycles.
*   **startup_score**: Reflects experience in **startup environments** (fast-paced, ambiguous, broad responsibilities).
    *   **Description**: A lower score means no explicit startup experience. A higher score points to strong, verifiable experience in startup environments, demonstrating comfort with rapid change.
*   **mnc_score**: Reflects experience in **multinational corporations (MNCs)** with mature processes and global teams.
    *   **Description**: A lower score signifies limited experience in large, global corporate settings. A higher score reflects extensive experience navigating the complexities of large-scale MNC organizations.
*   **loyalty_score**: Represents **job stability**. Focus on recent roles. Consistent short stints (<1.5 years) in recent roles reduce this score.
    *   **Description**: A lower score indicates frequent job switching. A higher score signifies consistent long tenures in recent professional history.
*   **individual_contribution_score**: Reflects hands-on execution. This score measures the extent to which the individual is a "doer."
    *   **Description**: A lower score is for roles focused on oversight, delegation, or pure management. A higher score is for a classic Individual Contributor (IC) whose resume shows consistent, active, and personal involvement in producing core work.
*   **leadership_score**: Strictly reflects formal **people management** experience (performance reviews, hiring, career management).
    *   **Description**: A lower score indicates no evidence of formal people management. A higher score is for candidates with clear, detailed experience as a true people manager.
*   **architecture_score**: Assesses experience in guiding **technical direction and strategy**, distinct from people management.
    *   **Description**: A lower score is for an implementer. A higher score is for a clear technical authority (e.g., Tech Lead, Principal Engineer) responsible for setting technical vision and making critical design decisions.

---
### **Step 3: Calculation of Percentages**

-   **percentageSkillMatch**: Calculate this as: \`((Total of all candidateSkill scores) / (Number of skills * 5)) * 100\`. If a candidate's score for a skill is \`null\`, it contributes 0 to the total. The "Number of skills" is either the size of the provided list or the number of skills you identified from the JD.
-   **percentageCulturalFitMatch**: Calculate this as: \`((Total of all candidate cultural fit scores) / (8 * 5)) * 100\`.
-   **percentageMatchScore**: Calculate this as a weighted average: \`(percentageSkillMatch * 0.6) + (percentageCulturalFitMatch * 0.4)\`.

---
### **Job Description Text**
\`\`\`
${jdText}
\`\`\`

---
### **Final Output Schema**

-   Your main task is to generate *only* the analysis fields shown in the schema below.
-   The final output must be a single JSON object containing only the specified analysis fields. Do not include candidate personal data like name, email, or location.

\`\`\`json
{
    "percentageSkillMatch": "number",
    "percentageCulturalFitMatch": "number",
    "percentageMatchScore": "number",
    "perSkillMatch": [
        {
            "skill": "string",
            "candidateScore": "number | null"
        }
    ],
    "perCulturalFitMatch": [
        {
            "trait": "string",
            "candidateScore": "number"
        }
    ]
}
\`\`\`
`;
}