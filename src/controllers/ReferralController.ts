import { Request, Response } from "express";
import { supabase } from "../config/SupabaseConfig";

const BONUS_CONFIG = {
  BACKFILL_EXISTING_INVESTMENTS: true,
  ACCOUNT_AGE_LIMIT_HOURS: 24,
};

export const applyReferralCodeWithBonuses = async (
  req: Request,
  res: Response
) => {
  const { referralCode } = req.body;
  const userId = req.auth?.userId;

  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { data: currentUser } = await supabase
      .from("users")
      .select("id, referrer_id, created_at")
      .eq("id", userId)
      .single();

    if (!currentUser) return res.status(404).json({ error: "User not found" });
    const signupDate = new Date(currentUser.created_at);
    const now = new Date();
    const ageInHours =
      (now.getTime() - signupDate.getTime()) / (1000 * 60 * 60);

    if (ageInHours > BONUS_CONFIG.ACCOUNT_AGE_LIMIT_HOURS) {
      return res.status(400).json({ 
        error: `Referral window closed. Codes must be applied within ${BONUS_CONFIG.ACCOUNT_AGE_LIMIT_HOURS} hours of joining.` 
      });
    }

    let { data: referrer } = await supabase
      .from("users")
      .select("id, referral_code")
      .eq("referral_code", referralCode)
      .maybeSingle();

    if (!referrer) {
      const result = await supabase
        .from("users")
        .select("id, referral_code")
        .eq("id", referralCode)
        .maybeSingle();
      referrer = result.data;
    }

    if (!referrer || referrer.id === userId) {
      return res
        .status(400)
        .json({ error: "Invalid referral code or cannot refer yourself" });
    }

    if (currentUser?.referrer_id) {
      return res.status(400).json({ error: "You already have a referrer" });
    }

    const { error: updateError } = await supabase
      .from("users")
      .update({ referrer_id: referrer.id })
      .eq("id", userId);

    if (updateError) {
      console.error("Update error:", updateError);
      return res.status(500).json({ error: "Failed to apply referral code" });
    }

    let bonusMessage = "Referral applied successfully!";
    let investmentsProcessed = 0;

    if (BONUS_CONFIG.BACKFILL_EXISTING_INVESTMENTS) {
      const { data: investments } = await supabase
        .from("investments")
        .select("id, amount_tokens")
        .eq("user_id", userId)
        .eq("status", "active");

      if (investments && investments.length > 0) {
        console.log(
          `🔄 Backfilling bonuses for ${investments.length} existing investments...`
        );

        for (const inv of investments) {
          await createBonusesUpTheChain(
            referrer.id,
            userId,
            inv.id,
            Number(inv.amount_tokens)
          );
        }

        investmentsProcessed = investments.length;
        bonusMessage = `Referral applied! Bonuses credited for ${investmentsProcessed} existing investment(s).`;
      }
    } else {
      bonusMessage =
        "Referral applied! You'll earn bonuses on future investments.";
    }

    res.json({
      success: true,
      message: bonusMessage,
      investmentsProcessed,
      backfillEnabled: BONUS_CONFIG.BACKFILL_EXISTING_INVESTMENTS,
    });
  } catch (error) {
    console.error("Apply referral error:", error);
    res.status(500).json({ error: "Failed to apply referral code" });
  }
};

async function createBonusesUpTheChain(
  startReferrerId: string,
  investorId: string,
  investmentId: number,
  amount: number
) {
  const rates = [0.05, 0.02, 0.01, 0.005, 0.0025];
  let currentId = startReferrerId;
  let level = 1;

  while (currentId && level <= 5) {
    const bonusAmount = amount * rates[level - 1];

    await supabase.from("referral_bonuses").insert({
      referrer_id: currentId,
      referred_user_id: investorId,
      investment_id: investmentId,
      bonus_type: "first_investment",
      amount: bonusAmount,
      level: level,
    });

    console.log(`✅ Level ${level} bonus: ${bonusAmount} USDT to ${currentId}`);

    if (level === 1) {
      await supabase.from("referral_bonuses").insert({
        referrer_id: currentId,
        referred_user_id: investorId,
        investment_id: investmentId,
        bonus_type: "ongoing",
        amount: amount * 0.02,
        level: 1,
      });
      console.log(`✅ Ongoing bonus: ${amount * 0.02} USDT to ${currentId}`);
    }

    const { data: nextUser } = await supabase
      .from("users")
      .select("referrer_id")
      .eq("id", currentId)
      .maybeSingle();

    currentId = nextUser?.referrer_id || null;
    level++;
  }
}
