import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseTclProfile,
  parseShotFile,
  deduplicateProfiles,
  deduplicateShots,
  normalizeProfileTitle,
  parseCoffeeDetails,
  parseEquipmentDetails,
  parseDecaidProfile,
  parseDecaidShot,
  convertDecaidMeasurementsToTelemetry,
  syncFromDecaidGateway,
  type ProfileWithFolder,
} from "../src/services/legacyMigration.ts";
import type { ProfileItem } from "../src/types/profile.ts";
import type { ShotRecord } from "../src/types/shot.ts";

test("Migration: normalizeProfileTitle normalizes titles ignoring case and punctuation", () => {
  assert.equal(normalizeProfileTitle("Gentle and Sweet"), "gentleandsweet");
  assert.equal(normalizeProfileTitle("Gentle & Sweet!"), "gentleandsweet");
  assert.equal(normalizeProfileTitle("E&B Super Fine"), "eandbsuperfine");
  assert.equal(normalizeProfileTitle("  Turbo Shot (6 bar)  "), "turboshot6bar");
});

test("Migration: parseTclProfile parses legacy de1app .tcl profile format", () => {
  const tclContent = `
advanced_shot {
  {exit_if 0 flow 4.0 volume 60 transition fast temperature 93.0 weight 0 name {Pre-infusion} pressure 3.0 sensor coffee pump flow seconds 6 exit_type pressure_over exit_pressure_over 3.5}
  {exit_if 0 flow 0 volume 0 transition smooth temperature 93.0 weight 0 name {Soak} pressure 0 sensor coffee pump flow seconds 4}
  {exit_if 0 flow 2.0 volume 0 transition smooth temperature 93.0 weight 0 name {Extraction} pressure 9.0 sensor coffee pump pressure seconds 25}
}
author {John Buckman}
beverage_type espresso
espresso_temperature 93.0
final_desired_shot_volume 0
final_desired_shot_weight 36.0
profile_notes {Classic gentle preinfusion curve into flat 9 bar extraction}
profile_title {Gentle and Sweet}
`;

  const profile = parseTclProfile(tclContent, "gentle_and_sweet.tcl", "profiles");
  assert.ok(profile, "Profile parsed successfully");
  assert.equal(profile.title, "Gentle and Sweet");
  assert.equal(profile.author, "John Buckman");
  assert.equal(profile.beverage_type, "espresso");
  assert.equal(profile.target_weight, 36.0);
  assert.equal(profile.target_temperature, 93.0);
  assert.ok(profile.notes?.includes("Classic gentle preinfusion"));
  assert.equal(profile.steps?.length, 3);
  assert.equal(profile.steps?.[0].name, "Pre-infusion");
  assert.equal(profile.steps?.[0].pump, "flow");
  assert.equal(profile.steps?.[2].name, "Extraction");
  assert.equal(profile.steps?.[2].pressure, "9.0");
});

test("Migration: parseTclProfile parses Decaid v2 JSON profile format", () => {
  const jsonContent = JSON.stringify({
    title: "Sey Flow Profile",
    author: "Sey Coffee",
    beverage_type: "espresso",
    tank_temperature: 94.0,
    target_weight: 45.0,
    notes: "High yield 1:2.5 light roast flow extraction",
    steps: [
      { name: "Preinfusion", pump: "flow", flow: "4.0", seconds: "8" },
      { name: "Decline", pump: "pressure", pressure: "6.0", seconds: "20" },
    ],
  });

  const profile = parseTclProfile(jsonContent, "sey_flow.json", "profiles_v2");
  assert.ok(profile);
  assert.equal(profile.title, "Sey Flow Profile");
  assert.equal(profile.author, "Sey Coffee");
  assert.equal(profile.target_temperature, 94.0);
  assert.equal(profile.target_weight, 45.0);
  assert.equal(profile.steps?.length, 2);
});

test("Migration: parseShotFile parses legacy de1app .shot file format", () => {
  const shotTcl = `
clock 1700000000
profile_title {Gentle and Sweet}
bean_brand {Sey Coffee}
bean_type {Worka Sakaro}
grinder_setting 4.2
espresso_notes {Sweet bergamot notes with silky finish}
espresso_elapsed {0.0 1.0 2.0 3.0 4.0 5.0 6.0 7.0 8.0 9.0 10.0}
espresso_pressure {0.0 1.5 2.8 3.2 3.1 3.0 8.5 9.0 8.8 8.4 8.0}
espresso_flow {0.0 3.8 4.0 3.9 4.0 3.8 2.1 1.9 1.8 1.9 2.0}
espresso_flow_weight {0.0 0.0 0.0 0.1 0.4 0.9 1.4 1.7 1.8 1.9 2.0}
espresso_weight {0.0 0.0 0.0 0.1 0.5 1.4 2.8 4.5 6.3 8.2 10.2}
espresso_temperature_basket {92.0 92.4 92.8 93.0 93.0 93.1 93.0 92.9 92.8 92.7 92.6}
`;

  const shot = parseShotFile(shotTcl, "20231114T120000.shot");
  assert.ok(shot, "Shot parsed successfully");
  assert.equal(shot.beanName, "Worka Sakaro");
  assert.equal(shot.roaster, "Sey Coffee");
  assert.equal(shot.profileTitle, "Gentle and Sweet");
  assert.equal(shot.grindSetting, "4.2");
  assert.equal(shot.timestamp, 1700000000000);
  assert.equal(shot.telemetry.length, 11);
  assert.equal(shot.peakPressure, 9.0);
  assert.ok(shot.avgPressure > 0);
  assert.ok(shot.avgFlow > 0);
  assert.equal(shot.actualYield, 10.2);
});

test("Migration: deduplicateProfiles eliminates duplicates between profiles/ and profiles2/, prioritizing profiles2/", () => {
  // Scenario: Both profiles and profiles2 have "Gentle and Sweet", but profiles2 has user adjustments
  const stockProfile: ProfileItem = {
    id: "p-stock-1",
    title: "Gentle and Sweet",
    author: "Decent Stock",
    category: "flow",
    target_weight: 36,
    notes: "Stock factory recipe from profiles/",
    steps: [{ name: "Preinfusion", pump: "flow", flow: 4, seconds: 6 } as any],
  };

  const userEditedProfile: ProfileItem = {
    id: "p-user-1",
    title: "Gentle and Sweet", // EXACT SAME TITLE
    author: "My Espresso Lab",
    category: "custom",
    target_weight: 40,
    notes: "My dialed-in version from profiles2/",
    steps: [
      { name: "Preinfusion", pump: "flow", flow: 3.5, seconds: 8 } as any,
      { name: "Extraction", pump: "pressure", pressure: 8.5, seconds: 22 } as any,
    ],
  };

  const distinctProfile: ProfileItem = {
    id: "p-distinct",
    title: "Blooming Allonge",
    author: "Scott Rao",
    category: "allonge",
    target_weight: 80,
  };

  const incoming: ProfileWithFolder[] = [
    { profile: stockProfile, sourceFolder: "profiles" },
    { profile: userEditedProfile, sourceFolder: "profiles2" }, // profiles2 user edition
    { profile: distinctProfile, sourceFolder: "profiles" },
  ];

  const result = deduplicateProfiles(incoming, []);

  // Assertions:
  // 1. Total unique profiles must be 2 ("Gentle and Sweet" and "Blooming Allonge")
  assert.equal(result.uniqueProfiles.length, 2, "Only 2 unique profiles must be returned");

  // 2. The duplicate between profiles/ and profiles2/ was caught
  assert.equal(result.duplicateCount, 1, "Exactly 1 duplicate caught");
  assert.equal(result.profiles2OverridesCount, 1, "profiles2 took precedence over profiles");

  // 3. The chosen version of 'Gentle and Sweet' MUST be the user version from profiles2/
  const gentle = result.uniqueProfiles.find((p) => p.title === "Gentle and Sweet");
  assert.ok(gentle);
  assert.equal(gentle.author, "My Espresso Lab", "Author from profiles2 is retained");
  assert.equal(gentle.target_weight, 40, "Target weight from profiles2 is retained");
  assert.equal(gentle.steps?.length, 2, "Steps from profiles2 are retained");
});

test("Migration: deduplicateProfiles prevents duplicate PL tiles with existing library profiles", () => {
  const existingInLibrary: ProfileItem[] = [
    {
      id: "curated-1",
      title: "Turbo Shot",
      author: "Panta Curated",
      category: "turbo",
      isCustom: false,
    },
  ];

  const incoming: ProfileWithFolder[] = [
    {
      profile: {
        id: "inc-1",
        title: "Turbo Shot", // Same title
        author: "Old App",
        category: "turbo",
      },
      sourceFolder: "profiles",
    },
    {
      profile: {
        id: "inc-2",
        title: "Adaptive Flow Flat 6",
        author: "Decent",
        category: "flow",
      },
      sourceFolder: "profiles",
    },
  ];

  const result = deduplicateProfiles(incoming, existingInLibrary);
  assert.equal(result.uniqueProfiles.length, 1);
  assert.equal(result.uniqueProfiles[0].title, "Adaptive Flow Flat 6");
  assert.equal(result.skippedExistingCount, 1, "Duplicate in existing library was skipped");
});

test("Migration: deduplicateShots filters duplicate shots by timestamp and ID", () => {
  const existingShots: ShotRecord[] = [
    {
      id: "shot-100",
      timestamp: 1700000000000,
      dateFormatted: "Nov 14",
      beanId: "b1",
      beanName: "Worka",
      roaster: "Sey",
      profileTitle: "Turbo",
      targetDose: 18,
      targetYield: 36,
      grindSetting: "4.0",
      waterTemperature: 93,
      actualDose: 18,
      actualYield: 36,
      ratio: 2.0,
      durationSeconds: 25,
      peakPressure: 9,
      avgPressure: 6,
      avgFlow: 2,
      channelDetected: false,
      channelCount: 0,
      rating: 8,
      tags: [],
      telemetry: [],
    },
  ];

  const incomingShots: ShotRecord[] = [
    {
      ...existingShots[0],
      id: "shot-100", // exact duplicate ID
    },
    {
      ...existingShots[0],
      id: "shot-200", // different ID but same timestamp
      timestamp: 1700000000500, // within 1 second
    },
    {
      id: "shot-300",
      timestamp: 1700005000000, // new distinct shot
      dateFormatted: "Nov 14",
      beanId: "b2",
      beanName: "Gichathaini",
      roaster: "April",
      profileTitle: "Strega",
      targetDose: 18,
      targetYield: 45,
      grindSetting: "3.8",
      waterTemperature: 92,
      actualDose: 18,
      actualYield: 45,
      ratio: 2.5,
      durationSeconds: 30,
      peakPressure: 9,
      avgPressure: 6,
      avgFlow: 2,
      channelDetected: false,
      channelCount: 0,
      rating: 9,
      tags: [],
      telemetry: [],
    },
  ];

  const result = deduplicateShots(incomingShots, existingShots);
  assert.equal(result.uniqueShots.length, 1, "Only the 1 unique new shot is accepted");
  assert.equal(result.uniqueShots[0].id, "shot-300");
  assert.equal(result.skippedExistingCount, 2, "2 existing duplicate shots skipped");
});

test("Migration: parseCoffeeDetails extracts terroir, varietal, country and clean name", () => {
  const c1 = parseCoffeeDetails(
    "Benti Nenka, Hambela Wamena, Natural, Heirloom, Guji, Ethiopia, 1,900 - 2,300 masl",
    "Peony"
  );
  assert.equal(c1.name, "Benti Nenka, Hambela Wamena");
  assert.equal(c1.roaster, "Peony");
  assert.equal(c1.countryOfOrigin, "Ethiopia");
  assert.equal(c1.region, "Guji");
  assert.equal(c1.process, "Natural");
  assert.deepEqual(c1.varietal, ["Heirloom"]);
  assert.equal(c1.altitude, "1,900 - 2,300 masl");

  const c2 = parseCoffeeDetails(
    "AA Kerugoya, Washed SL28, SL34, Ruiru11, Batian, Inoi, Kenya 1,400 - 1,600 masl",
    "Peony"
  );
  assert.equal(c2.name, "AA Kerugoya");
  assert.equal(c2.roaster, "Peony");
  assert.equal(c2.countryOfOrigin, "Kenya");
  assert.equal(c2.region, "Inoi");
  assert.equal(c2.process, "Washed");
  assert.deepEqual(c2.varietal, ["SL28", "SL34", "Ruiru11", "Batian"]);
  assert.equal(c2.altitude, "1,400 - 1,600 masl");
});

test("Migration: parseEquipmentDetails extracts grinder, burrs, basket, tampers and distributors", () => {
  const eq = parseEquipmentDetails(
    "Laom P100 with 98mm HU burrs",
    "1.6 grind, 6.5 mm spacers on leveler + Bravo Tamper + HE basket"
  );
  assert.equal(eq.grinder, "Lagom P100", "Normalized typo Laom to Lagom");
  assert.equal(eq.burrs, "98mm HU");
  assert.equal(eq.grindSetting, "1.6");
  assert.equal(eq.basket, "HE Basket");
  assert.deepEqual(eq.tampers, ["Bravo Tamper"]);
  assert.deepEqual(eq.distributors, ["6.5 mm spacers on leveler"]);
});

test("Migration: parseDecaidProfile parses nested Decaid /api/v1/profiles payload", () => {
  const rawItem = {
    id: "profile:07041d13386060b1a9cc",
    profile: {
      version: "2",
      title: "Peony/FlowHUNB1.6",
      notes: "Peony Flow profile for Nordic roasts",
      author: "Decent",
      beverage_type: "espresso",
      target_weight: 34.0,
      steps: [
        { name: "Fill", pump: "flow", flow: 8.0, seconds: 2.0, temperature: 87.0 },
        { name: "Flow", pump: "flow", flow: 1.6, seconds: 20.0, temperature: 84.0 },
      ],
    },
  };

  const parsed = parseDecaidProfile(rawItem);
  assert.ok(parsed);
  assert.equal(parsed.title, "Peony/FlowHUNB1.6");
  assert.equal(parsed.author, "Decent");
  assert.equal(parsed.target_weight, 34.0);
  assert.equal(parsed.steps?.length, 2);
  assert.equal(parsed.steps?.[0].flow, "8");
});

test("Migration: parseDecaidShot parses Decaid Gateway shot item with context & annotations", () => {
  const rawShotItem = {
    id: "de1app-1794947129",
    timestamp: "2026-11-17T20:25:29Z",
    workflow: {
      id: "wf-1",
      name: "Peony/FlowHUNB1.8",
      context: {
        coffeeName: "Benti Nenka, Hambela Wamena, Natural, Heirloom, Guji, Ethiopia, 1,900 - 2,300 masl",
        coffeeRoaster: "Peony",
        grinderModel: "Laom P100 with 98mm HU burrs",
        grinderSetting: "1.6 grind, 6.5 mm spacers on leveler + Bravo Tamper + HE basket",
        targetDoseWeight: 18.6,
        targetYield: 34.0,
        baristaName: "Idan",
      },
    },
    annotations: {
      actualDoseWeight: 18.6,
      actualYield: 34.2,
      drinkTds: 0.0,
      drinkEy: 0.0,
      enjoyment: 8.5,
    },
  };

  const shot = parseDecaidShot(rawShotItem);
  assert.ok(shot);
  assert.equal(shot.id, "de1app-1794947129");
  assert.equal(shot.beanName, "Benti Nenka, Hambela Wamena");
  assert.equal(shot.roaster, "Peony");
  assert.equal(shot.countryOfOrigin, "Ethiopia");
  assert.equal(shot.process, "Natural");
  assert.equal(shot.actualDose, 18.6);
  assert.equal(shot.actualYield, 34.2);
  assert.equal(shot.grindSetting, "1.6");
  assert.equal(shot.basket, "HE Basket");
  assert.equal(shot.equipment?.grinder, "Lagom P100");
  assert.equal(shot.equipment?.burrs, "98mm HU");
  assert.deepEqual(shot.equipment?.tampers, ["Bravo Tamper"]);
  assert.deepEqual(shot.equipment?.distributors, ["6.5 mm spacers on leveler"]);
  assert.ok(shot.tags.includes("Ethiopia"));
  assert.ok(shot.tags.includes("Lagom P100"));
  assert.ok(shot.tags.includes("HE Basket"));
  assert.ok(shot.tags.includes("Bravo Tamper"));
  assert.ok(shot.baristaNotes.includes("Barista: Idan"));
});

test("Migration: convertDecaidMeasurementsToTelemetry maps live Decaid telemetry frames", () => {
  const measurements = [
    {
      machine: {
        timestamp: "2026-11-17T20:25:29.007Z",
        flow: 0,
        pressure: 0,
        targetFlow: -1,
        targetPressure: -1,
        groupTemperature: 87.0,
        targetGroupTemperature: 87.0,
        steamTemperature: 0,
      },
      scale: {
        timestamp: "2026-11-17T20:25:29.007Z",
        weight: 0,
        weightFlow: 0,
      },
    },
    {
      machine: {
        timestamp: "2026-11-17T20:25:31.007Z",
        flow: 4.5,
        pressure: 2.1,
        targetFlow: 4.5,
        targetPressure: -1,
        groupTemperature: 88.0,
        targetGroupTemperature: 88.0,
        steamTemperature: 0,
      },
      scale: {
        timestamp: "2026-11-17T20:25:31.007Z",
        weight: 1.2,
        weightFlow: 0.6,
      },
    },
    {
      machine: {
        timestamp: "2026-11-17T20:25:49.007Z",
        flow: 1.8,
        pressure: 3.3,
        targetFlow: 1.8,
        targetPressure: -1,
        groupTemperature: 84.5,
        targetGroupTemperature: 84.0,
        steamTemperature: 0,
      },
      scale: {
        timestamp: "2026-11-17T20:25:49.007Z",
        weight: 32.5,
        weightFlow: 1.8,
      },
    },
  ];

  const telemetry = convertDecaidMeasurementsToTelemetry(measurements, 1794947129000);
  assert.equal(telemetry.length, 3);
  assert.equal(telemetry[0].timeSeconds, 0);
  assert.equal(telemetry[0].pressure, 0);
  assert.equal(telemetry[0].phase, "preinfusion");

  assert.equal(telemetry[1].timeSeconds, 2.0);
  assert.equal(telemetry[1].pressure, 2.1);
  assert.equal(telemetry[1].flow, 4.5);
  assert.equal(telemetry[1].weight, 1.2);
  assert.equal(telemetry[1].weightFlow, 0.6);
  assert.equal(telemetry[1].phase, "preinfusion");

  assert.equal(telemetry[2].timeSeconds, 20.0);
  assert.equal(telemetry[2].pressure, 3.3);
  assert.equal(telemetry[2].flow, 1.8);
  assert.equal(telemetry[2].weight, 32.5);
  assert.equal(telemetry[2].weightFlow, 1.8);
  assert.equal(telemetry[2].phase, "extraction");
  assert.ok(telemetry[2].puckResistance > 0);
});

test("Migration: syncFromDecaidGateway indexes beans, equipment, and transitions latest shot", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (async (url: string | URL | Request) => {
      const urlStr = url.toString();

      if (urlStr.endsWith("/api/v1/profiles")) {
        return {
          ok: true,
          json: async () => [{ id: "prof-1", profile: { title: "Peony/FlowHUNB1.8", steps: [] } }],
        } as any;
      }

      if (urlStr.endsWith("/api/v1/grinders")) {
        return {
          ok: true,
          json: async () => [
            { id: "g-1", model: "Laom P100 with 98mm HU burrs" },
            { id: "g-2", model: "Niche Zero" },
          ],
        } as any;
      }

      if (urlStr.endsWith("/api/v1/beans")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "bean-123",
              name: "Benti Nenka, Hambela Wamena, Natural, Heirloom, Guji, Ethiopia, 1,900 - 2,300 masl",
              roaster: "Peony",
              decaf: false,
              archived: false,
            },
            {
              id: "bean-456",
              name: "AA Kerugoya, Washed SL28, SL34, Inoi, Kenya",
              roaster: "Peony",
              decaf: false,
              archived: false,
            },
          ],
        } as any;
      }

      if (urlStr.endsWith("/api/v1/bean-batches")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "batch-1",
              beanId: "bean-123",
              roastLevel: "light",
              frozen: false,
              archived: false,
            },
            {
              id: "batch-2",
              beanId: "bean-456",
              roastLevel: "light",
              frozen: true,
              archived: false,
            },
          ],
        } as any;
      }

      if (urlStr.includes("/api/v1/shots?limit=")) {
        return {
          ok: true,
          json: async () => ({
            items: [
              {
                id: "de1app-1794947129",
                timestamp: "2026-11-17T20:25:29.000Z",
                workflow: {
                  name: "Peony/FlowHUNB1.8",
                  context: {
                    coffeeName: "Benti Nenka, Hambela Wamena, Natural, Heirloom, Guji, Ethiopia, 1,900 - 2,300 masl",
                    coffeeRoaster: "Peony",
                    beanBatchId: "batch-1",
                    grinderModel: "Laom P100 with 98mm HU burrs",
                    grinderSetting: "1.6 grind, 6.5 mm spacers on leveler + Bravo Tamper + HE basket",
                    targetDoseWeight: 18.6,
                    targetYield: 34.0,
                  },
                },
                annotations: {
                  actualDoseWeight: 18.6,
                  actualYield: 34.2,
                },
              },
            ],
            total: 1,
          }),
        } as any;
      }

      if (urlStr.includes("/api/v1/shots/de1app-1794947129")) {
        return {
          ok: true,
          json: async () => ({
            id: "de1app-1794947129",
            timestamp: "2026-11-17T20:25:29.000Z",
            measurements: [
              {
                machine: { timestamp: "2026-11-17T20:25:29.007Z", flow: 0, pressure: 0 },
                scale: { timestamp: "2026-11-17T20:25:29.007Z", weight: 0, weightFlow: 0 },
              },
              {
                machine: { timestamp: "2026-11-17T20:25:50.525Z", flow: 1.85, pressure: 3.27 },
                scale: { timestamp: "2026-11-17T20:25:50.525Z", weight: 32.5, weightFlow: 1.87 },
              },
            ],
            workflow: {
              context: {
                coffeeName: "Benti Nenka, Hambela Wamena, Natural, Heirloom, Guji, Ethiopia, 1,900 - 2,300 masl",
                coffeeRoaster: "Peony",
                beanBatchId: "batch-1",
                grinderModel: "Laom P100 with 98mm HU burrs",
                grinderSetting: "1.6 grind, 6.5 mm spacers on leveler + Bravo Tamper + HE basket",
                targetDoseWeight: 18.6,
                targetYield: 34.0,
              },
            },
            annotations: {
              actualDoseWeight: 18.6,
              actualYield: 34.2,
              enjoyment: 8.5,
            },
          }),
        } as any;
      }

      return { ok: false, status: 404 } as any;
    }) as any;

    const result = await syncFromDecaidGateway("http://mock-gateway:8080", 10);

    // Verify profiles
    assert.equal(result.profiles.length, 1);
    assert.equal(result.profiles[0].title, "Peony/FlowHUNB1.8");

    // Verify equipment discovery
    assert.ok(result.equipment.grinders.includes("Lagom P100"));
    assert.ok(result.equipment.grinders.includes("Niche Zero"));
    assert.ok(result.equipment.burrs.includes("98mm HU"));

    // Verify beans inventory from /api/v1/beans & /api/v1/bean-batches
    assert.equal(result.beans.length, 2);
    const b1 = result.beans.find((b) => b.id === "bean-123");
    assert.ok(b1);
    assert.equal(b1.name, "Benti Nenka, Hambela Wamena");
    assert.equal(b1.roaster, "Peony");
    assert.equal(b1.countryOfOrigin, "Ethiopia");
    assert.equal(b1.process, "Natural");
    assert.equal(b1.roastProfile, "Light");
    assert.equal(b1.isFrozen, false);

    const b2 = result.beans.find((b) => b.id === "bean-456");
    assert.ok(b2);
    assert.equal(b2.countryOfOrigin, "Kenya");
    assert.equal(b2.isFrozen, true);

    // Verify latest shot transition
    assert.ok(result.latestShot);
    assert.equal(result.latestShot.telemetry.length, 2);
    assert.equal(result.latestShot.durationSeconds, 21.5);
    assert.equal(result.latestShot.peakPressure, 3.3);
    assert.equal(result.latestShot.actualDose, 18.6);
    assert.equal(result.latestShot.actualYield, 34.2);

    // Verify active transition states
    assert.ok(result.activeBean);
    assert.equal(result.activeBean.id, "bean-123");
    assert.equal(result.activeBean.targetDose, 18.6);
    assert.equal(result.activeBean.targetYield, 34.2);
    assert.equal(result.activeBean.targetGrind, "1.6");
    assert.equal(result.activeProfileTitle, "Peony/FlowHUNB1.8");
    assert.equal(result.activeDose, 18.6);
    assert.equal(result.activeTargetYield, 34.2);

    assert.ok(result.activeEquipment);
    assert.equal(result.activeEquipment.grinder, "Lagom P100");
    assert.equal(result.activeEquipment.burrs, "98mm HU");
    assert.equal(result.activeEquipment.basket, "HE Basket");
    assert.deepEqual(result.activeEquipment.tampers, ["Bravo Tamper"]);
    assert.deepEqual(result.activeEquipment.distributors, ["6.5 mm spacers on leveler"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
