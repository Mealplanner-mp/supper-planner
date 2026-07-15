import React, { useState } from "react";
import { supabase } from "./supabaseClient";
import Logo, { BRAND } from "./Logo.jsx";

const C = {
  paper: "#F6F7F4",
  ink: "#1C1E1B",
  inkSoft: "#63665F",
  forest: "#0F9D63",
  line: "#DEE0D8",
  white: "#FFFFFF",
  danger: "#EF4444",
};

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  };

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center px-4"
      style={{ background: C.paper, fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .auth-input:focus { border-color: ${C.forest} !important; box-shadow: 0 0 0 3px rgba(63,91,69,0.16); outline: none; }
      `}</style>
      <div
        className="w-full max-w-sm rounded-2xl p-6"
        style={{ background: C.white, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(46,42,34,0.05)" }}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <Logo size={56} />
          <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 24, color: C.ink, marginTop: 12 }}>
            Stress Less. Enjoy More.
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: BRAND.sage, marginTop: 2 }}>
            Your All-in-One Supper Planner.
          </p>
          <p className="text-xs mt-3" style={{ color: C.inkSoft }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              className="block text-xs font-semibold uppercase mb-1"
              style={{ fontFamily: "'Inter', sans-serif", color: C.forest, letterSpacing: "0.08em" }}
            >
              Email
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              className="auth-input w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: `1px solid ${C.line}` }}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label
              className="block text-xs font-semibold uppercase mb-1"
              style={{ fontFamily: "'Inter', sans-serif", color: C.forest, letterSpacing: "0.08em" }}
            >
              Password
            </label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="auth-input w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: `1px solid ${C.line}` }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <div className="text-xs" style={{ color: C.danger }}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: C.forest, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs mt-4" style={{ color: C.inkSoft }}>
          No account yet? You'll get an email invite once you've signed up for beta access.
        </p>
      </div>
    </div>
  );
}
