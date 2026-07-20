import React from "react";
import { BookOpen, Settings as SettingsIcon, Calendar, ShoppingCart, MessageCircle, Sparkles } from "lucide-react";
import Logo, { BRAND } from "./Logo.jsx";

const C = {
  paper: "#F6F7F4",
  paperDark: "#EAEBE6",
  ink: "#1C1E1B",
  inkSoft: "#63665F",
  forest: "#0F9D63",
  line: "#DEE0D8",
  white: "#FFFFFF",
};

const STEPS = [
  {
    icon: BookOpen,
    title: "Build your recipe box",
    body: "Add the recipes you actually cook — tag them as favorite, easy, or freezer meals so the planner knows how to use them.",
  },
  {
    icon: SettingsIcon,
    title: "Set your rules in Settings",
    body: "Meat & dairy separation, how often recipes repeat, freezer prep day, baby-friendly options — all adjustable there.",
  },
  {
    icon: Calendar,
    title: "Generate your week",
    body: "Head to Planner and hit Generate — your whole week gets planned automatically, based on what's in your recipe box.",
  },
  {
    icon: ShoppingCart,
    title: "Your grocery list builds itself",
    body: "Once the week's planned, the grocery list is ready too — organized by aisle, nothing to write out by hand.",
  },
  {
    icon: MessageCircle,
    title: "Stuck? Just ask",
    body: "The chat bubble in the bottom-right corner answers cooking questions any time — \"what can I make with X?\" and similar.",
  },
];

export default function WelcomeGuide({ onClose }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-4 py-8 overflow-y-auto" style={{ background: "rgba(46,42,34,0.55)" }}>
      <div
        className="pop-in rounded-2xl w-full max-w-md my-auto p-6"
        style={{ background: C.white, border: `1px solid ${C.line}`, boxShadow: "0 4px 16px rgba(46,42,34,0.18)" }}
      >
        <div className="flex flex-col items-center text-center mb-5">
          <Logo size={110} />
          <h2 style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 600, fontSize: 20, color: C.ink, marginTop: 8 }}>
            Welcome to Plan to Dish!
          </h2>
          <p className="text-sm mt-1" style={{ color: BRAND.sage }}>
            Here's how to get the most out of it.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="flex gap-3 p-3 rounded-xl" style={{ background: C.paperDark }}>
                <div
                  className="shrink-0 flex items-center justify-center rounded-full"
                  style={{ width: 34, height: 34, background: C.forest }}
                >
                  <Icon size={17} color="#fff" />
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: C.ink, fontFamily: "'Inter', sans-serif" }}>
                    {step.title}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
                    {step.body}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white flex items-center justify-center gap-1.5"
          style={{ background: C.forest }}
        >
          <Sparkles size={15} /> Let's get started
        </button>
      </div>
    </div>
  );
}
