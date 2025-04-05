import { z } from "zod";

const experienceSchema = z.object({
    company: z.string(),
    role: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    description: z.string()
  });
  
  const educationSchema = z.object({
    institution: z.string(),
    degree: z.string(),
    start_date: z.string(),
    end_date: z.string()
  });
  
  const skillSchema = z.object({
    name: z.string(),
    category: z.string(),
    years_experience: z.string().or(z.number()),
    proficiency: z.string(),
    score: z.number()
  });
  
  const projectSchema = z.object({
    name: z.string(),
    description: z.string(),
    repository: z.string(),
    technologies_used: z.array(z.string()),
    features: z.array(z.string())
  });
  
  const certificationSchema = z.object({
    name: z.string(),
    issuer: z.string(),
    date: z.string()
  });
  
  const languageSchema = z.object({
    language: z.string(),
    proficiency: z.string()
  });
  
  const socialLinksSchema = z.object({
    linkedin: z.string(),
    github: z.string(),
    portfolio: z.string()
  });
  
  const aiInterviewSchema = z.object({
    title: z.string(),
    date: z.string(),
    score: z.number(),
    responses: z.object({
      question_1: z.string(),
      question_2: z.string()
    }),
    feedback: z.string()
  });
  
  const softSkillsSchema = z.object({
    communication: z.number(),
    teamwork: z.number(),
    problem_solving: z.number(),
    leadership: z.number()
  });
  
  // Define the main resume schema that wraps the expected response in a "responce" key.
export const resumeSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  address: z.string().optional(),
  current_location: z.string().optional(),
  summary: z.string(),
  profile_completeness: z.number(),
  experience: z.array(experienceSchema),
  education: z.array(educationSchema),
  skills: z.array(
    skillSchema.omit({ score: true }) // Remove `score`
  ),
  projects: z.array(
    projectSchema.extend({
      technologies_used: z.array(z.string()).default([]),
      features: z.array(z.string()).default([]),
    })
  ),
  certifications: z.array(certificationSchema),
  languages: z.array(languageSchema),
  social_links: socialLinksSchema.extend({
    linkedin: z.string().optional(),
    github: z.string().optional(),
    portfolio: z.string().optional(),
  }),
  ai_interviews: z.array(
    aiInterviewSchema.extend({
      responses: z.object({
        question_1: z.string().optional(),
        question_2: z.string().optional(),
      }),
    })
  ),
  soft_skills: softSkillsSchema,
});

