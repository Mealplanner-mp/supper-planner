import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import PlannerApp from "./PlannerApp.jsx";
import Paywall from "./Paywall.jsx";

const TRIAL_DAYS = 7;

async function ensureUserProvisioned(user) {
  const username = (user.email || user.id).split("@")[0];

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, username }, { onConflict: "id", ignoreDuplicates: true });
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

async function checkTrialExpired(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("created_at, is_paid")
    .eq("id", userId)
    .single();
  if (error || !data || data.is_paid) return false;
  const daysSince = (Date.now() - new Date(data.created_at).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= TRIAL_DAYS;
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [provisioned, setProvisioned] = useState(false);
  const [trialExpired, setTrialExpired] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setProvisioned(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user && !provisioned) {
      ensureUserProvisioned(session.user)
        .then(() => checkTrialExpired(session.user.id))
        .then((expired) => setTrialExpired(expired))
        .then(() => setProvisioned(true));
    }
  }, [session, provisioned]);

  if (session === undefined) return <LoadingScreen label="loading…" />;
  if (!session) return <Auth />;
  if (!provisioned) return <LoadingScreen label="setting up your account…" />;
  if (trialExpired) return <Paywall />;

  return <PlannerApp session={session} />;
}
