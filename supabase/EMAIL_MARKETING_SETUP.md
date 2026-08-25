# Trial lifecycle emails (reminder + win-back)

Sends two automated emails per user, once each, via Brevo:
- **Trial ending soon** — day 5 of the 7-day trial (2 days before it expires)
- **We miss you (win-back)** — the day after the trial expires, if still unpaid

This is separate from one-off marketing campaigns you send manually from
Brevo's own dashboard — this one runs automatically, every day, with no
action from you once it's set up.

## 1. Get a Brevo API key

Brevo → **Settings (gear icon) → SMTP & API → API Keys** → **Generate a new API key**.
Copy it — you'll set it as a secret in step 4.

## 2. Verify plantodish.com as a sending domain in Brevo

This is separate from the DNS work you already did for Zoho — Brevo needs
its **own** authentication records so mail sent through *their* servers
(not Zoho's) is trusted.

Brevo → **Senders & IP → Domains → Add a domain** → enter `plantodish.com`.
It'll show you a few DNS records (typically a domain-verification TXT and
two DKIM CNAME/TXT records). Add those in Vercel the same way as before —
paste them here and I'll map them into the Add Record form.

Without this, Brevo can still send, but deliverability will be worse (more
likely to land in spam), especially early on.

## 3. Make up a CRON_SECRET

This isn't from any dashboard — just make up a long random string yourself
(e.g. generate one at [1password.com/password-generator](https://1password.com/password-generator)
or similar). It's what proves the daily cron job calling this function is
actually you, not a random request on the internet. Save it somewhere safe.

## 4. Set secrets

```
supabase secrets set BREVO_API_KEY=xkeysib-...
supabase secrets set CRON_SECRET=your-made-up-random-string
```

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already set from earlier.)

## 5. Run the updated schema.sql

Adds `trial_reminder_sent` and `winback_sent` columns to `profiles`, if you
haven't run it since this was added.

## 6. Deploy the function

```
supabase functions deploy trial-emails --no-verify-jwt
```
(`--no-verify-jwt` because a cron job calls this, not a logged-in user — the
`CRON_SECRET` header check inside the function is what actually authenticates it.)

## 7. Schedule it to run daily

Check **Supabase Dashboard → Database → Cron Jobs** first — if that exists
on your project, use it (much easier, no SQL needed): create a job that
runs once a day and calls your function's URL
(`https://skwqwfoixwvouvbzdtft.supabase.co/functions/v1/trial-emails`) with
header `x-cron-secret: your-made-up-random-string`.

If that dashboard section doesn't exist yet, tell me and I'll give you the
`pg_cron` SQL fallback instead (needs the `pg_cron` and `pg_net` extensions
enabled first, under Database → Extensions).

## 8. Test it

You can trigger it manually any time to test, from your own terminal:
```
curl -X POST https://skwqwfoixwvouvbzdtft.supabase.co/functions/v1/trial-emails -H "x-cron-secret: your-made-up-random-string"
```
It returns a JSON summary like `{"reminders": 1, "winbacks": 0, "errors": []}`.
To actually see it send you a test email, temporarily set your own account's
`created_at` in Supabase Table Editor to 5 days ago (for the reminder) or 8
days ago (for win-back), run the curl command, then set it back afterward.

## Notes

- Each email only ever sends once per user (the `trial_reminder_sent` /
  `winback_sent` flags) — safe to run this daily without spamming anyone.
- If someone pays, `is_paid` becomes true and they're excluded from both
  queries automatically going forward.
- Copy/subject lines live in `supabase/functions/trial-emails/index.ts` —
  edit and redeploy any time you want to change the wording.
