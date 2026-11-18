import assert from "node:assert/strict";
import { test } from "node:test";
import {
  previewBackupImport,
  mergeProfiles,
  mergeBeans,
  mergeShots,
  normalizeProfileKey,
  normalizeBeanKey,
  normalizeShotKey,
  type PantaRheiSettingsPayload,
} from "../src/types/backup.ts";
import {
  buildBackupEnvelope,
  saveAutoBackup,
  getAutoBackups,
  executeBackupImport,
} from "../src/services/backupManager.ts";
import {
  formatShotForDYE,
  syncShotToDYE,
  syncHistoryToDYE,
  loadDYESettings,
  saveDYESettings,
  DEFAULT_DYE_CONFIG,
} from "../src/services/dyeBridge.ts";
import {
  loadVisualizerSettings,
  saveVisualizerSettings,
  persistVisualizerSettings,
  testVisualizerConnection,
  DEFAULT_VISUALIZER_CONFIG,
} from "../src/services/visualizerBridge.ts";
import type { ProfileItem } from "../src/types/profile.ts";
import type { PantaBean } from "../src/types/bean.ts";
import type { ShotRecord } from "../src/types/shot.ts";
import { serializeShotToTcl, serializeShotToDecaidJson } from "../src/types/shot.ts";
import { decaid } from "../src/services/decaidConnection.ts";

const SAMPLE_SETTINGS: PantaRheiSettingsPayload = {
  headerConfig: {
    enabled: true,
    text: "Espresso Lab",
    fontFamily: "system-ui",
    fontSize: 28,
    color: "#ffffff",
  },
  clockPaletteId: "cyberpunk",
  fluidEnabled: true,
  screensaverConfig: {
    enabled: true,
    idleTimeoutMinutes: 5,
    imageFolder: "assets/screensaver",
    slideshowIntervalSeconds: 15,
    shuffle: true,
    dimmingLevel: 0.7,
    imageFit: "contain_blur",
    antiBurnInDrift: true,
    driftSpeed: "slow",
    fontFamily: "monospace",
    dateColor: "#ffffff",
    hoursColor: "#38bdf8",
    minutesColor: "#fbbf24",
    secondsColor: "#f43f5e",
    separatorsColor: "#64748b",
  },
  cockpitConfigs: {
    coffee: { dose: 18, targetYield: 36, profileId: "p1", ratioText: "1:2.0" },
    steam: { temperature: 150, flowRate: 1.2, durationSeconds: 45, autoPurge: true, autoPurgeSeconds: 3 },
    water: { temperature: 85, flowRate: 4, volumeMl: 150, autoStopOnScale: true },
    maintenance: { flushDurationSeconds: 3, flushVolumeMl: 40, preferredCleaningProfileId: "clean", transportArmed: false },
  },
  scaleConfig: { autoTareShot: true, autoTareCup: false },
  deviceConfig: { host: "192.168.1.100", port: 8080, dontShowStartupModal: false },
  pluginSettings: {
    visualizer: { userToken: "sample-token-12345678", autoUpload: true, visibility: "private" },
    dye2: { autoSyncActiveShots: true, includeTelemetrySamples: true },
  },
};

const SAMPLE_PROFILES: ProfileItem[] = [
  { id: "p1", title: "Sey Nordic Flow", author: "Sey", category: "flow", isCustom: true },
  { id: "p2", title: "Idan Strega Plus", author: "Idan", category: "lever", isCustom: false },
];

const SAMPLE_BEANS: PantaBean[] = [
  {
    id: "b1",
    name: "Worka Sakaro",
    roaster: "Sey",
    countryOfOrigin: "Ethiopia",
    process: "Washed",
    roastDate: "2026-11-01",
    totalGrams: 250,
    remainingGrams: 180,
    isFrozen: false,
    tastingNotes: ["Bergamot", "Jasmine"],
    recommendedRestDays: 21,
    targetDose: 18,
    targetYield: 45,
    targetGrind: "4.2",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const SAMPLE_SHOTS: ShotRecord[] = [
  {
    id: "shot-1",
    timestamp: 1731790000000,
    dateFormatted: "Nov 16 · 14:00",
    beanId: "b1",
    beanName: "Worka Sakaro",
    roaster: "Sey",
    profileTitle: "Sey Nordic Flow",
    targetDose: 18,
    targetYield: 45,
    actualDose: 18,
    actualYield: 45.2,
    ratio: 2.51,
    durationSeconds: 22.4,
    peakPressure: 6.8,
    avgPressure: 5.2,
    avgFlow: 2.3,
    waterTemperature: 93,
    channelDetected: false,
    channelCount: 0,
    rating: 9.0,
    tags: ["Jasmine", "Floral"],
    telemetry: [],
    grindSetting: "4.2",
  },
];

test("Backup Envelope: Builds structured envelope for settings and full backups", () => {
  const settingsEnv = buildBackupEnvelope({
    type: "settings",
    settings: SAMPLE_SETTINGS,
  });
  assert.equal(settingsEnv.format, "pantarhei_backup");
  assert.equal(settingsEnv.version, 1);
  assert.equal(settingsEnv.type, "settings");
  assert.equal(settingsEnv.data, undefined);
  assert.equal(settingsEnv.settings.clockPaletteId, "cyberpunk");

  const fullEnv = buildBackupEnvelope({
    type: "full",
    settings: SAMPLE_SETTINGS,
    profiles: SAMPLE_PROFILES,
    beans: SAMPLE_BEANS,
    shots: SAMPLE_SHOTS,
    sourceMachine: { model: "Decent DE1Pro", serialNumber: "DE1-0842" },
  });
  assert.equal(fullEnv.type, "full");
  assert.ok(fullEnv.data);
  assert.equal(fullEnv.data.profiles.length, 2);
  assert.equal(fullEnv.data.beans.length, 1);
  assert.equal(fullEnv.data.shots.length, 1);
  assert.equal(fullEnv.sourceMachine?.serialNumber, "DE1-0842");
});

test("Deduplication: Normalization keys handle edge cases and whitespace", () => {
  const pKey1 = normalizeProfileKey({ id: "custom-1", title: "  Sey Nordic Flow  ", author: "Sey Coffee " });
  const pKey2 = normalizeProfileKey({ id: "custom-2", title: "sey nordic flow", author: "sey coffee" });
  assert.equal(pKey1, pKey2, "Normalizes profile title and author identically");

  const bKey1 = normalizeBeanKey({ name: "Worka Sakaro", roaster: "Sey", roastDate: "2026-11-01" });
  const bKey2 = normalizeBeanKey({ name: "  worka sakaro ", roaster: " sey ", roastDate: "2026-11-01" });
  assert.equal(bKey1, bKey2, "Normalizes coffee name, roaster, and roast date");

  const sKey1 = normalizeShotKey({ id: "shot-1" });
  const sKey2 = normalizeShotKey({ id: "shot-1" });
  assert.equal(sKey1, sKey2);
});

test("Deduplication: mergeProfiles preserves existing and inserts only new profiles", () => {
  const incoming: ProfileItem[] = [
    { id: "p1", title: "Sey Nordic Flow", author: "Sey", category: "flow", isCustom: true }, // DUPLICATE
    { id: "p3", title: "Scott Rao Blooming Allonge", author: "Scott Rao", category: "allonge", isCustom: true }, // NEW
  ];

  const merged = mergeProfiles(SAMPLE_PROFILES, incoming, "merge_deduplicate");
  assert.equal(merged.length, 3, "Only 1 new profile is inserted, duplicate is merged cleanly");
  assert.ok(merged.some((p) => p.title.includes("Scott Rao")));
});

test("Deduplication: mergeBeans prevents creating duplicate bags and updates info", () => {
  const incoming: PantaBean[] = [
    {
      ...SAMPLE_BEANS[0],
      id: "b-new-id", // different id but exact same coffee name, roaster & roast date
      remainingGrams: 160,
      tastingNotes: ["Bergamot", "Jasmine", "Peach"], // added peach
    },
    {
      id: "b2",
      name: "El Paraiso Lychee",
      roaster: "Manhattan",
      countryOfOrigin: "Colombia",
      process: "Thermal Shock",
      roastDate: "2026-10-28",
      totalGrams: 200,
      remainingGrams: 200,
      isFrozen: true,
      tastingNotes: ["Lychee"],
      recommendedRestDays: 14,
      targetDose: 16,
      targetYield: 64,
      targetGrind: "5.0",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const merged = mergeBeans(SAMPLE_BEANS, incoming, "merge_deduplicate");
  assert.equal(merged.length, 2, "Only 1 new bean bag inserted, existing bag updated without duplication");
  const updatedWorka = merged.find((b) => b.name === "Worka Sakaro");
  assert.ok(updatedWorka?.tastingNotes.includes("Peach"), "Merged tasting notes");
});

test("Deduplication: mergeShots strictly ignores duplicate records", () => {
  const incoming: ShotRecord[] = [
    { ...SAMPLE_SHOTS[0] }, // DUPLICATE by ID
    {
      id: "shot-2",
      timestamp: 1731795000000,
      dateFormatted: "Nov 16 · 15:30",
      beanId: "b1",
      beanName: "Worka Sakaro",
      roaster: "Sey",
      profileTitle: "Sey Nordic Flow",
      targetDose: 18,
      targetYield: 45,
      actualDose: 18,
      actualYield: 45.0,
      ratio: 2.5,
      durationSeconds: 23.0,
      peakPressure: 6.9,
      avgPressure: 5.3,
      avgFlow: 2.2,
      waterTemperature: 93,
      channelDetected: false,
      channelCount: 0,
      rating: 9.2,
      tags: ["Floral"],
      telemetry: [],
      grindSetting: "4.2",
    },
  ];

  const merged = mergeShots(SAMPLE_SHOTS, incoming, "merge_deduplicate");
  assert.equal(merged.length, 2, "Duplicate shot-1 ignored; shot-2 added cleanly");
});

test("Import Preview: Generates accurate diff counts before import", () => {
  const fullEnv = buildBackupEnvelope({
    type: "full",
    settings: SAMPLE_SETTINGS,
    profiles: [
      SAMPLE_PROFILES[0], // existing
      { id: "p3", title: "Light Blooming", author: "Scott", category: "allonge" }, // new
    ],
    beans: [
      SAMPLE_BEANS[0], // existing
    ],
    shots: [
      SAMPLE_SHOTS[0], // duplicate
      { id: "shot-new", timestamp: 1731799000000, beanName: "New Coffee", durationSeconds: 25 } as any, // new
    ],
  });

  const preview = previewBackupImport(fullEnv, {
    profiles: SAMPLE_PROFILES,
    beans: SAMPLE_BEANS,
    shots: SAMPLE_SHOTS,
  });

  assert.equal(preview.isValid, true);
  assert.equal(preview.profilesDiff.newCount, 1);
  assert.equal(preview.profilesDiff.existingCount, 1);
  assert.equal(preview.beansDiff.newCount, 0);
  assert.equal(preview.beansDiff.existingCount, 1);
  assert.equal(preview.shotsDiff.newCount, 1);
  assert.equal(preview.shotsDiff.duplicateCount, 1);
});

test("DYE2 Integration: formatShotForDYE matches Decaid DYE2 standard schema", () => {
  const dyePayload = formatShotForDYE(SAMPLE_SHOTS[0]);
  assert.equal(dyePayload.version, 2);
  assert.equal(dyePayload.id, "shot-1");
  assert.equal(dyePayload.bean.name, "Worka Sakaro");
  assert.equal(dyePayload.profile.title, "Sey Nordic Flow");
  assert.equal(dyePayload.recipe.dose_grams, 18);
  assert.equal(dyePayload.recipe.actual_yield_grams, 45.2);
  assert.equal(dyePayload.sensory.rating, 9.0);
  assert.ok(dyePayload.sensory.tags.includes("Floral"));
});

test("DYE2 Integration: syncHistoryToDYE processes historical archive with progress", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ status: "ok" }) } as any));
    let progressCount = 0;
    const result = await syncHistoryToDYE("http://localhost:8080", SAMPLE_SHOTS, (current, total) => {
      progressCount++;
      assert.equal(total, 1);
    });

    assert.equal(result.synced, 1);
    assert.equal(result.failed, 0);
    assert.equal(progressCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Visualizer Bridge: Token validation and settings management", async () => {
  const emptyRes = await testVisualizerConnection("");
  assert.equal(emptyRes.success, false);

  const validFormatRes = await testVisualizerConnection("mock-token-12345678901234567890");
  assert.equal(validFormatRes.success, true);
  assert.ok(validFormatRes.message.toLowerCase().includes("verified"));

  const cfg = loadVisualizerSettings();
  assert.equal(cfg.autoUpload, true);
  assert.equal(cfg.visibility, "private");
});

test("DYE2 Edit Synchronization: Edited shot TDS, EY, tasting notes, and recipe correctly update DYE2 payload", async () => {
  const originalShot: ShotRecord = {
    ...SAMPLE_SHOTS[0],
    tds: 8.5,
    ey: 17.0,
    rating: 7.5,
    tags: ["Nutty"],
    baristaNotes: "Initial pull",
  };

  // Barista updates TDS to 9.8%, recalculating EY = (36 * 9.8) / 18 = 19.6%
  const updatedShot: ShotRecord = {
    ...originalShot,
    tds: 9.8,
    ey: Math.round(((originalShot.actualYield * 9.8) / originalShot.actualDose) * 100) / 100,
    rating: 9.5,
    tags: ["Sweet", "Floral", "Bergamot"],
    baristaNotes: "VST refractometer reading 9.8% TDS. Very floral, sweet finish.",
    grindSetting: "4.0",
  };

  const dyePayload = formatShotForDYE(updatedShot);
  assert.equal(dyePayload.id, originalShot.id, "Shot ID preserved for in-place edit");
  assert.equal(dyePayload.extraction.tds, 9.8, "TDS updated in DYE extraction schema");
  assert.equal(dyePayload.extraction.ey, 24.61, "EY% updated in DYE extraction schema");
  assert.equal(dyePayload.sensory.rating, 9.5, "Sensory rating updated");
  assert.deepEqual(dyePayload.sensory.tags, ["Sweet", "Floral", "Bergamot"], "Sensory tags updated");
  assert.equal(dyePayload.sensory.barista_notes, "VST refractometer reading 9.8% TDS. Very floral, sweet finish.");
  assert.equal(dyePayload.recipe.grind_setting, "4.0", "Grind setting updated");

  // Verify syncShotToDYE handles the edited shot without error
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ status: "ok" }) } as any));
    const success = await syncShotToDYE("http://localhost:8080", updatedShot, false);
    assert.equal(success, true, "syncShotToDYE successfully dispatches edited record");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("Interoperability: serializeShotToTcl serializes shot to official de1app TCL format for cross-skin compatibility", () => {
  const shot: ShotRecord = {
    ...SAMPLE_SHOTS[0],
    beanName: "Worka Sakaro",
    roaster: "Sey Coffee",
    profileTitle: "Sey Nordic Flow",
    actualDose: 18.0,
    actualYield: 36.4,
    grindSetting: "4.2",
    baristaNotes: "Very sweet and floral",
    rating: 9.2,
    tds: 9.6,
    ey: 21.2,
    telemetry: [
      {
        timestamp: 1700000000000,
        timeSeconds: 0.0,
        pressure: 0.0,
        targetPressure: 0,
        flow: 0.0,
        targetFlow: 0,
        weightFlow: 0.0,
        weight: 0.0,
        groupTemperature: 93.0,
        targetGroupTemp: 93.0,
        steamTemperature: 150.0,
        puckResistance: 0.0,
        phase: "preinfusion",
        channelDetected: false,
      },
      {
        timestamp: 1700000001000,
        timeSeconds: 1.0,
        pressure: 2.5,
        targetPressure: 0,
        flow: 4.0,
        targetFlow: 0,
        weightFlow: 0.0,
        weight: 0.0,
        groupTemperature: 93.0,
        targetGroupTemp: 93.0,
        steamTemperature: 150.0,
        puckResistance: 0.16,
        phase: "preinfusion",
        channelDetected: false,
      },
    ],
  };

  const tcl = serializeShotToTcl(shot);
  assert.ok(tcl.includes("clock"));
  assert.ok(tcl.includes("profile_title {Sey Nordic Flow}"));
  assert.ok(tcl.includes("bean_brand {Sey Coffee}"));
  assert.ok(tcl.includes("bean_type {Worka Sakaro}"));
  assert.ok(tcl.includes("grinder_dose_weight 18"));
  assert.ok(tcl.includes("grinder_setting 4.2"));
  assert.ok(tcl.includes("espresso_elapsed {0.0 1.0}"));
  assert.ok(tcl.includes("espresso_pressure {0.0 2.5}"));
  assert.ok(tcl.includes("espresso_flow {0.0 4.0}"));
  assert.ok(tcl.includes("drink_tds 9.6"));
});

test("Interoperability: decaid.saveShot writes shot to Decaid system-defined history location", async () => {
  const shot: ShotRecord = {
    ...SAMPLE_SHOTS[0],
    id: "shot-portability-test-1",
  };

  const res = await decaid.saveShot(shot);
  assert.equal(res.ok, true);
  assert.ok(res.locations);
  assert.ok(res.locations.some((l) => l.includes("history")));
});

test("Interoperability: decaid.saveProfile writes profiles to Decaid profiles_v2 and profiles2 folders", async () => {
  const profile: ProfileItem = {
    ...SAMPLE_PROFILES[0],
    title: "Portability Test Profile",
  };

  const res = await decaid.saveProfile(profile);
  assert.equal(res.ok, true);
  assert.ok(res.locations);
  assert.ok(res.locations.some((l) => l.includes("profiles_v2") || l.includes("profiles")));
});
