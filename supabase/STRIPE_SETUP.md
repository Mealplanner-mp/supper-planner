# Stripe → two-plan billing setup

Accounts are created via self-serve signup (free, 7-day trial). This wires
Stripe so that when someone pays for **Home Cook Basic** ($5/mo) or
**Home Cook Pro** ($8/mo — includes the AI assistant and recipe uploads),
their existing account is marked paid and tagged with the tier they bought.
No manual "Add user" step needed.

## 1. Products (already done)

You've already created the two Products in Stripe → Product catalog:
"Basic" ($5.00/month) and "Pro" ($8.00/month). Nothing more to do here.

## 2. Create a Payment Link for each product

Payment Links are separate from products — a product just defines the price,
the Payment Link is the actual shareable checkout page. Do this once per plan:

1. Stripe Dashboard → left sidebar → **Payment Links** → **+ New**.
2. In the product picker, don't fill out a new product — instead search for
   and select your existing **"Basic"** product (it'll show the $5.00/month
   price already attached). Click **Add**.
3. Scroll down to **Customer information** and turn ON **"Collect customer's
   email address"** — the webhook depends on this to identify who paid.
4. Open **Advanced options** → **Metadata** → add a row with key `tier` and
   value `basic` (exactly that, lowercase).
5. Still in **Advanced options**, find **"After payment"** and switch it from
   the default "Show a confirmation page" to **"Don't show confirmation page"
   / redirect to your website**, then enter:
   `https://plantodish.com/?checkout=success`
   This is what lets the app pick back up automatically in the same tab
   instead of leaving the customer stranded on Stripe's page — see the
   `confirmingPayment` polling logic in `src/App.jsx`.
6. Click **Create link** (top right). Copy the resulting URL
   (looks like `https://buy.stripe.com/xxxxxxxx`).
7. Repeat steps 1–6 for the **"Pro"** product, using metadata value `pro`
   instead of `basic` (the redirect URL is the same for both).

If you already created both links before adding this — same deal as with
metadata, just **Edit** each existing link and add the redirect under
Advanced options → After payment.

## 3. Paste both links into the code

Open [`src/Pricing.jsx`](../src/Pricing.jsx) and fill in the `link` field for
each entry in the `PLANS` array with the matching Payment Link URL from step 2.

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

## 8. Deploy the function

```
supabase functions deploy stripe-webhook --no-verify-jwt
```
This prints the function's URL, something like:
`https://skwqwfoixwvouvbzdtft.supabase.co/functions/v1/stripe-webhook`

## 9. Create the Stripe webhook endpoint

(Skip if you already have one pointed at this same function URL — no need to
recreate it, the code change doesn't require a new endpoint.)

Stripe Dashboard → Developers → Webhooks → **Add endpoint**.
- Endpoint URL: the function URL from step 8
- Events to send: `checkout.session.completed`
- After creating it, click into the endpoint and reveal the **Signing
  secret** (`whsec_...`) — set that as `STRIPE_WEBHOOK_SECRET` (step 7).

## 10. Test it

Use Stripe test mode with a test Payment Link + test card
`4242 4242 4242 4242`, checking out while logged into the app as an
existing trial user. Check Stripe Dashboard → Webhooks → your endpoint →
recent deliveries for a `200` response, and confirm `is_paid` and `tier`
updated on that user's row in Supabase Table Editor → `profiles`.

## How the pricing page links to Stripe

[`src/Pricing.jsx`](../src/Pricing.jsx) appends `?prefilled_email=<their email>`
to whichever Payment Link the user clicks, so Stripe checkout arrives with
their email locked in — this is what lets the webhook match the payment back
to the right existing account without a fully custom Checkout Session flow.

## Notes

- If a profile can't be matched by email (e.g. they paid with a different
  email than they signed up with), the webhook logs it and no-ops — check
  Supabase Edge Function logs if a payment doesn't seem to unlock the app.
- Manually flipping `is_paid = true` in the Supabase dashboard (no `tier`
  set) grandfathers that account into full access, including the AI
  assistant and recipe uploads — see the `hasProAccess` check in `src/App.jsx`.
