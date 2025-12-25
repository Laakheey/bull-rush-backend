import express, { Request, Response } from "express";
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

// ✅ CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: any) {
    // Allow requests with no origin (like mobile apps, Postman, or server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log("❌ Blocked by CORS:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
  optionsSuccessStatus: 204,
};

// ✅ Apply CORS globally
app.use(cors(corsOptions));

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

// ✅ Error handler for CORS
app.use((err: any, req: Request, res: Response, next: any) => {
  if (err.message === "Not allowed by CORS") {
    console.error("CORS Error:", req.headers.origin);
    return res.status(403).json({ error: "CORS policy violation" });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log("Server running on localhost", PORT);
});