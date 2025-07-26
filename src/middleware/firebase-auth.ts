import { NextFunction, Request, Response } from 'express';
import admin from '../utils/firebase';
import { Organisation } from '../utils/db';

export async function authenticate(req:Request,res:Response,next:NextFunction){

    const authHeader = req.headers.authorization;

    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        req.user.email = decodedToken.email;
        req.user.firebase_id = decodedToken.uid;
        req.user.displayName = decodedToken.name;
        req.user.token = token;
        const organisation = await Organisation.findOne({ members: { $in: [decodedToken.email] } });
        if (organisation) {
            req.user.organisation = organisation._id;
            req.user.organisationName = organisation.name;
        }
        else {
            req.user.organisation = "";
            req.user.organisationName = "";
        }
        // Log the decoded token for debugging
        // console.log('Decoded token:', decodedToken);
        next();
    }catch (error) {
        console.error('Error verifying token:', error);
        res.status(403).json({ message: 'Unauthorized' });
        return;
    }
}