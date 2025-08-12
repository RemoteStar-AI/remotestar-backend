import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import type { Readable } from "stream";

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

// New functions for video upload presigned URLs
export const generateVideoUploadPresignedUrl = async (
  userId: string,
  sessionId: string,
  chunkNumber: number,
  expiresIn = 300 // 5 minutes for security
) => {
  const timestamp = Date.now();
  const chunkId = uuidv4();
  
  // Create unique filename with metadata
  const filename = `${timestamp}-chunk-${chunkNumber}-${chunkId}.webm`;
  const key = `videos/${userId}/${sessionId}/${filename}`;
  
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_VIDEO_BUCKET_NAME!,
    Key: key,
    ContentType: 'video/webm',
    ServerSideEncryption: 'AES256', // Required by bucket policy
    Metadata: {
      'user-id': userId,
      'session-id': sessionId,
      'chunk-number': chunkNumber.toString(),
      'timestamp': timestamp.toString(),
      'chunk-id': chunkId,
      'upload-type': 'video-chunk'
    }
  });
  
  const presignedUrl = await getSignedUrl(videoS3, command, { expiresIn });
  
  return {
    presignedUrl,
    key,
    filename,
    metadata: {
      userId,
      sessionId,
      chunkNumber,
      timestamp,
      chunkId
    }
  };
};

export const deleteVideoChunkFromS3 = async (key: string) => {
  await videoS3.send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_VIDEO_BUCKET_NAME!,
      Key: key,
    })
  );
};

export const getVideoChunkSignedUrl = async (key: string, expiresIn = 3600) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_VIDEO_BUCKET_NAME!,
    Key: key,
  });
  return await getSignedUrl(videoS3, command, { expiresIn });
};

// One-time (single object) video upload presigned URL
export const generateOneTimeVideoUploadPresignedUrl = async (
  candidateId: string,
  contentType: string = "video/webm",
  expiresIn: number = 900 // 15 minutes
) => {
  const timestamp = Date.now();
  const uploadId = uuidv4();

  const extension = (() => {
    if (contentType.includes("mp4")) return "mp4";
    if (contentType.includes("webm")) return "webm";
    if (contentType.includes("quicktime")) return "mov";
    if (contentType.includes("x-matroska") || contentType.includes("mkv")) return "mkv";
    return "webm";
  })();

  const filename = `${timestamp}-full-${uploadId}.${extension}`;
  const key = `videos/${candidateId}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_VIDEO_BUCKET_NAME!,
    Key: key,
    ContentType: contentType,
    ServerSideEncryption: "AES256",
    Metadata: {
      "candidate-id": candidateId,
      "timestamp": timestamp.toString(),
      "upload-id": uploadId,
      "upload-type": "video-single",
    },
  });

  const presignedUrl = await getSignedUrl(videoS3, command, { expiresIn });

  return {
    presignedUrl,
    key,
    filename,
    metadata: {
      candidateId,
      timestamp,
      uploadId,
    },
  };
};

// Create a 15-minute GET presigned URL from a video link (or key)
export const getVideoSignedUrlFromLink = async (
  fileUrlOrKey: string,
  expiresIn: number = 900
) => {
  let key = fileUrlOrKey;

  if (fileUrlOrKey.startsWith("https://")) {
    const url = new URL(fileUrlOrKey);
    key = url.pathname.startsWith("/") ? url.pathname.slice(1) : url.pathname;
    key = decodeURIComponent(key);
  }

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_VIDEO_BUCKET_NAME!,
    Key: key,
  });

  return await getSignedUrl(videoS3, command, { expiresIn });
};
