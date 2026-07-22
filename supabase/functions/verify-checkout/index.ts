// Called by the app immediately after a Stripe Checkout redirect (see each
// Payment Link's "After payment" redirect: .../?checkout=success&session_id=
// {CHECKOUT_SESSION_ID}). Verifies the session directly with Stripe instead
// of waiting on the stripe-webhook function, so a paying user's account
// unlocks in one request instead of a slow poll. stripe-webhook stays in
// place as a backstop (e.g. if the user closes the tab before the redirect
// completes) and for future subscription lifecycle events.
//
// Deployed WITH jwt verification on (no --no-verify-jwt) — only a logged-in
// Supabase user can call this.
//
// Required secrets (same ones already set for stripe-webhook):
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy with: supabase functions deploy verify-checkout

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_TIERS = new Set(["basic", "pro"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: corsHeaders });
    }
    const user = userData.user;

    const { sessionId } = await req.json();
    if (!sessionId) throw new Error("Missing sessionId");

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ isPaid: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Make sure this checkout session actually belongs to the caller, not
    // someone passing around a stale/foreign session id.
    const sessionEmail = session.customer_details?.email ?? session.customer_email;
    if (!sessionEmail || sessionEmail.toLowerCase() !== (user.email || "").toLowerCase()) {
      return new Response(JSON.stringify({ error: "Session does not belong to this account" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const tier = session.metadata?.tier;
    const patch: Record<string, unknown> = { is_paid: true };
    if (tier && VALID_TIERS.has(tier)) patch.tier = tier;

    const { error: updateError } = await supabaseAdmin.from("profiles").update(patch).eq("id", user.id);
    if (updateError) throw updateError;

    return new Response(JSON.stringify({ isPaid: true, tier: patch.tier ?? null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
