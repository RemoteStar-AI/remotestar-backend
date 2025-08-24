import { Router } from "express";
import { authenticate } from "../../middleware/firebase-auth";
import { CallDetails, User, Job, Company } from "../../utils/db";
import { getCallDetails } from "../../utils/vapi";

export const vettedRouter = Router();

vettedRouter.get("/", authenticate, async (req: any, res: any) => {
    try {
        console.log("GET /vetted route hit");
        const organisation_id = req.user?.organisation;

        if (!organisation_id) {
            console.error("No organisation_id found in request");
            return res.status(400).json({
                success: false,
                error: "Organisation ID is required"
            });
        }

        console.log(`Fetching vetted details for organisation: ${organisation_id}`);
        const vettedDetails = await CallDetails.find({ organisation_id });

        if (!vettedDetails.length) {
            console.log("No vetted details found for organisation");
            return res.json({
                success: true,
                data: []
            });
        }

        console.log(`Processing ${vettedDetails.length} vetted details`);
        const finalVettedDetails = await Promise.all(vettedDetails.map(async (detail) => {
            try {
                const candidateId = detail.candidateId;
                const jobId = detail.jobId;
                let callDetails;

                // Get call details either from cache or VAPI
                if (Object.keys(detail.cache).length === 0 && detail.type != 'email') {
                    console.log(`Fetching call details from VAPI for call ID: ${detail.callId}`);
                    try {
                        callDetails = await getCallDetails(detail.callId) as any;
                        if (callDetails.status === "ended" || callDetails.status === "failed") {
                            await CallDetails.updateOne({ _id: detail._id }, { cache: callDetails });
                            console.log(`Updated cache for call ID: ${detail.callId}`);
                        }
                    } catch (error) {
                        console.error(`Error fetching call details from VAPI: ${error}`);
                        callDetails = {};
                    }
                } else if (detail.type == 'email') {
                    callDetails = detail;
                } else {
                    console.log(`Using cached call details for call ID: ${detail.callId}`);
                    callDetails = detail.cache;
                }

                if(detail.videoUrl) {
                    callDetails.videoUrl = detail.videoUrl;
                }

                // Fetch related data
                const [candidateDetails, jobDetails] = await Promise.all([
                    User.findOne({ _id: candidateId }),
                    Job.findOne({ _id: jobId })
                ]);

                if (!candidateDetails || !jobDetails) {
                    console.warn(`Missing data - Candidate: ${!!candidateDetails}, Job: ${!!jobDetails}`);
                    return null;
                }

                const companyId = jobDetails.companyId;
                const companyDetails = await Company.findOne({ _id: companyId });

                if (!companyDetails) {
                    console.warn(`Company not found for ID: ${companyId}`);
                    return null;
                }

                return {
                    candidateName: candidateDetails.name,
                    candidateId,
                    jobTitle: jobDetails.title,
                    jobId,
                    type: detail.type,
                    companyName: companyDetails.name,
                    companyId,
                    callDetails
                };
            } catch (error) {
                console.error(`Error processing vetted detail: ${error}`);
                return null;
            }
        }));

        // Filter out null values and send response
        const validDetails = finalVettedDetails.filter(detail => detail !== null);
        console.log(`Successfully processed ${validDetails.length} vetted details`);

        res.json({
            success: true,
            data: validDetails
        });

    } catch (error) {
        console.error("Error in /vetted route:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error"
        });
    }
});

export default vettedRouter;
