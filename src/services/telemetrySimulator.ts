/**
 * PantaRhei Telemetry Simulator & Mock Decaid Gateway
 * Emulates the Decent DE1 machine and Bluetooth scale at 10Hz (~100ms intervals),
 * providing authentic live telemetry curves, phase transitions, and scale auto-tare
 * when developing or running without a physical machine connected.
 */

import type { ProfileItem } from "../types/profile.ts";

export interface TelemetryPoint {
  timestamp: number;
  timeSeconds: number;
  pressure: number;               // bar
  targetPressure: number;         // bar
  flow: number;                   // ml/s (water flow)
  targetFlow: number;             // ml/s
  weightFlow: number;             // g/s (gravimetric weight flow)
  weight: number;                 // g (scale detected weight)
  groupTemperature: number;       // °C
  targetGroupTemp: number;        // °C
  steamTemperature: number;       // °C
  puckResistance: number;         // bar / (ml/s)
  phase: "idle" | "preinfusion" | "soak" | "extraction" | "done";
  stepName?: string;              // e.g. "Pre-infusion", "Soak", "Extraction", "Decline"
  channelDetected: boolean;
}

export interface MachineSnapshot {
  state: "idle" | "espresso" | "steam" | "water" | "rinse" | "heating" | "sleeping";
  groupTemperature: number;
  targetGroupTemp: number;
  steamTemperature: number;
  targetSteamTemp: number;
  waterLevelMl: number;
  pressure: number;
  flow: number;
  profileFrame: number;
}

export interface ScaleSnapshot {
  weight: number;
  weightFlow: number;
  battery: number;
  isTared: boolean;
}

export type TelemetryListener = (point: TelemetryPoint, machine: MachineSnapshot, scale: ScaleSnapshot) => void;

class TelemetrySimulatorEngine {
  private timer: any = null;
  private listeners: Set<TelemetryListener> = new Set();
  
  // Machine State
  public machine: MachineSnapshot = {
    state: "idle",
    groupTemperature: 93.0,
    targetGroupTemp: 93.0,
    steamTemperature: 150.0,
    targetSteamTemp: 150.0,
    waterLevelMl: 1450,
    pressure: 0,
    flow: 0,
    profileFrame: 0,
  };

  // Scale State
  public scale: ScaleSnapshot = {
    weight: 0,
    weightFlow: 0,
    battery: 92,
    isTared: true,
  };

  // Extraction Execution Variables
  private shotStartTime = 0;
  private targetYield = 36.0;
  private currentWeight = 0;
  private currentPressure = 0;
  private currentFlow = 0;
  private currentWeightFlow = 0;
  private telemetryHistory: TelemetryPoint[] = [];
  private activeProfile: ProfileItem | null = null;

  constructor() {
    this.startHeartbeat();
  }

  public setProfile(profile: ProfileItem | null): void {
    this.activeProfile = profile;
  }

  public getActiveProfile(): ProfileItem | null {
    return this.activeProfile;
  }

  public subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private startHeartbeat(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 100); // 10Hz ingestion
    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  public destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    const now = Date.now();
    let point: TelemetryPoint;

    if (this.machine.state === "espresso") {
      const elapsed = (now - this.shotStartTime) / 1000;
      point = this.simulateEspressoStep(elapsed);
    } else if (this.machine.state === "steam") {
      point = this.simulateSteamStep();
    } else if (this.machine.state === "water") {
      point = this.simulateWaterStep();
    } else if (this.machine.state === "rinse") {
      point = this.simulateRinseStep(now);
    } else {
      // Idle jitter
      this.machine.groupTemperature = 93.0 + (Math.sin(now / 5000) * 0.15);
      this.machine.pressure = 0;
      this.machine.flow = 0;
      this.scale.weightFlow = 0;
      
      point = {
        timestamp: now,
        timeSeconds: 0,
        pressure: 0,
        targetPressure: 0,
        flow: 0,
        targetFlow: 0,
        weightFlow: 0,
        weight: this.currentWeight,
        groupTemperature: this.machine.groupTemperature,
        targetGroupTemp: this.machine.targetGroupTemp,
        steamTemperature: this.machine.steamTemperature,
        puckResistance: 0,
        phase: "idle",
        channelDetected: false,
      };
    }

    // Notify all active subscribers
    for (const listener of this.listeners) {
      listener(point, { ...this.machine }, { ...this.scale });
    }
  }

  private simulateEspressoStep(t: number): TelemetryPoint {
    let phase: TelemetryPoint["phase"] = "preinfusion";
    let targetP = 0;
    let targetF = 0;
    let stepName = "Extraction";

    // Dynamic profile step simulation if an activeProfile with steps is configured
    if (this.activeProfile && this.activeProfile.steps && this.activeProfile.steps.length > 0) {
      let accumTime = 0;
      let activeStep = this.activeProfile.steps[0];
      for (let i = 0; i < this.activeProfile.steps.length; i++) {
        const step = this.activeProfile.steps[i];
        const stepDuration = Math.max(1, Number(step.seconds) || 8);
        accumTime += stepDuration;
        if (t <= accumTime || i === this.activeProfile.steps.length - 1) {
          activeStep = step;
          stepName = step.name || `Step ${i + 1}`;
          break;
        }
      }

      const pVal = Number(activeStep.pressure) || 0;
      const fVal = Number(activeStep.flow) || 0;

      if (activeStep.pump === "flow") {
        targetF = fVal > 0 ? fVal : 2.5;
        targetP = pVal > 0 ? pVal : 9.0; // Flow pump with pressure limit
        this.currentFlow = targetF + (Math.random() * 0.1 - 0.05);
        const puckR = Math.max(1.8, 3.8 - t * 0.07);
        this.currentPressure = Math.min(targetP, Math.max(0.5, this.currentFlow * puckR + (Math.random() * 0.1 - 0.05)));
      } else {
        targetP = pVal > 0 ? pVal : 8.5;
        targetF = fVal > 0 ? fVal : 3.0; // Pressure pump with flow limit
        this.currentPressure = targetP + (Math.random() * 0.1 - 0.05);
        const puckR = Math.max(1.8, 3.8 - t * 0.07);
        this.currentFlow = Math.min(targetF, Math.max(0.3, this.currentPressure / puckR + (Math.random() * 0.1 - 0.05)));
      }

      this.currentWeightFlow = this.currentFlow * 0.95;

      const lowerName = stepName.toLowerCase();
      if (lowerName.includes("fill") || lowerName.includes("pre") || lowerName.includes("protect")) {
        phase = "preinfusion";
      } else if (lowerName.includes("soak") || lowerName.includes("bloom") || lowerName.includes("pause")) {
        phase = "soak";
      } else {
        phase = "extraction";
      }
    } else {
      // Default fallback (e.g. Strega lever profile)
      if (t < 5.0) {
        phase = "preinfusion";
        stepName = "Pre-infusion";
        targetP = 2.8;
        targetF = 4.0;
        this.currentPressure = Math.min(2.8, t * 0.7);
        this.currentFlow = Math.min(4.0, t * 1.0);
        this.currentWeightFlow = 0;
      } else if (t < 8.0) {
        phase = "soak";
        stepName = "Soak";
        targetP = 8.8;
        targetF = 2.2;
        const progress = (t - 5.0) / 3.0;
        this.currentPressure = 2.8 + progress * 6.0;
        this.currentFlow = 4.0 - progress * 2.0;
        this.currentWeightFlow = Math.max(0, progress * 0.8);
      } else {
        phase = "extraction";
        stepName = t < 18.0 ? "Extraction" : "Decline";
        const extractTime = t - 8.0;
        targetP = Math.max(5.5, 8.8 - extractTime * 0.18);
        targetF = 1.8 + Math.sin(extractTime / 4) * 0.15;
        this.currentPressure = targetP + (Math.random() * 0.1 - 0.05);
        this.currentFlow = targetF + (Math.random() * 0.1 - 0.05);
        this.currentWeightFlow = this.currentFlow * 0.95;
      }
    }

    // Micro-channeling fissure event during main extraction at t ~ 14s
    let channelDetected = false;
    if (t >= 13.6 && t <= 14.6) {
      this.currentPressure = Math.max(5.0, this.currentPressure - 1.4);
      this.currentFlow += 1.2;
      this.currentWeightFlow = this.currentFlow * 0.95;
      channelDetected = true;
    }

    // Weight integration
    this.currentWeight += (this.currentWeightFlow * 0.1);
    this.scale.weight = Math.round(this.currentWeight * 10) / 10;
    this.scale.weightFlow = Math.round(this.currentWeightFlow * 10) / 10;
    this.machine.pressure = Math.round(this.currentPressure * 10) / 10;
    this.machine.flow = Math.round(this.currentFlow * 10) / 10;

    // Live Puck Resistance: R = P / F
    const resistance = this.currentFlow > 0.1 ? this.currentPressure / this.currentFlow : 0;

    // Decrement water tank level slightly
    this.machine.waterLevelMl = Math.max(0, this.machine.waterLevelMl - 0.2);

    const point: TelemetryPoint = {
      timestamp: Date.now(),
      timeSeconds: Math.round(t * 10) / 10,
      pressure: this.machine.pressure,
      targetPressure: targetP,
      flow: this.machine.flow,
      targetFlow: targetF,
      weightFlow: this.scale.weightFlow,
      weight: this.scale.weight,
      groupTemperature: 93.0 - (t * 0.02),
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: Math.round(resistance * 100) / 100,
      phase,
      stepName,
      channelDetected,
    };

    this.telemetryHistory.push(point);

    // Auto-Stop Check: target yield reached
    if (this.currentWeight >= this.targetYield) {
      this.stop();
      point.phase = "done";
    }

    return point;
  }

  private simulateSteamStep(): TelemetryPoint {
    this.machine.pressure = 1.6;
    this.machine.flow = 1.2;
    this.machine.waterLevelMl -= 0.12;

    return {
      timestamp: Date.now(),
      timeSeconds: 0,
      pressure: 1.6,
      targetPressure: 1.6,
      flow: 1.2,
      targetFlow: 1.2,
      weightFlow: 0,
      weight: this.scale.weight,
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 152.0,
      puckResistance: 0,
      phase: "idle",
      channelDetected: false,
    };
  }

  private simulateWaterStep(): TelemetryPoint {
    this.machine.pressure = 1.0;
    this.machine.flow = 4.2;
    this.currentWeight += 0.42;
    this.scale.weight = Math.round(this.currentWeight * 10) / 10;
    this.machine.waterLevelMl -= 0.42;

    return {
      timestamp: Date.now(),
      timeSeconds: 0,
      pressure: 1.0,
      targetPressure: 1.0,
      flow: 4.2,
      targetFlow: 4.2,
      weightFlow: 4.2,
      weight: this.scale.weight,
      groupTemperature: 85.0,
      targetGroupTemp: 85.0,
      steamTemperature: 150.0,
      puckResistance: 0,
      phase: "idle",
      channelDetected: false,
    };
  }

  private simulateRinseStep(now: number): TelemetryPoint {
    const elapsed = (now - this.shotStartTime) / 1000;
    if (elapsed >= 3.0) {
      this.stop();
    }
    this.machine.pressure = 2.0;
    this.machine.flow = 6.0;
    this.machine.waterLevelMl -= 0.6;

    return {
      timestamp: now,
      timeSeconds: Math.round(elapsed * 10) / 10,
      pressure: 2.0,
      targetPressure: 2.0,
      flow: 6.0,
      targetFlow: 6.0,
      weightFlow: 0,
      weight: 0,
      groupTemperature: 93.0,
      targetGroupTemp: 93.0,
      steamTemperature: 150.0,
      puckResistance: 0,
      phase: "idle",
      channelDetected: false,
    };
  }

  // Command API Triggers
  public startEspresso(targetYield = 36.0, profile?: ProfileItem): void {
    if (profile) {
      this.activeProfile = profile;
    }
    this.shotStartTime = Date.now();
    this.targetYield = targetYield;
    this.currentWeight = 0;
    this.scale.weight = 0;
    this.scale.isTared = true;
    this.telemetryHistory = [];
    this.machine.state = "espresso";
  }

  public startSteam(): void {
    this.machine.state = "steam";
  }

  public startWater(): void {
    this.currentWeight = 0;
    this.machine.state = "water";
  }

  public startRinse(): void {
    this.shotStartTime = Date.now();
    this.machine.state = "rinse";
  }

  public stop(): void {
    this.machine.state = "idle";
    this.machine.pressure = 0;
    this.machine.flow = 0;
    this.scale.weightFlow = 0;
  }

  public tareScale(): void {
    this.currentWeight = 0;
    this.scale.weight = 0;
    this.scale.isTared = true;
  }

  public getTelemetryHistory(): TelemetryPoint[] {
    return [...this.telemetryHistory];
  }

  public getShotDuration(): number {
    if (this.shotStartTime === 0) return 0;
    return Math.max(0, (Date.now() - this.shotStartTime) / 1000);
  }
}

export const simulator = new TelemetrySimulatorEngine();
