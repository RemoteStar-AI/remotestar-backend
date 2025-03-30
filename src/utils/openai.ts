import {OpenAI} from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const openaiApi = process.env.OPENAI_API_KEY;

export const openai = new OpenAI({ apiKey: openaiApi }); 