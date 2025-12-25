import axios from "axios";
import { supabase } from "../config/SupabaseConfig";
import { TronWeb } from "tronweb";

const IS_TESTNET = false;
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || "";
const ADMIN_TRON_ADDRESS = process.env.ADMIN_TRON_ADDRESS!;
const USDT_CONTRACT = IS_TESTNET
  ? "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
  : "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const API_BASE = IS_TESTNET
  ? "https://nile.trongrid.io"
  : "https://api.trongrid.io";

const tronWeb = new TronWeb({ fullHost: API_BASE });

// export const verifyTxHashTest = async (
//     requestId: number,
//     txHash: string
// ): Promise<{ status: string; amount?: number; error?: string }> => {
//     const { data: request } = await supabase
//         .from("token_requests")
//         .select("*")
//         .eq("id", requestId)
//         .single();

//     if (!request) return { status: "not_found", error: "Request not found" };
//     if (request.status !== "pending") return { status: request.status, error: "Already processed" };
//     if (request.tx_hash) return { status: "duplicate", error: "Transaction already used" };

//     try {
//         // Step 1: Get receipt (confirms tx is in a block + timestamp)
//         const infoResponse = await axios.post(
//             `${API_BASE}/wallet/gettransactioninfobyid`,
//             { value: txHash },
//             { headers: TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": TRONGRID_API_KEY } : {} }
//         );

//         const txInfo = infoResponse.data;
//         if (!txInfo || Object.keys(txInfo).length === 0) {
//             return { status: "not_found", error: "Transaction not confirmed yet or invalid" };
//         }

//         // Age check
//         const txTimestamp = txInfo.blockTimeStamp || 0;
//         if (txTimestamp === 0) {
//             return { status: "error", error: "Invalid timestamp" };
//         }
//         const ageHours = (Date.now() - txTimestamp) / (3600 * 1000);
//         if (ageHours > 24) {
//             return { status: "too_old", error: "Transaction older than 24 hours" };
//         }

//         // Must be SUCCESS
//         if (txInfo.receipt?.result !== "SUCCESS") {
//             return { status: "failed", error: "Transaction failed" };
//         }

//         // Step 2: Get raw transaction to parse contract data
//         const rawResponse = await axios.post(
//             `${API_BASE}/wallet/gettransactionbyid`,
//             { value: txHash },
//             { headers: TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": TRONGRID_API_KEY } : {} }
//         );

//         const tx = rawResponse.data;
//         if (!tx || !tx.raw_data?.contract?.[0]) {
//             return { status: "invalid", error: "Invalid transaction" };
//         }

//         if (tx.raw_data.contract[0].type !== "TriggerSmartContract") {
//             return { status: "invalid", error: "Only USDT (TRC20) payments accepted" };
//         }

//         const call = tx.raw_data.contract[0].parameter.value;
//         const contractAddr = tronWeb.address.fromHex(call.contract_address);

//         if (contractAddr !== USDT_CONTRACT) {
//             return { status: "invalid", error: "Wrong token � must be USDT" };
//         }

//         const dataHex = call.data || "";
//         if (!dataHex.startsWith("a9059cbb")) {
//             return { status: "invalid", error: "Not a transfer function" };
//         }

//         const toHex = "41" + dataHex.slice(8 + 24, 8 + 64);
//         const toAddress = tronWeb.address.fromHex(toHex);

//         if (toAddress !== ADMIN_TRON_ADDRESS) {
//             return { status: "invalid", error: "Not sent to your admin address" };
//         }

//         const amountHex = dataHex.slice(-64);
//         const receivedAmount = Number(BigInt("0x" + amountHex) / BigInt(1_000_000));

//         if (receivedAmount <= 0) {
//             return { status: "invalid", error: "Zero amount sent" };
//         }

//         console.log(`? Valid USDT payment: ${receivedAmount} USDT (tx: ${txHash})`);

//         // Credit tokens 1:1
//         await supabase
//             .from("token_requests")
//             .update({
//                 status: "approved",
//                 detected_amount: receivedAmount,
//                 tx_hash: txHash,
//             })
//             .eq("id", requestId);

//         const { data: user } = await supabase
//             .from("users")
//             .select("token_balance")
//             .eq("id", request.user_id)
//             .single();

//         if (user) {
//             const newBalance = (Number(user.token_balance) || 0) + receivedAmount;
//             await supabase
//                 .from("users")
//                 .update({ token_balance: newBalance })
//                 .eq("id", request.user_id);
//         }

//         return { status: "approved", amount: receivedAmount };
//     } catch (e: any) {
//         console.error("Verification error:", e.response?.data || e.message);
//         return { status: "error", error: "Blockchain verification failed" };
//     }
// };

export const verifyTxHashTest = async (requestId: number, txHash: string) => {
  const { data: request } = await supabase
    .from("token_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (!request) return { status: "not_found", error: "Request not found" };

  try {
    const info = await axios.post(`${API_BASE}/wallet/gettransactioninfobyid`, {
      value: txHash,
    });
    if (info.data.receipt?.result !== "SUCCESS")
      return { status: "failed", error: "TX Failed" };

    const raw = await axios.post(`${API_BASE}/wallet/gettransactionbyid`, {
      value: txHash,
    });
    const call = raw.data.raw_data.contract[0].parameter.value;

    const receivedAmount = Number(
      BigInt("0x" + call.data.slice(-64)) / BigInt(1_000_000)
    );

    return await executeAutoInvestment(request, txHash, receivedAmount);
  } catch (e) {
    return { status: "error", error: "Blockchain verification failed" };
  }
};

export const verifyTxHashTestDev = async (
  requestId: number,
  txHash: string
) => {
  const { data: request } = await supabase
    .from("token_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (!request) return { status: "not_found", error: "Request not found" };

  const mockAmount = Number(request.amount_usdt) || 10;

  console.log(
    `🛠️ DEV MODE: Auto-approving ${mockAmount} USDT for plan ${request.plan_type}`
  );

  return await executeAutoInvestment(request, txHash, mockAmount);
};

// const executeAutoInvestment = async (request: any, txHash: string, amount: number) => {
//     // 1. Mark request approved
//     await supabase.from("token_requests").update({
//         status: "approved",
//         detected_amount: amount,
//         tx_hash: txHash,
//     }).eq("id", request.id);

//     // 2. Create Active Investment
//     const { data: inv, error: invError } = await supabase.from('investments').insert({
//         user_id: request.user_id,
//         amount_tokens: amount,
//         initial_amount: amount,
//         plan_type: request.plan_type,
//         status: 'active',
//         start_date: new Date().toISOString().split('T')[0],
//     }).select().single();

//     console.log(invError?.message);

//     if (invError) throw new Error("Failed to create investment");

//     // 3. Log Transaction
//     await supabase.from('transactions').insert({
//         user_id: request.user_id,
//         type: 'investment_deposit',
//         amount: amount,
//         plan_type: request.plan_type,
//         investment_id: inv.id,
//         description: `Invested ${amount} USDT in ${request.plan_type} plan`,
//     });

//     return { status: "approved", amount: amount, plan: request.plan_type };
// };

const executeAutoInvestment = async (
  request: any,
  txHash: string,
  amount: number
) => {
  // CHECK 1: Duplicate hash
  const { data: existingTx } = await supabase
    .from("token_requests")
    .select("id, status")
    .eq("tx_hash", txHash)
    .maybeSingle();

  if (existingTx && existingTx.id !== request.id) {
    return {
      status: "duplicate",
      error: "This transaction hash has already been used",
    };
  }

  // CHECK 2: Request already processed
  if (request.status !== "pending") {
    return {
      status: request.status,
      error: "Request already processed",
    };
  }

  try {
    // STEP 1: Mark request as approved with tx_hash
    await supabase
      .from("token_requests")
      .update({
        status: "approved",
        detected_amount: amount,
        tx_hash: txHash,
      })
      .eq("id", request.id);

    // STEP 2: Create investment (NOW WITH LINK TO TOKEN REQUEST)
    const { data: inv, error: invError } = await supabase
      .from("investments")
      .insert({
        user_id: request.user_id,
        amount_tokens: amount,
        initial_amount: amount,
        plan_type: request.plan_type,
        status: "active",
        start_date: new Date().toISOString().split("T")[0],
        token_request_id: request.id, // 🔗 LINK IT!
      })
      .select()
      .single();

    if (invError) {
      console.error("Investment error:", invError);
      // Rollback
      await supabase
        .from("token_requests")
        .update({ status: "pending", tx_hash: null })
        .eq("id", request.id);
      return { status: "error", error: "Failed to create investment" };
    }

    // STEP 3: Log in transactions table (audit trail)
    await supabase.from("transactions").insert({
      user_id: request.user_id,
      type: "investment_deposit",
      amount: amount,
      plan_type: request.plan_type,
      investment_id: inv.id,
      description: `Invested ${amount} USDT in ${request.plan_type} plan`,
    });

    return { status: "approved", amount: amount, plan: request.plan_type };
  } catch (error: any) {
    console.error("Error:", error);
    return { status: "error", error: "Processing failed" };
  }
};

const tronWebAdmin = new TronWeb({
  fullHost: API_BASE,
  headers: { "TRON-PRO-API-KEY": TRONGRID_API_KEY },
  privateKey: process.env.ADMIN_PRIVATE_KEY,
});

export const sendUSDTToUser = async (
  toAddress: string,
  amount: number
): Promise<string | null> => {
  if (amount <= 0) return null;

  try {
    const contract = await tronWebAdmin.contract().at(USDT_CONTRACT);

    // Amount in 6 decimals
    //const amountInSun = tronWebAdmin.toBigNumber(amount * 1_000_000);
    const amountInSun = tronWebAdmin.BigNumber(amount * 1_000_000);

    const transaction = await contract.transfer(toAddress, amountInSun).send({
      feeLimit: 40_000_000, // 40 TRX max fee
    });

    console.log(`? Sent ${amount} USDT to ${toAddress} | Tx: ${transaction}`);
    return transaction; // tx hash
  } catch (error: any) {
    console.error("USDT Send Error:", error);
    return null;
  }
};

export const sendUSDTToUserTest = async (
  toAddress: string,
  amount: number,
  privateKey: string
): Promise<string | null> => {
  try {
    // USDT TRC20 contract address on Tron mainnet
    const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

    // Create contract instance
    const contract = await tronWeb.contract().at(USDT_CONTRACT);

    // Amount in smallest unit (USDT has 6 decimals)
    const amountInSmallestUnit = amount * 1_000_000;

    // Set private key for signing
    tronWeb.setPrivateKey(privateKey);

    // Build and send transaction
    const transaction = await contract
      .transfer(toAddress, amountInSmallestUnit)
      .send({
        feeLimit: 10_000_000, // 10 TRX max fee
        callValue: 0,
      });

    console.log("USDT sent successfully:", transaction);
    return transaction; // This is the txID (hash)
  } catch (error: any) {
    console.error("Failed to send USDT:", error);
    if (error.message) console.error("Error message:", error.message);
    return null;
  }
};