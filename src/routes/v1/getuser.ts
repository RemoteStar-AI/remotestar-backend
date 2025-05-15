import { Router } from "express";
export const getUserRouter = Router();
import { authenticate } from "../../middleware/firebase-auth";
import {User} from "../../utils/db";

getUserRouter.get("/", authenticate, async (req, res) => {
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
