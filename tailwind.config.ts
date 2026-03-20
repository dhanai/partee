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
        fairway: "#0f5f3b",
        putting: "#15803d",
        sand: "#f8fafc",
      },
    },
  },
  plugins: [],
};

export default config;
