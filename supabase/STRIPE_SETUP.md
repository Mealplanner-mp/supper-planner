# Stripe → auto-signup setup

This wires your existing Stripe Payment Link to automatically create a
Supabase account (and email an invite) the moment someone pays. No manual
"Add user" step needed anymore.

## One-time setup

1. **Payment Link**: make sure "Collect customer's email" is turned on for
   your Payment Link (Stripe Dashboard → Payment Links → your link → edit).
   This webhook depends on that email being present.

2. **Supabase Auth Site URL**: Supabase Dashboard → Authentication → URL
   Configuration → set **Site URL** to your live Vercel URL
   (e.g. `https://supper-planner-one.vercel.app`). This is the link the
   invite email sends people to.

3. **Install the Supabase CLI** (if not already): `npm install -g supabase`

4. **Log in and link the project**:
   ```
   supabase login
   supabase link --project-ref skwqwfoixwvouvbzdtft
   ```

5. **Set secrets** — run this yourself with your real values, do not share
   these values in chat with anyone (they grant full access to your Stripe
   account / bypass all database security rules):
   ```
   supabase secrets set STRIPE_SECRET_KEY=sk_live_...
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   supabase secrets set SUPABASE_URL=https://skwqwfoixwvouvbzdtft.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
   ```
   - `STRIPE_SECRET_KEY`: Stripe Dashboard → Developers → API keys → Secret key
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Project Settings → API → `service_role` secret
   - `STRIPE_WEBHOOK_SECRET`: you'll get this in step 7, after creating the webhook endpoint

6. **Deploy the function**:
   ```
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```
   This prints the function's URL, something like:
   `https://skwqwfoixwvouvbzdtft.supabase.co/functions/v1/stripe-webhook`

7. **Create the Stripe webhook endpoint**: Stripe Dashboard → Developers →
   Webhooks → Add endpoint.
   - Endpoint URL: the function URL from step 6
   - Events to send: `checkout.session.completed`
   - After creating it, click into the endpoint and reveal the **Signing
     secret** (`whsec_...`) — set that as `STRIPE_WEBHOOK_SECRET` (step 5).

8. **Test it**: use a real payment through your Payment Link (or Stripe's
   test mode with a test Payment Link + test card `4242 4242 4242 4242`).
   Check Stripe Dashboard → Webhooks → your endpoint → recent deliveries for
   a `200` response, and confirm the new user shows up in Supabase
   Authentication → Users.

## Notes

- If someone who's already a user pays again, the function silently no-ops
  (Supabase rejects the duplicate invite, which is treated as success, not
  an error) — safe to leave as-is.
- Self-serve *free* signup should stay OFF in Supabase Auth settings — this
  webhook is the only path that creates accounts now, and it only fires on
  a paid checkout session.
