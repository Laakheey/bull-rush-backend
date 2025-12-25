import express from "express";
// import { requireAuth } from "@clerk/express";
// import { applyReferralCodeWithBonuses } from "../controllers/referralController";
import { clerkMiddleware } from "../middleware/Middleware";
import { applyReferralCodeWithBonuses } from "../controllers/ReferralController";

const router = express.Router();

router.post("/apply", clerkMiddleware, applyReferralCodeWithBonuses);

export default router;