import { Router } from "express";
import { Job, CulturalFit, Skills } from "../../utils/db";
import User from "../../utils/db";

export const searchRouter = Router();

function calculateSkillsSimilarity(
  candidateSkills: any[],
  expectedSkills: any[]
) {
  let totalScore = 0;
  let totalWeight = 0;

  expectedSkills.forEach((exp) => {
    const cand = candidateSkills.find((s) => s.name === exp.name);
    if (cand) {
      const match = Math.min(cand.score, exp.score);
      totalScore += match * exp.years_experience;
      totalWeight += exp.years_experience;
    } else {
      totalWeight += 1;
    }
  });

  return totalWeight === 0 ? 0 : totalScore / totalWeight;
}

function calculateCulturalFitSimilarity(
  candidateCulturalFit: any,
  expectedCulturalFit: any
) {
  let totalNormalizedScore = 0;
  let count = 0;

  Object.keys(expectedCulturalFit)
    .filter((key) => key.endsWith("_score") && typeof expectedCulturalFit[key] === "number")
    .forEach((key) => {
      const expected = expectedCulturalFit[key];
      const actual = candidateCulturalFit[key] ?? 0;
      const diff = Math.abs(actual - expected);
      const normalized = Math.max(0, (5 - diff) / 5);
      totalNormalizedScore += normalized;
      count++;
    });

  return count === 0 ? 0 : totalNormalizedScore / count;
}

function calculateMatchScore(
  candidateSkills: any[],
  expectedSkills: any[],
  candidateCulturalFit: any,
  expectedCulturalFit: any,
  skillsWeight = 0.7,
  culturalFitWeight = 0.3
) {
  const skillsSim = calculateSkillsSimilarity(candidateSkills, expectedSkills);
  const cultSim   = calculateCulturalFitSimilarity(candidateCulturalFit, expectedCulturalFit);

  // weighted combination, then scale to 100
  const weighted = (skillsSim * skillsWeight + cultSim * culturalFitWeight)
                 / (skillsWeight + culturalFitWeight);

  return Math.round(weighted * 100);
}

searchRouter.get("/", async (req: any, res: any) => {
  const { jobId } = req.query;

  try {
    // populate expectedSkills if they're stored by _id only
    const job = await Job.findById(jobId).populate("expectedSkills");
    if (!job) return res.status(404).json({ error: "Job not found" });

    const { expectedSkills, expectedCulturalFit } = job;
    const users = await User.find({});

    const matches = await Promise.all(
      users.map(async (user) => {
        const cult = await CulturalFit.findOne({ userId: user.firebase_id });
        const skl  = await Skills.findOne({ userId: user.firebase_id });

        const score = calculateMatchScore(
          skl?.skills || [],
          expectedSkills as any[],
          cult || {},
          expectedCulturalFit
        );

        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          matchScore: score,
          culturalFit: cult,
          skills: skl?.skills || [],
        };
      })
    );

    matches.sort((a, b) => b.matchScore - a.matchScore);

    res.status(200).json({ message: "Search results", data: matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
