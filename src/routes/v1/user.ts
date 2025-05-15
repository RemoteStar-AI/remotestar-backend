import { Router } from "express";
export const userRouter = Router();
import { authenticate } from "../../middleware/firebase-auth";
import {User} from "../../utils/db";
import admin from "../../utils/firebase";

userRouter.get("/", authenticate, async (req, res) => {
  try {
    const email = req.user?.email;
    console.log("User email:", email);
    const user = await User.findOne({ firebase_email: email });
    console.log("User found:", user);
    if (!user) {
      console.log("User not found");
      res.status(404).json({
        error: "User not found",
      });
      return;
    }
    res.status(200).json({
      user,
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: "Internal Server Error",
    });
    return;
  }
});

userRouter.delete("/", authenticate, async (req, res) => {
  try {
    const email = req.user?.email;
    const firebase_uid = req.user?.uid;
    if (!email || !firebase_uid) {
      console.log("User not found");
      res.status(404).json({
        error: "User not found",
      });
      return;
    }
    console.log("User email:", email);
    const user = await User.findOne({ firebase_email: email });
    console.log("User found:", user);
    const mongoResponse = await User.deleteOne({ firebase_email: email });
    console.log("User deleted:", mongoResponse);
    if (mongoResponse.deletedCount === 0) {
      console.log("User not found");
      res.status(404).json({
        error: "User not found",
      });
      return;
    }
    const firebaseResponse = await admin.auth().deleteUser(firebase_uid!);
    console.log("Firebase user deleted:", firebaseResponse);
    console.log("User deleted successfully");
    res.status(200).json({
      message: "User deleted successfully",
    });
    return;
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: "Internal Server Error",
    });
    return;
  }
});
