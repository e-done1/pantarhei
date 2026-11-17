/**
 * PantaRhei Ambient Screensaver & Floating Clock Types
 * Specifications for idle timeout, image folder slideshow, dimming,
 * and anti-burn-in drifting digital clock with per-section color customization.
 */

export interface ScreensaverConfig {
  enabled: boolean;
  idleTimeoutMinutes: number;           // 1, 2, 5, 10, 15, 30
  imageFolder: string;                  // e.g. "assets/screensaver" or custom picked folder name
  imageCount?: number;                  // number of images loaded in pool
  slideshowIntervalSeconds: number;     // 5 to 60 seconds
  shuffle: boolean;
  dimmingLevel: number;                 // 0.1 (darkest) to 1.0 (brightest)
  imageFit: "contain_blur" | "cover";
  antiBurnInDrift: boolean;             // Drifting clock across quadrants
  driftSpeed: "slow" | "medium" | "dynamic";
  fontFamily: string;
  dateColor: string;
  hoursColor: string;
  minutesColor: string;
  secondsColor: string;
  separatorsColor: string;
}

export const DEFAULT_SCREENSAVER_CONFIG: ScreensaverConfig = {
  enabled: true,
  idleTimeoutMinutes: 5,
  imageFolder: "assets/screensaver",
  slideshowIntervalSeconds: 15,
  shuffle: true,
  dimmingLevel: 0.65,
  imageFit: "contain_blur",
  antiBurnInDrift: true,
  driftSpeed: "slow",
  fontFamily: "ui-monospace, 'SF Mono', monospace",
  dateColor: "#94a3b8",
  hoursColor: "#38bdf8",
  minutesColor: "#fbbf24",
  secondsColor: "#f43f5e",
  separatorsColor: "#64748b",
};

export const SCREENSAVER_STORAGE_KEY = "pantarhei_screensaver_config";

export function loadScreensaverConfigFromStorage(): ScreensaverConfig {
  if (typeof window === "undefined") return DEFAULT_SCREENSAVER_CONFIG;
  try {
    const saved = localStorage.getItem(SCREENSAVER_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_SCREENSAVER_CONFIG, ...JSON.parse(saved) };
    }
  } catch {}
  return DEFAULT_SCREENSAVER_CONFIG;
}

export function saveScreensaverConfigToStorage(config: ScreensaverConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SCREENSAVER_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}
