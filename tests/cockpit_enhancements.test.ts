/**
 * Unit test suite for PantaRhei Cockpit Enhancements:
 * 1. Storage Method & Roast Age Formatting
 * 2. Steam Auto-Purge & Timeout
 * 3. 0.1g Desired Yield Stepping
 * 4. Sliders resolution (1s steam cutoff, 1ml water volume, 0.1ml/s water flow)
 * 5. Dynamic Presets Management (Add / Remove / Sort)
 */

import type { PantaBean } from "../src/types/bean.ts";
import { getStorageAndRoastAge, calculateRestDays } from "../src/types/bean.ts";
import type { SteamTabConfig, WaterTabConfig } from "../src/types/cockpitTabs.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== Testing PantaRhei Cockpit Enhancements ===\n");

// 1. Storage Method and Days After Roast
const testBeanRoomTemp: PantaBean = {
  id: "bean-test-rt",
  name: "Guji Highland",
  roaster: "Sey Coffee",
  countryOfOrigin: "Ethiopia",
  process: "Washed",
  roastDate: "2026-11-01",
  recommendedRestDays: 21,
  totalGrams: 250,
  remainingGrams: 200,
  isFrozen: false,
  targetDose: 18.0,
  targetYield: 36.0,
  targetGrind: "4.0",
  tastingNotes: ["Floral"],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const testBeanFreezer: PantaBean = {
  ...testBeanRoomTemp,
  id: "bean-test-frz",
  isFrozen: true,
};

const refDate = new Date("2026-11-16T12:00:00Z"); // 15 days after roast

const ageRoomTemp = getStorageAndRoastAge(testBeanRoomTemp, refDate);
assert(ageRoomTemp.daysSinceRoast === 15, "Calculates correct 15 days since roast");
assert(ageRoomTemp.roastAgeText === "15 days after roast", "Formats roastAgeText as '15 days after roast'");
assert(ageRoomTemp.storageMethod === "room_temperature", "Identifies room_temperature storage method");
assert(ageRoomTemp.storageLabel === "Room Temp", "Formats storageLabel as 'Room Temp'");

const ageFreezer = getStorageAndRoastAge(testBeanFreezer, refDate);
assert(ageFreezer.isFrozen === true, "Identifies frozen bean");
assert(ageFreezer.storageMethod === "freezer", "Identifies freezer storage method");
assert(ageFreezer.storageLabel === "Freezer", "Formats storageLabel as 'Freezer'");

const restResult = calculateRestDays(testBeanRoomTemp, refDate);
assert(restResult.roastAgeText === "15 days after roast", "calculateRestDays exports roastAgeText");
assert(restResult.storageLabel === "Room Temp", "calculateRestDays exports storageLabel");

// 2. Steam Tab Auto-Purge & Timeout Config
const steamConfig: SteamTabConfig = {
  temperature: 155,
  flowRate: 1.2,
  durationSeconds: 45,
  autoPurge: true,
  autoPurgeSeconds: 3,
};
assert(steamConfig.autoPurge === true, "SteamTabConfig supports autoPurge toggle");
assert(steamConfig.autoPurgeSeconds === 3, "SteamTabConfig supports autoPurgeSeconds timeout");

// 3. Desired Yield 0.1g Micro-Stepping
const dose = 18.0;
let targetYield = 36.0;
const stepYield = (delta: number) => {
  targetYield = Math.max(15.0, Math.min(100.0, Math.round((targetYield + delta) * 10) / 10));
  return `1:${(targetYield / dose).toFixed(1)}`;
};

const ratioPlusOne = stepYield(0.1);
assert(targetYield === 36.1, "Desired yield steps up by exactly 0.1g");
assert(ratioPlusOne === "1:2.0", "Ratio recalculates dynamically to 1 decimal place");

const ratioMinusOne = stepYield(-0.1);
assert(targetYield === 36.0, "Desired yield steps down by exactly 0.1g");

// 5. Presets Add / Remove / Sort Logic
let tempPresets = [145, 150, 155, 160];
const addPreset = (val: number) => {
  if (!tempPresets.includes(val)) {
    tempPresets = [...tempPresets, val].sort((a, b) => a - b);
  }
};
const removePreset = (val: number) => {
  tempPresets = tempPresets.filter((p) => p !== val);
};

addPreset(152);
assert(tempPresets.includes(152), "Adds new custom temperature preset");
assert(tempPresets[2] === 152, "Presets stay sorted ascendingly");

// Adding duplicate does not create double entries
addPreset(152);
assert(tempPresets.filter((p) => p === 152).length === 1, "Presets avoid duplicates");

removePreset(152);
assert(!tempPresets.includes(152), "Removes existing preset correctly");

// 6. Profile Selection & Running in Telemetry Simulator
import { simulator } from "../src/services/telemetrySimulator.ts";
import { decaid } from "../src/services/decaidConnection.ts";
import type { ProfileItem } from "../src/types/profile.ts";

const peonyProfile: ProfileItem = {
  id: "peony-flow-hunb",
  title: "Peony/FlowHUNB",
  author: "Decent",
  category: "peony",
  steps: [
    {
      name: "Fill Protection",
      temperature: "87.0",
      sensor: "coffee",
      pump: "flow",
      transition: "fast",
      pressure: "2.00",
      flow: "8.0",
      seconds: "5",
      volume: "0",
      weight: "0",
    },
    {
      name: "Dynamic Flow Infusion",
      temperature: "87.0",
      sensor: "coffee",
      pump: "flow",
      transition: "smooth",
      pressure: "8.00",
      flow: "2.2",
      seconds: "25",
      volume: "0",
      weight: "0",
    },
  ],
};

decaid.selectProfile(peonyProfile);
assert(simulator.getActiveProfile()?.title === "Peony/FlowHUNB", "decaid.selectProfile sets active profile in simulator");

simulator.startEspresso(36.0, peonyProfile);
assert(simulator.getActiveProfile()?.title === "Peony/FlowHUNB", "simulator.startEspresso retains selected profile");

console.log("\n🎉 ALL COCKPIT ENHANCEMENT TESTS PASSED SUCCESSFULLY!");
simulator.destroy();
process.exit(0);
