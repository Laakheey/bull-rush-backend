import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();

import paymentRoute from "./routes/PaymentRoutes";
import paymentRouteTest from "./routes/PaymentsRoutesTest";
import adminRoutes from "./routes/AdminRoutes";
import referralRoutes from "./routes/ReferralRoutes";
import withdrawalRoutes from "./routes/WithdrawalRoutes";

const PORT = 5008;
console.log("port", PORT);

const allowedOrigins = [
  "https://bull-rush.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const app = express();

// ✅ Manual CORS middleware (more reliable)
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else if (!origin) {
    // Allow requests with no origin (Postman, server-to-server)
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  
  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  
  next();
});

// ✅ Body parser
app.use(express.json());

// ✅ Health check
app.get("/api/health", async (req: Request, res: Response) => {
  console.log("Health check hit at:", new Date().toISOString());
  res.send({ message: "Health OK! from /api/health 500000000" });
});

// ✅ Routes
app.use("/api/payment", paymentRoute);
app.use("/api/test/payment", paymentRouteTest);
app.use("/api/admin", adminRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/withdrawal", withdrawalRoutes);

// ✅ 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Route not found" });
});

// ✅ Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log("Server running on localhost", PORT);
});