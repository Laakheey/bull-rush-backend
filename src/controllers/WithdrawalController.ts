// controllers/WithdrawalController.ts or inside AdminController

// import { Request, Response } from "express";
// import { supabase } from "../config/supabase";
// import { sendUSDTToUserTest } from "../services/TronServiceTest";
// import { decryptPrivateKey, encryptPrivateKey } from "../utils/encryption";

// export class WithdrawalController {
//   static async requestWithdrawal(req: Request, res: Response) {
//     const { amount, walletAddress } = req.body;
//     const userId = req.auth?.userId;

//     if (!userId) return res.status(401).json({ error: "Unauthorized" });

//     const numAmount = Number(amount);
//     if (numAmount <= 0 || !walletAddress) {
//       return res.status(400).json({ error: "Invalid amount or address" });
//     }

//     if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress.trim())) {
//       return res.status(400).json({ error: "Invalid Tron address" });
//     }

//     // Check balance
//     const { data: user } = await supabase
//       .from("users")
//       .select("token_balance")
//       .eq("id", userId)
//       .single();

//     if (!user || Number(user.token_balance) < numAmount) {
//       return res.status(400).json({ error: "Insufficient balance" });
//     }

//     // Create pending withdrawal
//     const { data, error } = await supabase
//       .from("withdrawals")
//       .insert({
//         user_id: userId,
//         amount: numAmount,
//         wallet_address: walletAddress.trim(),
//         status: "pending",
//       })
//       .select()
//       .single();

//     if (error) {
//       console.error("Failed to create withdrawal request:", error);
//       return res.status(500).json({ error: "Failed to submit request" });
//     }

//     res.json({ success: true, withdrawal: data });
//   }

//   static async getWithdrawals(req: Request, res: Response) {
//     const userId = req.auth?.userId;
//     if (!userId) return res.status(401).json({ error: "Unauthorized" });

//     const { data: admin } = await supabase
//       .from("users")
//       .select("is_admin")
//       .eq("id", userId)
//       .single();

//     if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

//     const { data: withdrawals, error } = await supabase
//       .from("withdrawals")
//       .select(
//         "id, user_id, amount, wallet_address, status, tx_hash, created_at"
//       )
//       .order("created_at", { ascending: false });

//     if (error) return res.status(500).json({ error: "Failed to fetch" });

//     // Join user info
//     const userIds = withdrawals.map((w: any) => w.user_id);
//     const { data: users } = await supabase
//       .from("users")
//       .select("id, email, first_name, last_name")
//       .in("id", userIds);

//     const enriched = withdrawals.map((w: any) => {
//       const user = users?.find((u: any) => u.id === w.user_id);
//       return {
//         ...w,
//         user_name:
//           `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "User",
//         user_email: user?.email || "N/A",
//       };
//     });

//     res.json({ withdrawals: enriched });
//   }

//   static async getPayoutWallets(req: Request, res: Response) {
//     const userId = req.auth?.userId;
//     if (!userId) return res.status(401).json({ error: "Unauthorized" });

//     const { data: admin } = await supabase
//       .from("users")
//       .select("is_admin")
//       .eq("id", userId)
//       .single();

//     if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

//     const { data: wallets, error } = await supabase
//       .from("payout_wallets")
//       .select("id, name, address, balance, is_active")
//       .eq("is_active", true);

//     if (error) return res.status(500).json({ error: "Failed to load wallets" });

//     res.json({ wallets: wallets || [] });
//   }

//   static async processWithdrawal(req: Request, res: Response) {
//     const { withdrawalId, status, fromWalletId } = req.body;
//     const adminId = req.auth?.userId;
    
//     if (!adminId) return res.status(401).json({ error: "Unauthorized" });
//     if (!withdrawalId || !["approved", "rejected"].includes(status)) {
//       return res.status(400).json({ error: "Invalid request" });
//     }

//     const { data: admin } = await supabase
//       .from("users")
//       .select("is_admin")
//       .eq("id", adminId)
//       .single();

//     if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

//     const { data: withdrawal } = await supabase
//       .from("withdrawals")
//       .select("*")
//       .eq("id", withdrawalId)
//       .eq("status", "pending")
//       .single();

//     if (!withdrawal)
//       return res
//         .status(404)
//         .json({ error: "Withdrawal not found or already processed" });

//     if (status === "rejected") {
//       await supabase
//         .from("withdrawals")
//         .update({ status: "rejected", updated_at: new Date().toISOString() })
//         .eq("id", withdrawalId);

//       return res.json({ success: true, message: "Withdrawal rejected" });
//     }

//     if (!fromWalletId)
//       return res.status(400).json({ error: "Select payout wallet" });

//     const { data: wallet } = await supabase
//       .from("payout_wallets")
//       .select("address, private_key")
//       .eq("id", fromWalletId)
//       .single();

//     if (!wallet) return res.status(400).json({ error: "Invalid wallet" });

//     const decryptedPrivateKey = decryptPrivateKey(wallet.private_key);

//     const txHash = await sendUSDTToUserTest(
//       withdrawal.wallet_address,
//       withdrawal.amount,
//       decryptedPrivateKey
//     );

//     if (!txHash) {
//       await supabase
//         .from("withdrawals")
//         .update({ status: "failed", updated_at: new Date().toISOString() })
//         .eq("id", withdrawalId);

//       return res.status(500).json({ error: "Failed to send USDT" });
//     }

//     // Deduct tokens from user
//     const { data: user } = await supabase
//       .from("users")
//       .select("token_balance")
//       .eq("id", withdrawal.user_id)
//       .single();

//     if (!user)
//       return res.json({ success: false, message: "User not existing!" });

//     const newBalance = Number(user.token_balance) - withdrawal.amount;
//     await supabase
//       .from("users")
//       .update({ token_balance: newBalance })
//       .eq("id", withdrawal.user_id);

//     // Update withdrawal
//     await supabase
//       .from("withdrawals")
//       .update({
//         status: "sent",
//         tx_hash: txHash,
//         updated_at: new Date().toISOString(),
//       })
//       .eq("id", withdrawalId);

//     res.json({ success: true, txHash, message: "USDT sent successfully!" });
//   }

//   static async addPayoutWallet(req: Request, res: Response) {
//     const { name, address, private_key } = req.body;
//     const adminId = req.auth?.userId;

//     if (!adminId || !name || !address || !private_key) {
//       return res.status(400).json({ error: "All fields required" });
//     }

//     // Basic validation
//     if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim())) {
//       return res.status(400).json({ error: "Invalid Tron address" });
//     }

//     const { data: admin } = await supabase
//       .from("users")
//       .select("is_admin")
//       .eq("id", adminId)
//       .single();

//     if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

//     try {
//       // ENCRYPT before saving
//       const encryptedKey = encryptPrivateKey(private_key.trim());

//       const { data, error } = await supabase
//         .from("payout_wallets")
//         .insert({
//           name: name.trim(),
//           address: address.trim(),
//           private_key: encryptedKey, // ← Encrypted!
//           balance: 0,
//           is_active: true,
//         })
//         .select()
//         .single();

//       if (error) throw error;

//       res.json({
//         success: true,
//         wallet: { id: data.id, name: data.name, address: data.address },
//       });
//     } catch (err) {
//       console.error("Add wallet error:", err);
//       res.status(500).json({ error: "Failed to save wallet" });
//     }
//   }
// }


// controllers/WithdrawalController.ts

// import { Request, Response } from "express";
// import { supabase } from "../config/supabase";
// import { sendUSDTToUser, sendUSDTToUser2 } from "../services/TronServiceTest";
// import { decryptPrivateKey, encryptPrivateKey } from "../utils/encryption";

// export class WithdrawalController {
  
//   static async requestWithdrawal(req: Request, res: Response) {
//     const { amount, walletAddress } = req.body;
//     const userId = req.auth?.userId;

//     if (!userId) return res.status(401).json({ error: "Unauthorized" });

//     const numAmount = Number(amount);
//     if (numAmount <= 0 || !walletAddress) {
//       return res.status(400).json({ error: "Invalid amount or address" });
//     }

//     if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress.trim())) {
//       return res.status(400).json({ error: "Invalid Tron address" });
//     }

//     // Check balance
//     const { data: user } = await supabase
//       .from("users")
//       .select("token_balance")
//       .eq("id", userId)
//       .single();

//     if (!user || Number(user.token_balance) < numAmount) {
//       return res.status(400).json({ error: "Insufficient balance" });
//     }

//     // ✅ DEDUCT tokens immediately when creating withdrawal request
//     const newBalance = Number(user.token_balance) - numAmount;
//     await supabase
//       .from("users")
//       .update({ token_balance: newBalance })
//       .eq("id", userId);

//     // Create pending withdrawal
//     const { data, error } = await supabase
//       .from("withdrawals")
//       .insert({
//         user_id: userId,
//         amount: numAmount,
//         wallet_address: walletAddress.trim(),
//         status: "pending",
//       })
//       .select()
//       .single();

//     if (error) {
//       console.error("Failed to create withdrawal request:", error);

//       await supabase
//         .from("users")
//         .update({ token_balance: Number(user.token_balance) })
//         .eq("id", userId);
//       return res.status(500).json({ error: "Failed to submit request" });
//     }

//     res.json({ success: true, withdrawal: data, message: "Withdrawal request submitted. Tokens deducted from balance." });
//   }

//   static async getWithdrawals(req: Request, res: Response) {
//     const userId = req.auth?.userId;
//     if (!userId) return res.status(401).json({ error: "Unauthorized" });

//     const { data: admin } = await supabase
//       .from("users")
//       .select("is_admin")
//       .eq("id", userId)
//       .single();

//     if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

//     const { data: withdrawals, error } = await supabase
//       .from("withdrawals")
//       .select(
//         "id, user_id, amount, wallet_address, status, tx_hash, created_at, updated_at"
//       )
//       .order("created_at", { ascending: false });

//     if (error) return res.status(500).json({ error: "Failed to fetch" });

//     // Join user info
//     const userIds = [...new Set(withdrawals.map((w: any) => w.user_id))];
//     const { data: users } = await supabase
//       .from("users")
//       .select("id, email, first_name, last_name")
//       .in("id", userIds);

//     const enriched = withdrawals.map((w: any) => {
//       const user = users?.find((u: any) => u.id === w.user_id);
//       return {
//         ...w,
//         user_name:
//           `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "User",
//         user_email: user?.email || "N/A",
//       };
//     });

//     res.json({ withdrawals: enriched });
//   }

//   static async getPayoutWallets(req: Request, res: Response) {
//     const userId = req.auth?.userId;
//     if (!userId) return res.status(401).json({ error: "Unauthorized" });

//     const { data: admin } = await supabase
//       .from("users")
//       .select("is_admin")
//       .eq("id", userId)
//       .single();

//     if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

//     const { data: wallets, error } = await supabase
//       .from("payout_wallets")
//       .select("id, name, address, balance, is_active")
//       .eq("is_active", true);

//     if (error) return res.status(500).json({ error: "Failed to load wallets" });

//     res.json({ wallets: wallets || [] });
//   }

//   static async processWithdrawal(req: Request, res: Response) {
//     const { withdrawalId, status, fromWalletId } = req.body;
//     const adminId = req.auth?.userId;
    
//     if (!adminId) return res.status(401).json({ error: "Unauthorized" });
//     if (!withdrawalId || !["approved", "rejected"].includes(status)) {
//       return res.status(400).json({ error: "Invalid request" });
//     }

//     const { data: admin } = await supabase
//       .from("users")
//       .select("is_admin")
//       .eq("id", adminId)
//       .single();

//     if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

//     const { data: withdrawal } = await supabase
//       .from("withdrawals")
//       .select("*")
//       .eq("id", withdrawalId)
//       .eq("status", "pending")
//       .single();

//     if (!withdrawal)
//       return res
//         .status(404)
//         .json({ error: "Withdrawal not found or already processed" });

//     // ✅ REJECTED: Refund tokens to user
//     if (status === "rejected") {
//       const { data: user } = await supabase
//         .from("users")
//         .select("token_balance")
//         .eq("id", withdrawal.user_id)
//         .single();

//       if (user) {
//         const refundedBalance = Number(user.token_balance) + withdrawal.amount;
//         await supabase
//           .from("users")
//           .update({ token_balance: refundedBalance })
//           .eq("id", withdrawal.user_id);
//       }

//       await supabase
//         .from("withdrawals")
//         .update({ status: "rejected", updated_at: new Date().toISOString() })
//         .eq("id", withdrawalId);

//       return res.json({ 
//         success: true, 
//         message: `Withdrawal rejected. ${withdrawal.amount} tokens refunded to user.` 
//       });
//     }

//     // ✅ APPROVED: Process the withdrawal
//     if (!fromWalletId)
//       return res.status(400).json({ error: "Select payout wallet" });

//     const { data: wallet } = await supabase
//       .from("payout_wallets")
//       .select("address, private_key")
//       .eq("id", fromWalletId)
//       .single();

//     if (!wallet) return res.status(400).json({ error: "Invalid wallet" });

//     const decryptedPrivateKey = decryptPrivateKey(wallet.private_key);

//     console.log("🚀 Processing withdrawal:", {
//       id: withdrawalId,
//       amount: withdrawal.amount,
//       to: withdrawal.wallet_address,
//       from: wallet.address,
//     });

//     // ✅ Send USDT using the proper function
//     const txHash = await sendUSDTToUser2(
//       withdrawal.wallet_address,
//       withdrawal.amount,
//       decryptedPrivateKey
//     );

//     // ✅ FAILED: Refund tokens to user
//     if (!txHash) {
//       const { data: user } = await supabase
//         .from("users")
//         .select("token_balance")
//         .eq("id", withdrawal.user_id)
//         .single();

//       if (user) {
//         const refundedBalance = Number(user.token_balance) + withdrawal.amount;
//         await supabase
//           .from("users")
//           .update({ token_balance: refundedBalance })
//           .eq("id", withdrawal.user_id);
//       }

//       await supabase
//         .from("withdrawals")
//         .update({ status: "failed", updated_at: new Date().toISOString() })
//         .eq("id", withdrawalId);

//       return res.status(500).json({ 
//         error: "Failed to send USDT. Tokens have been refunded to user." 
//       });
//     }

//     await supabase
//       .from("withdrawals")
//       .update({
//         status: "sent",
//         tx_hash: txHash,
//         updated_at: new Date().toISOString(),
//       })
//       .eq("id", withdrawalId);

//     res.json({ 
//       success: true, 
//       txHash, 
//       message: `USDT sent successfully! ${withdrawal.amount} tokens deducted.`,
//       explorerLink: process.env.IS_TESTNET 
//         ? `https://nile.tronscan.org/#/transaction/${txHash}`
//         : `https://tronscan.org/#/transaction/${txHash}`
//     });
//   }

//   static async addPayoutWallet(req: Request, res: Response) {
//     const { name, address, private_key } = req.body;
//     const adminId = req.auth?.userId;

//     if (!adminId || !name || !address || !private_key) {
//       return res.status(400).json({ error: "All fields required" });
//     }

//     if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim())) {
//       return res.status(400).json({ error: "Invalid Tron address" });
//     }

//     const { data: admin } = await supabase
//       .from("users")
//       .select("is_admin")
//       .eq("id", adminId)
//       .single();

//     if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

//     try {
//       const encryptedKey = encryptPrivateKey(private_key.trim());

//       const { data, error } = await supabase
//         .from("payout_wallets")
//         .insert({
//           name: name.trim(),
//           address: address.trim(),
//           private_key: encryptedKey,
//           balance: 0,
//           is_active: true,
//         })
//         .select()
//         .single();

//       if (error) throw error;

//       res.json({
//         success: true,
//         wallet: { id: data.id, name: data.name, address: data.address },
//       });
//     } catch (err) {
//       console.error("Add wallet error:", err);
//       res.status(500).json({ error: "Failed to save wallet" });
//     }
//   }
// }


// controllers/WithdrawalController.ts

import { Request, Response } from "express";
import { supabase } from "../config/supabase";
import { sendUSDTToUser } from "../services/TronServiceTest";
import { decryptPrivateKey, encryptPrivateKey } from "../utils/encryption";

const IS_TESTNET = false;

export class WithdrawalController {
  
  static async requestWithdrawal(req: Request, res: Response) {
    const { amount, walletAddress, phoneNumber } = req.body;
    const userId = req.auth?.userId;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const numAmount = Number(amount);
    if (numAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // ✅ Must have either wallet address OR phone number
    const hasTron = walletAddress && walletAddress.trim().length > 0;
    const hasPhone = phoneNumber && phoneNumber.trim().length > 0;

    if (!hasTron && !hasPhone) {
      return res.status(400).json({ error: "Provide either Tron wallet or phone number" });
    }

    if (hasTron && hasPhone) {
      return res.status(400).json({ error: "Use only one withdrawal method" });
    }

    // ✅ Validate Tron address if provided
    if (hasTron && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress.trim())) {
      return res.status(400).json({ error: "Invalid Tron address" });
    }

    // Check balance
    const { data: user } = await supabase
      .from("users")
      .select("token_balance")
      .eq("id", userId)
      .single();

    if (!user || Number(user.token_balance) < numAmount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const newBalance = Number(user.token_balance) - numAmount;
    await supabase
      .from("users")
      .update({ token_balance: newBalance })
      .eq("id", userId);

    // ✅ Create pending withdrawal with phone number support
    const { data, error } = await supabase
      .from("withdrawals")
      .insert({
        user_id: userId,
        amount: numAmount,
        wallet_address: hasTron ? walletAddress.trim() : null,
        phone_number: hasPhone ? phoneNumber.trim() : null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create withdrawal request:", error);
      // ✅ Rollback: refund tokens if insert failed
      await supabase
        .from("users")
        .update({ token_balance: Number(user.token_balance) })
        .eq("id", userId);
      return res.status(500).json({ error: "Failed to submit request" });
    }

    const method = hasTron ? "Tron wallet" : "Mobile Money";
    res.json({ 
      success: true, 
      withdrawal: data, 
      message: `Withdrawal request submitted via ${method}. Tokens deducted from balance.` 
    });
  }

  static async getWithdrawals(req: Request, res: Response) {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { data: admin } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", userId)
      .single();

    if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

    const { data: withdrawals, error } = await supabase
      .from("withdrawals")
      .select(
        "id, user_id, amount, wallet_address, phone_number, status, tx_hash, created_at, updated_at"
      )
      .order("created_at", { ascending: false });

    if (error) return res.status(500).json({ error: "Failed to fetch" });

    // Join user info
    const userIds = [...new Set(withdrawals.map((w: any) => w.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, email, first_name, last_name")
      .in("id", userIds);

    const enriched = withdrawals.map((w: any) => {
      const user = users?.find((u: any) => u.id === w.user_id);
      return {
        ...w,
        user_name:
          `${user?.first_name || ""} ${user?.last_name || ""}`.trim() || "User",
        user_email: user?.email || "N/A",
        withdrawal_method: w.wallet_address ? "Tron Wallet" : "Mobile Money",
      };
    });

    res.json({ withdrawals: enriched });
  }

  static async getPayoutWallets(req: Request, res: Response) {
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { data: admin } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", userId)
      .single();

    if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

    const { data: wallets, error } = await supabase
      .from("payout_wallets")
      .select("id, name, address, balance, is_active")
      .eq("is_active", true);

    if (error) return res.status(500).json({ error: "Failed to load wallets" });

    res.json({ wallets: wallets || [] });
  }

  static async processWithdrawal(req: Request, res: Response) {
    const { withdrawalId, status, fromWalletId } = req.body;
    const adminId = req.auth?.userId;
    
    if (!adminId) return res.status(401).json({ error: "Unauthorized" });
    if (!withdrawalId || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const { data: admin } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", adminId)
      .single();

    if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

    const { data: withdrawal } = await supabase
      .from("withdrawals")
      .select("*")
      .eq("id", withdrawalId)
      .eq("status", "pending")
      .single();

    if (!withdrawal)
      return res
        .status(404)
        .json({ error: "Withdrawal not found or already processed" });

    const isPhoneWithdrawal = !!withdrawal.phone_number;

    // ✅ REJECTED: Refund tokens to user
    if (status === "rejected") {
      const { data: user } = await supabase
        .from("users")
        .select("token_balance")
        .eq("id", withdrawal.user_id)
        .single();

      if (user) {
        const refundedBalance = Number(user.token_balance) + withdrawal.amount;
        await supabase
          .from("users")
          .update({ token_balance: refundedBalance })
          .eq("id", withdrawal.user_id);
      }

      await supabase
        .from("withdrawals")
        .update({ status: "rejected", updated_at: new Date().toISOString() })
        .eq("id", withdrawalId);

      return res.json({ 
        success: true, 
        message: `Withdrawal rejected. ${withdrawal.amount} tokens refunded to user.` 
      });
    }

    // ✅ APPROVED: Process the withdrawal
    
    // For phone withdrawals, admin handles manually
    if (isPhoneWithdrawal) {
      await supabase
        .from("withdrawals")
        .update({ 
          status: "sent", 
          updated_at: new Date().toISOString() 
        })
        .eq("id", withdrawalId);

      return res.json({ 
        success: true, 
        message: `Mobile Money withdrawal marked as sent to ${withdrawal.phone_number}. Amount: ${withdrawal.amount} USDT` 
      });
    }

    // For Tron withdrawals, process automatically
    if (!fromWalletId)
      return res.status(400).json({ error: "Select payout wallet" });

    const { data: wallet } = await supabase
      .from("payout_wallets")
      .select("address, private_key")
      .eq("id", fromWalletId)
      .single();

    if (!wallet) return res.status(400).json({ error: "Invalid wallet" });

    const decryptedPrivateKey = decryptPrivateKey(wallet.private_key);

    console.log("🚀 Processing Tron withdrawal:", {
      id: withdrawalId,
      amount: withdrawal.amount,
      to: withdrawal.wallet_address,
      from: wallet.address,
    });

    // ✅ Send USDT using the proper function
    const txHash = await sendUSDTToUser(
      withdrawal.wallet_address,
      withdrawal.amount,
      decryptedPrivateKey
    );

    // ✅ FAILED: Refund tokens to user
    if (!txHash) {
      const { data: user } = await supabase
        .from("users")
        .select("token_balance")
        .eq("id", withdrawal.user_id)
        .single();

      if (user) {
        const refundedBalance = Number(user.token_balance) + withdrawal.amount;
        await supabase
          .from("users")
          .update({ token_balance: refundedBalance })
          .eq("id", withdrawal.user_id);
      }

      await supabase
        .from("withdrawals")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", withdrawalId);

      return res.status(500).json({ 
        error: "Failed to send USDT. Tokens have been refunded to user." 
      });
    }

    // ✅ SUCCESS: Mark as sent
    await supabase
      .from("withdrawals")
      .update({
        status: "sent",
        tx_hash: txHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawalId);

    res.json({ 
      success: true, 
      txHash, 
      message: `USDT sent successfully! ${withdrawal.amount} tokens deducted.`,
      explorerLink: IS_TESTNET
        ? `https://nile.tronscan.org/#/transaction/${txHash}`
        : `https://tronscan.org/#/transaction/${txHash}`
    });
  }

  static async addPayoutWallet(req: Request, res: Response) {
    const { name, address, private_key } = req.body;
    const adminId = req.auth?.userId;

    if (!adminId || !name || !address || !private_key) {
      return res.status(400).json({ error: "All fields required" });
    }

    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address.trim())) {
      return res.status(400).json({ error: "Invalid Tron address" });
    }

    const { data: admin } = await supabase
      .from("users")
      .select("is_admin")
      .eq("id", adminId)
      .single();

    if (!admin?.is_admin) return res.status(403).json({ error: "Admin only" });

    try {
      const encryptedKey = encryptPrivateKey(private_key.trim());

      const { data, error } = await supabase
        .from("payout_wallets")
        .insert({
          name: name.trim(),
          address: address.trim(),
          private_key: encryptedKey,
          balance: 0,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      res.json({
        success: true,
        wallet: { id: data.id, name: data.name, address: data.address },
      });
    } catch (err) {
      console.error("Add wallet error:", err);
      res.status(500).json({ error: "Failed to save wallet" });
    }
  }
}


