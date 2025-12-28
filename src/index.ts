import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
dotenv.config();

// import paymentRoute from "./routes/PaymentRoutes";
import paymentRouteTest from "./routes/PaymentsRoutesTest";
import adminRoutes from "./routes/AdminRoutes";
import referralRoutes from "./routes/ReferralRoutes";
import withdrawalRoutes from "./routes/WithdrawalRoutes";

const PORT = process.env.PORT1 || 5008;
console.log("🚀 Server starting on port:", process.env.PORT1);

const allowedOrigins = [
  "https://bull-rush.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
];

const app = express();

// ✅ CORS middleware - MUST BE FIRST
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  
  console.log("📨 Incoming request:", {
    method: req.method,
    path: req.path,
    origin: origin,
  });
  
  if (origin && allowedOrigins.includes(origin)) {
    console.log("✅ CORS: Allowing origin:", origin);
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else if (!origin) {
    console.log("⚠️ CORS: No origin header, allowing all");
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else {
    console.log("❌ CORS: Blocked origin:", origin);
  }
  
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  
  if (req.method === "OPTIONS") {
    console.log("🔄 Handling OPTIONS preflight");
    return res.status(204).end();
  }
  
  next();
});

app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.json({ 
    status: "OK", 
    message: "Bull Rush Backend API",
    timestamp: new Date().toISOString(),
    version: "2.0"
  });
});

app.get("/api/health", async (req: Request, res: Response) => {
  console.log("💚 Health check hit at:", new Date().toISOString());
  res.json({ 
    message: "Health OK!", 
    timestamp: new Date().toISOString() 
  });
});

// app.use("/api/payment", paymentRoute);

app.use("/api/test/payment", paymentRouteTest);
app.use("/api/admin", adminRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/withdrawal", withdrawalRoutes);

app.use((req: Request, res: Response) => {
  console.log("❌ 404:", req.method, req.path);
  res.status(404).json({ error: "Route not found", path: req.path });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("💥 Server error:", err);
  res.status(500).json({ error: "Internal server error", message: err.message });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌍 Allowed origins:`, allowedOrigins);
});