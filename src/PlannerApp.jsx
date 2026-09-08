import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Heart, Zap, Snowflake, Lock, ArrowRightLeft, Plus, X, Pencil, Trash2,
  ChevronDown, ChevronRight, Search, RefreshCw, Calendar, ShoppingCart,
  Settings as SettingsIcon, BookOpen, Download, AlertTriangle, Check,
  GripVertical, Clock, Copy, Printer, LogOut, Baby, Sparkles, Upload,
  ImagePlus, PenLine, Link as LinkIcon, MessageCircle, Send, Eye,
  User, Coffee, Sandwich, Apple, ChefHat, Minus
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
const MEAL_TYPE_OPTIONS = ["breakfast", "lunch", "snack", "supper"];
const MEAL_TYPE_META = {
  breakfast: { label: "Breakfast", color: C.mustard, icon: Coffee },
  lunch: { label: "Lunch", color: C.dustyBlue, icon: Sandwich },
  snack: { label: "Snack", color: C.plum, icon: Apple },
  supper: { label: "Supper", color: C.forest, icon: ChefHat },
};
const AUTO_MEAL_TYPES = ["breakfast", "lunch", "snack"];
const AUTO_REPETITION_OPTIONS = [
  { key: "full", label: "Full rotation" },
  { key: "weekOnly", label: "This week only" },
  { key: "none", label: "No restriction" },
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
  supperDays: [...DAYS],
  repetition: { regular: "none", easy: "weekly", favorite: "none" },
  prioritizeFavorite: true,
  prioritizeEasy: false,
  pantryStaples: ["salt", "pepper", "olive oil", "sugar", "flour"],
  freezer: { day: "Sunday", frequency: "biweekly" },
  weeklyDayRules: DAYS.reduce((acc, d) => ({ ...acc, [d]: { category: "" } }), {}),
  ingredientCategories: [...INGREDIENT_CATEGORIES],
  // one baby-friendly config per meal type — mode: "separate" | "components"
  babyFriendly: {
    supper: { enabled: false, mode: "separate", components: [] },
    breakfast: { enabled: false, mode: "separate", components: [] },
    lunch: { enabled: false, mode: "separate", components: [] },
    snack: { enabled: false, mode: "separate", components: [] },
  },
  // per meal type: which days to auto-fill (empty = stays fully manual), which components make up
  // the meal, and how strict repeat-avoidance should be. repetition: "full" | "weekOnly" | "none"
  autoMeals: {
    breakfast: { days: [], composition: ["protein"], repetition: "full" },
    lunch: { days: [], composition: ["protein"], repetition: "full" },
    snack: { days: [], composition: ["protein"], repetition: "full" },
  },
};

const buildEmptyManualMeals = () => DAYS.reduce((acc, d) => ({ ...acc, [d]: { breakfast: [], lunch: [], snack: [] } }), {});

const emptyRecipe = () => ({
  id: uid(),
  name: "",
  mealType: "supper",
  type: "protein",
  comboTypes: [],
  category: "meat",
  favorite: false,
  easy: false,
  freezer: false,
  freezerServings: 4,
  freezerPrepMode: "withMeal", // "withMeal" | "separate"
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
    mealType: MEAL_TYPE_OPTIONS.includes(parsed.mealType) ? parsed.mealType : base.mealType,
    type: TYPE_OPTIONS.includes(parsed.type) ? parsed.type : base.type,
    comboTypes: Array.isArray(parsed.comboTypes) ? parsed.comboTypes.filter((c) => COMPONENT_OPTIONS.includes(c)) : base.comboTypes,
    category: CATEGORY_OPTIONS.includes(parsed.category) ? parsed.category : base.category,
    ingredients: Array.isArray(parsed.ingredients)
      ? parsed.ingredients.map((i) => ({ id: uid(), name: i.name || "", amount: i.amount ?? "", unit: i.unit || "unit", category: i.category || "", price: "" }))
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
  manualMeals: "manual_meals",
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
  const cost = recipe.ingredients.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0);
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
        {recipe.mealType && recipe.mealType !== "supper" && (
          <span
            className="px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase"
            style={{ background: C.paperDark, color: C.inkSoft, fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}
          >
            {MEAL_TYPE_META[recipe.mealType]?.label || recipe.mealType}
          </span>
        )}
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
            {cost > 0 && <> · ~${cost.toFixed(2)}</>}
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

  const addIngredient = () => set({ ingredients: [...r.ingredients, { id: uid(), name: "", amount: "", unit: "unit", category: "", price: "" }] });
  const ingredientsCost = r.ingredients.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0);
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

              <div>
                <SectionLabel>Meal</SectionLabel>
                <select className="w-full px-2 py-1.5 rounded-lg text-sm" style={{ border: `1px solid ${C.line}`, background: C.white }} value={r.mealType || "supper"} onChange={(e) => set({ mealType: e.target.value })}>
                  {MEAL_TYPE_OPTIONS.map((m) => <option key={m} value={m}>{MEAL_TYPE_META[m].label}</option>)}
                </select>
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
                  <div className="flex items-center gap-3">
                    {ingredientsCost > 0 && (
                      <span className="text-xs font-medium" style={{ color: C.forestDark, fontFamily: "'JetBrains Mono', monospace" }}>
                        ~${ingredientsCost.toFixed(2)}
                      </span>
                    )}
                    <button onClick={addIngredient} className="text-xs flex items-center gap-1 px-2 py-1 rounded" style={{ color: C.forest, fontFamily: "'JetBrains Mono', monospace" }}>
                      <Plus size={13} /> Add row
                    </button>
                  </div>
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
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm" style={{ color: C.inkSoft }}>$</span>
                        <input
                          className="w-16 pl-4 pr-1 py-1.5 rounded text-sm"
                          style={{ border: `1px solid ${C.line}`, background: C.white }}
                          placeholder="0.00"
                          title="Rough price for this amount"
                          value={ing.price ?? ""}
                          onChange={(e) => updateIngredient(ing.id, { price: e.target.value })}
                        />
                      </div>
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
  const [mealTypeFilter, setMealTypeFilter] = useState("all");

  const toggleExpanded = (t) => setExpanded((prev) => ({ ...prev, [t]: !prev[t] }));

  const mealTypeCounts = useMemo(() => {
    const counts = { all: recipes.length };
    MEAL_TYPE_OPTIONS.forEach((m) => (counts[m] = 0));
    recipes.forEach((r) => { counts[r.mealType || "supper"] = (counts[r.mealType || "supper"] || 0) + 1; });
    return counts;
  }, [recipes]);

  const byType = useMemo(() => {
    const groups = {};
    TYPE_OPTIONS.forEach((t) => (groups[t] = []));
    recipes
      .filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()))
      .filter((r) => mealTypeFilter === "all" || (r.mealType || "supper") === mealTypeFilter)
      .forEach((r) => groups[r.type]?.push(r));
    return groups;
  }, [recipes, query, mealTypeFilter]);

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
    setEditing({ ...emptyRecipe(), mealType: mealTypeFilter === "all" ? "supper" : mealTypeFilter });
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
      <div className="flex flex-wrap gap-1.5 mb-3.5">
        <Chip active={mealTypeFilter === "all"} onClick={() => setMealTypeFilter("all")}>
          All <span style={{ opacity: 0.7 }}>({mealTypeCounts.all})</span>
        </Chip>
        {MEAL_TYPE_OPTIONS.map((m) => (
          <Chip key={m} active={mealTypeFilter === m} onClick={() => setMealTypeFilter(m)} color={MEAL_TYPE_META[m].color}>
            {MEAL_TYPE_META[m].label} <span style={{ opacity: 0.7 }}>({mealTypeCounts[m] || 0})</span>
          </Chip>
        ))}
      </div>

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
function GroceryListTab({ plan, recipes, settings, groceryChecked, setGroceryChecked, manualMeals }) {
  const [open, setOpen] = useState({});
  const [hidden, setHidden] = useState({});

  const hasManualMeals = useMemo(
    () => Object.values(manualMeals || {}).some((day) => ["breakfast", "lunch", "snack"].some((mt) => (day?.[mt] || []).length > 0)),
    [manualMeals]
  );

  const aggregated = useMemo(() => {
    const map = {}; // key: name|unit -> { name, unit, total, cost, category, uses: [{recipeName, amount}] }
    const addRecipeIngredients = (recipe) => {
      if (!recipe) return;
      recipe.ingredients.forEach((ing) => {
        if (!ing.name) return;
        const nameKey = ing.name.trim().toLowerCase();
        const isStaple = settings.pantryStaples.some((p) => p.trim().toLowerCase() === nameKey);
        if (isStaple) return;
        const key = `${nameKey}|${ing.unit}`;
        if (!map[key]) {
          map[key] = { name: ing.name, unit: ing.unit, total: 0, cost: 0, category: ing.category || "", uses: [] };
        }
        const amt = parseFloat(ing.amount) || 0;
        map[key].total += amt;
        map[key].cost += parseFloat(ing.price) || 0;
        map[key].uses.push({ recipe: recipe.name || "Untitled", amount: `${ing.amount || "?"} ${ing.unit}` });
      });
    };

    if (plan) {
      Object.values(plan.days || {}).forEach((day) => {
        (day.slots || []).forEach((slot) => addRecipeIngredients(recipes.find((r) => r.id === slot.recipeId)));
      });
    }
    Object.values(manualMeals || {}).forEach((day) => {
      ["breakfast", "lunch", "snack"].forEach((mt) => {
        (day?.[mt] || []).forEach((recipeId) => addRecipeIngredients(recipes.find((r) => r.id === recipeId)));
      });
    });
    return map;
  }, [plan, manualMeals, recipes, settings.pantryStaples]);

  const grandTotalCost = useMemo(
    () => Object.values(aggregated).reduce((sum, item) => sum + item.cost, 0),
    [aggregated]
  );

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
        const costStr = i.cost > 0 ? ` (~$${i.cost.toFixed(2)})` : "";
        text += `  [${groceryChecked[key] ? "x" : " "}] ${i.name}: ${Math.round(i.total * 100) / 100} ${i.unit}${costStr}\n`;
      });
      text += "\n";
    });
    if (grandTotalCost > 0) text += `ESTIMATED TOTAL: $${grandTotalCost.toFixed(2)}\n`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "grocery-list.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const printList = () => window.print();

  if (!plan && !hasManualMeals) {
    return (
      <div className="fade-in text-center py-20 flex flex-col items-center gap-2" style={{ color: C.inkSoft }}>
        <ShoppingCart size={28} color={C.line} />
        <div>Generate a weekly supper plan, or add some breakfasts/lunches/snacks — the grocery list builds itself from them.</div>
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
      <div className="flex items-center justify-between mb-4 no-print flex-wrap gap-2">
        <span className="text-xs" style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>
          {checkedCount} of {allKeys.length} checked off
          {grandTotalCost > 0 && (
            <>
              {" · "}
              <span style={{ color: C.forestDark, fontWeight: 600 }}>Est. total: ${grandTotalCost.toFixed(2)}</span>
            </>
          )}
        </span>
        {checkedCount > 0 && (
          <button onClick={resetChecks} className="text-xs underline" style={{ color: C.inkSoft }}>
            Reset checks
          </button>
        )}
      </div>

      {/* Print-only view: fully expanded, no interactive chrome */}
      <div className="print-only">
        <h1 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 22, marginBottom: 12 }}>
          Weekly grocery list
          {grandTotalCost > 0 && <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 10 }}>— est. total ${grandTotalCost.toFixed(2)}</span>}
        </h1>
        {Object.entries(byCategory).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 14, breakInside: "avoid" }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #999", paddingBottom: 3, marginBottom: 6 }}>{cat}</div>
            {items.map((item) => {
              const key = `${item.name}|${item.unit}`;
              return (
                <div key={key} style={{ marginBottom: 6, fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{groceryChecked[key] ? "☑" : "☐"} {item.name}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {Math.round(item.total * 100) / 100} {item.unit}
                      {item.cost > 0 && ` (~$${item.cost.toFixed(2)})`}
                    </span>
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
                        className="text-sm font-medium shrink-0 text-right"
                        style={{ fontFamily: "'JetBrains Mono', monospace", color: isChecked ? C.inkSoft : C.forestDark, textDecoration: isChecked ? "line-through" : "none" }}
                      >
                        {Math.round(item.total * 100) / 100} {item.unit}
                        {item.cost > 0 && <div className="text-xs" style={{ color: C.inkSoft, fontWeight: 400 }}>${item.cost.toFixed(2)}</div>}
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
/* Baby-friendly settings — reused per meal type, each with its own on/off */
/* ---------------------------------------------------------------------- */
function BabyFriendlySettings({ mealType, value, onChange }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm mb-2">
        <input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />
        Enable baby-friendly planning
      </label>
      {value.enabled && (
        <div className="space-y-2 mt-1">
          <div>
            <label className="flex items-start gap-2 text-xs" style={{ color: C.ink }}>
              <input
                type="radio"
                name={`babyFriendlyMode-${mealType}`}
                className="mt-0.5"
                checked={value.mode === "separate"}
                onChange={() => onChange({ ...value, mode: "separate" })}
              />
              Keep baby-friendly recipes separate — they're never used for a regular slot, only added as an additional baby-friendly dish
            </label>
            <div className="text-xs italic mt-1 ml-5" style={{ color: C.inkSoft }}>
              Since only one extra baby-friendly dish gets added per day, ideally tag recipes that cover the whole meal, not just one component.
            </div>
          </div>

          <div>
            <label className="flex items-start gap-2 text-xs" style={{ color: C.ink }}>
              <input
                type="radio"
                name={`babyFriendlyMode-${mealType}`}
                className="mt-0.5"
                checked={value.mode === "components"}
                onChange={() => onChange({ ...value, mode: "components" })}
              />
              The following parts of the meal should be baby-friendly:
            </label>
            {value.mode === "components" && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 ml-5">
                {COMPONENT_OPTIONS.map((c) => (
                  <Chip
                    key={c}
                    active={(value.components || []).includes(c)}
                    onClick={() => {
                      const current = value.components || [];
                      const next = current.includes(c) ? current.filter((x) => x !== c) : [...current, c];
                      onChange({ ...value, components: next });
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
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Auto-generation settings card — one per meal type (breakfast/lunch/snack) */
/* ---------------------------------------------------------------------- */
function AutoMealSettingsCard({ mealType, settings, set }) {
  const meta = MEAL_TYPE_META[mealType];
  const cfg = settings.autoMeals[mealType];
  const updateCfg = (patch) => set({ autoMeals: { ...settings.autoMeals, [mealType]: { ...cfg, ...patch } } });
  const toggleDay = (d) => updateCfg({ days: cfg.days.includes(d) ? cfg.days.filter((x) => x !== d) : [...cfg.days, d] });
  const toggleComponent = (c) => updateCfg({ composition: cfg.composition.includes(c) ? cfg.composition.filter((x) => x !== c) : [...cfg.composition, c] });

  return (
    <div>
      <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
        Pick which days should auto-fill with {meta.label.toLowerCase()}. Leave every day off to keep it fully manual, like today.
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {DAYS.map((d) => (
          <Chip key={d} active={cfg.days.includes(d)} onClick={() => toggleDay(d)} color={meta.color}>{d.slice(0, 3)}</Chip>
        ))}
      </div>

      <div className="mb-3">
        <div className="text-xs mb-1" style={{ color: C.ink }}>Composition</div>
        <div className="text-xs mb-1.5" style={{ color: C.inkSoft }}>
          Pick which parts make up {meta.label.toLowerCase()} — one recipe gets picked per part, every auto-fill day.
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMPONENT_OPTIONS.map((c) => (
            <Chip key={c} active={cfg.composition.includes(c)} onClick={() => toggleComponent(c)} color={meta.color}>{c}</Chip>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs mb-1" style={{ color: C.ink }}>Repetition</div>
        <select
          className="px-2 py-1 rounded text-sm"
          style={{ border: `1px solid ${C.line}` }}
          value={cfg.repetition}
          onChange={(e) => updateCfg({ repetition: e.target.value })}
        >
          {AUTO_REPETITION_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
      </div>

      <div>
        <div className="text-xs mb-1" style={{ color: C.ink }}>Baby-friendly</div>
        <BabyFriendlySettings mealType={mealType} value={settings.babyFriendly[mealType]} onChange={(v) => set({ babyFriendly: { ...settings.babyFriendly, [mealType]: v } })} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Collapsible settings section — starts minimized, plus icon to expand   */
/* ---------------------------------------------------------------------- */
function SettingsSection({ title, subtitle, icon: Icon, color, children }) {
  const [open, setOpen] = useState(false);
  const accent = color || C.forest;
  return (
    <div className="rounded-xl mb-4" style={{ border: `1px solid ${C.line}`, background: C.white, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3.5 text-left"
        style={{ background: open ? C.paperDark : C.white }}
      >
        {Icon && <Icon size={17} color={accent} />}
        <div className="flex-grow min-w-0">
          <div style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 15, color: C.ink }}>{title}</div>
          {subtitle && <div className="text-xs" style={{ color: C.inkSoft }}>{subtitle}</div>}
        </div>
        <div className="rounded-full flex items-center justify-center shrink-0" style={{ width: 24, height: 24, background: `${accent}1A` }}>
          {open ? <Minus size={13} color={accent} /> : <Plus size={13} color={accent} />}
        </div>
      </button>
      {open && (
        <div className="p-4" style={{ borderTop: `1px solid ${C.line}` }}>
          {children}
        </div>
      )}
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

      <SettingsSection title="Supper" subtitle="Composition, repetition, freezer, baby-friendly, and per-day rules" icon={MEAL_TYPE_META.supper.icon} color={MEAL_TYPE_META.supper.color}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          <Card>
            <SectionLabel>Days to plan</SectionLabel>
            <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
              Which days supper auto-fills when you hit Generate. Days you leave off just won't get a supper plan.
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => (
                <Chip
                  key={d}
                  active={settings.supperDays.includes(d)}
                  onClick={() => set({ supperDays: settings.supperDays.includes(d) ? settings.supperDays.filter((x) => x !== d) : [...settings.supperDays, d] })}
                  color={MEAL_TYPE_META.supper.color}
                >
                  {d.slice(0, 3)}
                </Chip>
              ))}
            </div>
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
              Makes sure something baby-friendly shows up in supper. Tag recipes as baby-friendly from the recipe card or editor.
            </div>
            <BabyFriendlySettings mealType="supper" value={settings.babyFriendly.supper} onChange={(v) => set({ babyFriendly: { ...settings.babyFriendly, supper: v } })} />
          </Card>
        </div>

        <Card style={{ marginTop: 16 }}>
          <SectionLabel>Weekly day rules</SectionLabel>
          <div className="text-xs italic mb-2" style={{ color: C.inkSoft }}>Leave as "Any" for no rule.</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {DAYS.map((d) => {
              const rule = settings.weeklyDayRules[d] || { category: "" };
              return (
                <div key={d} className="rounded-lg p-2" style={{ background: C.paperDark }}>
                  <div className="text-xs font-semibold uppercase mb-1.5" style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "0.05em" }}>{d.slice(0, 3)}</div>
                  <select
                    className="w-full text-xs px-1 py-1 rounded"
                    style={{ border: `1px solid ${C.line}` }}
                    value={rule.category}
                    onChange={(e) => set({ weeklyDayRules: { ...settings.weeklyDayRules, [d]: { ...rule, category: e.target.value } } })}
                  >
                    <option value="">Any category</option>
                    {CATEGORY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </Card>
      </SettingsSection>

      {AUTO_MEAL_TYPES.map((mt) => (
        <SettingsSection key={mt} title={MEAL_TYPE_META[mt].label} icon={MEAL_TYPE_META[mt].icon} color={MEAL_TYPE_META[mt].color}>
          <AutoMealSettingsCard mealType={mt} settings={settings} set={set} />
        </SettingsSection>
      ))}

      <SettingsSection title="General" subtitle="Shared across every meal type — meat/dairy, repetition, priority, pantry staples, grocery categories" icon={SettingsIcon} color={C.inkSoft}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
          <Card>
            <SectionLabel>Meat & dairy</SectionLabel>
            <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
              Keeps a meat recipe and a dairy recipe from ever landing on the same day, across every meal type.
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={settings.noMeatDairyMix} onChange={(e) => set({ noMeatDairyMix: e.target.checked })} />
              Don't mix meat and dairy recipes on the same day
            </label>
          </Card>

          <Card>
            <SectionLabel>Repetition</SectionLabel>
            <div className="text-xs mb-2" style={{ color: C.inkSoft }}>
              Controls how soon the same recipe is allowed to repeat, based on how it's tagged. Used by supper, and by any meal type set to "Full rotation."
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
              When filling a slot, the planner reaches for these recipes first before picking randomly. Used by supper, and by any meal type set to "Full rotation."
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
        </div>
      </SettingsSection>
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
    return true;
  };

  // in "separate" mode, baby-friendly recipes are reserved for the dedicated baby slot only —
  // they're never eligible to fill a regular meal component or the freezer meal-of-the-day
  const supperBabyFriendly = settings.babyFriendly?.supper;
  const babyReservedOnly = supperBabyFriendly?.enabled && supperBabyFriendly.mode === "separate";
  const excludedForRegularMeal = (recipe) => babyReservedOnly && recipe.babyFriendly;

  // in "components" mode, specific meal components (e.g. protein, starch) must themselves
  // be filled by a baby-friendly recipe — no separate extra dish gets added
  const babyRequiredComponents = supperBabyFriendly?.enabled && supperBabyFriendly.mode === "components"
    ? supperBabyFriendly.components || []
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
        warnings.push(`No recipe available for "${component}" on ${dayName}${dRule?.category ? ` (rule: ${dRule.category})` : ""}.`);
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

// Auto-generation for breakfast/lunch/snack — much simpler than supper: no component
// composition, freezer, or baby-friendly logic, just N recipes per day from that meal
// type's own recipe pool, with a repetition mode the user picks per meal type in Settings.
// dayCategories: { [dayName]: [category, ...] } — recipe categories already committed to that
// day by OTHER meal types (supper's fresh plan, or other auto meal types earlier in this run),
// so the meat/dairy rule can be enforced across the whole day, not just within one meal type.
function generateAutoMealType({ mealType, days, composition, repetitionMode, recipes, settings, usageHistory, weekStart, dayCategories = {} }) {
  const pool = recipes.filter((r) => (r.mealType || "supper") === mealType);
  const newHistory = { ...usageHistory };
  const warnings = [];
  const assignments = {};
  const label = MEAL_TYPE_META[mealType].label.toLowerCase();

  const mealBabyFriendly = settings.babyFriendly?.[mealType];
  const babyEnabled = !!mealBabyFriendly?.enabled;
  const babyMode = mealBabyFriendly?.mode || "separate";
  const babyComponents = babyMode === "components" ? mealBabyFriendly.components || [] : [];
  const babyReservedOnly = babyEnabled && babyMode === "separate";

  const eligibleFull = (recipe) => {
    const tagKey = recipe.favorite ? "favorite" : recipe.easy ? "easy" : "regular";
    const rule = settings.repetition[tagKey] || "none";
    const minWeeks = REPEAT_WEEKS[rule];
    const last = (newHistory[recipe.id] || []).slice(-1)[0];
    return weeksSince(last) >= minWeeks;
  };
  const eligibleWeekOnly = (recipe) => !(newHistory[recipe.id] || []).includes(weekStart);

  days.forEach((dayName) => {
    const dayCats = [...(dayCategories[dayName] || [])];
    const categoryOK = (recipe) => {
      if (!settings.noMeatDairyMix || recipe.category === "parve") return true;
      return !dayCats.some((c) => (c === "meat" && recipe.category === "dairy") || (c === "dairy" && recipe.category === "meat"));
    };

    const pickOne = (base) => {
      let candidates = base.filter(categoryOK);
      const repFiltered = repetitionMode === "full" ? candidates.filter(eligibleFull) : repetitionMode === "weekOnly" ? candidates.filter(eligibleWeekOnly) : candidates;
      if (repFiltered.length) candidates = repFiltered;
      if (candidates.length === 0) candidates = base; // last resort: drop every soft rule rather than leave the slot empty
      if (candidates.length === 0) return null;
      const favorites = candidates.filter((r) => r.favorite);
      return repetitionMode === "full" && settings.prioritizeFavorite && favorites.length ? pickRandom(favorites) : pickRandom(candidates);
    };

    const dayPicks = [];
    const pickedIds = new Set();

    composition.forEach((component) => {
      const isBabyRequired = babyMode === "components" && babyComponents.includes(component);
      let base = pool.filter((r) => !pickedIds.has(r.id) && (r.type === component || (r.type === "combo" && r.comboTypes.includes(component))));
      if (isBabyRequired) base = base.filter((r) => r.babyFriendly);
      else if (babyReservedOnly) base = base.filter((r) => !r.babyFriendly);

      const chosen = pickOne(base);
      if (!chosen) { warnings.push(`No ${component} ${label} recipe available for ${dayName}`); return; }
      dayPicks.push(chosen.id);
      pickedIds.add(chosen.id);
      dayCats.push(chosen.category);
      newHistory[chosen.id] = [...(newHistory[chosen.id] || []), weekStart];
    });

    if (babyReservedOnly) {
      const babyBase = pool.filter((r) => r.babyFriendly && !pickedIds.has(r.id));
      const chosen = pickOne(babyBase);
      if (chosen) {
        dayPicks.push(chosen.id);
        pickedIds.add(chosen.id);
        dayCats.push(chosen.category);
        newHistory[chosen.id] = [...(newHistory[chosen.id] || []), weekStart];
      } else if (babyBase.length === 0) {
        warnings.push(`No baby-friendly ${label} recipe available for ${dayName}`);
      }
    }

    assignments[dayName] = dayPicks;
  });

  return { assignments, usageHistory: newHistory, warnings };
}

/* ---------------------------------------------------------------------- */
/* Planner Tab — meal cards, day tabs, recipe picker panel                */
/* ---------------------------------------------------------------------- */
function AddMealTile({ accent, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl flex flex-col items-center justify-center gap-1.5"
      style={{ minHeight: 108, border: `1px dashed ${C.line}`, background: C.white }}
    >
      <div className="rounded-full flex items-center justify-center" style={{ width: 30, height: 30, background: `${accent}1A` }}>
        <Plus size={15} color={accent} />
      </div>
      <span className="text-xs font-medium text-center px-2" style={{ color: accent }}>{label}</span>
    </button>
  );
}

function ManualMealCard({ recipe, meta, onClick, onRemove }) {
  const cost = recipe.ingredients.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
  return (
    <div className="rounded-xl relative card-hover cursor-pointer" style={{ background: C.white, border: `1px solid ${C.line}` }} onClick={onClick}>
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-1.5 right-1.5 rounded-full flex items-center justify-center z-10"
        style={{ width: 20, height: 20, background: "rgba(255,255,255,0.9)" }}
        title="Remove"
      >
        <X size={12} color={C.danger} />
      </button>
      <div className="rounded-t-xl flex items-center justify-center" style={{ height: 52, background: `${meta.color}1A` }}>
        <meta.icon size={20} color={meta.color} />
      </div>
      <div className="p-2">
        <div className="text-xs font-semibold leading-snug" style={{ fontFamily: "'Poppins', sans-serif", color: C.ink }}>
          {recipe.name || "Untitled recipe"}
        </div>
        {cost > 0 && (
          <div className="text-[10px] mt-0.5" style={{ color: C.inkSoft, fontFamily: "'JetBrains Mono', monospace" }}>~${cost.toFixed(2)}</div>
        )}
      </div>
    </div>
  );
}

function MealTypeSection({ mealType, recipes, recipeIds, onAdd, onSwap, onRemove, isAuto, onGenerate }) {
  const meta = MEAL_TYPE_META[mealType];
  return (
    <div>
      <div className="flex items-center gap-3 mb-2.5">
        <meta.icon size={16} color={meta.color} />
        <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 15, color: C.ink }}>{meta.label}</h3>
        <div className="flex-grow h-px" style={{ background: C.line }} />
        {isAuto && (
          <button onClick={onGenerate} title={`Auto-fill ${meta.label.toLowerCase()} for every day you've set up in Settings`} className="flex items-center gap-1 text-xs" style={{ color: C.inkSoft }}>
            <RefreshCw size={12} /> Generate week
          </button>
        )}
      </div>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
        {recipeIds.map((id, idx) => {
          const recipe = recipes.find((r) => r.id === id);
          if (!recipe) return null;
          return <ManualMealCard key={idx} recipe={recipe} meta={meta} onClick={() => onSwap(idx)} onRemove={() => onRemove(idx)} />;
        })}
        <AddMealTile accent={meta.color} onClick={onAdd} label={recipeIds.length === 0 ? `Add ${meta.label.toLowerCase()}` : "Add another"} />
      </div>
    </div>
  );
}

function MealSlotCard({ slot, recipe, onSwap, onRemove, onView }) {
  const accent = slot.isPrep && slot.component === "freezer-prep" ? C.dustyBlue : slot.isBaby ? C.plum : (TYPE_COLORS[slot.component] || C.forest);
  const label = slot.isPrep && slot.component === "freezer-prep"
    ? "freezer prep"
    : slot.isBaby
    ? "baby friendly"
    : slot.coveredComponents && slot.coveredComponents.length > 1
    ? `combo: ${slot.coveredComponents.join(" + ")}`
    : slot.component;
  return (
    <div className="rounded-xl relative card-hover" style={{ background: C.white, border: `1px solid ${C.line}` }}>
      <div className="absolute top-1.5 right-1.5 flex gap-1 z-10">
        {recipe && (
          <button onClick={() => onView(recipe)} title="View recipe details" className="rounded-full flex items-center justify-center" style={{ width: 20, height: 20, background: "rgba(255,255,255,0.9)" }}>
            <Eye size={12} color={C.inkSoft} />
          </button>
        )}
        <button onClick={onRemove} title="Remove" className="rounded-full flex items-center justify-center" style={{ width: 20, height: 20, background: "rgba(255,255,255,0.9)" }}>
          <X size={12} color={C.danger} />
        </button>
      </div>
      <div className="rounded-t-xl flex items-center justify-center cursor-pointer" style={{ height: 56, background: `${accent}1A` }} onClick={onSwap}>
        <ChefHat size={22} color={accent} />
      </div>
      <div className="p-2.5 cursor-pointer" onClick={onSwap}>
        <div className="text-[9px] uppercase font-semibold mb-1" style={{ color: accent, letterSpacing: "0.05em", fontFamily: "'Inter', sans-serif" }}>{label}</div>
        <div className="text-xs font-semibold leading-snug" style={{ fontFamily: "'Poppins', sans-serif", color: C.ink }}>
          {recipe?.name || "Choose a recipe"}
        </div>
        {recipe && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span
              className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded text-white"
              style={{ background: CATEGORY_COLORS[recipe.category] || C.inkSoft, fontFamily: "'Inter', sans-serif", letterSpacing: "0.03em" }}
            >
              {recipe.category}
            </span>
            {recipe.favorite && <Heart size={10} fill={C.danger} color={C.danger} />}
            {recipe.easy && <Zap size={10} fill={C.forest} color={C.forest} />}
            {recipe.freezer && <Snowflake size={10} color={C.dustyBlue} />}
            {recipe.babyFriendly && <Baby size={10} color={C.plum} />}
          </div>
        )}
      </div>
    </div>
  );
}

function RecipePickerPanel({ title, options, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const filtered = options.filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[60] flex justify-end no-print" style={{ background: "rgba(46,42,34,0.35)" }} onClick={onClose}>
      <div className="slide-in-right h-full w-full sm:w-96 flex flex-col" style={{ background: C.paper }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4" style={{ borderBottom: `1px solid ${C.line}` }}>
          <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 16, color: C.ink }}>{title}</h3>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>
        <div className="p-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5" color={C.inkSoft} />
            <input
              className="pl-8 pr-3 py-2 rounded-lg text-sm w-full"
              style={{ border: `1px solid ${C.line}`, background: C.white }}
              placeholder="Search recipes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="flex-grow overflow-y-auto px-3 pb-4 space-y-2">
          {filtered.map((r) => {
            const cost = r.ingredients.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
            return (
              <button
                key={r.id}
                onClick={() => onPick(r.id)}
                className="w-full text-left rounded-lg p-2.5 flex items-center gap-2.5 card-hover"
                style={{ background: C.white, border: `1px solid ${C.line}` }}
              >
                <div className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 36, height: 36, background: `${CATEGORY_COLORS[r.category] || C.forest}1A` }}>
                  <ChefHat size={16} color={CATEGORY_COLORS[r.category] || C.forest} />
                </div>
                <div className="min-w-0 flex-grow">
                  <div className="text-sm font-medium truncate" style={{ fontFamily: "'Poppins', sans-serif", color: C.ink }}>{r.name || "Untitled recipe"}</div>
                  <div className="text-[11px]" style={{ color: C.inkSoft }}>{r.category}{cost > 0 && ` · ~$${cost.toFixed(2)}`}</div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="text-xs italic text-center py-8" style={{ color: C.inkSoft }}>No matching recipes</div>}
        </div>
      </div>
    </div>
  );
}

function PlannerTab({ recipes, setRecipes, settings, plan, setPlan, usageHistory, setUsageHistory, freezerStock, setFreezerStock, setGroceryChecked, manualMeals, setManualMeals }) {
  const selectedDays = settings.supperDays && settings.supperDays.length ? settings.supperDays : DAYS; // configured in Settings
  const [viewingDay, setViewingDay] = useState(DAYS[new Date().getDay()]);
  const [picker, setPicker] = useState(null); // { title, options, onPick }
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

  // auto-generation and swapping only ever draw from supper recipes — breakfast/lunch/snack
  // are planned manually via their own sections below
  const supperRecipes = useMemo(() => recipes.filter((r) => (r.mealType || "supper") === "supper"), [recipes]);

  const saveViewedRecipe = (r) => {
    setRecipes((prev) => prev.map((x) => (x.id === r.id ? r : x)));
    setViewingRecipe(null);
  };

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

  // scoped to a set of recipe ids so regenerating one meal type never wipes another's
  // usage history — usageHistory is shared across supper/breakfast/lunch/snack since
  // recipe ids never collide across meal types
  const stripWeek = (history, weekStart, recipeIds) => {
    const idSet = new Set(recipeIds);
    const cleaned = { ...history };
    idSet.forEach((id) => {
      if (cleaned[id]) cleaned[id] = cleaned[id].filter((d) => d !== weekStart);
    });
    return cleaned;
  };

  const doGenerate = () => {
    const weekStart = isoWeek();
    const baseline = getBaseline(weekStart);
    const cleanedHistory = stripWeek(usageHistory, weekStart, supperRecipes.map((r) => r.id));
    const result = generatePlan({
      selectedDays: DAYS.filter((d) => selectedDays.includes(d)),
      recipes: supperRecipes,
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

  // release this meal type's currently-assigned recipes' usage for the week, so re-running
  // Generate doesn't count last run's picks against this run's eligibility
  const releaseMealTypeWeek = (history, mealType, weekStart) => {
    let released = { ...history };
    Object.values(manualMeals).forEach((day) => {
      (day[mealType] || []).forEach((recipeId) => {
        const dates = released[recipeId];
        if (dates) {
          const idx = dates.lastIndexOf(weekStart);
          if (idx !== -1) released[recipeId] = [...dates.slice(0, idx), ...dates.slice(idx + 1)];
        }
      });
    });
    return released;
  };

  // categories already committed to each day by every OTHER meal type — feeds the meat/dairy
  // rule so a whole day is checked, not just one meal type in isolation
  const dayCategoriesExcluding = (days, excludeMealType, planOverride) => {
    const result = {};
    days.forEach((d) => {
      const cats = [];
      ((planOverride ?? plan)?.days[d]?.slots || []).forEach((slot) => {
        const r = recipes.find((x) => x.id === slot.recipeId);
        if (r) cats.push(r.category);
      });
      AUTO_MEAL_TYPES.forEach((mt) => {
        if (mt === excludeMealType) return;
        (manualMeals[d]?.[mt] || []).forEach((id) => {
          const r = recipes.find((x) => x.id === id);
          if (r) cats.push(r.category);
        });
      });
      result[d] = cats;
    });
    return result;
  };

  const generateAutoMeal = (mealType) => {
    const cfg = settings.autoMeals[mealType];
    if (!cfg.days.length || !cfg.composition.length) return;
    const weekStart = isoWeek();
    const releasedHistory = releaseMealTypeWeek(usageHistory, mealType, weekStart);
    const dayCategories = dayCategoriesExcluding(cfg.days, mealType);
    const result = generateAutoMealType({ mealType, days: cfg.days, composition: cfg.composition, repetitionMode: cfg.repetition, recipes, settings, usageHistory: releasedHistory, weekStart, dayCategories });
    setManualMeals((prev) => {
      const next = { ...prev };
      cfg.days.forEach((d) => { next[d] = { ...next[d], [mealType]: result.assignments[d] || [] }; });
      return next;
    });
    setUsageHistory(result.usageHistory);
    setWarnings(result.warnings);
  };

  // combined trigger for the top-of-page "Generate All" button — computes supper plus every
  // auto-enabled meal type in plain variables first, then commits state once, so each meal
  // type's usage-history update doesn't clobber the others (they'd race if each called its
  // own setUsageHistory off a stale closure of the same shared state)
  const generateAllMeals = () => {
    const weekStart = isoWeek();
    const baseline = getBaseline(weekStart);
    let history = stripWeek(usageHistory, weekStart, supperRecipes.map((r) => r.id));
    const supperResult = generatePlan({
      selectedDays: DAYS.filter((d) => selectedDays.includes(d)),
      recipes: supperRecipes,
      settings,
      usageHistory: history,
      freezerStock: baseline.freezerStock,
      useUpIngredients,
      excludeCategories,
      weekStart,
    });
    history = supperResult.usageHistory;

    const nextManualMeals = { ...manualMeals };
    let allWarnings = [...supperResult.warnings];

    // seed from supper's freshly-generated plan (not the old committed one), then let each
    // auto meal type's picks feed forward into the next
    const dayCategories = {};
    Object.entries(supperResult.plan.days).forEach(([d, day]) => {
      dayCategories[d] = day.slots.map((s) => supperRecipes.find((r) => r.id === s.recipeId)?.category).filter(Boolean);
    });

    AUTO_MEAL_TYPES.forEach((mt) => {
      const cfg = settings.autoMeals[mt];
      if (!cfg.days.length || !cfg.composition.length) return;
      const releasedHistory = releaseMealTypeWeek(history, mt, weekStart);
      const result = generateAutoMealType({ mealType: mt, days: cfg.days, composition: cfg.composition, repetitionMode: cfg.repetition, recipes, settings, usageHistory: releasedHistory, weekStart, dayCategories });
      history = result.usageHistory;
      cfg.days.forEach((d) => {
        nextManualMeals[d] = { ...nextManualMeals[d], [mt]: result.assignments[d] || [] };
        const picked = (result.assignments[d] || []).map((id) => recipes.find((r) => r.id === id)?.category).filter(Boolean);
        dayCategories[d] = [...(dayCategories[d] || []), ...picked];
      });
      allWarnings = [...allWarnings, ...result.warnings];
    });

    setPlan(supperResult.plan);
    setManualMeals(nextManualMeals);
    setUsageHistory(history);
    setFreezerStock(supperResult.freezerStock);
    setWarnings(allWarnings);
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
      recipes: supperRecipes,
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
    return supperRecipes.filter((r) => {
      if (r.id === slot.recipeId) return false; // already shown as the current selection
      if (usedElsewhere.has(r.id)) return false;
      if (slot.isPrep && slot.component === "freezer-prep") return r.freezer;
      if (slot.isBaby) return r.babyFriendly;
      return r.type === slot.component || (r.type === "combo" && r.comboTypes.includes(slot.component));
    });
  };

  const addManualMeal = (dayName, mealType, recipeId) => {
    setManualMeals((prev) => ({
      ...prev,
      [dayName]: { ...prev[dayName], [mealType]: [...(prev[dayName]?.[mealType] || []), recipeId] },
    }));
  };
  const removeManualMeal = (dayName, mealType, index) => {
    setManualMeals((prev) => ({
      ...prev,
      [dayName]: { ...prev[dayName], [mealType]: (prev[dayName]?.[mealType] || []).filter((_, i) => i !== index) },
    }));
  };
  const swapManualMeal = (dayName, mealType, index, recipeId) => {
    setManualMeals((prev) => {
      const arr = [...(prev[dayName]?.[mealType] || [])];
      arr[index] = recipeId;
      return { ...prev, [dayName]: { ...prev[dayName], [mealType]: arr } };
    });
  };

  const openSupperPicker = (dayName, slotIdx) => {
    setPicker({
      title: "Swap this meal",
      options: getSwapOptions(dayName, slotIdx),
      onPick: (recipeId) => { swapSlotRecipe(dayName, slotIdx, recipeId); setPicker(null); },
    });
  };
  const openManualPicker = (dayName, mealType, index = null) => {
    const used = new Set((manualMeals[dayName]?.[mealType] || []).filter((_, i) => i !== index));
    setPicker({
      title: index === null ? `Add ${MEAL_TYPE_META[mealType].label.toLowerCase()}` : `Swap ${MEAL_TYPE_META[mealType].label.toLowerCase()}`,
      options: recipes.filter((r) => (r.mealType || "supper") === mealType && !used.has(r.id)),
      onPick: (recipeId) => {
        if (index === null) addManualMeal(dayName, mealType, recipeId);
        else swapManualMeal(dayName, mealType, index, recipeId);
        setPicker(null);
      },
    });
  };

  const recipeCost = (recipeId) => {
    const recipe = recipes.find((r) => r.id === recipeId);
    if (!recipe) return 0;
    return recipe.ingredients.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
  };

  // calendar date-of-month for each day tab, based on the current week (Sunday–Saturday, local time)
  const weekDates = useMemo(() => {
    const now = new Date();
    const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return DAYS.map((_, i) => new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i).getDate());
  }, []);

  const dayTotalCost = useMemo(() => {
    const supperCost = (plan?.days[viewingDay]?.slots || []).reduce((sum, slot) => sum + recipeCost(slot.recipeId), 0);
    const manualCost = ["breakfast", "lunch", "snack"].reduce(
      (sum, mt) => sum + (manualMeals[viewingDay]?.[mt] || []).reduce((s, id) => s + recipeCost(id), 0),
      0
    );
    return supperCost + manualCost;
  }, [plan, viewingDay, manualMeals, recipes]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 18, color: C.ink }}>This week</h2>
        <button
          onClick={generateAllMeals}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ background: C.forestDark }}
          title="Generate supper plus every meal type you've set to auto-fill in Settings"
        >
          <Sparkles size={15} /> Generate All
        </button>
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

      <div className="flex items-center gap-2 overflow-x-auto pb-1 mb-5 no-scrollbar">
        {DAYS.map((d, idx) => (
          <button
            key={d}
            onClick={() => setViewingDay(d)}
            className="flex flex-col items-center justify-center rounded-xl shrink-0 transition-colors"
            style={{
              minWidth: 62,
              height: 52,
              background: viewingDay === d ? C.forest : C.white,
              border: `1px solid ${viewingDay === d ? C.forest : C.line}`,
            }}
          >
            <span
              className="text-[10px] font-semibold uppercase"
              style={{ color: viewingDay === d ? "#fff" : C.inkSoft, letterSpacing: "0.06em", fontFamily: "'Inter', sans-serif" }}
            >
              {d.slice(0, 3)}
            </span>
            <span
              className="text-[13px] font-semibold leading-tight"
              style={{ color: viewingDay === d ? "#fff" : C.ink, fontFamily: "'Poppins', sans-serif" }}
            >
              {weekDates[idx]}
            </span>
            {plan?.days[d] && (
              <span className="rounded-full mt-0.5" style={{ width: 4, height: 4, background: viewingDay === d ? "#fff" : C.forest }} />
            )}
          </button>
        ))}
      </div>

      {dayTotalCost > 0 && (
        <div className="text-xs mb-4" style={{ color: C.inkSoft }}>
          Estimated cost for {viewingDay}:{" "}
          <span style={{ color: C.forestDark, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>~${dayTotalCost.toFixed(2)}</span>
        </div>
      )}

      <div className="space-y-7">
        {["breakfast", "lunch", "snack"].map((mealType) => (
          <MealTypeSection
            key={mealType}
            mealType={mealType}
            recipes={recipes}
            recipeIds={manualMeals[viewingDay]?.[mealType] || []}
            onAdd={() => openManualPicker(viewingDay, mealType)}
            onSwap={(idx) => openManualPicker(viewingDay, mealType, idx)}
            onRemove={(idx) => removeManualMeal(viewingDay, mealType, idx)}
            isAuto={settings.autoMeals[mealType].days.length > 0 && settings.autoMeals[mealType].composition.length > 0}
            onGenerate={() => generateAutoMeal(mealType)}
          />
        ))}

        <div>
          <div className="flex items-center gap-3 mb-2.5">
            <ChefHat size={16} color={C.forest} />
            <h3 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 15, color: C.ink }}>Supper</h3>
            <div className="flex-grow h-px" style={{ background: C.line }} />
            {plan?.days[viewingDay] && (
              <button onClick={() => regenerateDay(viewingDay)} title="Regenerate this day" className="flex items-center gap-1 text-xs" style={{ color: C.inkSoft }}>
                <RefreshCw size={12} /> Regenerate
              </button>
            )}
          </div>

          <div className="rounded-xl flex flex-wrap items-center gap-3 mb-4" style={{ background: C.white, border: `1px solid ${C.line}`, padding: "10px 14px" }}>
            <div className="relative">
              <div
                ref={useUpScrollRef}
                className="no-scrollbar flex items-center gap-1.5 px-2 py-1 rounded-lg overflow-x-auto"
                style={{ border: `1px solid ${C.line}`, background: C.white, width: "min(240px, calc(100vw - 90px))" }}
              >
                <input
                  className="text-xs bg-transparent shrink-0"
                  style={{ border: "none", outline: "none", width: 90, padding: 0 }}
                  placeholder={useUpIngredients.length === 0 ? "Use up: e.g. spinach" : "Add more…"}
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

            <div className="flex flex-wrap gap-1.5">
              {["meat", "fish", "dairy"].map((cat) => (
                <Chip key={cat} active={excludeCategories.includes(cat)} onClick={() => toggleExclude(cat)} color={C.rust}>
                  No {cat}
                </Chip>
              ))}
            </div>

            <div className="flex gap-2 sm:ml-auto">
              <button onClick={doGenerate} className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: C.forest }}>
                <Calendar size={13} /> Generate
              </button>
              <button onClick={clear} className="px-3.5 py-1.5 rounded-lg text-xs" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }}>
                Clear
              </button>
            </div>
          </div>

          {plan?.days[viewingDay] ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
              {plan.days[viewingDay].slots.map((slot, i) => (
                <MealSlotCard
                  key={i}
                  slot={slot}
                  recipe={recipes.find((r) => r.id === slot.recipeId)}
                  onSwap={() => openSupperPicker(viewingDay, i)}
                  onRemove={() => removeSlot(viewingDay, i)}
                  onView={setViewingRecipe}
                />
              ))}
              {plan.days[viewingDay].slots.length === 0 && (
                <div className="text-xs italic text-center py-4 col-span-full" style={{ color: C.inkSoft }}>Nothing planned</div>
              )}
            </div>
          ) : (
            <div className="fade-in text-center py-10 flex flex-col items-center gap-2" style={{ color: C.inkSoft }}>
              <Calendar size={24} color={C.line} />
              <div className="text-sm">Pick your days above and hit Generate to build supper for the week.</div>
            </div>
          )}
        </div>
      </div>

      {picker && (
        <RecipePickerPanel
          title={picker.title}
          options={picker.options}
          onPick={picker.onPick}
          onClose={() => setPicker(null)}
        />
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
          babyFriendlyEnabled={Object.values(settings.babyFriendly).some((c) => c.enabled)}
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
  const [manualMeals, setManualMeals] = useState(buildEmptyManualMeals());
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
      const loadedMM = row?.manual_meals || {};
      const mm = {};
      DAYS.forEach((d) => { mm[d] = { breakfast: [], lunch: [], snack: [], ...(loadedMM[d] || {}) }; });

      setRecipes(r.map((recipe) => ({ mealType: "supper", ...recipe })));
      const migratedRules = {};
      DAYS.forEach((d) => {
        const old = (s.weeklyDayRules || {})[d];
        if (old && "mode" in old) {
          // migrate legacy {mode, value} shape to a plain category field
          migratedRules[d] = { category: old.mode === "category" ? old.value : "" };
        } else {
          migratedRules[d] = { category: old?.category || "" };
        }
      });
      // migrate: legacy shape was one flat {enabled,mode,components} object shared by every
      // meal type; also normalizes old modes ("onlyIfMissing" / "always") to "separate"
      const legacyFlatBabyFriendly = s.babyFriendly && "enabled" in s.babyFriendly ? s.babyFriendly : null;
      const babyFriendly = {};
      MEAL_TYPE_OPTIONS.forEach((mt) => {
        const saved = mt === "supper" && legacyFlatBabyFriendly ? legacyFlatBabyFriendly : s.babyFriendly?.[mt];
        babyFriendly[mt] = saved
          ? { ...DEFAULT_SETTINGS.babyFriendly[mt], ...saved, mode: ["separate", "components"].includes(saved.mode) ? saved.mode : "separate" }
          : DEFAULT_SETTINGS.babyFriendly[mt];
      });
      const autoMeals = {
        breakfast: { ...DEFAULT_SETTINGS.autoMeals.breakfast, ...(s.autoMeals?.breakfast || {}) },
        lunch: { ...DEFAULT_SETTINGS.autoMeals.lunch, ...(s.autoMeals?.lunch || {}) },
        snack: { ...DEFAULT_SETTINGS.autoMeals.snack, ...(s.autoMeals?.snack || {}) },
      };
      setSettings({ ...DEFAULT_SETTINGS, ...s, weeklyDayRules: migratedRules, babyFriendly, autoMeals });
      setPlan(p);
      setUsageHistory(h);
      setFreezerStock(f);
      setGroceryChecked(gc);
      setManualMeals(mm);
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
  useEffect(() => { if (loaded) persist("manualMeals", manualMeals); }, [manualMeals, loaded]);

  const categoryMemory = useMemo(() => {
    const set = new Set();
    recipes.forEach((r) => r.ingredients.forEach((i) => i.category && set.add(i.category)));
    return Array.from(set);
  }, [recipes]);

  const handleLogout = () => { supabase.auth.signOut(); };
  const dismissWelcome = () => setSettings((s) => ({ ...s, hasSeenWelcome: true }));

  // Changing plans for an already-paid subscriber goes through Stripe's own billing
  // portal (modifies the existing subscription) — never a fresh checkout, which would
  // create a second, independently-billing subscription instead of upgrading the first.
  const openBillingPortal = async () => {
    const { data, error } = await supabase.functions.invoke("billing-portal", { body: { returnUrl: window.location.origin } });
    if (error || data?.error) {
      alert(data?.error || error?.message || "Couldn't open billing — try again.");
      return;
    }
    window.location.href = data.url;
  };

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
        .slide-in-right { animation: slideInRight .2s cubic-bezier(.2,.8,.3,1) both; }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(24px); }
          to { opacity: 1; transform: translateX(0); }
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
        {tab === "recipes" && <RecipesTab recipes={recipes} setRecipes={setRecipes} categoryMemory={categoryMemory} ingredientCategories={settings.ingredientCategories} babyFriendlyEnabled={Object.values(settings.babyFriendly).some((c) => c.enabled)} canUpload={hasProAccess} onUpgradeClick={() => setShowUpgrade(true)} />}
        {tab === "grocery" && (
          <GroceryListTab plan={plan} recipes={recipes} settings={settings} groceryChecked={groceryChecked} setGroceryChecked={setGroceryChecked} manualMeals={manualMeals} />
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
            manualMeals={manualMeals}
            setManualMeals={setManualMeals}
          />
        )}
        {tab === "settings" && <SettingsTab settings={settings} setSettings={setSettings} />}
      </div>

      <div className="px-3 sm:px-6 pb-6 max-w-7xl mx-auto no-print text-center text-xs" style={{ color: C.inkSoft }}>
        Questions or feedback? We're at{" "}
        <a href="mailto:support@plantodish.com" style={{ color: C.forest, textDecoration: "underline" }}>
          support@plantodish.com
        </a>{" "}
        anytime. ·{" "}
        <a href="/privacy.html" style={{ color: C.inkSoft, textDecoration: "underline" }}>
          Privacy Policy
        </a>
      </div>

      {!settings.hasSeenWelcome && <WelcomeGuide onClose={dismissWelcome} />}

      {assistantDraft && (
        <RecipeEditor
          recipe={assistantDraft}
          recipes={recipes}
          categoryMemory={categoryMemory}
          ingredientCategories={settings.ingredientCategories}
          babyFriendlyEnabled={Object.values(settings.babyFriendly).some((c) => c.enabled)}
          onSave={saveAssistantDraft}
          onClose={() => setAssistantDraft(null)}
          initialAIGenerated={true}
        />
      )}

      {showUpgrade && (
        <Pricing mode="upgrade" userEmail={session.user.email} currentTier={tier} isPaid={isPaid} onUpgradeRedirect={openBillingPortal} onClose={() => setShowUpgrade(false)} />
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
