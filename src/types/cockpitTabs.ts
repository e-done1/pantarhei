/**
 * PantaRhei Cockpit Tabs & Contextual Operations
 * 4 Mutually exclusive operation tabs for the Left Menu Pane:
 * Coffee (Default), Steam, Water, and Maintenance.
 */

export type CockpitTabId = "coffee" | "steam" | "water" | "maintenance";

export interface CoffeeTabConfig {
  beanId?: string;
  dose: number;                    // in grams (e.g. 18.0)
  targetYield: number;             // in grams (e.g. 36.0)
  profileId: string;               // active DE1 profile ID or filename
  ratioText: string;               // e.g. "1:2.0"
}

export interface SteamTabConfig {
  temperature: number;             // 140°C - 170°C (default 150°C / 160°C)
  flowRate: number;                // 0.8 - 2.5 ml/s
  durationSeconds: number;         // 10-120s cutoff
  autoPurge: boolean;              // Auto purge after steam
  autoPurgeSeconds?: number;       // Auto purge timeout duration in seconds (1 - 10s)
  heaterEnabled?: boolean;         // Overriding toggle: if false, steam element is kept cold/unheated (target 0°C)
}

export const DEFAULT_STEAM_CONFIG: SteamTabConfig = {
  temperature: 150,
  flowRate: 1.2,
  durationSeconds: 45,
  autoPurge: true,
  autoPurgeSeconds: 3,
  heaterEnabled: true,
};

export const STEAM_CONFIG_STORAGE_KEY = "pantarhei_steam_config";

export function loadSteamConfigFromStorage(): SteamTabConfig {
  if (typeof window === "undefined") return { ...DEFAULT_STEAM_CONFIG };
  try {
    const raw = localStorage.getItem(STEAM_CONFIG_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_STEAM_CONFIG, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULT_STEAM_CONFIG };
}

export function saveSteamConfigToStorage(config: SteamTabConfig): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STEAM_CONFIG_STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

export interface WaterTabConfig {
  temperature: number;             // 70°C - 98°C (default 85°C / 90°C)
  flowRate: number;                // 2.0 - 8.0 ml/s
  volumeMl: number;                // 50 - 400 ml
  autoStopOnScale: boolean;        // stop when scale reaches target volume/weight
}

export interface MaintenanceTabConfig {
  flushDurationSeconds: number;    // 1 - 10s (default 3s)
  flushVolumeMl: number;           // target flush volume (default 40ml)
  preferredCleaningProfileId: string; // ID of saved backflush profile
  transportArmed: boolean;         // Safety toggle for boiler drain transport mode
  descalingStep?: "idle" | "solution_rinse" | "clean_water_flush" | "complete";
}

export interface MachineTelemetryState {
  isConnected: boolean;
  machineState: "idle" | "espresso" | "steam" | "water" | "rinse" | "sleeping" | "heating";
  groupTemperature: number;        // Current group head temp in °C
  targetGroupTemp: number;         // Target group setpoint in °C
  steamTemperature: number;        // Current steam thermoblock temp in °C
  targetSteamTemp: number;         // Target steam setpoint in °C
  waterLevelMl: number;            // Current tank level in ml (never percentage!)
}

export interface GoButtonViewModel {
  label: string;                   // Text displayed on the round button face (e.g. "Go!", "Steam!", "Dispense!", "Flush")
  subLabel?: string;               // Secondary small badge (e.g. "Ready", "36.0g", "150°C")
  actionType: "espresso" | "steam" | "water" | "flush" | "clean" | "none";
  isReady: boolean;                // Strictly false if machine is heating, sleeping, water low, or disconnected
  haloColor: "neon-green" | "amber-glow" | "cyan-blue" | "disabled-gray";
  blockerReason?: string;          // Descriptive caption explaining why the button is grayed out
  targetEndpoint: string;          // API endpoint triggered on tap
  autoTareBeforeStart: boolean;    // Whether scale auto-tare is triggered first
}
