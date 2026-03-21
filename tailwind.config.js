/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        shre: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          300: "#c4b5fd",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
          800: "#5b21b6",
          900: "#4c1d95",
          950: "#1a0a3e",
        },
        // Theme-aware semantic colors
        t: {
          bg1: "var(--c-bg-1)",
          bg2: "var(--c-bg-2)",
          bg3: "var(--c-bg-3)",
          glass: "var(--c-bg-glass)",
          input: "var(--c-bg-input)",
          hover: "var(--c-bg-hover)",
          active: "var(--c-bg-active)",
          card: "var(--c-bg-card)",
          badge: "var(--c-bg-badge)",
          "msg-user": "var(--c-msg-user)",
          "msg-ai": "var(--c-msg-ai)",
          1: "var(--c-text-1)",
          2: "var(--c-text-2)",
          3: "var(--c-text-3)",
          4: "var(--c-text-4)",
          5: "var(--c-text-5)",
          accent: "var(--c-accent)",
          "accent-soft": "var(--c-accent-soft)",
        },
      },
      borderColor: {
        t: {
          1: "var(--c-border-1)",
          2: "var(--c-border-2)",
        },
      },
    },
  },
  plugins: [],
};
