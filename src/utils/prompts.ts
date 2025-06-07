import { ScriptTarget } from "typescript";

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
  const skillsList = canonicalSkills.map((s: any) => `"${s}"`).join(', ');
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



export function expectedSkillsPrompt(schema: any, canonicalSkills: any): string {
  const skillsList = canonicalSkills.map((s: any) => `"${s}"`).join(', ');
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