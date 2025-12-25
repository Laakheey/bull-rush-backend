import express, {Request, Response} from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import paymentRoute from './routes/PaymentRoutes';

import paymentRouteTest from './routes/PaymentsRoutesTest';
import adminRoutes from './routes/AdminRoutes'
import referralRoutes from "./routes/ReferralRoutes";
import withdrawalRoutes from "./routes/WithdrawalRoutes";



const PORT = 5008;
console.log("port", PORT);

const app = express();
app.use(express.json())
app.use(cors());

app.get("/api/health", async (req: Request, res: Response) => {
  console.log("Health check hit at:", new Date().toISOString());
  res.send({ message: "Health OK! from /api/health 500000000" });
});

app.use("/api/payment", paymentRoute);

app.use("/api/test/payment", paymentRouteTest);
app.use('/api/admin', adminRoutes);
app.use("/api/referral", referralRoutes);

app.use("/api/withdrawal", withdrawalRoutes);

app.listen(PORT, () => {
  console.log("Server running on localhost", PORT);
});