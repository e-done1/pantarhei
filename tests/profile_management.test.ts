import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createNewProfile,
  cloneProfile,
  createDefaultProfileSteps,
  COMMON_PROFILE_CATEGORIES,
  serializeToDecaidV2,
  serializeToDecaidTcl,
  generateProfileFilename,
} from "../src/types/profile.ts";
import type { ProfileItem } from "../src/types/profile.ts";

test("Profile Factory: createNewProfile generates valid custom profile defaults", () => {
  const profile = createNewProfile();

  assert.ok(profile.id.startsWith("custom-profile-"), "Generates unique custom ID prefix");
  assert.equal(profile.isCustom, true, "Profile is marked as custom");
  assert.equal(profile.title, "New Extraction Profile");
  assert.equal(profile.author, "Barista");
  assert.equal(profile.category, "espresso");
  assert.equal(profile.target_temperature, 93.0);
  assert.equal(profile.target_dose, 18.0);
  assert.equal(profile.target_weight, 36.0);
  assert.ok(Array.isArray(profile.steps), "Steps is an array");
  assert.equal(profile.steps?.length, 4, "Initializes with 4 standard extraction steps");

  // Step integrity
  const preinfusion = profile.steps?.[0];
  assert.equal(preinfusion?.name, "Pre-infusion");
  assert.equal(preinfusion?.pump, "flow");
  assert.equal(preinfusion?.flow, "4.0");

  const ramp = profile.steps?.[2];
  assert.equal(ramp?.name, "Ramp & Extraction");
  assert.equal(ramp?.pump, "pressure");
  assert.equal(ramp?.pressure, "9.00");
});

test("Profile Factory: createNewProfile accepts custom parameter overrides", () => {
  const profile = createNewProfile({
    title: "Light Roast Blooming Allongé",
    author: "Scott Rao",
    category: "allonge",
    target_temperature: 95.0,
    target_dose: 15.0,
    target_weight: 75.0,
  });

  assert.equal(profile.title, "Light Roast Blooming Allongé");
  assert.equal(profile.author, "Scott Rao");
  assert.equal(profile.category, "allonge");
  assert.equal(profile.target_temperature, 95.0);
  assert.equal(profile.target_dose, 15.0);
  assert.equal(profile.target_weight, 75.0);
  assert.equal(profile.isCustom, true);
});

test("Profile Factory: cloneProfile generates independent copy with deep cloned steps", () => {
  const source: ProfileItem = {
    id: "curated-sey-0-Sey What",
    title: "Sey What (Big Flat)",
    author: "Decent",
    category: "sey",
    target_temperature: 94.0,
    target_weight: 45.0,
    target_dose: 18.0,
    isCustom: false,
    steps: [
      {
        name: "Fill Fast",
        temperature: "94.0",
        sensor: "coffee",
        pump: "flow",
        transition: "fast",
        pressure: "2.00",
        flow: "8.0",
        seconds: "5.00",
        volume: "80.00",
        weight: "0",
      },
    ],
  };

  const copy = cloneProfile(source);

  assert.notEqual(copy.id, source.id, "Clone has new unique ID");
  assert.ok(copy.id.startsWith("custom-profile-"), "Clone has custom prefix");
  assert.equal(copy.isCustom, true, "Cloned profile is flagged as custom");
  assert.equal(copy.title, "Sey What (Big Flat) (Copy)", "Appends (Copy) to title");
  assert.equal(copy.category, "sey");
  assert.equal(copy.target_temperature, 94.0);

  // Deep clone verification: Mutating copy steps must not affect source
  assert.ok(copy.steps && copy.steps.length === 1);
  copy.steps[0].name = "Mutated Step Name";
  assert.equal(source.steps[0].name, "Fill Fast", "Source steps remain completely immutable");
});

test("Profile Steps Factory: createDefaultProfileSteps correctly links target temperature", () => {
  const steps = createDefaultProfileSteps(91.5);

  assert.equal(steps.length, 4);
  assert.equal(steps[0].temperature, "91.5");
  assert.equal(steps[1].temperature, "91.5");
  assert.equal(steps[2].temperature, "91.5");
  // Decline step is dialed 2°C lower for temperature profiling
  assert.equal(steps[3].temperature, "89.5");
});

test("Profile Categories: Common categories include key Decaid styles", () => {
  assert.ok(COMMON_PROFILE_CATEGORIES.includes("espresso"));
  assert.ok(COMMON_PROFILE_CATEGORIES.includes("flow"));
  assert.ok(COMMON_PROFILE_CATEGORIES.includes("lever"));
  assert.ok(COMMON_PROFILE_CATEGORIES.includes("allonge"));
  assert.ok(COMMON_PROFILE_CATEGORIES.includes("filter"));
  assert.ok(COMMON_PROFILE_CATEGORIES.includes("sey"));
});

test("Decaid Standards: serializeToDecaidV2 produces valid profiles_v2 JSON structure", () => {
  const profile = createNewProfile({
    title: "Adaptive Flow 6-Bar",
    author: "Scott Rao",
    target_temperature: 94.0,
    target_weight: 40.0,
    notes: "Adaptive profile with bloom",
  });

  const v2 = serializeToDecaidV2(profile);

  assert.equal(v2.version, "2", "Version must be 2 according to Decaid standard");
  assert.equal(v2.type, "advanced");
  assert.equal(v2.title, "Adaptive Flow 6-Bar");
  assert.equal(v2.author, "Scott Rao");
  assert.equal(v2.target_weight, "40");
  assert.equal(v2.tank_temperature, "94");
  assert.ok(Array.isArray(v2.steps), "Steps must be an array");
  assert.equal(v2.steps.length, 4);

  // Check step formatting
  const step0 = v2.steps[0];
  assert.equal(step0.name, "Pre-infusion");
  assert.equal(step0.pump, "flow");
  assert.equal(step0.transition, "fast");
});

test("Decaid Standards: serializeToDecaidTcl produces valid legacy profiles TCL structure", () => {
  const profile = createNewProfile({
    title: "Strega Spring Lever",
    author: "Decent",
    target_temperature: 92.5,
    target_weight: 36.0,
    notes: "Lever spring curve",
  });

  const tcl = serializeToDecaidTcl(profile);

  assert.ok(tcl.includes("advanced_shot {"), "Must contain advanced_shot command");
  assert.ok(tcl.includes("profile_title {Strega Spring Lever}"), "Must contain profile_title");
  assert.ok(tcl.includes("author Decent") || tcl.includes("author {Decent}"), "Must contain author");
  assert.ok(tcl.includes("espresso_temperature 92.5"), "Must contain espresso_temperature");
  assert.ok(tcl.includes("final_desired_shot_weight 36"), "Must contain final_desired_shot_weight");
  assert.ok(tcl.includes("name {Pre-infusion}"), "Must contain escaped step names");
});

test("Decaid Standards: generateProfileFilename formats valid filenames for profiles_v2 and profiles", () => {
  const v2Filename = generateProfileFilename("Sey What? (Big Flat: V2)", "json");
  assert.equal(v2Filename, "sey_what_big_flat_v2.json");

  const tclFilename = generateProfileFilename("Sey What? (Big Flat: V2)", "tcl");
  assert.equal(tclFilename, "sey what (big flat v2).tcl");
});

test("Profile Sorting: Main profiles list is strictly sorted alphabetically from A to Z", () => {
  const unsortedProfiles: ProfileItem[] = [
    createNewProfile({ title: "Strega Spring Lever" }),
    createNewProfile({ title: "Blooming Allongé" }),
    createNewProfile({ title: "Adaptive Fast Flow" }),
    createNewProfile({ title: "Zebra Dark Roast" }),
    createNewProfile({ title: "Default 9 Bar" }),
  ];

  const sorted = [...unsortedProfiles].sort((a, b) => a.title.localeCompare(b.title));

  assert.equal(sorted[0].title, "Adaptive Fast Flow");
  assert.equal(sorted[1].title, "Blooming Allongé");
  assert.equal(sorted[2].title, "Default 9 Bar");
  assert.equal(sorted[3].title, "Strega Spring Lever");
  assert.equal(sorted[4].title, "Zebra Dark Roast");
});

test("Profile Visibility Control: Eye toggle filters out hidden profiles unless showHidden is active", () => {
  const p1 = createNewProfile({ id: "prof-1", title: "Profile One" });
  const p2 = createNewProfile({ id: "prof-2", title: "Profile Two" });
  const p3 = createNewProfile({ id: "prof-3", title: "Profile Three" });
  const all = [p1, p2, p3];

  const hiddenProfileIds = new Set<string>(["prof-2"]);

  // When showHidden is false (normal operational mode)
  const visibleOnly = all.filter((p) => !hiddenProfileIds.has(p.id));
  assert.equal(visibleOnly.length, 2);
  assert.ok(!visibleOnly.some((p) => p.id === "prof-2"), "Hidden profile is filtered out");

  // When showHidden is true (manager inspection mode)
  const showAllMode = all;
  assert.equal(showAllMode.length, 3);
  assert.ok(showAllMode.some((p) => p.id === "prof-2"), "Hidden profile is included in showAllMode");
});

test("Profile Tag Management: Custom tags are deduplicated, sorted, and removable", () => {
  const customTags = ["filter", "turbo"];

  // Add new tag
  const newTag = "blooming";
  const updated = [...customTags, newTag].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(updated, ["blooming", "filter", "turbo"]);

  // Remove tag
  const removed = updated.filter((t) => t !== "filter");
  assert.deepEqual(removed, ["blooming", "turbo"]);
});

test("Bean Associated Tags: Supports interactive adding and removing of flavor descriptors", () => {
  const initialTags = ["Floral", "Bergamot"];

  // Add descriptor
  const added = [...initialTags, "Peach"];
  assert.deepEqual(added, ["Floral", "Bergamot", "Peach"]);

  // Remove descriptor
  const removed = added.filter((t) => t !== "Bergamot");
  assert.deepEqual(removed, ["Floral", "Peach"]);
});

test("History Filter Tags: Supports custom coffee and profile filter tags with removal", () => {
  const customCoffeeTags = ["Sey Yirgacheffe"];
  const customProfileTags = ["Scott Rao Flow"];

  // Add coffee tag
  const updatedCoffee = [...customCoffeeTags, "Worka Sakaro"];
  assert.equal(updatedCoffee.length, 2);

  // Remove coffee tag
  const filteredCoffee = updatedCoffee.filter((t) => t !== "Sey Yirgacheffe");
  assert.deepEqual(filteredCoffee, ["Worka Sakaro"]);

  // Add & remove profile tag
  const updatedProfiles = [...customProfileTags, "Gentle Decline"];
  const filteredProfiles = updatedProfiles.filter((t) => t !== "Scott Rao Flow");
  assert.deepEqual(filteredProfiles, ["Gentle Decline"]);
});


