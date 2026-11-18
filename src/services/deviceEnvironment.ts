/**
 * PantaRhei Device Environment & Tablet Detection Service
 * Detects whether the current device is a tablet (e.g. 7-inch Android tablet, P80X),
 * compact display, or touch screen, and manages high-contrast telemetry preferences.
 */

import { useState, useEffect } from "react";

export const HIGH_CONTRAST_STORAGE_KEY = "pantarhei_high_contrast_telemetry";

/**
 * Returns true if the device is detected as a tablet, touch device, or compact display.
 */
export function isTabletOrCompact(): boolean {
  if (typeof window === "undefined") return false;

  // 1. Check User Agent for Android, Tablet, P80X, iPad, etc.
  const ua = navigator.userAgent || "";
  const isAndroidOrTablet = /Android|Tablet|P80X|Silk|iPad/i.test(ua);

  // 2. Check screen dimensions (7" tablet viewport typically width <= 1024 or height <= 600)
  const screenW = window.screen?.width || window.innerWidth;
  const screenH = window.screen?.height || window.innerHeight;
  const isCompactScreen = (screenW <= 1024 && screenH <= 800) || window.innerWidth <= 1024 || window.innerHeight <= 600;

  // 3. Check touch capabilities
  const isTouch = Boolean(
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
  );

  return (isAndroidOrTablet && isTouch) || isCompactScreen;
}

/**
 * Loads whether high-contrast telemetry is enabled.
 * Defaults to true if on a tablet or compact screen, or respects saved user setting.
 */
export function getHighContrastTelemetryPreference(): boolean {
  if (typeof window === "undefined") return true;
  const saved = localStorage.getItem(HIGH_CONTRAST_STORAGE_KEY);
  if (saved !== null) {
    return saved === "true";
  }
  // Default to true on tablets, compact screens, or touch displays
  return isTabletOrCompact();
}

/**
 * Saves user preference for high-contrast telemetry.
 */
export function setHighContrastTelemetryPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, enabled ? "true" : "false");
}

/**
 * React hook to observe tablet environment and high contrast state.
 */
export function useDeviceEnvironment() {
  const [isTablet, setIsTablet] = useState<boolean>(() => isTabletOrCompact());
  const [highContrast, setHighContrast] = useState<boolean>(() => getHighContrastTelemetryPreference());

  useEffect(() => {
    const handleResize = () => {
      const tabletNow = isTabletOrCompact();
      setIsTablet(tabletNow);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const updateHighContrast = (val: boolean) => {
    setHighContrast(val);
    setHighContrastTelemetryPreference(val);
  };

  return {
    isTablet,
    highContrast,
    setHighContrast: updateHighContrast,
  };
}
