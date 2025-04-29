import { Router } from "express";
import { Job, CulturalFit, Skills } from "../../utils/db";
import { Document, Types } from "mongoose";
import User from "../../utils/db";

export const matchingRouter = Router();

// Define interfaces for better type safety
interface SkillItem {
  name?: string | null;
  years_experience?: number | null;
  score?: number | null;
}

interface CulturalFitItem {
  userId?: string;
  product_score?: number;
  service_score?: number;
  startup_score?: number;
  mnc_score?: number;
  loyalty_score?: number;
  [key: string]: any;
}

/**
 * Calculate similarity between candidate skills and expected skills
 * @param candidateSkills - User's skills
 * @param expectedSkills - Job's required skills
 * @returns Similarity score between 0 and 1
 */
function calculateSkillsSimilarity(
  candidateSkills: SkillItem[],
  expectedSkills: SkillItem[]
) {
  // If no expected skills or candidate skills, return 0
  if (!expectedSkills?.length || !candidateSkills?.length) {
    return 0;
  }

  let totalScore = 0;
  let totalWeight = 0;

  // For each expected skill
  expectedSkills.forEach((expected) => {
    if (!expected.name) return; // Skip items without names
    
    // Find matching skill in candidate's skills
    const candidateSkill = candidateSkills.find(
      (skill) => skill.name?.toLowerCase() === expected.name?.toLowerCase()
    );

    if (candidateSkill) {
      // Weight by years of experience required
      const weight = Math.max(1, expected.years_experience || 1);
      // Score based on how close candidate's skill level is to expected
      const matchScore = Math.min(candidateSkill.score || 0, expected.score || 0);
      
      totalScore += matchScore * weight;
      totalWeight += weight;
    } else {
      // Penalize for missing skills
      totalWeight += Math.max(1, expected.years_experience || 1);
    }
  });

  // Normalize result between 0 and 1
  return totalWeight > 0 ? totalScore / totalWeight : 0;
}

/**
 * Calculate similarity between candidate cultural fit and expected cultural fit
 * @param candidateCulturalFit - User's cultural fit profile
 * @param expectedCulturalFit - Job's expected cultural fit
 * @returns Similarity score between 0 and 1
 */
function calculateCulturalFitSimilarity(
  candidateCulturalFit: CulturalFitItem,
  expectedCulturalFit: CulturalFitItem
) {
  // If either cultural fit object is missing, return 0
  if (!candidateCulturalFit || !expectedCulturalFit) {
    return 0;
  }

  let totalNormalizedScore = 0;
  let count = 0;

  // Only compare score fields (ending with _score)
  const scoreFields = Object.keys(expectedCulturalFit).filter(
    (key) => 
      key.endsWith("_score") && 
      typeof expectedCulturalFit[key] === "number" &&
      key !== "userId" &&
      !key.startsWith("_")
  );

  for (const field of scoreFields) {
    const expected = expectedCulturalFit[field] || 0;
    const actual = candidateCulturalFit[field] || 0;
    
    // Calculate similarity based on how close the scores are
    const difference = Math.abs(actual - expected);
    // Normalize to 0-1 range (5 is max possible difference)
    const normalizedScore = Math.max(0, (5 - difference) / 5);
    
    totalNormalizedScore += normalizedScore;
    count++;
  }

  return count > 0 ? totalNormalizedScore / count : 0;
}

/**
 * Calculate overall match score between candidate and job
 * @param candidateSkills - User's skills
 * @param expectedSkills - Job's required skills
 * @param candidateCulturalFit - User's cultural fit profile
 * @param expectedCulturalFit - Job's expected cultural fit
 * @param skillsWeight - Weight given to skills (default: 0.7)
 * @param culturalFitWeight - Weight given to cultural fit (default: 0.3)
 * @returns Match score (0-100)
 */
function calculateMatchScore(
  candidateSkills: SkillItem[],
  expectedSkills: SkillItem[],
  candidateCulturalFit: CulturalFitItem,
  expectedCulturalFit: CulturalFitItem,
  skillsWeight = 0.7,
  culturalFitWeight = 0.3
) {
  const skillsSimilarity = calculateSkillsSimilarity(candidateSkills, expectedSkills);
  const culturalFitSimilarity = calculateCulturalFitSimilarity(candidateCulturalFit, expectedCulturalFit);

  // Weighted combination of skills and cultural fit
  const totalWeight = skillsWeight + culturalFitWeight;
  const weightedScore = (
    (skillsSimilarity * skillsWeight) + 
    (culturalFitSimilarity * culturalFitWeight)
  ) / totalWeight;

  // Convert to 0-100 range and round
  return Math.round(weightedScore * 100);
}

/**
 * GET /api/matching/:jobId
 * Find best candidate matches for a specific job
 */
matchingRouter.get("/:jobId", async (req: any, res: any) => {
  try {
    const { jobId } = req.params;

    // Validate jobId
    if (!jobId) {
      return res.status(400).json({ 
        success: false, 
        message: "Job ID is required" 
      });
    }

    // Find the job
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({ 
        success: false, 
        message: "Job not found" 
      });
    }

    // Extract job requirements
    const expectedSkills = job.expectedSkills?.toObject ? 
      job.expectedSkills.toObject() : 
      (job.expectedSkills || []);

    const expectedCulturalFit = job.expectedCulturalFit ? 
      job.expectedCulturalFit : 
      {};

    // Get all users
    const users = await User.find({});

    // Calculate match score for each user
    const matches = await Promise.all(
      users.map(async (user) => {
        // Get user's cultural fit profile and skills
        const culturalFit = await CulturalFit.findOne({ userId: user.firebase_id || user._id });
        const skillsData = await Skills.findOne({ userId: user.firebase_id || user._id });
        
        // Convert Mongoose documents to plain objects to avoid TypeScript issues
        const plainCulturalFit = culturalFit?.toObject ? 
          culturalFit.toObject() as CulturalFitItem : 
          {} as CulturalFitItem;
          
        // Handle skills array properly with type conversion
        let plainSkills: SkillItem[] = [];
        if (skillsData?.skills) {
          if (Array.isArray(skillsData.skills)) {
            // Convert each skill item to plain object
            plainSkills = skillsData.skills.map(skill => {
              return typeof skill.toObject === 'function' 
                ? skill.toObject() 
                : { 
                    name: skill.name, 
                    score: skill.score, 
                    years_experience: skill.years_experience 
                  };
            });
          }
        }

        // Calculate match score
        const matchScore = calculateMatchScore(
          plainSkills,
          expectedSkills as SkillItem[],
          plainCulturalFit,
          expectedCulturalFit as CulturalFitItem
        );

        // Return user with match score
        return {
          userId: user._id,
          firebaseId: user.firebase_id,
          name: user.name,
          email: user.email,
          matchScore,
          // Include details for debugging (can be removed in production)
          skillsMatch: calculateSkillsSimilarity(plainSkills, expectedSkills as SkillItem[]) * 100,
          culturalFitMatch: calculateCulturalFitSimilarity(plainCulturalFit, expectedCulturalFit as CulturalFitItem) * 100
        };
      })
    );

    // Sort matches by score (highest first)
    const sortedMatches = matches.sort((a, b) => b.matchScore - a.matchScore);

    // Return results
    res.status(200).json({
      success: true,
      message: "Candidates matched successfully",
      data: {
        jobTitle: job.title,
        jobId: job._id,
        totalCandidates: sortedMatches.length,
        candidates: sortedMatches
      }
    });
  } catch (error: any) {
    console.error("Error matching candidates:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while matching candidates",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default matchingRouter;