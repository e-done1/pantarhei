import assert from "node:assert/strict";
import { test } from "node:test";

interface StepMarker {
  timeSeconds: number;
  name: string;
}

interface StepLayoutItem {
  isFirstStep: boolean;
  name: string;
  timeSeconds: number;
  badgeX: number;
  width: number;
  lineX?: number;
  lineStartY?: number;
  tier: number;
}

function calculateStepLayout(
  stepMarkers: StepMarker[],
  padLeft: number,
  plotW: number,
  padTop: number,
  plotH: number,
  finalTime: number,
  maxSeconds: number,
  measureTextWidth: (text: string) => number
) {
  if (stepMarkers.length === 0) return { firstStep: null, transitions: [] };

  const getX = (t: number) => padLeft + (t / maxSeconds) * plotW;
  const badgeH = 17;
  const tierStepH = 22;

  // 1. First step (between start point on left of graph and first transition line)
  const firstStepName = stepMarkers[0].name;
  const firstStepEndTime = stepMarkers.length > 1 ? stepMarkers[1].timeSeconds : finalTime;
  const firstStepEndX = getX(firstStepEndTime);
  const firstStepWidthAvail = firstStepEndX - padLeft;
  const firstStepLabel =
    firstStepWidthAvail > 90
      ? `${firstStepName} (0-${firstStepEndTime.toFixed(1)}s)`
      : firstStepName;
  const firstBadgeW = Math.max(54, measureTextWidth(firstStepLabel) + 14);
  const firstBadgeX = (padLeft + firstStepEndX) / 2;

  // 2. Transitions
  const transitionItems = stepMarkers.slice(1).map((marker, idx) => {
    const lineX = getX(marker.timeSeconds);
    const label = `${marker.name} (${marker.timeSeconds.toFixed(1)}s)`;
    const width = Math.max(60, measureTextWidth(label) + 14);
    const badgeX = Math.max(padLeft + width / 2 + 2, Math.min(padLeft + plotW - width / 2 - 2, lineX));
    return {
      isFirstStep: false,
      name: marker.name,
      timeSeconds: marker.timeSeconds,
      lineX,
      badgeX,
      width,
      tier: 0,
      label,
    };
  }).filter((item) => item.lineX > padLeft && item.lineX < padLeft + plotW - 6);

  // 3. Collision detection & Tier allocation
  const allLayout = [
    { isFirstStep: true, name: firstStepName, timeSeconds: 0, badgeX: firstBadgeX, width: firstBadgeW, tier: 0, label: firstStepLabel },
    ...transitionItems
  ];

  allLayout.forEach((item, i) => {
    if (i === 0) {
      item.tier = 0;
      return;
    }
    const conflictingTiers = new Set<number>();
    for (let j = 0; j < i; j++) {
      const prev = allLayout[j];
      const dist = Math.abs(item.badgeX - prev.badgeX);
      const minClearance = (item.width + prev.width) / 2 + 8;
      if (dist < minClearance) {
        conflictingTiers.add(prev.tier);
      }
    }
    let tier = 0;
    while (conflictingTiers.has(tier)) {
      tier++;
    }
    item.tier = tier;
    if (!item.isFirstStep) {
      const trans = transitionItems.find(t => t.timeSeconds === item.timeSeconds);
      if (trans) trans.tier = tier;
    }
  });

  // Calculate lineStartY (glued directly at bottom of badge)
  const transitionsWithLines = transitionItems.map(item => {
    const badgeY = padTop + 4 + item.tier * tierStepH;
    const lineStartY = badgeY + badgeH;
    return {
      ...item,
      badgeY,
      lineStartY,
      lineEndY: padTop + plotH,
    };
  });

  return {
    firstStep: {
      ...allLayout[0],
      endX: firstStepEndX,
      badgeY: padTop + 4 + allLayout[0].tier * tierStepH,
    },
    transitions: transitionsWithLines,
  };
}

test("Step Indications: First Step positioned between start and first step", () => {
  const padLeft = 48;
  const plotW = 600;
  const padTop = 24;
  const plotH = 260;
  const maxSeconds = 30;

  const mockMeasure = (str: string) => str.length * 5.5;

  const markers: StepMarker[] = [
    { timeSeconds: 0, name: "Pre-infusion" },
    { timeSeconds: 5.0, name: "Soak" },
    { timeSeconds: 8.0, name: "Extraction" },
    { timeSeconds: 18.0, name: "Decline" },
  ];

  const layout = calculateStepLayout(
    markers,
    padLeft,
    plotW,
    padTop,
    plotH,
    28,
    maxSeconds,
    mockMeasure
  );

  assert.ok(layout.firstStep, "First step must exist");
  assert.equal(layout.firstStep.name, "Pre-infusion");

  // First step X must be strictly between padLeft (48) and getX(5.0) = 48 + (5/30)*600 = 148
  const x0 = padLeft;
  const x1 = padLeft + (5.0 / 30) * 600; // 148
  assert.ok(
    layout.firstStep.badgeX > x0 && layout.firstStep.badgeX < x1,
    `First step badgeX (${layout.firstStep.badgeX}) must be between start (${x0}) and first step line (${x1})`
  );
  console.log("✅ PASSED: First step name is placed between start point and first step line.");
});

test("Step Indications: Crowded steps assigned different heights from top of axis", () => {
  const padLeft = 48;
  const plotW = 600;
  const padTop = 24;
  const plotH = 260;
  const maxSeconds = 30;
  const mockMeasure = (str: string) => str.length * 5.5;

  const markers: StepMarker[] = [
    { timeSeconds: 0, name: "Pre-infusion" },
    { timeSeconds: 4.0, name: "Soak" },        // Close to pre-infusion
    { timeSeconds: 6.5, name: "Extraction" },  // Very close to soak (only 2.5s)
    { timeSeconds: 20.0, name: "Decline" },    // Far away
  ];

  const layout = calculateStepLayout(
    markers,
    padLeft,
    plotW,
    padTop,
    plotH,
    28,
    maxSeconds,
    mockMeasure
  );

  const soak = layout.transitions.find(t => t.name === "Soak")!;
  const extraction = layout.transitions.find(t => t.name === "Extraction")!;
  const decline = layout.transitions.find(t => t.name === "Decline")!;

  assert.ok(soak, "Soak transition exists");
  assert.ok(extraction, "Extraction transition exists");

  // Crowded steps (Pre-infusion, Soak, Extraction) must NOT share the same tier
  assert.notEqual(soak.tier, layout.firstStep!.tier, "Soak must be on a different tier than Pre-infusion");
  assert.notEqual(extraction.tier, soak.tier, "Extraction must be on a different tier than Soak when crowded");

  // Different heights from top of the axis
  assert.notEqual(soak.badgeY, extraction.badgeY, "Crowded steps must have badges at different Y heights");
  assert.notEqual(soak.lineStartY, extraction.lineStartY, "Crowded steps must have lines starting at different heights");

  // Glued text: lineStartY must be exactly badgeY + badgeH
  assert.equal(soak.lineStartY, soak.badgeY + 17, "Line must be glued right to the bottom of the Soak badge");
  assert.equal(extraction.lineStartY, extraction.badgeY + 17, "Line must be glued right to the bottom of the Extraction badge");

  // Uncrowded step (Decline at 20s) can safely use Tier 0
  assert.equal(decline.tier, 0, "Uncrowded step can return to Tier 0");

  console.log("✅ PASSED: Crowded steps have indication lines at different heights with text glued on top.");
});
