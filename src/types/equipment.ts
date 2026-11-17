/**
 * PantaRhei Equipment Inventory & Shot Preparation Metadata Types
 *
 * Tracks hardware gear catalogs (Grinders, Burrs, Baskets, Scales, Tampers,
 * Distributors, WDT tools, RDT preparations) and active gear selections per extraction.
 */

export interface EquipmentInventory {
  grinders: string[];
  burrs: string[];
  baskets: string[];
  scales: string[];
  tampers: string[];
  distributors: string[];
  wdt: string[];
  rdt: string[];
}

export interface ActiveEquipmentSelection {
  grinder?: string;
  burrs?: string;
  basket?: string;
  scale?: string;
  tampers: string[];
  distributors: string[];
  wdt: string[];
  rdt: string[];
}

export const DEFAULT_EQUIPMENT_INVENTORY: EquipmentInventory = {
  grinders: [
    "KafaTek Monolith Flat MAX",
    "Lagom P64",
    "Niche Zero",
    "Mazzer Philos",
    "Weber EG-1",
  ],
  burrs: [
    "Shuriken LM 98mm",
    "SSP 64mm Cast Red Speed",
    "Mazzer I200D 64mm",
    "Gorilla Gear 64mm",
  ],
  baskets: [
    "Decent CB 18g",
    "Decent NB 20g",
    "Wafo Spirit 18-20g",
    "IMS Competition 18g",
    "VST 18g Precision",
  ],
  scales: [
    "Decent Scale DS-104",
    "Acaia Lunar 2021",
    "Felicita Arc",
    "Bookoo Themis",
  ],
  tampers: [
    "Normcore V4 Spring 58.5mm",
    "Decent Calibrated Tamper",
    "Force Tamper 58.5mm",
    "Big-Step 58.55mm",
  ],
  distributors: [
    "Jack Precision Leveler",
    "Wedge 58.5mm Distributor",
    "OCD V3 Distributor",
  ],
  wdt: [
    "AutoComb Spinning WDT",
    "0.25mm 9-Prong Needle Tool",
    "Umikot Planetary WDT",
    "Moonraker WDT",
  ],
  rdt: [
    "2 Sprays Distilled Water",
    "1 Spray Ionized Droplet Mist",
    "Ross Droplet Technique (Single Drop)",
  ],
};

export const DEFAULT_ACTIVE_EQUIPMENT: ActiveEquipmentSelection = {
  grinder: "KafaTek Monolith Flat MAX",
  burrs: "Shuriken LM 98mm",
  basket: "Decent CB 18g",
  scale: "Decent Scale DS-104",
  tampers: ["Normcore V4 Spring 58.5mm"],
  distributors: [],
  wdt: ["AutoComb Spinning WDT"],
  rdt: ["2 Sprays Distilled Water"],
};

export const EQUIPMENT_INVENTORY_STORAGE_KEY = "pantarhei_equipment_inventory";
export const ACTIVE_EQUIPMENT_STORAGE_KEY = "pantarhei_active_equipment_selection";

export function loadEquipmentInventory(): EquipmentInventory {
  if (typeof window === "undefined") return DEFAULT_EQUIPMENT_INVENTORY;
  try {
    const raw = localStorage.getItem(EQUIPMENT_INVENTORY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        grinders: Array.isArray(parsed.grinders) ? parsed.grinders : DEFAULT_EQUIPMENT_INVENTORY.grinders,
        burrs: Array.isArray(parsed.burrs) ? parsed.burrs : DEFAULT_EQUIPMENT_INVENTORY.burrs,
        baskets: Array.isArray(parsed.baskets) ? parsed.baskets : DEFAULT_EQUIPMENT_INVENTORY.baskets,
        scales: Array.isArray(parsed.scales) ? parsed.scales : DEFAULT_EQUIPMENT_INVENTORY.scales,
        tampers: Array.isArray(parsed.tampers) ? parsed.tampers : DEFAULT_EQUIPMENT_INVENTORY.tampers,
        distributors: Array.isArray(parsed.distributors) ? parsed.distributors : DEFAULT_EQUIPMENT_INVENTORY.distributors,
        wdt: Array.isArray(parsed.wdt) ? parsed.wdt : DEFAULT_EQUIPMENT_INVENTORY.wdt,
        rdt: Array.isArray(parsed.rdt) ? parsed.rdt : DEFAULT_EQUIPMENT_INVENTORY.rdt,
      };
    }
  } catch {}
  return DEFAULT_EQUIPMENT_INVENTORY;
}

export function saveEquipmentInventory(inv: EquipmentInventory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(EQUIPMENT_INVENTORY_STORAGE_KEY, JSON.stringify(inv));
  } catch {}
}

export function loadActiveEquipment(): ActiveEquipmentSelection {
  if (typeof window === "undefined") return DEFAULT_ACTIVE_EQUIPMENT;
  try {
    const raw = localStorage.getItem(ACTIVE_EQUIPMENT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        grinder: parsed.grinder,
        burrs: parsed.burrs,
        basket: parsed.basket,
        scale: parsed.scale,
        tampers: Array.isArray(parsed.tampers) ? parsed.tampers : [],
        distributors: Array.isArray(parsed.distributors) ? parsed.distributors : [],
        wdt: Array.isArray(parsed.wdt) ? parsed.wdt : [],
        rdt: Array.isArray(parsed.rdt) ? parsed.rdt : [],
      };
    }
  } catch {}
  return DEFAULT_ACTIVE_EQUIPMENT;
}

export function saveActiveEquipment(active: ActiveEquipmentSelection): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_EQUIPMENT_STORAGE_KEY, JSON.stringify(active));
  } catch {}
}

/**
 * Returns a human-readable one-line summary of the selected equipment for the cockpit bubble
 */
export function formatEquipmentSummary(eq: ActiveEquipmentSelection): string {
  const parts: string[] = [];
  if (eq.grinder) {
    if (eq.burrs) {
      parts.push(`${eq.grinder} (${eq.burrs})`);
    } else {
      parts.push(eq.grinder);
    }
  }
  if (eq.basket) parts.push(eq.basket);
  if (eq.wdt && eq.wdt.length > 0) parts.push(`WDT: ${eq.wdt.join(", ")}`);
  if (eq.tampers && eq.tampers.length > 0) parts.push(eq.tampers[0]);
  if (eq.rdt && eq.rdt.length > 0) parts.push(eq.rdt[0]);

  if (parts.length === 0) return "No gear selected";
  return parts.join(" · ");
}
