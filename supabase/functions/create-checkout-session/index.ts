// Creates a Stripe Checkout Session server-side, instead of using a static
// Payment Link. This is the fix for a real billing bug: static Payment Links
// create a BRAND NEW Stripe Customer on every checkout, even for the same
// email — so any repeat checkout (re-subscribing after cancellation, retrying
// after an error, testing) silently spun up a duplicate customer with its own
// subscription that kept billing, invisible to the app and to the user in the
// Customer Portal (which only ever shows whichever customer is currently
// linked on the profile). This function always reuses the existing
// stripe_customer_id when one is on file, so a given Supabase user can never
// end up attached to more than one Stripe Customer.
//
// Only for STARTING a subscription (new signup, or resubscribing after full
// cancellation). If the user already has an active subscription (is_paid),
// this refuses and tells the caller to use the billing portal instead — an
// "upgrade" must modify the existing subscription, never add a second one.
//
// Deployed WITH jwt verification on (no --no-verify-jwt) — only a logged-in
// Supabase user can call this, and only ever for their own account.
//
// Required secrets (same ones already set for stripe-webhook):
//   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy with: supabase functions deploy create-checkout-session

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

// Price IDs from Stripe Dashboard → Products → (plan) → Pricing.
const PRICE_IDS: Record<string, string> = {
  basic: "price_1Tvqg4FxrrdfdGU2rf7rnwaS",
  pro: "price_1TvqhTFxrrdfdGU2ZTE4RGSl",
};

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

    const { tier, origin } = await req.json();
    const priceId = PRICE_IDS[tier];
    if (!priceId) {
      return new Response(JSON.stringify({ error: "Unknown plan" }), { status: 400, headers: corsHeaders });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id, is_paid")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;

    // An active subscriber must go through the billing portal to change
    // plans — that modifies their existing subscription. Starting a fresh
    // checkout here would create a SECOND subscription on top of it.
    if (profile?.is_paid) {
      return new Response(
        JSON.stringify({ error: "You already have an active subscription — manage or change it from your account page instead." }),
        { status: 409, headers: corsHeaders }
      );
    }

    const baseUrl = origin || "https://plantodish.com";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { tier, user_id: user.id },
      subscription_data: { metadata: { tier, user_id: user.id } },
      success_url: `${baseUrl}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      // Reuse the existing Stripe Customer if this user has one (e.g.
      // resubscribing after a past cancellation) — never let Stripe mint a
      // second Customer for the same account.
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_email: user.email }),
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout-session failed:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
