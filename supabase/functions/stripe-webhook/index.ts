// Stripe webhook — on a completed, paid checkout session, invites the payer's
// email as a new Supabase user (creates the auth account + emails them a link
// to set their password). profiles/planner_data rows get created automatically
// on their first login via ensureUserProvisioned in src/App.jsx.
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

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ received: true, skipped: "not paid" }), { status: 200 });
    }

    const email = session.customer_details?.email ?? session.customer_email;
    if (!email) {
      console.error("checkout session completed with no email", session.id);
      return new Response(JSON.stringify({ received: true, skipped: "no email" }), { status: 200 });
    }

    const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
    if (error && !error.message?.toLowerCase().includes("already been registered")) {
      console.error("invite failed", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
