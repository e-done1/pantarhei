import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseTclProfile,
  parseShotFile,
  deduplicateProfiles,
  deduplicateShots,
  normalizeProfileTitle,
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
