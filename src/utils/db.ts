import mongoose, { Schema } from "mongoose";



const userSchema = new Schema({
  firebase_id: { type: String, required: true },
  firebase_email: { type: String, required: true },
  firebase_uploader_name: { type: String, default: "" },
  organisation_id: { type: String, default: "" },
  total_bookmarks: { type: Number, default: 0 },
  resume_url: { type: String, default: "https://conasems-ava-prod.s3.sa-east-1.amazonaws.com/aulas/ava/dummy-1641923583.pdf" },
  job: { type: String, default: "" },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  address: { type: String },
  current_location: { type: String, default: "" },
  summary: { type: String },
  profile_completeness: { type: Number, min: 0 },
  years_of_experience: { type: Number, min: 0 },
  designation: { type: String, default: "" },
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
// Performance indexes for frequent lookups
userSchema.index({ email: 1, organisation_id: 1 });
// Fast organisation-wide scans
userSchema.index({ organisation_id: 1 });

const culturalFitSchema = new Schema({
  userId: { type: String, required: true },
  product_score: { type: Number, min: 0, max: 100 },
  service_score: { type: Number, min: 0, max: 100 },
  startup_score: { type: Number, min: 0, max: 100 },
  mnc_score: { type: Number, min: 0, max: 100 },
  loyalty_score: { type: Number, min: 0, max: 100 },
  coding_score: { type: Number, min: 0, max: 100 },
  leadership_score: { type: Number, min: 0, max: 100 },
  architecture_score: { type: Number, min: 0, max: 100 },
}, { timestamps: true });
// Fast lookup of cultural fit by user
culturalFitSchema.index({ userId: 1 });

const culturalFitSchema2 = new Schema({
  userId: { type: String, optional: true },
  product_score: { type: Number, min: 0, max: 100 },
  service_score: { type: Number, min: 0, max: 100 },
  startup_score: { type: Number, min: 0, max: 100 },
  mnc_score: { type: Number, min: 0, max: 100 },
  loyalty_score: { type: Number, min: 0, max: 100 },
  coding_score: { type: Number, min: 0, max: 100 },
  leadership_score: { type: Number, min: 0, max: 100 },
  architecture_score: { type: Number, min: 0, max: 100 },
}, { timestamps: true });

const skillsSchema = new Schema({
  name: { type: String },
  years_experience: { type: Number },
  summary: { type: String },
  score: { type: Number, min: 0, max: 5 }
});

const userSkillsSchema = new Schema({
  userId: { type: String, required: true },
  skills: [skillsSchema],
}, { timestamps: true });
// Fast lookup of skills by user
userSkillsSchema.index({ userId: 1 });

// Index for jobs by organisation will be added after schema declaration

const companySchema = new Schema({
  name: { type: String, required: true },
  organisation_id: { type: String, default: "" },
  website: { type: String, optional: true },
});

//fix : need to remove optional true from expectedSkills and expectedCulturalFit
const jobSchema = new mongoose.Schema({
  companyId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  organisation_id: { type: String, default: "" },
  needRevaluation: { type: Boolean, default: true },
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
  expectedSkills: {
    type: [{
      name: { type: String },
      years_experience: { type: Number },
      score: { type: Number, min: 0, max: 5 },
      mandatory: { type: Boolean, default: false }
    }], default: [], optional: true
  },
  expectedCulturalFit: { type: culturalFitSchema2, default: {}, optional: true },
  prompt: { type: Object, default: {} },
}, { timestamps: true });
// Add index after declaration
jobSchema.index({ organisation_id: 1 });
// Common filter: company within an organisation
jobSchema.index({ companyId: 1, organisation_id: 1 });

const canonicalSkillsSchema = new Schema({
  name: { type: String, required: true, unique: true },
});

const organisationSchema = new Schema({
  name: { type: String, required: true },
  admin: { type: [String], default: [] },
  members: { type: [String], default: [] },
});

const bookmarkSchema = new Schema({
  userId: { type: String, required: true },
  memberId: { type: String, required: true },
  jobId: { type: String, required: true },
  companyId: { type: String, required: true },
}, { timestamps: true });
// Indexes to accelerate frequent bookmark lookups
bookmarkSchema.index({ memberId: 1 });
bookmarkSchema.index({ userId: 1 });
bookmarkSchema.index({ companyId: 1 });
bookmarkSchema.index({ userId: 1, memberId: 1 });

const jobSearchResposeSchema = new Schema({
  jobId: { type: String, required: true },
  organisation_id: { type: String, required: true },
  response: { type: Object, default: {} },
}, { timestamps: true })

const analysisSchema = new Schema({
  userId: { type: String, required: true },
  jobId: { type: String, required: true },
  analysis: { type: String, default: "" },
}, { timestamps: true })

const jobRequiredSkillsSchema = new Schema({
  jobId: { type: String, required: true },
  skills: { type: [String], required: true },
}, { timestamps: true })

const jobAnalysisOfCandidateSchema = new Schema({
  jobId: { type: String, required: true },
  userId: { type: String, required: true },
  rank: { type: Number, required: true },
  data: { type: Object, default: {} },
  newlyAnalysed: { type: Boolean, default: true },
}, { timestamps: true })
// Accelerate lookups by job and user
jobAnalysisOfCandidateSchema.index({ jobId: 1 });
jobAnalysisOfCandidateSchema.index({ jobId: 1, userId: 1 });
jobAnalysisOfCandidateSchema.index({ userId: 1 });

const defaultAssistantSchema = new Schema({
  jobId: { type: String, required: true },
  organisation_id: { type: String, required: true },
  firstMessage: { type: String, required: true },
  systemPrompt: { type: String, required: true },
  assistantId: { type: String, required: true },
  type: { type: String, enum: ["call", "nudge", "interview"], default: "call" },
}, { timestamps: true })

const callDetailsSchema = new Schema({
  jobId: { type: String, required: true },
  candidateId: { type: String, required: true },
  organisation_id: { type: String, required: true },
  recruiterEmail: { type: String, required: true },
  callId: { type: String, required: true },
  callDetails: { type: Object, default: {} },
  status: { type: String, default: "initiated" },
  lastUpdated: { type: Date, default: Date.now },
  vapiData: { type: Object, default: {} },
  type: { type: String, enum: ["call", "email", "interview", "nudge"], default: "call" },
  videoUrl: { type: String, optional: true },
  interviewId: { type: String, optional: true },
  message: { type: String, default: "" },
}, { timestamps: true })

const scheduledCallSchema = new Schema({
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date, required: true, index: true },
  data: {
    jobId: { type: String, required: true },
    candidateId: { type: String, required: true },
    assistantId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    organisation_id: { type: String, required: true },
    recruiterEmail: { type: String, required: true },
  },
  isCalled: { type: Boolean, default: false, index: true },
  status: { type: String, default: "not-called" },
  callId: { type: String, index: true }
}, { timestamps: true });

const webhookSubscriptionSchema = new Schema({
  organisation_id: { type: String, required: true, index: true },
  webhook_url: { type: String, required: true },
  events: { type: [String], default: ['call.status.changed', 'call.completed', 'call.failed', 'call.initiated'] },
  is_active: { type: Boolean, default: true },
  secret_key: { type: String, required: true }, // For webhook signature verification
  last_delivery_attempt: { type: Date },
  delivery_failures: { type: Number, default: 0 }
}, { timestamps: true });

const interviewSchema = new Schema({
  userId: { type: String, required: true },
  recruiterEmail: { type: String, required: true },
  organisation_id: { type: String, required: true },
  candidateEmail: { type: String, required: true },
  candidateId: { type: String, required: true },
  jobId: { type: String, required: true },
  interviewLink: { type: String, required: true },
  assistantId: { type: String, required: true },
  systemPrompt: { type: String, required: true },
  analysisPrompt: { type: String, required: true },
  firstMessage: { type: String, required: true },
  expiresAt: { type: Date, required: true, default: Date.now() + 1000 * 60 * 60 * 24 * 15 },
  status: { type: String, default: "initiated" },
  callId: { type: String, default: "" },
}, { timestamps: true });


export const Job = mongoose.model("Job", jobSchema);
export const Company = mongoose.model("Company", companySchema);
export const CulturalFit = mongoose.model("CulturalFit", culturalFitSchema);
export const Skills = mongoose.model("Skills", userSkillsSchema);
export const CanonicalSkills = mongoose.model("CanonicalSkills", canonicalSkillsSchema);
export const Organisation = mongoose.model("Organisation", organisationSchema);
export const Bookmark = mongoose.model("Bookmark", bookmarkSchema);
export const User = mongoose.model("User", userSchema);
export const JobSearchResponse = mongoose.model("JobSearchResponse", jobSearchResposeSchema);
export const Analysis = mongoose.model("Analysis", analysisSchema);
export const JobRequiredSkills = mongoose.model("JobRequiredSkills", jobRequiredSkillsSchema);
export const JobAnalysisOfCandidate = mongoose.model("JobAnalysisOfCandidate", jobAnalysisOfCandidateSchema);
export const DefaultAssistant = mongoose.model("DefaultAssistant", defaultAssistantSchema);
export const CallDetails = mongoose.model("CallDetails", callDetailsSchema);
export const ScheduledCalls = mongoose.model("ScheduledCalls", scheduledCallSchema);
export const WebhookSubscription = mongoose.model("WebhookSubscription", webhookSubscriptionSchema);
export const Interview = mongoose.model("Interview", interviewSchema);
