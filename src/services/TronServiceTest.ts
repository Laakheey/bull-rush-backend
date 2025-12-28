//? tronservicetest.ts
import axios from "axios";
import { supabase } from "../config/SupabaseConfig";
import { TronWeb } from "tronweb";

const IS_TESTNET = false;
const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY || "";
const USDT_CONTRACT = IS_TESTNET
  ? "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf"
  : "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const API_BASE = IS_TESTNET
  ? "https://api.nileex.io"
  : "https://api.trongrid.io";


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

const executeAutoInvestment = async (
  request: any,
  txHash: string,
  amount: number
) => {
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
    await supabase
      .from("token_requests")
      .update({
        status: "approved",
        detected_amount: amount,
        tx_hash: txHash,
      })
      .eq("id", request.id);

    const { data: inv, error: invError } = await supabase
      .from("investments")
      .insert({
        user_id: request.user_id,
        amount_tokens: amount,
        initial_amount: amount,
        plan_type: request.plan_type,
        status: "active",
        start_date: new Date().toISOString().split("T")[0],
        token_request_id: request.id,
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

export const sendUSDTToUserTest = async (
  toAddress: string,
  amount: number,
  privateKey: string
): Promise<string | null> => {
  try {
    const tronWeb = new TronWeb({
      fullHost: API_BASE,
      headers: TRONGRID_API_KEY ? { 'TRON-PRO-API-KEY': TRONGRID_API_KEY } : {},
      privateKey,
    });

    const fromAddressRaw = tronWeb.address.fromPrivateKey(privateKey);

    if (fromAddressRaw === false) {
      console.error('❌ Invalid private key: cannot derive address.');
      return null;
    }

    const fromAddress: string = fromAddressRaw;

    console.log('👤 Sending from address:', fromAddress);

    const trxBalanceSun = await tronWeb.trx.getBalance(fromAddress);
    const trxBalance = Number(tronWeb.fromSun(trxBalanceSun));

    console.log('💎 TRX Balance:', trxBalance);

    if (trxBalance < 10) {
      console.error('❌ Insufficient TRX for fees. Need at least ~10 TRX buffer.');
      return null;
    }

    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    const usdtBalanceBig = await contract.balanceOf(fromAddress).call();
    const usdtBalance = Number(usdtBalanceBig) / 1_000_000;

    console.log('💵 USDT Balance:', usdtBalance);

    if (usdtBalance < amount) {
      console.error(`❌ Insufficient USDT. Have ${usdtBalance.toFixed(6)}, need ${amount}`);
      return null;
    }

    const amountInSmallestUnit = Math.floor(amount * 1_000_000);

    console.log('🚀 Sending USDT:', {
      from: fromAddress,
      to: toAddress,
      amount,
      network: IS_TESTNET ? 'TESTNET (Nile)' : 'MAINNET',
    });

    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      USDT_CONTRACT,
      'transfer(address,uint256)',
      { feeLimit: 40_000_000 }, // 40 TRX max
      [
        { type: 'address', value: toAddress },
        { type: 'uint256', value: amountInSmallestUnit },
      ],
      fromAddress
    );

    if (!transaction.result || !transaction.transaction) {
      console.error('❌ Failed to build transaction:', transaction);
      return null;
    }

    // Sign and broadcast
    const signedTx = await tronWeb.trx.sign(transaction.transaction);
    const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

    if (!broadcast.result || !broadcast.txid) {
      console.error('❌ Broadcast failed:', broadcast.message || broadcast);
      return null;
    }

    const txid = broadcast.txid;
    console.log('✅ USDT sent successfully! TxID:', txid);

    const explorer = IS_TESTNET
      ? `https://nile.tronscan.org/#/transaction/${txid}`
      : `https://tronscan.org/#/transaction/${txid}`;
    console.log('🔗 View:', explorer);

    return txid;
  } catch (error: any) {
    console.error('❌ Unexpected error sending USDT:', error.message || error);
    return null;
  }
};

export const sendUSDTToUser = async (
  toAddress: string,
  amount: number,
  privateKey: string
): Promise<string | null> => {
  try {
    console.log("🚀 Initiating USDT transfer:", {
      to: toAddress,
      amount: amount,
      network: IS_TESTNET ? "TESTNET" : "MAINNET",
    });

    const tronWeb = new TronWeb({
      fullHost: API_BASE,
      headers: TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": TRONGRID_API_KEY } : {},
      privateKey: privateKey,
    });

    const fromAddressRaw = tronWeb.address.fromPrivateKey(privateKey);
    if (fromAddressRaw === false) {
      console.error("❌ Invalid private key: cannot derive address.");
      return null;
    }
    const fromAddress: string = fromAddressRaw;
    console.log("👤 Sending from address:", fromAddress);

    const trxBalanceSun = await tronWeb.trx.getBalance(fromAddress);
    const trxBalance = Number(tronWeb.fromSun(trxBalanceSun));
    console.log("💎 TRX Balance:", trxBalance);

    if (trxBalance < 5) {
      console.error("❌ Insufficient TRX for gas fees. Need at least 5 TRX.");
      return null;
    }

    // ✅ Check USDT balance
    const contract = await tronWeb.contract().at(USDT_CONTRACT);
    const usdtBalanceBig = await contract.balanceOf(fromAddress).call();
    const usdtBalance = Number(usdtBalanceBig) / 1_000_000;
    console.log("💵 USDT Balance:", usdtBalance);

    if (usdtBalance < amount) {
      console.error(
        `❌ Insufficient USDT. Have ${usdtBalance.toFixed(6)}, need ${amount}`
      );
      return null;
    }

    // ✅ Convert amount to smallest unit (6 decimals for USDT)
    const amountInSmallestUnit = Math.floor(amount * 1_000_000);
    console.log("💰 Amount in smallest unit:", amountInSmallestUnit);

    // ✅ Build transaction
    const transaction = await tronWeb.transactionBuilder.triggerSmartContract(
      USDT_CONTRACT,
      "transfer(address,uint256)",
      {
        feeLimit: 100_000_000, // 100 TRX max fee
      },
      [
        { type: "address", value: toAddress },
        { type: "uint256", value: amountInSmallestUnit },
      ],
      fromAddress
    );

    if (!transaction.result || !transaction.transaction) {
      console.error("❌ Failed to build transaction:", transaction);
      return null;
    }

    // ✅ Sign and broadcast
    const signedTx = await tronWeb.trx.sign(transaction.transaction);
    const broadcast = await tronWeb.trx.sendRawTransaction(signedTx);

    if (!broadcast.result || !broadcast.txid) {
      console.error("❌ Broadcast failed:", broadcast.message || broadcast);
      return null;
    }

    const txid = broadcast.txid;
    console.log("✅ USDT sent successfully! TxID:", txid);

    const explorer = IS_TESTNET
      ? `https://nile.tronscan.org/#/transaction/${txid}`
      : `https://tronscan.org/#/transaction/${txid}`;
    console.log("🔗 View transaction:", explorer);

    return txid;
  } catch (error: any) {
    console.error("❌ Error sending USDT:", error.message || error);
    return null;
  }
};


//export const sendUSDTToUserTest = async (
//  toAddress: string,
//  amount: number,
//  privateKey: string
//): Promise<string | null> => {
//  try {
//    //const USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

//    const contract = await tronWebAdmin.contract().at(USDT_CONTRACT);

//    const amountInSmallestUnit = amount * 1_000_000;

//    tronWeb.setPrivateKey(privateKey);

//    const transaction = await contract
//      .transfer(toAddress, amountInSmallestUnit)
//      .send({
//        feeLimit: 100_000_000, // 100 TRX max fee
//        callValue: 0,
//      });

//    console.log("USDT sent successfully:", transaction);
//    return transaction;
//  } catch (error: any) {
//    console.error("Failed to send USDT:", error);
//    if (error.message) console.error("Error message:", error.message);
//    return null;
//  }
//};

// import TronWeb from "tronweb";

// export const sendUSDTToUserTest = async (
//   toAddress: string,
//   amount: number,
//   privateKey: string
// ): Promise<string | null> => {
//   try {
//     const tronWeb = new TronWeb({
//       fullHost: API_BASE,
//       headers: TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": TRONGRID_API_KEY } : {},
//       privateKey: privateKey,
//     });

//     const walletAddress = tronWeb.address.fromPrivateKey(privateKey);

//     // ✅ Check TRX balance
//     const trxBalance = await tronWeb.trx.getBalance(walletAddress);
//     const trxBalanceInTRX = Number(tronWeb.fromSun(trxBalance)); // Convert to number
//     console.log("💎 TRX Balance:", trxBalanceInTRX);

//     // ✅ Check USDT balance
//     const contract = await tronWeb.contract().at(USDT_CONTRACT);
//     const usdtBalanceBig = await contract.balanceOf(walletAddress).call();

//     // Convert BigNumber to number (USDT has 6 decimals)
//     const usdtBalance = Number(usdtBalanceBig) / 1_000_000;

//     console.log("💵 USDT Balance:", usdtBalance);

//     // ✅ Validate before sending
//     if (trxBalanceInTRX < 5) {
//       console.error("❌ Insufficient TRX for gas fees. Need at least 5 TRX.");
//       return null;
//     }

//     if (usdtBalance < amount) {
//       console.error(
//         `❌ Insufficient USDT. Have ${usdtBalance.toFixed(6)}, need ${amount}`
//       );
//       return null;
//     }

//     console.log("🚀 Sending USDT:", {
//       from: walletAddress,
//       to: toAddress,
//       amount: amount,
//       network: IS_TESTNET ? "TESTNET (Nile)" : "MAINNET",
//     });

//     const amountInSmallestUnit = Math.floor(amount * 1_000_000); // Ensure integer

//     const transaction = await contract
//       .transfer(toAddress, amountInSmallestUnit)
//       .send({
//         feeLimit: 100_000_000, // 100 TRX max fee
//         callValue: 0,
//         shouldPollResponse: true,
//       });

//     console.log("✅ Transaction successful:", transaction);
//     return transaction.txid || transaction; // Return txid or full tx
//   } catch (error: any) {
//     console.error("❌ Failed to send USDT:", error);
//     console.error("Error message:", error.message || error);
//     return null;
//   }
// };



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

// export const sendUSDTToUser = async (
//   toAddress: string,
//   amount: number
// ): Promise<string | null> => {
//   if (amount <= 0) return null;

//   try {
//     const contract = await tronWebAdmin.contract().at(USDT_CONTRACT);

//     const cleanAmount = parseFloat(amount.toFixed(6));
//     const amountInSun = cleanAmount * 1_000_000;

//     const transaction = await contract.transfer(toAddress, amountInSun).send({
//       feeLimit: 100_000_000,
//     });

//     console.log(`? Sent ${amount} USDT to ${toAddress} | Tx: ${transaction}`);
//     return transaction;
//   } catch (error: any) {
//     console.error("USDT Send Error:", error);
//     return null;
//   }
// };


// const tronWebAdmin = new TronWeb({
//   fullHost: API_BASE,
//   headers: { "TRON-PRO-API-KEY": TRONGRID_API_KEY },
//   privateKey: process.env.ADMIN_PRIVATE_KEY,
// });



