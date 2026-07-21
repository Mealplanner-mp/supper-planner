import React, { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, RefreshCw, Settings as SettingsIcon, Check, BookmarkPlus } from "lucide-react";
import { supabase } from "./supabaseClient";

const C = {
  paper: "#F6F7F4",
  paperDark: "#EAEBE6",
  ink: "#1C1E1B",
  inkSoft: "#63665F",
  forest: "#0F9D63",
  forestDark: "#0A7248",
  line: "#DEE0D8",
  white: "#FFFFFF",
  danger: "#EF4444",
};

export default function FloatingAssistant({ dietaryPreferences, onSaveDietaryPreferences, onRecipeDrafted }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role: "user" | "assistant", content: string, forQuestion?: string }
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsDraft, setPrefsDraft] = useState(dietaryPreferences || "");
  const [draftingIndex, setDraftingIndex] = useState(null);
  const [draftError, setDraftError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    setPrefsDraft(dietaryPreferences || "");
  }, [dietaryPreferences]);

  const savePrefs = () => {
    onSaveDietaryPreferences(prefsDraft.trim());
    setPrefsOpen(false);
  };

  const send = async (textOverride) => {
    const question = (textOverride ?? input).trim();
    if (!question || loading) return;
    setError("");
    setInput("");
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { mode: "ask", question, history, dietaryPreferences },
      });
      if (error) throw new Error(error.message || "Request failed");
      if (data?.error) throw new Error(data.error);
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, forQuestion: question }]);
    } catch (e) {
      console.error("assistant failed:", e);
      setError(e.message || "Something went wrong — try again.");
    } finally {
      setLoading(false);
    }
  };

  const retryLast = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((prev) => prev.slice(0, -1)); // drop the failed user turn, send() re-adds it
    send(lastUser.content);
  };

  const saveAsRecipe = async (index, question) => {
    setDraftError("");
    setDraftingIndex(index);
    try {
      const { data, error } = await supabase.functions.invoke("ai-assistant", {
        body: { mode: "search", query: question },
      });
      if (error) throw new Error(error.message || "Request failed");
      if (data?.error) throw new Error(data.error);
      onRecipeDrafted(data.recipe);
    } catch (e) {
      console.error("save as recipe failed:", e);
      setDraftError(e.message || "Couldn't draft that as a recipe — try again.");
    } finally {
      setDraftingIndex(null);
    }
  };

  return (
    <div className="fixed bottom-5 right-5 z-[60] no-print">
      {open && (
        <div
          className="pop-in mb-3 rounded-2xl flex flex-col overflow-hidden"
          style={{ width: 320, height: 420, background: C.white, border: `1px solid ${C.line}`, boxShadow: "0 4px 16px rgba(46,42,34,0.18)" }}
        >
          <div className="shrink-0 flex items-center justify-between px-4 py-3" style={{ background: C.forestDark }}>
            <span className="text-sm font-semibold text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>
              Ask about cooking
            </span>
            <div className="flex items-center gap-2.5">
              <button onClick={() => setPrefsOpen((o) => !o)} title="Dietary preferences">
                <SettingsIcon size={15} color="#fff" />
              </button>
              <button onClick={() => setOpen(false)}><X size={16} color="#fff" /></button>
            </div>
          </div>

          {prefsOpen ? (
            <div className="flex-1 min-h-0 flex flex-col p-3" style={{ background: C.paper }}>
              <div className="text-xs font-semibold uppercase mb-1" style={{ color: C.forest, letterSpacing: "0.05em" }}>
                Dietary preferences
              </div>
              <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
                Tell the assistant about any diets, allergies, or things to avoid — it'll remember this for every answer until you change it.
              </div>
              <textarea
                className="flex-1 px-3 py-2 rounded-lg text-sm resize-none"
                style={{ border: `1px solid ${C.line}` }}
                placeholder="e.g. Kosher, vegetarian, no nuts, low sodium"
                value={prefsDraft}
                onChange={(e) => setPrefsDraft(e.target.value)}
              />
              <button
                onClick={savePrefs}
                className="w-full mt-2 py-2 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-1.5"
                style={{ background: C.forest }}
              >
                <Check size={14} /> Save preferences
              </button>
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2" style={{ background: C.paper }}>
                {messages.length === 0 && (
                  <div className="text-xs italic text-center mt-6" style={{ color: C.inkSoft }}>
                    Ask things like "what can I make with chicken and rice?" or "give me a recipe for lentil soup"
                    {dietaryPreferences && (
                      <div className="mt-2 not-italic" style={{ color: C.forest }}>
                        Remembering: {dietaryPreferences}
                      </div>
                    )}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={m.role === "user" ? {} : { maxWidth: "85%" }}>
                    <div
                      className="text-sm px-3 py-2 rounded-lg max-w-[85%]"
                      style={
                        m.role === "user"
                          ? { background: C.forest, color: "#fff", marginLeft: "auto" }
                          : { background: C.paperDark, color: C.ink }
                      }
                    >
                      {m.content}
                    </div>
                    {m.role === "assistant" && (
                      <button
                        onClick={() => saveAsRecipe(i, m.forQuestion || m.content)}
                        disabled={draftingIndex === i}
                        className="text-xs flex items-center gap-1 mt-1 font-medium"
                        style={{ color: C.forest, opacity: draftingIndex === i ? 0.6 : 1 }}
                      >
                        {draftingIndex === i ? (
                          <><RefreshCw size={11} className="animate-spin" /> Drafting recipe…</>
                        ) : (
                          <><BookmarkPlus size={12} /> Save as recipe</>
                        )}
                      </button>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: C.inkSoft }}>
                    <RefreshCw size={12} className="animate-spin" /> Thinking…
                  </div>
                )}
                {error && (
                  <div className="text-xs flex items-center gap-2" style={{ color: C.danger }}>
                    <span>{error}</span>
                    <button onClick={retryLast} className="underline font-medium" style={{ color: C.forest }}>
                      Retry
                    </button>
                  </div>
                )}
                {draftError && (
                  <div className="text-xs" style={{ color: C.danger }}>{draftError}</div>
                )}
              </div>

              <div className="shrink-0 flex items-center gap-2 p-2.5" style={{ borderTop: `1px solid ${C.line}` }}>
                <input
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={{ border: `1px solid ${C.line}` }}
                  placeholder="Ask a cooking question…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !loading) { e.preventDefault(); send(); } }}
                />
                <button
                  onClick={() => send()}
                  disabled={loading || !input.trim()}
                  className="p-2 rounded-lg text-white shrink-0"
                  style={{ background: C.forest, opacity: loading || !input.trim() ? 0.6 : 1 }}
                  title="Send"
                >
                  <Send size={16} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full flex items-center justify-center"
        style={{ width: 52, height: 52, background: C.forest, boxShadow: "0 3px 10px rgba(46,42,34,0.25)", marginLeft: "auto" }}
        title="Ask about cooking"
      >
        {open ? <X size={22} color="#fff" /> : <MessageCircle size={22} color="#fff" />}
      </button>
    </div>
  );
}
