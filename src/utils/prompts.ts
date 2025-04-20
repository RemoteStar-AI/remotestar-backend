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

export function reformatPrompt(responseText: string, errorDetails: string): string {
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
