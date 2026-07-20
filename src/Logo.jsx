import React from "react";
import logoImg from "./assets/Logo.png";

// Matches the app's own design tokens (see C in PlannerApp.jsx / Auth.jsx)
export const BRAND = {
  sage: "#0A7248", // forestDark — used for the tagline text alongside the logo
};

export default function Logo({ size = 48 }) {
  return (
    <img
      src={logoImg}
      alt="Plan to Dish"
      style={{ width: size, height: "auto", display: "block" }}
    />
  );
}
