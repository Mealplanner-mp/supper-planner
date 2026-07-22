import React from "react";
import { Check, X as XIcon } from "lucide-react";
import { supabase } from "./supabaseClient";
import Logo, { BRAND } from "./Logo.jsx";

const C = {
  paper: "#F6F7F4",
  ink: "#1C1E1B",
  inkSoft: "#63665F",
  forest: "#0F9D63",
  line: "#DEE0D8",
  white: "#FFFFFF",
};

// TODO: paste your real Stripe Payment Links here once created (buy.stripe.com/...).
// Each Payment Link needs "Collect customer's email" turned ON, and a metadata
// field `tier` set to "basic" / "pro" (Payment Link → Advanced options →
// Metadata) so the stripe-webhook function knows which plan was purchased.
const PLANS = [
  {
    key: "basic",
    name: "Home Cook Basic",
    price: "$5",
    tagline: "Everything you need to plan stress-free suppers.",
    features: ["Unlimited recipe box", "Weekly planner + grocery lists", "Freezer & baby-friendly planning"],
    link: "https://buy.stripe.com/3cIcN5gsM9yO7EYgL06wE01",
  },
  {
    key: "pro",
    name: "Home Cook Pro",
    price: "$8",
    tagline: "Basic, plus AI on your side in the kitchen.",
    features: ["Everything in Basic", "AI cooking assistant chat", "Upload recipes from a photo or link"],
    link: "https://buy.stripe.com/4gM8wP6Sc3aq6AUfGW6wE02",
    highlighted: true,
  },
];

function paymentUrl(link, email) {
  if (!link) return null;
  return `${link}?prefilled_email=${encodeURIComponent(email || "")}`;
}

export default function Pricing({ mode = "trial_expired", userEmail, currentTier, onClose }) {
  const handleLogout = () => { supabase.auth.signOut(); };

  const card = (
    <div
      className="w-full max-w-2xl rounded-2xl p-6"
      style={{ background: C.white, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(46,42,34,0.05)" }}
    >
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1 flex flex-col items-center text-center">
          {mode === "trial_expired" && <Logo size={140} />}
          <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 22, color: C.ink, marginTop: mode === "trial_expired" ? 12 : 0 }}>
            {mode === "trial_expired" ? "Your free trial has ended" : "Upgrade to Home Cook Pro"}
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: BRAND.sage, marginTop: 4 }}>
            {mode === "trial_expired" ? "Pick a plan to keep the stress-free suppers coming." : "Unlock the AI assistant and recipe uploads."}
          </p>
        </div>
        {mode === "upgrade" && onClose && (
          <button onClick={onClose} className="shrink-0 p-1" style={{ color: C.inkSoft }} title="Close">
            <XIcon size={18} />
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        {PLANS.map((plan) => {
          const isCurrent = currentTier === plan.key;
          const url = paymentUrl(plan.link, userEmail);
          return (
            <div
              key={plan.key}
              className="rounded-xl p-4 flex flex-col"
              style={{ border: `2px solid ${plan.highlighted ? C.forest : C.line}`, background: plan.highlighted ? "#F3FAF6" : C.white }}
            >
              {plan.highlighted && (
                <span
                  className="self-start text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full mb-2 text-white"
                  style={{ background: C.forest, letterSpacing: "0.04em" }}
                >
                  Includes AI
                </span>
              )}
              <div className="text-base font-semibold" style={{ color: C.ink, fontFamily: "'Poppins', sans-serif" }}>{plan.name}</div>
              <div className="my-1" style={{ color: C.ink }}>
                <span className="text-2xl font-bold">{plan.price}</span>
                <span className="text-sm" style={{ color: C.inkSoft }}>/mo</span>
              </div>
              <div className="text-xs mb-3" style={{ color: C.inkSoft }}>{plan.tagline}</div>
              <ul className="text-xs space-y-1.5 mb-4 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5" style={{ color: C.ink }}>
                    <Check size={13} color={C.forest} className="shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <div className="text-center text-xs py-2 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}>
                  Current plan
                </div>
              ) : url ? (
                <a
                  href={url}
                  className="text-center text-sm font-medium text-white py-2 rounded-lg"
                  style={{ background: plan.highlighted ? C.forest : C.ink }}
                >
                  {mode === "upgrade" ? `Upgrade — ${plan.price}/mo` : `Continue — ${plan.price}/mo`}
                </a>
              ) : (
                <div className="text-center text-xs py-2 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}>
                  Payment link coming soon
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs mt-2" style={{ color: C.inkSoft }}>
        Already paid? It may take a little while to confirm — check back soon.
      </p>

      {mode === "trial_expired" && (
        <button onClick={handleLogout} className="w-full text-center text-xs mt-4 underline" style={{ color: C.inkSoft }}>
          Log out
        </button>
      )}
    </div>
  );

  if (mode === "upgrade") {
    return (
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: "rgba(46,42,34,0.55)" }}>
        {card}
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen flex items-center justify-center px-4" style={{ background: C.paper, fontFamily: "'Inter', sans-serif" }}>
      {card}
    </div>
  );
}
