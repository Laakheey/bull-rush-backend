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

  if (eventType === 'user.deleted') {
    console.log(`🗑️ Starting deletion for user: ${id}`);

    try {
      // Delete in reverse order of dependencies
      // (child records first, then parent)

      // 1. Delete token_requests
      await supabaseAdmin.from('token_requests').delete().eq('user_id', id);
      console.log('✅ token_requests deleted');

      // 2. Delete investments
      await supabaseAdmin.from('investments').delete().eq('user_id', id);
      console.log('✅ investments deleted');

      // 3. Delete withdrawals
      await supabaseAdmin.from('withdrawals').delete().eq('user_id', id);
      console.log('✅ withdrawals deleted');

      // 4. Delete user_monthly_performance
      await supabaseAdmin.from('user_monthly_performance').delete().eq('user_id', id);
      console.log('✅ user_monthly_performance deleted');

      // 5. Delete referrals (both referrer and referred)
      await supabaseAdmin.from('referrals').delete().eq('referrer_id', id);
      await supabaseAdmin.from('referrals').delete().eq('referred_id', id);
      console.log('✅ referrals deleted');

      // 6. Delete referral_bonuses (both referrer and referred)
      await supabaseAdmin.from('referral_bonuses').delete().eq('referrer_id', id);
      await supabaseAdmin.from('referral_bonuses').delete().eq('referred_user_id', id);
      console.log('✅ referral_bonuses deleted');

      // 7. Update users who were referred by this user (set referrer_id to null)
      await supabaseAdmin.from('users').update({ referrer_id: null }).eq('referrer_id', id);
      console.log('✅ referrer_id references nullified');

      // 8. Finally, delete the user
      const { error } = await supabaseAdmin.from('users').delete().eq('id', id);

      if (error) {
        console.error("❌ Failed to delete user:", error);
        return res.status(500).json({ error: "Failed to delete user" });
      }

      console.log(`✅ User fully deleted: ${id}`);
      return res.status(200).json({ received: true, deleted: true });
    } catch (error) {
      console.error("❌ Deletion failed:", error);
      return res.status(500).json({ error: "Deletion failed" });
    }
  }

  return res.status(200).json({ received: true });
};