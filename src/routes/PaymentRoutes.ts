import express from 'express';
import { initiatePayment, verifyPayment, verifyPayment1 } from '../controllers/PaymentController';
import { clerkMiddleware } from '../middleware/Middleware';

const router = express.Router();

router.get('/', verifyPayment1);

router.post('/initiate', clerkMiddleware, initiatePayment);
router.post('/verify', clerkMiddleware, verifyPayment);


export default router;