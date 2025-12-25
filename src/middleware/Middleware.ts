import { Request, Response, NextFunction } from "express";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { supabase } from "../config/supabase";

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


export const adminOnly = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = req.auth?.userId;

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("is_admin, is_active")
      .eq("id", userId)
      .single();

    if (error || !user) {
      return res.status(404).json({ error: "User profile not found" });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: "Your account is suspended." });
    }

    if (!user.is_admin) {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }

    // If all checks pass, move to the next function
    next();
  } catch (err) {
    return res.status(500).json({ error: "Server error during authorization" });
  }
};