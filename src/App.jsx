import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth.jsx";
import PlannerApp from "./PlannerApp.jsx";
import Pricing from "./Pricing.jsx";
import ResetPassword from "./ResetPassword.jsx";

const TRIAL_DAYS = 7;
const CHECKOUT_PARAM = "checkout";
const SESSION_PARAM = "session_id";
const POLL_INTERVAL_MS = 1000;
const POLL_MAX_ATTEMPTS = 5; // ~5s fallback, only used if verify-checkout can't run

async function ensureUserProvisioned(user) {
  const username = (user.email || user.id).split("@")[0];

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: user.id, username, email: user.email }, { onConflict: "id", ignoreDuplicates: true });
  if (profileError) console.error("profile provisioning failed", profileError);

  // ignoreDuplicates above means the upsert above only ever fires once, on
  // first login — it won't touch email again after that. Keep profiles.email
  // in sync on every login too (e.g. after a confirmed email change from the
  // account page), without touching username.
  const { error: emailSyncError } = await supabase.from("profiles").update({ email: user.email }).eq("id", user.id);
  if (emailSyncError) console.error("profile email sync failed", emailSyncError);

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fallback only — used if verify-checkout can't run (no session_id on the
// URL, or the call itself fails). Polls briefly for the stripe-webhook to
// land instead of immediately showing the paywall for an account that
// actually just paid.
async function waitForPaymentConfirmation(userId) {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const status = await loadAccountStatus(userId);
    if (status.isPaid) return status;
    await sleep(POLL_INTERVAL_MS);
  }
  return loadAccountStatus(userId);
}

// Verifies the just-completed Stripe session directly (see each Payment
// Link's "After payment" redirect: .../?checkout=success&session_id=
// {CHECKOUT_SESSION_ID}) instead of waiting on the webhook — resolves in one
// request instead of a poll.
async function verifyCheckoutSession(sessionId) {
  const { data, error } = await supabase.functions.invoke("verify-checkout", { body: { sessionId } });
  if (error || data?.error) {
    console.error("verify-checkout failed", error || data.error);
    return null;
  }
  return data;
}

function stripCheckoutParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete(CHECKOUT_PARAM);
  url.searchParams.delete(SESSION_PARAM);
  window.history.replaceState({}, "", url.pathname + url.search + url.hash);
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = checking, null = signed out
  const [provisioned, setProvisioned] = useState(false);
  const [account, setAccount] = useState({ trialExpired: false, isPaid: false, tier: null });
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      // Supabase silently fires an auth event (token refresh) whenever the
      // browser tab regains focus, even for the same already-signed-in user.
      // Only reset provisioning — which unmounts/remounts PlannerApp — on an
      // actual sign-in/sign-out, not on every one of those background pings,
      // or switching back to this tab would reset the whole app each time.
      setSession((prevSession) => {
        if (prevSession?.user?.id !== newSession?.user?.id) setProvisioned(false);
        return newSession;
      });
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user && !provisioned) {
      (async () => {
        await ensureUserProvisioned(session.user);
        const params = new URLSearchParams(window.location.search);
        const justCheckedOut = params.get(CHECKOUT_PARAM) === "success";
        const sessionId = params.get(SESSION_PARAM);
        let status;
        if (justCheckedOut) {
          setConfirmingPayment(true);
          const verified = sessionId ? await verifyCheckoutSession(sessionId) : null;
          status = verified?.isPaid ? await loadAccountStatus(session.user.id) : await waitForPaymentConfirmation(session.user.id);
          stripCheckoutParams();
          setConfirmingPayment(false);
        } else {
          status = await loadAccountStatus(session.user.id);
        }
        setAccount(status);
        setProvisioned(true);
      })();
    }
  }, [session, provisioned]);

  if (session === undefined) return <LoadingScreen label="loading…" />;
  if (passwordRecovery) return <ResetPassword onDone={() => setPasswordRecovery(false)} />;
  if (!session) return <Auth />;
  if (confirmingPayment) return <LoadingScreen label="confirming your payment…" />;
  if (!provisioned) return <LoadingScreen label="setting up your account…" />;
  if (account.trialExpired) return <Pricing mode="trial_expired" userEmail={session.user.email} />;

  // Grandfathered paid accounts (is_paid set manually, no tier chosen) get full access,
  // same as active trials — only an explicit "basic" tier restricts Pro features.
  const hasProAccess = !account.isPaid || !account.tier || account.tier === "pro";

  return <PlannerApp session={session} tier={account.tier} isPaid={account.isPaid} hasProAccess={hasProAccess} />;
}
