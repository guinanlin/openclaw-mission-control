/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["var(--font-heading)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        display: ["var(--font-display)", "serif"],
      },
      colors: {
        popover: "var(--popover)",
        "popover-foreground": "var(--popover-foreground)",
        "border-popover": "var(--border-popover)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
