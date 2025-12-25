// // controllers/WebhookController.ts
// export const handleTronWebhook = async (req: Request, res: Response) => {
//   const { trigger_name, contract_address, result, transaction_id } = req.body;

//   // 1. Basic Validation
//   if (contract_address !== USDT_CONTRACT) return res.sendStatus(200);

//   const amountReceived = Number(result.value) / 1_000_000;
//   const toAddress = result.to;

//   if (toAddress !== process.env.ADMIN_TRON_ADDRESS) return res.sendStatus(200);

//   // 2. Find the pending request for this amount
//   // Note: This is why "Exact Amount" is important
//   const { data: request } = await supabase
//     .from("token_requests")
//     .select("*")
//     .eq("status", "pending")
//     .eq("amount_usdt", amountReceived)
//     .order('created_at', { ascending: false })
//     .limit(1)
//     .single();

//   if (request) {
//      // Proceed to approve and credit balance (same logic as your TronService)
//      await approvePayment(request.id, amountReceived, transaction_id);
//   }

//   res.sendStatus(200);
// };