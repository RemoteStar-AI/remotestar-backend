export function extractPrompt(scrapedText: string): string {
    return `
  You are an advanced AI assistant. Your task is to process the following scraped text and structure it into a predefined JSON schema.
  
  ### **Instructions:**
  1. **Strictly follow the schema** provided below while formatting the data.
  2. **Ensure numerical scores are initialized to zero** for:
     - \`profile_completeness\`
     - Skill \`score\`
     - AI interview \`score\`
     - Soft skill ratings (communication, teamwork, problem-solving, leadership)
  3. **Extract relevant details** from the provided text and organize them under the appropriate schema fields.
  4. **Make sure to add relevant descriptions of all the experiences and projects from the scraped text exactly without any shortening
  5. **If a field is missing from the text**, leave it as an empty string (\`""\`) or an empty array (\`[]\`) where applicable.
  6. **Ensure JSON validity**—output must be correctly formatted without syntax errors.
  
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
        "description": "string"
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
        "description": "string",
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
  
  ### **Scraped Text:**  
  [${scrapedText}]
  
  ---
  
  ### **Expected Output Format:**
  - The output must be valid JSON.
  - Use placeholders (\`""\`, \`[]\`) for missing data instead of omitting fields.
  - All scores must explicitly be \`0\`.
  
  Return only the JSON output, without additional commentary.
  `;
}  


export function reformatPrompt(responseText: string): string {
  return `
You are an advanced AI assistant. The JSON output you provided earlier does not strictly follow the required schema. Your task is to reformat the provided JSON output to exactly match the JSON schema below.

### **Instructions:**
1. **Strictly follow the schema** provided below. Ensure that all fields are present.
2. **Initialize all numerical scores to zero** for:
   - \`profile_completeness\`
   - Each skill's \`score\`
   - Each AI interview's \`score\`
   - Soft skill ratings (communication, teamwork, problem-solving, leadership)
3. **For any missing or invalid data**, use an empty string (\`""\`) for text fields or an empty array (\`[]\`) for array fields.
4. **Ensure JSON validity**—output must be correctly formatted without any additional commentary.

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
      "description": "string"
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
      "description": "string",
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

### **Previous JSON Output:**
[${responseText}]

---

Return only the JSON output that exactly matches the schema above.
  `;
}
