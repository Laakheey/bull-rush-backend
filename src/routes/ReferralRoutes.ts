import express from "express";
import { clerkMiddleware } from "../middleware/Middleware";
import { applyReferralCodeWithBonuses } from "../controllers/ReferralController";

const router = express.Router();

router.post("/apply", clerkMiddleware, applyReferralCodeWithBonuses);

export default router;