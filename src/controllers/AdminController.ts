// controllers/admin.controller.ts

import { Request, Response } from "express";
import { supabase } from "../config/supabase";

export class AdminController {
  static async getUsers(req: Request, res: Response) {
    try {
      console.log("🔍 Fetching users for admin:", req.auth?.userId);

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      console.log("🔍 Looking for admin user with ID:", req.auth!.userId);

      const { data: adminUser, error: adminError } = await supabase
        .from("users")
        .select("id, is_admin, email")
        .eq("id", req.auth!.userId)
        .single();

      console.log("📊 Admin check result:", { adminUser, adminError });

      if (adminError) {
        console.log("❌ Error checking admin:", adminError);
        return res.status(500).json({
          error: "Failed to verify admin status",
          details: adminError.message,
        });
      }

      if (!adminUser?.is_admin) {
        console.log(
          "❌ User is not admin:",
          req.auth?.userId,
          "is_admin:",
          adminUser?.is_admin
        );
        return res.status(403).json({ error: "Admin access required" });
      }

      console.log("✅ Admin verified:", adminUser.email);

      const { data, error, count } = await supabase
        .from("users")
        .select(
          "id, email, first_name, last_name, token_balance, created_at, is_admin",
          { count: "exact" }
        )
        .order("token_balance", { ascending: false })
        .range(from, to);

      if (error) {
        console.error("❌ Supabase error:", error);
        return res
          .status(500)
          .json({ error: "Failed to fetch users", details: error.message });
      }

      console.log(`✅ Fetched ${data?.length} users (page ${page})`);

      res.json({
        users: data || [],
        totalUsers: count || 0,
        currentPage: page,
        totalPages: Math.ceil((count || 0) / pageSize),
        pageSize,
      });
    } catch (error: any) {
      console.error("❌ Error fetching users:", error);
      res
        .status(500)
        .json({ error: "Internal server error", details: error.message });
    }
  }

  static async updateUserBalance(req: Request, res: Response) {
    try {
      const { userId } = req.params; // This is the Clerk ID (TEXT)
      const { newBalance } = req.body;

      console.log(`💰 Updating balance for user ${userId} to ${newBalance}`);

      // Verify admin
      const { data: adminUser, error: adminError } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", req.auth!.userId)
        .single();

      if (adminError || !adminUser?.is_admin) {
        console.log("❌ User is not admin");
        return res.status(403).json({ error: "Admin access required" });
      }

      // Validate balance
      if (typeof newBalance !== "number" || newBalance < 0) {
        return res.status(400).json({ error: "Invalid balance amount" });
      }

      // Get current balance
      const { data: currentUser, error: fetchError } = await supabase
        .from("users")
        .select("token_balance, email, first_name")
        .eq("id", userId)
        .single();

      if (fetchError || !currentUser) {
        console.log("❌ User not found:", userId);
        return res.status(404).json({ error: "User not found" });
      }

      const oldBalance = Number(currentUser.token_balance) || 0;
      const difference = newBalance - oldBalance;
      console.log(
        `📊 Balance change: ${oldBalance} → ${newBalance} (${
          difference >= 0 ? "+" : ""
        }${difference})`
      );

      const { error: updateError } = await supabase
        .from("users")
        .update({ token_balance: newBalance })
        .eq("id", userId);

      if (updateError) {
        console.error("❌ Update error:", updateError);
        return res.status(500).json({
          error: "Failed to update balance",
          details: updateError.message,
        });
      }

      if (difference !== 0) {
        const { error: txError } = await supabase
          .from("admin_transactions")
          .insert({
            user_id: userId,
            amount: Math.abs(difference),
            transaction_type: difference >= 0 ? "credit" : "debit",
            description: `Admin adjusted balance ${
              difference >= 0 ? "+" : ""
            }${difference} tokens (by ${req.auth!.userId})`,
          });

        if (txError) {
          console.error("⚠️ Failed to log transaction:", txError);
        } else {
          console.log("✅ Transaction logged");
        }
      }

      console.log("✅ Balance updated successfully");
      res.json({
        success: true,
        newBalance,
        previousBalance: oldBalance,
        difference,
        message: "Balance updated successfully",
      });
    } catch (error: any) {
      console.error("❌ Error updating balance:", error);
      res
        .status(500)
        .json({ error: "Internal server error", details: error.message });
    }
  }

  static async getUserTransactions(req: Request, res: Response) {
    try {
      const { userId } = req.params; // Clerk ID
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      console.log(`📜 Fetching transactions for user ${userId}`);

      // Verify admin
      const { data: adminUser, error: adminError } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", req.auth!.userId)
        .single();

      if (adminError || !adminUser?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Fetch token requests (your existing transaction table)
      const {
        data: tokenRequests,
        error: trError,
        count: trCount,
      } = await supabase
        .from("token_requests")
        .select("*", { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

      // Also fetch admin transactions
      const { data: adminTxs, error: atError } = await supabase
        .from("admin_transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (trError) {
        console.error("❌ Token requests fetch error:", trError);
      }
      if (atError) {
        console.error("❌ Admin transactions fetch error:", atError);
      }

      // Combine and format both types
      const allTransactions = [
        ...(tokenRequests || []).map((tr) => ({
          id: tr.request_id,
          type: "token_request",
          amount: tr.amount_usdt,
          status: tr.status,
          created_at: tr.created_at,
          details: {
            tx_hash: tr.tx_hash,
            screenshot_url: tr.screenshot_url,
            detected_amount: tr.detected_amount,
          },
        })),
        ...(adminTxs || []).map((at) => ({
          id: at.id,
          type: "admin_adjustment",
          amount: at.amount,
          transaction_type: at.transaction_type,
          description: at.description,
          created_at: at.created_at,
        })),
      ].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      console.log(`✅ Fetched ${allTransactions.length} total transactions`);

      res.json({
        transactions: allTransactions.slice(from, to + 1),
        totalTransactions: allTransactions.length,
        currentPage: page,
        totalPages: Math.ceil(allTransactions.length / pageSize),
      });
    } catch (error: any) {
      console.error("❌ Error fetching transactions:", error);
      res
        .status(500)
        .json({ error: "Internal server error", details: error.message });
    }
  }

  static async getDashboardStats(req: Request, res: Response) {
    try {
      console.log("📊 Fetching dashboard stats");

      // Verify admin
      const { data: adminUser, error: adminError } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", req.auth!.userId)
        .single();

      if (adminError || !adminUser?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      // Get total users
      const { count: totalUsers } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

      // Get total tokens in circulation
      const { data: tokenData } = await supabase
        .from("users")
        .select("token_balance");

      const totalTokens =
        tokenData?.reduce(
          (sum, user) => sum + Number(user.token_balance || 0),
          0
        ) || 0;

      // Get pending token requests (last 24h)
      const { count: pendingRequests } = await supabase
        .from("token_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");

      // Get recent transactions count (last 24h)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const { count: recentTransactions } = await supabase
        .from("token_requests")
        .select("*", { count: "exact", head: true })
        .gte("created_at", yesterday.toISOString());

      console.log("✅ Stats fetched successfully");

      res.json({
        totalUsers: totalUsers || 0,
        totalTokens,
        pendingRequests: pendingRequests || 0,
        recentTransactions: recentTransactions || 0,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("❌ Error fetching stats:", error);
      res
        .status(500)
        .json({ error: "Internal server error", details: error.message });
    }
  }

  static async searchUsers(req: Request, res: Response) {
    try {
      const { query } = req.query;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!query || typeof query !== "string") {
        return res.status(400).json({ error: "Search query required" });
      }

      console.log(`🔍 Searching users: "${query}"`);

      // const { data: adminUser, error: adminError } = await supabase
      //   .from("users")
      //   .select("is_admin")
      //   .eq("id", req.auth!.userId)
      //   .single();

      // if (adminError || !adminUser?.is_admin) {
      //   return res.status(403).json({ error: "Admin access required" });
      // }

      // Search by email, first name, or last name
      const { data, error } = await supabase
        .from("users")
        .select("id, email, first_name, last_name, token_balance, created_at")
        .or(
          `email.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`
        )
        .limit(limit);

      if (error) {
        console.error("❌ Search error:", error);
        return res
          .status(500)
          .json({ error: "Search failed", details: error.message });
      }

      console.log(`✅ Found ${data?.length} users`);

      res.json({
        users: data || [],
        query,
      });
    } catch (error: any) {
      console.error("❌ Error searching users:", error);
      res
        .status(500)
        .json({ error: "Internal server error", details: error.message });
    }
  }

  static async toggleUserStatus(req: Request, res: Response) {
    const { userId } = req.params;
    const { isActive } = req.body;

    const { error } = await supabase
      .from("users")
      .update({ is_active: isActive })
      .eq("id", userId);

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  }

  static async getSupportChats(req: Request, res: Response) {
    try {
      const { data: adminUser, error: adminError } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", req.auth!.userId)
        .single();

      if (adminError || !adminUser?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { data: chatUsers, error: usersError } = await supabase
        .from("support_messages")
        .select("user_id")
        .order("created_at", { ascending: false });

      if (usersError) {
        console.error("Error fetching chat users:", usersError);
        return res.status(500).json({ error: "Failed to load conversations" });
      }

      const uniqueUserIds = [...new Set(chatUsers?.map((c) => c.user_id))];

      if (uniqueUserIds.length === 0) {
        return res.json({ chats: [] });
      }

      const { data: profiles, error: profileError } = await supabase
        .from("users")
        .select("id, email, first_name, last_name")
        .in("id", uniqueUserIds);

      if (profileError) {
        console.error("Error fetching profiles:", profileError);
        return res.status(500).json({ error: "Failed to load user data" });
      }

      const chats = await Promise.all(
        profiles.map(async (user) => {
          const { data: messages, error: msgError } = await supabase
            .from("support_messages")
            .select("content, image_url, is_admin_reply, created_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1);

          if (msgError || !messages || messages.length === 0) {
            return null;
          }

          const lastMsg = messages[0];
          const lastMessageText = lastMsg.image_url
            ? "Image"
            : lastMsg.content || "Media";

          const { count: unreadCount } = await supabase
            .from("support_messages")
            .select("*", { count: "exact", head: true })
            .eq("user_id", user.id)
            .eq("is_admin_reply", false)
            .is("read_at", null);

          return {
            user_id: user.id,
            user_name:
              `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
              "User",
            user_email: user.email || "No email",
            last_message: lastMessageText,
            last_message_time: lastMsg.created_at,
            unread_count: unreadCount || 0,
          };
        })
      );

      const validChats = chats.filter(Boolean);

      validChats.sort(
        (a, b) =>
          new Date(b!.last_message_time).getTime() -
          new Date(a!.last_message_time).getTime()
      );

      res.json({ chats: validChats });
    } catch (error: any) {
      console.error("Error in getSupportChats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async getUserChatMessages(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const { data: adminUser, error: adminError } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", req.auth!.userId)
        .single();

      if (adminError || !adminUser?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { data: messages, error } = await supabase
        .from("support_messages")
        .select("id, content, image_url, is_admin_reply, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        return res.status(500).json({ error: "Failed to load messages" });
      }

      res.json({ messages: messages || [] });
    } catch (error: any) {
      console.error("Error in getUserChatMessages:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  static async sendAdminReply(req: Request, res: Response) {
    try {
      const { user_id, content, image_url } = req.body;

      if (!user_id || (!content?.trim() && !image_url)) {
        return res.status(400).json({ error: "Invalid message" });
      }

      const { data: adminUser, error: adminError } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", req.auth!.userId)
        .single();

      if (adminError || !adminUser?.is_admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { data: newMessage, error } = await supabase
        .from("support_messages")
        .insert({
          user_id,
          content: content?.trim() || null,
          image_url: image_url || null,
          is_admin_reply: true,
        })
        .select()
        .single();

      if (error) {
        console.error("Error saving reply:", error);
        return res.status(500).json({ error: "Failed to send reply" });
      }

      res.json({ message: newMessage });
    } catch (error: any) {
      console.error("Error in sendAdminReply:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
