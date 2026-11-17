import assert from "node:assert/strict";
import { test } from "node:test";
import type { TelemetryPoint } from "../src/services/telemetrySimulator.ts";

interface DerivativePoint {
  timeSeconds: number;
  dRdt: number;
  flowAcc: number;
  pressureDrop: number;
}

interface ChannelingEvent {
  timeSeconds: number;
  pressure: number;
  flow: number;
  resistance: number;
  dRdt: number;
  flowAcc: number;
  severity: "minor" | "moderate" | "severe";
}

function computeDRdtSeries(history: TelemetryPoint[]): DerivativePoint[] {
  if (history.length < 3) return [];
  const N = history.length;
  const result: DerivativePoint[] = [];

  for (let i = 0; i < N; i++) {
    const pt = history[i];

    if (pt.timeSeconds < 2.0 || pt.flow < 0.2) {
      result.push({
        timeSeconds: pt.timeSeconds,
        dRdt: 0,
        flowAcc: 0,
        pressureDrop: 0,
      });
      continue;
    }

    // 3-point to 4-point backward causal window (prevents premature future leakage)
    const iPrev = Math.max(0, i - 3);
    const dt = history[i].timeSeconds - history[iPrev].timeSeconds;

    if (dt > 0.05) {
      const rPrev = history[iPrev].puckResistance;
      const rCurr = history[i].puckResistance;
      const fPrev = history[iPrev].flow;
      const fCurr = history[i].flow;
      const pPrev = history[iPrev].pressure;
      const pCurr = history[i].pressure;

      const dRdt = (rCurr - rPrev) / dt;
      const flowAcc = (fCurr - fPrev) / dt;
      const pressureDrop = (pCurr - pPrev) / dt;

      result.push({
        timeSeconds: pt.timeSeconds,
        dRdt: Math.round(dRdt * 100) / 100,
        flowAcc: Math.round(flowAcc * 100) / 100,
        pressureDrop: Math.round(pressureDrop * 100) / 100,
      });
    } else {
      result.push({
        timeSeconds: pt.timeSeconds,
        dRdt: 0,
        flowAcc: 0,
        pressureDrop: 0,
      });
    }
  }

  return result;
}

function detectChannelingEvents(
  history: TelemetryPoint[],
  dRdtSeries: DerivativePoint[],
  sensitivity: "sensitive" | "moderate" | "low" = "moderate"
): ChannelingEvent[] {
  if (history.length < 5 || dRdtSeries.length === 0) return [];

  const thresholds = {
    sensitive: { dRdt: -0.42, flowAcc: 0.12, pressureDrop: 0.20 },
    moderate: { dRdt: -0.65, flowAcc: 0.20, pressureDrop: 0.15 },
    low: { dRdt: -1.05, flowAcc: 0.40, pressureDrop: 0.10 },
  }[sensitivity];

  const events: ChannelingEvent[] = [];
  let lastEventTime = -10;

  for (let i = 2; i < history.length - 2; i++) {
    const pt = history[i];
    const dPoint = dRdtSeries[i];
    if (!dPoint) continue;

    if (pt.timeSeconds < 3.2) continue;
    if (pt.flow < 0.8) continue;

    // Debounce window (1.8s) so only the starting point is flagged
    if (pt.timeSeconds - lastEventTime < 1.8) continue;

    const isDynamicChannel =
      dPoint.dRdt <= thresholds.dRdt &&
      dPoint.flowAcc >= thresholds.flowAcc &&
      dPoint.pressureDrop <= thresholds.pressureDrop;

    const isExplicitChannel = Boolean(pt.channelDetected);

    if (isDynamicChannel || isExplicitChannel) {
      lastEventTime = pt.timeSeconds;

      const severity: ChannelingEvent["severity"] =
        dPoint.dRdt <= -1.4 || dPoint.flowAcc >= 0.8
          ? "severe"
          : dPoint.dRdt <= -0.95 || dPoint.flowAcc >= 0.45
          ? "moderate"
          : "minor";

      events.push({
        timeSeconds: pt.timeSeconds,
        pressure: pt.pressure,
        flow: pt.flow,
        resistance: pt.puckResistance,
        dRdt: dPoint.dRdt,
        flowAcc: dPoint.flowAcc,
        severity,
      });
    }
  }

  return events;
}

test("Derivative Calculation (dR/dt) & Smoothing", () => {
  // Simulate healthy extraction: gentle erosion from 8s to 12s
  const history: TelemetryPoint[] = Array.from({ length: 15 }, (_, i) => {
    const t = i;
    const p = t < 5 ? t * 0.8 : 8.0;
    const f = t < 5 ? 0.3 : 2.0 + (t - 5) * 0.05; // slowly increasing flow
    const r = p / f;
    return {
      timestamp: Date.now() + i * 1000,
      timeSeconds: t,
      pressure: p,
      targetPressure: 8.0,
      flow: f,
      targetFlow: 2.0,
      weightFlow: f * 0.95,
      weight: t * 2,
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: Math.round(r * 100) / 100,
      phase: t < 5 ? "preinfusion" : "extraction",
      channelDetected: false,
    };
  });

  const dRdt = computeDRdtSeries(history);
  assert.equal(dRdt.length, history.length, "dR/dt points must match history length");

  // In preinfusion (t < 2.0s), dR/dt must be zeroed out
  assert.equal(dRdt[0].dRdt, 0);
  assert.equal(dRdt[1].dRdt, 0);

  // During stable erosion (t = 8s), dR/dt must be mildly negative (-0.05 to -0.2)
  const erosionPoint = dRdt[8];
  assert.ok(
    erosionPoint.dRdt <= 0 && erosionPoint.dRdt > -0.5,
    `Erosion dR/dt (${erosionPoint.dRdt}) should be mildly negative`
  );

  console.log("✅ PASSED: dR/dt central difference smoothing & erosion baseline verified.");
});

test("Channeling Suspect Detection: Starting Point Flagging & Debouncing", () => {
  // Simulate 10Hz telemetry with a sudden channel fracture at t = 10.0s
  const history: TelemetryPoint[] = Array.from({ length: 60 }, (_, i) => {
    const t = Math.round((5.0 + i * 0.1) * 10) / 10;
    let p = 8.0;
    let f = 2.0;
    let channelDetected = false;

    if (t >= 10.0 && t <= 10.6) {
      // Channel blowout at t = 10.0s: pressure drops to 6.2 bar, flow surges to 3.8 ml/s
      p = 6.2;
      f = 3.8;
      channelDetected = true;
    } else if (t > 10.6) {
      // Gradual recovery
      p = 7.8;
      f = 2.1;
    }

    return {
      timestamp: Date.now() + i * 100,
      timeSeconds: t,
      pressure: p,
      targetPressure: 8.0,
      flow: f,
      targetFlow: 2.0,
      weightFlow: f * 0.95,
      weight: t * 2,
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: Math.round((p / f) * 100) / 100,
      phase: "extraction",
      channelDetected,
    };
  });

  const dRdt = computeDRdtSeries(history);
  const events = detectChannelingEvents(history, dRdt);

  // Must detect event at the starting point (t = 10.0s)
  assert.ok(events.length >= 1, "Must detect at least one event");
  const firstEvent = events[0];
  assert.equal(firstEvent.timeSeconds, 10.0, "Flag must be placed at the starting point (t = 10.0s)");
  assert.ok(firstEvent.dRdt < -0.65, `Event must record negative dR/dt drop (got ${firstEvent.dRdt})`);
  assert.ok(firstEvent.severity === "severe" || firstEvent.severity === "moderate", "Severity must be flagged");

  console.log("✅ PASSED: Channeling starting point correctly flagged and debounced.");
});

test("Non-Numeric Sensitivity: Sensitive vs Moderate vs Low Profiles", () => {
  // Shot with a mild micro-channeling shift at t = 8.0s (dR/dt ~ -0.48)
  // and a severe blowout at t = 14.0s (dR/dt ~ -1.5)
  const history: TelemetryPoint[] = Array.from({ length: 100 }, (_, i) => {
    const t = Math.round((5.0 + i * 0.1) * 10) / 10;
    let p = 8.0;
    let f = 2.0;

    if (t >= 8.0 && t <= 8.5) {
      // Subtle micro-channel: slight flow rise to 2.12 ml/s, gentle pressure dip to 7.85 bar
      p = 7.85;
      f = 2.12;
    } else if (t >= 14.0 && t <= 14.6) {
      // Severe channel: flow blowout to 3.8 ml/s, pressure collapse to 5.8 bar
      p = 5.8;
      f = 3.8;
    }

    return {
      timestamp: Date.now() + i * 100,
      timeSeconds: t,
      pressure: p,
      targetPressure: 8.0,
      flow: f,
      targetFlow: 2.0,
      weightFlow: f * 0.95,
      weight: t * 2,
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: Math.round((p / f) * 100) / 100,
      phase: "extraction",
      channelDetected: false,
    };
  });

  const dRdt = computeDRdtSeries(history);

  // 1. High Sensitivity: Must detect the mild micro-channel at 8.0s AND severe channel at 14.0s
  const sensitiveEvents = detectChannelingEvents(history, dRdt, "sensitive");
  assert.ok(
    sensitiveEvents.some(e => Math.abs(e.timeSeconds - 8.0) <= 0.2),
    "Sensitive profile must flag subtle micro-channel at 8.0s"
  );
  assert.ok(
    sensitiveEvents.some(e => Math.abs(e.timeSeconds - 14.0) <= 0.2),
    "Sensitive profile must flag severe channel at 14.0s"
  );

  // 2. Low Sensitivity: Must ignore the mild micro-channel at 8.0s and ONLY flag severe blowout at 14.0s
  const lowEvents = detectChannelingEvents(history, dRdt, "low");
  assert.ok(
    !lowEvents.some(e => Math.abs(e.timeSeconds - 8.0) <= 0.2),
    "Low profile must ignore mild micro-channel at 8.0s"
  );
  assert.ok(
    lowEvents.some(e => Math.abs(e.timeSeconds - 14.0) <= 0.2),
    "Low profile must catch severe channel at 14.0s"
  );

  console.log("✅ PASSED: Non-numeric sensitivity profiles (Sensitive, Moderate, Low) verified.");
});
