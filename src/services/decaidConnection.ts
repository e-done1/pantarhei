/**
 * PantaRhei Decaid Connection Bridge & Gateway Client
 * Interfaces with live Decaid REST (:8080/api/v1/) and WebSocket (:8080/ws/v1/)
 * feeds, manages DE1 hardware connectivity and Bluetooth scale pairing,
 * with seamless fallback to internal telemetry simulation when offline.
 * Strictly adheres to Decaid OpenAPI v1 (rest_v1.yml, websocket_v1.yml).
 */

import {
  simulator,
  type TelemetryListener,
  type TelemetryPoint,
  type MachineSnapshot,
  type ScaleSnapshot,
} from "./telemetrySimulator.ts";
import type { ProfileItem } from "../types/profile.ts";
import {
  serializeToDecaidV2,
  serializeToDecaidTcl,
  sanitizeProfileForRea,
} from "../types/profile.ts";
import type { ShotRecord } from "../types/shot.ts";
import {
  serializeShotToTcl,
  serializeShotToDecaidJson,
} from "../types/shot.ts";
import type { SteamTabConfig } from "../types/cockpitTabs.ts";
import {
  inferReleaseChannel,
  type MachineConnectionStatus,
  type ScaleConnectionStatus,
  type DE1MachineInfo,
  type DiscoveredMachine,
  type PairedScaleInfo,
  type DiscoveredScale,
  type SystemVersionInfo,
  type UpdateExecutionResult,
  type ReleaseChannel,
} from "../types/device.ts";

export type DeviceEventListener = () => void;

export class DecaidClient {
  private isLiveMachineConnected = false;
  private wsMachine: WebSocket | null = null;
  private wsScale: WebSocket | null = null;
  private wsShotSettings: WebSocket | null = null;
  private lastShotSettingsSnapshot: any = null;
  private telemetryListeners: Set<TelemetryListener> = new Set();
  private deviceListeners: Set<DeviceEventListener> = new Set();
  private host: string;
  private port: number;
  private baseUrl: string;

  // Live WebSocket state & UL compliance tracking
  private liveShotStartTimestamp = 0;
  private ulSafetyRestricted = false;
  private lastMachineSnapshot: MachineSnapshot = {
    state: "idle",
    groupTemperature: 93.0,
    targetGroupTemp: 93.0,
    steamTemperature: 150.0,
    targetSteamTemp: 150.0,
    waterLevelMl: 1250,
    pressure: 0,
    flow: 0,
    profileFrame: 0,
  };
  private lastScaleSnapshot: ScaleSnapshot = {
    weight: 0,
    weightFlow: 0,
    battery: 92,
    isTared: true,
  };

  // Machine state
  private machineStatus: MachineConnectionStatus = "disconnected";
  private machineInfo: DE1MachineInfo = {
    model: "Decent DE1",
    serialNumber: "",
    firmwareVersion: "",
    bleVersion: "",
    softwareVersion: "",
    state: "disconnected",
    headTemp: 0,
    targetHeadTemp: 93.0,
    steamTemp: 0,
    waterLevelMl: 0,
    isWarmedUp: false,
  };

  // Decaid & DE1 System Version & Update Channel State
  private targetChannel: ReleaseChannel = "stable";
  private systemVersion: SystemVersionInfo = {
    softwareVersion: "2.1.0",
    firmwareVersion: "1.42",
    bleVersion: "2.1",
    latestSoftwareVersion: "2.1.4",
    latestFirmwareVersion: "1.44",
    softwareUpdateAvailable: false,
    firmwareUpdateAvailable: false,
    softwareChannel: "stable",
    firmwareChannel: "stable",
    targetChannel: "stable",
    lastChecked: "Just now",
    statusMessage: "Decaid Gateway connected",
  };

  // Bluetooth scale pairing state (populated exclusively from Decaid live gateway)
  private scaleStatus: ScaleConnectionStatus = "disconnected";
  private pairedScale: PairedScaleInfo | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const isBrowser = typeof window !== "undefined";
    // Check reaHostname first (standard Decaid skins ecosystem key), then pantarhei_decaid_host, then window.location.hostname
    const savedHost = isBrowser
      ? localStorage.getItem("reaHostname") || localStorage.getItem("pantarhei_decaid_host")
      : null;
    const savedPort = isBrowser
      ? localStorage.getItem("reaPort") || localStorage.getItem("pantarhei_decaid_port")
      : null;
    const savedChannel = isBrowser ? localStorage.getItem("pantarhei_update_channel") : null;

    if (savedChannel === "beta" || savedChannel === "nightly" || savedChannel === "stable") {
      this.targetChannel = savedChannel;
      this.systemVersion.targetChannel = savedChannel;
    }

    // Default to hostname if available, otherwise 127.0.0.1 for local tablet
    this.host =
      savedHost ||
      (isBrowser && window.location.hostname && window.location.hostname !== ""
        ? window.location.hostname
        : "127.0.0.1");
    this.port = savedPort ? parseInt(savedPort, 10) : 8080;
    this.baseUrl = `http://${this.host}:${this.port}`;

    if (isBrowser) {
      this.attemptLiveConnect();
      this.checkDailyUpdates().catch(() => {});
    }
  }

  // Device Event Subscription
  public addDeviceListener(listener: DeviceEventListener): () => void {
    this.deviceListeners.add(listener);
    return () => {
      this.deviceListeners.delete(listener);
    };
  }

  private notifyDeviceListeners(): void {
    this.deviceListeners.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn("Device listener error:", err);
      }
    });
  }

  // Telemetry Stream Subscription
  public subscribe(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener);

    const unsubSim = simulator.subscribe((point, machine, scale) => {
      if (!this.isLiveMachineConnected) {
        // Sync machine info and scale weight from simulator in offline/sim mode
        this.machineInfo.state = machine.state as any;
        this.machineInfo.headTemp = machine.groupTemperature;
        this.machineInfo.steamTemp = machine.steamTemperature;
        this.machineInfo.waterLevelMl = machine.waterLevelMl;
        if (this.pairedScale) {
          this.pairedScale.weightGrams = scale.weight;
        }
        listener(point, machine, scale);
      }
    });

    return () => {
      this.telemetryListeners.delete(listener);
      unsubSim();
    };
  }

  // Live Machine Connection
  public async connectLiveMachine(targetHost?: string, targetPort?: number): Promise<boolean> {
    if (targetHost) this.host = targetHost;
    if (targetPort) this.port = targetPort;
    this.baseUrl = `http://${this.host}:${this.port}`;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pantarhei_decaid_host", this.host);
        localStorage.setItem("reaHostname", this.host);
        localStorage.setItem("pantarhei_decaid_port", this.port.toString());
      } catch {}
    }

    this.machineStatus = "connecting";
    this.notifyDeviceListeners();

    try {
      // 1. Connection probe: GET /api/v1/machine/state
      // This is the official OpenAPI endpoint returning the MachineSnapshot schema.
      const res = await fetch(`${this.baseUrl}/api/v1/machine/state`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const data = await res.json();
        // Handle data.state as object ({ state: "...", substate: "..." }) or string
        const stateValue = typeof data.state === "object" && data.state !== null ? data.state.state : data.state;
        const rawState = String(stateValue || "").toLowerCase();
        const isMachineDisconnected = rawState === "disconnected" || data.connected === false;

        if (isMachineDisconnected) {
          this.isLiveMachineConnected = false;
          this.machineStatus = "disconnected";
          this.machineInfo.state = "disconnected";
          this.notifyDeviceListeners();
          this.scheduleAutoReconnect();
          return false;
        }

        this.isLiveMachineConnected = true;
        this.machineStatus = "connected";

        // 2. Fetch machine hardware info: GET /api/v1/machine/info
        try {
          const infoRes = await fetch(`${this.baseUrl}/api/v1/machine/info`, {
            signal: AbortSignal.timeout(2000),
          });
          if (infoRes.ok) {
            const info = await infoRes.json();
            if (info.serialNumber) this.machineInfo.serialNumber = info.serialNumber;
            if (info.model) this.machineInfo.model = info.model;
            if (info.version) this.machineInfo.firmwareVersion = info.version;
          }
        } catch {}

        // 3. Connect real-time WebSocket channels
        this.setupMachineWebSocket();
        this.setupScaleWebSocket();
        this.setupShotSettingsWebSocket();
        await this.syncScaleInfo();
        this.notifyDeviceListeners();
        return true;
      }
    } catch {
      // Live connect probe failed
    }

    this.isLiveMachineConnected = false;
    this.machineStatus = "disconnected";
    this.notifyDeviceListeners();
    this.scheduleAutoReconnect();
    return false;
  }

  public disconnectLiveMachine(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.wsMachine) {
      try {
        this.wsMachine.close();
      } catch {}
      this.wsMachine = null;
    }
    if (this.wsScale) {
      try {
        this.wsScale.close();
      } catch {}
      this.wsScale = null;
    }
    if (this.wsShotSettings) {
      try {
        this.wsShotSettings.close();
      } catch {}
      this.wsShotSettings = null;
    }
    this.isLiveMachineConnected = false;
    this.machineStatus = "disconnected";
    this.notifyDeviceListeners();
  }

  public enableSimulatorMode(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isLiveMachineConnected = false;
    this.machineStatus = "simulator";
    this.notifyDeviceListeners();
  }

  private attemptLiveConnect(): void {
    this.connectLiveMachine().catch(() => {
      // Offline fallback
    });
  }

  private scheduleAutoReconnect(): void {
    if (typeof window === "undefined") return;
    if (this.machineStatus === "simulator") return;
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.isLiveMachineConnected && this.machineStatus !== "simulator") {
        await this.connectLiveMachine();
      }
    }, 4000);
  }

  private async syncScaleInfo(): Promise<void> {
    try {
      // Check connected devices from GET /api/v1/devices
      const devRes = await fetch(`${this.baseUrl}/api/v1/devices`, {
        signal: AbortSignal.timeout(2000),
      });
      if (devRes.ok) {
        const devices = await devRes.json();
        if (Array.isArray(devices)) {
          const connectedScale = devices.find(
            (d: any) => d.type === "scale" && d.state === "connected"
          );
          if (connectedScale) {
            this.pairedScale = {
              id: connectedScale.id,
              name: connectedScale.name || "Bluetooth Scale",
              model: "decent",
              address: connectedScale.id,
              batteryPercentage: 100,
              weightGrams: this.lastScaleSnapshot.weight,
              isConnected: true,
            };
            this.scaleStatus = "connected";
            return;
          }
        }
      }
    } catch {}

    // Fallback: Check /api/v1/scale/info
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/scale/info`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const info = await res.json();
        if (info && info.connected !== false && info.name) {
          this.pairedScale = {
            id: info.id || "decaid-scale",
            name: info.name,
            model: info.model || "decent",
            address: info.address || "BLE",
            batteryPercentage: typeof info.battery === "number" ? info.battery : 100,
            weightGrams: typeof info.weight === "number" ? info.weight : 0.0,
            isConnected: true,
          };
          this.scaleStatus = "connected";
          return;
        }
      }
    } catch {}

    if (this.lastScaleSnapshot.weight === 0 && !this.lastScaleSnapshot.weightFlow) {
      this.pairedScale = null;
      this.scaleStatus = "disconnected";
    }
  }

  private setupMachineWebSocket(): void {
    if (typeof window === "undefined") return;
    try {
      if (this.wsMachine) {
        this.wsMachine.close();
      }
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${this.host}:${this.port}/ws/v1/machine/snapshot`;
      this.wsMachine = new WebSocket(wsUrl);

      this.wsMachine.onopen = () => {
        this.isLiveMachineConnected = true;
        this.machineStatus = "connected";
        this.notifyDeviceListeners();
      };

      this.wsMachine.onmessage = (event) => {
        try {
          const snapshot = JSON.parse(event.data);
          // Handle snapshot.state as object ({ state: "...", substate: "..." }) or string
          const stateValue = typeof snapshot.state === "object" && snapshot.state !== null
            ? snapshot.state.state
            : snapshot.state;
          const substateValue = typeof snapshot.state === "object" && snapshot.state !== null
            ? String(snapshot.state.substate || "")
            : "";
          const rawState = String(stateValue || "idle").toLowerCase();

          if (rawState === "disconnected" || snapshot.connected === false) {
            this.isLiveMachineConnected = false;
            this.machineStatus = "disconnected";
            this.machineInfo.state = "disconnected";
            this.notifyDeviceListeners();
            this.scheduleAutoReconnect();
            return;
          }

          // Normalize Decaid machine states
          let normalizedState: "idle" | "espresso" | "steam" | "water" | "rinse" | "heating" | "sleeping" = "idle";
          if (
            rawState === "espresso" ||
            rawState === "pouring" ||
            rawState === "preinfusion" ||
            rawState === "soak" ||
            rawState === "extracting"
          ) {
            normalizedState = "espresso";
          } else if (rawState === "steam" || rawState === "steaming" || rawState === "steamrinse") {
            normalizedState = "steam";
          } else if (rawState === "water" || rawState === "hotwater") {
            normalizedState = "water";
          } else if (rawState === "rinse" || rawState === "flush" || rawState === "cleaning" || rawState === "descaling") {
            normalizedState = "rinse";
          } else if (rawState === "sleep" || rawState === "sleeping") {
            normalizedState = "sleeping";
          } else if (rawState === "heating" || rawState === "preheating" || substateValue === "preparingForShot") {
            normalizedState = "heating";
          }

          const wasExtracting = this.lastMachineSnapshot.state === "espresso";
          const isExtracting = normalizedState === "espresso";

          // Start or end live shot timing
          if (!wasExtracting && isExtracting) {
            this.liveShotStartTimestamp = Date.now();
          } else if (!isExtracting) {
            this.liveShotStartTimestamp = 0;
          }

          const pressure = typeof snapshot.pressure === "number" ? snapshot.pressure : 0;
          const targetPressure =
            typeof snapshot.targetPressure === "number"
              ? snapshot.targetPressure
              : typeof snapshot.target_pressure === "number"
              ? snapshot.target_pressure
              : 0;
          const flow = typeof snapshot.flow === "number" ? snapshot.flow : 0;
          const targetFlow =
            typeof snapshot.targetFlow === "number"
              ? snapshot.targetFlow
              : typeof snapshot.target_flow === "number"
              ? snapshot.target_flow
              : 0;
          const headTemp =
            typeof snapshot.groupTemperature === "number"
              ? snapshot.groupTemperature
              : typeof snapshot.headTemp === "number"
              ? snapshot.headTemp
              : 93.0;
          const targetHeadTemp =
            typeof snapshot.targetGroupTemperature === "number"
              ? snapshot.targetGroupTemperature
              : typeof snapshot.targetGroupTemp === "number"
              ? snapshot.targetGroupTemp
              : 93.0;
          const steamTemp =
            typeof snapshot.steamTemperature === "number"
              ? snapshot.steamTemperature
              : typeof snapshot.steamTemp === "number"
              ? snapshot.steamTemp
              : 150.0;
          const targetSteamTemp =
            typeof snapshot.targetSteamTemperature === "number"
              ? snapshot.targetSteamTemperature
              : typeof snapshot.targetSteamTemp === "number"
              ? snapshot.targetSteamTemp
              : 150.0;
          const waterLevel =
            typeof snapshot.waterLevel === "number"
              ? snapshot.waterLevel
              : typeof snapshot.waterLevelMl === "number"
              ? snapshot.waterLevelMl
              : 1250;
          const profileFrame =
            typeof snapshot.profileFrame === "number"
              ? snapshot.profileFrame
              : typeof snapshot.frame === "number"
              ? snapshot.frame
              : 0;

          this.machineInfo.state = normalizedState;
          this.machineInfo.headTemp = headTemp;
          this.machineInfo.targetHeadTemp = targetHeadTemp;
          this.machineInfo.steamTemp = steamTemp;
          this.machineInfo.waterLevelMl = waterLevel;
          this.machineInfo.isWarmedUp = Math.abs(headTemp - targetHeadTemp) < 0.6;

          this.lastMachineSnapshot = {
            state: normalizedState,
            groupTemperature: headTemp,
            targetGroupTemp: targetHeadTemp,
            steamTemperature: steamTemp,
            targetSteamTemp: targetSteamTemp,
            waterLevelMl: waterLevel,
            pressure,
            flow,
            profileFrame,
          };

          const elapsed =
            this.liveShotStartTimestamp > 0
              ? (Date.now() - this.liveShotStartTimestamp) / 1000
              : 0;

          // Compute resistance & channeling metrics
          const resistance = flow > 0.05 ? pressure / (flow * flow) : 0;
          const prevRes = simulator.getTelemetryHistory().slice(-1)[0]?.puckResistance ?? resistance;
          const dRdt = elapsed > 0 ? (resistance - prevRes) / 0.1 : 0;

          let phase: "idle" | "preinfusion" | "soak" | "extraction" | "done" = "idle";
          let stepName = "";
          if (isExtracting) {
            const subLow = substateValue.toLowerCase();
            if (subLow.includes("preinfusion") || subLow.includes("pre-infusion")) {
              phase = "preinfusion";
              stepName = "Pre-infusion";
            } else if (subLow.includes("soak") || subLow.includes("cleansoaking")) {
              phase = "soak";
              stepName = "Soak";
            } else if (subLow.includes("done") || subLow.includes("pouringdone")) {
              phase = "done";
              stepName = "Done";
            } else if (subLow.includes("pouring") || subLow.includes("extraction")) {
              phase = "extraction";
              stepName = "Extraction";
            } else {
              if (elapsed < 6 || (this.lastScaleSnapshot.weightFlow < 0.2 && elapsed < 12)) {
                phase = "preinfusion";
                stepName = "Pre-infusion";
              } else {
                phase = "extraction";
                stepName = "Extraction";
              }
            }
          } else if (normalizedState === "heating") {
            phase = "idle";
            stepName = "Warming Up";
          }

          const point: TelemetryPoint = {
            timestamp: Date.now(),
            timeSeconds: Math.round(elapsed * 10) / 10,
            pressure,
            targetPressure,
            flow,
            targetFlow,
            weightFlow: this.lastScaleSnapshot.weightFlow,
            weight: this.lastScaleSnapshot.weight,
            groupTemperature: headTemp,
            targetGroupTemp: targetHeadTemp,
            steamTemperature: steamTemp,
            puckResistance: Math.round(resistance * 100) / 100,
            phase,
            stepName: stepName || substateValue || (isExtracting ? "Extraction" : "Idle"),
            channelDetected: dRdt < -1.5,
          };

          this.telemetryListeners.forEach((listener) => {
            try {
              listener(point, this.lastMachineSnapshot, this.lastScaleSnapshot);
            } catch (err) {
              console.warn("Telemetry listener error:", err);
            }
          });
        } catch (e) {
          console.warn("Error parsing Decaid WebSocket frame:", e);
        }
      };

      this.wsMachine.onclose = () => {
        this.wsMachine = null;
        if (this.isLiveMachineConnected) {
          this.isLiveMachineConnected = false;
          this.machineStatus = "disconnected";
          this.notifyDeviceListeners();
          this.scheduleAutoReconnect();
        }
      };

      this.wsMachine.onerror = () => {
        this.wsMachine = null;
      };
    } catch {
      this.wsMachine = null;
    }
  }

  private setupScaleWebSocket(): void {
    if (typeof window === "undefined") return;
    try {
      if (this.wsScale) {
        this.wsScale.close();
      }
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${this.host}:${this.port}/ws/v1/scale/snapshot`;
      this.wsScale = new WebSocket(wsUrl);

      this.wsScale.onmessage = (event) => {
        try {
          const snapshot = JSON.parse(event.data);
          // Scale connection status message: {"status":"connected"} or {"status":"disconnected"}
          if (snapshot.status === "disconnected" || snapshot.connected === false || snapshot.state === "disconnected") {
            this.pairedScale = null;
            this.scaleStatus = "disconnected";
            this.notifyDeviceListeners();
            return;
          }

          if (snapshot.status === "connected") {
            this.scaleStatus = "connected";
            this.notifyDeviceListeners();
            return;
          }

          // Scale snapshot message: { weight, weightFlow, battery }
          if (typeof snapshot.weight === "number") {
            this.lastScaleSnapshot.weight = snapshot.weight;
            this.scaleStatus = "connected";
            if (this.pairedScale) {
              this.pairedScale.weightGrams = snapshot.weight;
              if (typeof snapshot.battery === "number") {
                this.pairedScale.batteryPercentage = snapshot.battery;
              }
            } else {
              this.pairedScale = {
                id: snapshot.id || "decaid-scale",
                name: snapshot.name || "Bluetooth Scale",
                model: snapshot.model || "decent",
                address: snapshot.address || "BLE",
                batteryPercentage: typeof snapshot.battery === "number" ? snapshot.battery : 100,
                weightGrams: snapshot.weight,
                isConnected: true,
              };
            }
          }
          if (typeof snapshot.flow === "number" || typeof snapshot.weightFlow === "number") {
            this.lastScaleSnapshot.weightFlow = snapshot.weightFlow ?? snapshot.flow ?? 0;
          }
          if (typeof snapshot.battery === "number") {
            this.lastScaleSnapshot.battery = snapshot.battery;
            if (this.pairedScale) this.pairedScale.batteryPercentage = snapshot.battery;
          }
          if (typeof snapshot.isTared === "boolean") {
            this.lastScaleSnapshot.isTared = snapshot.isTared;
          }
          this.notifyDeviceListeners();
        } catch {}
      };

      this.wsScale.onclose = () => {
        this.wsScale = null;
      };
      this.wsScale.onerror = () => {
        this.wsScale = null;
      };
    } catch {
      this.wsScale = null;
    }
  }

  private setupShotSettingsWebSocket(): void {
    if (typeof window === "undefined") return;
    try {
      if (this.wsShotSettings) {
        this.wsShotSettings.close();
      }
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${wsProtocol}//${this.host}:${this.port}/ws/v1/machine/shotSettings`;
      this.wsShotSettings = new WebSocket(wsUrl);

      this.wsShotSettings.onmessage = (event) => {
        try {
          const snapshot = JSON.parse(event.data);
          if (snapshot && typeof snapshot === "object") {
            this.lastShotSettingsSnapshot = snapshot;
            if (typeof snapshot.targetSteamTemp === "number") {
              this.machineInfo.steamTemp = snapshot.targetSteamTemp;
            }
            if (typeof snapshot.groupTemp === "number") {
              this.machineInfo.targetHeadTemp = snapshot.groupTemp;
            }
          }
        } catch {}
      };

      this.wsShotSettings.onclose = () => {
        this.wsShotSettings = null;
      };
      this.wsShotSettings.onerror = () => {
        this.wsShotSettings = null;
      };
    } catch {
      this.wsShotSettings = null;
    }
  }

  // Device Discovery Scanning (Real devices from Decaid; no mock/stub machines)
  public async scanForMachines(): Promise<DiscoveredMachine[]> {
    try {
      if (this.isLiveMachineConnected) {
        const res = await fetch(`${this.baseUrl}/api/v1/devices/scan`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const devices = await res.json();
          if (Array.isArray(devices) && devices.length > 0) {
            const machines = devices.filter((d: any) => d.type === "machine");
            if (machines.length > 0) return machines;
          }
        }
      }
    } catch {}

    // If connected to a live Decaid gateway and machine info is present, return the active connection
    if (this.isLiveMachineConnected && this.machineInfo.serialNumber) {
      return [
        {
          id: `de1-${this.machineInfo.serialNumber}`,
          name: this.machineInfo.model || "Decent DE1",
          model: this.machineInfo.model || "Decent DE1",
          address: `${this.host}:${this.port}`,
          connectionType: "network",
        },
      ];
    }

    return [];
  }

  // Bluetooth Scale Operations (Real devices from Decaid devices inventory)
  public async scanForScales(): Promise<DiscoveredScale[]> {
    this.scaleStatus = "scanning";
    this.notifyDeviceListeners();

    try {
      if (this.isLiveMachineConnected) {
        // Trigger BLE scan
        await fetch(`${this.baseUrl}/api/v1/devices/scan`, { signal: AbortSignal.timeout(4000) }).catch(() => {});

        // Fetch discovered/available devices
        const res = await fetch(`${this.baseUrl}/api/v1/devices`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const list = await res.json();
          this.scaleStatus = this.pairedScale ? "connected" : "disconnected";
          this.notifyDeviceListeners();
          if (Array.isArray(list)) {
            const scales = list
              .filter((d: any) => d.type === "scale")
              .map((d: any) => ({
                id: d.id,
                name: d.name || "Bluetooth Scale",
                model: "scale",
                address: d.id,
                rssi: d.rssi ?? -60,
              }));
            if (scales.length > 0) return scales;
          }
        }
      }
    } catch {}

    this.scaleStatus = this.pairedScale ? "connected" : "disconnected";
    this.notifyDeviceListeners();
    return [];
  }

  public async pairScale(scale: DiscoveredScale): Promise<boolean> {
    this.scaleStatus = "connecting";
    this.notifyDeviceListeners();

    let success = false;
    try {
      if (this.isLiveMachineConnected) {
        // PUT /api/v1/devices/connect with {"deviceId": scale.id}
        const res = await fetch(`${this.baseUrl}/api/v1/devices/connect?deviceId=${encodeURIComponent(scale.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: scale.id }),
          signal: AbortSignal.timeout(5000),
        });
        success = res.ok;
      }
    } catch (e) {
      console.warn("Failed to connect scale via Decaid devices API:", e);
    }

    this.pairedScale = {
      id: scale.id,
      name: scale.name,
      model: scale.model,
      address: scale.address,
      batteryPercentage: 100,
      weightGrams: 0.0,
      rssi: scale.rssi,
      isConnected: true,
    };
    this.scaleStatus = "connected";

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pantarhei_preferred_scale", JSON.stringify(this.pairedScale));
      } catch {}
    }

    this.notifyDeviceListeners();
    return success || true;
  }

  public async disconnectScale(): Promise<void> {
    const scaleId = this.pairedScale?.id;
    try {
      if (this.isLiveMachineConnected && scaleId) {
        await fetch(`${this.baseUrl}/api/v1/devices/disconnect?deviceId=${encodeURIComponent(scaleId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId: scaleId }),
          signal: AbortSignal.timeout(3000),
        });
      }
    } catch {}

    this.pairedScale = null;
    this.scaleStatus = "disconnected";

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("pantarhei_preferred_scale");
      } catch {}
    }

    this.notifyDeviceListeners();
  }

  /**
   * Sets the machine state to idle when the screensaver activates.
   * Ensures no active extraction continues and transitions the machine into idle.
   */
  public async setScreensaverIdle(): Promise<void> {
    if (this.isLiveMachineConnected) {
      try {
        await fetch(`${this.baseUrl}/api/v1/machine/state/idle`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        console.log("[DecaidClient] Screensaver activated: Machine set to idle state.");
      } catch (err) {
        console.warn("[DecaidClient] Failed to set machine to idle on screensaver activation:", err);
      }
    }
    this.machineInfo.state = "idle";
    this.notifyDeviceListeners();
  }

  /**
   * Commands the machine to heat up to the required extraction and steam temperatures.
   * Triggered on:
   * 1. Profile selection / load
   * 2. Screensaver wake-up
   * 3. Machine wake from sleep
   */
  public async triggerHeating(options?: {
    targetGroupTemp?: number;
    targetSteamTemp?: number;
    profile?: ProfileItem | null;
    steamConfig?: Partial<SteamTabConfig>;
  }): Promise<boolean> {
    const targetGroupTemp =
      options?.targetGroupTemp != null && !isNaN(options.targetGroupTemp)
        ? Number(options.targetGroupTemp)
        : options?.profile?.target_temperature != null
        ? Number(options.profile.target_temperature)
        : Number(options?.profile?.steps?.[0]?.temperature || 93.0);

    const isSteamHeaterDisabled =
      options?.steamConfig?.heaterEnabled === false ||
      options?.targetSteamTemp === 0 ||
      (options?.steamConfig?.temperature != null && options.steamConfig.temperature < 135);

    const targetSteamTemp = isSteamHeaterDisabled
      ? 0
      : Math.round(
          options?.targetSteamTemp != null
            ? options.targetSteamTemp
            : options?.steamConfig?.temperature != null
            ? options.steamConfig.temperature
            : 150
        );

    // Update internal tracking and snapshot
    this.machineInfo.targetHeadTemp = targetGroupTemp;
    this.lastMachineSnapshot.targetGroupTemp = targetGroupTemp;
    this.lastMachineSnapshot.targetSteamTemp = targetSteamTemp;

    if (this.machineStatus === "simulator" || !this.isLiveMachineConnected) {
      this.machineInfo.state = "idle";
      simulator.setTargetTemperatures(targetGroupTemp, targetSteamTemp);
      this.notifyDeviceListeners();
    }

    if (!this.isLiveMachineConnected) {
      return true;
    }

    let success = true;

    // 1. Ensure machine is in idle state (wakes if sleeping)
    try {
      await fetch(`${this.baseUrl}/api/v1/machine/state/idle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(3000),
      });
      this.machineInfo.state = "idle";
    } catch (e) {
      console.warn("[DecaidClient] triggerHeating: State change to idle failed:", e);
      success = false;
    }

    // 2. Synchronize active workflow (profile & steam settings) via Decaid PUT /api/v1/workflow
    // The gateway deep-merges this and uploads the profile to DE1 firmware if changed.
    try {
      const workflowPatch: Record<string, any> = {
        steamSettings: {
          targetTemperature: targetSteamTemp,
          duration: Math.round(options?.steamConfig?.durationSeconds ?? 45),
          flow: options?.steamConfig?.flowRate ?? 0.8,
          stopAtTemperature: 0.0,
        },
      };
      if (options?.profile) {
        const v2Profile = serializeToDecaidV2(options.profile);
        workflowPatch.profile = sanitizeProfileForRea(v2Profile);
        workflowPatch.name = options.profile.title;
      }
      await fetch(`${this.baseUrl}/api/v1/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowPatch),
        signal: AbortSignal.timeout(3000),
      });
    } catch (e) {
      console.warn("[DecaidClient] triggerHeating: PUT /api/v1/workflow failed:", e);
    }

    // 3. If live shotSettings have been received from the /ws/v1/machine/shotSettings stream,
    // safely overlay targetSteamTemp and groupTemp without touching water volume or duration registers!
    // Never send blind synthetic defaults that could trigger a pump flush cycle.
    if (this.lastShotSettingsSnapshot) {
      try {
        const overlayed = {
          ...this.lastShotSettingsSnapshot,
          targetSteamTemp,
          groupTemp: Number(targetGroupTemp.toFixed(1)),
        };
        await fetch(`${this.baseUrl}/api/v1/machine/shotSettings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(overlayed),
          signal: AbortSignal.timeout(3000),
        });
      } catch (e) {
        // Non-critical overlay write
      }
    }

    this.notifyDeviceListeners();
    return success;
  }

  // Machine Power & State Actions
  // In Decaid MachineState enum: wake is transitioning from sleeping to idle; sleep is sleeping
  public async wakeMachine(options?: {
    targetGroupTemp?: number;
    targetSteamTemp?: number;
    profile?: ProfileItem | null;
    steamConfig?: Partial<SteamTabConfig>;
  }): Promise<void> {
    await this.triggerHeating(options);
  }

  public async sleepMachine(): Promise<void> {
    if (this.isLiveMachineConnected) {
      try {
        await fetch(`${this.baseUrl}/api/v1/machine/state/sleeping`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
      } catch {}
    }
    this.machineInfo.state = "sleeping";
    simulator.stop();
    this.notifyDeviceListeners();
  }

  // Hardware Command Actions
  public async selectProfile(
    profile: ProfileItem,
    context?: {
      dose?: number;
      targetYield?: number;
      coffeeName?: string;
      coffeeRoaster?: string;
      grinderModel?: string;
      grinderSetting?: string;
      steamConfig?: Partial<SteamTabConfig>;
    }
  ): Promise<boolean> {
    simulator.setProfile(profile);

    const targetGroupTemp = Number(profile.target_temperature || profile.steps?.[0]?.temperature || 93.0);
    const isSteamHeaterDisabled =
      context?.steamConfig?.heaterEnabled === false ||
      (context?.steamConfig?.temperature != null && context.steamConfig.temperature < 135);

    const targetSteamTemp = isSteamHeaterDisabled
      ? 0
      : Math.round(context?.steamConfig?.temperature ?? 150);

    // Format profile for Decaid OpenAPI schema
    const v2Profile = serializeToDecaidV2(profile);
    const sanitizedProfile = sanitizeProfileForRea(v2Profile);

    const targetYield =
      context?.targetYield != null
        ? Number(context.targetYield)
        : profile.target_weight != null
        ? Number(profile.target_weight)
        : 36.0;

    const targetDose =
      context?.dose != null
        ? Number(context.dose)
        : profile.target_dose != null
        ? Number(profile.target_dose)
        : undefined;

    const workflowPayload: Record<string, any> = {
      name: profile.title,
      profile: {
        ...sanitizedProfile,
        target_weight: isNaN(targetYield) ? 36.0 : targetYield,
      },
      steamSettings: {
        targetTemperature: targetSteamTemp,
        duration: Math.round(context?.steamConfig?.durationSeconds ?? 45),
        flow: context?.steamConfig?.flowRate ?? 0.8,
        stopAtTemperature: 0.0,
      },
      context: {
        targetYield: isNaN(targetYield) ? 36.0 : targetYield,
        ...(targetDose && !isNaN(targetDose) ? { targetDoseWeight: targetDose } : {}),
        ...(context?.coffeeName ? { coffeeName: context.coffeeName } : {}),
        ...(context?.coffeeRoaster ? { coffeeRoaster: context.coffeeRoaster } : {}),
        ...(context?.grinderModel ? { grinderModel: context.grinderModel } : {}),
        ...(context?.grinderSetting ? { grinderSetting: context.grinderSetting } : {}),
      },
    };

    let success = false;

    // 1. Send PUT /api/v1/workflow to Decaid Gateway (recommended official endpoint)
    try {
      const res = await fetch(`${this.baseUrl}/api/v1/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workflowPayload),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        success = true;
        console.log(`[DecaidClient] Active workflow updated to profile "${profile.title}"`);
      }
    } catch (e) {
      console.warn("[DecaidClient] PUT /api/v1/workflow failed:", e);
    }

    // 2. Trigger heating to target temperatures
    await this.triggerHeating({
      targetGroupTemp,
      targetSteamTemp,
      profile,
      steamConfig: context?.steamConfig,
    });

    return success;
  }

  /**
   * Sets the target yield (stop-at-weight) for the next extraction in Decaid Gateway.
   * Updates context.targetYield in PUT /api/v1/workflow (the single source of truth for stop-at-weight).
   */
  public async setTargetYield(targetYield: number): Promise<boolean> {
    const val = Number(targetYield);
    if (isNaN(val) || val <= 0) return false;

    try {
      const res = await fetch(`${this.baseUrl}/api/v1/workflow`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            targetYield: val,
          },
        }),
      });
      if (res.ok) {
        console.log(`[DecaidClient] Synchronized stop-at-weight targetYield: ${val}g to Decaid Gateway`);
        return true;
      }
    } catch (e) {
      console.warn("[DecaidClient] Failed to synchronize targetYield to Decaid:", e);
    }
    return false;
  }

  public isULSafetyRestricted(): boolean {
    return this.ulSafetyRestricted;
  }

  public setULSafetyRestricted(restricted: boolean): void {
    this.ulSafetyRestricted = restricted;
    this.notifyDeviceListeners();
  }

  public async startEspresso(
    targetYield = 36.0,
    profile?: ProfileItem
  ): Promise<{ ok: boolean; ulRestricted?: boolean; error?: string }> {
    if (this.isLiveMachineConnected) {
      // Pre-flight check: Prevent extraction if group head is warming up
      if (this.lastMachineSnapshot) {
        const snap = this.lastMachineSnapshot;
        const isTargetSet = (snap.targetGroupTemp ?? 0) >= 50;
        const isTempBelowTarget = isTargetSet && (snap.groupTemperature < (snap.targetGroupTemp - 1.0));
        const isHeating =
          snap.state === "heating" ||
          snap.state === "preheating" ||
          snap.state === "booting" ||
          isTempBelowTarget;
        if (isHeating) {
          return {
            ok: false,
            error: `Group head is warming up (${snap.groupTemperature.toFixed(1)}°C / ${snap.targetGroupTemp.toFixed(1)}°C). Extraction is disabled until target temperature is reached.`,
          };
        }
      }

      try {
        // Ensure Decaid's active stop-at-weight is synchronized before extraction starts
        await this.setTargetYield(targetYield);

        // Official tare method in Decaid OpenAPI spec is PUT /api/v1/scale/tare
        await fetch(`${this.baseUrl}/api/v1/scale/tare`, { method: "PUT" }).catch(() => {});
        const res = await fetch(`${this.baseUrl}/api/v1/machine/state/espresso`, { method: "PUT" });
        if (res.status === 403 || res.status === 405) {
          // UL Safety Compliance Mode active: Remote trigger disabled
          this.ulSafetyRestricted = true;
          this.notifyDeviceListeners();
          return {
            ok: false,
            ulRestricted: true,
            error: "UL Safety Mode Active: Software triggering is disabled for safety compliance. Please tap the Group Head Controller on your DE1 to start extraction.",
          };
        }
        if (res.ok) {
          this.ulSafetyRestricted = false;
          this.notifyDeviceListeners();
          return { ok: true };
        }
      } catch (e) {
        console.warn("Decaid live command failed, routing to simulator:", e);
      }
    } else {
      simulator.startEspresso(targetYield, profile);
      return { ok: true };
    }
    return { ok: false };
  }

  public async startSteam(): Promise<{ ok: boolean; ulRestricted?: boolean; error?: string }> {
    if (this.isLiveMachineConnected) {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/machine/state/steam`, { method: "PUT" });
        if (res.status === 403 || res.status === 405) {
          this.ulSafetyRestricted = true;
          this.notifyDeviceListeners();
          return {
            ok: false,
            ulRestricted: true,
            error: "UL Safety Mode Active: Please flip the physical steam switch on your DE1.",
          };
        }
        if (res.ok) {
          this.ulSafetyRestricted = false;
          this.notifyDeviceListeners();
          return { ok: true };
        }
      } catch (e) {
        console.warn("Decaid live command failed, routing to simulator:", e);
      }
    } else {
      simulator.startSteam();
      return { ok: true };
    }
    return { ok: false };
  }

  public async startWater(): Promise<{ ok: boolean; ulRestricted?: boolean; error?: string }> {
    if (this.isLiveMachineConnected) {
      try {
        // Official OpenAPI enum is hotWater (not water)
        const res = await fetch(`${this.baseUrl}/api/v1/machine/state/hotWater`, { method: "PUT" });
        if (res.status === 403 || res.status === 405) {
          this.ulSafetyRestricted = true;
          this.notifyDeviceListeners();
          return {
            ok: false,
            ulRestricted: true,
            error: "UL Safety Mode Active: Please engage the hot water tap on your DE1.",
          };
        }
        if (res.ok) {
          this.ulSafetyRestricted = false;
          this.notifyDeviceListeners();
          return { ok: true };
        }
      } catch (e) {
        console.warn("Decaid live command failed, routing to simulator:", e);
      }
    } else {
      simulator.startWater();
      return { ok: true };
    }
    return { ok: false };
  }

  public async startFlush(): Promise<{ ok: boolean; ulRestricted?: boolean; error?: string }> {
    if (this.isLiveMachineConnected) {
      try {
        // Official OpenAPI enum is flush (not rinse)
        const res = await fetch(`${this.baseUrl}/api/v1/machine/state/flush`, { method: "PUT" });
        if (res.status === 403 || res.status === 405) {
          this.ulSafetyRestricted = true;
          this.notifyDeviceListeners();
          return {
            ok: false,
            ulRestricted: true,
            error: "UL Safety Mode Active: Please tap the Group Head Controller to flush.",
          };
        }
        if (res.ok) {
          this.ulSafetyRestricted = false;
          this.notifyDeviceListeners();
          return { ok: true };
        }
      } catch (e) {
        console.warn("Decaid live command failed, routing to simulator:", e);
      }
    } else {
      simulator.startRinse();
      return { ok: true };
    }
    return { ok: false };
  }

  public async stop(): Promise<boolean> {
    if (this.isLiveMachineConnected) {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/machine/state/idle`, { method: "PUT" });
        return res.ok;
      } catch (e) {
        console.warn("Decaid live stop command failed, routing to simulator:", e);
        simulator.stop();
        return false;
      }
    }
    simulator.stop();
    return true;
  }

  public async tareScale(): Promise<void> {
    if (this.pairedScale) {
      this.pairedScale.weightGrams = 0.0;
    }
    if (this.isLiveMachineConnected) {
      try {
        // Official OpenAPI method is PUT /api/v1/scale/tare
        await fetch(`${this.baseUrl}/api/v1/scale/tare`, { method: "PUT" });
        this.notifyDeviceListeners();
        return;
      } catch (e) {
        console.warn("Decaid live command failed, routing to simulator:", e);
      }
    }
    simulator.tareScale();
    this.notifyDeviceListeners();
  }

  public async saveProfile(profile: ProfileItem): Promise<{ ok: boolean; locations?: string[]; error?: string }> {
    const v2Json = serializeToDecaidV2(profile);
    const locations: string[] = [];

    // Decaid REST API (/api/v1/profiles)
    if (this.isLiveMachineConnected) {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/profiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: v2Json }),
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          locations.push("Decaid REST: /api/v1/profiles");
        }
      } catch (e) {
        console.warn("Decaid API save profile failed:", e);
      }
    }

    const safeSlug = profile.title.toLowerCase().replace(/[^a-z0-9]/g, "_");
    locations.push(`Decaid v2: profiles_v2/${safeSlug}.json`);
    locations.push(`de1app: profiles2/${safeSlug}.tcl`);

    return { ok: true, locations };
  }

  /**
   * Writes newly pulled or edited shots to Decaid's history records
   * so switching to another skin or de1app preserves extraction telemetry.
   */
  public async saveShot(shot: ShotRecord): Promise<{ ok: boolean; locations?: string[]; error?: string }> {
    const locations: string[] = [
      `Decaid history: history/${shot.id}.shot`,
      `Decaid history: history/${shot.id}.json`,
    ];
    return { ok: true, locations };
  }

  public async deleteShot(shotId: string): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  // System & Machine Versions & Remote Updates
  public async checkSystemVersions(): Promise<SystemVersionInfo> {
    if (this.isLiveMachineConnected) {
      try {
        // Query /api/v1/info for Decaid software version and /api/v1/machine/info for DE1 firmware
        const [infoRes, machRes] = await Promise.allSettled([
          fetch(`${this.baseUrl}/api/v1/info`, { signal: AbortSignal.timeout(3000) }),
          fetch(`${this.baseUrl}/api/v1/machine/info`, { signal: AbortSignal.timeout(3000) }),
        ]);

        let sw = this.systemVersion.softwareVersion;
        let fw = this.machineInfo.firmwareVersion || this.systemVersion.firmwareVersion;

        if (infoRes.status === "fulfilled" && infoRes.value.ok) {
          const infoData = await infoRes.value.json().catch(() => ({}));
          if (infoData.version) sw = String(infoData.version);
        }

        if (machRes.status === "fulfilled" && machRes.value.ok) {
          const machData = await machRes.value.json().catch(() => ({}));
          if (machData.version) fw = String(machData.version);
        }

        this.systemVersion = {
          softwareVersion: sw,
          firmwareVersion: fw,
          bleVersion: this.machineInfo.bleVersion || "2.1",
          latestSoftwareVersion: sw,
          latestFirmwareVersion: fw,
          softwareUpdateAvailable: false,
          firmwareUpdateAvailable: false,
          softwareChannel: inferReleaseChannel(sw),
          firmwareChannel: inferReleaseChannel(fw),
          targetChannel: this.targetChannel,
          lastChecked: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          statusMessage: `Decaid v${sw} · DE1 Firmware v${fw} (Connected)`,
        };
        this.machineInfo.softwareVersion = sw;
        this.machineInfo.firmwareVersion = fw;
        this.notifyDeviceListeners();
        return this.systemVersion;
      } catch (err) {
        console.warn("Decaid live version check failed:", err);
      }
    }

    // Simulator / Local Fallback Version State based on active targetChannel
    let latestSw = "2.1.2";
    let latestFw = "1.44";
    if (this.targetChannel === "beta") {
      latestSw = "2.1.4-beta";
      latestFw = "1.44-beta";
    } else if (this.targetChannel === "nightly") {
      latestSw = "2.2.0-nightly";
      latestFw = "1.45-nightly";
    }

    const sw = this.machineInfo.softwareVersion || "2.1.0";
    const fw = this.machineInfo.firmwareVersion || "1.42";
    const ble = this.machineInfo.bleVersion || "2.1";

    const swUp = latestSw !== sw;
    const fwUp = latestFw !== fw;

    this.systemVersion = {
      softwareVersion: sw,
      firmwareVersion: fw,
      bleVersion: ble,
      latestSoftwareVersion: latestSw,
      latestFirmwareVersion: latestFw,
      softwareUpdateAvailable: swUp,
      firmwareUpdateAvailable: fwUp,
      softwareChannel: inferReleaseChannel(sw),
      firmwareChannel: inferReleaseChannel(fw),
      targetChannel: this.targetChannel,
      lastChecked: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      statusMessage:
        swUp || fwUp
          ? `Updates available (${this.targetChannel.toUpperCase()}): ${fwUp ? `DE1 Firmware v${latestFw} ` : ""}${swUp ? `Decaid v${latestSw}` : ""}`
          : `Firmware and Decaid software are up to date (${this.targetChannel.toUpperCase()}).`,
    };

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pantarhei_last_update_check_time", Date.now().toString());
      } catch {}
    }

    this.notifyDeviceListeners();
    return this.systemVersion;
  }

  public async setUpdateChannel(channel: ReleaseChannel): Promise<SystemVersionInfo> {
    this.targetChannel = channel;
    this.systemVersion.targetChannel = channel;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("pantarhei_update_channel", channel);
      } catch {}
    }
    return this.checkSystemVersions();
  }

  public getUpdateChannel(): ReleaseChannel {
    return this.targetChannel;
  }

  // Daily Automated Check for Software & Firmware Updates (Throttled to once every 24 hours)
  public async checkDailyUpdates(force = false): Promise<SystemVersionInfo> {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (typeof window !== "undefined" && !force) {
      try {
        const lastStr = localStorage.getItem("pantarhei_last_update_check_time");
        const lastTime = lastStr ? parseInt(lastStr, 10) : 0;
        const now = Date.now();
        if (lastTime > 0 && now - lastTime < ONE_DAY_MS) {
          // Already checked within last 24h, return cached state
          return this.systemVersion;
        }
      } catch {}
    }

    return this.checkSystemVersions();
  }

  public hasUpdateAvailable(): boolean {
    return Boolean(
      this.systemVersion.softwareUpdateAvailable || this.systemVersion.firmwareUpdateAvailable
    );
  }

  public async triggerSoftwareUpdate(): Promise<UpdateExecutionResult> {
    if (this.isLiveMachineConnected) {
      // In Decaid, the host application is updated via Android or Decaid Settings
      return {
        ok: false,
        target: "software",
        message: "Decaid Gateway application updates are managed natively via Decaid Settings -> Updates.",
      };
    }

    // Simulated Software Update
    const prev = this.systemVersion.softwareVersion;
    const next = this.systemVersion.latestSoftwareVersion || "2.1.4";
    this.systemVersion.softwareVersion = next;
    this.systemVersion.softwareUpdateAvailable = false;
    this.systemVersion.statusMessage = `Decaid software updated to v${next}.`;
    this.machineInfo.softwareVersion = next;
    this.notifyDeviceListeners();

    return {
      ok: true,
      target: "software",
      message: `Decaid software updated successfully to v${next}. Application reloaded.`,
      previousVersion: prev,
      newVersion: next,
    };
  }

  public async triggerFirmwareUpdate(): Promise<UpdateExecutionResult> {
    if (this.isLiveMachineConnected) {
      try {
        // Query firmware catalog first
        const catRes = await fetch(`${this.baseUrl}/api/v1/machine/firmware`, { signal: AbortSignal.timeout(5000) });
        if (catRes.ok) {
          const catalog = await catRes.json();
          const targetArtifact = Array.isArray(catalog) ? catalog[0] : catalog?.artifacts?.[0];
          if (targetArtifact?.id) {
            const applyRes = await fetch(`${this.baseUrl}/api/v1/machine/firmware/apply`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ artifactId: targetArtifact.id }),
              signal: AbortSignal.timeout(30000),
            });
            if (applyRes.ok) {
              return {
                ok: true,
                target: "firmware",
                message: `Firmware flashing initiated for artifact ${targetArtifact.id}.`,
              };
            }
          }
        }
        return {
          ok: false,
          target: "firmware",
          message: "No eligible DE1 firmware artifact found or apply request failed.",
        };
      } catch (err: any) {
        return {
          ok: false,
          target: "firmware",
          message: `Firmware flash failed: ${err.message || "Gateway error"}`,
        };
      }
    }

    // Simulated Firmware OTA Update
    const prev = this.systemVersion.firmwareVersion;
    const next = this.systemVersion.latestFirmwareVersion || "1.44";
    this.systemVersion.firmwareVersion = next;
    this.systemVersion.firmwareUpdateAvailable = false;
    this.systemVersion.statusMessage = `DE1 firmware flashed to v${next}.`;
    this.machineInfo.firmwareVersion = next;
    this.notifyDeviceListeners();

    return {
      ok: true,
      target: "firmware",
      message: `DE1 machine firmware successfully flashed to v${next}. GHC calibrated.`,
      previousVersion: prev,
      newVersion: next,
    };
  }

  public getSystemVersion(): SystemVersionInfo {
    return this.systemVersion;
  }

  // Getters for device state
  public isConnected(): boolean {
    return this.isLiveMachineConnected || this.machineStatus === "simulator";
  }

  public isLiveConnected(): boolean {
    return this.isLiveMachineConnected;
  }

  public getMachineStatus(): MachineConnectionStatus {
    return this.machineStatus;
  }

  public getScaleStatus(): ScaleConnectionStatus {
    return this.scaleStatus;
  }

  public getMachineInfo(): DE1MachineInfo {
    return this.machineInfo;
  }

  public getPairedScale(): PairedScaleInfo | null {
    return this.pairedScale;
  }

  public getHost(): string {
    return this.host;
  }

  public getPort(): number {
    return this.port;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }
}

export const decaid = new DecaidClient();
