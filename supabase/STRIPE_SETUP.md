# Stripe → two-plan billing setup

Accounts are created via self-serve signup (free, 7-day trial). This wires
Stripe so that when someone pays for **Home Cook Basic** ($5/mo) or
**Home Cook Pro** ($8/mo — includes the AI assistant and recipe uploads),
their existing account is marked paid and tagged with the tier they bought.
No manual "Add user" step needed.

## 1. Products (already done)

You've already created the two Products in Stripe → Product catalog:
"Basic" ($5.00/month) and "Pro" ($8.00/month). Nothing more to do here.

## 2. ⚠️ Deactivate the old Payment Links

Checkout used to go through static Stripe **Payment Links**
(`buy.stripe.com/...`). Those had a real billing bug: a Payment Link creates
a **brand-new Stripe Customer on every checkout**, even for the same email —
so re-subscribing after a cancellation, retrying, or clicking twice silently
spun up a duplicate customer with its own subscription that kept billing,
invisible to the app and to the Customer Portal.

The app now creates Checkout Sessions itself (`create-checkout-session`
function, see below), which always reuses the existing Stripe Customer for a
given account. The old Payment Links are no longer used anywhere in the code
— **deactivate them** (Stripe Dashboard → Payment Links → open each one →
"..." menu → Deactivate) so a stale bookmark or shared link can't route
someone through the old, buggy flow.

**Also check for and clean up any duplicate customers/subscriptions this bug
already created**: Stripe Dashboard → Customers, search by an affected
email — if more than one Customer record shows up for the same person,
open each one's Subscriptions tab and cancel any that shouldn't still be
active, and issue refunds for erroneous charges from the Payments tab.

## 3. Price IDs live in the checkout-session function

Open [`supabase/functions/create-checkout-session/index.ts`](functions/create-checkout-session/index.ts)
and confirm `PRICE_IDS.basic` / `PRICE_IDS.pro` match Stripe Dashboard →
Product catalog → (plan) → Pricing → the `price_...` ID shown there (not the
Payment Link URL — a different ID).

## 4. Supabase Auth Site URL

Supabase Dashboard → Authentication → URL Configuration → set **Site URL**
to your live Vercel URL (e.g. `https://plantodish.com`).

## 5. Install the Supabase CLI (if not already)

```
npm install -g supabase
```

## 6. Log in and link the project

```
supabase login
supabase link --project-ref skwqwfoixwvouvbzdtft
```

## 7. Set secrets

Run this yourself with your real values, do not share these values in chat
with anyone (they grant full access to your Stripe account / bypass all
database security rules):
```
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SUPABASE_URL=https://skwqwfoixwvouvbzdtft.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
```
- `STRIPE_SECRET_KEY`: Stripe Dashboard → Developers → API keys → Secret key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Project Settings → API → `service_role` secret
- `STRIPE_WEBHOOK_SECRET`: you'll get this in step 9, after creating the webhook endpoint

## 8. Deploy the functions

```
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy verify-checkout
supabase functions deploy billing-portal
supabase functions deploy create-checkout-session
```
(`verify-checkout`, `billing-portal`, and `create-checkout-session` all keep
JWT verification ON — only a logged-in user can call them, for their own
account.)

The first command prints the webhook's URL, something like:
`https://skwqwfoixwvouvbzdtft.supabase.co/functions/v1/stripe-webhook`

## 9. Create the Stripe webhook endpoint

(Skip if you already have one pointed at this same function URL — no need to
recreate it, the code change doesn't require a new endpoint.)

Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
- Endpoint URL: the function URL from step 8
- Events to send: `checkout.session.completed`, `invoice.payment_succeeded`,
  `invoice.payment_failed`, `customer.subscription.deleted`
- After creating it, click into the endpoint and reveal the **Signing
  secret** (`whsec_...`) — set that as `STRIPE_WEBHOOK_SECRET` (step 7).

If you already have this endpoint from before the last three event types
were added: click into it → **Edit** → add the missing events to the
existing list (no need to recreate the endpoint or change the secret).

## 10. Turn on the Customer Portal (for "Manage payment method")

Stripe Dashboard → **Settings → Billing → Customer portal** → click
**Activate**. The defaults are fine (update payment method, view invoices);
adjust cancellation/plan-switching options there if you want to restrict
them. Without this activated, the "Manage payment method" button on the
account page will fail.

## 11. Test it

Use Stripe test mode with a test Payment Link + test card
`4242 4242 4242 4242`, checking out while logged into the app as an
existing trial user. Check Stripe Dashboard → Webhooks → your endpoint →
recent deliveries for a `200` response, and confirm `is_paid` and `tier`
updated on that user's row in Supabase Table Editor → `profiles`.

## How the pricing page links to Stripe

[`src/Pricing.jsx`](../src/Pricing.jsx) calls the `create-checkout-session`
function (passing which tier was picked), which creates a Stripe Checkout
Session server-side and reuses the caller's existing `stripe_customer_id` if
they have one — so the same account can never end up attached to more than
one Stripe Customer, no matter how many times they check out over time. The
session is stamped with `client_reference_id` = the Supabase user id, which
`stripe-webhook` and `verify-checkout` use to match the payment back to the
right account (falling back to email only for old sessions from the
since-deactivated Payment Links, which never set it).

If a user is already paid (`is_paid`), `create-checkout-session` refuses and
the pricing page instead opens the Stripe **billing portal** — changing
plans has to modify the existing subscription there, never start a new
checkout, or it would create a second subscription on top of the first.

## Notes

- If a profile can't be matched by `client_reference_id` or email, the
  webhook logs it and no-ops — check Supabase Edge Function logs if a
  payment doesn't seem to unlock the app.
- Manually flipping `is_paid = true` in the Supabase dashboard (no `tier`
  set) grandfathers that account into full access, including the AI
  assistant and recipe uploads — see the `hasProAccess` check in `src/App.jsx`.
- Anyone who paid *before* `stripe_customer_id` capture was added won't have
  it backfilled automatically — their "Manage payment method" button will
  show "No billing account on file yet" until their next payment. If needed,
  backfill manually: find their Stripe Customer ID (Stripe Dashboard →
  Customers → search by email) and set it on their `profiles` row via
  Supabase Table Editor.
- Subscription cancellations and failed/successful renewals are matched by
  `stripe_customer_id`, not email — anyone who paid before that column
  existed won't have their access auto-revoked on cancellation either, for
  the same reason. Same manual backfill fixes it.

## AI usage limit

`ai-assistant` caps each user at 30 requests/day (see `DAILY_LIMIT` in
`supabase/functions/ai-assistant/index.ts`) to prevent runaway Anthropic API
costs from one account. It needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
now too (same values as the other functions — already set if you've done step
7 above). Deploy with:
```
supabase functions deploy ai-assistant
```
Also run the updated `schema.sql` (adds the `ai_usage` table) if you haven't
since this was added.
