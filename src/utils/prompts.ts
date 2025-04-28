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
- Descriptions in \`experience\` and \`projects\` must be structured as **arrays of strings**. Each string should be a concise, meaningful bullet point extracted from the text.

### **Scraped Text:**  
[${scrapedText}]

### **Expected Output Format:**
- The output must be valid JSON.
- Use placeholders (\`""\`, \`[]\`) for missing data instead of omitting fields.
- All scores must explicitly be \`0\`.

Return only the JSON output, without additional commentary.
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
  return `
  You are an advanced AI assistant.
  do not add any extra text or comments in the output other than specified in the instructions.
  your job is to analyze the User Data and give each of the fields a score between 1 and 5.
  product_score: 1 if he has no experience in product based companies and 5 if has worked in really good product based companies.
  service_score: 1 if he has no experience in service based companies and 5 if has worked in really good service based companies.
  startup_score: 1 if he has no experience in startup companies and 5 if has worked in really good startup companies.
  mnc_score: 1 if he has no experience in mnc companies and 5 if has worked in really good mnc companies.
  loyalty_score: 1 if he has done a lot of frequent job changes and 5 if he has worked in the same company for a long time.
  ### **Schema:**
\`\`\`json
const culturalFitSchema = new Schema({
  product_score: { type: Number, min: 0, max: 5},
  service_score: { type: Number, min: 0, max: 5},
  startup_score: { type: Number, min: 0, max: 5},
  mnc_score: { type: Number, min: 0, max: 5},
  loyalty_score: { type: Number, min: 0, max: 5},
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
  "loyalty_score": 0
}
`;
}

export function skillsPrompt(schema: any): string {
  return `
  You are an advanced AI assistant.do not add any extra text or comments in the output other than specified in the instructions. Your job is to take the user data and 
  give each skill in his resume a score of 1 to 5.

  1 if he has no solid projects or experience in the skill.
  5 if he has a solid project or Industry level experience in the skill.
  make sure to diffrentiate between skills based upon quality of the projects and the experience they have used that skill in.

  try to obtain relevant experience from the user data. and put it in the years_experience field.


  ### **Schema:**
  \`\`\`json
  const skillsSchema = new Schema({
  name: { type: String },
  years_experience: { type: Number },
  score: { type: Number, min: 0, max: 5}
})
\`\`\`

### **User Data:**
[${schema}]

## **Instructions:**
- give each skill a score between 1 and 5.
- give the score based on the user data and the criteria given above.
- give the score according to mongoose format above.
- make sure to follow the output format strictly.
- all the scores are a number and not a string.
- do not add any extra text or comments in the output.

### **Expected Output Format:**

{
  "name": "string",
  "years_experience": Number,
  "score": Number
}

  `;
}

export function expectedCulturalFitPrompt(schema: any): string {
  return `
  You are an advanced AI assistant.
  do not add any extra text or comments in the output other than specified in the instructions.
  your job is to analyze the Job Description and give each of the fields an expected score between 0 and 5.
  product_score: 1 if the job is mostly for service companies and 5 if it is clearly for a strong product based company.
  service_score: 1 if the job is mostly for product companies and 5 if it is clearly for a strong service based company.
  startup_score: 1 if the job is mostly for large companies and 5 if it is clearly for startups or high-growth companies.
  mnc_score: 1 if the job is mostly for startups and 5 if it is clearly for MNCs (large multinational companies).
  loyalty_score: 1 if the company is known for short-term contracts or temp work, and 5 if it encourages long-term employment.

  ### **Schema:**
\`\`\`json
const culturalFitSchema = new Schema({
  product_score: { type: Number, min: 0, max: 5},
  service_score: { type: Number, min: 0, max: 5},
  startup_score: { type: Number, min: 0, max: 5},
  mnc_score: { type: Number, min: 0, max: 5},
  loyalty_score: { type: Number, min: 0, max: 5},
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
  "loyalty_score": 1
}
  `;
}

export function expectedSkillsPrompt(schema: any): string {
  return `
  You are an advanced AI assistant.
  do not add any extra text or comments in the output other than specified in the instructions.
  your job is to carefully read the Job Description and extract a list of all the technical skills mentioned, implied, or required for the role.

  - Include only technical skills: programming languages, frameworks, tools, libraries, databases, cloud services, devops, machine learning tools, etc.
  - Do not include any soft skills (like communication, leadership, teamwork) or extracurricular activities.
  - Assign a score:
    - 1 if the skill is only slightly mentioned or optional.
    - 5 if the skill is clearly mandatory or heavily emphasized.
  - Estimate years_experience based on the seniority level or wording (junior: 0-1 years, mid-level: 2-4 years, senior: 5+ years, expert: 7+ years).

  ### **Schema:**
\`\`\`json
const skillsSchema = new Schema({
  name: { type: String },
  years_experience: { type: Number },
  score: { type: Number, min: 0, max: 5}
})
\`\`\`

### **Job Description:**
[${schema}]

## **Instructions:**
- List all relevant technical skills from the job description.
- Assign each skill a score between 1 and 5 based on importance.
- Estimate expected years of experience if mentioned or implied.
- Format the result as an array of skill objects following the mongoose schema.
- All scores and years_experience must be numbers (not strings).
- Do not add any extra text, explanations, or comments.

### **Expected Output Format:**

[
  {
    "name": "string",
    "years_experience": Number,
    "score": Number
  },
  {
    "name": "string",
    "years_experience": Number,
    "score": Number
  }
]
  `;
}