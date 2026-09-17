import type { Config } from "tailwindcss";

export default {
  darkMode: "media",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        marinho: { DEFAULT: "#0E2846", 700: "#081A30", 300: "#6C7A8C", 100: "#D5D9DF" },
        laranja: { DEFAULT: "#E4782A", 700: "#B95C1A", 100: "#FBE4D2" },
        areia: { DEFAULT: "#F3EFE8", 200: "#E9E3D9" },
        ok: "#2E7D4F",
        atencao: "#B7791F",
        erro: "#8B1E1E",
        info: "#3E5C76",
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "Manrope", "system-ui", "sans-serif"],
      },
      borderRadius: { DEFAULT: "6px", lg: "12px" },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
