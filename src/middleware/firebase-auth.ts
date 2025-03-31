import { NextFunction, Request, Response } from 'express';
import admin from '../utils/firebase';

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
        // Log the decoded token for debugging
        console.log('Decoded token:', decodedToken);
        next();
    }catch (error) {
        console.error('Error verifying token:', error);
        res.status(403).json({ message: 'Unauthorized' });
        return;
    }
}