import { Request, Response, NextFunction } from "express";
import { clerkClient } from "@clerk/clerk-sdk-node";

declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string };
    }
  }
}

export const clerkMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("🔐 Auth Middleware Hit");
  console.log("Headers:", req.headers.authorization?.substring(0, 50));
  
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    console.log("❌ Missing or invalid auth header");
    return res.status(401).json({ error: "Missing token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    if (!token) {
      console.log("❌ No token found");
      return res.status(401).json({ error: "No token" });
    }
    
    console.log("🔍 Verifying token...");
    const claims = await clerkClient.verifyToken(token);
    console.log("✅ Token verified, userId:", claims.sub);
    
    req.auth = { userId: claims.sub };
    next();
  } catch (error: any) {
    console.error("❌ Token verification failed:", error.message);
    return res.status(401).json({ error: "Invalid token", details: error.message });
  }
};