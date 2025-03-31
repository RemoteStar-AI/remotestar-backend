import { NextFunction, Request, Response } from 'express';
import admin from '../utils/firebase';

export async function authenticate(req:Request,res:Response,next:NextFunction){

    const authHeader = req.headers.authorization;

    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    }catch (error) {
        console.error('Error verifying token:', error);
        return res.status(403).json({ message: 'Unauthorized' });
    }
}