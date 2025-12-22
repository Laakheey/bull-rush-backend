import axios from "axios";
import { supabase } from "../config/SupabaseConfig";

const IS_TESTNET = true;

const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY!;
const ADMIN_TRON_ADDRESS = process.env.ADMIN_TRON_ADDRESS!;

const USDT_CONTRACT_MAINNET = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDT_CONTRACT_NILE = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
const USDT_CONTRACT = IS_TESTNET ? USDT_CONTRACT_NILE : USDT_CONTRACT_MAINNET;

const API_BASE_MAINNET = "https://api.trongrid.io";
const API_BASE_NILE = "https://nile.trongrid.io";
const API_BASE = IS_TESTNET ? API_BASE_NILE : API_BASE_MAINNET;


export const checkForPayment = async (dbRequestId: number): Promise<boolean> => {
  const { data: request, error: fetchError } = await supabase
    .from("token_requests")
    .select("*")
    .eq("id", dbRequestId)
    .single();

  if (fetchError || !request || request.status !== "pending" || request.tx_hash) {
    return false;
  }

  try {
    const minTimestamp = new Date(request.created_at).getTime();

    const response = await axios.get(
      `${API_BASE}/v1/accounts/${ADMIN_TRON_ADDRESS}/transactions/trc20`,
      {
        params: {
          limit: 50,
          contract_address: USDT_CONTRACT,
          only_confirmed: true,
          min_timestamp: minTimestamp,  // ← This ignores old transfers!
        },
        headers: {
          "TRON-PRO-API-KEY": TRONGRID_API_KEY,
        },
        timeout: 10000,
      }
    );

    console.log("---response---", response.data);
    

    const transactions = response.data.data || [];

    for (const tx of transactions) {
      const receivedAmount = Number(tx.value) / 1_000_000;
      const txTime = new Date(tx.block_timestamp);

      if (tx.to === ADMIN_TRON_ADDRESS) {
        const requestedAmount = Number(request.amount_usdt);
        const isExactMatch = Math.abs(receivedAmount - requestedAmount) < 0.01;
        const newStatus = isExactMatch ? "approved" : "conflicted";

        await supabase
          .from("token_requests")
          .update({
            status: newStatus,
            detected_amount: receivedAmount,
            tx_hash: tx.transaction_id,
          })
          .eq("id", dbRequestId);

        console.log(`Request ${dbRequestId} → ${newStatus} (received: ${receivedAmount} USDT)`);

        if (isExactMatch) {
          const tokensToAdd = requestedAmount;
          const { data: user } = await supabase
            .from("users")
            .select("token_balance")
            .eq("id", request.user_id)
            .single();

          if (user) {
            const newBalance = Number(user.token_balance) + tokensToAdd;
            await supabase
              .from("users")
              .update({ token_balance: newBalance })
              .eq("id", request.user_id);
            console.log(`Credited ${tokensToAdd} tokens!`);
          }
        }

        return true;
      }
    }
  } catch (error: any) {
    console.error("Polling failed:", error.message);
  }

  return false;
};


export const verifyTransactionHash = async (txHash: string, dbRequestId: number): Promise<boolean> => {
  const { data: request, error: fetchError } = await supabase
    .from("token_requests")
    .select("*")
    .eq("id", dbRequestId)
    .single();

  if (fetchError || !request || request.status !== "pending") return false;

  try {
    const eventsRes = await axios.get(`${API_BASE}/v1/transactions/${txHash}/events`, {
      headers: { "TRON-PRO-API-KEY": TRONGRID_API_KEY },
      timeout: 10000,
    });

    const events = eventsRes.data.data || [];

    for (const event of events) {
      if (
        event.contract_address === USDT_CONTRACT &&
        event.event_name === "Transfer" &&
        event.result?.to === ADMIN_TRON_ADDRESS
      ) {
        const receivedAmount = Number(event.result.value) / 1_000_000;
        const requestedAmount = Number(request.amount_usdt);

        if (Math.abs(receivedAmount - requestedAmount) < 0.01) {
          await supabase.from("token_requests").update({
            status: "approved",
            detected_amount: receivedAmount,
            tx_hash: txHash,
          }).eq("id", dbRequestId);
          return true;
        }
      }
    }
    return false;
  } catch (error: any) {
    console.error("Tx verification error:", error.message);
    return false;
  }
};
