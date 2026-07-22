import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import PlannerApp from "./PlannerApp.jsx";
import Pricing from "./Pricing.jsx";
import ResetPassword from "./ResetPassword.jsx";

const TRIAL_DAYS = 7;

async function ensureUserProvisioned(user) {
  const username = (user.email || user.id).split("@")[0];

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, username, email: user.email }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) console.error("profile provisioning failed", profileError);

  const { error: plannerError } = await supabase
    .from("planner_data")
    .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (plannerError) console.error("planner_data provisioning failed", plannerError);
}

function LoadingScreen({ label }) {
  return (
    <div className="w-full h-screen flex items-center justify-center" style={{ background: "#F6F7F4" }}>
      <div style={{ color: "#63665F", fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{label}</div>
    </div>
  );
}

async function loadAccountStatus(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("created_at, is_paid, tier")
    .eq("id", userId)
    .single();
  if (error || !data) return { trialExpired: false, isPaid: false, tier: null };
  const daysSince = (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60 * 24);
  return {
    trialExpired: !data.is_paid && daysSince >= TRIAL_DAYS,
    isPaid: data.is_paid,
    tier: data.tier,
  };
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [provisioned, setProvisioned] = useState(false);
  const [account, setAccount] = useState({ trialExpired: false, isPaid: false, tier: null });
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setSession(newSession);
      setProvisioned(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user && !provisioned) {
      ensureUserProvisioned(session.user)
        .then(() => loadAccountStatus(session.user.id))
        .then((status) => setAccount(status))
        .then(() => setProvisioned(true));
    }
  }, [session, provisioned]);

  if (session === undefined) return <LoadingScreen label="loading…" />;
  if (passwordRecovery) return <ResetPassword onDone={() => setPasswordRecovery(false)} />;
  if (!session) return <Auth />;
  if (!provisioned) return <LoadingScreen label="setting up your account…" />;
  if (account.trialExpired) return <Pricing mode="trial_expired" userEmail={session.user.email} />;

  // Grandfathered paid accounts (is_paid set manually, no tier chosen) get full access,
  // same as active trials — only an explicit "basic" tier restricts Pro features.
  const hasProAccess = !account.isPaid || !account.tier || account.tier === "pro";

  return <PlannerApp session={session} tier={account.tier} isPaid={account.isPaid} hasProAccess={hasProAccess} />;
}
