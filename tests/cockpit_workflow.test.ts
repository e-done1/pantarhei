/**
 * Automated test suite for PantaRhei 4 Cockpit Tabs & Contextual Race 'Go!' Button Dispatcher
 */

import type { MachineTelemetryState } from "../src/types/cockpitTabs.ts";
import { resolveGoButtonState } from "../src/services/cockpitWorkflow.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== Testing PantaRhei 4 Cockpit Tabs & Race 'Go!' Button ===\n");

const readyTelemetry: MachineTelemetryState = {
  isConnected: true,
  machineState: "idle",
  groupTemperature: 93.0,
  targetGroupTemp: 93.0,
  steamTemperature: 150.0,
  targetSteamTemp: 150.0,
  waterLevelMl: 1450,
};

const tabConfigs = {
  coffee: { dose: 18.0, targetYield: 36.0, profileId: "sey-flow", ratioText: "1:2.0" },
  steam: { temperature: 150, flowRate: 1.2, durationSeconds: 45, autoPurge: true },
  water: { temperature: 85, flowRate: 4.0, volumeMl: 150, autoStopOnScale: true },
  maintenance: { flushDurationSeconds: 4, flushVolumeMl: 40, preferredCleaningProfileId: "clean-flush", transportArmed: false },
};

// 1. Coffee Tab Tests
const coffeeState = resolveGoButtonState("coffee", tabConfigs, readyTelemetry);
assert(coffeeState.label === "Go!", "Coffee tab sets button label to 'Go!'");
assert(coffeeState.actionType === "espresso", "Coffee tab sets actionType to 'espresso'");
assert(coffeeState.haloColor === "neon-green", "Coffee tab sets neon-green breathing halo");
assert(coffeeState.isReady === true, "Coffee tab is ready when group temp and water are optimal");
assert(coffeeState.autoTareBeforeStart === true, "Coffee tab commands auto-tare before start");
assert(coffeeState.targetEndpoint === "/api/v1/machine/state/espresso", "Coffee tab targets espresso endpoint");

// 2. Coffee Tab Heating Blocker Test
const heatingTelemetry: MachineTelemetryState = {
  ...readyTelemetry,
  groupTemperature: 88.5, // 4.5°C below target
};
const heatingCoffeeState = resolveGoButtonState("coffee", tabConfigs, heatingTelemetry);
assert(heatingCoffeeState.isReady === false, "Coffee tab is blocked while heating");
assert(heatingCoffeeState.haloColor === "disabled-gray", "Button is grayed out while heating");
assert(heatingCoffeeState.blockerReason !== undefined && heatingCoffeeState.blockerReason.includes("Heating Group"), "Provides clear heating blocker reason");

// 3. Steam Tab Tests
const steamState = resolveGoButtonState("steam", tabConfigs, readyTelemetry);
assert(steamState.label === "Go!", "Steam tab retains 'Go!' label");
assert(steamState.actionType === "steam", "Steam tab sets actionType to 'steam'");
assert(steamState.haloColor === "amber-glow", "Steam tab sets amber-glow halo");
assert(steamState.subLabel === "150°C", "Steam tab sets subLabel with target temperature");
assert(steamState.isReady === true, "Steam tab is ready when steam boiler is stabilized");
assert(steamState.targetEndpoint === "/api/v1/machine/state/steam", "Steam tab targets steam endpoint");

// 4. Steam Tab Heating Blocker Test
const coldSteamTelemetry: MachineTelemetryState = {
  ...readyTelemetry,
  steamTemperature: 130.0, // 20°C below target
};
const coldSteamState = resolveGoButtonState("steam", tabConfigs, coldSteamTelemetry);
assert(coldSteamState.isReady === false, "Steam tab is blocked when steam boiler is not up to temp");
assert(coldSteamState.haloColor === "disabled-gray", "Steam button is grayed out when cold");

// 5. Water Tab Tests
const waterState = resolveGoButtonState("water", tabConfigs, readyTelemetry);
assert(waterState.label === "Go!", "Water tab retains 'Go!' label");
assert(waterState.actionType === "water", "Water tab sets actionType to 'water'");
assert(waterState.haloColor === "cyan-blue", "Water tab sets cyan-blue halo");
assert(waterState.subLabel === "150ml", "Water tab sets subLabel with target volume");
assert(waterState.isReady === true, "Water tab is ready");
assert(waterState.targetEndpoint === "/api/v1/machine/state/water", "Water tab targets water endpoint");

// 6. Maintenance Tab Tests
const maintState = resolveGoButtonState("maintenance", tabConfigs, readyTelemetry);
assert(maintState.label === "Go!", "Maintenance tab retains 'Go!' label");
assert(maintState.actionType === "flush", "Maintenance tab sets actionType to 'flush'");
assert(maintState.subLabel?.includes("4s Flush") === true, "Maintenance tab sets subLabel with flush duration");
assert(maintState.targetEndpoint === "/api/v1/machine/state/rinse", "Maintenance tab targets rinse endpoint");

// 7. Global Water Low Blocker Test
const lowWaterTelemetry: MachineTelemetryState = {
  ...readyTelemetry,
  waterLevelMl: 180, // Below 250ml threshold
};
const lowWaterState = resolveGoButtonState("coffee", tabConfigs, lowWaterTelemetry);
assert(lowWaterState.isReady === false, "Machine is blocked across all tabs when water level < 250ml");
assert(lowWaterState.haloColor === "disabled-gray", "Button is grayed out on low water");
assert(lowWaterState.blockerReason !== undefined && lowWaterState.blockerReason.includes("Refill Water Tank"), "Shows Refill Water Tank blocker with exact ml");

// 8. Disconnected Blocker Test
const offlineTelemetry: MachineTelemetryState = {
  ...readyTelemetry,
  isConnected: false,
};
const offlineState = resolveGoButtonState("steam", tabConfigs, offlineTelemetry);
assert(offlineState.isReady === false, "Machine is blocked when disconnected");
assert(offlineState.blockerReason === "Machine Disconnected", "Shows Disconnected blocker");

console.log("\n🎉 ALL COCKPIT TAB & 'GO!' BUTTON TESTS PASSED SUCCESSFULLY!");
