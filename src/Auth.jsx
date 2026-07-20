import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const toggleMode = () => {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    setError("");
    setInfo("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setInfo("");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (!data.session) setInfo("Check your email to confirm your account before signing in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }

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
          <Logo size={170} />
          <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 24, color: C.ink, marginTop: 12 }}>
            Stress Less. Enjoy More.
          </h1>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: BRAND.sage, marginTop: 2 }}>
            Your All-in-One Supper Planner.
          </p>
          <p className="text-xs mt-3" style={{ color: C.inkSoft }}>
            {mode === "signup" ? "Start your free 7-day trial" : "Sign in to your account"}
          </p>
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
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="auth-input w-full px-3 py-2 pr-9 rounded-lg text-sm"
                style={{ border: `1px solid ${C.line}` }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                tabIndex={-1}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} color={C.inkSoft} /> : <Eye size={16} color={C.inkSoft} />}
              </button>
            </div>
          </div>

          {error && <div className="text-xs" style={{ color: C.danger }}>{error}</div>}
          {info && <div className="text-xs" style={{ color: C.forest }}>{info}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: C.forest, opacity: loading ? 0.7 : 1 }}
          >
            {loading
              ? mode === "signup" ? "Creating account…" : "Signing in…"
              : mode === "signup" ? "Start free trial" : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs mt-4" style={{ color: C.inkSoft }}>
          {mode === "signup" ? "Already have an account?" : "New here?"}{" "}
          <button onClick={toggleMode} className="underline font-medium" style={{ color: C.forest }}>
            {mode === "signup" ? "Sign in" : "Start your free trial"}
          </button>
        </p>
      </div>
    </div>
  );
}
