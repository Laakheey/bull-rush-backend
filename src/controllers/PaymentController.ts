import { Request, Response } from "express";
import { checkForPayment, verifyTransactionHash } from "../services/TronServices";
import { supabase } from "../config/SupabaseConfig";

let pollingIntervals = new Map<number, NodeJS.Timeout>();

export const initiatePayment = async (req: Request, res: Response) => {
  const { amount } = req.body;
  const userId = req.auth?.userId;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!amount || amount < 100) return res.status(400).json({ error: "Minimum 100 USDT" });

  const { data, error } = await supabase
    .from("token_requests")
    .insert({
      user_id: userId,
      amount_usdt: amount,
      status: "pending",
      expires_at: new Date(Date.now() + 60 * 60 * 1000),
    })
    .select()
    .single();

  if (error) {
    console.error("DB insert error:", error);
    return res.status(500).json({ error: "Failed to create request" });
  }

  const dbRequestId = data.id;

  console.log(`Payment request created: DB ID ${dbRequestId}, Amount: ${amount} USDT`);

  const interval = setInterval(async () => {
    const found = await checkForPayment(dbRequestId);
    if (found) {
      clearInterval(interval);
      pollingIntervals.delete(dbRequestId);
      console.log(`Payment for request ${dbRequestId} processed!`);
    }
  }, 10000);

  pollingIntervals.set(dbRequestId, interval);

  res.json({
    success: true,
    requestId: dbRequestId,
    amount,
    adminAddress: process.env.ADMIN_TRON_ADDRESS,
    message: "Send USDT to the address above",
  });
};

export const verifyPayment = async (req: Request, res: Response) => {
  const { requestId, transactionHash } = req.body;
  const userId = req.auth?.userId;

  if (!requestId) {
    return res.status(400).json({ error: "requestId is required" });
  }

  const { data: request, error } = await supabase
    .from("token_requests")
    .select("*")
    .eq("id", requestId)
    .single();

  if (error || !request) {
    return res.status(404).json({ error: "Payment request not found" });
  }

  if (request.status === "approved") {
    return res.json({
      success: true,
      message: "Payment confirmed!",
      tokensAdded: Number(request.amount_usdt),
      status: "approved",
    });
  }

  if (request.status === "conflicted") {
    return res.status(409).json({
      success: false,
      message: `Amount mismatch: Sent ${request.detected_amount} USDT, expected ${request.amount_usdt} USDT`,
      status: "conflicted",
      detectedAmount: request.detected_amount,
    });
  }

  if (request.status === "expired") {
    return res.status(410).json({
      success: false,
      message: "This payment request has expired",
      status: "expired",
    });
  }

  if (transactionHash) {
    try {
      const isValid = await verifyTransactionHash(transactionHash, requestId);
      if (isValid) {
        const { data: updated } = await supabase
          .from("token_requests")
          .select("*")
          .eq("id", requestId)
          .single();

        if (updated?.status === "approved") {
          return res.json({
            success: true,
            message: "Payment confirmed instantly!",
            tokensAdded: Number(updated.amount_usdt),
            status: "approved",
          });
        }
      }
    } catch (err) {
    }
  }

  return res.status(202).json({
    success: false,
    message: "Waiting for payment confirmation...",
    status: "pending",
  });
};

export const verifyPayment1 = (req: Request, res: Response) => {
  res.status(200).json({ msg: "Payment endpoint active" });
};