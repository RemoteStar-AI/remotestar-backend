import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import { User, Company, Job } from "./db";

const ORG_ID = "6835782f4ec996c8f13dca2d";

export async function addOrganisationId(MongoURI: string) {
  try {
    await mongoose.connect(MongoURI);
    // Update all users
    await User.updateMany({}, { $set: { organisation_id: ORG_ID } });
    console.log("Updated all users");

    // Update all companies
    await Company.updateMany({}, { $set: { organisation_id: ORG_ID } });
    console.log("Updated all companies");

    // Update all jobs
    await Job.updateMany({}, { $set: { organisation_id: ORG_ID } });
    console.log("Updated all jobs");
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

// Uncomment the following line to run the script
// addOrganisationId();
