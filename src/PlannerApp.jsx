import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Heart, Zap, Snowflake, Lock, ArrowRightLeft, Plus, X, Pencil, Trash2,
  ChevronDown, ChevronRight, Search, RefreshCw, Calendar, ShoppingCart,
  Settings as SettingsIcon, BookOpen, Download, AlertTriangle, Check,
  GripVertical, Clock, Copy, Printer, LogOut, Baby, Sparkles, Upload,
  ImagePlus, PenLine, Link as LinkIcon, MessageCircle, Send, Eye,
  User
} from "lucide-react";
import { supabase } from "./supabaseClient";
import Logo, { BRAND } from "./Logo.jsx";
import FloatingAssistant from "./FloatingAssistant.jsx";
import Pricing from "./Pricing.jsx";
import WelcomeGuide from "./WelcomeGuide.jsx";
import Account from "./Account.jsx";

/* ---------------------------------------------------------------------- */
/* Design tokens (see inline <style> below for fonts + card texture)      */
/* ---------------------------------------------------------------------- */
const C = {
  paper: "#F6F7F4",
  paperDark: "#EAEBE6",
  ink: "#1C1E1B",
  inkSoft: "#63665F",
  forest: "#0F9D63",
  forestDark: "#0A7248",
  rust: "#F0562F",
  dustyBlue: "#2F8FE0",
  olive: "#84C126",
  teal: "#0FBFB0",
  mustard: "#F5A623",
  plum: "#D6478B",
  line: "#DEE0D8",
  white: "#FFFFFF",
  danger: "#EF4444",
};

// distinct, saturated accent per meal component — used to color-code the recipe box and planner
const TYPE_COLORS = {
  protein: "#0A5C3A",
  starch: "#0D7A4B",
  veg: "#0F9D63",
  soup: "#1BB873",
  dessert: "#3FD08D",
  combo: "#073F28",
};

const CATEGORY_COLORS = {
  meat: C.rust,
  dairy: C.dustyBlue,
  parve: C.olive,
  fish: C.teal,
};

const TYPE_OPTIONS = ["protein", "starch", "veg", "soup", "dessert", "combo"];
const CATEGORY_OPTIONS = ["meat", "dairy", "parve", "fish"];
const SIMPLICITY_OPTIONS = [
  { key: "crockpot", label: "Crock pot" },
  { key: "under20", label: "Under 20 min" },
  { key: "under30", label: "Under 30 min" },
  { key: "onepot", label: "One pot" },
];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const COMPONENT_OPTIONS = ["protein", "starch", "veg", "soup", "dessert"];
const UNIT_OPTIONS = ["g", "kg", "ml", "l", "tsp", "tbsp", "cup", "fl oz", "oz", "lb", "pinch", "unit", "bunch", "can", "package"];
const INGREDIENT_CATEGORIES = ["Produce", "Meat", "Fish", "Dairy", "Bakery", "Grocery", "Frozen", "Beverages", "Spices & Condiments", "Other"];
const REPEAT_OPTIONS = [
  { key: "none", label: "No preference" },
  { key: "weekly", label: "Weekly" },
  { key: "biweekly", label: "Biweekly" },
  { key: "monthly", label: "Monthly" },
];
const REPEAT_WEEKS = { none: Infinity, weekly: 1, biweekly: 2, monthly: 4 };

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const isoWeek = (d = new Date()) => {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setDate(dt.getDate() - day);
  return dt.toISOString().slice(0, 10);
};

const DEFAULT_SETTINGS = {
  noMeatDairyMix: true,
  dailyComposition: ["protein", "starch", "veg"],
  repetition: { regular: "none", easy: "weekly", favorite: "none" },
  prioritizeFavorite: true,
  prioritizeEasy: false,
  pantryStaples: ["salt", "pepper", "olive oil", "sugar", "flour"],
  freezer: { day: "Sunday", frequency: "biweekly" },
  weeklyDayRules: DAYS.reduce((acc, d) => ({ ...acc, [d]: { category: "", simplicity: "" } }), {}),
  ingredientCategories: [...INGREDIENT_CATEGORIES],
  babyFriendly: { enabled: false, mode: "separate", components: [] }, // mode: "separate" | "components"
};

const emptyRecipe = () => ({
  id: uid(),
  name: "",
  type: "protein",
  comboTypes: [],
  category: "meat",
  favorite: false,
  easy: false,
  freezer: false,
  freezerServings: 4,
  freezerPrepMode: "withMeal", // "withMeal" | "separate"
  simplicity: [],
  lockedDay: "",
  createsLeftovers: false,
  usesLeftoverFrom: "",
  babyFriendly: false,
  ingredients: [],
  notes: "",
  prepReminders: "",
});

function recipeFromAIDraft(parsed) {
  const base = emptyRecipe();
  return {
    ...base,
    name: parsed.name || base.name,
    type: TYPE_OPTIONS.includes(parsed.type) ? parsed.type : base.type,
    comboTypes: Array.isArray(parsed.comboTypes) ? parsed.comboTypes.filter((c) => COMPONENT_OPTIONS.includes(c)) : base.comboTypes,
    category: CATEGORY_OPTIONS.includes(parsed.category) ? parsed.category : base.category,
    simplicity: Array.isArray(parsed.simplicity) ? parsed.simplicity.filter((s) => SIMPLICITY_OPTIONS.some((o) => o.key === s)) : base.simplicity,
    ingredients: Array.isArray(parsed.ingredients)
      ? parsed.ingredients.map((i) => ({ id: uid(), name: i.name || "", amount: i.amount ?? "", unit: i.unit || "unit", category: i.category || "" }))
      : base.ingredients,
    notes: parsed.notes || base.notes,
    prepReminders: parsed.prepReminders || base.prepReminders,
  };
}

/* ---------------------------------------------------------------------- */
/* AI helpers — all calls go through the ai-assistant Supabase Edge       */
/* Function, which holds the Anthropic API key server-side.               */
/* ---------------------------------------------------------------------- */
const RETRYABLE_ERROR_HINTS = ["overloaded", "rate_limit", "429", "529", "503", "timeout", "network"];

function isRetryableError(err) {
  const msg = (err?.message || "").toLowerCase();
  return RETRYABLE_ERROR_HINTS.some((hint) => msg.includes(hint));
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function callAIOnce(payload) {
  const { data, error } = await supabase.functions.invoke("ai-assistant", { body: payload });
  if (error) throw new Error(error.message || "Request failed — check your connection and try again.");
  if (data?.error) throw new Error(data.error);
  return data;
}

async function callAI(payload, onRetry) {
  const maxAttempts = 5;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callAIOnce(payload);
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts && isRetryableError(e)) {
        if (onRetry) onRetry(attempt, maxAttempts);
        const jitter = Math.random() * 400;
        await sleep(Math.min(attempt * 900 + jitter, 6000));
        continue;
      }
      break;
    }
  }
  if (isRetryableError(lastErr)) {
    const busyErr = new Error("The AI is busy right now — this is common for a shared service at peak times. Tap Retry to try again.");
    busyErr.retryable = true;
    throw busyErr;
  }
  throw lastErr;
}

/* ---------------------------------------------------------------------- */
/* Storage helpers (Supabase — one row per user in planner_data)          */
/* ---------------------------------------------------------------------- */
const FIELD_COLUMNS = {
  recipes: "recipes",
  settings: "settings",
  plan: "plan",
  usageHistory: "usage_history",
  freezerStock: "freezer_stock",
  groceryChecked: "grocery_checked",
};

async function loadPlannerRow(userId) {
  const { data, error } = await supabase
    .from("planner_data")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error) {
    console.error("load failed", error);
    return null;
  }
  return data;
}

async function saveField(userId, key, value) {
  try {
    const { error } = await supabase
      .from("planner_data")
      .update({ [FIELD_COLUMNS[key]]: value, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (error) throw error;
  } catch (e) {
    console.error("save failed", key, e);
  }
}

/* ---------------------------------------------------------------------- */
/* Small UI atoms                                                         */
/* ---------------------------------------------------------------------- */
function SavePulse({ show }) {
  return (
    <span
      style={{
        opacity: show ? 1 : 0,
        transform: show ? "scale(1)" : "scale(0.9)",
        transition: "opacity .35s ease, transform .35s ease",
        color: C.forest,
        fontFamily: "'Inter', sans-serif",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontSize: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginLeft: 8,
        background: "rgba(63,91,69,0.1)",
        padding: "3px 8px",
        borderRadius: 999,
      }}
    >
      <Check size={13} /> saved
    </span>
  );
}

function Tab({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className="tab-btn flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-semibold uppercase transition-all"
      style={{
        fontFamily: "'Inter', sans-serif",
        letterSpacing: "0.05em",
        background: active ? C.paper : "transparent",
        color: active ? C.forestDark : C.inkSoft,
        borderBottom: active ? `3px solid ${C.forest}` : "3px solid transparent",
      }}
    >
      <Icon size={15} />
      {children}
    </button>
  );
}

function Chip({ active, onClick, children, color }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase border transition-colors"
      style={{
        fontFamily: "'Inter', sans-serif",
        letterSpacing: "0.05em",
        background: active ? (color || C.forest) : "transparent",
        borderColor: active ? (color || C.forest) : C.line,
        color: active ? "#fff" : C.inkSoft,
      }}
    >
      {children}
    </button>
  );
}

function Card({ children, style }) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: C.white, border: `1px solid ${C.line}`, boxShadow: "0 1px 2px rgba(46,42,34,0.05)", ...style }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div
      className="uppercase text-xs font-semibold mb-1"
      style={{ fontFamily: "'Inter', sans-serif", color: C.forest, letterSpacing: "0.08em" }}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Undo toast — used for delete-with-undo patterns                        */
/* ---------------------------------------------------------------------- */
const UNDO_WINDOW_MS = 5000;

function UndoToast({ message, onUndo, onExpire }) {
  useEffect(() => {
    const t = setTimeout(onExpire, UNDO_WINDOW_MS);
    return () => clearTimeout(t);
  }, [onExpire]);

  return (
    <div
      className="slide-up fixed bottom-5 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg no-print"
      style={{ background: C.forestDark, color: "#fff" }}
    >
      <span className="text-sm">{message}</span>
      <button
        onClick={onUndo}
        className="text-sm font-semibold underline underline-offset-2"
        style={{ color: C.mustard }}
      >
        Undo
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Confirm delete modal                                                   */
/* ---------------------------------------------------------------------- */
function ConfirmModal({ title, body, confirmLabel = "Delete", onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" style={{ background: "rgba(46,42,34,0.55)" }} onClick={onCancel}>
      <div className="pop-in rounded-2xl w-full max-w-sm p-5" style={{ background: C.paper, border: `1px solid ${C.line}` }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 17, color: C.ink }} className="mb-1.5">{title}</h3>
        <p className="text-sm mb-4" style={{ color: C.inkSoft }}>{body}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}>Cancel</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: C.danger }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Recipe Card (index-card visual signature)                              */
/* ---------------------------------------------------------------------- */
function RecipeIndexCard({ recipe, onEdit, onDelete, onDuplicate, onToggle, babyFriendlyEnabled, dragHandleProps }) {
  const tabColor = CATEGORY_COLORS[recipe.category] || C.forest;
  return (
    <div
      className="card-hover rounded-lg mb-3 cursor-pointer group"
      style={{
        background: C.white,
        border: `1px solid ${C.line}`,
        boxShadow: "2px 3px 0 rgba(46,42,34,0.08)",
      }}
      onClick={() => onEdit(recipe)}
    >
      <div className="flex items-center justify-between px-3 pt-2.5">
        <span
          className="px-2 py-0.5 rounded-sm text-[10px] font-semibold text-white uppercase"
          style={{ background: tabColor, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}
        >
          {recipe.category}
        </span>
      </div>
      <div className="p-3 pt-1.5">
        <div className="flex items-start justify-between gap-2">
          <h4
            className="font-semibold leading-snug"
            style={{ fontFamily: "'Poppins', sans-serif", color: C.ink, fontSize: 15 }}
          >
            {recipe.name || "Untitled recipe"}
          </h4>
          <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => onToggle(recipe.id, "favorite")} title="Favorite">
              <Heart size={15} fill={recipe.favorite ? C.mustard : "none"} color={recipe.favorite ? C.mustard : C.inkSoft} />
            </button>
            <button onClick={() => onToggle(recipe.id, "easy")} title="Easy">
              <Zap size={15} fill={recipe.easy ? C.forest : "none"} color={recipe.easy ? C.forest : C.inkSoft} />
            </button>
            <button onClick={() => onToggle(recipe.id, "freezer")} title="Freezer meal">
              <Snowflake size={15} color={recipe.freezer ? C.dustyBlue : C.inkSoft} />
            </button>
            {babyFriendlyEnabled && (
              <button onClick={() => onToggle(recipe.id, "babyFriendly")} title="Baby friendly">
                <Baby size={15} color={recipe.babyFriendly ? C.plum : C.inkSoft} />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mt-2">
          {recipe.type === "combo" && recipe.comboTypes.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold" style={{ background: C.paperDark, color: C.inkSoft, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>{t}</span>
          ))}
          {recipe.simplicity.map((s) => (
            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold" style={{ background: C.paperDark, color: C.inkSoft, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>
              {SIMPLICITY_OPTIONS.find((o) => o.key === s)?.label}
            </span>
          ))}
          {recipe.lockedDay && (
            <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase font-semibold" style={{ background: "#FCE4DC", color: C.rust, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>
              <Lock size={9} /> {recipe.lockedDay.slice(0, 3)}
            </span>
          )}
          {(recipe.createsLeftovers || recipe.usesLeftoverFrom) && (
            <span className="text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 uppercase font-semibold" style={{ background: "#E1F5EA", color: C.forest, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>
              <ArrowRightLeft size={9} /> {recipe.createsLeftovers ? "leftovers" : "uses lo"}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: `1px dashed ${C.line}` }}>
          <span className="text-[11px]" style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
            {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2.5">
            <button onClick={(e) => { e.stopPropagation(); onDuplicate(recipe.id); }} title="Duplicate recipe">
              <Copy size={13} color={C.inkSoft} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(recipe.id); }} title="Delete recipe">
              <Trash2 size={13} color={C.danger} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Recipe Editor Modal                                                    */
/* ---------------------------------------------------------------------- */
function RecipeEditor({ recipe, recipes, categoryMemory, ingredientCategories, babyFriendlyEnabled, onSave, onClose, initialAIGenerated }) {
  const [r, setR] = useState(recipe);
  const [ingredientCatFocus, setIngredientCatFocus] = useState(null);
  const [nameError, setNameError] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDraftMsg, setAiDraftMsg] = useState("");
  const [aiDraftFailed, setAiDraftFailed] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(!!initialAIGenerated);

  const set = (patch) => setR((prev) => ({ ...prev, ...patch }));

  const addIngredient = () => set({ ingredients: [...r.ingredients, { id: uid(), name: "", amount: "", unit: "unit", category: "" }] });
  const updateIngredient = (id, patch) => set({ ingredients: r.ingredients.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const removeIngredient = (id) => set({ ingredients: r.ingredients.filter((i) => i.id !== id) });

  const leftoverSources = recipes.filter((x) => x.createsLeftovers && x.id !== r.id);
  const baseCategories = ingredientCategories && ingredientCategories.length ? ingredientCategories : INGREDIENT_CATEGORIES;
  const allIngredientCategories = useMemo(() => {
    const extra = categoryMemory.filter((c) => !baseCategories.some((std) => std.toLowerCase() === c.toLowerCase()));
    return [...baseCategories, ...extra];
  }, [categoryMemory, baseCategories]);

  const toggleCombo = (t) => {
    const has = r.comboTypes.includes(t);
    set({ comboTypes: has ? r.comboTypes.filter((x) => x !== t) : [...r.comboTypes, t] });
  };
  const toggleSimplicity = (k) => {
    const has = r.simplicity.includes(k);
    set({ simplicity: has ? r.simplicity.filter((x) => x !== k) : [...r.simplicity, k] });
  };

  const runAISearch = async () => {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiDraftMsg("");
    setAiDraftFailed(false);
    try {
      const data = await callAI(
        { mode: "search", query: aiQuery },
        (attempt, max) => setAiDraftMsg(`Kitchen's busy — trying again (${attempt}/${max - 1})…`)
      );
      const parsed = data.recipe;
      set({
        name: parsed.name || r.name,
        type: TYPE_OPTIONS.includes(parsed.type) ? parsed.type : r.type,
        comboTypes: Array.isArray(parsed.comboTypes) ? parsed.comboTypes.filter((c) => COMPONENT_OPTIONS.includes(c)) : r.comboTypes,
        category: CATEGORY_OPTIONS.includes(parsed.category) ? parsed.category : r.category,
        simplicity: Array.isArray(parsed.simplicity) ? parsed.simplicity.filter((s) => SIMPLICITY_OPTIONS.some((o) => o.key === s)) : r.simplicity,
        ingredients: Array.isArray(parsed.ingredients)
          ? parsed.ingredients.map((i) => ({ id: uid(), name: i.name || "", amount: i.amount ?? "", unit: i.unit || "unit", category: i.category || "" }))
          : r.ingredients,
        notes: parsed.notes || r.notes,
        prepReminders: parsed.prepReminders || r.prepReminders,
      });
      setAiDraftMsg("Draft filled in below — review and adjust, then save.");
      setAiGenerated(true);
    } catch (e) {
      console.error("AI recipe search failed:", e);
      setAiDraftMsg(e.message);
      setAiDraftFailed(true);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 py-8 overflow-y-auto" style={{ background: "rgba(46,42,34,0.55)" }} onClick={onClose}>
      <div
        className="pop-in rounded-2xl w-full max-w-3xl my-auto flex flex-col overflow-hidden md:h-[min(78vh,600px)]"
        style={{ background: C.paper, border: `1px solid ${C.line}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center justify-between px-4 py-3" style={{ background: C.paper, borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 18, color: C.ink }}>
            {recipe.name ? "Edit recipe" : "New recipe"}
          </h3>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>

        {aiGenerated && (
          <div className="shrink-0 mx-4 mt-2 px-3 py-1.5 rounded-lg flex items-start gap-2" style={{ background: "#FDECE6", border: `1px solid ${C.rust}` }}>
            <AlertTriangle size={13} color={C.rust} style={{ marginTop: 1, flexShrink: 0 }} />
            <span className="text-xs" style={{ color: C.ink }}>
              This card was filled in by AI. Please review before saving — AI can make mistakes.
            </span>
          </div>
        )}

        {!recipe.name && !initialAIGenerated && (
          <div className="shrink-0 px-4 pt-2">
            <Card style={{ background: "#EEF1EC" }}>
              <SectionLabel>AI recipe search</SectionLabel>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-3 py-2 rounded-lg text-sm"
                  style={{ border: `1px solid ${C.line}`, background: C.white }}
                  placeholder='e.g. "spicy salmon" or "a drink recipe with dates"'
                  value={aiQuery}
                  onChange={(e) => setAiQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !aiLoading) { e.preventDefault(); runAISearch(); } }}
                />
                <button
                  onClick={runAISearch}
                  disabled={aiLoading}
                  className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 text-white"
                  style={{ background: C.forest }}
                >
                  {aiLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Draft it
                </button>
              </div>
              {aiDraftMsg && (
                <div className="text-xs mt-2 flex items-center gap-2" style={{ color: aiDraftFailed ? C.danger : C.forest }}>
                  <span>{aiDraftMsg}</span>
                  {aiDraftFailed && (
                    <button onClick={runAISearch} className="underline font-medium" style={{ color: C.forest }}>
                      Retry
                    </button>
                  )}
                </div>
              )}
            </Card>
          </div>
        )}

        <div className="flex-1 min-h-0 p-4 overflow-y-auto md:overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:h-full">
            {/* Left column: everything except ingredients — sized to fit without scrolling */}
            <div className="space-y-3 md:overflow-y-auto md:pr-1 md:min-h-0">
              <div>
                <SectionLabel>Name</SectionLabel>
                <input
                  className="w-full px-3 py-1.5 rounded-lg text-sm"
                  style={{ border: `1px solid ${nameError ? C.danger : C.line}`, background: C.white, fontFamily: "'Poppins', sans-serif", fontSize: 15 }}
                  placeholder="Recipe name"
                  value={r.name}
                  onChange={(e) => { set({ name: e.target.value }); if (nameError) setNameError(false); }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SectionLabel>Type</SectionLabel>
                  <select className="w-full px-2 py-1.5 rounded-lg text-sm" style={{ border: `1px solid ${C.line}`, background: C.white }} value={r.type} onChange={(e) => set({ type: e.target.value, comboTypes: e.target.value === "combo" ? r.comboTypes : [] })}>
                    {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {r.type === "combo" && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {COMPONENT_OPTIONS.map((t) => (
                        <Chip key={t} active={r.comboTypes.includes(t)} onClick={() => toggleCombo(t)}>{t}</Chip>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <SectionLabel>Category</SectionLabel>
                  <select className="w-full px-2 py-1.5 rounded-lg text-sm" style={{ border: `1px solid ${C.line}`, background: C.white }} value={r.category} onChange={(e) => set({ category: e.target.value })}>
                    {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <SectionLabel>Tags</SectionLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => set({ favorite: !r.favorite })} className="flex items-center gap-1.5 text-sm">
                    <Heart size={16} fill={r.favorite ? C.mustard : "none"} color={r.favorite ? C.mustard : C.inkSoft} /> Favorite
                  </button>
                  <button onClick={() => set({ easy: !r.easy })} className="flex items-center gap-1.5 text-sm">
                    <Zap size={16} fill={r.easy ? C.forest : "none"} color={r.easy ? C.forest : C.inkSoft} /> Easy
                  </button>
                  <button onClick={() => set({ freezer: !r.freezer })} className="flex items-center gap-1.5 text-sm">
                    <Snowflake size={16} color={r.freezer ? C.dustyBlue : C.inkSoft} /> Freezer
                  </button>
                  {babyFriendlyEnabled && (
                    <button onClick={() => set({ babyFriendly: !r.babyFriendly })} className="flex items-center gap-1.5 text-sm">
                      <Baby size={16} color={r.babyFriendly ? C.plum : C.inkSoft} /> Baby friendly
                    </button>
                  )}
                </div>
                {r.freezer && (
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <select className="px-2 py-1 rounded text-xs" style={{ border: `1px solid ${C.line}` }} value={r.freezerServings} onChange={(e) => set({ freezerServings: Number(e.target.value) })}>
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} suppers</option>)}
                    </select>
                    <select className="px-2 py-1 rounded text-xs" style={{ border: `1px solid ${C.line}` }} value={r.freezerPrepMode} onChange={(e) => set({ freezerPrepMode: e.target.value })}>
                      <option value="withMeal">Prep is part of that day's meal</option>
                      <option value="separate">Prep is a separate task</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <SectionLabel>Simplicity</SectionLabel>
                <div className="flex flex-wrap gap-1.5">
                  {SIMPLICITY_OPTIONS.map((o) => (
                    <Chip key={o.key} active={r.simplicity.includes(o.key)} onClick={() => toggleSimplicity(o.key)} color={C.forest}>{o.label}</Chip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SectionLabel>Lock to a day</SectionLabel>
                  <select className="w-full px-2 py-1.5 rounded-lg text-sm" style={{ border: `1px solid ${C.line}`, background: C.white }} value={r.lockedDay} onChange={(e) => set({ lockedDay: e.target.value })}>
                    <option value="">Not locked</option>
                    {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <SectionLabel>Leftovers</SectionLabel>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={r.createsLeftovers} onChange={(e) => set({ createsLeftovers: e.target.checked, usesLeftoverFrom: e.target.checked ? "" : r.usesLeftoverFrom })} />
                      Creates leftovers
                    </label>
                    <label className="flex items-center gap-1.5 text-xs">
                      <input type="checkbox" checked={!!r.usesLeftoverFrom || (r.usesLeftoverFrom === "" && false)} onChange={(e) => set({ usesLeftoverFrom: e.target.checked ? (leftoverSources[0]?.id || "pending") : "", createsLeftovers: e.target.checked ? false : r.createsLeftovers })} />
                      Uses leftovers
                    </label>
                    {r.usesLeftoverFrom !== "" && (
                      <select className="px-2 py-1.5 rounded text-xs" style={{ border: `1px solid ${C.line}` }} value={r.usesLeftoverFrom} onChange={(e) => set({ usesLeftoverFrom: e.target.value })}>
                        <option value="pending">Select recipe…</option>
                        {leftoverSources.map((s) => <option key={s.id} value={s.id}>{s.name || "Untitled"}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: ingredients (self-scrolling) + notes */}
            <div className="flex flex-col gap-3 md:h-full md:min-h-0">
              <div className="flex flex-col flex-1 md:min-h-0">
                <div className="flex items-center justify-between mb-1 shrink-0">
                  <SectionLabel>Ingredients</SectionLabel>
                  <button onClick={addIngredient} className="text-xs flex items-center gap-1 px-2 py-1 rounded" style={{ color: C.forest, fontFamily: "'JetBrains Mono', monospace" }}>
                    <Plus size={13} /> Add row
                  </button>
                </div>
                <div className="flex-1 md:min-h-0 md:overflow-y-auto space-y-1.5 pr-1" style={{ minHeight: 80 }}>
                  {r.ingredients.map((ing) => (
                    <div key={ing.id} className="flex flex-wrap gap-1.5 items-center pb-1.5" style={{ borderBottom: `1px dashed ${C.line}` }}>
                      <input className="flex-1 min-w-[110px] px-2 py-1.5 rounded text-sm" style={{ border: `1px solid ${C.line}`, background: C.white }} placeholder="Ingredient" value={ing.name} onChange={(e) => updateIngredient(ing.id, { name: e.target.value })} />
                      <input className="w-14 px-2 py-1.5 rounded text-sm" style={{ border: `1px solid ${C.line}`, background: C.white }} placeholder="Amt" value={ing.amount} onChange={(e) => updateIngredient(ing.id, { amount: e.target.value })} />
                      <select className="w-[74px] px-1 py-1.5 rounded text-sm" style={{ border: `1px solid ${C.line}`, background: C.white }} value={ing.unit} onChange={(e) => updateIngredient(ing.id, { unit: e.target.value })}>
                        {UNIT_OPTIONS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                      <select
                        className="flex-1 min-w-[100px] px-2 py-1.5 rounded text-sm"
                        style={{ border: `1px solid ${C.line}`, background: C.white }}
                        value={ing.category}
                        onChange={(e) => updateIngredient(ing.id, { category: e.target.value })}
                      >
                        <option value="">Category…</option>
                        {allIngredientCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={() => removeIngredient(ing.id)}><X size={14} color={C.danger} /></button>
                    </div>
                  ))}
                  {r.ingredients.length === 0 && <div className="text-xs italic" style={{ color: C.inkSoft }}>No ingredients yet.</div>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 shrink-0">
                <div>
                  <SectionLabel>Notes</SectionLabel>
                  <textarea className="w-full px-2 py-1.5 rounded-lg text-xs h-14" style={{ border: `1px solid ${C.line}`, background: C.white }} value={r.notes} onChange={(e) => set({ notes: e.target.value })} />
                </div>
                <div>
                  <SectionLabel>Prep reminders</SectionLabel>
                  <textarea className="w-full px-2 py-1.5 rounded-lg text-xs h-14" style={{ border: `1px solid ${C.line}`, background: C.white }} placeholder="e.g. marinate the night before" value={r.prepReminders} onChange={(e) => set({ prepReminders: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-4 py-3 flex-wrap" style={{ background: C.paper, borderTop: `1px solid ${C.line}` }}>
          {nameError && <span className="text-xs mr-auto" style={{ color: C.danger }}>Give the recipe a name before saving.</span>}
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}>Cancel</button>
          <button
            onClick={() => { if (r.name.trim()) { onSave(r); } else { setNameError(true); } }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: C.forest }}
          >
            Save recipe
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Baby-friendly list modal — check recipes on/off the baby-friendly list */
/* ---------------------------------------------------------------------- */
function BabyFriendlyListModal({ recipes, setRecipes, onClose }) {
  const [query, setQuery] = useState("");
  const babyCount = recipes.filter((r) => r.babyFriendly).length;
  const filtered = recipes.filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()));
  const toggle = (id) => setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, babyFriendly: !r.babyFriendly } : r)));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 py-8 overflow-y-auto" style={{ background: "rgba(46,42,34,0.55)" }} onClick={onClose}>
      <div className="pop-in rounded-2xl w-full max-w-md my-auto p-5" style={{ background: C.paper, border: `1px solid ${C.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 18, color: C.ink }}>Baby-friendly recipes</h3>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>
        <input
          className="w-full px-3 py-2 rounded-lg text-sm mb-3"
          style={{ border: `1px solid ${C.line}`, background: C.white }}
          placeholder="Search recipes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-80 overflow-y-auto space-y-1">
          {filtered.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer"
              style={{ background: r.babyFriendly ? "#FCE9F2" : "transparent" }}
            >
              <input type="checkbox" checked={!!r.babyFriendly} onChange={() => toggle(r.id)} />
              <span style={{ color: C.ink }}>{r.name || "Untitled recipe"}</span>
            </label>
          ))}
          {filtered.length === 0 && <div className="text-xs italic text-center py-4" style={{ color: C.inkSoft }}>No recipes match.</div>}
        </div>
        <div className="text-xs mt-3" style={{ color: C.inkSoft }}>
          {babyCount} recipe{babyCount !== 1 ? "s" : ""} marked baby-friendly.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* New recipe: choose manual vs upload                                    */
/* ---------------------------------------------------------------------- */
function NewRecipeChooser({ onManual, onUpload, onClose, uploadLocked }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 py-8 overflow-y-auto" style={{ background: "rgba(46,42,34,0.55)" }} onClick={onClose}>
      <div className="pop-in rounded-2xl w-full max-w-sm p-5 my-auto" style={{ background: C.paper, border: `1px solid ${C.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 18, color: C.ink }}>Add a recipe</h3>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onManual} className="flex flex-col items-center gap-2 py-6 rounded-xl transition-colors" style={{ background: C.white, border: `1px solid ${C.line}` }}>
            <PenLine size={22} color={C.forest} />
            <span className="text-sm font-medium" style={{ color: C.ink }}>Add manually</span>
          </button>
          <button onClick={onUpload} className="relative flex flex-col items-center gap-2 py-6 rounded-xl transition-colors" style={{ background: C.white, border: `1px solid ${C.line}` }}>
            {uploadLocked && (
              <span
                className="absolute top-1.5 right-1.5 text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded-full text-white"
                style={{ background: C.forest, letterSpacing: "0.04em" }}
              >
                Pro
              </span>
            )}
            <Upload size={22} color={C.forest} />
            <span className="text-sm font-medium" style={{ color: C.ink }}>Upload photo / link</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadRecipeModal({ onDraft, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorFailed, setErrorFailed] = useState(false);

  const handleFile = (f) => {
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(f);
  };

  const generate = async () => {
    if (!file && !link.trim()) { setError("Add a photo or paste a link first."); setErrorFailed(true); return; }
    setLoading(true);
    setError("");
    setErrorFailed(false);
    try {
      const payload = file
        ? { mode: "upload", image: { mediaType: file.type || "image/jpeg", data: preview.split(",")[1] } }
        : { mode: "upload", link };
      const data = await callAI(payload, (attempt, max) => setError(`Kitchen's busy — trying again (${attempt}/${max - 1})…`));
      onDraft(data.recipe);
    } catch (e) {
      console.error("AI recipe upload failed:", e);
      setError(e.message);
      setErrorFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 py-8 overflow-y-auto" style={{ background: "rgba(46,42,34,0.55)" }} onClick={onClose}>
      <div className="pop-in rounded-2xl w-full max-w-md p-5 my-auto" style={{ background: C.paper, border: `1px solid ${C.line}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 18, color: C.ink }}>Upload a recipe</h3>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>

        <SectionLabel>Photo of a recipe</SectionLabel>
        <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg p-4 mb-4 cursor-pointer text-center" style={{ border: `1.5px dashed ${C.line}`, background: C.white, minHeight: 96 }}>
          {preview ? (
            <img src={preview} alt="preview" className="max-h-28 rounded" />
          ) : (
            <>
              <ImagePlus size={22} color={C.inkSoft} />
              <span className="text-xs" style={{ color: C.inkSoft }}>Tap to choose a photo</span>
            </>
          )}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && handleFile(e.target.files[0])} />
        </label>

        <SectionLabel>Or paste a link</SectionLabel>
        <div className="relative mb-4">
          <LinkIcon size={14} className="absolute left-2.5 top-2.5" color={C.inkSoft} />
          <input
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm"
            style={{ border: `1px solid ${C.line}`, background: C.white }}
            placeholder="https://…"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            disabled={!!file}
            onKeyDown={(e) => { if (e.key === "Enter" && !loading) { e.preventDefault(); generate(); } }}
          />
        </div>

        {error && (
          <div className="text-xs mb-3 flex items-center gap-2" style={{ color: errorFailed ? C.danger : C.forest }}>
            <span>{error}</span>
            {errorFailed && (file || link.trim()) && (
              <button onClick={generate} className="underline font-medium" style={{ color: C.forest }}>
                Retry
              </button>
            )}
          </div>
        )}

        <button
          onClick={generate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white"
          style={{ background: C.forest, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? "Reading recipe…" : "Generate draft"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Recipes Tab                                                            */
/* ---------------------------------------------------------------------- */
function RecipesTab({ recipes, setRecipes, categoryMemory, ingredientCategories, babyFriendlyEnabled, canUpload, onUpgradeClick }) {
  const [editing, setEditing] = useState(null);
  const [editingAIGenerated, setEditingAIGenerated] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [pendingUndo, setPendingUndo] = useState(null); // { recipe, index }
  const [expanded, setExpanded] = useState({}); // mobile accordion: type -> bool
  const [babyListOpen, setBabyListOpen] = useState(false);

  const toggleExpanded = (t) => setExpanded((prev) => ({ ...prev, [t]: !prev[t] }));

  const byType = useMemo(() => {
    const groups = {};
    TYPE_OPTIONS.forEach((t) => (groups[t] = []));
    recipes
      .filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()))
      .forEach((r) => groups[r.type]?.push(r));
    return groups;
  }, [recipes, query]);

  const save = (r) => {
    setRecipes((prev) => {
      const exists = prev.some((x) => x.id === r.id);
      return exists ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r];
    });
    setEditing(null);
    setEditingAIGenerated(false);
  };

  const requestDelete = (id) => setConfirmDeleteId(id);

  const confirmDelete = () => {
    setRecipes((prev) => {
      const index = prev.findIndex((r) => r.id === confirmDeleteId);
      if (index === -1) return prev;
      setPendingUndo({ recipe: prev[index], index });
      return prev.filter((r) => r.id !== confirmDeleteId);
    });
    setConfirmDeleteId(null);
  };

  const undoDelete = () => {
    if (!pendingUndo) return;
    setRecipes((prev) => {
      const next = [...prev];
      next.splice(Math.min(pendingUndo.index, next.length), 0, pendingUndo.recipe);
      return next;
    });
    setPendingUndo(null);
  };

  const duplicateRecipe = (id) => {
    setRecipes((prev) => {
      const index = prev.findIndex((r) => r.id === id);
      if (index === -1) return prev;
      const copy = { ...prev[index], id: uid(), name: `${prev[index].name} (copy)`, lockedDay: "", ingredients: prev[index].ingredients.map((i) => ({ ...i, id: uid() })) };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  };

  const toggle = (id, field) => setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: !r[field] } : r)));

  const openManual = () => {
    setChooserOpen(false);
    setEditingAIGenerated(false);
    setEditing(emptyRecipe());
  };
  const openUpload = () => {
    setChooserOpen(false);
    if (!canUpload) { onUpgradeClick(); return; }
    setUploadOpen(true);
  };
  const handleUploadDraft = (parsed) => {
    setUploadOpen(false);
    setEditingAIGenerated(true);
    setEditing(recipeFromAIDraft(parsed));
  };
  const openEdit = (r) => {
    setEditingAIGenerated(false);
    setEditing(r);
  };

  const deletingRecipe = recipes.find((r) => r.id === confirmDeleteId);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5" color={C.inkSoft} />
          <input
            className="pl-8 pr-3 py-2 rounded-lg text-sm w-full sm:w-64"
            style={{ border: `1px solid ${C.line}`, background: C.white }}
            placeholder="Search recipes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {babyFriendlyEnabled && (
            <button
              onClick={() => setBabyListOpen(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ border: `1px solid ${C.plum}`, color: C.plum }}
            >
              <Baby size={15} /> Baby-friendly list
            </button>
          )}
          <button
            onClick={() => setChooserOpen(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: C.forest }}
          >
            <Plus size={15} /> New recipe
          </button>
        </div>
      </div>

      {/* Desktop / tablet: categories aligned horizontally */}
      <div className="hidden md:grid md:grid-cols-6 gap-3">
        {TYPE_OPTIONS.map((t) => (
          <div key={t} className="rounded-xl" style={{ background: C.paperDark, border: `1px solid ${C.line}` }}>
            <div className="px-3 py-2 rounded-t-xl flex items-center justify-between" style={{ background: C.forestDark }}>
              <span className="text-xs font-semibold uppercase text-white" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>{t}</span>
              <span className="text-[10px] text-white opacity-70">{byType[t].length}</span>
            </div>
            <div className="p-2.5 pb-5 overflow-y-auto" style={{ maxHeight: "70vh" }}>
              {byType[t].map((r) => (
                <RecipeIndexCard key={r.id} recipe={r} onEdit={openEdit} onDelete={requestDelete} onDuplicate={duplicateRecipe} onToggle={toggle} babyFriendlyEnabled={babyFriendlyEnabled} />
              ))}
              {byType[t].length === 0 && <div className="text-xs italic text-center py-6" style={{ color: C.inkSoft }}>No recipes</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile: collapsible accordion per category, all shown upfront */}
      <div className="md:hidden space-y-2">
        {TYPE_OPTIONS.map((t) => {
          const isOpen = !!expanded[t];
          return (
            <div key={t} className="rounded-xl overflow-hidden" style={{ background: C.paperDark, border: `1px solid ${C.line}` }}>
              <button
                onClick={() => toggleExpanded(t)}
                className="w-full px-3 py-2.5 flex items-center justify-between"
                style={{ background: C.forestDark }}
              >
                <span className="text-xs font-semibold uppercase text-white" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>{t}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] text-white opacity-70">{byType[t].length}</span>
                  {isOpen ? <ChevronDown size={15} color="#fff" /> : <ChevronRight size={15} color="#fff" />}
                </span>
              </button>
              {isOpen && (
                <div className="p-2.5">
                  {byType[t].map((r) => (
                    <RecipeIndexCard key={r.id} recipe={r} onEdit={openEdit} onDelete={requestDelete} onDuplicate={duplicateRecipe} onToggle={toggle} babyFriendlyEnabled={babyFriendlyEnabled} />
                  ))}
                  {byType[t].length === 0 && <div className="text-xs italic text-center py-6" style={{ color: C.inkSoft }}>No recipes</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {recipes.length === 0 && (
        <div className="fade-in text-center py-10 mt-2 flex flex-col items-center gap-2" style={{ color: C.inkSoft }}>
          <BookOpen size={26} color={C.line} />
          <div>Nothing in the recipe box yet — tap <strong style={{ color: C.forest }}>New recipe</strong> to add your first one, manually or from a photo.</div>
        </div>
      )}

      {chooserOpen && (
        <NewRecipeChooser onManual={openManual} onUpload={openUpload} onClose={() => setChooserOpen(false)} uploadLocked={!canUpload} />
      )}

      {uploadOpen && (
        <UploadRecipeModal onDraft={handleUploadDraft} onClose={() => setUploadOpen(false)} />
      )}

      {editing && (
        <RecipeEditor
          recipe={editing}
          recipes={recipes}
          categoryMemory={categoryMemory}
          ingredientCategories={ingredientCategories}
          babyFriendlyEnabled={babyFriendlyEnabled}
          onSave={save}
          onClose={() => { setEditing(null); setEditingAIGenerated(false); }}
          initialAIGenerated={editingAIGenerated}
        />
      )}

      {babyListOpen && (
        <BabyFriendlyListModal recipes={recipes} setRecipes={setRecipes} onClose={() => setBabyListOpen(false)} />
      )}

      {confirmDeleteId && (
        <ConfirmModal
          title="Delete this recipe?"
          body={`"${deletingRecipe?.name || "This recipe"}" will be removed from your recipe box. You'll have a few seconds to undo.`}
          onConfirm={confirmDelete}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {pendingUndo && (
        <UndoToast
          message={`"${pendingUndo.recipe.name}" deleted`}
          onUndo={undoDelete}
          onExpire={() => setPendingUndo(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Grocery List Tab                                                       */
/* ---------------------------------------------------------------------- */
function GroceryListTab({ plan, recipes, settings, groceryChecked, setGroceryChecked }) {
  const [open, setOpen] = useState({});
  const [hidden, setHidden] = useState({});

  const aggregated = useMemo(() => {
    if (!plan) return {};
    const map = {}; // key: name|unit -> { name, unit, total, category, uses: [{recipeName, amount}] }
    Object.values(plan.days || {}).forEach((day) => {
      (day.slots || []).forEach((slot) => {
        const recipe = recipes.find((r) => r.id === slot.recipeId);
        if (!recipe) return;
        recipe.ingredients.forEach((ing) => {
          if (!ing.name) return;
          const nameKey = ing.name.trim().toLowerCase();
          const isStaple = settings.pantryStaples.some((p) => p.trim().toLowerCase() === nameKey);
          if (isStaple) return;
          const key = `${nameKey}|${ing.unit}`;
          if (!map[key]) {
            map[key] = { name: ing.name, unit: ing.unit, total: 0, category: ing.category || "", uses: [] };
          }
          const amt = parseFloat(ing.amount) || 0;
          map[key].total += amt;
          map[key].uses.push({ recipe: recipe.name || "Untitled", amount: `${ing.amount || "?"} ${ing.unit}` });
        });
      });
    });
    return map;
  }, [plan, recipes, settings.pantryStaples]);

  const categoryList = settings.ingredientCategories && settings.ingredientCategories.length ? settings.ingredientCategories : INGREDIENT_CATEGORIES;

  const canonicalCategory = (raw) => {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "Other";
    const match = categoryList.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    return match || trimmed; // keep a custom category as-is if it's not in the defined list, rather than losing it
  };

  const byCategory = useMemo(() => {
    const groups = {};
    Object.values(aggregated).forEach((item) => {
      if (hidden[`${item.name}|${item.unit}`]) return;
      const cat = canonicalCategory(item.category);
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    // order groups by the user-defined category list, with anything else (including "Other") appended after, alphabetically
    const ordered = {};
    categoryList.forEach((c) => {
      if (groups[c]) { ordered[c] = groups[c]; delete groups[c]; }
    });
    Object.keys(groups).sort().forEach((c) => { ordered[c] = groups[c]; });
    return ordered;
  }, [aggregated, hidden, settings.ingredientCategories]);

  const allKeys = useMemo(() => Object.values(aggregated).map((i) => `${i.name}|${i.unit}`), [aggregated]);
  const checkedCount = allKeys.filter((k) => groceryChecked[k]).length;

  const toggleChecked = (key) => setGroceryChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  const resetChecks = () => setGroceryChecked((prev) => {
    const next = { ...prev };
    allKeys.forEach((k) => delete next[k]);
    return next;
  });

  const downloadList = () => {
    let text = "WEEKLY GROCERY LIST\n\n";
    Object.entries(byCategory).forEach(([cat, items]) => {
      text += `${cat.toUpperCase()}\n`;
      items.forEach((i) => {
        const key = `${i.name}|${i.unit}`;
        text += `  [${groceryChecked[key] ? "x" : " "}] ${i.name}: ${Math.round(i.total * 100) / 100} ${i.unit}\n`;
      });
      text += "\n";
    });
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grocery-list.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const printList = () => window.print();

  if (!plan) {
    return (
      <div className="fade-in text-center py-20 flex flex-col items-center gap-2" style={{ color: C.inkSoft }}>
        <ShoppingCart size={28} color={C.line} />
        <div>Generate a weekly plan first — the grocery list builds itself from it.</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1 no-print flex-wrap gap-2">
        <h2 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 20, color: C.ink }}>Grocery list</h2>
        <div className="flex gap-2">
          <button onClick={printList} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
            <Printer size={15} /> Print
          </button>
          <button onClick={downloadList} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: C.forest }}>
            <Download size={15} /> Download
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4 no-print">
        <span className="text-xs" style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
          {checkedCount} of {allKeys.length} checked off
        </span>
        {checkedCount > 0 && (
          <button onClick={resetChecks} className="text-xs underline" style={{ color: C.inkSoft }}>
            Reset checks
          </button>
        )}
      </div>

      {/* Print-only view: fully expanded, no interactive chrome */}
      <div className="print-only">
        <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 22, marginBottom: 12 }}>Weekly grocery list</h1>
        {Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 14, breakInside: "avoid" }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #999", paddingBottom: 3, marginBottom: 6 }}>{cat}</div>
            {items.map((item) => {
              const key = `${item.name}|${item.unit}`;
              return (
                <div key={key} style={{ marginBottom: 6, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{groceryChecked[key] ? "☑" : "☐"} {item.name}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(item.total * 100) / 100} {item.unit}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#555", marginLeft: 16 }}>
                    {item.uses.map((u, i) => `${u.recipe} (${u.amount})`).join(" · ")}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="space-y-4 no-print">
        {Object.entries(byCategory).map(([cat, items]) => (
          <Card key={cat}>
            <SectionLabel>{cat}</SectionLabel>
            <div className="divide-y" style={{ borderColor: C.line }}>
              {items.map((item) => {
                const key = `${item.name}|${item.unit}`;
                const isOpen = open[key];
                const isChecked = !!groceryChecked[key];
                return (
                  <div key={key} className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleChecked(key)}
                          className="shrink-0"
                          style={{ width: 16, height: 16, accentColor: C.forest }}
                        />
                        <div
                          className="flex items-center gap-1.5 cursor-pointer min-w-0"
                          onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                        >
                          {isOpen ? <ChevronDown size={14} color={C.inkSoft} /> : <ChevronRight size={14} color={C.inkSoft} />}
                          <span
                            className="text-sm truncate"
                            style={{ color: isChecked ? C.inkSoft : C.ink, textDecoration: isChecked ? "line-through" : "none" }}
                          >
                            {item.name}
                          </span>
                        </div>
                      </div>
                      <span
                        className="text-sm font-medium shrink-0"
                        style={{ fontFamily: "'JetBrains Mono', monospace", color: isChecked ? C.inkSoft : C.forestDark, textDecoration: isChecked ? "line-through" : "none" }}
                      >
                        {Math.round(item.total * 100) / 100} {item.unit}
                      </span>
                    </div>
                    {isOpen && (
                      <div className="ml-7 mt-1.5 space-y-1">
                        {item.uses.map((u, idx) => (
                          <div key={idx} className="text-xs flex justify-between" style={{ color: C.inkSoft }}>
                            <span>{u.recipe}</span>
                            <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{u.amount}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
        {Object.keys(byCategory).length === 0 && (
          <div className="fade-in text-center py-16 flex flex-col items-center gap-2" style={{ color: C.inkSoft }}>
            <Check size={24} color={C.line} />
            <div>Nothing needed — everything's a pantry staple, or the plan is empty.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Settings Tab                                                           */
/* ---------------------------------------------------------------------- */
function SettingsTab({ settings, setSettings }) {
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));
  const [stapleInput, setStapleInput] = useState("");
  const [categoryInput, setCategoryInput] = useState("");

  const addStaple = () => {
    if (!stapleInput.trim()) return;
    set({ pantryStaples: [...settings.pantryStaples, stapleInput.trim()] });
    setStapleInput("");
  };
  const removeStaple = (s) => set({ pantryStaples: settings.pantryStaples.filter((x) => x !== s) });

  const categories = settings.ingredientCategories || INGREDIENT_CATEGORIES;
  const addCategory = () => {
    const val = categoryInput.trim();
    if (!val) return;
    if (categories.some((c) => c.toLowerCase() === val.toLowerCase())) { setCategoryInput(""); return; }
    set({ ingredientCategories: [...categories, val] });
    setCategoryInput("");
  };
  const removeCategory = (c) => set({ ingredientCategories: categories.filter((x) => x !== c) });
  const moveCategory = (index, dir) => {
    const next = [...categories];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    set({ ingredientCategories: next });
  };

  return (
    <div className="pb-8">
      <p className="text-sm mb-4" style={{ color: C.inkSoft }}>
        These settings shape how your weekly plan gets generated — change anything here, then hit{" "}
        <strong style={{ color: C.forest }}>Generate</strong> on the Planner tab to see it take effect.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
      <Card>
        <SectionLabel>Meat & dairy</SectionLabel>
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
          Keeps a meat recipe and a dairy recipe from ever landing on the same day.
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.noMeatDairyMix} onChange={(e) => set({ noMeatDairyMix: e.target.checked })} />
          Don't mix meat and dairy recipes in the same meal
        </label>
      </Card>

      <Card>
        <SectionLabel>Daily meal composition</SectionLabel>
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
          Pick which parts make up a typical supper — the planner tries to include one of each, every day.
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMPONENT_OPTIONS.map((c) => (
            <Chip
              key={c}
              active={settings.dailyComposition.includes(c)}
              onClick={() => set({ dailyComposition: settings.dailyComposition.includes(c) ? settings.dailyComposition.filter((x) => x !== c) : [...settings.dailyComposition, c] })}
            >
              {c}
            </Chip>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>Repetition</SectionLabel>
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
          Controls how soon the same recipe is allowed to repeat, based on how it's tagged.
        </div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {["regular", "easy", "favorite"].map((k) => (
            <div key={k}>
              <div className="text-xs capitalize mb-1" style={{ color: C.ink }}>{k}</div>
              <select
                className="w-full px-1 py-1 rounded text-xs"
                style={{ border: `1px solid ${C.line}` }}
                value={settings.repetition[k]}
                onChange={(e) => set({ repetition: { ...settings.repetition, [k]: e.target.value } })}
              >
                {REPEAT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
          ))}
        </div>
        <div className="text-xs italic" style={{ color: C.inkSoft }}>"No preference" repeats a recipe only when nothing else fits.</div>
      </Card>

      <Card>
        <SectionLabel>Priority</SectionLabel>
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
          When filling a slot, the planner reaches for these recipes first before picking randomly.
        </div>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input type="checkbox" checked={settings.prioritizeFavorite} onChange={(e) => set({ prioritizeFavorite: e.target.checked })} />
          Always prioritize favorite recipes
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={settings.prioritizeEasy} onChange={(e) => set({ prioritizeEasy: e.target.checked })} />
          Always prioritize easy recipes
        </label>
      </Card>

      <Card>
        <SectionLabel>Pantry staples</SectionLabel>
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>Hidden from the grocery list unless removed here.</div>
        <div className="flex gap-2 mb-2">
          <input className="flex-1 px-2 py-1.5 rounded text-sm" style={{ border: `1px solid ${C.line}` }} placeholder="Add staple…" value={stapleInput} onChange={(e) => setStapleInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStaple()} />
          <button onClick={addStaple} className="px-3 rounded text-sm text-white" style={{ background: C.forest }}>Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {settings.pantryStaples.map((s) => (
            <span key={s} className="text-xs px-2 py-1 rounded-full flex items-center gap-1" style={{ background: C.paperDark, color: C.ink }}>
              {s} <button onClick={() => removeStaple(s)}><X size={11} /></button>
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>Grocery categories</SectionLabel>
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
          These are the categories available when tagging an ingredient, and how the grocery list is grouped and ordered.
        </div>
        <div className="flex gap-2 mb-2">
          <input className="flex-1 px-2 py-1.5 rounded text-sm" style={{ border: `1px solid ${C.line}` }} placeholder="Add category…" value={categoryInput} onChange={(e) => setCategoryInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} />
          <button onClick={addCategory} className="px-3 rounded text-sm text-white" style={{ background: C.forest }}>Add</button>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
          {categories.map((c, i) => (
            <span key={c} className="text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-0.5" style={{ background: C.paperDark, color: C.ink }}>
              {c}
              <button onClick={() => moveCategory(i, -1)} disabled={i === 0} title="Move up" style={{ opacity: i === 0 ? 0.35 : 1 }}>
                <ChevronRight size={11} color={C.inkSoft} style={{ transform: "rotate(-90deg)" }} />
              </button>
              <button onClick={() => moveCategory(i, 1)} disabled={i === categories.length - 1} title="Move down" style={{ opacity: i === categories.length - 1 ? 0.35 : 1 }}>
                <ChevronRight size={11} color={C.inkSoft} style={{ transform: "rotate(90deg)" }} />
              </button>
              <button onClick={() => removeCategory(c)} title="Remove"><X size={11} color={C.danger} /></button>
            </span>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel>Freezer planning</SectionLabel>
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
          Automatically schedules a freezer meal into the rotation on the day and frequency you set below.
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">Prep day</span>
            <select className="px-2 py-1 rounded text-sm" style={{ border: `1px solid ${C.line}` }} value={settings.freezer.day} onChange={(e) => set({ freezer: { ...settings.freezer, day: e.target.value } })}>
              {DAYS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Frequency</span>
            <select className="px-2 py-1 rounded text-sm" style={{ border: `1px solid ${C.line}` }} value={settings.freezer.frequency} onChange={(e) => set({ freezer: { ...settings.freezer, frequency: e.target.value } })}>
              {["weekly", "biweekly", "monthly"].map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="text-xs italic" style={{ color: C.inkSoft }}>
            Whether a freezer meal's prep counts as part of that day's meal or a separate task is set per recipe, on the recipe card.
          </div>
        </div>
      </Card>

      <Card>
        <SectionLabel>Baby-friendly planning</SectionLabel>
        <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
          Makes sure something baby-friendly shows up in the week's plan. Tag recipes as baby-friendly from the recipe card or editor.
        </div>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input
            type="checkbox"
            checked={settings.babyFriendly.enabled}
            onChange={(e) => set({ babyFriendly: { ...settings.babyFriendly, enabled: e.target.checked } })}
          />
          Enable baby-friendly planning
        </label>
        {settings.babyFriendly.enabled && (
          <div className="space-y-2 mt-1">
            <div>
              <label className="flex items-start gap-2 text-xs" style={{ color: C.ink }}>
                <input
                  type="radio"
                  name="babyFriendlyMode"
                  className="mt-0.5"
                  checked={settings.babyFriendly.mode === "separate"}
                  onChange={() => set({ babyFriendly: { ...settings.babyFriendly, mode: "separate" } })}
                />
                Keep baby-friendly recipes separate — they're never used for the regular meal, only added as the additional baby-friendly dish
              </label>
              <div className="text-xs italic mt-1 ml-5" style={{ color: C.inkSoft }}>
                Since only one baby-friendly dish gets added per day, ideally tag recipes that cover baby's whole meal, not just one component.
              </div>
            </div>

            <div>
              <label className="flex items-start gap-2 text-xs" style={{ color: C.ink }}>
                <input
                  type="radio"
                  name="babyFriendlyMode"
                  className="mt-0.5"
                  checked={settings.babyFriendly.mode === "components"}
                  onChange={() => set({ babyFriendly: { ...settings.babyFriendly, mode: "components" } })}
                />
                The following parts of the meal should be baby-friendly:
              </label>
              {settings.babyFriendly.mode === "components" && (
                <div className="flex flex-wrap gap-1.5 mt-1.5 ml-5">
                  {COMPONENT_OPTIONS.map((c) => (
                    <Chip
                      key={c}
                      active={(settings.babyFriendly.components || []).includes(c)}
                      onClick={() => {
                        const current = settings.babyFriendly.components || [];
                        const next = current.includes(c) ? current.filter((x) => x !== c) : [...current, c];
                        set({ babyFriendly: { ...settings.babyFriendly, components: next } });
                      }}
                    >
                      {c}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>
      </div>

      <Card style={{ marginTop: 16 }}>
        <SectionLabel>Weekly day rules</SectionLabel>
        <div className="text-xs italic mb-2" style={{ color: C.inkSoft }}>Leave both as "Any" for no rule. You can set category and simplicity together — e.g. dairy + under 20 min.</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {DAYS.map((d) => {
            const rule = settings.weeklyDayRules[d] || { category: "", simplicity: "" };
            return (
              <div key={d} className="rounded-lg p-2" style={{ background: C.paperDark }}>
                <div className="text-xs font-semibold uppercase mb-1.5" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>{d.slice(0, 3)}</div>
                <select
                  className="w-full text-xs px-1 py-1 rounded mb-1"
                  style={{ border: `1px solid ${C.line}` }}
                  value={rule.category}
                  onChange={(e) => set({ weeklyDayRules: { ...settings.weeklyDayRules, [d]: { ...rule, category: e.target.value } } })}
                >
                  <option value="">Any category</option>
                  {CATEGORY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <select
                  className="w-full text-xs px-1 py-1 rounded"
                  style={{ border: `1px solid ${C.line}` }}
                  value={rule.simplicity}
                  onChange={(e) => set({ weeklyDayRules: { ...settings.weeklyDayRules, [d]: { ...rule, simplicity: e.target.value } } })}
                >
                  <option value="">Any simplicity</option>
                  {SIMPLICITY_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Planner generation logic                                               */
/* ---------------------------------------------------------------------- */
function weeksSince(dateStr) {
  if (!dateStr) return Infinity;
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return diffMs / (1000 * 60 * 60 * 24 * 7);
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[Math.floor(Math.random() * arr.length)];
}

function generatePlan({ selectedDays, recipes, settings, usageHistory, freezerStock, useUpIngredients = [], excludeCategories = [], hardExcludeRecipeIds = [], weekStart }) {
  const warnings = [];
  const newPlan = { weekStart, days: {} };
  const newHistory = { ...usageHistory };
  const newStock = { ...freezerStock };
  const usedThisWeek = new Set(hardExcludeRecipeIds);
  const satisfiedUseUpTargets = new Set(); // spread different use-up ingredients across different slots when possible

  const slotSortKey = (slot) => {
    if (slot.isPrep && slot.component === "freezer-prep") return 999; // separate freezer task always goes last
    const covered = slot.coveredComponents || [slot.component];
    const indices = covered.map((c) => COMPONENT_OPTIONS.indexOf(c)).filter((i) => i !== -1);
    return indices.length ? Math.min(...indices) : 998;
  };

  const recordUsage = (id) => {
    newHistory[id] = [...(newHistory[id] || []), weekStart];
    usedThisWeek.add(id);
  };

  const eligibleByRepetition = (recipe) => {
    const tagKey = recipe.favorite ? "favorite" : recipe.easy ? "easy" : "regular";
    const rule = settings.repetition[tagKey] || "none";
    const minWeeks = REPEAT_WEEKS[rule];
    const last = (newHistory[recipe.id] || []).slice(-1)[0];
    return weeksSince(last) >= minWeeks;
  };

  const usesIngredient = (recipe, ingName) =>
    ingName && recipe.ingredients.some((i) => i.name.toLowerCase().includes(ingName.toLowerCase()));

  const dayCategoryOK = (recipe, dayAssignedCategories) => {
    if (!settings.noMeatDairyMix) return true;
    if (recipe.category === "parve") return true;
    return !dayAssignedCategories.some((c) => (c === "meat" && recipe.category === "dairy") || (c === "dairy" && recipe.category === "meat"));
  };

  const matchesDayRule = (recipe, dayName) => {
    const rule = settings.weeklyDayRules[dayName];
    if (!rule) return true;
    if (rule.category && recipe.category !== rule.category) return false;
    if (rule.simplicity && !recipe.simplicity.includes(rule.simplicity)) return false;
    return true;
  };

  // in "separate" mode, baby-friendly recipes are reserved for the dedicated baby slot only —
  // they're never eligible to fill a regular meal component or the freezer meal-of-the-day
  const babyReservedOnly = settings.babyFriendly?.enabled && settings.babyFriendly.mode === "separate";
  const excludedForRegularMeal = (recipe) => babyReservedOnly && recipe.babyFriendly;

  // in "components" mode, specific meal components (e.g. protein, starch) must themselves
  // be filled by a baby-friendly recipe — no separate extra dish gets added
  const babyRequiredComponents = settings.babyFriendly?.enabled && settings.babyFriendly.mode === "components"
    ? settings.babyFriendly.components || []
    : [];
  // true if placing this recipe would occupy a required-baby-friendly component slot
  // without actually being baby-friendly — applies to every placement path (locked,
  // leftover follow-up, freezer prep, and the normal fill), not just the normal fill
  const violatesBabyRequirement = (recipe) => {
    if (!babyRequiredComponents.length || recipe.babyFriendly) return false;
    const types = recipe.type === "combo" ? recipe.comboTypes : [recipe.type];
    return types.some((t) => babyRequiredComponents.includes(t));
  };

  // pre-place locked recipes
  const lockedAssignments = {};
  recipes.forEach((r) => {
    if (r.lockedDay && selectedDays.includes(r.lockedDay)) {
      lockedAssignments[r.lockedDay] = lockedAssignments[r.lockedDay] || [];
      lockedAssignments[r.lockedDay].push(r);
    }
  });

  let pendingLeftoverFollowUp = {}; // dayIndex+1 -> recipeId that must be used

  selectedDays.forEach((dayName, idx) => {
    const daySlots = [];
    const dayAssignedCategories = [];
    const neededComponents = [...settings.dailyComposition];

    // 1. Freezer prep day — mode (part of meal vs. separate task) is set per recipe
    if (dayName === settings.freezer.day) {
      const frequencyWeeks = REPEAT_WEEKS[settings.freezer.frequency] || 2;
      const dueFreezerCandidates = recipes.filter((r) => r.freezer && !excludeCategories.includes(r.category) && !excludedForRegularMeal(r) && !(r.freezerPrepMode !== "separate" && violatesBabyRequirement(r)) && weeksSince((newHistory[r.id] || []).slice(-1)[0]) >= frequencyWeeks && !usedThisWeek.has(r.id));
      const dueFreezer = pickRandom(dueFreezerCandidates);
      if (dueFreezer) {
        newStock[dueFreezer.id] = { remaining: dueFreezer.freezerServings, servings: dueFreezer.freezerServings };
        recordUsage(dueFreezer.id);
        if (dueFreezer.freezerPrepMode === "separate") {
          // separate task: an extra item on top of the day's normal meal
          daySlots.push({ component: "freezer-prep", recipeId: dueFreezer.id, isPrep: true });
        } else {
          // part of the meal: this prep IS one of today's components
          daySlots.push({ component: dueFreezer.type === "combo" ? "combo" : dueFreezer.type, coveredComponents: dueFreezer.type === "combo" ? dueFreezer.comboTypes : [dueFreezer.type], recipeId: dueFreezer.id, isPrep: true });
          dayAssignedCategories.push(dueFreezer.category);
          if (dueFreezer.type === "combo") {
            dueFreezer.comboTypes.forEach((c) => { const i = neededComponents.indexOf(c); if (i > -1) neededComponents.splice(i, 1); });
          } else {
            const i = neededComponents.indexOf(dueFreezer.type);
            if (i > -1) neededComponents.splice(i, 1);
          }
        }
      }
    }

    // 2. Locked recipes for this day
    (lockedAssignments[dayName] || []).forEach((r) => {
      if (violatesBabyRequirement(r)) return; // skip — the normal fill below will cover this component with a baby-friendly pick instead
      const comp = r.type === "combo" ? "combo" : r.type;
      daySlots.push({ component: comp, coveredComponents: r.type === "combo" ? r.comboTypes : [r.type], recipeId: r.id });
      dayAssignedCategories.push(r.category);
      recordUsage(r.id);
      if (r.type === "combo") {
        r.comboTypes.forEach((c) => { const i = neededComponents.indexOf(c); if (i > -1) neededComponents.splice(i, 1); });
      } else {
        const i = neededComponents.indexOf(r.type);
        if (i > -1) neededComponents.splice(i, 1);
      }
    });

    // 3. Leftover follow-up required today
    if (pendingLeftoverFollowUp[idx]) {
      const followRecipe = recipes.find((r) => r.usesLeftoverFrom === pendingLeftoverFollowUp[idx]);
      if (followRecipe && !usedThisWeek.has(followRecipe.id) && !violatesBabyRequirement(followRecipe)) {
        const comp = followRecipe.type === "combo" ? "combo" : followRecipe.type;
        daySlots.push({ component: comp, coveredComponents: followRecipe.type === "combo" ? followRecipe.comboTypes : [followRecipe.type], recipeId: followRecipe.id, isLeftoverFollowUp: true });
        dayAssignedCategories.push(followRecipe.category);
        recordUsage(followRecipe.id);
        if (followRecipe.type === "combo") {
          followRecipe.comboTypes.forEach((c) => { const i = neededComponents.indexOf(c); if (i > -1) neededComponents.splice(i, 1); });
        } else {
          const i = neededComponents.indexOf(followRecipe.type);
          if (i > -1) neededComponents.splice(i, 1);
        }
      }
    }

    // 4. Fill remaining needed components — a combo recipe can satisfy more than one component at once
    while (neededComponents.length > 0) {
      const component = neededComponents.shift();
      const candidates = recipes.filter((r) => {
        if (usedThisWeek.has(r.id)) return false;
        if (r.usesLeftoverFrom) return false; // only placed via follow-up logic
        if (excludeCategories.includes(r.category)) return false;
        if (excludedForRegularMeal(r)) return false;
        if (babyRequiredComponents.includes(component) && !r.babyFriendly) return false;
        const providesComponent = r.type === component || (r.type === "combo" && r.comboTypes.includes(component));
        if (!providesComponent) return false;
        if (r.type === "combo") {
          // a combo may only be picked here if every component it covers is still genuinely needed —
          // otherwise it would redundantly re-cover something another dish already fulfilled today
          const stillNeeded = [component, ...neededComponents];
          if (!r.comboTypes.every((c) => stillNeeded.includes(c))) return false;
        }
        if (r.lockedDay && r.lockedDay !== dayName) return false;
        if (!dayCategoryOK(r, dayAssignedCategories)) return false;
        if (!matchesDayRule(r, dayName)) return false;
        // freezer meals: only pull from stock, not as a "fresh cook"
        if (r.freezer) {
          const stock = newStock[r.id];
          if (!stock || stock.remaining <= 0) return false;
        }
        return true;
      });

      let pick = null;
      let matchedUseUpTarget = null;
      if (useUpIngredients.length) {
        const unsatisfied = useUpIngredients.filter((ing) => !satisfiedUseUpTargets.has(ing.toLowerCase()));
        const targetsToTry = unsatisfied.length ? unsatisfied : useUpIngredients;
        for (const target of targetsToTry) {
          const match = candidates.find((r) => usesIngredient(r, target));
          if (match) {
            pick = match;
            matchedUseUpTarget = target;
            break;
          }
        }
      }
      if (pick && matchedUseUpTarget) {
        satisfiedUseUpTargets.add(matchedUseUpTarget.toLowerCase());
      }
      if (!pick) {
        const repetitionOK = candidates.filter(eligibleByRepetition);
        const pool = repetitionOK.length > 0 ? repetitionOK : candidates; // fall back to repeats only if nothing else
        const favs = settings.prioritizeFavorite ? pool.filter((r) => r.favorite) : [];
        const easies = settings.prioritizeEasy ? pool.filter((r) => r.easy) : [];
        pick = pickRandom(favs) || pickRandom(easies) || pickRandom(pool);
      }

      if (pick) {
        let coveredComponents = [component];
        if (pick.type === "combo") {
          // this combo may also satisfy other components still waiting to be filled today — claim them now
          const alsoCovered = pick.comboTypes.filter((c) => c !== component && neededComponents.includes(c));
          coveredComponents = [component, ...alsoCovered];
          alsoCovered.forEach((c) => {
            const i = neededComponents.indexOf(c);
            if (i > -1) neededComponents.splice(i, 1);
          });
        }
        daySlots.push({
          component: pick.type === "combo" ? "combo" : component,
          coveredComponents,
          recipeId: pick.id,
        });
        dayAssignedCategories.push(pick.category);
        recordUsage(pick.id);
        if (pick.freezer && newStock[pick.id]) {
          newStock[pick.id] = { ...newStock[pick.id], remaining: newStock[pick.id].remaining - 1 };
        }
        if (pick.createsLeftovers) {
          pendingLeftoverFollowUp[idx + 1] = pick.id;
        }
      } else {
        const dRule = settings.weeklyDayRules[dayName];
        const ruleBits = [dRule?.category, dRule?.simplicity].filter(Boolean).join(", ");
        warnings.push(`No recipe available for "${component}" on ${dayName}${ruleBits ? ` (rule: ${ruleBits})` : ""}.`);
      }
    }

    // 5. Baby-friendly addition — only in "separate" mode; "components" mode bakes the
    // requirement directly into the regular component-filling above instead
    if (babyReservedOnly) {
      const babyCandidates = recipes.filter((r) => {
        if (!r.babyFriendly) return false;
        if (usedThisWeek.has(r.id)) return false;
        if (excludeCategories.includes(r.category)) return false;
        if (!dayCategoryOK(r, dayAssignedCategories)) return false;
        if (r.freezer) {
          const stock = newStock[r.id];
          if (!stock || stock.remaining <= 0) return false;
        }
        return true;
      });
      const repetitionOK = babyCandidates.filter(eligibleByRepetition);
      const babyPool = repetitionOK.length > 0 ? repetitionOK : babyCandidates;
      const babyPick = pickRandom(babyPool);
      if (babyPick) {
        daySlots.push({ component: "baby", recipeId: babyPick.id, isBaby: true });
        dayAssignedCategories.push(babyPick.category);
        recordUsage(babyPick.id);
        if (babyPick.freezer && newStock[babyPick.id]) {
          newStock[babyPick.id] = { ...newStock[babyPick.id], remaining: newStock[babyPick.id].remaining - 1 };
        }
      } else {
        warnings.push(`No baby-friendly recipe available for ${dayName}.`);
      }
    }

    daySlots.sort((a, b) => slotSortKey(a) - slotSortKey(b));
    newPlan.days[dayName] = { slots: daySlots };
  });

  return { plan: newPlan, warnings, usageHistory: newHistory, freezerStock: newStock };
}

/* ---------------------------------------------------------------------- */
/* Planner Tab                                                            */
/* ---------------------------------------------------------------------- */
function PlannerTab({ recipes, setRecipes, settings, plan, setPlan, usageHistory, setUsageHistory, freezerStock, setFreezerStock, setGroceryChecked }) {
  const [selectedDays, setSelectedDays] = useState([...DAYS]);
  const [useUpIngredients, setUseUpIngredients] = useState([]);
  const [useUpInput, setUseUpInput] = useState("");
  const [excludeCategories, setExcludeCategories] = useState([]); // e.g. ["meat", "fish", "dairy"]
  const [warnings, setWarnings] = useState([]);
  const [pendingSlotUndo, setPendingSlotUndo] = useState(null); // { dayName, index, slot }
  const [viewingRecipe, setViewingRecipe] = useState(null);
  const [useUpOverflowing, setUseUpOverflowing] = useState(false);
  const useUpScrollRef = useRef(null);
  const weekBaselineRef = useRef(null); // { weekStart, freezerStock } — snapshot so regenerating doesn't compound

  useEffect(() => {
    const el = useUpScrollRef.current;
    if (!el) return;
    setUseUpOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, [useUpIngredients, useUpInput]);

  const categoryMemory = useMemo(() => {
    const set = new Set();
    recipes.forEach((r) => r.ingredients.forEach((i) => i.category && set.add(i.category)));
    return Array.from(set);
  }, [recipes]);

  const saveViewedRecipe = (r) => {
    setRecipes((prev) => prev.map((x) => (x.id === r.id ? r : x)));
    setViewingRecipe(null);
  };

  const toggleDay = (d) => setSelectedDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const toggleExclude = (cat) => setExcludeCategories((prev) => (prev.includes(cat) ? prev.filter((x) => x !== cat) : [...prev, cat]));

  const addUseUpIngredient = () => {
    const val = useUpInput.trim();
    if (!val) return;
    setUseUpIngredients((prev) => (prev.some((i) => i.toLowerCase() === val.toLowerCase()) ? prev : [...prev, val]));
    setUseUpInput("");
  };
  const removeUseUpIngredient = (val) => setUseUpIngredients((prev) => prev.filter((i) => i !== val));

  const getBaseline = (weekStart) => {
    if (!weekBaselineRef.current || weekBaselineRef.current.weekStart !== weekStart) {
      weekBaselineRef.current = { weekStart, freezerStock: JSON.parse(JSON.stringify(freezerStock)) };
    }
    return weekBaselineRef.current;
  };

  const stripWeek = (history, weekStart) => {
    const cleaned = {};
    Object.entries(history).forEach(([id, dates]) => {
      cleaned[id] = dates.filter((d) => d !== weekStart);
    });
    return cleaned;
  };

  const doGenerate = () => {
    const weekStart = isoWeek();
    const baseline = getBaseline(weekStart);
    const cleanedHistory = stripWeek(usageHistory, weekStart);
    const result = generatePlan({
      selectedDays: DAYS.filter((d) => selectedDays.includes(d)),
      recipes,
      settings,
      usageHistory: cleanedHistory,
      freezerStock: baseline.freezerStock,
      useUpIngredients,
      excludeCategories,
      weekStart,
    });
    setPlan(result.plan);
    setUsageHistory(result.usageHistory);
    setFreezerStock(result.freezerStock);
    setWarnings(result.warnings);
  };

  const clear = () => {
    setPlan(null);
    setWarnings([]);
    weekBaselineRef.current = null;
    setGroceryChecked({});
  };

  const regenerateDay = (dayName) => {
    const weekStart = isoWeek();
    getBaseline(weekStart);
    // only free up recipes that were assigned to THIS day, so other days keep their repetition protection
    const currentDaySlots = plan.days[dayName]?.slots || [];
    const cleanedHistory = { ...usageHistory };
    currentDaySlots.forEach((slot) => {
      const dates = cleanedHistory[slot.recipeId];
      if (dates) {
        const idx = dates.lastIndexOf(weekStart);
        if (idx !== -1) cleanedHistory[slot.recipeId] = [...dates.slice(0, idx), ...dates.slice(idx + 1)];
      }
    });
    // revert simple freezer draws for non-prep freezer slots being replaced
    const revertedFreezerStock = { ...freezerStock };
    currentDaySlots.forEach((slot) => {
      if (!slot.isPrep) {
        const recipe = recipes.find((r) => r.id === slot.recipeId);
        if (recipe?.freezer && revertedFreezerStock[slot.recipeId]) {
          revertedFreezerStock[slot.recipeId] = { ...revertedFreezerStock[slot.recipeId], remaining: revertedFreezerStock[slot.recipeId].remaining + 1 };
        }
      }
    });

    // recipes already sitting on OTHER days of this plan must be hard-excluded, not just soft-discouraged,
    // or a single-day regenerate could reuse something already used elsewhere this week
    const hardExcludeRecipeIds = Object.entries(plan.days)
      .filter(([d]) => d !== dayName)
      .flatMap(([, day]) => day.slots.map((s) => s.recipeId));

    const result = generatePlan({
      selectedDays: [dayName],
      recipes,
      settings,
      usageHistory: cleanedHistory,
      freezerStock: revertedFreezerStock,
      useUpIngredients: [],
      excludeCategories,
      hardExcludeRecipeIds,
      weekStart,
    });
    setPlan((prev) => ({ ...prev, days: { ...prev.days, [dayName]: result.plan.days[dayName] } }));
    setUsageHistory(result.usageHistory);
    setFreezerStock(result.freezerStock);
  };

  const releaseUsage = (recipeId, weekStart) => {
    setUsageHistory((prev) => {
      const dates = prev[recipeId];
      if (!dates) return prev;
      const idx = dates.lastIndexOf(weekStart);
      if (idx === -1) return prev;
      return { ...prev, [recipeId]: [...dates.slice(0, idx), ...dates.slice(idx + 1)] };
    });
  };
  const claimUsage = (recipeId, weekStart) => {
    setUsageHistory((prev) => ({ ...prev, [recipeId]: [...(prev[recipeId] || []), weekStart] }));
  };
  const releaseFreezerDraw = (recipeId) => {
    setFreezerStock((prev) => {
      const s = prev[recipeId];
      if (!s) return prev;
      return { ...prev, [recipeId]: { ...s, remaining: s.remaining + 1 } };
    });
  };
  const claimFreezerDraw = (recipeId) => {
    setFreezerStock((prev) => {
      const s = prev[recipeId];
      if (!s) return prev;
      return { ...prev, [recipeId]: { ...s, remaining: Math.max(0, s.remaining - 1) } };
    });
  };

  // Swapping, removing, or restoring a slot changes what's actually in the plan — so repetition
  // and freezer-stock tracking must follow the final choice, not whatever was first auto-generated.
  const swapSlotRecipe = (dayName, slotIdx, newRecipeId) => {
    const weekStart = isoWeek();
    const oldSlot = plan.days[dayName].slots[slotIdx];
    if (oldSlot.recipeId === newRecipeId) return;
    const oldRecipe = recipes.find((r) => r.id === oldSlot.recipeId);
    const newRecipe = recipes.find((r) => r.id === newRecipeId);

    setPlan((prev) => {
      const day = prev.days[dayName];
      const newSlots = day.slots.map((s, i) => (i === slotIdx ? { ...s, recipeId: newRecipeId } : s));
      return { ...prev, days: { ...prev.days, [dayName]: { ...day, slots: newSlots } } };
    });

    releaseUsage(oldSlot.recipeId, weekStart);
    claimUsage(newRecipeId, weekStart);
    if (!oldSlot.isPrep && oldRecipe?.freezer) releaseFreezerDraw(oldSlot.recipeId);
    if (newRecipe?.freezer) claimFreezerDraw(newRecipeId);
  };

  const removeSlot = (dayName, slotIdx) => {
    const weekStart = isoWeek();
    const day = plan.days[dayName];
    const slot = day.slots[slotIdx];
    const recipe = recipes.find((r) => r.id === slot.recipeId);

    setPendingSlotUndo({ dayName, index: slotIdx, slot });
    setPlan((prev) => {
      const d = prev.days[dayName];
      return { ...prev, days: { ...prev.days, [dayName]: { ...d, slots: d.slots.filter((_, i) => i !== slotIdx) } } };
    });

    releaseUsage(slot.recipeId, weekStart);
    if (!slot.isPrep && recipe?.freezer) releaseFreezerDraw(slot.recipeId);
  };

  const undoRemoveSlot = () => {
    if (!pendingSlotUndo) return;
    const { dayName, index, slot } = pendingSlotUndo;
    const weekStart = isoWeek();
    const recipe = recipes.find((r) => r.id === slot.recipeId);

    setPlan((prev) => {
      const day = prev.days[dayName];
      const newSlots = [...day.slots];
      newSlots.splice(Math.min(index, newSlots.length), 0, slot);
      return { ...prev, days: { ...prev.days, [dayName]: { ...day, slots: newSlots } } };
    });

    claimUsage(slot.recipeId, weekStart);
    if (!slot.isPrep && recipe?.freezer) claimFreezerDraw(slot.recipeId);
    setPendingSlotUndo(null);
  };

  const getSwapOptions = (dayName, slotIdx) => {
    const slot = plan.days[dayName].slots[slotIdx];
    const usedElsewhere = new Set();
    Object.entries(plan.days).forEach(([d, day]) => {
      day.slots.forEach((s, idx) => {
        if (d === dayName && idx === slotIdx) return; // skip the slot being edited
        usedElsewhere.add(s.recipeId);
      });
    });
    return recipes.filter((r) => {
      if (r.id === slot.recipeId) return false; // already shown as the current selection
      if (usedElsewhere.has(r.id)) return false;
      if (slot.isPrep && slot.component === "freezer-prep") return r.freezer;
      if (slot.isBaby) return r.babyFriendly;
      return r.type === slot.component || (r.type === "combo" && r.comboTypes.includes(slot.component));
    });
  };

  return (
    <div>
      <div className="flex flex-wrap items-stretch gap-3" style={{ marginBottom: 16 }}>
        <div className="rounded-xl" style={{ background: C.white, border: `1px solid ${C.line}`, padding: 14 }}>
          <SectionLabel>Days to plan</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => (
              <Chip key={d} active={selectedDays.includes(d)} onClick={() => toggleDay(d)}>{d.slice(0, 3)}</Chip>
            ))}
          </div>
        </div>

        <div className="rounded-xl flex flex-col justify-center" style={{ background: C.white, border: `1px solid ${C.line}`, padding: 14, width: "min(300px, calc(100vw - 48px))" }}>
          <SectionLabel>Use up ingredients this week</SectionLabel>
          <div className="relative">
            <div
              ref={useUpScrollRef}
              className="no-scrollbar flex items-center gap-1.5 px-2 py-1 rounded-lg overflow-x-auto"
              style={{ border: `1px solid ${C.line}`, background: C.white, width: "100%" }}
            >
              <input
                className="text-sm bg-transparent shrink-0"
                style={{ border: "none", outline: "none", width: 110, padding: 0 }}
                placeholder={useUpIngredients.length === 0 ? "e.g. spinach" : "Add more…"}
                value={useUpInput}
                onChange={(e) => setUseUpInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUseUpIngredient(); } }}
              />
              {useUpIngredients.map((ing) => (
                <span key={ing} className="text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0 whitespace-nowrap" style={{ background: C.paperDark, color: C.ink }}>
                  {ing} <button onClick={() => removeUseUpIngredient(ing)}><X size={11} /></button>
                </span>
              ))}
            </div>
            {useUpOverflowing && (
              <button
                type="button"
                onClick={() => useUpScrollRef.current?.scrollBy({ left: 100, behavior: "smooth" })}
                className="absolute top-1/2 -translate-y-1/2 flex items-center"
                style={{ right: 4, background: "linear-gradient(to right, transparent, #FFFFFF 60%)", paddingLeft: 14, height: "100%", cursor: "pointer" }}
                title="Scroll for more"
              >
                <ChevronRight size={14} color={C.inkSoft} />
              </button>
            )}
          </div>
        </div>

        <div className="rounded-xl" style={{ background: C.white, border: `1px solid ${C.line}`, padding: 14 }}>
          <SectionLabel>This week, avoid</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {["meat", "fish", "dairy"].map((cat) => (
              <Chip key={cat} active={excludeCategories.includes(cat)} onClick={() => toggleExclude(cat)} color={C.rust}>
                No {cat}
              </Chip>
            ))}
          </div>
        </div>

        <div className="flex gap-2 w-full sm:w-auto sm:ml-auto self-center">
          <button onClick={doGenerate} className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: C.forest }}>
            <Calendar size={15} /> Generate
          </button>
          <button onClick={clear} className="flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}>
            Clear
          </button>
        </div>
      </div>

      {warnings.length > 0 && (
        <Card style={{ marginBottom: 16, background: "#FDECE6", borderColor: C.rust }}>
          <div className="flex items-center gap-2 mb-1.5" style={{ color: C.rust }}>
            <AlertTriangle size={16} /> <span className="text-sm font-semibold">Some slots couldn't be filled</span>
          </div>
          <ul className="text-xs space-y-1" style={{ color: C.inkSoft }}>
            {warnings.map((w, i) => <li key={i}>• {w}</li>)}
          </ul>
        </Card>
      )}

      {plan ? (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
          {DAYS.filter((d) => plan.days[d]).map((dayName) => (
            <div key={dayName} className="rounded-xl flex-shrink-0" style={{ width: 220, background: C.white, border: `1px solid ${C.line}` }}>
              <div className="px-3 py-2.5 rounded-t-xl flex items-center justify-between" style={{ background: C.forestDark }}>
                <span className="text-sm font-semibold text-white" style={{ fontFamily: "'Poppins', sans-serif" }}>{dayName}</span>
                <button onClick={() => regenerateDay(dayName)} title="Regenerate this day">
                  <RefreshCw size={13} color="#fff" />
                </button>
              </div>
              <div className="p-2.5 space-y-2">
                {plan.days[dayName].slots.map((slot, i) => {
                  const recipe = recipes.find((r) => r.id === slot.recipeId);
                  const accent = slot.isPrep && slot.component === "freezer-prep" ? C.dustyBlue : slot.isBaby ? C.plum : (TYPE_COLORS[slot.component] || C.forest);
                  return (
                    <div key={i} className="rounded-lg p-2 relative" style={{ background: C.paperDark, borderLeft: `3px solid ${accent}` }}>
                      <div className="text-[10px] uppercase font-semibold mb-0.5" style={{ color: accent, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>
                        {slot.isPrep && slot.component === "freezer-prep"
                          ? "freezer prep"
                          : slot.isBaby
                          ? "baby friendly"
                          : slot.coveredComponents && slot.coveredComponents.length > 1
                          ? `combo: ${slot.coveredComponents.join(" + ")}`
                          : slot.component}
                      </div>
                      <select
                        className="w-full text-xs bg-transparent font-medium pr-4"
                        style={{ color: C.ink, fontFamily: "'Poppins', sans-serif" }}
                        value={slot.recipeId}
                        onChange={(e) => swapSlotRecipe(dayName, i, e.target.value)}
                      >
                        {recipe && <option value={recipe.id}>{recipe.name}</option>}
                        {getSwapOptions(dayName, i).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                      {recipe && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span
                            className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded text-white"
                            style={{ background: CATEGORY_COLORS[recipe.category] || C.inkSoft, fontFamily: "'Inter', sans-serif", letterSpacing: "0.03em" }}
                          >
                            {recipe.category}
                          </span>
                          {recipe.favorite && <Heart size={11} fill={C.danger} color={C.danger} />}
                          {recipe.easy && <Zap size={11} fill={C.forest} color={C.forest} />}
                          {recipe.freezer && <Snowflake size={11} color={C.dustyBlue} />}
                          {recipe.babyFriendly && <Baby size={11} color={C.plum} />}
                        </div>
                      )}
                      {recipe && (
                        <button onClick={() => setViewingRecipe(recipe)} className="absolute top-1.5 right-6" title="View recipe details">
                          <Eye size={12} color={C.inkSoft} />
                        </button>
                      )}
                      <button onClick={() => removeSlot(dayName, i)} className="absolute top-1.5 right-1.5">
                        <X size={12} color={C.danger} />
                      </button>
                    </div>
                  );
                })}
                {plan.days[dayName].slots.length === 0 && <div className="text-xs italic text-center py-4" style={{ color: C.inkSoft }}>Nothing planned</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="fade-in text-center py-20 flex flex-col items-center gap-2" style={{ color: C.inkSoft }}>
          <Calendar size={28} color={C.line} />
          <div>Pick your days and hit Generate to build the week.</div>
        </div>
      )}

      {pendingSlotUndo && (
        <UndoToast
          message="Removed from the plan"
          onUndo={undoRemoveSlot}
          onExpire={() => setPendingSlotUndo(null)}
        />
      )}

      {viewingRecipe && (
        <RecipeEditor
          recipe={viewingRecipe}
          recipes={recipes}
          categoryMemory={categoryMemory}
          ingredientCategories={settings.ingredientCategories}
          babyFriendlyEnabled={settings.babyFriendly?.enabled}
          onSave={saveViewedRecipe}
          onClose={() => setViewingRecipe(null)}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Main App                                                                */
/* ---------------------------------------------------------------------- */
export default function PlannerApp({ session, tier, isPaid, hasProAccess }) {
  const userId = session.user.id;
  const [tab, setTab] = useState("planner");
  const [recipes, setRecipes] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [plan, setPlan] = useState(null);
  const [usageHistory, setUsageHistory] = useState({});
  const [freezerStock, setFreezerStock] = useState({});
  const [groceryChecked, setGroceryChecked] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [assistantDraft, setAssistantDraft] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    (async () => {
      const row = await loadPlannerRow(userId);
      const r = row?.recipes ?? [];
      const s = row?.settings ?? DEFAULT_SETTINGS;
      const p = row?.plan ?? null;
      const h = row?.usage_history ?? {};
      const f = row?.freezer_stock ?? {};
      const gc = row?.grocery_checked ?? {};

      setRecipes(r);
      const migratedRules = {};
      DAYS.forEach((d) => {
        const old = (s.weeklyDayRules || {})[d];
        if (old && "mode" in old) {
          // migrate legacy {mode, value} shape to independent category/simplicity fields
          migratedRules[d] = {
            category: old.mode === "category" ? old.value : "",
            simplicity: old.mode === "simplicity" ? old.value : "",
          };
        } else {
          migratedRules[d] = old || { category: "", simplicity: "" };
        }
      });
      // migrate legacy baby-friendly modes ("onlyIfMissing" / "always") to "separate"
      const babyFriendly = s.babyFriendly
        ? { ...DEFAULT_SETTINGS.babyFriendly, ...s.babyFriendly, mode: ["separate", "components"].includes(s.babyFriendly.mode) ? s.babyFriendly.mode : "separate" }
        : DEFAULT_SETTINGS.babyFriendly;
      setSettings({ ...DEFAULT_SETTINGS, ...s, weeklyDayRules: migratedRules, babyFriendly });
      setPlan(p);
      setUsageHistory(h);
      setFreezerStock(f);
      setGroceryChecked(gc);
      setLoaded(true);
    })();
  }, [userId]);

  const persist = useCallback((key, value) => {
    saveField(userId, key, value).then(() => {
      setShowSaved(true);
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setShowSaved(false), 1200);
    });
  }, [userId]);

  useEffect(() => { if (loaded) persist("recipes", recipes); }, [recipes, loaded]);
  useEffect(() => { if (loaded) persist("settings", settings); }, [settings, loaded]);
  useEffect(() => { if (loaded) persist("plan", plan); }, [plan, loaded]);
  useEffect(() => { if (loaded) persist("usageHistory", usageHistory); }, [usageHistory, loaded]);
  useEffect(() => { if (loaded) persist("freezerStock", freezerStock); }, [freezerStock, loaded]);
  useEffect(() => { if (loaded) persist("groceryChecked", groceryChecked); }, [groceryChecked, loaded]);

  const categoryMemory = useMemo(() => {
    const set = new Set();
    recipes.forEach((r) => r.ingredients.forEach((i) => i.category && set.add(i.category)));
    return Array.from(set);
  }, [recipes]);

  const handleLogout = () => { supabase.auth.signOut(); };
  const dismissWelcome = () => setSettings((s) => ({ ...s, hasSeenWelcome: true }));

  const saveAssistantDraft = (r) => {
    setRecipes((prev) => {
      const exists = prev.some((x) => x.id === r.id);
      return exists ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r];
    });
    setAssistantDraft(null);
  };

  if (!loaded) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ background: C.paper, minHeight: 400 }}>
        <BookOpen size={28} color={C.forest} className="spin-slow" style={{ animationDuration: "1.8s" }} />
        <div style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>loading your recipe box…</div>
      </div>
    );
  }

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');
        * { box-sizing: border-box; }

        select, input, textarea, button { font-family: inherit; }
        select, input, textarea { outline: none; transition: border-color .15s ease, box-shadow .15s ease; }
        select:focus, input:focus, textarea:focus {
          border-color: ${C.forest} !important;
          box-shadow: 0 0 0 3px rgba(63,91,69,0.16);
        }
        input[type="checkbox"], input[type="radio"], select { accent-color: ${C.forest}; }
        input[type="checkbox"], input[type="radio"] { cursor: pointer; }

        button { transition: filter .15s ease, transform .08s ease, opacity .15s ease; }
        button:hover:not(:disabled):not(.tab-btn) { filter: brightness(1.07); }
        button:active:not(:disabled) { transform: scale(0.97); }
        button:disabled { opacity: 0.6; cursor: not-allowed; }
        .tab-btn:hover { background: rgba(63,91,69,0.08) !important; color: ${C.forestDark} !important; }

        a, .clickable { transition: opacity .15s ease; }

        ::selection { background: ${C.mustard}; color: ${C.ink}; }

        ::-webkit-scrollbar { width: 9px; height: 9px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 5px; }
        ::-webkit-scrollbar-thumb:hover { background: ${C.inkSoft}; }

        .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; height: 0; }

        .fade-in { animation: fadeIn .18s ease both; }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pop-in { animation: popIn .16s cubic-bezier(.2,.8,.3,1.2) both; }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .slide-up { animation: slideUp .22s cubic-bezier(.2,.8,.3,1) both; }
        @keyframes slideUp {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin-slow { animation: spin 1.4s linear infinite; }

        .card-hover { transition: transform .15s ease, box-shadow .15s ease; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 3px 5px 0 rgba(46,42,34,0.12); }

        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="px-3 sm:px-6 pt-4 sm:pt-6 pb-0 max-w-7xl mx-auto no-print">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <Logo size={72} />
            <div className="flex flex-col leading-tight">
              <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 17, color: C.ink }}>Stress Less. Enjoy More.</h1>
              <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: BRAND.sage }}>Your All-in-One Supper Planner.</span>
            </div>
            <SavePulse show={showSaved} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAccount(true)}
              className="flex items-center justify-center rounded-lg"
              style={{ width: 34, height: 34, border: `1px solid ${C.line}`, color: C.inkSoft }}
              title="Your account"
            >
              <User size={16} />
            </button>
            {isPaid && tier === "basic" && (
              <button
                onClick={() => setShowUpgrade(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                style={{ background: C.forest }}
              >
                Upgrade to Pro
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm"
              style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}
            >
              <LogOut size={14} /> Log out
            </button>
          </div>
        </div>
        <div className="mb-3" />

        <div className="flex gap-1 overflow-x-auto whitespace-nowrap -mx-3 px-3 sm:mx-0 sm:px-0" style={{ borderBottom: `1px solid ${C.line}` }}>
          <Tab active={tab === "planner"} onClick={() => setTab("planner")} icon={Calendar}>Planner</Tab>
          <Tab active={tab === "recipes"} onClick={() => setTab("recipes")} icon={BookOpen}>Recipes</Tab>
          <Tab active={tab === "grocery"} onClick={() => setTab("grocery")} icon={ShoppingCart}>Grocery List</Tab>
          <Tab active={tab === "settings"} onClick={() => setTab("settings")} icon={SettingsIcon}>Settings</Tab>
        </div>
      </div>

      <div className="px-3 sm:px-6 py-6 max-w-7xl mx-auto" style={{ background: C.paper }}>
        {tab === "recipes" && <RecipesTab recipes={recipes} setRecipes={setRecipes} categoryMemory={categoryMemory} ingredientCategories={settings.ingredientCategories} babyFriendlyEnabled={settings.babyFriendly?.enabled} canUpload={hasProAccess} onUpgradeClick={() => setShowUpgrade(true)} />}
        {tab === "grocery" && (
          <GroceryListTab plan={plan} recipes={recipes} settings={settings} groceryChecked={groceryChecked} setGroceryChecked={setGroceryChecked} />
        )}
        {tab === "planner" && (
          <PlannerTab
            recipes={recipes}
            setRecipes={setRecipes}
            settings={settings}
            plan={plan}
            setPlan={setPlan}
            usageHistory={usageHistory}
            setUsageHistory={setUsageHistory}
            freezerStock={freezerStock}
            setFreezerStock={setFreezerStock}
            setGroceryChecked={setGroceryChecked}
          />
        )}
        {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettings} />}
      </div>

      <div className="px-3 sm:px-6 pb-6 max-w-7xl mx-auto no-print text-center text-xs" style={{ color: C.inkSoft }}>
        Questions or feedback? We're at{" "}
        <a href="mailto:support@plantodish.com" style={{ color: C.forest, textDecoration: "underline" }}>
          support@plantodish.com
        </a>{" "}
        anytime.
      </div>

      {!settings.hasSeenWelcome && <WelcomeGuide onClose={dismissWelcome} />}

      {assistantDraft && (
        <RecipeEditor
          recipe={assistantDraft}
          recipes={recipes}
          categoryMemory={categoryMemory}
          ingredientCategories={settings.ingredientCategories}
          babyFriendlyEnabled={settings.babyFriendly?.enabled}
          onSave={saveAssistantDraft}
          onClose={() => setAssistantDraft(null)}
          initialAIGenerated={true}
        />
      )}

      {showUpgrade && (
        <Pricing mode="upgrade" userEmail={session.user.email} currentTier={tier} onClose={() => setShowUpgrade(false)} />
      )}

      {showAccount && (
        <Account
          session={session}
          tier={tier}
          isPaid={isPaid}
          dietaryPreferences={settings.dietaryPreferences}
          onSaveDietaryPreferences={(val) => setSettings((s) => ({ ...s, dietaryPreferences: val }))}
          onUpgradeClick={() => { setShowAccount(false); setShowUpgrade(true); }}
          onClose={() => setShowAccount(false)}
        />
      )}

      <FloatingAssistant
        userId={userId}
        dietaryPreferences={settings.dietaryPreferences}
        onRecipeDrafted={(raw) => setAssistantDraft(recipeFromAIDraft(raw))}
        locked={!hasProAccess}
        onUpgradeClick={() => setShowUpgrade(true)}
      />
    </div>
  );
}
