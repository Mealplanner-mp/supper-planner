import React, { useEffect, useState } from "react";
import { X, User, Mail, Lock, Check, RefreshCw, CreditCard, Sparkles } from "lucide-react";
import { supabase } from "./supabaseClient";

const C = {
  paper: "#F6F7F4",
  paperDark: "#EAEBE6",
  ink: "#1C1E1B",
  inkSoft: "#63665F",
  forest: "#0F9D63",
  line: "#DEE0D8",
  white: "#FFFFFF",
  danger: "#EF4444",
};

const PLAN_LABEL = { basic: "Home Cook Basic", pro: "Home Cook Pro" };

function Field({ icon: Icon, label, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase mb-1.5" style={{ color: C.inkSoft, letterSpacing: "0.05em" }}>
        <Icon size={12} /> {label}
      </div>
      {children}
    </div>
  );
}

export default function Account({ session, tier, isPaid, dietaryPreferences, onSaveDietaryPreferences, onUpgradeClick, onClose }) {
  const userId = session.user.id;

  const [usernameLoaded, setUsernameLoaded] = useState(false);
  const [username, setUsername] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameMsg, setUsernameMsg] = useState("");

  const [email, setEmail] = useState(session.user.email || "");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");

  const [prefsDraft, setPrefsDraft] = useState(dietaryPreferences || "");
  const [prefsSaved, setPrefsSaved] = useState(false);

  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("profiles").select("username").eq("id", userId).single();
      if (data?.username) setUsername(data.username);
      setUsernameLoaded(true);
    })();
  }, [userId]);

  const saveUsername = async () => {
    const trimmed = username.trim();
    if (!trimmed) return;
    setUsernameSaving(true);
    setUsernameMsg("");
    const { error } = await supabase.from("profiles").update({ username: trimmed }).eq("id", userId);
    setUsernameSaving(false);
    setUsernameMsg(error ? error.message : "Saved.");
  };

  const saveEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed || trimmed === session.user.email) return;
    setEmailSaving(true);
    setEmailMsg("");
    const { error } = await supabase.auth.updateUser({ email: trimmed });
    setEmailSaving(false);
    setEmailMsg(error ? error.message : "Confirmation link sent to your new address — click it to finish the change.");
  };

  const savePassword = async () => {
    if (newPassword.length < 6) { setPasswordMsg("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordMsg("Passwords don't match."); return; }
    setPasswordSaving(true);
    setPasswordMsg("");
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) {
      setPasswordMsg(error.message);
    } else {
      setPasswordMsg("Password updated.");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const savePrefs = () => {
    onSaveDietaryPreferences(prefsDraft.trim());
    setPrefsSaved(true);
    setTimeout(() => setPrefsSaved(false), 2000);
  };

  const openBillingPortal = async () => {
    setPortalLoading(true);
    setPortalError("");
    const { data, error } = await supabase.functions.invoke("billing-portal", {
      body: { returnUrl: window.location.origin },
    });
    setPortalLoading(false);
    if (error || data?.error) {
      setPortalError(data?.error || error.message || "Couldn't open billing — try again.");
      return;
    }
    window.location.href = data.url;
  };

  const planLabel = !isPaid ? "Free trial" : tier ? PLAN_LABEL[tier] : "Full access";

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 py-8 overflow-y-auto" style={{ background: "rgba(46,42,34,0.55)" }} onClick={onClose}>
      <div
        className="pop-in rounded-2xl w-full max-w-md my-auto p-6"
        style={{ background: C.white, border: `1px solid ${C.line}`, boxShadow: "0 4px 16px rgba(46,42,34,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 19, color: C.ink }}>Your account</h2>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>

        <Field icon={User} label="Username">
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ border: `1px solid ${C.line}` }}
              value={username}
              disabled={!usernameLoaded}
              onChange={(e) => { setUsername(e.target.value); setUsernameMsg(""); }}
            />
            <button
              onClick={saveUsername}
              disabled={usernameSaving || !username.trim()}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white shrink-0"
              style={{ background: C.forest, opacity: usernameSaving ? 0.6 : 1 }}
            >
              {usernameSaving ? <RefreshCw size={14} className="animate-spin" /> : "Save"}
            </button>
          </div>
          {usernameMsg && <div className="text-xs mt-1" style={{ color: usernameMsg === "Saved." ? C.forest : C.danger }}>{usernameMsg}</div>}
        </Field>

        <Field icon={Mail} label="Email">
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ border: `1px solid ${C.line}` }}
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailMsg(""); }}
            />
            <button
              onClick={saveEmail}
              disabled={emailSaving || !email.trim() || email.trim() === session.user.email}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white shrink-0"
              style={{ background: C.forest, opacity: emailSaving ? 0.6 : 1 }}
            >
              {emailSaving ? <RefreshCw size={14} className="animate-spin" /> : "Save"}
            </button>
          </div>
          {emailMsg && <div className="text-xs mt-1" style={{ color: emailMsg === "Confirmation link sent to your new address — click it to finish the change." ? C.forest : C.danger }}>{emailMsg}</div>}
        </Field>

        <Field icon={Lock} label="Change password">
          <input
            className="w-full px-3 py-2 rounded-lg text-sm mb-2"
            style={{ border: `1px solid ${C.line}` }}
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setPasswordMsg(""); }}
          />
          <div className="flex gap-2">
            <input
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ border: `1px solid ${C.line}` }}
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => { setConfirmPassword(e.target.value); setPasswordMsg(""); }}
            />
            <button
              onClick={savePassword}
              disabled={passwordSaving || !newPassword || !confirmPassword}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white shrink-0"
              style={{ background: C.forest, opacity: passwordSaving ? 0.6 : 1 }}
            >
              {passwordSaving ? <RefreshCw size={14} className="animate-spin" /> : "Save"}
            </button>
          </div>
          {passwordMsg && <div className="text-xs mt-1" style={{ color: passwordMsg === "Password updated." ? C.forest : C.danger }}>{passwordMsg}</div>}
        </Field>

        <Field icon={Sparkles} label="Dietary preferences">
          <textarea
            className="w-full px-3 py-2 rounded-lg text-sm resize-none"
            style={{ border: `1px solid ${C.line}`, height: 60 }}
            placeholder="e.g. Kosher, vegetarian, no nuts, low sodium"
            value={prefsDraft}
            onChange={(e) => setPrefsDraft(e.target.value)}
          />
          <button
            onClick={savePrefs}
            className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ border: `1px solid ${C.line}`, color: prefsSaved ? C.forest : C.ink }}
          >
            {prefsSaved ? <><Check size={12} /> Saved</> : "Save preferences"}
          </button>
        </Field>

        <div className="rounded-xl p-3.5" style={{ background: C.paperDark }}>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold uppercase" style={{ color: C.inkSoft, letterSpacing: "0.05em" }}>Plan</div>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>{planLabel}</div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {isPaid ? (
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                style={{ border: `1px solid ${C.line}`, background: C.white, color: C.ink, opacity: portalLoading ? 0.6 : 1 }}
              >
                {portalLoading ? <RefreshCw size={12} className="animate-spin" /> : <CreditCard size={12} />}
                Manage payment method
              </button>
            ) : (
              <button
                onClick={onUpgradeClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: C.forest }}
              >
                View plans
              </button>
            )}
            {isPaid && tier === "basic" && (
              <button
                onClick={onUpgradeClick}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                style={{ background: C.forest }}
              >
                Upgrade to Pro
              </button>
            )}
          </div>
          {portalError && <div className="text-xs mt-2" style={{ color: C.danger }}>{portalError}</div>}
        </div>
      </div>
    </div>
  );
}
