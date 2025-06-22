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
-   **Description:** Finds and returns the top matching candidates for a specific job.
-   **Request Parameters:**
    -   `jobId` (string): The ID of the job to find candidates for.
-   **Success Response (200 OK):**
    ```json
    {
      "jobTitle": "Software Engineer",
      "jobId": "...",
      "totalCandidates": 50,
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
-   **Error Responses:**
    -   **400 Bad Request:** If the `jobId` format is invalid.
    -   **404 Not Found:** If the job or its embedding is not found.
    -   **500 Internal Server Error:** For any other server-side errors during the search process.
