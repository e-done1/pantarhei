import assert from "node:assert/strict";
import { test } from "node:test";
import {
  INITIAL_SEEDED_SHOTS,
  searchShotHistory,
  createShotRecord,
} from "../src/types/shot.ts";
import type { ShotRecord } from "../src/types/shot.ts";
import type { PantaBean } from "../src/types/bean.ts";

test("Shot History Search: Free-text searches match coffee name, roaster, and tasting tags", () => {
  // Search by coffee name
  const byName = searchShotHistory(INITIAL_SEEDED_SHOTS, "Worka Sakaro");
  assert.equal(byName.length, 2, "Matches 2 Worka Sakaro shots in archive");

  // Search by roaster
  const byRoaster = searchShotHistory(INITIAL_SEEDED_SHOTS, "April");
  assert.equal(byRoaster.length, 1);
  assert.equal(byRoaster[0].roaster, "April Coffee");

  // Search by sensory tag
  const byTag = searchShotHistory(INITIAL_SEEDED_SHOTS, "lychee");
  assert.equal(byTag.length, 1);
  assert.equal(byTag[0].beanName, "El Paraiso Lychee");
});

test("Shot History Search: Multi-token intersection matches multiple fields simultaneously", () => {
  // Matches Sey + Washed + Bergamot (strictly Shot 0)
  const multi = searchShotHistory(INITIAL_SEEDED_SHOTS, "Sey Bergamot Washed");
  assert.equal(multi.length, 1);
  assert.equal(multi[0].beanName, "Worka Sakaro");
  assert.equal(multi[0].grindSetting, "4.2");

  // No match for non-existent combination
  const empty = searchShotHistory(INITIAL_SEEDED_SHOTS, "April Lychee");
  assert.equal(empty.length, 0);
});

test("Shot History Filtering: Filter by specific bean name", () => {
  const filtered = searchShotHistory(INITIAL_SEEDED_SHOTS, "", {
    beanName: "Gichathaini AB",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].beanName, "Gichathaini AB");
  assert.equal(filtered[0].countryOfOrigin, "Kenya");
});

test("Shot History Filtering: Filter by extraction profile", () => {
  const filtered = searchShotHistory(INITIAL_SEEDED_SHOTS, "", {
    profileTitle: "Strega Spring Lever",
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].profileTitle, "Strega Spring Lever");
});

test("Shot History Filtering: Filter by minimum rating", () => {
  const highRated = searchShotHistory(INITIAL_SEEDED_SHOTS, "", {
    minRating: 9.0,
  });
  assert.equal(highRated.length, 2, "Only shots rated >= 9.0 are included");
  assert.ok(highRated.every((s) => s.rating >= 9.0));
});

test("Shot History Filtering: Filter by channeling status", () => {
  const channeled = searchShotHistory(INITIAL_SEEDED_SHOTS, "", {
    channelFilter: "channeled",
  });
  assert.equal(channeled.length, 1);
  assert.equal(channeled[0].channelDetected, true);
  assert.ok(channeled[0].tags.includes("Channeling"));

  const clean = searchShotHistory(INITIAL_SEEDED_SHOTS, "", {
    channelFilter: "clean",
  });
  assert.equal(clean.length, 3);
  assert.ok(clean.every((s) => !s.channelDetected));
});

test("Shot History Sorting: Supports newest, rating, and extraction time sorts", () => {
  // Sort by rating (highest first)
  const byRating = searchShotHistory(INITIAL_SEEDED_SHOTS, "", {
    sortBy: "rating",
  });
  assert.equal(byRating[0].rating, 9.5); // El Paraiso Lychee
  assert.equal(byRating[byRating.length - 1].rating, 6.5); // Channeled shot

  // Sort by extraction time (descending)
  const byTime = searchShotHistory(INITIAL_SEEDED_SHOTS, "", {
    sortBy: "time",
  });
  assert.equal(byTime[0].durationSeconds, 34.0); // Longest extraction 34.0s
  assert.equal(byTime[byTime.length - 1].durationSeconds, 21.5); // Fastest extraction 21.5s
});

test("Shot Factory: createShotRecord computes correct ratios, metrics, and channeling flags", () => {
  const mockBean: PantaBean = {
    id: "bean-test",
    name: "Pink Bourbon",
    roaster: "Manhattan",
    countryOfOrigin: "Colombia",
    process: "Washed",
    roastDate: "2026-11-01",
    totalGrams: 250,
    remainingGrams: 200,
    isFrozen: false,
    targetDose: 18.0,
    targetYield: 36.0,
    targetGrind: "4.0",
    tastingNotes: ["Floral", "Peach"],
    recommendedRestDays: 14,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const telemetry = [
    {
      timestamp: 1000,
      timeSeconds: 0,
      pressure: 2.0,
      targetPressure: 9.0,
      flow: 4.0,
      targetFlow: 2.0,
      weightFlow: 0,
      weight: 0,
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: 0.5,
      phase: "preinfusion" as const,
      channelDetected: false,
    },
    {
      timestamp: 25000,
      timeSeconds: 26.5,
      pressure: 8.5,
      targetPressure: 9.0,
      flow: 1.8,
      targetFlow: 2.0,
      weightFlow: 1.5,
      weight: 36.5,
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: 3.4,
      phase: "extraction" as const,
      channelDetected: true,
    },
  ];

  const shot = createShotRecord({
    telemetry,
    bean: mockBean,
    profileTitle: "Adaptive Flow",
    targetDose: 18.0,
    targetYield: 36.0,
    tds: 9.5,
  });

  assert.equal(shot.beanName, "Pink Bourbon");
  assert.equal(shot.roaster, "Manhattan");
  assert.equal(shot.profileTitle, "Adaptive Flow");
  assert.equal(shot.actualYield, 36.5);
  assert.equal(shot.actualDose, 18.0);
  assert.equal(shot.ratio, 2.03); // 36.5 / 18 = 2.027 -> 2.03
  assert.equal(shot.durationSeconds, 26.5);
  assert.equal(shot.peakPressure, 8.5);
  assert.equal(shot.channelDetected, true, "Flags channeling detected");
  assert.equal(shot.channelCount, 1);
  assert.equal(shot.ey, 19.26); // (36.5 * 9.5) / 18 = 19.26
});
