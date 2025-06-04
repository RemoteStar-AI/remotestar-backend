/**
 * @file src/routes/v2/search.ts
 *
 * @description
 *   This file defines the Express router for candidate-job matching logic in the Remotestar backend (v2 API).
 *   It provides an endpoint to match candidates to a job based on skills and cultural fit, returning a ranked list of candidates with detailed match breakdowns.
 *
 *   Main Features:
 *   - Calculates match scores for users against a job using both skills and cultural fit metrics.
 *   - Supports caching of match results for performance, with recalculation triggered by the `needRevaluation` flag.
 *   - For each candidate, provides:
 *       - Overall match score
 *       - Per-skill and per-cultural fit trait match breakdowns
 *       - Bookmarking information (isBookmarked, bookmarkId, total_bookmarks, bookmarkedBy)
 *   - Integrates with Firebase to fetch user details for bookmarkers.
 *
 *   Endpoint:
 *     GET /:jobId
 *       - Authenticated route
 *       - Returns a list of matched candidates for the given job ID, with all relevant match and bookmark data.
 *
 *   Key Logic:
 *     - Uses MongoDB models for Job, User, Skills, CulturalFit, Bookmark, and JobSearchResponse.
 *     - Calculates similarity using custom functions for skills and cultural fit.
 *     - Handles both fresh and cached responses, always updating bookmark-related fields for accuracy.
 *
 * @disclaimer
 *   This file processes sensitive user and job data, including personal identifiers and Firebase user records.
 *   Ensure that access to this endpoint is properly authenticated and authorized.
 *   The logic involves multiple database and external (Firebase) calls per candidate, which may impact performance for large datasets.
 *   Use with care in production environments and consider optimizing for scale if needed.
 */
import { Router } from "express";
import {
  Job,
  CulturalFit,
  Skills,
  User,
  Bookmark,
  JobSearchResponse,
} from "../../utils/db";
import { authenticate } from "../../middleware/firebase-auth";
import admin from '../../utils/firebase';

export const matchingRouter = Router();

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
  coding_score?: number | null;
  leadership_score?: number | null;
  architecture_score?: number | null;
  [key: string]: any;
}

function calculateSkillsSimilarity(
  candidateSkills: SkillItem[],
  expectedSkills: SkillItem[]
) {
  console.log("Calculating skills similarity…", {
    expectedSkillsCount: expectedSkills.length,
    candidateSkillsCount: candidateSkills.length,
  });
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
    const isMandatory = expected.mandatory === true;

    if (candidateSkill) {
      // Apply bonus for mandatory skills
      const matchScore = Math.min(
        candidateSkill.score || 0,
        expected.score || 0
      );
      const weightMultiplier = isMandatory ? 1.5 : 1; // 50% bonus for mandatory skills
      totalScore += matchScore * weight * weightMultiplier;
      totalWeight += weight;
      console.log(
        `✔ Matched skill=${expected.name}, score=${matchScore}, weight=${weight}, mandatory=${isMandatory}`
      );
    } else {
      // Reduce the penalty for missing skills
      const penaltyMultiplier = isMandatory ? 1 : 0.6; // Full penalty for mandatory, reduced for non-mandatory
      totalWeight += weight * penaltyMultiplier;
      console.log(
        `✘ Missing skill=${expected.name}, penalized weight=${
          weight * penaltyMultiplier
        }, mandatory=${isMandatory}`
      );
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
  console.log("candidateCulturalFit", candidateCulturalFit);
  const processedExpectedCulturalFit =
    expectedCulturalFit._doc || expectedCulturalFit;
  console.log("expectedCulturalFit", processedExpectedCulturalFit);
  let totalNormalizedScore = 0;
  let count = 0;
  const scoreFields = Object.keys(processedExpectedCulturalFit).filter(
    (key) =>
      key.endsWith("_score") &&
      typeof processedExpectedCulturalFit[key] === "number" &&
      key !== "userId" &&
      !key.startsWith("_")
  );
  console.log("scoreFields", scoreFields);

  scoreFields.forEach((field) => {
    const expected = processedExpectedCulturalFit[field] || 0;
    const actual = candidateCulturalFit[field] || 0;
    const normalized = Math.max(0, (5 - Math.abs(actual - expected)) / 5);
    totalNormalizedScore += normalized;
    count++;
    console.log(
      `• ${field}: expected=${expected}, actual=${actual}, normalized=${normalized}`
    );
  });

  const similarity = count > 0 ? totalNormalizedScore / count : 0;
  console.log("→ Final cultural fit similarity:", similarity);
  return similarity;
}

function calculateCulturalFitMatchSum(candidateCulturalFit: CulturalFitItem, expectedCulturalFit: CulturalFitItem) {
  if (!candidateCulturalFit || !expectedCulturalFit) return 0;
  const processedExpectedCulturalFit = expectedCulturalFit._doc || expectedCulturalFit;
  const scoreFields = Object.keys(processedExpectedCulturalFit).filter(
    (key) =>
      key.endsWith("_score") &&
      typeof processedExpectedCulturalFit[key] === "number" &&
      key !== "userId" &&
      !key.startsWith("_")
  );
  let sum = 0;
  scoreFields.forEach((field) => {
    const expected = processedExpectedCulturalFit[field] || 0;
    const actual = candidateCulturalFit[field] || 0;
    const matchScore = Math.max(0, 5 - Math.abs(actual - expected)); // 0-5
    sum += matchScore;
  });
  return sum;
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
  const cultureSim = calculateCulturalFitSimilarity(
    candidateCulturalFit,
    expectedCulturalFit
  );
  const weighted =
    (skillsSim * skillsWeight + cultureSim * culturalFitWeight) /
    (skillsWeight + culturalFitWeight);
  const finalScore = Math.round(weighted * 100);
  console.log({ skillsSim, cultureSim, finalScore });
  return finalScore;
}

matchingRouter.get("/:jobId", authenticate, async (req: any, res: any) => {
  try {
    const { jobId } = req.params;
    console.log(`Matching candidates for Job ID: ${jobId}`);
    if (!jobId)
      return res
        .status(400)
        .json({ success: false, message: "Job ID is required" });

    const job = await Job.findById(jobId);
    const jobSearchResponse = await JobSearchResponse.findOne({ jobId: jobId });
    try {
      if (!jobSearchResponse) {
        await JobSearchResponse.create({
          jobId: jobId,
          response: {},
          organisation_id: job?.organisation_id,
        });
      }
    } catch (err) {
      console.error("Error creating job search response:", err);
    }

    //cached response
    if (!job?.needRevaluation) {
      console.log("previous response found");
      const cached = jobSearchResponse?.response;
      if (cached?.data?.candidates?.length) {
        // Get all userIds from cached candidates
        const userIds = cached.data.candidates.map((c: any) => c.userId);
        // Fetch latest total_bookmarks for these users
        const users = await User.find({ _id: { $in: userIds } }, { _id: 1, total_bookmarks: 1 });
        const bookmarksMap = new Map(users.map((u: any) => [u._id.toString(), u.total_bookmarks]));
        // Fetch bookmarks for the current user
        const memberId = req.user.firebase_id;
        const bookmarks = await Bookmark.find({ memberId });
        // Update candidates with latest total_bookmarks, isBookmarked, bookmarkId, and bookmarkedBy
        cached.data.candidates = await Promise.all(cached.data.candidates.map(async (c: any) => {
          const userIdStr = c.userId.toString();
          const userBookmarks = bookmarks.find((bookmark: any) => bookmark.userId === userIdStr);
          const isBookmarked = !!userBookmarks;
          const bookmarkId = userBookmarks?._id?.toString();

          // Recalculate bookmarkedBy
          const memberBookmarks = await Bookmark.find({ userId: userIdStr });
          const uniqueMemberIds = [...new Set(memberBookmarks.map((b: any) => b.memberId))];
          const bookmarkedBy = await Promise.all(uniqueMemberIds.map(async (firebaseId) => {
            try {
              const userRecord = await admin.auth().getUser(firebaseId);
              return {
                email: userRecord.email || null,
                name: userRecord.displayName || null,
              };
            } catch (err) {
              return null;
            }
          }));
          const filteredBookmarkedBy = bookmarkedBy.filter(Boolean);

          return {
            ...c,
            total_bookmarks: bookmarksMap.get(userIdStr) ?? c.total_bookmarks,
            isBookmarked,
            bookmarkId,
            bookmarkedBy: filteredBookmarkedBy,
          };
        }));
      }
      res.status(200).json(cached);
      return;
    }


    const memberId = req.user.firebase_id;
    const bookmarks = await Bookmark.find({ memberId });
    

    if (!job) {
      console.log("Job not found.");
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    console.log("Job found:", job.title);

    const expectedSkills: SkillItem[] = job.expectedSkills || [];
    const expectedCulturalFit: CulturalFitItem = {
      ...(job.expectedCulturalFit || {}),
    };
    console.log("Job expected cultural fit:", expectedCulturalFit);

    const users = await User.find({
      organisation_id: job.organisation_id || "USER_UPLOADED",
    });
    //const users = await User.find();
    console.log(`Found ${users.length} users to evaluate.`);

    // Calculate ideal (perfect) match for this job
    // let perfectSkills: SkillItem[] = Array.isArray(expectedSkills) && expectedSkills.length > 0
    //   ? expectedSkills.map((s) => ({ ...s }))
    //   : [];
    // let perfectCulturalFit: CulturalFitItem = { ...expectedCulturalFit };
    // if (!Array.isArray(expectedSkills) || expectedSkills.length === 0) {
    //   console.warn('expectedSkills is empty or not an array for job', jobId);
    // }
    // For perfect match, pass expectedSkills as both candidateSkills and expectedSkills
    // and expectedCulturalFit as both candidateCulturalFit and expectedCulturalFit
    const idealSkillMatch = calculateSkillsSimilarity(expectedSkills, expectedSkills) * 100;
    const idealMatchScore = calculateMatchScore(expectedSkills, expectedSkills, expectedCulturalFit, expectedCulturalFit);
    const processedExpectedCulturalFit = expectedCulturalFit._doc || expectedCulturalFit;
    const culturalFitScoreFields = Object.keys(processedExpectedCulturalFit).filter(
      (key) =>
        key.endsWith("_score") &&
        typeof processedExpectedCulturalFit[key] === "number" &&
        key !== "userId" &&
        !key.startsWith("_")
    );
    const idealCulturalFitMatch = culturalFitScoreFields.length * 5;

    const matches = await Promise.all(
      users.map(async (user) => {
        const idStr = user._id.toString();
        const firebase = user.firebase_id;
        console.log("→ Processing user:", user.name, { idStr, firebase });

        const culturalFit = await CulturalFit.findOne({
          userId: { $in: [idStr, firebase] },
        });
        const skillsData = await Skills.findOne({
          userId: { $in: [idStr, firebase] },
        });

        console.log("   culturalFit found for", user.name, ":", !!culturalFit);
        console.log("   skillsData   found for", user.name, ":", !!skillsData);

        const plainCulturalFit: CulturalFitItem = culturalFit
          ? { ...(culturalFit.toObject?.() ?? culturalFit) }
          : {};

        let plainSkills: SkillItem[] = [];
        if (skillsData?.skills && Array.isArray(skillsData.skills)) {
          plainSkills = skillsData.skills.map((s) =>
            typeof s.toObject === "function"
              ? s.toObject()
              : {
                  name: s.name,
                  score: s.score,
                  years_experience: s.years_experience,
                }
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
            (skill) =>
              skill.name?.toLowerCase() === expected.name?.toLowerCase()
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
            mandatory: expected.mandatory ?? false,
            matchScore: match,
          };
        });

        // Build per-cultural fit match info
        console.log(
          "Building perCulturalFitMatch with:",
          plainCulturalFit,
          expectedCulturalFit
        );

        // Get the expected cultural fit with fallback to _doc property if it exists
        const processedExpectedCulturalFit =
          expectedCulturalFit._doc || expectedCulturalFit;

        // Get all score fields from the expected cultural fit
        const culturalFitScoreFields = Object.keys(
          processedExpectedCulturalFit
        ).filter(
          (key) =>
            key.endsWith("_score") &&
            typeof processedExpectedCulturalFit[key] === "number" &&
            key !== "userId" &&
            !key.startsWith("_")
        );

        console.log("Cultural fit score fields:", culturalFitScoreFields);

        const perCulturalFitMatch = culturalFitScoreFields.map((field) => {
          const expected = processedExpectedCulturalFit[field] || 0;
          const actual = plainCulturalFit[field] || 0;
          const matchScore = Math.max(0, 5 - Math.abs(actual - expected)); // 0-5
          return {
            trait: field,
            expectedScore: expected,
            candidateScore: actual,
            matchScore: matchScore,
          };
        });

        // Calculate actual cultural fit match sum
        const culturalFitMatch = calculateCulturalFitMatchSum(plainCulturalFit, expectedCulturalFit);
        const percentageCulturalFitMatch = idealCulturalFitMatch > 0 ? (culturalFitMatch / idealCulturalFitMatch) * 100 : 0;

        let isBookmarked = false;
        const userBookmarks = bookmarks.find(
          (bookmark) => bookmark.userId === user._id.toString()
        );
        const bookmarkId = userBookmarks?._id.toString();

        if (userBookmarks) {
          isBookmarked = true;
        }
        // Get all unique memberIds from bookmarks
        const memberBookmarks = await Bookmark.find({userId:user._id})

        const uniqueMemberIds = [...new Set(memberBookmarks.map(c => c.memberId))];
        console.log("uniques",bookmarks);
        // Fetch user records from Firebase for each memberId
        const bookmarkedBy = await Promise.all(uniqueMemberIds.map(async (firebaseId) => {
          try {
            const userRecord = await admin.auth().getUser(firebaseId);
            return {
              email: userRecord.email || null,
              name: userRecord.displayName || null,
            };
          } catch (err) {
            // If user not found or error, skip
            return null;
          }
        }));
        // Filter out any nulls (errors)
        const filteredBookmarkedBy = bookmarkedBy.filter(Boolean);
        const skillsMatchRaw = calculateSkillsSimilarity(plainSkills, expectedSkills) * 100;
        const percentageSkillMatch = idealSkillMatch > 0 ? (skillsMatchRaw / idealSkillMatch) * 100 : 0;
        const percentageMatchScore = idealMatchScore > 0 ? (matchScore / idealMatchScore) * 100 : 0;
        return {
          userId: user._id,
          name: user.name,
          email: user.email,
          years_experience: user.years_of_experience,
          designation: user.designation,
          uploader_email: user.firebase_email,
          job_id: user.job,
          uploader_name: user.firebase_uploader_name,
          current_location: user.current_location,
          isBookmarked,
          bookmarkId,
          total_bookmarks: user.total_bookmarks,
          matchScore,
          idealSkillMatch,
          idealMatchScore,
          idealCulturalFitMatch,
          skillsMatch: skillsMatchRaw,
          culturalFitMatch,
          percentageSkillMatch,
          percentageCulturalFitMatch,
          percentageMatchScore,
          perSkillMatch,
          perCulturalFitMatch,
          bookmarkedBy: filteredBookmarkedBy,
        };
      })
    );

    const sorted = matches.sort((a, b) => b.matchScore - a.matchScore);
    console.log("Matching completed.");
    const payload = {
      success: true,
      message: "Candidates matched successfully",
      data: {
        jobTitle: job.title,
        jobId: job._id,
        totalCandidates: sorted.length,
        candidates: sorted,
      },
    };
    try {
      await JobSearchResponse.findOneAndUpdate(
        { jobId: jobId },
        { response: payload }
      );
      await Job.findByIdAndUpdate(jobId, { needRevaluation: false });
    } catch (err) {
      console.error("Error updating job search response:", err);
    }
    res.status(200).json(payload);
  } catch (err: any) {
    console.error("Error matching candidates:", err);
    res.status(500).json({
      success: false,
      message: "An error occurred while matching candidates",
      error: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

export default matchingRouter;
