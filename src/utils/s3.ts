import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY!,
    secretAccessKey: process.env.AWS_SECRET_KEY!,
  },
});



export const uploadPDFToS3 = async (fileBuffer: Buffer, filename: string, mimetype: string) => {
  const key = `resumes/${uuidv4()}-${filename}`;
  console.log("access key: ", process.env.AWS_ACCESS_KEY);
  console.log("secret key: ", process.env.AWS_SECRET_KEY);
  console.log("bucket name: ", process.env.AWS_BUCKET_NAME);
  console.log("region: ", process.env.AWS_REGION);
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key: key,
    Body: fileBuffer,
    ContentType: mimetype,
  }));
  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};