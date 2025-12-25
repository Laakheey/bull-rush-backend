import { Request, Response } from "express";
import { supabase } from "../config/SupabaseConfig";
import { sendUSDTToUser, verifyTxHashTest, verifyTxHashTestDev } from "../services/TronServiceTest";

// export const initiatePaymentTest = async (req: Request, res: Response) => {
//     const { amount } = req.body;
//     const userId = req.auth?.userId;
//     if (!userId) return res.status(401).json({ error: "Unauthorized" });

//     const { data, error } = await supabase
//         .from("token_requests")
//         .insert({
//             user_id: userId,
//             amount_usdt: amount || null,
//             status: "pending",
//             expires_at: new Date(Date.now() + 30 * 60 * 1000),
//         })
//         .select()
//         .single();

//     if (error) return res.status(500).json({ error: "DB Error" });

//     res.json({
//         requestId: data.id,
//         adminAddress: process.env.ADMIN_TRON_ADDRESS,
//     });
// };


export const initiatePaymentTest = async (req: Request, res: Response) => {
    const { amount, plan } = req.body;
    const userId = req.auth?.userId;

    const IS_DEV_MODE = true;

    if (!userId) {
        return res.status(401).json({ error: "Unauthorized. Please sign in." });
    }

    if (!amount || Number(amount) < 10) {
        return res.status(400).json({ error: "Minimum investment is 10 USDT" });
    }

    const validPlans = ["monthly", "half-yearly", "yearly"];
    const selectedPlan = validPlans.includes(plan) ? plan : "monthly";

    try {
        const { data, error } = await supabase
            .from("token_requests")
            .insert({
                user_id: userId,
                amount_usdt: Number(amount),
                plan_type: selectedPlan,
                status: "pending",
                expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            })
            .select()
            .single();

        if (error) {
            console.error("Supabase Error:", error);
            return res.status(500).json({ error: "Failed to create request in database" });
        }

        // 4. Return the data to Frontend
        // Ensure ADMIN_BSC_ADDRESS is set in your .env for BEP20 payments
        res.json({
            requestId: data.id,
            adminAddress: process.env.ADMIN_TRON_ADDRESS, 
        });

    } catch (err) {
        console.error("Internal Server Error:", err);
        res.status(500).json({ error: "An unexpected error occurred" });
    }
};



// export const submitTxHashTest = async (req: Request, res: Response) => {
//     const { requestId, txHash } = req.body;
//     const userId = req.auth?.userId;
//     if (!userId) return res.status(401).json({ error: "Unauthorized" });

//     const { data: request } = await supabase
//         .from("token_requests")
//         .select("id, user_id, status")
//         .eq("id", requestId)
//         .eq("user_id", userId)
//         .single();

//     if (!request) return res.status(404).json({ error: "Request not found" });
//     if (request.status !== "pending") return res.status(400).json({ error: "Already processed" });

//     if (!/^[a-fA-F0-9]{64}$/.test(txHash)) {
//         return res.status(400).json({ error: "Invalid transaction hash" });
//     }

//     const result = await verifyTxHashTest(requestId, txHash);

//     if (result.status === "approved") {
//         return res.json({ success: true, tokensAdded: result.amount });
//     }

//     return res.status(400).json({ error: result.error || "Verification failed" });
// };

export const submitTxHashTest = async (req: Request, res: Response) => {
    const { requestId, txHash } = req.body;
    const userId = req.auth?.userId;

    const IS_DEV_MODE = true; 

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { data: request } = await supabase
        .from("token_requests")
        .select("id, user_id, status")
        .eq("id", requestId)
        .eq("user_id", userId)
        .single();

    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pending") return res.status(400).json({ error: "Already processed" });

    const result = IS_DEV_MODE 
        ? await verifyTxHashTestDev(requestId, txHash)
        : await verifyTxHashTest(requestId, txHash);

    if (result.status === "approved" && "amount" in result) {
        return res.json({ 
            success: true, 
            tokensAdded: result.amount, 
            plan: result.plan,
            mode: IS_DEV_MODE ? "development" : "live" 
        });
    }

    // Handle errors
    return res.status(400).json({ 
        error: ("error" in result ? result.error : "Verification failed") 
    });
};

// export const cashOutTokensTest = async (req: Request, res: Response) => {
//   const { amount, walletAddress } = req.body;
//   const userId = req.auth?.userId;
//   if (!userId) return res.status(401).json({ error: "Unauthorized" });

//   if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
//   if (!walletAddress || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress)) {
//     return res.status(400).json({ error: "Invalid Tron address" });
//   }

//   // Get user balance
//   const { data: user } = await supabase.from("users").select("token_balance").eq("id", userId).single();
//   if (!user || Number(user.token_balance) < amount) {
//     return res.status(400).json({ error: "Insufficient token balance" });
//   }

//   // Send USDT
//   const txHash = await sendUSDTToUser(walletAddress, amount);
//   if (!txHash) {
//     return res.status(500).json({ error: "Failed to send USDT" });
//   }

//   // Deduct tokens
//   const newBalance = Number(user.token_balance) - amount;
//   await supabase.from("users").update({ token_balance: newBalance }).eq("id", userId);

//   // Optional: Log withdrawal
//   await supabase.from("token_requests").insert({
//     user_id: userId,
//     amount_usdt: amount,
//     status: "withdrawal_sent",
//     tx_hash: txHash,
//     user_tron_address: walletAddress,
//   });

//   res.json({ success: true, txHash, message: `Sent ${amount} USDT to ${walletAddress}` });
// };

export const cashOutTokensTest = async (req: Request, res: Response) => {
    console.log("-----cashOutTokenTest");
  const { amount, walletAddress } = req.body;
    
  const userId = req.auth?.userId;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const numAmount = Number(amount);
  if (numAmount <= 0 || !walletAddress || !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(walletAddress)) {
    return res.status(400).json({ error: "Invalid amount or address" });
  }

  // Check balance
  const { data: user } = await supabase.from("users").select("token_balance").eq("id", userId).single();
  if (!user || Number(user.token_balance) < numAmount) {
    return res.status(400).json({ error: "Insufficient balance" });
  }
  // Send USDT
  const txHash = await sendUSDTToUser(walletAddress, numAmount);
  if (!txHash) {
    return res.status(500).json({ error: "Failed to send USDT — contact support" });
  }

  // Deduct tokens
  const newBalance = Number(user.token_balance) - numAmount;
  await supabase.from("users").update({ token_balance: newBalance }).eq("id", userId);

  // LOG WITHDRAWAL IN DB
  const { error: logError } = await supabase.from("withdrawals").insert({
    user_id: userId,
    amount: numAmount,
    wallet_address: walletAddress,
    tx_hash: txHash,
    status: "sent", // or "pending" if you want manual review
  });

  if (logError) {
    console.error("Failed to log withdrawal:", logError);
    // Don't fail the whole request — user already got USDT
  }

  res.json({ 
    success: true, 
    txHash, 
    message: `Successfully sent ${numAmount} USDT!` 
  });
};
