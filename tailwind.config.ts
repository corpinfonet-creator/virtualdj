import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: { colors: { ink: "#070a0f", panel: "#10151e", cyan: "#34d6ff", lime: "#9cff57" } } },
  plugins: [],
} satisfies Config;
