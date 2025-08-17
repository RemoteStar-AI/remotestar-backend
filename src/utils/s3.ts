import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import type { Readable } from "stream";
import fetch from "node-fetch";
import logger from "./loggers";

dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
  },
  forcePathStyle: false,
  requestHandler: undefined,
});

// Video bucket S3 client (separate from resume bucket)
const videoS3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
  },
  forcePathStyle: false,
  requestHandler: undefined,
});

export const uploadPDFToS3 = async (fileBuffer: Buffer, filename: string, mimetype: string) => {
  const key = `resumes/${uuidv4()}-${filename}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
      Body: fileBuffer,
      ContentType: mimetype,
    })
  );
  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

// Generate presigned URL for uploading a resume (PDF or other doc types) directly to S3
export const generateResumeUploadPresignedUrl = async (
  filename: string,
  contentType: string,
  expiresIn: number = 900 // 15 minutes
) => {
  const key = `resumes/${uuidv4()}-${filename}`;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
  });
  const presignedUrl = await getSignedUrl(s3, command, { expiresIn });
  return {
    presignedUrl,
    key,
    filename,
    expiresIn,
  };
};

export const getSignedUrlForResume = async (key: string, expiresIn = 3600) => {
  let fileKey = key;
  if (key.startsWith("https://")) {
    const url = new URL(key);
    fileKey = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
    fileKey = decodeURIComponent(fileKey);
  }
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: fileKey,
  });
  return await getSignedUrl(s3, command, { expiresIn });
};

export const deleteFileFromS3 = async (fileUrlOrKey: string) => {
  // Accepts either a full S3 URL or just the key
  let key = fileUrlOrKey;
  // If a full URL is provided, extract the key
  if (fileUrlOrKey.startsWith("https://")) {
    const url = new URL(fileUrlOrKey);
    // The key is everything after the bucket domain
    key = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
  }
  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
    })
  );
};

// Fetch object contents from the resume bucket as a Buffer
export const getResumeObjectBuffer = async (keyOrUrl: string): Promise<Buffer> => {
  let key = keyOrUrl;
  if (keyOrUrl.startsWith("https://")) {
    const url = new URL(keyOrUrl);
    key = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
    key = decodeURIComponent(key);
  }
  const resp = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME!,
      Key: key,
    })
  );
  const body = resp.Body as Readable | undefined;
  if (!body) return Buffer.from([]);
  const chunks: Buffer[] = [];
  for await (const chunk of body as any) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
};

// Fetch arbitrary video content from a remote URL into a Buffer
async function getVideoObjectBuffer(url: string): Promise<{ buffer: Buffer; contentType?: string }> {
  const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_FETCH_TIMEOUT_MS);
  try {
    logger.info(`[S3] Fetching video from URL: ${url}`);
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      const message = `Failed to fetch video (${response.status} ${response.statusText})`;
      logger.error(`[S3] ${message} for URL: ${url}`);
      throw new Error(message);
    }
    const contentType = response.headers.get("content-type") || undefined;
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logger.info(`[S3] Fetched video buffer: ${buffer.length} bytes, contentType=${contentType ?? "unknown"}`);
    return { buffer, contentType };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const message = `Timed out fetching video after ${DEFAULT_FETCH_TIMEOUT_MS}ms`;
      logger.error(`[S3] ${message} for URL: ${url}`);
      throw new Error(message);
    }
    logger.error(`[S3] Error fetching video from URL: ${url} - ${error?.message ?? error}`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


export async function copyVideofromVapiToRemotestarVideoS3Bucket(vapiVideoUrl: string, key: string): Promise<string> {
  const rawBucket = process.env.AWS_VIDEO_BUCKET_NAME || "remotestar-video-bucket";
  const VIDEO_BUCKET_NAME = rawBucket.trim();
  if (!vapiVideoUrl || !key) {
    const message = `Both vapiVideoUrl and key are required`;
    logger.error(`[S3] ${message}. Given: url=${!!vapiVideoUrl}, key=${!!key}`);
    throw new Error(message);
  }
  try {
    const objectKey = key.startsWith("videos/") ? key : `videos/${key}`;
    logger.info(`[S3] Uploading video to bucket=${VIDEO_BUCKET_NAME}, key=${objectKey}`);

    // Validate bucket exists and is accessible in this region
    try {
      await videoS3.send(new HeadBucketCommand({ Bucket: VIDEO_BUCKET_NAME }));
    } catch (e: any) {
      logger.error(`[S3] HeadBucket failed for bucket='${VIDEO_BUCKET_NAME}' in region='${process.env.AWS_REGION}'. Error: ${e?.name || e?.Code || 'Unknown'}: ${e?.message || e}`);
      throw new Error("Configured video bucket is invalid or not accessible");
    }
    const { buffer, contentType } = await getVideoObjectBuffer(vapiVideoUrl);
    await videoS3.send(
      new PutObjectCommand({
        Bucket: VIDEO_BUCKET_NAME,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      })
    );
    const url = `https://${VIDEO_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${objectKey}`;
    logger.info(`[S3] Uploaded video to ${url}`);
    return url;
  } catch (error: any) {
    const awsCode = error?.name || error?.Code || "UnknownError";
    logger.error(`[S3] Failed to upload video to key=${key} in bucket=${VIDEO_BUCKET_NAME} - ${awsCode}: ${error?.message ?? error}`);
    throw error;
  }
}


export async function getSignedUrlForVideo(callId: string) {
  const VIDEO_BUCKET_NAME = process.env.AWS_VIDEO_BUCKET_NAME || "remotestar-video-bucket";
  const key = `videos/${callId}`;
  const command = new GetObjectCommand({
    Bucket: VIDEO_BUCKET_NAME,
    Key: key,
  });
  return await getSignedUrl(videoS3, command, { expiresIn: 3600 });
}

export interface VideoStreamResult {
  body: Readable;
  contentLength?: number;
  contentType?: string;
  contentRange?: string;
}

export async function getVideoObjectStream(callId: string, rangeHeader?: string): Promise<VideoStreamResult> {
  const VIDEO_BUCKET_NAME = process.env.AWS_VIDEO_BUCKET_NAME || "remotestar-video-bucket";
  const key = `videos/${callId}`;
  const command = new GetObjectCommand({
    Bucket: VIDEO_BUCKET_NAME,
    Key: key,
    Range: rangeHeader,
  });
  const resp = await videoS3.send(command);
  const body = resp.Body as Readable | undefined;
  if (!body) {
    throw new Error("Empty S3 body stream");
  }
  return {
    body,
    contentLength: resp.ContentLength,
    contentType: resp.ContentType,
    contentRange: resp.ContentRange,
  };
}