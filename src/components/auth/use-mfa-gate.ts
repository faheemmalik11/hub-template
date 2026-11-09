import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { checkMfaRequirement } from "@/lib/api/region.functions";

export function useMfaRequirement(enabled: boolean) {
  const [state, setState] = useState<{ checked: boolean; required: boolean }>({
    checked: false,
    required: false,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ checked: false, required: false });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const required = await checkMfaRequirement();
        if (!cancelled) setState({ checked: true, required });
      } catch {
        if (!cancelled) setState({ checked: true, required: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { checking: enabled && !state.checked, required: state.checked && state.required };
}

export function useMfaGate(userId: string | null, enabled: boolean) {
  const [result, setResult] = useState<{
    userId: string;
    needsCode: boolean;
    needsSetup: boolean;
  } | null>(null);

  const recheck = useCallback(async () => {
    if (!enabled || !userId) {
      setResult(null);
      return;
    }
    try {
      await supabase.auth.getSession();
      const [level, factors] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      setResult({
        userId,
        needsCode:
          !level.error &&
          !!level.data &&
          level.data.nextLevel === "aal2" &&
          level.data.currentLevel !== "aal2",
        needsSetup:
          !factors.error && (factors.data?.all ?? []).every((f) => f.status !== "verified"),
      });
    } catch {
      setResult({ userId, needsCode: false, needsSetup: false });
    }
  }, [userId, enabled]);

  useEffect(() => {
    void recheck();
  }, [recheck]);

  useEffect(() => {
    if (!enabled) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "MFA_CHALLENGE_VERIFIED") void recheck();
    });
    return () => data.subscription.unsubscribe();
  }, [enabled, recheck]);

  if (!enabled || !userId) {
    return { checking: false, needsCode: false, needsSetup: false, recheck };
  }

  const settled = result?.userId === userId;
  return {
    checking: !settled,
    needsCode: settled ? result.needsCode : false,
    needsSetup: settled ? result.needsSetup : false,
    recheck,
  };
}
