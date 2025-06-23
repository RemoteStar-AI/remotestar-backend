# Remotestar V6 API Specification

This document provides a detailed specification for the V6 API endpoints of the Remotestar application. It is intended for frontend developers and other parties who need to interact with the API.

## Authentication

All endpoints are protected and require a valid Firebase authentication token to be sent in the `Authorization` header as a Bearer token.

`Authorization: Bearer <FIREBASE_ID_TOKEN>`

---

## 1. Embed API (`/v6/embed`)

This API is responsible for handling resume uploads, processing, and re-analysis.

### 1.1. Upload Resumes

-   **Endpoint:** `POST /`
-   **Description:** Uploads one or more resume files for processing. This is an asynchronous endpoint. It immediately returns a `processingId` and then processes the files in the background. A webhook can be used for receiving progress updates and results.
-   **Request:** `multipart/form-data`
    -   **files**: An array of resume files.
    -   **jobId** (optional, string): The ID of the job to associate the resumes with.
    -   **organisation_id** (optional, string): The ID of the organization.
    -   **webhook_url** (optional, string): A URL to send processing status updates to.

-   **Success Response (202 Accepted):**
    ```json
    {
      "message": "Resume processing started",
      "processingId": "a-unique-processing-id",
      "status": "pending"
    }
    ```

-   **Error Responses:**
    -   **400 Bad Request:** If no files are provided or if the request body validation fails.
    -   **500 Internal Server Error:** For any other server-side errors.

-   **Webhook Payload:**
    If a `webhook_url` is provided, the server will `POST` updates to that URL.

    -   **Progress Update:**
        ```json
        {
          "processingId": "a-unique-processing-id",
          "status": "processing",
          "progress": 50,
          "results": [
            {
              "filename": "resume1.pdf",
              "success": true,
              "data": {
                "userId": "...",
                "name": "John Doe",
                "...": "..."
              }
            }
          ]
        }
        ```
    -   **Completion Update:**
        ```json
        {
          "processingId": "a-unique-processing-id",
          "status": "completed",
          "progress": 100,
          "results": [
            {
              "filename": "resume1.pdf",
              "success": true,
              "data": { ... }
            },
            {
              "filename": "resume2.pdf",
              "success": false,
              "error": "Resume already exists in organisation"
            }
          ]
        }
        ```
    -   **Failure Update:**
        ```json
        {
          "processingId": "a-unique-processing-id",
          "status": "failed",
          "error": "Processing failed"
        }
        ```

### 1.2. Get Upload Status

-   **Endpoint:** `GET /status/:processingId`
-   **Description:** Retrieves the processing status of a resume upload batch.
-   **Request Parameters:**
    -   `processingId` (string): The ID returned from the `POST /` endpoint.
-   **Success Response (200 OK):**
    The response body is the same as the webhook payload (`completed`, `processing`, or `failed`).
    ```json
    {
      "status": "completed",
      "progress": 100,
      "results": [ ... ]
    }
    ```
-   **Error Responses:**
    -   **404 Not Found:** If the `processingId` does not exist.

### 1.3. Re-analyse Resume

-   **Endpoint:** `POST /reanalyse/:id`
-   **Description:** Re-analyzes an existing user's profile. An optional new resume file can be uploaded to replace the existing one.
-   **Request:** `multipart/form-data`
    -   **id** (string, URL parameter): The ID of the user to re-analyse.
    -   **file** (optional): A new resume file for the user.
-   **Success Response (200 OK):**
    ```json
    {
      "message": "Reanalysis complete",
      "user": { ... },      // The updated User object
      "skills": [ ... ],    // The new skills object
      "culturalFit": { ... } // The new cultural fit object
    }
    ```
    (See `schema.ts` for `User`, `skillsSchema`, and `culturalFitSchema` details).
-   **Error Responses:**
    -   **404 Not Found:** If the user with the given `id` is not found.
    -   **500 Internal Server Error:** For any other server-side errors during re-analysis.

---

## 2. Job API (`/v6/job`)

This API manages job postings.

### 2.1. Get Jobs

-   **Endpoint:** `GET /`
-   **Description:** Fetches all jobs for a given company and/or organisation.
-   **Request Query Parameters:**
    -   `companyId` (string): The ID of the company.
    -   `organisation_id` (string): The ID of the organisation.
-   **Success Response (200 OK):**
    ```json
    {
      "message": "Jobs fetched successfully",
      "data": [
        // Array of Job objects
        {
          "_id": "...",
          "companyId": "...",
          "title": "Software Engineer",
          "description": "...",
          "..." : "..."
        }
      ]
    }
    ```
-   **Error Responses:**
    -   **500 Internal Server Error:** If there is an error fetching jobs.

### 2.2. Create Job

-   **Endpoint:** `POST /`
-   **Description:** Creates a new job posting.
-   **Request Body:** A JSON object matching the `jobSchema`. The `organisation_id` is automatically inferred from the authenticated user.
    ```json
    {
      "companyId": "string",
      "title": "string",
      "description": "string",
      "location": "string",
      "jobType": "full-time" | "part-time" | "contract" | "internship",
      "salaryFrequency": "yearly" | "monthly" | "hourly",
      "salary": "string" (optional),
      "useRanges": boolean,
      "minSalary": "string" (optional),
      "maxSalary": "string" (optional),
      "applicationProcess": "interview" | "assessment" | "direct",
      "yearsOfExperience": {
        "min": "string",
        "max": "string"
      },
      "additionalRequirements": "string" (optional),
      "expectedSkills": [
        {
          "name": "string",
          "years_experience": number,
          "score": number,
          "mandatory": boolean (optional)
        }
      ] (optional),
      "expectedCulturalFit": { ... } (optional)
    }
    ```
-   **Success Response (200 OK):**
    ```json
    {
      "message": "Job created successfully",
      "data": { ... } // The created Job object
    }
    ```
-   **Error Responses:**
    -   **400 Bad Request:** If the request body validation fails.
    -   **500 Internal Server Error:** If job creation fails.

### 2.3. Delete Job

-   **Endpoint:** `DELETE /:id`
-   **Description:** Deletes a job by its ID.
-   **Request Parameters:**
    -   `id` (string): The ID of the job to delete.
-   **Success Response (200 OK):**
    ```json
    {
      "message": "Job deleted successfully",
      "data": { ... } // The deleted Job object
    }
    ```
-   **Error Responses:**
    -   **404 Not Found:** If the job with the given ID is not found.
    -   **500 Internal Server Error:** If the deletion fails.

---

## 3. Search API (`/v6/search`)

This API provides candidate search functionality based on job profiles.

### 3.1. Search Candidates for a Job

-   **Endpoint:** `GET /:jobId`
-   **Description:** Finds and returns the top matching candidates for a specific job. Supports pagination with `start` and `limit` query parameters. The maximum number of results returned per request is capped at 50.
-   **Request Parameters:**
    -   `jobId` (string): The ID of the job to find candidates for.
    -   `start` (integer, query, optional): The starting index for pagination (default: 0).
    -   `limit` (integer, query, optional): The number of results to return (default: 20, max: 50).
-   **Success Response (200 OK):**
    ```json
    {
      "jobTitle": "Software Engineer",
      "jobId": "...",
      "start": 0,
      "limit": 20,
      "data": [
        {
          "userId": "...",
          "name": "Jane Doe",
          "email": "jane.doe@example.com",
          "years_of_experience": 5,
          "designation": "Senior Developer",
          "uploader_email": "uploader@example.com",
          "current_location": "San Francisco, CA",
          "isBookmarked": false,
          "total_bookmarks": 2,
          "bookmarkedBy": [ "some_user_id" ]
        }
      ]
    }
    ```
-   **Notes:**
    - The sum of `start + limit` cannot exceed 50. If a higher value is requested, only up to the 50th result will be returned.
    - The `data` array contains the paginated user profiles for the job.
-   **Error Responses:**
    -   **400 Bad Request:** If the `jobId` format is invalid.
    -   **404 Not Found:** If the job or its embedding is not found.
    -   **500 Internal Server Error:** For any other server-side errors during the search process.

---

## 4. User API (`/v6/user`)

This API provides endpoints to fetch and delete user profiles, including detailed analysis and bookmark information.

### 4.1. Get User Profile for a Job

-   **Endpoint:** `GET /:jobId/:userId`
-   **Description:** Returns a detailed user profile for a given job and user, including skills, cultural fit, analysis, and bookmark info.
-   **Request Parameters:**
    -   `jobId` (string): The job ID for which to fetch the analysis.
    -   `userId` (string): The user ID whose profile is being fetched.
-   **Success Response (200 OK):**
    ```json
    {
      "_id": "user_id",
      "name": "Jane Doe",
      "email": "jane.doe@example.com",
      "phone": "+1234567890",
      "address": "123 Main St",
      "current_location": "San Francisco, CA",
      "summary": "Experienced frontend developer...",
      "profile_completeness": 95,
      "experience": [
        {
          "company": "Acme Corp",
          "role": "Frontend Developer",
          "start_date": "2020-01-01",
          "end_date": "2022-01-01",
          "description": ["Worked on UI components", "Led frontend team"]
        }
      ],
      "education": [
        {
          "institution": "State University",
          "degree": "BSc Computer Science",
          "start_date": "2016-01-01",
          "end_date": "2020-01-01"
        }
      ],
      "skills": [
        [
          { "name": "React", "years_experience": 3, "score": 5 },
          { "name": "TypeScript", "years_experience": 2, "score": 4 }
        ]
      ],
      "projects": [
        {
          "name": "Portfolio Website",
          "description": ["Personal site"],
          "repository": "https://github.com/janedoe/portfolio",
          "technologies_used": ["React", "Next.js"],
          "features": ["SSR", "SEO"]
        }
      ],
      "certifications": [
        { "name": "AWS Certified Developer", "issuer": "Amazon", "date": "2021-06-01" }
      ],
      "languages": [
        { "language": "English", "proficiency": "Native" }
      ],
      "social_links": {
        "linkedin": "https://linkedin.com/in/janedoe",
        "github": "https://github.com/janedoe",
        "portfolio": "https://janedoe.dev"
      },
      "ai_interviews": [
        {
          "title": "Frontend Interview",
          "date": "2023-01-01",
          "score": 85,
          "responses": {
            "question_1": "Answered question 1",
            "question_2": "Answered question 2"
          },
          "feedback": "Great communication skills"
        }
      ],
      "job_preferences": {
        "current_location": "San Francisco, CA",
        "preferred_locations": ["Remote", "San Francisco"],
        "salary_expectation": 120000,
        "employment_type": ["full-time"],
        "notice_period": 30,
        "reason_for_switch": "Career growth",
        "work_type": ["remote"]
      },
      "soft_skills": {
        "communication": 5,
        "teamwork": 4,
        "problem_solving": 5,
        "leadership": 4
      },
      "resume_url": "https://s3.amazonaws.com/bucket/resume.pdf",
      "firebase_id": "firebase_uid",
      "firebase_email": "uploader@example.com",
      "organisation_id": "org_id",
      "firebase_uploader_name": "Uploader Name",
      "job": "job_id",
      "isBookmarked": true,
      "analysis": {
        // Job-specific analysis data (structure may vary)
      },
      "bookmarkedBy": ["user_id_1", "user_id_2"],
      "skills": [
        [
          { "name": "React", "years_experience": 3, "score": 5 },
          { "name": "TypeScript", "years_experience": 2, "score": 4 }
        ]
      ],
      "culturalFit": [
        {
          "product_score": 4,
          "service_score": 5,
          "startup_score": 3,
          "mnc_score": 4,
          "loyalty_score": 5,
          "coding_score": 5,
          "leadership_score": 4,
          "architecture_score": 4
        }
      ]
    }
    ```
    -   `skills` is an array of arrays (each inner array is a skill set from a Skills document).
    -   `culturalFit` is an array of objects (each from a CulturalFit document).
    -   `analysis` is job-specific and may vary in structure.
    -   `isBookmarked` is true if the current user has bookmarked this profile.
    -   `bookmarkedBy` is an array of user IDs who have bookmarked this profile.

-   **Error Responses:**
    -   **404 Not Found:** If the user is not found.
    -   **500 Internal Server Error:** For any other server-side errors.

### 4.2. Delete User

-   **Endpoint:** `DELETE /:id`
-   **Description:** Deletes a user and all related data (skills, cultural fit, bookmarks, job analyses, and S3 resume file).
-   **Request Parameters:**
    -   `id` (string): The user ID to delete.
-   **Success Response (200 OK):**
    ```json
    {
      "message": "User deleted successfully"
    }
    ```
-   **Error Responses:**
    -   **404 Not Found:** If the user is not found.
    -   **500 Internal Server Error:** For any other server-side errors.
