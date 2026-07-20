# AI features setup (recipe search, photo/link upload, cooking Q&A)

All three AI features route through one Supabase Edge Function
(`ai-assistant`) that holds your Anthropic API key server-side. The app
never talks to Anthropic directly.

## One-time setup

1. **Get an Anthropic API key**: [console.anthropic.com](https://console.anthropic.com)
   → API Keys → Create Key. This requires billing set up (a small initial
   credit purchase) — separate from any Claude.ai subscription.

2. **Install the Supabase CLI** (if not already): `npm install -g supabase`

3. **Log in and link the project** (run these yourself in your own
   terminal, not through chat):
   ```
   supabase login
   supabase link --project-ref skwqwfoixwvouvbzdtft
   ```

4. **Set the secret** — run this yourself with your real key, never share
   it in chat or commit it anywhere:
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   ```

5. **Deploy the function**:
   ```
   supabase functions deploy ai-assistant
   ```
   Note: no `--no-verify-jwt` flag here (unlike the Stripe webhook) — this
   function requires a logged-in Supabase session, so only paying/trial
   users can call it.

6. **Test it**: log into the live app, try "New recipe" → "Upload photo /
   link", or the AI search box, or the floating chat bubble in the
   bottom-right corner. Check Supabase Dashboard → Edge Functions →
   ai-assistant → Logs if something doesn't work.

## Notes

- Uses **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — the cheapest
  tier, well-suited to structured recipe extraction and short Q&A answers.
  Roughly 0.4–1 cent per request at current pricing.
- The cooking Q&A assistant (floating chat bubble) gives generic advice
  only — it does not see the user's saved recipes.
- All three features (search, upload, ask) share the same function via a
  `mode` field in the request body — see `supabase/functions/ai-assistant/index.ts`.
