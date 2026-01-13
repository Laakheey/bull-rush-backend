import { Webhook } from "svix";
import { WebhookEvent } from "@clerk/backend";
import { Request, Response } from "express";
import { supabaseAdmin } from "../config/SupabaseWebhookConfig";

export const handleClerkWebhook = async (req: Request, res: Response) => {  
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOKe_SECRET_DEV!;
  
  if (!WEBHOOK_SECRET) {
    console.error("❌ CLERK_WEBHOOK_SECRET_DEV is not set");
    return res.status(500).json({ error: "Webhook secret not configured" });
  }

  const payload = JSON.stringify(req.body);
  const headers = req.headers as any;

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt: WebhookEvent;

  try {
    evt = wh.verify(payload, {
      "svix-id": headers["svix-id"],
      "svix-timestamp": headers["svix-timestamp"],
      "svix-signature": headers["svix-signature"],
    }) as WebhookEvent;
    console.log("✅ Webhook verified successfully");
  } catch (err) {
    console.error("❌ Webhook verification failed:", err);
    return res.status(400).json({ error: "Webhook verification failed" });
  }

  const { id } = evt.data;
  const eventType = evt.type;
  console.log(`📝 Processing event: ${eventType} for user: ${id}`);

  if (eventType === "user.created") {
    const { email_addresses, first_name, last_name, unsafe_metadata } = evt.data;
    const email = email_addresses?.[0]?.email_address;

    if (!email) {
      console.log("⚠️ No email found in webhook data");
      return res.status(200).json({ received: true, warning: "No email" });
    }

    console.log(`👤 Creating/migrating user: ${email} (ID: ${id})`);

    // Check if user exists with this email
    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (fetchError) {
      console.error("❌ Error checking existing user:", fetchError);
      return res.status(500).json({ 
        error: "Database error", 
        details: fetchError.message 
      });
    }

    if (existingUser && existingUser.id !== id) {
      console.log(`🔄 Migrating user ${email}: ${existingUser.id} → ${id}`);
      
      try {
        const { error: migrationError } = await supabaseAdmin.rpc(
          "migrate_user_id",
          {
            old_id: existingUser.id,
            new_id: id,
          }
        );

        if (migrationError) {
          console.error("❌ Migration RPC failed:", migrationError);
          return res.status(200).json({ 
            error: "Migration failed", 
            details: migrationError.message 
          });
        }

        console.log("✅ Migration successful!");
        return res.status(200).json({ 
          migrated: true, 
          oldId: existingUser.id, 
          newId: id 
        });
      } catch (migrationError) {
        console.error("❌ Migration exception:", migrationError);
        return res.status(200).json({ 
          error: "Migration failed with exception" 
        });
      }
    }

    // NEW USER SCENARIO: No existing user with this email
    if (!existingUser) {
      console.log(`➕ Creating NEW user: ${email}`);

      // Handle referral
      let referrerId = null;
      const pendingRef = unsafe_metadata?.referral_code as string;
      
      if (pendingRef) {
        console.log(`🔗 Checking referral code: ${pendingRef}`);
        const { data: refUser, error: refError } = await supabaseAdmin
          .from("users")
          .select("id")
          .or(`referral_code.eq."${pendingRef}",id.eq."${pendingRef}"`)
          .maybeSingle();

        if (refError) {
          console.error("⚠️ Referral lookup error:", refError);
        } else if (refUser) {
          referrerId = refUser.id;
          console.log(`✅ Found referrer: ${referrerId}`);
        }
      }

      // Generate referral code
      const referralCode = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

      // Insert new user
      const { data: insertedUser, error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          id,
          email,
          first_name: first_name || null,
          last_name: last_name || null,
          referrer_id: referrerId,
          referral_code: referralCode,
        })
        .select()
        .single();

      if (insertError) {
        console.error("❌ Failed to insert user:", insertError);
        return res.status(500).json({ 
          error: "Failed to create user", 
          details: insertError.message,
          code: insertError.code,
          hint: insertError.hint
        });
      }

      console.log(`✅ User created successfully:`, insertedUser);
      return res.status(200).json({ 
        received: true, 
        created: true, 
        userId: id,
        email: email
      });
    }

    // User exists with same ID - no action needed
    console.log(`ℹ️ User already exists with correct ID: ${id}`);
    return res.status(200).json({ 
      received: true, 
      alreadyExists: true 
    });
  }

  if (eventType === "user.updated") {
    console.log(`📝 Processing user.updated for: ${id}`);
    const { email_addresses, first_name, last_name, unsafe_metadata } = evt.data;
    const email = email_addresses?.[0]?.email_address;

    if (!email) {
      console.log("⚠️ No email found in user.updated event");
      return res.status(200).json({ received: true, warning: "No email" });
    }

    const { data: existingUser, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("id, email")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("❌ Error checking user:", fetchError);
      return res.status(500).json({ error: "Database error" });
    }

    if (!existingUser) {
      console.log(`➕ User doesn't exist locally, creating: ${email}`);

      // Handle referral
      let referrerId = null;
      const pendingRef = unsafe_metadata?.referral_code as string;
      
      if (pendingRef) {
        console.log(`🔗 Checking referral code: ${pendingRef}`);
        const { data: refUser } = await supabaseAdmin
          .from("users")
          .select("id")
          .or(`referral_code.eq."${pendingRef}",id.eq."${pendingRef}"`)
          .maybeSingle();

        if (refUser) {
          referrerId = refUser.id;
          console.log(`✅ Found referrer: ${referrerId}`);
        }
      }

      const referralCode = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

      const { error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          id,
          email,
          first_name: first_name || null,
          last_name: last_name || null,
          referrer_id: referrerId,
          referral_code: referralCode,
        });

      if (insertError) {
        console.error("❌ Failed to create user:", insertError);
        return res.status(500).json({ error: "Failed to create user" });
      }

      console.log(`✅ User created during update event: ${email}`);
      return res.status(200).json({ received: true, created: true });
    }

    // User exists, update their info
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        email: email || undefined,
        first_name: first_name || null,
        last_name: last_name || null,
      })
      .eq("id", id);

    if (updateError) {
      console.error("❌ Failed to update user:", updateError);
      return res.status(500).json({ error: "Failed to update user" });
    }

    console.log("✅ User updated successfully");
    return res.status(200).json({ received: true, updated: true });
  }

  if (eventType === "user.deleted") {
    console.log(`🗑️ Deleting user: ${id}`);
    
    const { error: deleteError } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("❌ Failed to delete user:", deleteError);
    } else {
      console.log("✅ User deleted successfully");
    }

    return res.status(200).json({ received: true, deleted: true });
  }

  console.log(`⚠️ Unhandled event type: ${eventType}`);
  return res.status(200).json({ received: true, unhandled: eventType });
};








// import { Webhook } from "svix";
// import { WebhookEvent } from "@clerk/backend";
// import { Request, Response } from "express";
// import { supabaseAdmin } from "../config/SupabaseWebhookConfig";

// export const handleClerkWebhook = async (req: Request, res: Response) => {
//   const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET_DEV!;
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

//   if (eventType === "user.created") {
//     const { email_addresses, first_name, last_name, unsafe_metadata } =
//       evt.data;
//     const email = email_addresses?.[0]?.email_address;

//     if (!email) {
//       return res.status(200).json({ received: true });
//     }

//     const { data: existingUser, error: fetchError } = await supabaseAdmin
//       .from("users")
//       .select("id")
//       .eq("email", email)
//       .maybeSingle();

//     if (fetchError) {
//       console.error("Error checking existing user:", fetchError);
//     }

//     // If exists and ID is different → this is the dev → prod migration case
//     if (existingUser && existingUser.id !== id) {
//       console.log(`Migrating user ${email}: ${existingUser.id} → ${id}`);
//       try {
//         await supabaseAdmin.rpc("migrate_user_id", {
//           old_id: existingUser.id,
//           new_id: id,
//         });
//         console.log("Migration successful!");
//         return res.status(200).json({ migrated: true });
//       } catch (migrationError) {
//         console.error("Migration failed:", migrationError);
//         return res
//           .status(200)
//           .json({ error: "Migration failed but webhook received" });
//       }
//     }

//     let referrerId = null;
//     const pendingRef = unsafe_metadata?.referral_code as string;
//     if (pendingRef) {
//       const { data: refUser } = await supabaseAdmin
//         .from("users")
//         .select("id")
//         .or(`referral_code.eq."${pendingRef}",id.eq."${pendingRef}"`)
//         .maybeSingle();
//       referrerId = refUser?.id ?? null;
//     }

//     if (!existingUser) {
//       await supabaseAdmin.from("users").insert({
//         id,
//         email,
//         first_name,
//         last_name,
//         referrer_id: referrerId,
//         referral_code: Math.random().toString(36).substring(2, 8).toUpperCase(),
//       });
//       console.log(`Created new prod user: ${id}`);
//     }

//     return res.status(200).json({ received: true });
//   }

//   if (eventType === "user.deleted") {
//     await supabaseAdmin.from("users").delete().eq("id", id);
//   }

//   return res.status(200).json({ received: true });
// };


// if (eventType === 'user.created') {
  //   const { email_addresses, first_name, last_name, unsafe_metadata } = evt.data;
  //   const email = email_addresses[0].email_address;

  //   const pendingRef = unsafe_metadata?.referral_code as string;
  //   let referrerId = null;

  //   if (pendingRef) {
  //     const { data: refUser } = await supabaseAdmin
  //       .from('users')
  //       .select('id')
  //       .or(`referral_code.eq."${pendingRef}",id.eq."${pendingRef}"`)
  //       .maybeSingle();
  //     referrerId = refUser?.id;
  //   }

  //   await supabaseAdmin.from('users').insert({
  //     id,
  //     email,
  //     first_name,
  //     last_name,
  //     referrer_id: referrerId,
  //     referral_code: Math.random().toString(36).substring(2, 8).toUpperCase()
  //   });
  // }




// import { Webhook } from 'svix';
// import { WebhookEvent } from '@clerk/backend';
// import { Request, Response } from 'express';
// import { supabaseAdmin } from '../config/SupabaseWebhookConfig';

// export const handleClerkWebhook = async (req: Request, res: Response) => {
//   const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET!;

//   if (!WEBHOOK_SECRET) {
//     console.error("CLERK_WEBHOOK_SECRET is not set");
//     return res.status(500).json({ error: "Server configuration error" });
//   }

//   const payload = JSON.stringify(req.body);
//   const headers = req.headers as Record<string, string>;

//   const wh = new Webhook(WEBHOOK_SECRET);
//   let evt: WebhookEvent;

//   try {
//     evt = wh.verify(payload, {
//       "svix-id": headers["svix-id"],
//       "svix-timestamp": headers["svix-timestamp"],
//       "svix-signature": headers["svix-signature"],
//     }) as WebhookEvent;
//   } catch (err) {
//     console.error("Webhook verification failed:", err);
//     return res.status(400).json({ error: "Webhook verification failed" });
//   }

//   const { id } = evt.data;
//   const eventType = evt.type;

//   // ⚠️ MIGRATION MODE: Skip user.created - let frontend handle it
//   if (eventType === 'user.created') {
//     console.log(`⏭️ [MIGRATION MODE] Skipping user.created for ${id}`);
//     return res.status(200).json({
//       received: true,
//       note: 'User creation handled by frontend during migration'
//     });
//   }

//   // Handle user updates (optional - keeps names in sync)
//   if (eventType === 'user.updated') {
//     const { email_addresses, first_name, last_name } = evt.data;
//     const email = email_addresses?.[0]?.email_address;

//     if (email) {
//       await supabaseAdmin
//         .from('users')
//         .update({
//           first_name: first_name || undefined,
//           last_name: last_name || undefined
//         })
//         .eq('email', email);

//       console.log(`✅ User updated: ${email}`);
//     }
//   }

//   // Handle user deletion
//   if (eventType === 'user.deleted') {
//     console.log(`🗑️ Starting deletion for user: ${id}`);

//     try {
//       // Delete child records first
//       await supabaseAdmin.from('token_requests').delete().eq('user_id', id);
//       await supabaseAdmin.from('investments').delete().eq('user_id', id);
//       await supabaseAdmin.from('withdrawals').delete().eq('user_id', id);
//       await supabaseAdmin.from('user_monthly_performance').delete().eq('user_id', id);
//       await supabaseAdmin.from('referrals').delete().eq('referrer_id', id);
//       await supabaseAdmin.from('referrals').delete().eq('referred_id', id);
//       await supabaseAdmin.from('referral_bonuses').delete().eq('referrer_id', id);
//       await supabaseAdmin.from('referral_bonuses').delete().eq('referred_user_id', id);
//       await supabaseAdmin.from('users').update({ referrer_id: null }).eq('referrer_id', id);

//       // Delete the user
//       const { error } = await supabaseAdmin.from('users').delete().eq('id', id);

//       if (error) {
//         console.error("❌ Failed to delete user:", error);
//         return res.status(500).json({ error: "Failed to delete user" });
//       }

//       console.log(`✅ User fully deleted: ${id}`);
//       return res.status(200).json({ received: true, deleted: true });
//     } catch (error) {
//       console.error("❌ Deletion failed:", error);
//       return res.status(500).json({ error: "Deletion failed" });
//     }
//   }

//   return res.status(200).json({ received: true });
// };
