import dotenv from "dotenv";
dotenv.config(); 

import express, { Request, Response, NextFunction } from "express";
import cors from "cors"; 
import paymentRouteTest from "./routes/PaymentsRoutesTest";
import adminRoutes from "./routes/AdminRoutes";
import referralRoutes from "./routes/ReferralRoutes";
import withdrawalRoutes from "./routes/WithdrawalRoutes";

const allowedOrigins = [
  "https://bull-rush.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "https://shreex.com",
];

const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true, 
  optionsSuccessStatus: 204, 
};

const app = express();

app.use(cors(corsOptions));

app.options("{*path}", cors(corsOptions));

app.use(express.json({ limit: "10mb" }));

app.get("/", (req: Request, res: Response) => {
  res.json({
    status: "OK",
    message: "Bull Rush Backend API",
    timestamp: new Date().toISOString(),
    version: "2.0",
  });
});

app.get("/api/health", (req: Request, res: Response) => {
  console.log("Health check hit at:", new Date().toISOString());
  res.json({
    message: "Health OK!",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/test/payment", paymentRouteTest);
app.use("/api/admin", adminRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/withdrawal", withdrawalRoutes);

app.all("{*path}", (req: Request, res: Response) => {
  console.log("404:", req.method, req.originalUrl);
  res.status(404).json({ 
    error: "Route not found", 
    path: req.originalUrl 
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("Server error:", err);
  
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS policy: Origin not allowed" });
  }

  if (err.name === 'PathError') {
    return res.status(400).json({ error: "Invalid URL path parameter" });
  }

  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 5008;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Allowed origins:`, allowedOrigins.join(", "));
});