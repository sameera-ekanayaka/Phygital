/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          900: "#0f172a",
          800: "#1e293b",
          700: "#334155",
          600: "#475569",
        },
        gold: {
          DEFAULT: "#d4a853",
          light: "#e8c882",
          dark: "#b8923f",
        },
        teal: {
          DEFAULT: "#14b8a6",
          light: "#5eead4",
        },
        /* Warm borrower-portal palette */
        cream: {
          50: "#fdf8f0",
          100: "#faf3e8",
          200: "#f0e6d2",
          300: "#e5d5b8",
        },
        warm: {
          600: "#8b6f47",
          700: "#5c4a2e",
          800: "#3d3220",
          900: "#2a2318",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "Outfit",
          "system-ui",
          "sans-serif",
        ],
        handwritten: [
          "Caveat",
          "cursive",
        ],
      },
    },
  },
  plugins: [],
};
