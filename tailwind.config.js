/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        decent: {
          dark: "#0b0c0e",
          surface: "#141619",
          card: "#1a1d22",
          border: "#262a32",
          borderLight: "#373c47",
          text: "#f1f3f7",
          muted: "#8c94a4",
        },
        telemetry: {
          pressure: "#f97316",      // Warm orange
          targetPressure: "#fdba74",
          flow: "#38bdf8",          // Sky blue
          targetFlow: "#7dd3fc",
          weightFlow: "#06b6d4",    // Cyan
          temperature: "#f43f5e",   // Rose red
          weight: "#a855f7",        // Purple
          resistance: "#2dd4bf",    // Teal
        },
        race: {
          green: "#22c55e",
          greenHalo: "rgba(34, 197, 94, 0.4)",
          amber: "#f59e0b",
          amberHalo: "rgba(245, 158, 11, 0.4)",
          blue: "#0ea5e9",
          blueHalo: "rgba(14, 165, 233, 0.4)",
          stop: "#ef4444",
          stopHalo: "rgba(239, 68, 68, 0.5)",
          disabled: "#475569",
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
        sans: ['"Inter"', "system-ui", "-apple-system", "sans-serif"],
        display: ['"Cinzel"', '"Playfair Display"', "Georgia", "serif"],
      },
    },
  },
  plugins: [],
}
