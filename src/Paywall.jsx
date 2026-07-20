import React from "react";
import { supabase } from "./supabaseClient";
import Logo, { BRAND } from "./Logo.jsx";

// TODO: drop in your real Stripe Payment Link once you have it (buy.stripe.com/...)
const STRIPE_PAYMENT_LINK = "";

const C = {
  paper: "#F6F7F4",
  ink: "#1C1E1B",
  inkSoft: "#63665F",
  forest: "#0F9D63",
  line: "#DEE0D8",
  white: "#FFFFFF",
};

export default function Paywall() {
  const handleLogout = () => { supabase.auth.signOut(); };

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center px-4"
      style={{ background: C.paper, fontFamily: "'Inter', sans-serif" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: C.white, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(46,42,34,0.05)" }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <Logo size={170} />
          <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 22, color: C.ink, marginTop: 12 }}>
            Your free trial has ended
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: BRAND.sage, marginTop: 4 }}>
            Keep the stress-free suppers coming.
          </p>
        </div>

        <p className="text-sm text-center mb-5" style={{ color: C.inkSoft }}>
          Continue for a one-time $20 to keep your recipe box, planner, and grocery lists going.
        </p>

        {STRIPE_PAYMENT_LINK ? (
          <a
            href={STRIPE_PAYMENT_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full block text-center py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: C.forest }}
          >
            Continue for $20
          </a>
        ) : (
          <div className="w-full text-center py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}>
            Payment link coming soon — check back shortly.
          </div>
        )}

        <p className="text-center text-xs mt-4" style={{ color: C.inkSoft }}>
          Already paid? It may take a little while to confirm — check back soon.
        </p>

        <button
          onClick={handleLogout}
          className="w-full text-center text-xs mt-4 underline"
          style={{ color: C.inkSoft }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
