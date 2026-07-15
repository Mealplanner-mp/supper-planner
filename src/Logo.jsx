import React from "react";

// Matches the app's own design tokens (see C in PlannerApp.jsx / Auth.jsx)
export const BRAND = {
  sage: "#0A7248", // forestDark — used for the tagline text alongside the logo
};

export default function Logo({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="32" cy="32" r="30" fill="#F6F7F4" />

      {/* plate */}
      <ellipse cx="32" cy="45" rx="24" ry="13" fill="#EAEBE6" />
      <ellipse cx="32" cy="45" rx="24" ry="13" stroke="#DEE0D8" strokeWidth="1.5" fill="none" />
      <ellipse cx="32" cy="44" rx="15" ry="8" stroke="#DEE0D8" strokeWidth="1" fill="none" opacity="0.8" />

      {/* big rounded checkmark, the hero shape */}
      <path
        d="M12 26 L25 40 L52 6"
        stroke="#0A7248"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* left: berry cluster */}
      <circle cx="25" cy="48.5" r="3.9" fill="#F0562F" />
      <circle cx="31.5" cy="46.5" r="3.3" fill="#D6478B" />
      <circle cx="29.5" cy="54" r="3" fill="#F0562F" />
      <ellipse cx="23.2" cy="47" rx="1.1" ry="0.7" fill="#FCE4DC" opacity="0.85" transform="rotate(-30 23.2 47)" />
      <ellipse cx="30.2" cy="45.1" rx="1" ry="0.6" fill="#FCE4DC" opacity="0.85" transform="rotate(-30 30.2 45.1)" />
      <ellipse cx="28.4" cy="52.3" rx="0.85" ry="0.55" fill="#FCE4DC" opacity="0.85" transform="rotate(-30 28.4 52.3)" />

      {/* right: leaf with a small accent berry */}
      <path d="M53 34 C43 32 34 39 37 48 C47 50 56 43 53 34 Z" fill="#84C126" />
      <path d="M51.5 34.5 Q45 40 38.5 47" stroke="#5C8A1A" strokeWidth="1" opacity="0.55" fill="none" strokeLinecap="round" />
      <path d="M37 48 L34 50.5" stroke="#5C8A1A" strokeWidth="1.2" opacity="0.6" strokeLinecap="round" />
      <circle cx="40" cy="49.5" r="2.7" fill="#D6478B" />
      <ellipse cx="38.9" cy="48.4" rx="0.8" ry="0.5" fill="#FCE4DC" opacity="0.85" transform="rotate(-30 38.9 48.4)" />
    </svg>
  );
}
