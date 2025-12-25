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

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  })
);
app.use(express.json());


app.get("/api/health", async (req: Request, res: Response) => {
  console.log("Health check hit at:", new Date().toISOString());
  res.send({ message: "Health OK! from /api/health 500000000" });
});

app.use("/api/payment", paymentRoute);

app.use("/api/test/payment", paymentRouteTest);
app.use("/api/admin", adminRoutes);
app.use("/api/referral", referralRoutes);

app.use("/api/withdrawal", withdrawalRoutes);

app.listen(PORT, () => {
  console.log("Server running on localhost", PORT);
});
