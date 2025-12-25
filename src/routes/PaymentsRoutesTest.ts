import express from 'express';
import { clerkMiddleware } from '../middleware/Middleware';
import { cashOutTokensTest, initiatePaymentTest, submitTxHashTest } from '../controllers/PaymentControllerTest';

const router = express.Router();

router.post('/initiate', clerkMiddleware, initiatePaymentTest);
router.post('/submit-tx-hash', clerkMiddleware, submitTxHashTest);
router.post('/cashout', clerkMiddleware, cashOutTokensTest);

router.get("/test", (_, res) => res.json({ msg: "Payment route working" }));

export default router;