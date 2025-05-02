import mongoose, { Schema } from "mongoose";



const userSchema = new Schema({
  firebase_id: { type: String, required: true },
  firebase_email: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true},
  phone: { type: String },
  address: { type: String },
  current_location: { type: String },
  summary: { type: String },
  profile_completeness: { type: Number, min: 0},
  
  experience: [{
    company: { type: String },
    role: { type: String },
    start_date: { type: String },
    end_date: { type: String },
    description: [{ type: String }]
  }],

  education: [{
    institution: { type: String },
    degree: { type: String },
    start_date: { type: String },
    end_date: { type: String }
  }],

  skills: [{
    name: { type: String },
    category: { type: String },
    years_experience: { type: Number },
    proficiency: { type: String },
    score: { type: Number }
  }],

  projects: [{
    name: { type: String },
    description: [{ type: String }],
    repository: { type: String },
    technologies_used: [{ type: String }],
    features: [{ type: String }]
  }],

  certifications: [{
    name: { type: String },
    issuer: { type: String },
    date: { type: String }
  }],

  languages: [{
    language: { type: String },
    proficiency: { type: String }
  }],

  social_links: {
    linkedin: { type: String },
    github: { type: String },
    portfolio: { type: String }
  },

  ai_interviews: [{
    title: { type: String },
    date: { type: String },
    score: { type: Number },
    responses: { type: Map, of: String },
    feedback: { type: String }
  }],

  soft_skills: {
    communication: { type: Number },
    teamwork: { type: Number },
    problem_solving: { type: Number },
    leadership: { type: Number }
  },

  job_preferences: {
    current_location: { type: String },
    preferred_locations: [{ type: String }],
    salary_expectation: { type: Number },
    employment_type: [{ type: String }],
    notice_period: { type: Number },
    reason_for_switch: { type: String },
    work_type: [{ type: String }]
  }
}, { timestamps: true });

const culturalFitSchema = new Schema({
  userId: { type: String, required: true },
  product_score: { type: Number, min: 0, max: 5},
  service_score: { type: Number, min: 0, max: 5},
  startup_score: { type: Number, min: 0, max: 5},
  mnc_score: { type: Number, min: 0, max: 5},
  loyalty_score: { type: Number, min: 0, max: 5},
}, { timestamps: true });

const culturalFitSchema2 = new Schema({
  userId: { type: String, optional: true },
  product_score: { type: Number, min: 0, max: 5},
  service_score: { type: Number, min: 0, max: 5},
  startup_score: { type: Number, min: 0, max: 5},
  mnc_score: { type: Number, min: 0, max: 5},
  loyalty_score: { type: Number, min: 0, max: 5},
}, { timestamps: true });

const skillsSchema = new Schema({
  name: { type: String },
  years_experience: { type: Number },
  score: { type: Number, min: 0, max: 5}
});

const userSkillsSchema = new Schema({
  userId: { type: String, required: true },
  skills: [skillsSchema],
}, { timestamps: true });

const companySchema = new Schema({
  name: { type: String, required: true },
  website: { type: String, optional: true },
});

//fix : need to remove optional true from expectedSkills and expectedCulturalFit
const jobSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String, required: true },
  jobType: { type: String, enum: ['full-time', 'part-time', 'contract', 'internship'], required: true },
  salaryFrequency: { type: String, enum: ['yearly', 'monthly', 'hourly'], required: true },
  salary: { type: String, default: "" },
  useRanges: { type: Boolean, default: false },
  minSalary: { type: String, default: "" },
  maxSalary: { type: String, default: "" },
  applicationProcess: { type: String, enum: ['interview', 'assessment', 'direct'], required: true },
  yearsOfExperience: {
    min: { type: String, default: "0" },
    max: { type: String, default: "0" }
  },
  additionalRequirements: { type: String, default: "" },
  expectedSkills: { type: [skillsSchema.add({ mandatory: { type: Boolean, default: false } })], default: [], optional: true },
  expectedCulturalFit: { type: culturalFitSchema2, default: {} ,optional:true},
}, { timestamps: true });

const canonicalSkillsSchema = new Schema({
  name: { type: String, required: true, unique: true },
});

export const Job = mongoose.model("Job", jobSchema);
export const Company = mongoose.model("Company", companySchema);
export const CulturalFit = mongoose.model("CulturalFit", culturalFitSchema);
export const Skills = mongoose.model("Skills", userSkillsSchema);
export const CanonicalSkills = mongoose.model("CanonicalSkills", canonicalSkillsSchema);

const User = mongoose.model("User", userSchema);
export default User;
