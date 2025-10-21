import defaultTheme from "tailwindcss/defaultTheme";
import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: { brand: { sky: "#3B82F6" } },
      fontFamily: {
        sans: ["Pretendard", ...defaultTheme.fontFamily.sans],
      },
    }
  },
  plugins: []
} satisfies Config;
