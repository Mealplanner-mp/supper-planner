// Creates a Stripe Billing Portal session for the logged-in user, so they can
// update their payment method, view invoices, or cancel — all handled by
// Stripe's own hosted portal, not custom card-entry UI here.
//
// Deployed WITH jwt verification on (no --no-verify-jwt) — only a logged-in
// Supabase user can call this, and only for their own stripe_customer_id.
//
// Requires the Stripe Customer Portal to be activated once in the Stripe
// Dashboard: Settings → Billing → Customer portal.
//
// Required secrets (same ones already set for stripe-webhook):
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy with: supabase functions deploy billing-portal

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

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;
    if (!profile?.stripe_customer_id) {
      return new Response(
        JSON.stringify({ error: "No billing account on file yet — this shows up after your first payment." }),
        { status: 404, headers: corsHeaders }
      );
    }

    const { returnUrl } = await req.json().catch(() => ({ returnUrl: undefined }));

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: returnUrl || "https://plantodish.com",
    });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
