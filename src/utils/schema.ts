import { z } from "zod";

const experienceSchema = z.object({
    company: z.string(),
    role: z.string(),
    start_date: z.string(),
    end_date: z.string(),
    description: z.array(z.string())
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
    description: z.array(z.string()),
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
  
  const jobPreferencesSchema = z.object({
    current_location: z.string(),
    preferred_locations: z.array(z.string()),
    salary_expectation: z.number(),
    employment_type: z.array(z.string()),
    notice_period: z.number(),
    reason_for_switch: z.string(),
    work_type: z.array(z.string()),
  });
  // Define the main resume schema that wraps the expected response in a "responce" key.
export const resumeSchema = z.object({
  _id: z.string().optional(),
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
  job_preferences: jobPreferencesSchema.optional(),
  soft_skills: softSkillsSchema,
});


export const culturalFitSchema = z.object({
  product_score: z.number(),
  service_score: z.number(),
  startup_score: z.number(),
  mnc_score: z.number(),
  loyalty_score: z.number(),
  coding_score: z.number(),
  leadership_score: z.number(),
  architecture_score: z.number(),
});

export const skillsSchema = z.array(z.object({
  name: z.string(),
  years_experience: z.number(),
  score: z.number(),
}))

export const jobSchema = z.object({
  _id: z.string().optional(),
  companyId: z.string(),
  title: z.string(),
  description: z.string(),
  organisation_id: z.string().optional(),
  location: z.string(),
  jobType: z.enum(["full-time", "part-time", "contract", "internship"]),
  salaryFrequency: z.enum(["yearly", "monthly", "hourly"]),
  salary: z.string().optional(),
  useRanges: z.boolean(),
  minSalary: z.string().optional(),
  maxSalary: z.string().optional(),
  applicationProcess: z.enum(["interview", "assessment", "direct"]),
  yearsOfExperience: z.object({
    min: z.string(),
    max: z.string(),
  }),
  additionalRequirements: z.string().optional(),
  expectedSkills: z.array(z.object({
    name: z.string(),
    years_experience: z.number(),
    score: z.number(),
    mandatory: z.boolean().optional()
  })).optional(),
  expectedCulturalFit: culturalFitSchema.optional(),
});

export const deleteJobSchema = z.object({
  _id: z.string(),
});

export const organisationSchema = z.object({
  _id: z.string().optional(),
  name: z.string(),
  members: z.array(z.string()).optional(),
  admin: z.array(z.string()).optional(),
});

export const bookmarkSchema = z.object({
  _id: z.string().optional(),
  userId: z.string(),
  memberId: z.string(),
  jobId: z.string(),
});