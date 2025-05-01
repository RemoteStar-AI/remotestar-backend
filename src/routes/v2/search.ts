import { Router } from "express";
import { Job, CulturalFit, Skills } from "../../utils/db";
import User from "../../utils/db";

export const matchingRouter = Router();

interface SkillItem {
  name?: string | null;
  years_experience?: number | null;
  score?: number | null;
}

interface CulturalFitItem {
  userId?: string | null;
  product_score?: number | null;
  service_score?: number | null;
  startup_score?: number | null;
  mnc_score?: number | null;
  loyalty_score?: number | null;
  [key: string]: any;
}

function calculateSkillsSimilarity(
  candidateSkills: SkillItem[],
  expectedSkills: SkillItem[]
) {
  console.log("Calculating skills similarity…", { expectedSkillsCount: expectedSkills.length, candidateSkillsCount: candidateSkills.length });
  if (!expectedSkills.length || !candidateSkills.length) {
    console.log("No expected or candidate skills provided.");
    return 0;
  }

  let totalScore = 0;
  let totalWeight = 0;

  expectedSkills.forEach((expected) => {
    if (!expected.name) return;
    const candidateSkill = candidateSkills.find(
      (skill) => skill.name?.toLowerCase() === expected.name?.toLowerCase()
    );
    const weight = Math.max(1, expected.years_experience || 1);

    if (candidateSkill) {
      const matchScore = Math.min(candidateSkill.score || 0, expected.score || 0);
      totalScore += matchScore * weight;
      totalWeight += weight;
      console.log(`✔ Matched skill=${expected.name}, score=${matchScore}, weight=${weight}`);
    } else {
      totalWeight += weight;
      console.log(`✘ Missing skill=${expected.name}, penalized weight=${weight}`);
    }
  });

  const similarity = totalWeight > 0 ? totalScore / totalWeight : 0;
  console.log("→ Final skills similarity:", similarity);
  return similarity;
}

function calculateCulturalFitSimilarity(
  candidateCulturalFit: CulturalFitItem,
  expectedCulturalFit: CulturalFitItem
) {
  console.log("Calculating cultural fit similarity…");
  if (!candidateCulturalFit || !expectedCulturalFit) {
    console.log("No cultural fit data available.");
    return 0;
  }

  let totalNormalizedScore = 0;
  let count = 0;
  const scoreFields = Object.keys(expectedCulturalFit).filter(
    (key) =>
      key.endsWith("_score") &&
      typeof expectedCulturalFit[key] === "number" &&
      key !== "userId" &&
      !key.startsWith("_")
  );

  scoreFields.forEach((field) => {
    const expected = expectedCulturalFit[field] || 0;
    const actual = candidateCulturalFit[field] || 0;
    const normalized = Math.max(0, (5 - Math.abs(actual - expected)) / 5);
    totalNormalizedScore += normalized;
    count++;
    console.log(`• ${field}: expected=${expected}, actual=${actual}, normalized=${normalized}`);
  });

  const similarity = count > 0 ? totalNormalizedScore / count : 0;
  console.log("→ Final cultural fit similarity:", similarity);
  return similarity;
}

function calculateMatchScore(
  candidateSkills: SkillItem[],
  expectedSkills: SkillItem[],
  candidateCulturalFit: CulturalFitItem,
  expectedCulturalFit: CulturalFitItem,
  skillsWeight = 0.7,
  culturalFitWeight = 0.3
) {
  console.log("Calculating overall match score…");
  const skillsSim = calculateSkillsSimilarity(candidateSkills, expectedSkills);
  const cultureSim = calculateCulturalFitSimilarity(candidateCulturalFit, expectedCulturalFit);
  const weighted = ((skillsSim * skillsWeight) + (cultureSim * culturalFitWeight)) / (skillsWeight + culturalFitWeight);
  const finalScore = Math.round(weighted * 100);
  console.log({ skillsSim, cultureSim, finalScore });
  return finalScore;
}

matchingRouter.get("/:jobId", async (req: any, res: any) => {
  try {
    const { jobId } = req.params;
    console.log(`Matching candidates for Job ID: ${jobId}`);
    if (!jobId) return res.status(400).json({ success: false, message: "Job ID is required" });

    const job = await Job.findById(jobId);
    if (!job) {
      console.log("Job not found.");
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    console.log("Job found:", job.title);

    const expectedSkills: SkillItem[] = job.expectedSkills || [];
    const expectedCulturalFit: CulturalFitItem = { ...(job.expectedCulturalFit || {}) };

    const users = await User.find({});
    console.log(`Found ${users.length} users to evaluate.`);

    const matches = await Promise.all(
      users.map(async (user) => {
        const idStr = user._id.toString();
        const firebase = user.firebase_id;
        console.log("→ Processing user:", user.name, { idStr, firebase });

        const culturalFit = await CulturalFit.findOne({ userId: { $in: [idStr, firebase] } });
        const skillsData = await Skills.findOne({ userId: { $in: [idStr, firebase] } });

        console.log("   culturalFit found for", user.name, ":", !!culturalFit);
        console.log("   skillsData   found for", user.name, ":", !!skillsData);

        const plainCulturalFit: CulturalFitItem = culturalFit ? { ...culturalFit.toObject?.() ?? culturalFit } : {};

        let plainSkills: SkillItem[] = [];
        if (skillsData?.skills && Array.isArray(skillsData.skills)) {
          plainSkills = skillsData.skills.map(s =>
            typeof s.toObject === "function"
              ? s.toObject()
              : { name: s.name, score: s.score, years_experience: s.years_experience }
          );
        }

        const matchScore = calculateMatchScore(
          plainSkills,
          expectedSkills,
          plainCulturalFit,
          expectedCulturalFit
        );

        // Build per-skill match info
        const perSkillMatch = expectedSkills.map((expected) => {
          const matched = plainSkills.find(
            (skill) => skill.name?.toLowerCase() === expected.name?.toLowerCase()
          );
          let match = 0;
          if (matched && expected.score !== null && matched.score !== null) {
            const diff = Math.abs((matched.score || 0) - (expected.score || 0));
            match = Math.max(1, 5 - diff); // scale to 1–5
          }
          return {
            skill: expected.name,
            expectedScore: expected.score ?? null,
            candidateScore: matched?.score ?? null,
            matchScore: match,
          };
        });

        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          matchScore,
          skillsMatch: calculateSkillsSimilarity(plainSkills, expectedSkills) * 100,
          culturalFitMatch: calculateCulturalFitSimilarity(plainCulturalFit, expectedCulturalFit) * 100,
          perSkillMatch
        };
      })
    );

    const sorted = matches.sort((a, b) => b.matchScore - a.matchScore);
    console.log("Matching completed.");
    res.status(200).json({
      success: true,
      message: "Candidates matched successfully",
      data: {
        jobTitle: job.title,
        jobId: job._id,
        totalCandidates: sorted.length,
        candidates: sorted
      }
    });
  } catch (err: any) {
    console.error("Error matching candidates:", err);
    res.status(500).json({
      success: false,
      message: "An error occurred while matching candidates",
      error: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});

export default matchingRouter;
