/**
 * PantaRhei Cockpit Workflow & Contextual Race 'Go!' Button Dispatcher
 * Resolves the operational state and visual presentation of the race-game 'Go!' button
 * dynamically based on which of the 4 mutually exclusive tabs is currently active.
 */

import type {
  CockpitTabId,
  CoffeeTabConfig,
  SteamTabConfig,
  WaterTabConfig,
  MaintenanceTabConfig,
  MachineTelemetryState,
  GoButtonViewModel,
} from "../types/cockpitTabs.ts";

export const MIN_WATER_LEVEL_ML = 250; // Safety threshold: extraction/steam/water blocked if below this volume

/**
 * Resolves the exact presentation, label, halo lighting, and execution payload
 * of the dedicated round race-game 'Go!' button based on the active operational tab and machine state.
 */
export function resolveGoButtonState(
  activeTab: CockpitTabId,
  tabConfig: {
    coffee?: CoffeeTabConfig;
    steam?: SteamTabConfig;
    water?: WaterTabConfig;
    maintenance?: MaintenanceTabConfig;
  },
  telemetry: MachineTelemetryState
): GoButtonViewModel {
  // 1. Establish Default Tab Presentation
  let defaultLabel = "Go!";
  let defaultAction: GoButtonViewModel["actionType"] = "espresso";
  let defaultEndpoint = "/api/v1/machine/state/espresso";
  let defaultHalo: GoButtonViewModel["haloColor"] = "neon-green";
  let subLabel = "";
  let autoTare = false;

  switch (activeTab) {
    case "coffee":
      defaultLabel = "Go!";
      defaultAction = "espresso";
      defaultEndpoint = "/api/v1/machine/state/espresso";
      defaultHalo = "neon-green";
      subLabel = tabConfig.coffee ? `${tabConfig.coffee.targetYield.toFixed(1)}g` : "36.0g";
      autoTare = true;
      break;

    case "steam":
      defaultLabel = "Go!";
      defaultAction = "steam";
      defaultEndpoint = "/api/v1/machine/state/steam";
      defaultHalo = "amber-glow";
      subLabel = tabConfig.steam ? `${tabConfig.steam.temperature}°C` : "150°C";
      autoTare = false;
      break;

    case "water":
      defaultLabel = "Go!";
      defaultAction = "water";
      defaultEndpoint = "/api/v1/machine/state/hotWater";
      defaultHalo = "cyan-blue";
      subLabel = tabConfig.water ? `${tabConfig.water.volumeMl}ml` : "150ml";
      autoTare = false;
      break;

    case "maintenance":
      defaultLabel = "Go!";
      defaultAction = "flush";
      defaultEndpoint = "/api/v1/machine/state/flush";
      defaultHalo = "neon-green";
      subLabel = tabConfig.maintenance ? `${tabConfig.maintenance.flushDurationSeconds}s Flush` : "3s Flush";
      autoTare = false;
      break;
  }

  // 2. Global Machine Readiness Checks
  if (!telemetry.isConnected) {
    return {
      label: defaultLabel,
      subLabel: "Offline",
      actionType: defaultAction,
      isReady: false,
      haloColor: "disabled-gray",
      blockerReason: "Machine Disconnected",
      targetEndpoint: "",
      autoTareBeforeStart: false,
    };
  }

  if (telemetry.machineState === "sleeping") {
    return {
      label: defaultLabel,
      subLabel: "Asleep",
      actionType: defaultAction,
      isReady: false,
      haloColor: "disabled-gray",
      blockerReason: "Machine Sleeping — Tap screen to wake",
      targetEndpoint: "",
      autoTareBeforeStart: false,
    };
  }

  if (telemetry.waterLevelMl < MIN_WATER_LEVEL_ML) {
    return {
      label: defaultLabel,
      subLabel: "Water Low",
      actionType: defaultAction,
      isReady: false,
      haloColor: "disabled-gray",
      blockerReason: `Refill Water Tank (${Math.round(telemetry.waterLevelMl)} ml remaining)`,
      targetEndpoint: "",
      autoTareBeforeStart: false,
    };
  }

  // 3. Tab-Specific Readiness Verification
  switch (activeTab) {
    case "coffee": {
      const groupTempDelta = Math.abs(telemetry.groupTemperature - telemetry.targetGroupTemp);
      if (groupTempDelta > 0.5 || telemetry.machineState === "heating") {
        return {
          label: defaultLabel,
          subLabel: `${telemetry.groupTemperature.toFixed(1)}°C`,
          actionType: defaultAction,
          isReady: false,
          haloColor: "disabled-gray",
          blockerReason: `Heating Group: ${telemetry.groupTemperature.toFixed(1)}°C / ${telemetry.targetGroupTemp.toFixed(1)}°C`,
          targetEndpoint: defaultEndpoint,
          autoTareBeforeStart: autoTare,
        };
      }
      return {
        label: defaultLabel,
        subLabel,
        actionType: defaultAction,
        isReady: true,
        haloColor: defaultHalo,
        targetEndpoint: defaultEndpoint,
        autoTareBeforeStart: autoTare,
      };
    }

    case "steam": {
      if (tabConfig.steam?.heaterEnabled === false || telemetry.targetSteamTemp === 0) {
        return {
          label: defaultLabel,
          subLabel: "Off",
          actionType: defaultAction,
          isReady: false,
          haloColor: "disabled-gray",
          blockerReason: "Steam Heater Disabled: Enable preheating in Steam tab",
          targetEndpoint: defaultEndpoint,
          autoTareBeforeStart: autoTare,
        };
      }
      const steamTempDelta = Math.abs(telemetry.steamTemperature - telemetry.targetSteamTemp);
      if (steamTempDelta > 3.0) {
        return {
          label: defaultLabel,
          subLabel: `${telemetry.steamTemperature.toFixed(0)}°C`,
          actionType: defaultAction,
          isReady: false,
          haloColor: "disabled-gray",
          blockerReason: `Heating Steam: ${telemetry.steamTemperature.toFixed(0)}°C / ${telemetry.targetSteamTemp.toFixed(0)}°C`,
          targetEndpoint: defaultEndpoint,
          autoTareBeforeStart: autoTare,
        };
      }
      return {
        label: defaultLabel,
        subLabel,
        actionType: defaultAction,
        isReady: true,
        haloColor: defaultHalo,
        targetEndpoint: defaultEndpoint,
        autoTareBeforeStart: autoTare,
      };
    }

    case "water":
    case "maintenance":
      return {
        label: defaultLabel,
        subLabel,
        actionType: defaultAction,
        isReady: true,
        haloColor: defaultHalo,
        targetEndpoint: defaultEndpoint,
        autoTareBeforeStart: autoTare,
      };

    default:
      return {
        label: defaultLabel,
        actionType: defaultAction,
        isReady: false,
        haloColor: "disabled-gray",
        targetEndpoint: "",
        autoTareBeforeStart: false,
      };
  }
}
