// Runs on a daily schedule (see supabase/EMAIL_MARKETING_SETUP.md) to send
// two lifecycle emails via Brevo's transactional API:
//   - "trial ending soon" — day 5-6 of the 7-day trial, not paid yet
//   - "we miss you" (win-back) — trial expired (day 7+), still not paid
// Each is sent at most once per user (tracked via trial_reminder_sent /
// winback_sent on profiles).
//
// Not callable by end users — deployed WITH --no-verify-jwt (it's invoked by
// a cron job, not a logged-in user), but protected by a shared secret header
// instead, so random requests can't trigger it or read user emails.
//
// Required secrets (set via `supabase secrets set`, never committed):
//   BREVO_API_KEY             — Brevo → Settings → SMTP & API → API Keys
//   CRON_SECRET               — any random string you make up yourself;
//                                the cron job must send it back as the
//                                x-cron-secret header
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — already set for other functions
//
// Deploy with: supabase functions deploy trial-emails --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const SENDER = { name: "Plan to Dish", email: "hello@plantodish.com" };

// Keep these in sync with TRIAL_DAYS in src/App.jsx.
const TRIAL_DAYS = 7;
const REMINDER_AFTER_DAYS = TRIAL_DAYS - 2; // day 5 of a 7-day trial

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function daysAgoISO(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function sendEmail(to: string, subject: string, htmlContent: string) {
  const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({ sender: SENDER, to: [{ email: to }], subject, htmlContent }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Brevo send failed (${resp.status}): ${body}`);
  }
}

function reminderEmail() {
  return {
    subject: "Your Plan to Dish trial ends in 2 days",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1C1E1B;">
        <h2 style="color: #0A7248;">Your free trial ends in 2 days</h2>
        <p>Hope Plan to Dish has been making your weekly meal planning easier! Your 7-day free trial wraps up soon — pick a plan to keep your recipe box, planner, and grocery lists going without interruption.</p>
        <p><strong>Home Cook Basic</strong> — $5/mo — recipe box, planner, grocery lists<br/>
        <strong>Home Cook Pro</strong> — $8/mo — everything in Basic, plus the AI cooking assistant</p>
        <p><a href="https://plantodish.com" style="display: inline-block; background: #0F9D63; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Choose your plan</a></p>
        <p style="font-size: 12px; color: #63665F;">Questions? Just reply to this email or reach us at support@plantodish.com.</p>
      </div>
    `,
  };
}

function winbackEmail() {
  return {
    subject: "We miss you at Plan to Dish",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #1C1E1B;">
        <h2 style="color: #0A7248;">Come back to stress-free suppers</h2>
        <p>Your free trial wrapped up, but your recipes and settings are still saved and waiting for you. Pick up right where you left off.</p>
        <p><a href="https://plantodish.com" style="display: inline-block; background: #0F9D63; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none;">Come back</a></p>
        <p style="font-size: 12px; color: #63665F;">Questions? Just reply to this email or reach us at support@plantodish.com.</p>
      </div>
    `,
  };
}

Deno.serve(async (req) => {
  const providedSecret = req.headers.get("x-cron-secret");
  if (!providedSecret || providedSecret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const results = { reminders: 0, winbacks: 0, errors: [] as string[] };

  const { data: reminderCandidates } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("is_paid", false)
    .eq("trial_reminder_sent", false)
    .lte("created_at", daysAgoISO(REMINDER_AFTER_DAYS))
    .gt("created_at", daysAgoISO(TRIAL_DAYS));

  for (const profile of reminderCandidates || []) {
    if (!profile.email) continue;
    try {
      const { subject, html } = reminderEmail();
      await sendEmail(profile.email, subject, html);
      await supabaseAdmin.from("profiles").update({ trial_reminder_sent: true }).eq("id", profile.id);
      results.reminders++;
    } catch (err) {
      results.errors.push(`reminder ${profile.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const { data: winbackCandidates } = await supabaseAdmin
    .from("profiles")
    .select("id, email")
    .eq("is_paid", false)
    .eq("winback_sent", false)
    .lte("created_at", daysAgoISO(TRIAL_DAYS));

  for (const profile of winbackCandidates || []) {
    if (!profile.email) continue;
    try {
      const { subject, html } = winbackEmail();
      await sendEmail(profile.email, subject, html);
      await supabaseAdmin.from("profiles").update({ winback_sent: true }).eq("id", profile.id);
      results.winbacks++;
    } catch (err) {
      results.errors.push(`winback ${profile.email}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return new Response(JSON.stringify(results), { headers: { "Content-Type": "application/json" } });
});
