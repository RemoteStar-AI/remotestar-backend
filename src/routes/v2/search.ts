import { Router } from "express";
import { Job, CulturalFit, Skills } from "../../utils/db";
import User from "../../utils/db"; // Assuming User model is imported

export const matchingRouter = Router();

// --- Interfaces remain the same ---
interface SkillItem {
  name?: string | null;
  years_experience?: number | null;
  score?: number | null;
  mandatory?: boolean | null;
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

// --- Calculation functions remain unchanged ---
function calculateSkillsSimilarity(
  candidateSkills: SkillItem[],
  expectedSkills: SkillItem[]
): number { // Return type added for clarity
  console.log("Calculating skills similarity…", { expectedSkillsCount: expectedSkills.length, candidateSkillsCount: candidateSkills.length });
  if (!expectedSkills.length || !candidateSkills.length) {
    console.log("No expected or candidate skills provided.");
    return 0;
  }

  let totalScore = 0;
  let totalWeight = 0;

  expectedSkills.forEach((expected) => {
    if (!expected.name || expected.score == null) return; // Check score existence too
    const candidateSkill = candidateSkills.find(
      (skill) => skill.name?.toLowerCase() === expected.name?.toLowerCase()
    );
    // Use expected years_experience for weight, default to 1
    const weight = Math.max(1, expected.years_experience || 1);

    if (candidateSkill && candidateSkill.score != null) {
      // Candidate has skill, use the minimum of candidate's score and expected score
      const matchScore = Math.min(candidateSkill.score, expected.score);
      totalScore += matchScore * weight;
      totalWeight += weight; // Add weight only if comparison happens
      console.log(`✔ Matched skill=${expected.name}, candidateScore=${candidateSkill.score}, expectedScore=${expected.score}, usedScore=${matchScore}, weight=${weight}`);
    } else {
      // If candidate doesn't have the skill, it contributes 0 to totalScore
      // The weight IS added to totalWeight to penalize missing skills
      totalWeight += weight;
      console.log(`✘ Missing skill=${expected.name}, penalized weight=${weight}`);
    }
  });

  // Returns the average score (can exceed typical 0-1 or 0-5 ranges depending on scores/weights)
  const similarity = totalWeight > 0 ? totalScore / totalWeight : 0;
  console.log("→ Raw skills similarity (average score):", similarity);
  return similarity;
}

function calculateCulturalFitSimilarity(
  candidateCulturalFit: CulturalFitItem | null, // Allow null
  expectedCulturalFit: CulturalFitItem | null // Allow null
): number { // Return type added
  console.log("Calculating cultural fit similarity…");
  if (!candidateCulturalFit || !expectedCulturalFit || Object.keys(expectedCulturalFit).length === 0) {
    console.log("No cultural fit data available for comparison.");
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

   if (scoreFields.length === 0) {
        console.log("No score fields found in expected cultural fit.");
        return 0;
    }


  scoreFields.forEach((field) => {
    const expected = expectedCulturalFit![field] || 0; // Use non-null assertion or default
    const actual = candidateCulturalFit[field] || 0;
    // Normalize based on 5-point difference scale
    const normalized = Math.max(0, (5 - Math.abs(actual - expected)) / 5);
    totalNormalizedScore += normalized;
    count++;
    console.log(`• ${field}: expected=${expected}, actual=${actual}, normalized=${normalized}`);
  });

  const similarity = count > 0 ? totalNormalizedScore / count : 0; // Average normalized score (0-1)
  console.log("→ Final cultural fit similarity (0-1):", similarity);
  return similarity;
}

function calculateMatchScore(
  candidateSkills: SkillItem[],
  expectedSkills: SkillItem[],
  candidateCulturalFit: CulturalFitItem | null, // Allow null
  expectedCulturalFit: CulturalFitItem | null, // Allow null
  skillsWeight = 0.7,
  culturalFitWeight = 0.3
): number { // Return type added
  console.log("Calculating overall match score…");
  const skillsSim = calculateSkillsSimilarity(candidateSkills, expectedSkills);
  const cultureSim = calculateCulturalFitSimilarity(candidateCulturalFit, expectedCulturalFit); // This is 0-1

  // ISSUE: skillsSim might not be 0-1, leading to weighted score > 100
  // We proceed with the original logic as requested by the user.
  const totalWeight = skillsWeight + culturalFitWeight;
   if (totalWeight <= 0) {
      console.warn("Weights sum to zero or less. Returning 0.");
      return 0;
  }
  // Calculate weighted value based on potentially non-normalized skillsSim
  const weighted = ((skillsSim * skillsWeight) + (cultureSim * culturalFitWeight)) / totalWeight;

  // Scale result by 100
  const finalScore = Math.round(weighted * 100);
  console.log({ skillsSim, cultureSim, weightedScoreBefore100x: weighted, finalScore });
  return finalScore; // This can be > 100
}


matchingRouter.get("/:jobId", async (req: any, res: any) => {
  try {
    const { jobId } = req.params;
    console.log(`\n--- Matching candidates for Job ID: ${jobId} ---`);
    if (!jobId) return res.status(400).json({ success: false, message: "Job ID is required" });

    const job = await Job.findById(jobId);
    if (!job) {
      console.log(`Job with ID ${jobId} not found.`);
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    console.log("Job found:", job.title);

    const expectedSkills: SkillItem[] = (job.expectedSkills || []).map(s => ({ // Ensure structure
        name: s.name ?? null,
        score: s.score ?? null,
        years_experience: s.years_experience ?? 1,
        mandatory: s.mandatory ?? false
    }));
    const expectedCulturalFit: CulturalFitItem | null = job.expectedCulturalFit ? { ...job.expectedCulturalFit } : null;

    const users = await User.find({});
    console.log(`Found ${users.length} users to evaluate.`);

    // --- Calculate initial scores using original functions ---
    const matchesPromises = users.map(async (user) => {
      const userIdStr = user._id.toString();
      const firebaseId = user.firebase_id;
      console.log(`\nProcessing user: ${user.name} (ID: ${userIdStr}, FirebaseID: ${firebaseId})`);

      const culturalFitDoc = await CulturalFit.findOne({ userId: { $in: [userIdStr, firebaseId].filter(Boolean) } });
      const skillsDoc = await Skills.findOne({ userId: { $in: [userIdStr, firebaseId].filter(Boolean) } });

      const candidateCulturalFit: CulturalFitItem | null = culturalFitDoc ? { ...(culturalFitDoc.toObject?.() ?? culturalFitDoc) } : null;
      console.log(`   CulturalFit found: ${!!candidateCulturalFit}`);

      let candidateSkills: SkillItem[] = [];
       if (skillsDoc?.skills && Array.isArray(skillsDoc.skills)) {
         candidateSkills = skillsDoc.skills.map(s => {
            const skillObj = s.toObject?.() ?? s;
             return {
                 name: skillObj.name ?? null,
                 score: skillObj.score ?? null,
                 years_experience: skillObj.years_experience ?? null,
             };
         });
        }
      console.log(`   Skills found: ${candidateSkills.length > 0} (${candidateSkills.length} skills)`);

      // Calculate scores using original functions - these can exceed 100
      const rawMatchScore = calculateMatchScore(
        candidateSkills,
        expectedSkills,
        candidateCulturalFit,
        expectedCulturalFit
      );
      const rawSkillsSimilarity = calculateSkillsSimilarity(candidateSkills, expectedSkills);
      const rawCulturalFitSimilarity = calculateCulturalFitSimilarity(candidateCulturalFit, expectedCulturalFit);

      // Raw skillsMatch can also exceed 100 if rawSkillsSimilarity * 100 > 100
      const rawSkillsMatch = Math.round(rawSkillsSimilarity * 100);
      const rawCulturalFitMatch = Math.round(rawCulturalFitSimilarity * 100); // Should be 0-100


      // Build per-skill match info (remains unchanged)
      const perSkillMatch = expectedSkills.map((expected) => {
         const candidateSkill = candidateSkills.find(
          (skill) => skill.name?.toLowerCase() === expected.name?.toLowerCase()
        );
        let matchDisplayScore = 0;
        if (candidateSkill && expected.score != null && candidateSkill.score != null) {
          const diff = Math.abs(candidateSkill.score - expected.score);
          matchDisplayScore = Math.max(0, 5 - diff); // Scale 0-5 based on difference
        }
        return {
          skill: expected.name,
          expectedScore: expected.score ?? null,
          candidateScore: candidateSkill?.score ?? null,
          mandatory: expected.mandatory ?? false,
          matchScore: matchDisplayScore, // Keep the 0-5 score here
        };
      });

      return {
        userId: user._id,
        name: user.name,
        email: user.email,
        // Store the raw scores first
        matchScore: rawMatchScore,
        skillsMatch: rawSkillsMatch,
        culturalFitMatch: rawCulturalFitMatch, // Usually 0-100 anyway
        perSkillMatch
      };
    });

    const calculatedMatches = await Promise.all(matchesPromises);

    // --- START: Normalization Logic ---
    console.log("\n--- Checking if normalization is needed ---");
    let finalMatches = calculatedMatches; // Assume no normalization needed initially

    if (calculatedMatches.length > 0) {
        // Find maximum raw scores
        const maxMatchScore = Math.max(0, ...calculatedMatches.map(m => m.matchScore));
        const maxSkillsMatch = Math.max(0, ...calculatedMatches.map(m => m.skillsMatch));
        console.log("Raw Maximum Scores:", { maxMatchScore, maxSkillsMatch });

        const needsMatchNormalization = maxMatchScore > 100;
        const needsSkillsNormalization = maxSkillsMatch > 100;

        if (needsMatchNormalization || needsSkillsNormalization) {
            console.log("Normalization required.");
            let matchScaleFactor = 1;
            let skillsScaleFactor = 1;
            let topMatchTarget = maxMatchScore; // Target for clamping matchScore

            if (needsMatchNormalization) {
                // Random target score between 92 and 100 for the highest matchScore
                topMatchTarget = Math.floor(Math.random() * (100 - 92 + 1)) + 92;
                matchScaleFactor = topMatchTarget / maxMatchScore;
                console.log(`Normalizing MatchScore: Max=${maxMatchScore}, TargetTop=${topMatchTarget}, Factor=${matchScaleFactor}`);
            } else {
                 topMatchTarget = Math.max(0, maxMatchScore); // Use actual max if <= 100
            }


            if (needsSkillsNormalization) {
                // Target score is 100 for the highest skillsMatch
                skillsScaleFactor = 100 / maxSkillsMatch;
                console.log(`Normalizing SkillsMatch: Max=${maxSkillsMatch}, TargetTop=100, Factor=${skillsScaleFactor}`);
            }

            // Apply normalization factors to create the final list
            finalMatches = calculatedMatches.map(match => {
                const newMatchScore = needsMatchNormalization ? Math.round(match.matchScore * matchScaleFactor) : match.matchScore;
                const newSkillsMatch = needsSkillsNormalization ? Math.round(match.skillsMatch * skillsScaleFactor) : match.skillsMatch;

                return {
                    ...match, // Keep other fields (userId, name, email, perSkillMatch, culturalFitMatch)
                    // Apply scaled scores and clamp them
                    matchScore: Math.max(0, Math.min(topMatchTarget, newMatchScore)),
                    skillsMatch: Math.max(0, Math.min(100, newSkillsMatch)),
                    // culturalFitMatch is usually already 0-100, keep as is
                };
            });
             console.log("Normalization applied.");

        } else {
            console.log("Scores are within 0-100 bounds. No normalization applied.");
        }
    }
    // --- END: Normalization Logic ---


    // Sort based on the FINAL matchScore (either original or normalized)
    const sortedMatches = finalMatches.sort((a, b) => b.matchScore - a.matchScore);

    console.log("\n--- Processing completed. Returning results. ---");
    res.status(200).json({
      success: true,
      message: "Candidates matched successfully",
      data: {
        jobTitle: job.title,
        jobId: job._id,
        totalCandidates: sortedMatches.length,
        candidates: sortedMatches // Return the final sorted list
      }
    });
  } catch (err: any) {
    console.error("Error during candidate matching:", err);
    res.status(500).json({
      success: false,
      message: "An error occurred while matching candidates",
      error: process.env.NODE_ENV === "development" ? err.message : undefined
    });
  }
});

export default matchingRouter;