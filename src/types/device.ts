/**
 * PantaRhei Hardware & Device Connection Types
 * Data models for Decent Espresso DE1 machine connection and Bluetooth scale pairing.
 */

export type MachineConnectionStatus = "connected" | "connecting" | "disconnected" | "simulator";
export type ScaleConnectionStatus = "connected" | "connecting" | "scanning" | "disconnected";

export interface DE1MachineInfo {
  model: string;            // e.g. "Decent DE1Pro", "DE1XL", "Bengle", "DE1+"
  serialNumber: string;     // e.g. "DE1-PRO-0842"
  firmwareVersion: string;  // e.g. "1.42"
  bleVersion: string;       // e.g. "2.1"
  softwareVersion?: string; // Decaid software version e.g. "2.1.0"
  state: "ready" | "idle" | "sleep" | "sleeping" | "heating" | "espresso" | "steam" | "water" | "rinse" | "disconnected";
  headTemp: number;         // °C
  targetHeadTemp: number;   // °C
  steamTemp: number;        // °C
  waterLevelMl: number;     // ml
  isWarmedUp: boolean;
}

export type ReleaseChannel = "stable" | "beta" | "nightly";

export function inferReleaseChannel(version?: string): ReleaseChannel {
  if (!version) return "stable";
  const lower = version.toLowerCase();
  if (lower.includes("beta") || lower.includes("-b") || lower.includes("rc")) return "beta";
  if (lower.includes("nightly") || lower.includes("alpha") || lower.includes("dev")) return "nightly";
  return "stable";
}

export interface SystemVersionInfo {
  softwareVersion: string;
  firmwareVersion: string;
  bleVersion: string;
  latestSoftwareVersion?: string;
  latestFirmwareVersion?: string;
  softwareUpdateAvailable: boolean;
  firmwareUpdateAvailable: boolean;
  softwareChannel: ReleaseChannel;
  firmwareChannel: ReleaseChannel;
  targetChannel: ReleaseChannel;
  isChecking?: boolean;
  lastChecked?: string;
  statusMessage?: string;
}

export type UpdateTargetType = "software" | "firmware" | "both";

export interface UpdateExecutionResult {
  ok: boolean;
  target: UpdateTargetType;
  message: string;
  previousVersion?: string;
  newVersion?: string;
}

export interface DiscoveredMachine {
  id: string;
  name: string;
  model: string;
  address: string;          // IP:Port or BLE UUID
  rssi?: number;            // dBm signal strength
  connectionType: "ble" | "network" | "usb";
}

export interface PairedScaleInfo {
  id: string;
  name: string;             // e.g. "Decent Scale DS-104", "Acaia Lunar 2021"
  model: "decent" | "acaia" | "felicita" | "skale" | "bookoo" | "hiroia" | "difluid" | "other";
  address: string;
  batteryPercentage: number;
  weightGrams: number;
  rssi?: number;
  isConnected: boolean;
}

export interface DiscoveredScale {
  id: string;
  name: string;
  model: PairedScaleInfo["model"];
  address: string;
  rssi: number;
}

export interface MachineConnectionConfig {
  host: string;             // e.g. "localhost", "192.168.1.120"
  port: number;             // e.g. 8080
  autoConnectOnLaunch: boolean;
  useSimulatorFallback: boolean;
  dontShowModalOnStartup?: boolean;
}

export interface ScaleConnectionConfig {
  preferredScaleId?: string;
  autoTareOnShotStart: boolean;
  autoTareOnCupPlaced: boolean;
}

export const SUPPORTED_SCALE_MODELS = [
  { id: "decent", name: "Decent Scale", brand: "Decent Espresso" },
  { id: "acaia", name: "Acaia Lunar / Pearl", brand: "Acaia" },
  { id: "felicita", name: "Felicita Arc / Incline", brand: "Felicita" },
  { id: "bookoo", name: "Bookoo Themis", brand: "Bookoo" },
  { id: "skale", name: "Skale II", brand: "Skale" },
  { id: "difluid", name: "DiFluid Microbalance", brand: "DiFluid" },
  { id: "hiroia", name: "Hiroia Jimmy", brand: "Hiroia" },
] as const;
