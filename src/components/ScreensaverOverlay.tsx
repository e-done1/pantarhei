import React, { useState, useEffect, useRef } from "react";
import type { ScreensaverConfig } from "../types/screensaver.ts";

interface ScreensaverOverlayProps {
  config: ScreensaverConfig;
  isMachineActive: boolean; // True if espresso, steam, or rinse is running
}

// Curated high-resolution specialty coffee station & terroir aesthetics for default screensaver
const SAMPLE_SCREENSAVER_IMAGES = [
  "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?q=80&w=1600&auto=format&fit=crop", // Espresso pour
  "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1600&auto=format&fit=crop", // Coffee beans & light
  "https://images.unsplash.com/photo-1509785307050-d4066910ec1e?q=80&w=1600&auto=format&fit=crop", // Terroir farm
  "https://images.unsplash.com/photo-1442512595331-e89e73853f31?q=80&w=1600&auto=format&fit=crop", // Warm barista station
  "https://images.unsplash.com/photo-1447933601403-0c6688de566e?q=80&w=1600&auto=format&fit=crop", // Roasting beans
];

export const ScreensaverOverlay: React.FC<ScreensaverOverlayProps> = ({
  config,
  isMachineActive,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [time, setTime] = useState(new Date());

  // Anti-burn-in quadrant position (0: top-left, 1: top-right, 2: bottom-right, 3: bottom-left)
  const [quadrant, setQuadrant] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());

  // Activity tracking: Reset idle timer on any pointer, touch, or key action
  useEffect(() => {
    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
      if (isActive) {
        setIsActive(false);
      }
    };

    window.addEventListener("pointermove", handleUserActivity, { passive: true });
    window.addEventListener("pointerdown", handleUserActivity, { passive: true });
    window.addEventListener("touchstart", handleUserActivity, { passive: true });
    window.addEventListener("keydown", handleUserActivity, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handleUserActivity);
      window.removeEventListener("pointerdown", handleUserActivity);
      window.removeEventListener("touchstart", handleUserActivity);
      window.removeEventListener("keydown", handleUserActivity);
    };
  }, [isActive]);

  // Idle timer check loop
  useEffect(() => {
    if (!config.enabled) {
      setIsActive(false);
      return;
    }

    const interval = setInterval(() => {
      if (isMachineActive) {
        // Never trigger screensaver while pulling espresso, steaming, or rinsing!
        lastActivityRef.current = Date.now();
        if (isActive) setIsActive(false);
        return;
      }

      const idleMs = Date.now() - lastActivityRef.current;
      const timeoutMs = config.idleTimeoutMinutes * 60 * 1000;

      if (idleMs >= timeoutMs && !isActive) {
        setIsActive(true);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [config.enabled, config.idleTimeoutMinutes, isMachineActive, isActive]);

  // Live time ticker
  useEffect(() => {
    if (!isActive) return;
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, [isActive]);

  // Slideshow interval
  useEffect(() => {
    if (!isActive) return;
    const intervalSec = Math.max(5, config.slideshowIntervalSeconds || 15);
    const timer = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % SAMPLE_SCREENSAVER_IMAGES.length);
    }, intervalSec * 1000);

    return () => clearInterval(timer);
  }, [isActive, config.slideshowIntervalSeconds]);

  // Anti-burn-in drifting clock across quadrants
  useEffect(() => {
    if (!isActive || !config.antiBurnInDrift) return;

    const driftMs =
      config.driftSpeed === "slow"
        ? 35000
        : config.driftSpeed === "medium"
        ? 20000
        : 12000;

    const driftInterval = setInterval(() => {
      setQuadrant((prev) => (prev + 1) % 4);
    }, driftMs);

    return () => clearInterval(driftInterval);
  }, [isActive, config.antiBurnInDrift, config.driftSpeed]);

  if (!isActive) return null;

  // Format date & time components
  const hours = time.getHours().toString().padStart(2, "0");
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");
  const dateFormatted = time.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  const currentImg = SAMPLE_SCREENSAVER_IMAGES[currentImageIndex];

  // Quadrant coordinates for smooth anti-burn-in drift
  const quadrantStyles: React.CSSProperties[] = [
    { top: "12%", left: "10%", right: "auto", bottom: "auto" },    // 0: top-left
    { top: "12%", right: "10%", left: "auto", bottom: "auto" },   // 1: top-right
    { bottom: "14%", right: "10%", left: "auto", top: "auto" },   // 2: bottom-right
    { bottom: "14%", left: "10%", right: "auto", top: "auto" },   // 3: bottom-left
  ];

  const currentClockStyle = config.antiBurnInDrift
    ? quadrantStyles[quadrant]
    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      onClick={() => setIsActive(false)}
      className="fixed inset-0 z-50 overflow-hidden bg-black select-none cursor-pointer animate-in fade-in duration-700"
    >
      {/* Background Slideshow Image with Dimming */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out"
        style={{
          backgroundImage: `url('${currentImg}')`,
          opacity: Math.max(0.1, Math.min(1.0, config.dimmingLevel)),
          filter: config.imageFit === "contain_blur" ? "blur(2px) scale(1.05)" : "none",
        }}
      />

      {/* Subtle Ambient Vignette Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/70 pointer-events-none" />

      {/* Floating Anti-Burn-In Digital Clock */}
      <div
        className="absolute transition-all duration-1000 ease-in-out p-6 rounded-3xl backdrop-blur-md bg-black/40 border border-white/10 shadow-2xl flex flex-col"
        style={{
          ...currentClockStyle,
          fontFamily: config.fontFamily || "monospace",
        }}
      >
        {/* Date string */}
        <div
          className="text-base font-semibold tracking-wider uppercase mb-1"
          style={{ color: config.dateColor || "#94a3b8" }}
        >
          {dateFormatted}
        </div>

        {/* Digital Time: Hours : Minutes : Seconds */}
        <div className="text-6xl font-bold tracking-tight font-mono flex items-baseline space-x-1.5 leading-none">
          <span style={{ color: config.hoursColor || "#38bdf8" }}>{hours}</span>
          <span style={{ color: config.separatorsColor || "#64748b" }}>:</span>
          <span style={{ color: config.minutesColor || "#fbbf24" }}>{minutes}</span>
          <span style={{ color: config.separatorsColor || "#64748b" }}>:</span>
          <span className="text-4xl" style={{ color: config.secondsColor || "#f43f5e" }}>
            {seconds}
          </span>
        </div>

        {/* Subtle Machine Status Indicator */}
        <div className="flex items-center space-x-2 mt-3 text-xs text-slate-400 font-sans">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Decent DE1 · Standing by</span>
        </div>
      </div>

      {/* Bottom Dismiss Hint */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-xs text-white/50 tracking-widest uppercase font-mono pointer-events-none">
        Tap anywhere to wake
      </div>
    </div>
  );
};
