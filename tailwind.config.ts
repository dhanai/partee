import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        fairway: {
          DEFAULT: "#1a3c2a",
          50: "#f0f5f1",
          100: "#dce8df",
          200: "#b8d1bf",
          300: "#8ab598",
          400: "#5c9a72",
          500: "#3d7d55",
          600: "#2d6341",
          700: "#1a3c2a",
          800: "#122b1e",
          900: "#0b1a12",
        },
        cream: {
          DEFAULT: "#faf8f5",
          50: "#fdfcfb",
          100: "#faf8f5",
          200: "#f2ede6",
          300: "#e8e0d5",
        },
        charcoal: {
          DEFAULT: "#1c1c1e",
          50: "#f5f5f5",
          100: "#e5e5e5",
          200: "#c7c7c7",
          300: "#9a9a9a",
          400: "#6e6e6e",
          500: "#454545",
          600: "#2c2c2e",
          700: "#1c1c1e",
        },
        gold: {
          DEFAULT: "#c4a35a",
          light: "#dfc88a",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Display",
          "SF Pro Text",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      borderRadius: {
        "2xl": "1rem",
        "3xl": "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
