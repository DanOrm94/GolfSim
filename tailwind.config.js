/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Golf-inspired palette: deep fairway greens + warm accent.
        fairway: {
          50: "#f0f7f1",
          100: "#dcecde",
          200: "#bad9bd",
          300: "#8fbf94",
          400: "#5e9e66",
          500: "#3d7f45",
          600: "#2d6435",
          700: "#255029",
          800: "#1f4023",
          900: "#1a351e",
          950: "#0c1d10",
        },
        sand: {
          50: "#fbf8f1",
          100: "#f3ead6",
          200: "#e7d4ad",
          300: "#d9b87c",
          400: "#cd9d53",
          500: "#c08639",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
