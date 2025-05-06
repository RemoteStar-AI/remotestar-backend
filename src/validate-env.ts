import dotenv from "dotenv";

dotenv.config();
import { z } from "zod";

const envSchema = z.object({
    NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().min(1),
    PINECONE_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    PORT: z.string().min(1),
    MONGODB_URI: z.string().min(1),
    FIREBASE_SERVICE_ACCOUNT: z.string().min(1)
});

const env = envSchema.parse(process.env);

console.log("✅ Environment variables validated.");