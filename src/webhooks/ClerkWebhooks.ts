// import { Webhook } from 'svix';
// import { WebhookEvent } from '@clerk/backend';
// import { Request, Response } from 'express';
// import { supabaseAdmin } from '../config/SupabaseWebhookConfig';

// export const handleClerkWebhook = async (req: Request, res: Response) => {
//   const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!;
//   const payload = JSON.stringify(req.body);
//   const headers = req.headers as any;

//   const wh = new Webhook(WEBHOOK_SECRET);
//   let evt: WebhookEvent;

//   try {
//     evt = wh.verify(payload, {
//       "svix-id": headers["svix-id"],
//       "svix-timestamp": headers["svix-timestamp"],
//       "svix-signature": headers["svix-signature"],
//     }) as WebhookEvent;
//   } catch (err) {
//     return res.status(400).json({ error: "Webhook verification failed" });
//   }

//   const { id } = evt.data;
//   const eventType = evt.type;

//   if (eventType === 'user.created') {
//     const { email_addresses, first_name, last_name, unsafe_metadata } = evt.data;
//     const email = email_addresses[0].email_address;
    
//     const pendingRef = unsafe_metadata?.referral_code as string;
//     let referrerId = null;

//     if (pendingRef) {
//       const { data: refUser } = await supabaseAdmin
//         .from('users')
//         .select('id')
//         .or(`referral_code.eq."${pendingRef}",id.eq."${pendingRef}"`)
//         .maybeSingle();
//       referrerId = refUser?.id;
//     }

//     await supabaseAdmin.from('users').insert({
//       id,
//       email,
//       first_name,
//       last_name,
//       referrer_id: referrerId,
//       referral_code: Math.random().toString(36).substring(2, 8).toUpperCase()
//     });
//   }

//   if (eventType === 'user.deleted') {
//     await supabaseAdmin.from('users').delete().eq('id', id);
//   }

//   return res.status(200).json({ received: true });
// };

import { Webhook } from 'svix';
import { WebhookEvent } from '@clerk/backend';
import { Request, Response } from 'express';
import { supabaseAdmin } from '../config/SupabaseWebhookConfig';

export const handleClerkWebhook = async (req: Request, res: Response) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!;

  if (!WEBHOOK_SECRET) {
    console.error("CLERK_WEBHOOK_SECRET is not set");
    return res.status(500).json({ error: "Server configuration error" });
  }

  const payload = JSON.stringify(req.body);
  const headers = req.headers as Record<string, string>;

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": headers["svix-id"],
      "svix-timestamp": headers["svix-timestamp"],
      "svix-signature": headers["svix-signature"],
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook verification failed:", err);
    return res.status(400).json({ error: "Webhook verification failed" });
  }

  const { id } = evt.data;
  const eventType = evt.type;

  // Only handle user deletion
  if (eventType === 'user.deleted') {
    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', id);

    if (error) {
      console.error("Failed to delete user:", error);
    } else {
      console.log(`User deleted: ${id}`);
    }
  }

  // Optional: Handle user updates (name/email changes)
  // if (eventType === 'user.updated') {
  //   const { email_addresses, first_name, last_name } = evt.data;
  //   const email = email_addresses?.[0]?.email_address;
  //   if (email) {
  //     await supabaseAdmin
  //       .from('users')
  //       .update({ first_name, last_name })
  //       .eq('email', email);
  //   }
  // }

  return res.status(200).json({ received: true });
};