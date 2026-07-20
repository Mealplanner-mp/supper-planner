import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "./supabaseClient";
import Logo from "./Logo.jsx";

const C = {
  paper: "#F6F7F4",
  ink: "#1C1E1B",
  inkSoft: "#63665F",
  forest: "#0F9D63",
  line: "#DEE0D8",
  white: "#FFFFFF",
  danger: "#EF4444",
};

export default function ResetPassword({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) setError(error.message);
    else onDone();
  };

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
          <Logo size={130} />
          <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 22, color: C.ink, marginTop: 12 }}>
            Set a new password
          </h1>
          <p className="text-xs mt-2" style={{ color: C.inkSoft }}>
            Choose a new password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              className="block text-xs font-semibold uppercase mb-1"
              style={{ fontFamily: "'Inter', sans-serif", color: C.forest, letterSpacing: "0.08em" }}
            >
              New password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                className="w-full px-3 py-2 pr-9 rounded-lg text-sm"
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

          <div>
            <label
              className="block text-xs font-semibold uppercase mb-1"
              style={{ fontFamily: "'Inter', sans-serif", color: C.forest, letterSpacing: "0.08em" }}
            >
              Confirm password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ border: `1px solid ${C.line}` }}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && <div className="text-xs" style={{ color: C.danger }}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white"
            style={{ background: C.forest, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
