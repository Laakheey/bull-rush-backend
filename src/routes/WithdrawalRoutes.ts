// routes/withdrawal.routes.ts or in your main router

import { Router } from "express";
// import { clerkMiddleware, adminOnly } from "../middleware";
import { WithdrawalController } from "../controllers/WithdrawalController";
import { adminOnly, clerkMiddleware } from "../middleware/Middleware";

const router = Router();

// User routes
router.post("/request", clerkMiddleware, WithdrawalController.requestWithdrawal);

// Admin routes
router.get("/withdrawals", clerkMiddleware, adminOnly, WithdrawalController.getWithdrawals);
router.get("/wallets", clerkMiddleware, adminOnly, WithdrawalController.getPayoutWallets);
router.post("/process", clerkMiddleware, adminOnly, WithdrawalController.processWithdrawal);

router.post('/wallets', clerkMiddleware, adminOnly, WithdrawalController.addPayoutWallet)

export default router;