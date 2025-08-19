import * as admin from 'firebase-admin';
import {config} from 'dotenv';
config();

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });


export async function getFirebaseEmailFromUID(uid: string) {
  const user = await admin.auth().getUser(uid);
  return user.email;
}

export default admin;