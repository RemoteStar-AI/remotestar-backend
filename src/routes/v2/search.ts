import { Router } from "express";
import { Job,CulturalFit,Skills } from "../../utils/db";
import User from "../../utils/db";

export const searchRouter = Router();

function calculateSkillsSimilarity(
  candidateSkills: any[],
  expectedSkills: any[]
) {
  let totalScore = 0;
  let totalWeight = 0;

  // Compare each skill in expectedSkills
  expectedSkills.forEach((expectedSkill: any) => {
    let candidateSkill = candidateSkills.find(
      (skill) => skill.name === expectedSkill.name
    );

    if (candidateSkill) {
      // Exact match
      let skillMatch = Math.min(candidateSkill.score, expectedSkill.score);
      totalScore += skillMatch * expectedSkill.years_experience;
      totalWeight += expectedSkill.years_experience;
    } else {
      // No match
      totalScore += 0;
      totalWeight += 1; // Consider a penalty for missing skill
    }
  });

  return totalScore / totalWeight;
}

function calculateCulturalFitSimilarity(
  candidateCulturalFit: any,
  expectedCulturalFit: any
) {
  let totalScore = 0;
  let totalWeight = 0;

  // Compare each cultural fit score
  Object.keys(expectedCulturalFit).forEach((key) => {
    let diff = Math.abs(candidateCulturalFit[key] - expectedCulturalFit[key]);
    totalScore += 5 - diff; // More similar, higher score
    totalWeight += 1;
  });

  return totalScore / totalWeight;
}

function calculateMatchScore(
  candidateSkills: any[],
  expectedSkills: any[],
  candidateCulturalFit: any,
  expectedCulturalFit: any,
  skillsWeight = 0.7,
  culturalFitWeight = 0.3
) {
  let skillsSimilarity = calculateSkillsSimilarity(
    candidateSkills,
    expectedSkills
  );
  let culturalFitSimilarity = calculateCulturalFitSimilarity(
    candidateCulturalFit,
    expectedCulturalFit
  );

  return (
    (skillsSimilarity * skillsWeight +
      culturalFitSimilarity * culturalFitWeight) /
    (skillsWeight + culturalFitWeight)
  );
}

searchRouter.get("/", async (req: any, res: any) => {
  const params = req.query;
  const { jobId } = params;
  try {
    const job = await Job.findById({_id:jobId});
    if (!job) {
      res.status(404).json({ error: "Job not found" });
      return;
    }
    const { expectedSkills, expectedCulturalFit } = job;
    const allUsers = await User.find({});
    console.log("all users found");

    const matchResults = allUsers.map((user: any) => {
        const candidateSkills = user.skills || [];
        const candidateCulturalFit = user.culturalFit || {};

        const matchScore = calculateMatchScore(
            candidateSkills,
            expectedSkills,
            candidateCulturalFit,
            expectedCulturalFit
        );

        return {
            userId: user._id,
            matchScore,
            culturalFit: candidateCulturalFit,
            skills: candidateSkills
        };
    });

    const sortedResults = matchResults.sort((a:any,b:any)=>b.matchScore - a.matchScore);

    res.status(200).json({
      message: "Search results",
      data: sortedResults,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
