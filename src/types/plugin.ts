/**
 * PantaRhei Decaid Plugin Types & Discovery Service
 * Interfaces with Decaid's official plugin extension system (/api/v1/plugins),
 * exposing installed and available plugins such as Describe Your Espresso (DYE2),
 * Visualizer.coffee, Smart Grinder bridge, and custom .reaplugin packages.
 */

export interface DecaidPluginManifest {
  id: string;                         // Unique plugin ID (e.g. "dye2", "visualizer")
  name: string;                       // Display name
  author: string;                     // Developer / Organization
  version: string;                    // Semantic version
  description: string;                // Feature summary
  category?: "sensory" | "cloud" | "hardware" | "workflow" | "utility";
  enabled: boolean;                   // Active status in Decaid
  entryFile?: string;                 // plugin.js
  hasSettings?: boolean;              // True if plugin exposes configuration options
  homepageUrl?: string;               // GitHub / documentation URL
  icon?: string;                      // Lucide icon name or image path
}

export const KNOWN_DECAID_PLUGINS: DecaidPluginManifest[] = [
  {
    id: "dye2",
    name: "Describe Your Espresso (DYE2)",
    author: "Decent Community / reaplugin",
    version: "2.4.1",
    description: "Deep sensory profiling, interactive flavor wheel annotations, and taste descriptors for pulled shots.",
    category: "sensory",
    enabled: true,
    hasSettings: true,
    homepageUrl: "https://github.com/decentespresso/dye2",
  },
  {
    id: "visualizer",
    name: "Visualizer.coffee Cloud Uploader",
    author: "Miha Rekar",
    version: "1.8.0",
    description: "Automatic and manual export of high-resolution shot curves, profile metadata, and grinder/burr details to Visualizer.coffee.",
    category: "cloud",
    enabled: true,
    hasSettings: true,
    homepageUrl: "https://visualizer.coffee",
  },
  {
    id: "smart_grinder",
    name: "Smart Grinder BLE Bridge",
    author: "Decaid Hardware Team",
    version: "1.2.3",
    description: "Direct Bluetooth integration with connected smart grinders (Acaia Orbit, Mazzer Philos, Option-O P64, Zerno).",
    category: "hardware",
    enabled: false,
    hasSettings: true,
    homepageUrl: "https://github.com/decentespresso/decaid",
  },
  {
    id: "auto_tare",
    name: "Gravimetric Auto-Tare Engine",
    author: "PantaRhei Core",
    version: "1.0.0",
    description: "Zeroes scale upon cup placement and coordinates pre-infusion tare commands across Decent, Acaia, and Felicita scales.",
    category: "workflow",
    enabled: true,
    hasSettings: false,
  },
  {
    id: "water_guard",
    name: "Water Quality & Scale Monitor",
    author: "Decent Labs",
    version: "1.1.0",
    description: "Monitors water tank volume, boiler mineral accumulation, and alerts for filter cartridge replacement.",
    category: "utility",
    enabled: false,
    hasSettings: true,
  },
];

export const PLUGINS_STORAGE_KEY = "pantarhei_decaid_plugins";

export function loadPluginsFromStorage(): DecaidPluginManifest[] {
  if (typeof window === "undefined") return KNOWN_DECAID_PLUGINS;
  try {
    const saved = localStorage.getItem(PLUGINS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return KNOWN_DECAID_PLUGINS;
}

export function savePluginsToStorage(plugins: DecaidPluginManifest[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(plugins));
  } catch {}
}

/**
 * Discovers available plugins from Decaid's official REST API (/api/v1/plugins)
 * Falls back to local stored plugins with graceful offline safety.
 */
export async function discoverDecaidPlugins(baseUrl: string): Promise<DecaidPluginManifest[]> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/plugins`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        savePluginsToStorage(data);
        return data;
      }
    }
  } catch {
    // Offline or simulator mode
  }

  return loadPluginsFromStorage();
}

/**
 * Updates plugin active/enabled status in Decaid
 */
export async function setDecaidPluginEnabled(
  baseUrl: string,
  pluginId: string,
  enabled: boolean
): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/v1/plugins/${pluginId}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
