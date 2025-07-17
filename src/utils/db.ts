import mongoose, { Schema } from "mongoose";



const userSchema = new Schema({
  firebase_id: { type: String, required: true },
  firebase_email: { type: String, required: true },
  firebase_uploader_name: { type: String ,default: ""},
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
  profile_completeness: { type: Number, min: 0},
  years_of_experience: { type: Number, min: 0},
  designation: { type: String ,default: ""},
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
  product_score: { type: Number, min: 0, max: 100},
  service_score: { type: Number, min: 0, max: 100},
  startup_score: { type: Number, min: 0, max: 100},
  mnc_score: { type: Number, min: 0, max: 100},
  loyalty_score: { type: Number, min: 0, max: 100},
  coding_score: { type: Number, min: 0, max: 100},
  leadership_score: { type: Number, min: 0, max: 100},
  architecture_score: { type: Number, min: 0, max: 100},
}, { timestamps: true });

const culturalFitSchema2 = new Schema({
  userId: { type: String, optional: true },
  product_score: { type: Number, min: 0, max: 100},
  service_score: { type: Number, min: 0, max: 100},
  startup_score: { type: Number, min: 0, max: 100},
  mnc_score: { type: Number, min: 0, max: 100},
  loyalty_score: { type: Number, min: 0, max: 100},
  coding_score: { type: Number, min: 0, max: 100},
  leadership_score: { type: Number, min: 0, max: 100},
  architecture_score: { type: Number, min: 0, max: 100},
}, { timestamps: true });

const skillsSchema = new Schema({
  name: { type: String },
  years_experience: { type: Number },
  summary: { type: String },
  score: { type: Number, min: 0, max: 5}
});

const userSkillsSchema = new Schema({
  userId: { type: String, required: true },
  skills: [skillsSchema],
}, { timestamps: true });

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
  expectedSkills: { type: [{
    name: { type: String },
    years_experience: { type: Number },
    score: { type: Number, min: 0, max: 5 },
    mandatory: { type: Boolean, default: false }
  }], default: [], optional: true },
  expectedCulturalFit: { type: culturalFitSchema2, default: {} ,optional:true},
  prompt: { type: String, default: "" },
}, { timestamps: true });

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

const jobSearchResposeSchema = new Schema({
  jobId : {type: String, required: true},
  organisation_id: {type:String,required:true},
  response: { type: Object,default:{}},
},{timestamps:true})

const analysisSchema = new Schema({
  userId: {type: String, required: true},
  jobId: {type: String, required: true},
  analysis: {type:String, default:""},
},{timestamps:true})

const jobRequiredSkillsSchema=new Schema({
  jobId: {type: String, required: true},
  skills: {type: [String], required: true},
},{timestamps:true})

const jobAnalysisOfCandidateSchema=new Schema({
  jobId: {type: String, required: true},
  userId: {type: String, required: true},
  rank: {type: Number, required: true},
  data: {type:Object, default:{}},
  newlyAnalysed: {type: Boolean, default: true},
},{timestamps:true})

const defaultAssistantSchema=new Schema({
  userId: {type: String, required: true},
  jobId: {type: String, required: true},
  candidateId: {type: String, required: true},
  organisation_id: {type: String, required: true},
  firstMessage: {type: String, required: true},
  systemPrompt: {type: String, required: true},
  assistantId: {type: String, required: true},
},{timestamps:true})

const callDetailsSchema=new Schema({
  jobId: {type: String, required: true},
  candidateId: {type: String, required: true},
  organisation_id: {type: String, required: true},
  callId: {type: String, required: true},
  callDetails: {type: Object, default: {}},
},{timestamps:true})

const scheduledCallSchema = new Schema({
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date, required: true, index: true },
  data: {
    jobId: { type: String, required: true },
    candidateId: { type: String, required: true },
    assistantId: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    organisation_id: {type: String, required: true},
  },
  isCalled: { type: Boolean, default: false, index: true },
  callId: { type: String, index: true }
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