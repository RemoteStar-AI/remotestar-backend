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
    description: { type: String }
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
    description: { type: String },
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

const User = mongoose.model("User", userSchema);
export default User;
