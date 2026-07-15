import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import PlannerApp from "./PlannerApp.jsx";

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

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [provisioned, setProvisioned] = useState(false);

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
      ensureUserProvisioned(session.user).then(() => setProvisioned(true));
    }
  }, [session, provisioned]);

  if (session === undefined) return <LoadingScreen label="loading…" />;
  if (!session) return <Auth />;
  if (!provisioned) return <LoadingScreen label="setting up your account…" />;

  return <PlannerApp session={session} />;
}
