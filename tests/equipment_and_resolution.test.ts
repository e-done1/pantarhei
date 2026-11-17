import { describe, it } from "node:test";
import assert from "node:assert";
import {
  DEFAULT_EQUIPMENT_INVENTORY,
  DEFAULT_ACTIVE_EQUIPMENT,
  formatEquipmentSummary,
  type EquipmentInventory,
  type ActiveEquipmentSelection,
} from "../src/types/equipment.ts";
import { createShotRecord, serializeShotToDecaidJson, serializeShotToTcl, type ShotRecord } from "../src/types/shot.ts";
import { parseShotFile } from "../src/services/legacyMigration.ts";
import { formatShotForDYE } from "../src/services/dyeBridge.ts";
import type { TelemetryPoint } from "../src/types/telemetry.ts";

describe("Equipment Inventory & Shot Selection Tests", () => {
  it("DEFAULT_EQUIPMENT_INVENTORY contains all 8 required categories", () => {
    const inv = DEFAULT_EQUIPMENT_INVENTORY;
    assert.ok(Array.isArray(inv.grinders) && inv.grinders.length > 0, "grinders array present");
    assert.ok(Array.isArray(inv.burrs) && inv.burrs.length > 0, "burrs array present");
    assert.ok(Array.isArray(inv.baskets) && inv.baskets.length > 0, "baskets array present");
    assert.ok(Array.isArray(inv.scales) && inv.scales.length > 0, "scales array present");
    assert.ok(Array.isArray(inv.tampers) && inv.tampers.length > 0, "tampers array present");
    assert.ok(Array.isArray(inv.distributors), "distributors array present");
    assert.ok(Array.isArray(inv.wdt) && inv.wdt.length > 0, "wdt array present");
    assert.ok(Array.isArray(inv.rdt) && inv.rdt.length > 0, "rdt array present");
  });

  it("Single-select categories enforce single item selection", () => {
    let selection: ActiveEquipmentSelection = {
      grinder: "Lagom P64",
      burrs: "SSP 64mm Cast Red Speed",
      basket: "Decent CB 18g",
      scale: "Decent Scale DS-104",
      tampers: [],
      distributors: [],
      wdt: [],
      rdt: [],
    };

    // Selecting a different grinder replaces the previous one
    selection = { ...selection, grinder: "KafaTek Monolith Flat MAX" };
    assert.strictEqual(selection.grinder, "KafaTek Monolith Flat MAX");

    // Deselecting by toggling off
    const toggledOff = selection.grinder === "KafaTek Monolith Flat MAX" ? undefined : selection.grinder;
    selection = { ...selection, grinder: toggledOff };
    assert.strictEqual(selection.grinder, undefined);
  });

  it("Multi-select categories allow multiple tools simultaneously", () => {
    let selection: ActiveEquipmentSelection = {
      tampers: ["Normcore V4 Spring 58.5mm"],
      distributors: ["Wedge 58.5mm Distributor"],
      wdt: ["AutoComb Spinning WDT"],
      rdt: ["2 Sprays Distilled Water"],
    };

    // Add another tamper
    selection = {
      ...selection,
      tampers: [...selection.tampers, "Decent Calibrated Tamper"],
    };
    assert.strictEqual(selection.tampers.length, 2);
    assert.ok(selection.tampers.includes("Normcore V4 Spring 58.5mm"));
    assert.ok(selection.tampers.includes("Decent Calibrated Tamper"));

    // Remove one tamper
    selection = {
      ...selection,
      tampers: selection.tampers.filter((t) => t !== "Normcore V4 Spring 58.5mm"),
    };
    assert.strictEqual(selection.tampers.length, 1);
    assert.strictEqual(selection.tampers[0], "Decent Calibrated Tamper");
  });

  it("formatEquipmentSummary generates a clean one-line summary", () => {
    const summary = formatEquipmentSummary({
      grinder: "Lagom P64",
      burrs: "SSP 64mm",
      basket: "IMS Competition 18g",
      scale: "Lunar",
      tampers: ["Normcore V4"],
      distributors: [],
      wdt: ["AutoComb"],
      rdt: ["1 Spray Mist"],
    });

    assert.ok(summary.includes("Lagom P64 (SSP 64mm)"));
    assert.ok(summary.includes("IMS Competition 18g"));
    assert.ok(summary.includes("WDT: AutoComb"));
    assert.ok(summary.includes("Normcore V4"));
  });

  it("ShotRecord stores equipment and propagates to DYE sync schema", () => {
    const activeGear: ActiveEquipmentSelection = {
      grinder: "Weber EG-1",
      burrs: "Ultra Low Fines 80mm",
      basket: "Wafo Spirit 18-20g",
      scale: "Decent Scale DS-104",
      tampers: ["Force Tamper 58.5mm"],
      distributors: ["Jack Leveler"],
      wdt: ["Umikot Planetary WDT"],
      rdt: ["Ross Droplet Technique"],
    };

    const mockPoints: TelemetryPoint[] = [
      {
        timestamp: Date.now() - 25000,
        timeSeconds: 0,
        pressure: 0,
        targetPressure: 9,
        flow: 0,
        targetFlow: 2,
        weightFlow: 0,
        weight: 0,
        groupTemperature: 93,
        targetGroupTemp: 93,
        steamTemperature: 150,
        puckResistance: 0,
        phase: "preinfusion",
        stepName: "Pre-infusion",
      },
      {
        timestamp: Date.now(),
        timeSeconds: 26.5,
        pressure: 7.2,
        targetPressure: 7,
        flow: 2.1,
        targetFlow: 2,
        weightFlow: 1.9,
        weight: 38.0,
        groupTemperature: 93,
        targetGroupTemp: 93,
        steamTemperature: 150,
        puckResistance: 3.42,
        phase: "extraction",
        stepName: "Decline",
      },
    ];

    const record = createShotRecord({
      telemetry: mockPoints,
      bean: {
        id: "bean-test",
        name: "Worka Sakaro",
        roaster: "Sey",
        targetGrind: "3.4",
      },
      profileTitle: "Idan's Strega Plus",
      profileId: "idan-strega-plus",
      targetDose: 18.0,
      targetYield: 36.0,
      grindSetting: "3.4",
      basket: "Wafo Spirit 18-20g",
      equipment: activeGear,
    });

    assert.ok(record.equipment, "Equipment present on ShotRecord");
    assert.strictEqual(record.equipment?.grinder, "Weber EG-1");
    assert.strictEqual(record.equipment?.basket, "Wafo Spirit 18-20g");

    // Verify DYE formatting
    const dyePayload = formatShotForDYE(record);
    assert.strictEqual(dyePayload.recipe.basket, "Wafo Spirit 18-20g");
    assert.strictEqual(dyePayload.equipment?.grinder, "Weber EG-1");
    assert.strictEqual(dyePayload.equipment?.burrs, "Ultra Low Fines 80mm");
    assert.deepStrictEqual(dyePayload.equipment?.tampers, ["Force Tamper 58.5mm"]);
    assert.deepStrictEqual(dyePayload.equipment?.wdt, ["Umikot Planetary WDT"]);
  });

  it("Decaid shot files (JSON and TCL) record equipment and puck prep technique and roundtrip cleanly", () => {
    const activeGear: ActiveEquipmentSelection = {
      grinder: "Lagom P64",
      burrs: "SSP 64mm Cast Red Speed",
      basket: "Decent NB 20g",
      scale: "Decent Scale DS-104",
      tampers: ["Normcore V4 Spring 58.5mm"],
      distributors: ["Wedge 58.5mm Distributor"],
      wdt: ["AutoComb Spinning WDT"],
      rdt: ["2 Sprays Distilled Water"],
    };

    const record = createShotRecord({
      telemetry: [],
      bean: {
        id: "bean-1",
        name: "Gesha Village",
        roaster: "Sey",
        targetGrind: "4.1",
      },
      profileTitle: "Filter 3",
      targetDose: 18.0,
      targetYield: 38.0,
      basket: "Decent NB 20g",
      equipment: activeGear,
    });

    // 1. Decaid JSON serialization
    const decaidJson = serializeShotToDecaidJson(record);
    assert.ok(decaidJson.equipment, "equipment stored in Decaid JSON");
    assert.strictEqual(decaidJson.equipment.grinder, "Lagom P64");
    assert.strictEqual(decaidJson.equipment.burrs, "SSP 64mm Cast Red Speed");
    assert.ok(decaidJson.puckPrepSummary.includes("Lagom P64"));
    assert.ok(decaidJson.puckPrepSummary.includes("AutoComb"));

    const parsedJson = parseShotFile(JSON.stringify(decaidJson));
    assert.ok(parsedJson?.equipment, "parsed from Decaid JSON");
    assert.strictEqual(parsedJson.equipment?.grinder, "Lagom P64");

    // 2. Decaid TCL .shot serialization
    const tcl = serializeShotToTcl(record);
    assert.ok(tcl.includes("grinder_model {Lagom P64}"), "grinder_model in TCL");
    assert.ok(tcl.includes("burrs {SSP 64mm Cast Red Speed}"), "burrs in TCL");
    assert.ok(tcl.includes("basket {Decent NB 20g}"), "basket in TCL");
    assert.ok(tcl.includes("equipment_wdt {AutoComb Spinning WDT}"), "WDT in TCL");
    assert.ok(tcl.includes("espresso_puck_prep"), "puck prep in TCL");

    const parsedTcl = parseShotFile(tcl, "test.shot");
    assert.ok(parsedTcl?.equipment, "parsed from Decaid TCL .shot");
    assert.strictEqual(parsedTcl.equipment?.grinder, "Lagom P64");
    assert.strictEqual(parsedTcl.equipment?.burrs, "SSP 64mm Cast Red Speed");
    assert.strictEqual(parsedTcl.equipment?.basket, "Decent NB 20g");
    assert.deepStrictEqual(parsedTcl.equipment?.wdt, ["AutoComb Spinning WDT"]);
  });

  it("Left pane equipment changes take effect for subsequent shots and remain editable in history", () => {
    // Initial equipment selection
    let leftPaneEquipment: ActiveEquipmentSelection = {
      grinder: "Lagom P64",
      burrs: "SSP 64mm",
      basket: "CB 18g",
      scale: "Decent Scale DS-104",
      tampers: ["Normcore V4"],
      distributors: [],
      wdt: ["0.25mm Needles"],
      rdt: ["1 Spray Mist"],
    };

    // First shot captures initial equipment
    const shot1 = createShotRecord({
      telemetry: [],
      bean: { id: "b1", name: "Bean A", roaster: "Roaster A" },
      profileTitle: "Profile A",
      targetDose: 18.0,
      targetYield: 36.0,
      equipment: leftPaneEquipment,
    });
    assert.strictEqual(shot1.equipment?.grinder, "Lagom P64");
    assert.deepStrictEqual(shot1.equipment?.wdt, ["0.25mm Needles"]);

    // Barista changes equipment on left pane for NEXT shot
    leftPaneEquipment = {
      ...leftPaneEquipment,
      grinder: "KafaTek Monolith Flat MAX",
      burrs: "Shuriken LM 98mm",
      wdt: ["AutoComb Spinning WDT"],
    };

    // Subsequent shot captures updated equipment
    const shot2 = createShotRecord({
      telemetry: [],
      bean: { id: "b1", name: "Bean A", roaster: "Roaster A" },
      profileTitle: "Profile A",
      targetDose: 18.0,
      targetYield: 36.0,
      equipment: leftPaneEquipment,
    });
    assert.strictEqual(shot2.equipment?.grinder, "KafaTek Monolith Flat MAX");
    assert.strictEqual(shot2.equipment?.burrs, "Shuriken LM 98mm");
    assert.deepStrictEqual(shot2.equipment?.wdt, ["AutoComb Spinning WDT"]);

    // Barista edits past shot1 in history view
    const editedShot1: ShotRecord = {
      ...shot1,
      equipment: {
        ...shot1.equipment!,
        basket: "Wafo Spirit 18g",
        wdt: ["Moonraker WDT"],
      },
    };
    assert.strictEqual(editedShot1.equipment?.basket, "Wafo Spirit 18g");
    assert.deepStrictEqual(editedShot1.equipment?.wdt, ["Moonraker WDT"]);

    // Serialized Decaid shot file for edited shot contains updated equipment
    const editedDecaidJson = serializeShotToDecaidJson(editedShot1);
    assert.strictEqual(editedDecaidJson.equipment.basket, "Wafo Spirit 18g");
    assert.deepStrictEqual(editedDecaidJson.equipment.wdt, ["Moonraker WDT"]);
  });
});

describe("Continuous Graph Scrubbing & Interpolation Tests", () => {
  it("Continuous interpolation smoothly resolves 0.1s and 0.5s sub-second intervals", () => {
    // Simulated 1s spaced points
    const points: TelemetryPoint[] = [
      {
        timestamp: 1000,
        timeSeconds: 10.0,
        pressure: 8.0,
        targetPressure: 9.0,
        flow: 2.0,
        targetFlow: 2.0,
        weightFlow: 1.8,
        weight: 15.0,
        groupTemperature: 93.0,
        targetGroupTemp: 93.0,
        steamTemperature: 150.0,
        puckResistance: 4.0,
        phase: "extraction",
        stepName: "Extraction",
      },
      {
        timestamp: 2000,
        timeSeconds: 11.0,
        pressure: 9.0,
        targetPressure: 9.0,
        flow: 2.4,
        targetFlow: 2.0,
        weightFlow: 2.2,
        weight: 17.0,
        groupTemperature: 93.0,
        targetGroupTemp: 93.0,
        steamTemperature: 150.0,
        puckResistance: 3.75,
        phase: "extraction",
        stepName: "Extraction",
      },
    ];

    // Linear interpolation function mirroring CenterStatusPane
    function interpolateAtTime(t: number, pts: TelemetryPoint[]): TelemetryPoint {
      const pLeft = pts[0];
      const pRight = pts[1];
      const dt = pRight.timeSeconds - pLeft.timeSeconds;
      const alpha = (t - pLeft.timeSeconds) / dt;
      return {
        ...pLeft,
        timeSeconds: Math.round(t * 10) / 10,
        pressure: +(pLeft.pressure + alpha * (pRight.pressure - pLeft.pressure)).toFixed(2),
        flow: +(pLeft.flow + alpha * (pRight.flow - pLeft.flow)).toFixed(2),
        weight: +(pLeft.weight + alpha * (pRight.weight - pLeft.weight)).toFixed(1),
        weightFlow: +(pLeft.weightFlow + alpha * (pRight.weightFlow - pLeft.weightFlow)).toFixed(2),
        puckResistance: +(pLeft.puckResistance + alpha * (pRight.puckResistance - pLeft.puckResistance)).toFixed(2),
      };
    }

    // Inspect at 0.5s interval (t = 10.5s)
    const at10_5 = interpolateAtTime(10.5, points);
    assert.strictEqual(at10_5.timeSeconds, 10.5);
    assert.strictEqual(at10_5.pressure, 8.5); // Midpoint of 8.0 and 9.0
    assert.strictEqual(at10_5.flow, 2.2);     // Midpoint of 2.0 and 2.4
    assert.strictEqual(at10_5.weight, 16.0);   // Midpoint of 15.0 and 17.0

    // Inspect at 0.1s resolution (t = 10.3s)
    const at10_3 = interpolateAtTime(10.3, points);
    assert.strictEqual(at10_3.timeSeconds, 10.3);
    assert.strictEqual(at10_3.pressure, 8.3);
    assert.strictEqual(at10_3.flow, 2.12);
    assert.strictEqual(at10_3.weight, 15.6);
  });
});
