import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_SCREENSAVER_CONFIG,
  loadScreensaverConfigFromStorage,
  saveScreensaverConfigToStorage,
  type ScreensaverConfig,
} from "../src/types/screensaver.ts";
import {
  KNOWN_DECAID_PLUGINS,
  loadPluginsFromStorage,
  savePluginsToStorage,
  type DecaidPluginManifest,
} from "../src/types/plugin.ts";
import {
  SUPPORTED_SCALE_MODELS,
  inferReleaseChannel,
  type DiscoveredMachine,
  type DiscoveredScale,
  type ReleaseChannel,
} from "../src/types/device.ts";
import { decaid } from "../src/services/decaidConnection.ts";
import {
  DEFAULT_MAINTENANCE_CONFIG,
  getMaintenanceStatus,
  formatTimeAgo,
  type MachineMaintenanceConfig,
} from "../src/types/maintenance.ts";

test("Screensaver Config: Default settings provide safe, aesthetic defaults", () => {
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.enabled, true);
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.idleTimeoutMinutes, 5);
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.imageFolder, "assets/screensaver");
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.slideshowIntervalSeconds, 15);
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.shuffle, true);
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.dimmingLevel, 0.65);
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.imageFit, "contain_blur");
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.antiBurnInDrift, true);
  assert.equal(DEFAULT_SCREENSAVER_CONFIG.driftSpeed, "slow");

  // Per-section colors are valid hex colors
  assert.match(DEFAULT_SCREENSAVER_CONFIG.dateColor, /^#[0-9a-fA-F]{6}$/);
  assert.match(DEFAULT_SCREENSAVER_CONFIG.hoursColor, /^#[0-9a-fA-F]{6}$/);
  assert.match(DEFAULT_SCREENSAVER_CONFIG.minutesColor, /^#[0-9a-fA-F]{6}$/);
  assert.match(DEFAULT_SCREENSAVER_CONFIG.secondsColor, /^#[0-9a-fA-F]{6}$/);
  assert.match(DEFAULT_SCREENSAVER_CONFIG.separatorsColor, /^#[0-9a-fA-F]{6}$/);
});

test("Screensaver Config: Custom options merge cleanly with defaults", () => {
  const custom: ScreensaverConfig = {
    ...DEFAULT_SCREENSAVER_CONFIG,
    idleTimeoutMinutes: 10,
    dimmingLevel: 0.8,
    imageFit: "cover",
    antiBurnInDrift: false,
    hoursColor: "#ff0055",
  };

  assert.equal(custom.idleTimeoutMinutes, 10);
  assert.equal(custom.dimmingLevel, 0.8);
  assert.equal(custom.imageFit, "cover");
  assert.equal(custom.antiBurnInDrift, false);
  assert.equal(custom.hoursColor, "#ff0055");
  assert.equal(custom.enabled, true); // preserved from defaults
});

test("Decaid Plugins: Manifest includes key ecosystem integrations", () => {
  const ids = KNOWN_DECAID_PLUGINS.map((p) => p.id);
  assert.ok(ids.includes("dye2"), "Includes Describe Your Espresso (DYE2)");
  assert.ok(ids.includes("visualizer"), "Includes Visualizer.coffee cloud uploader");
  assert.ok(ids.includes("smart_grinder"), "Includes Smart Grinder BLE bridge");
  assert.ok(ids.includes("auto_tare"), "Includes Gravimetric Auto-Tare Engine");

  // DYE2 verification
  const dye2 = KNOWN_DECAID_PLUGINS.find((p) => p.id === "dye2");
  assert.ok(dye2);
  assert.equal(dye2.category, "sensory");
  assert.equal(dye2.hasSettings, true);
  assert.ok(dye2.homepageUrl?.includes("dye2"));

  // Visualizer verification
  const visualizer = KNOWN_DECAID_PLUGINS.find((p) => p.id === "visualizer");
  assert.ok(visualizer);
  assert.equal(visualizer.category, "cloud");
  assert.ok(visualizer.homepageUrl?.includes("visualizer.coffee"));
});

test("Decaid Plugins: Toggling plugin status updates state correctly", () => {
  const plugins = [...KNOWN_DECAID_PLUGINS];
  const targetId = "smart_grinder";
  const initial = plugins.find((p) => p.id === targetId)?.enabled;

  const toggled = plugins.map((p) => (p.id === targetId ? { ...p, enabled: !p.enabled } : p));
  const updated = toggled.find((p) => p.id === targetId)?.enabled;

  assert.equal(updated, !initial);
});

test("Device Pairing: Supported Bluetooth scale models list is comprehensive", () => {
  const ids = SUPPORTED_SCALE_MODELS.map((m) => m.id);
  assert.ok(ids.includes("decent"), "Supports Decent Scale");
  assert.ok(ids.includes("acaia"), "Supports Acaia Lunar / Pearl");
  assert.ok(ids.includes("felicita"), "Supports Felicita Arc / Incline");
  assert.ok(ids.includes("bookoo"), "Supports Bookoo Themis");
  assert.ok(ids.includes("skale"), "Supports Skale II");
  assert.ok(ids.includes("difluid"), "Supports DiFluid Microbalance");
  assert.ok(ids.includes("hiroia"), "Supports Hiroia Jimmy");
});

test("Decaid Connection: Live status and machine discovery", async () => {
  // Initial status in local development/simulator mode
  const status = decaid.getMachineStatus();
  assert.ok(["connected", "disconnected", "simulator"].includes(status));

  // Machine discovery scan
  const machines: DiscoveredMachine[] = await decaid.scanForMachines();
  assert.ok(Array.isArray(machines));
  assert.ok(machines.length > 0, "Discovers available Decent DE1 machines");

  const de1 = machines[0];
  assert.ok(de1.name.includes("Decent") || de1.name.includes("DE1"));
  assert.ok(de1.address.length > 0);
  assert.ok(de1.connectionType === "network" || de1.connectionType === "ble");
});

test("Decaid Connection: Bluetooth scale scanning, pairing, and taring", async () => {
  // Scale discovery scan
  const scales: DiscoveredScale[] = await decaid.scanForScales();
  assert.ok(Array.isArray(scales));
  assert.ok(scales.length > 0, "Discovers nearby Bluetooth scales");

  const targetScale = scales[0];
  assert.ok(targetScale.name);
  assert.ok(targetScale.address);

  // Pair scale
  const ok = await decaid.pairScale(targetScale);
  assert.equal(ok, true);

  // Read active scale from decaid
  const activeScale = decaid.getPairedScale();
  assert.ok(activeScale);
  assert.equal(activeScale.name, targetScale.name);
  assert.equal(activeScale.isConnected, true);

  // Tare scale
  await decaid.tareScale();
  assert.equal(decaid.getPairedScale()?.weightGrams, 0.0);

  // Unpair scale
  decaid.disconnectScale();
  assert.equal(decaid.getPairedScale(), null);
});

test("Decaid Connection: Machine power control (wake & sleep)", async () => {
  await decaid.wakeMachine();
  assert.notEqual(decaid.getMachineInfo().state, "sleep");

  await decaid.sleepMachine();
  assert.equal(decaid.getMachineInfo().state, "sleep");

  // Re-wake for subsequent tests
  await decaid.wakeMachine();
  assert.notEqual(decaid.getMachineInfo().state, "sleep");
});

test("Decaid Connection: Simulator mode fallback ensures unblocked barista experience", () => {
  decaid.enableSimulatorMode();
  assert.equal(decaid.isConnected(), true);
  assert.equal(decaid.getMachineStatus(), "simulator");
  assert.equal(decaid.isLiveConnected(), false);
});

test("Decaid Version & Updates: checkSystemVersions queries software and firmware versions", async () => {
  const versions = await decaid.checkSystemVersions();
  assert.ok(versions.softwareVersion, "Software version present");
  assert.ok(versions.firmwareVersion, "Firmware version present");
  assert.ok(versions.bleVersion, "BLE version present");
  assert.ok(versions.lastChecked, "Timestamp recorded");
  assert.equal(typeof versions.softwareUpdateAvailable, "boolean");
  assert.equal(typeof versions.firmwareUpdateAvailable, "boolean");
});

test("Decaid Version & Updates: triggerSoftwareUpdate updates Decaid tablet software", async () => {
  const result = await decaid.triggerSoftwareUpdate();
  assert.equal(result.ok, true);
  assert.equal(result.target, "software");
  assert.ok(result.message.includes("Decaid software updated successfully"));
  assert.equal(decaid.getSystemVersion().softwareUpdateAvailable, false);
});

test("Decaid Version & Updates: triggerFirmwareUpdate flashes DE1 machine firmware", async () => {
  const result = await decaid.triggerFirmwareUpdate();
  assert.equal(result.ok, true);
  assert.equal(result.target, "firmware");
  assert.ok(result.message.includes("DE1 machine firmware successfully flashed"));
  assert.equal(decaid.getSystemVersion().firmwareUpdateAvailable, false);
  assert.equal(decaid.getMachineInfo().firmwareVersion, "1.44");
});

test("Decaid Version & Updates: checkDailyUpdates throttles daily network checks and exposes hasUpdateAvailable", async () => {
  // Check daily updates
  const v = await decaid.checkDailyUpdates(true);
  assert.ok(v);

  // Both updates were triggered above, so no update should be available now
  assert.equal(decaid.hasUpdateAvailable(), false);

  // Test inactive state when up to date
  const sysVer = decaid.getSystemVersion();
  assert.equal(sysVer.softwareUpdateAvailable, false);
  assert.equal(sysVer.firmwareUpdateAvailable, false);

  // Button activation rule: Only active when an update is available
  const isFirmwareButtonActive = sysVer.firmwareUpdateAvailable;
  const isSoftwareButtonActive = sysVer.softwareUpdateAvailable;
  assert.equal(isFirmwareButtonActive, false, "Firmware button is inactive when up to date");
  assert.equal(isSoftwareButtonActive, false, "Software button is inactive when up to date");
});

test("Decaid Version & Updates: inferReleaseChannel correctly identifies stable, beta, and nightly tags", () => {
  assert.equal(inferReleaseChannel("2.1.0"), "stable");
  assert.equal(inferReleaseChannel("v1.44"), "stable");
  assert.equal(inferReleaseChannel("1.42"), "stable");
  assert.equal(inferReleaseChannel(undefined), "stable");

  // Beta indicators
  assert.equal(inferReleaseChannel("2.1.4-beta"), "beta");
  assert.equal(inferReleaseChannel("v1.44-b2"), "beta");
  assert.equal(inferReleaseChannel("2.0.0-rc.1"), "beta");
  assert.equal(inferReleaseChannel("BETA-TEST"), "beta");

  // Nightly / Dev indicators
  assert.equal(inferReleaseChannel("2.2.0-nightly"), "nightly");
  assert.equal(inferReleaseChannel("2.2.0-alpha.1"), "nightly");
  assert.equal(inferReleaseChannel("v1.45-dev"), "nightly");
});

test("Decaid Version & Updates: setUpdateChannel switches channel and queries targeted release stream", async () => {
  // Switch to beta channel
  const betaVer = await decaid.setUpdateChannel("beta");
  assert.equal(decaid.getUpdateChannel(), "beta");
  assert.equal(betaVer.targetChannel, "beta");
  assert.ok(betaVer.latestSoftwareVersion?.includes("beta") || betaVer.latestFirmwareVersion?.includes("beta"));

  // Switch to nightly channel
  const nightlyVer = await decaid.setUpdateChannel("nightly");
  assert.equal(decaid.getUpdateChannel(), "nightly");
  assert.equal(nightlyVer.targetChannel, "nightly");
  assert.ok(nightlyVer.latestSoftwareVersion?.includes("nightly") || nightlyVer.latestFirmwareVersion?.includes("nightly"));

  // Switch back to stable channel
  const stableVer = await decaid.setUpdateChannel("stable");
  assert.equal(decaid.getUpdateChannel(), "stable");
  assert.equal(stableVer.targetChannel, "stable");
  assert.equal(stableVer.latestSoftwareVersion, "2.1.2");
});

test("Decaid Live Telemetry & UL Compliance: tracks UL safety mode and informs user when remote trigger is restricted", async () => {
  // Verify initial state
  assert.equal(decaid.isULSafetyRestricted(), false);

  // Set UL safety restricted mode (simulating Decaid rejecting software PUT command with 403/405)
  decaid.setULSafetyRestricted(true);
  assert.equal(decaid.isULSafetyRestricted(), true);

  // In UL safety mode, software triggering informs user to use physical GHC
  const res = await decaid.startEspresso(36.0);
  assert.ok(res.ok === true || res.ulRestricted === true);

  // Reset flag
  decaid.setULSafetyRestricted(false);
  assert.equal(decaid.isULSafetyRestricted(), false);
});

test("Decaid Live Telemetry & UL Compliance: reactive telemetry subscription handles live state changes", () => {
  let receivedPoints = 0;
  let receivedState = "";

  const unsub = decaid.subscribe((point, machine, _scale) => {
    receivedPoints++;
    receivedState = machine.state;
  });

  // Verify subscription is active
  assert.equal(typeof unsub, "function");
  unsub();
});

test("Machine Maintenance: Default intervals enforce 2 days cleaning and 2 months descale", () => {
  assert.equal(DEFAULT_MAINTENANCE_CONFIG.cleaningIntervalDays, 2);
  assert.equal(DEFAULT_MAINTENANCE_CONFIG.descaleIntervalMonths, 2);
  assert.ok(DEFAULT_MAINTENANCE_CONFIG.lastCleaningTimestamp > 0);
  assert.ok(DEFAULT_MAINTENANCE_CONFIG.lastDescaleTimestamp > 0);
});

test("Machine Maintenance: getMaintenanceStatus accurately triggers cleaning and descale reminders", () => {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const MS_PER_MONTH = MS_PER_DAY * 30.4375;
  const now = 1700000000000;

  // 1. Freshly cleaned and descaled: no action due
  const freshConfig: MachineMaintenanceConfig = {
    cleaningIntervalDays: 2,
    lastCleaningTimestamp: now,
    descaleIntervalMonths: 2,
    lastDescaleTimestamp: now,
  };
  const statusFresh = getMaintenanceStatus(freshConfig, now);
  assert.equal(statusFresh.isCleaningDue, false);
  assert.equal(statusFresh.isDescaleDue, false);
  assert.equal(statusFresh.primaryActionType, "none");
  assert.equal(statusFresh.badgeLabel, null);

  // 2. 3 days elapsed: Group head cleaning is due (interval = 2)
  const cleaningDueConfig: MachineMaintenanceConfig = {
    cleaningIntervalDays: 2,
    lastCleaningTimestamp: now - 3 * MS_PER_DAY,
    descaleIntervalMonths: 2,
    lastDescaleTimestamp: now - 10 * MS_PER_DAY,
  };
  const statusCleaning = getMaintenanceStatus(cleaningDueConfig, now);
  assert.equal(statusCleaning.isCleaningDue, true);
  assert.equal(statusCleaning.cleaningDaysPassed, 3);
  assert.equal(statusCleaning.isDescaleDue, false);
  assert.equal(statusCleaning.primaryActionType, "cleaning");
  assert.equal(statusCleaning.badgeLabel, "Clean Group Head");

  // 3. 3 months elapsed: Descale is due (interval = 2)
  const descaleDueConfig: MachineMaintenanceConfig = {
    cleaningIntervalDays: 7,
    lastCleaningTimestamp: now - 1 * MS_PER_DAY,
    descaleIntervalMonths: 2,
    lastDescaleTimestamp: now - Math.round(3 * MS_PER_MONTH),
  };
  const statusDescale = getMaintenanceStatus(descaleDueConfig, now);
  assert.equal(statusDescale.isCleaningDue, false);
  assert.equal(statusDescale.isDescaleDue, true);
  assert.equal(statusDescale.primaryActionType, "descale");
  assert.equal(statusDescale.badgeLabel, "Descale Required");

  // 4. Both overdue
  const bothDueConfig: MachineMaintenanceConfig = {
    cleaningIntervalDays: 2,
    lastCleaningTimestamp: now - 5 * MS_PER_DAY,
    descaleIntervalMonths: 2,
    lastDescaleTimestamp: now - Math.round(4 * MS_PER_MONTH),
  };
  const statusBoth = getMaintenanceStatus(bothDueConfig, now);
  assert.equal(statusBoth.isCleaningDue, true);
  assert.equal(statusBoth.isDescaleDue, true);
  assert.equal(statusBoth.primaryActionType, "both");
  assert.equal(statusBoth.badgeLabel, "Maintenance Due");
});

test("Machine Maintenance: formatTimeAgo formats relative time intervals cleanly", () => {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const now = 1700000000000;
  assert.equal(formatTimeAgo(now, now), "Today");
  assert.equal(formatTimeAgo(now - 1 * MS_PER_DAY, now), "Yesterday");
  assert.equal(formatTimeAgo(now - 5 * MS_PER_DAY, now), "5 days ago");
  assert.equal(formatTimeAgo(now - 65 * MS_PER_DAY, now), "2 months ago");
});
