// Stripe webhook — handles the whole subscription lifecycle, not just the
// initial payment:
//   checkout.session.completed  → marks the profile paid, records the tier
//   invoice.payment_succeeded   → renewal went through, keep/restore is_paid
//   invoice.payment_failed      → renewal failed, revoke is_paid
//   customer.subscription.deleted → subscription fully canceled, revoke is_paid + tier
// Accounts are created via self-serve signup (src/Auth.jsx) with a 7-day free
// trial (src/App.jsx); this webhook only flips the switch once someone pays,
// matching them by the email Stripe collected at checkout to the `email`
// column on their `profiles` row (populated at signup via ensureUserProvisioned)
// for the initial payment, and by `stripe_customer_id` for everything after
// (more reliable than email, which can change).
//
// Each Stripe Payment Link must have "Collect customer's email" turned ON,
// and a metadata field `tier` set to "basic" or "pro" (Payment Link →
// Advanced options → Metadata) so this function knows which plan was
// purchased.
//
// The Stripe webhook endpoint (Dashboard → Developers → Webhooks) needs
// these events selected: checkout.session.completed, invoice.payment_succeeded,
// invoice.payment_failed, customer.subscription.deleted.
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

    // client_reference_id (the Supabase user id) is set by create-checkout-session and is
    // an exact match — prefer it. Email is a fallback only for sessions from the old static
    // Payment Links (pre-fix), which never set client_reference_id.
    const userId = session.client_reference_id;
    const email = session.customer_details?.email ?? session.customer_email;

    let data, error;
    if (userId) {
      ({ data, error } = await supabaseAdmin.from("profiles").update(patch).eq("id", userId).select("id"));
    } else if (email) {
      ({ data, error } = await supabaseAdmin.from("profiles").update(patch).eq("email", email).select("id"));
    } else {
      console.error("checkout session completed with no client_reference_id or email", session.id);
      return new Response(JSON.stringify({ received: true, skipped: "no identifying info" }), { status: 200 });
    }
    if (error) {
      console.error("profile update failed", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    if (!data || data.length === 0) {
      console.error("no profile found for paid checkout", userId || email, session.id);
      return new Response(JSON.stringify({ received: true, skipped: "no matching profile" }), { status: 200 });
    }
  }

  // Renewal succeeded or failed. billing_reason check excludes one-off/manual
  // invoices — only subscription cycles should move is_paid.
  if (event.type === "invoice.payment_succeeded" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    if (invoice.billing_reason?.startsWith("subscription")) {
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (customerId) {
        const isPaid = event.type === "invoice.payment_succeeded";
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ is_paid: isPaid })
          .eq("stripe_customer_id", customerId);
        if (error) console.error("subscription payment status update failed", error, customerId);
      }
    }
  }

  // Subscription fully canceled (either the customer canceled, or Stripe gave
  // up retrying after repeated failures) — revoke access entirely.
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
    if (customerId) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ is_paid: false, tier: null })
        .eq("stripe_customer_id", customerId);
      if (error) console.error("subscription cancellation update failed", error, customerId);
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
