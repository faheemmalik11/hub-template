import { supabase } from "@/integrations/supabase/client";

export async function verifyWithAnyFactor(
  code: string,
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { ok: false, error };

  const verifiedFactors = (data?.all ?? []).filter((factor) => factor.status === "verified");
  if (verifiedFactors.length === 0) return { ok: false, error: new Error("No verified factor") };

  let lastError: unknown = null;
  for (const factor of verifiedFactors) {
    const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
    if (challenge.error || !challenge.data) {
      console.error("[2fa] challenge failed", factor.friendly_name, factor.id, challenge.error);
      lastError = challenge.error;
      continue;
    }
    const result = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    if (!result.error) return { ok: true };
    console.error("[2fa] rejected by", factor.friendly_name, factor.id, result.error);
    lastError = result.error;
  }
  return { ok: false, error: lastError };
}
