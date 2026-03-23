/** Clerk UI tuned to Parfade / mobile `theme.ts`. */
export const clerkParfadeAppearance = {
  variables: {
    colorPrimary: "#1a3c2a",
    colorBackground: "#ffffff",
    colorInputBackground: "#f2ede6",
    colorText: "#1c1c1e",
    colorTextSecondary: "#6e6e6e",
    borderRadius: "1rem",
  },
  elements: {
    rootBox: "w-full",
    card: "shadow-xl border border-[#ece8e1]",
    formButtonPrimary: "bg-[#1a3c2a] hover:bg-[#2d6341]",
  },
} as const;
