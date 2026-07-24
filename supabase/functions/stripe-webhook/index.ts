// Stripe webhook — on a completed, paid checkout session, marks the paying
// user's existing profile as paid and records which tier they bought.
// Accounts are created via self-serve signup (src/Auth.jsx) with a 7-day free
// trial (src/App.jsx); this webhook only flips the switch once someone pays,
// matching them by the email Stripe collected at checkout to the `email`
// column on their `profiles` row (populated at signup via ensureUserProvisioned).
//
// Each Stripe Payment Link must have "Collect customer's email" turned ON,
// and a metadata field `tier` set to "basic" or "pro" (Payment Link →
// Advanced options → Metadata) so this function knows which plan was
// purchased.
//
// Required secrets (set via `supabase secrets set`, never committed):
//   STRIPE_SECRET_KEY       — Stripe Developers > API keys > Secret key
//   STRIPE_WEBHOOK_SECRET   — shown when you create the webhook endpoint in Stripe
//   SUPABASE_URL            — same as VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY — Supabase Project Settings > API > service_role key
//
// Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
// (--no-verify-jwt because Stripe calls this directly, not with a Supabase user JWT —
// the Stripe signature check below is what actually authenticates the caller.)

import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const VALID_TIERS = new Set(["basic", "pro"]);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error("signature verification failed", err);
    return new Response(`Webhook signature verification failed`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    // A 100%-off promo code makes Stripe mark the session "no_payment_required"
    // instead of "paid" — both mean the checkout genuinely completed.
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      return new Response(JSON.stringify({ received: true, skipped: "not paid" }), { status: 200 });
    }

    const email = session.customer_details?.email ?? session.customer_email;
    if (!email) {
      console.error("checkout session completed with no email", session.id);
      return new Response(JSON.stringify({ received: true, skipped: "no email" }), { status: 200 });
    }

    const tier = session.metadata?.tier;
    const patch: Record<string, unknown> = { is_paid: true };
    if (tier && VALID_TIERS.has(tier)) {
      patch.tier = tier;
    } else {
      console.error("checkout session completed with missing/unknown tier metadata", session.id, tier);
    }
    if (session.customer) {
      patch.stripe_customer_id = typeof session.customer === "string" ? session.customer : session.customer.id;
    }

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update(patch)
      .eq("email", email)
      .select("id");
    if (error) {
      console.error("profile update failed", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    if (!data || data.length === 0) {
      console.error("no profile found for paid checkout email", email, session.id);
      return new Response(JSON.stringify({ received: true, skipped: "no matching profile" }), { status: 200 });
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
