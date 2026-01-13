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
  "http://shreex.com",
  "shreex.com",
  "https://spirometrical-janean-unserviceably.ngrok-free.dev",
  /\.shreex\.com$/,
];

const corsOptions = {
  origin: (origin: string | undefined, callback: Function) => {
    console.log("🌐 CORS check for origin:", origin);

    if (!origin) return callback(null, true);

    let originHost;
    try {
      originHost = new URL(origin).hostname;
    } catch {
      console.log("❌ Invalid origin URL:", origin);
      return callback(new Error("Not allowed by CORS"));
    }

    const allowed =
      originHost === "bull-rush.vercel.app" ||
      originHost.endsWith(".shreex.com") ||
      originHost === "shreex.com" ||
      originHost === "localhost";

    if (allowed) {
      console.log("✅ CORS allowed for:", origin);
      callback(null, true);
    } else {
      console.log("❌ CORS blocked for:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const app = express();

// CORS middleware handles all requests including OPTIONS
app.use(cors(corsOptions));

app.use(express.json({ limit: "10mb" }));

// Add request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin}`);
  next();
});

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
app.use(
  "/api/webhooks/clerk",
  require("./webhooks/ClerkWebhooks").handleClerkWebhook
);

// 404 handler
app.use((req: Request, res: Response) => {
  console.log("404:", req.method, req.originalUrl);
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
  });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("❌ Server error:", err.message);

  // Ensure CORS headers are set even on error
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
  }

  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS policy: Origin not allowed" });
  }

  if (err.name === "PathError") {
    return res.status(400).json({ error: "Invalid URL path parameter" });
  }

  res
    .status(500)
    .json({ error: "Internal server error", message: err.message });
});

const PORT = process.env.PORT || 5008;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Allowed origins:`, allowedOrigins.join(", "));
});
