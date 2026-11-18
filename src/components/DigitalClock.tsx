import React, { useState, useEffect } from "react";

export interface ClockPalette {
  name: string;
  id: string;
  date: string;
  hours: string;
  minutes: string;
  seconds: string;
  separators: string;
}

export const CLOCK_PALETTES: Record<string, ClockPalette> = {
  monza: {
    id: "monza",
    name: "Monza Racing",
    hours: "#ffffff",
    minutes: "#ffffff",
    seconds: "#ef4444",
    separators: "rgba(255, 255, 255, 0.4)",
    date: "#94a3b8",
  },
  crema: {
    id: "crema",
    name: "Crema Gold",
    hours: "#fef3c7",
    minutes: "#f59e0b",
    seconds: "#d97706",
    separators: "#78350f",
    date: "#a8a29e",
  },
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyberpunk 2077",
    hours: "#06b6d4",
    minutes: "#f43f5e",
    seconds: "#facc15",
    separators: "#818cf8",
    date: "#93c5fd",
  },
  tokyo: {
    id: "tokyo",
    name: "Tokyo Midnight",
    hours: "#e0e7ff",
    minutes: "#818cf8",
    seconds: "#34d399",
    separators: "#475569",
    date: "#64748b",
  },
  nordic: {
    id: "nordic",
    name: "Nordic Minimalist",
    hours: "#f8fafc",
    minutes: "#cbd5e1",
    seconds: "#38bdf8",
    separators: "#64748b",
    date: "#94a3b8",
  },
  vfd: {
    id: "vfd",
    name: "VFD Vintage",
    hours: "#2dd4bf",
    minutes: "#2dd4bf",
    seconds: "#f59e0b",
    separators: "#0f766e",
    date: "#14b8a6",
  },
};

interface DigitalClockProps {
  paletteId?: string;
  customPalette?: Partial<ClockPalette>;
  compact?: boolean;
}

export const DigitalClock: React.FC<DigitalClockProps> = ({
  paletteId = "cyberpunk",
  customPalette,
  compact = false,
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const basePalette = CLOCK_PALETTES[paletteId] || CLOCK_PALETTES.cyberpunk;
  const palette = { ...basePalette, ...customPalette };

  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (compact) {
    return (
      <div className="flex flex-col items-start justify-center px-2 sm:px-2.5 py-0.5 rounded-xl bg-decent-surface/70 border border-decent-border/50 backdrop-blur-md shadow-sm select-none">
        <span
          className="text-[9px] font-semibold tracking-wider uppercase leading-none"
          style={{ color: palette.date }}
        >
          {dateStr}
        </span>
        <div className="font-mono text-sm sm:text-base font-bold tracking-wider flex items-baseline leading-tight mt-0.5">
          <span style={{ color: palette.hours }}>{hours}</span>
          <span
            className="mx-0.5 animate-pulse"
            style={{ color: palette.separators }}
          >
            :
          </span>
          <span style={{ color: palette.minutes }}>{minutes}</span>
          <span
            className="mx-0.5 animate-pulse"
            style={{ color: palette.separators }}
          >
            :
          </span>
          <span className="text-[11px] sm:text-xs ml-0.5 font-semibold" style={{ color: palette.seconds }}>
            {seconds}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-2 lg:p-3 rounded-2xl bg-decent-surface/60 border border-decent-border/40 backdrop-blur-md shadow-lg select-none">
      <span
        className="text-[10px] lg:text-xs font-medium tracking-widest uppercase mb-0.5 lg:mb-1"
        style={{ color: palette.date }}
      >
        {dateStr}
      </span>
      <div className="font-mono text-2xl lg:text-4xl font-bold tracking-wider flex items-baseline">
        <span style={{ color: palette.hours }}>{hours}</span>
        <span
          className="mx-0.5 lg:mx-1 animate-pulse"
          style={{ color: palette.separators }}
        >
          :
        </span>
        <span style={{ color: palette.minutes }}>{minutes}</span>
        <span
          className="mx-0.5 lg:mx-1 animate-pulse"
          style={{ color: palette.separators }}
        >
          :
        </span>
        <span className="text-base lg:text-2xl ml-0.5" style={{ color: palette.seconds }}>
          {seconds}
        </span>
      </div>
    </div>
  );
};
