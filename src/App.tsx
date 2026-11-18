import { useState, useEffect, useMemo, useRef } from "react";
import { decaid } from "./services/decaidConnection.ts";
import { simulator, type TelemetryPoint, type MachineSnapshot, type ScaleSnapshot } from "./services/telemetrySimulator.ts";
import type { CockpitTabId, CoffeeTabConfig, SteamTabConfig, WaterTabConfig, MaintenanceTabConfig } from "./types/cockpitTabs.ts";
import type { PantaBean } from "./types/bean.ts";
import { loadBeansFromStorage, saveBeansToStorage, createNewBeanEntry } from "./types/bean.ts";
import type { CafeHeaderConfig } from "./types/header.ts";
import { syncShotToDYE } from "./services/dyeBridge.ts";
import { uploadShotToVisualizer, loadVisualizerSettings } from "./services/visualizerBridge.ts";
import { buildBackupEnvelope, saveAutoBackup } from "./services/backupManager.ts";
import { loadCustomProfilesFromStorage } from "./types/profile.ts";

// Components
import { FluidBackground } from "./components/FluidBackground.tsx";
import { HomeCafeHeader } from "./components/HomeCafeHeader.tsx";
import { LeftMenuPane } from "./components/LeftMenuPane.tsx";
import { CenterStatusPane } from "./components/CenterStatusPane.tsx";
import { LiveExtractionDashboard } from "./components/LiveExtractionDashboard.tsx";
import { PostShotSummaryModal } from "./components/PostShotSummaryModal.tsx";
import { BeanDrawer } from "./components/BeanDrawer.tsx";
import { ProfileDrawer } from "./components/ProfileDrawer.tsx";
import { ShotHistoryDrawer } from "./components/ShotHistoryDrawer.tsx";
import { SettingsModal } from "./components/SettingsModal.tsx";
import { ConnectMachineModal } from "./components/ConnectMachineModal.tsx";
import { ScreensaverOverlay } from "./components/ScreensaverOverlay.tsx";
import { EquipmentSelectionModal } from "./components/EquipmentSelectionModal.tsx";
import type { ScreensaverConfig } from "./types/screensaver.ts";
import { loadScreensaverConfigFromStorage } from "./types/screensaver.ts";
import type { ShotRecord } from "./types/shot.ts";
import type { ProfileItem } from "./types/profile.ts";
import type { EquipmentInventory, ActiveEquipmentSelection } from "./types/equipment.ts";
import type { MachineMaintenanceConfig } from "./types/maintenance.ts";
import {
  loadMaintenanceConfig,
  saveMaintenanceConfig,
  getMaintenanceStatus,
} from "./types/maintenance.ts";
import type { SystemVersionInfo } from "./types/device.ts";
import {
  loadEquipmentInventory,
  saveEquipmentInventory,
  loadActiveEquipment,
  saveActiveEquipment,
} from "./types/equipment.ts";
import {
  loadShotHistoryFromStorage,
  saveShotHistoryToStorage,
  createShotRecord,
} from "./types/shot.ts";
import { mergeShots, mergeBeans } from "./types/backup.ts";



export function App() {
  // Telemetry State
  const [currentPoint, setCurrentPoint] = useState<TelemetryPoint>({
    timestamp: Date.now(),
    timeSeconds: 0,
    pressure: 0,
    targetPressure: 0,
    flow: 0,
    targetFlow: 0,
    weightFlow: 0,
    weight: 0,
    groupTemperature: 93.0,
    targetGroupTemp: 93.0,
    steamTemperature: 150.0,
    puckResistance: 0,
    phase: "idle",
    channelDetected: false,
  });

  const [machine, setMachine] = useState<MachineSnapshot>({
    state: "idle",
    groupTemperature: 93.0,
    targetGroupTemp: 93.0,
    steamTemperature: 150.0,
    targetSteamTemp: 150.0,
    waterLevelMl: 1450,
    pressure: 0,
    flow: 0,
    profileFrame: 0,
  });

  const [scale, setScale] = useState<ScaleSnapshot>({
    weight: 0,
    weightFlow: 0,
    battery: 94,
    isTared: true,
  });

  // Persistent Shot History & Inventory Archive
  const [shots, setShots] = useState<ShotRecord[]>(() => loadShotHistoryFromStorage());
  const [beans, setBeans] = useState<PantaBean[]>(() => loadBeansFromStorage([]));

  const [telemetryHistory, setTelemetryHistory] = useState<TelemetryPoint[]>([]);
  const [completedShotHistory, setCompletedShotHistory] = useState<TelemetryPoint[]>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_last_shot_history");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    const initialShots = loadShotHistoryFromStorage();
    if (initialShots.length > 0 && initialShots[0].telemetry && initialShots[0].telemetry.length > 0) {
      return initialShots[0].telemetry;
    }
    return [];
  });
  const telemetryHistoryRef = useRef<TelemetryPoint[]>([]);
  const [shotStartTime, setShotStartTime] = useState<number>(0);
  const [showSummaryModal, setShowSummaryModal] = useState(false);

  const [lastShotBean, setLastShotBean] = useState<PantaBean | undefined>(() => {
    const loadedBeans = loadBeansFromStorage([]);
    const initialShots = loadShotHistoryFromStorage();
    if (initialShots.length > 0) {
      const s = initialShots[0];
      const matched = loadedBeans.find((b) => b.id === s.beanId || b.name === s.beanName);
      if (matched) return matched;
    }
    return loadedBeans.length > 0 ? loadedBeans[0] : undefined;
  });

  const [lastShotProfileTitle, setLastShotProfileTitle] = useState<string | undefined>(() => {
    const initialShots = loadShotHistoryFromStorage();
    if (initialShots.length > 0) {
      return initialShots[0].profileTitle;
    }
    return undefined;
  });

  const [lastShotSummary, setLastShotSummary] = useState<{
    extractionTime: number;
    yieldGrams: number;
    peakPressure: number;
    eyPercentage?: number;
    dose?: number;
    avgFlow?: number;
  } | undefined>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_last_shot_summary");
      if (saved) return JSON.parse(saved);
    } catch {}
    const initialShots = loadShotHistoryFromStorage();
    if (initialShots.length > 0) {
      const s = initialShots[0];
      return {
        extractionTime: s.durationSeconds,
        yieldGrams: s.actualYield,
        peakPressure: s.peakPressure,
        eyPercentage: s.ey,
        dose: s.actualDose,
        avgFlow: s.avgFlow,
      };
    }
    return undefined;
  });

  // Operational Tabs State
  const [activeTab, setActiveTab] = useState<CockpitTabId>("coffee");
  const [coffeeConfig, setCoffeeConfig] = useState<CoffeeTabConfig>(() => {
    const def: CoffeeTabConfig = {
      dose: 18.0,
      targetYield: 36.0,
      profileId: "default-espresso",
      ratioText: "1:2.0",
    };
    try {
      const saved = localStorage.getItem("pantarhei_coffee_config");
      if (saved) return JSON.parse(saved);
    } catch {}
    const initialShots = loadShotHistoryFromStorage();
    if (initialShots.length > 0) {
      const s = initialShots[0];
      const dose = s.actualDose || s.targetDose || 18.0;
      const targetYield = s.actualYield || s.targetYield || 36.0;
      const ratio = dose > 0 ? Math.round((targetYield / dose) * 10) / 10 : 2.0;
      return {
        ...def,
        dose,
        targetYield,
        ratioText: `1:${ratio}`,
        profileId: s.profileId || s.profileTitle || "default-espresso",
      };
    }
    return def;
  });

  const [steamConfig, setSteamConfig] = useState<SteamTabConfig>({
    temperature: 150,
    flowRate: 1.2,
    durationSeconds: 45,
    autoPurge: true,
    autoPurgeSeconds: 3,
  });
  const [waterConfig, setWaterConfig] = useState<WaterTabConfig>({
    temperature: 85,
    flowRate: 4.0,
    volumeMl: 150,
    autoStopOnScale: true,
  });
  const [maintenanceConfig, setMaintenanceConfig] = useState<MaintenanceTabConfig>({
    flushDurationSeconds: 3,
    flushVolumeMl: 40,
    preferredCleaningProfileId: "Clean Thorough Forward Flush",
    transportArmed: false,
  });

  // Coffee & Profiles Selection
  const [activeBean, setActiveBean] = useState<PantaBean | undefined>(() => {
    const loaded = loadBeansFromStorage([]);
    try {
      const savedActiveId = localStorage.getItem("pantarhei_active_bean_id");
      if (savedActiveId) {
        const found = loaded.find((b) => b.id === savedActiveId);
        if (found) return found;
      }
    } catch {}
    const initialShots = loadShotHistoryFromStorage();
    if (initialShots.length > 0) {
      const s = initialShots[0];
      const matched = loaded.find((b) => b.id === s.beanId || b.name === s.beanName);
      if (matched) return matched;
    }
    return loaded.length > 0 ? loaded[0] : undefined;
  });

  const [activeProfileTitle, setActiveProfileTitle] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("pantarhei_active_profile_title");
      if (saved) return saved;
    } catch {}
    const initialShots = loadShotHistoryFromStorage();
    if (initialShots.length > 0 && initialShots[0].profileTitle) {
      return initialShots[0].profileTitle;
    }
    return "Default Espresso";
  });
  const [activeProfile, setActiveProfile] = useState<ProfileItem | null>(null);

  // Home Cafe Header & Theming
  const [headerConfig, setHeaderConfig] = useState<CafeHeaderConfig>({
    enabled: true,
    text: "Caffè Panta Rhei",
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 28,
    color: "#ffffff",
    letterSpacing: 2,
    subtitleText: "Specialty Espresso Bar",
    subtitleColor: "#94a3b8",
  });
  const [clockPaletteId, setClockPaletteId] = useState("cyberpunk");
  const [fluidEnabled, setFluidEnabled] = useState(true);

  // Drawers & Modals
  const [isBeanDrawerOpen, setIsBeanDrawerOpen] = useState(false);
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false);
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(() => {
    try {
      const optOut = localStorage.getItem("pantarhei_dont_show_startup_connect") === "true";
      return !optOut && !decaid.isLiveConnected();
    } catch {
      return false;
    }
  });

  // Screensaver Configuration
  const [screensaverConfig, setScreensaverConfig] = useState<ScreensaverConfig>(() => loadScreensaverConfigFromStorage());
  const [ulNotice, setUlNotice] = useState<string | null>(null);

  // Equipment Inventory & Active Extraction Gear Selection
  const [isEquipmentModalOpen, setIsEquipmentModalOpen] = useState(false);
  const [equipmentInventory, setEquipmentInventory] = useState<EquipmentInventory>(loadEquipmentInventory);
  const [activeEquipment, setActiveEquipment] = useState<ActiveEquipmentSelection>(loadActiveEquipment);
  const [settingsInitialTab, setSettingsInitialTab] = useState<"appearance" | "screensaver" | "pairing" | "plugins" | "backup" | "equipment">("appearance");

  // Machine Maintenance Configuration State
  const [machineMaintenanceConfig, setMachineMaintenanceConfig] = useState<MachineMaintenanceConfig>(loadMaintenanceConfig);
  const maintenanceStatus = useMemo(() => getMaintenanceStatus(machineMaintenanceConfig), [machineMaintenanceConfig]);

  const handleMaintenanceConfigChange = (newCfg: MachineMaintenanceConfig) => {
    setMachineMaintenanceConfig(newCfg);
    saveMaintenanceConfig(newCfg);
  };

  const handleNavigateToMaintenanceContext = (actionType: "cleaning" | "descale" | "both" | "none") => {
    setActiveTab("maintenance");
    if (actionType === "cleaning" || actionType === "both") {
      const customProfs = loadCustomProfilesFromStorage();
      const cleanProf = customProfs.find(
        (p: ProfileItem) => p.title.toLowerCase().includes("cleaning") || p.title.toLowerCase().includes("forward flush")
      );
      if (cleanProf) {
        setActiveProfileTitle(cleanProf.title);
        setActiveProfile(cleanProf);
        decaid.selectProfile(cleanProf);
      } else {
        setActiveProfileTitle("Cleaning/Thorough Forward Flush");
      }
    }
  };

  // Decaid Software & DE1 Machine Version State
  const [systemVersion, setSystemVersion] = useState<SystemVersionInfo>(() => decaid.getSystemVersion());
  const hasUpdateAvailable = Boolean(
    systemVersion.softwareUpdateAvailable || systemVersion.firmwareUpdateAvailable
  );

  // Automated daily check for software & firmware updates & device synchronization
  useEffect(() => {
    const unsubDevice = decaid.addDeviceListener(() => {
      setSystemVersion(decaid.getSystemVersion());
    });

    // Check if daily check is due (>24h since last check)
    decaid.checkDailyUpdates().catch(() => {});

    // Periodic check every hour if >24 hours have elapsed
    const interval = setInterval(() => {
      decaid.checkDailyUpdates().catch(() => {});
    }, 60 * 60 * 1000);

    return () => {
      unsubDevice();
      clearInterval(interval);
    };
  }, []);

  const handleEquipmentSelectionChange = (newSelection: ActiveEquipmentSelection) => {
    setActiveEquipment(newSelection);
    saveActiveEquipment(newSelection);
  };

  const handleEquipmentInventoryChange = (newInv: EquipmentInventory) => {
    setEquipmentInventory(newInv);
    saveEquipmentInventory(newInv);
  };

  const handleOpenSettingsWithTab = (tab: "appearance" | "screensaver" | "pairing" | "plugins" | "backup" | "equipment") => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  // Subscribe to live/simulated Decaid telemetry
  useEffect(() => {
    if (!decaid.isLiveConnected()) {
      decaid.enableSimulatorMode();
    }
    const unsubscribe = decaid.subscribe((point, mach, sc) => {
      setCurrentPoint(point);
      setMachine(mach);
      setScale(sc);

      if (mach.state === "espresso") {
        telemetryHistoryRef.current.push(point);
        setTelemetryHistory([...telemetryHistoryRef.current]);
      }
    });

    return unsubscribe;
  }, []);

  // Monitor shot completion
  const isExtracting = machine.state === "espresso";
  const isMachineActive =
    isExtracting ||
    machine.state === "steam" ||
    machine.state === "water" ||
    machine.state === "rinse" ||
    currentPoint.phase === "preinfusion" ||
    currentPoint.phase === "soak" ||
    currentPoint.phase === "extraction";
  const wasExtractingRef = useRef(false);

  useEffect(() => {
    if (!wasExtractingRef.current && isExtracting) {
      // Shot just started (via software Go button OR physical Group Head Controller on DE1!)
      telemetryHistoryRef.current = [];
      setTelemetryHistory([]);
      setShotStartTime(Date.now());
      setUlNotice(null);
      if (activeTab !== "coffee") {
        setActiveTab("coffee");
      }
    } else if (wasExtractingRef.current && !isExtracting) {
      // Shot just completed or stopped
      const points =
        telemetryHistoryRef.current.length > 3
          ? [...telemetryHistoryRef.current]
          : simulator.getTelemetryHistory();

      if (points.length > 0) {
        const finalPt = points[points.length - 1];
        const peakP = points.reduce((max, p) => Math.max(max, p.pressure), 0);
        const ey = (finalPt.weight * 9.5) / (coffeeConfig.dose || 18.0);

        setCompletedShotHistory(points);
        setLastShotBean(activeBean);
        setLastShotProfileTitle(activeProfileTitle);
        setLastShotSummary({
          extractionTime: finalPt.timeSeconds,
          yieldGrams: finalPt.weight,
          peakPressure: peakP,
          eyPercentage: Math.round(ey * 10) / 10,
        });

        // Automatically archive completed shot into persistent history
        const newRecord = createShotRecord({
          telemetry: points,
          bean: activeBean,
          profileTitle: activeProfileTitle,
          profileId: coffeeConfig.profileId,
          targetDose: coffeeConfig.dose,
          targetYield: coffeeConfig.targetYield,
          grindSetting: activeBean?.targetGrind,
          basket: activeEquipment.basket || activeBean?.preferredBasket,
          equipment: activeEquipment,
        });

        let updatedShots: ShotRecord[] = [];
        setShots((prev) => {
          updatedShots = [newRecord, ...prev];
          saveShotHistoryToStorage(updatedShots);
          return updatedShots;
        });

        // Write completed shot to Decaid system-defined history location (/api/v1/shots & history/ folder)
        decaid.saveShot(newRecord).catch((e) => console.warn("[PantaRhei] Error writing shot to Decaid system folder:", e));

        // Describe Your Espresso (DYE2) Standard Integration
        syncShotToDYE(decaid.getBaseUrl(), newRecord).catch(() => {});

        // Visualizer.coffee Cloud Auto-Upload
        const visCfg = loadVisualizerSettings();
        if (visCfg.autoUpload && visCfg.userToken) {
          uploadShotToVisualizer(decaid.getBaseUrl(), newRecord, visCfg).catch(() => {});
        }

        // Automatic Rolling Snapshot
        try {
          const autoEnvelope = buildBackupEnvelope({
            type: "full",
            settings: {
              headerConfig,
              clockPaletteId,
              fluidEnabled,
              screensaverConfig,
              cockpitConfigs: {
                coffee: coffeeConfig,
                steam: steamConfig,
                water: waterConfig,
                maintenance: maintenanceConfig,
              },
              scaleConfig: {
                autoTareShot: true,
                autoTareCup: false,
              },
              deviceConfig: {
                host: decaid.getHost(),
                port: decaid.getPort(),
                dontShowStartupModal: localStorage.getItem("pantarhei_dont_show_startup_connect") === "true",
              },
              machineMaintenanceConfig: machineMaintenanceConfig,
              pluginSettings: {
                visualizer: visCfg,
              },
            },
            profiles: loadCustomProfilesFromStorage(),
            beans,
            shots: updatedShots.length > 0 ? updatedShots : [newRecord, ...shots],
          });
          saveAutoBackup(autoEnvelope);
        } catch {}

        setShowSummaryModal(true);
      }
    }
    wasExtractingRef.current = isExtracting;
  }, [isExtracting, coffeeConfig.dose]);

  // Action Triggers
  const handleStartAction = async () => {
    setUlNotice(null);
    if (activeTab === "coffee") {
      telemetryHistoryRef.current = [];
      setTelemetryHistory([]);
      setShotStartTime(Date.now());
      const res = await decaid.startEspresso(coffeeConfig.targetYield, activeProfile || undefined);
      if (res && res.ulRestricted) {
        setUlNotice(res.error || "UL Safety Mode Active: Software trigger disabled. Please tap the Group Head Controller on your DE1.");
      }
    } else if (activeTab === "steam") {
      const res = await decaid.startSteam();
      if (res && res.ulRestricted) {
        setUlNotice(res.error || "UL Safety Mode Active: Please flip the steam switch on your DE1.");
      }
    } else if (activeTab === "water") {
      const res = await decaid.startWater();
      if (res && res.ulRestricted) {
        setUlNotice(res.error || "UL Safety Mode Active: Please engage the water tap on your DE1.");
      }
    } else if (activeTab === "maintenance") {
      const res = await decaid.startFlush();
      if (res && res.ulRestricted) {
        setUlNotice(res.error || "UL Safety Mode Active: Please tap the Group Head Controller to flush.");
      }
    }
  };

  const handleStopShot = () => {
    decaid.stop();
  };

  const handleUpdateShot = (updatedShot: ShotRecord) => {
    let newShotsList: ShotRecord[] = [];
    setShots((prev) => {
      newShotsList = prev.map((s) => (s.id === updatedShot.id ? updatedShot : s));
      saveShotHistoryToStorage(newShotsList);
      return newShotsList;
    });

    // Write updated shot to Decaid system-defined history location (/api/v1/shots & history/ folder)
    decaid.saveShot(updatedShot).catch((e) => console.warn("[PantaRhei] Error updating shot in Decaid system folder:", e));

    // Automatically sync edited shot data to DYE2
    syncShotToDYE(decaid.getBaseUrl(), updatedShot).catch(() => {});

    // If Visualizer auto-upload is configured, also update
    const visCfg = loadVisualizerSettings();
    if (visCfg.autoUpload && visCfg.userToken) {
      uploadShotToVisualizer(decaid.getBaseUrl(), updatedShot, visCfg).catch(() => {});
    }

    // Update lastShotSummary if it corresponds to the current bean
    if (lastShotSummary) {
      setLastShotSummary((prev) =>
        prev
          ? {
              ...prev,
              eyPercentage: updatedShot.ey,
            }
          : prev
      );
    }

    // Trigger rolling auto-backup
    try {
      const autoEnvelope = buildBackupEnvelope({
        type: "full",
        settings: {
          headerConfig,
          clockPaletteId,
          fluidEnabled,
          screensaverConfig,
          cockpitConfigs: {
            coffee: coffeeConfig,
            steam: steamConfig,
            water: waterConfig,
            maintenance: maintenanceConfig,
          },
          scaleConfig: {
            autoTareShot: true,
            autoTareCup: false,
          },
          deviceConfig: {
            host: decaid.getHost(),
            port: decaid.getPort(),
            dontShowStartupModal: localStorage.getItem("pantarhei_dont_show_startup_connect") === "true",
          },
          pluginSettings: {
            visualizer: visCfg,
          },
        },
        profiles: loadCustomProfilesFromStorage(),
        beans,
        shots: newShotsList.length > 0 ? newShotsList : shots,
      });
      saveAutoBackup(autoEnvelope);
    } catch {}
  };

  const handleImportMigratedData = (data: {
    profiles: ProfileItem[];
    shots: ShotRecord[];
    beans?: PantaBean[];
    equipment?: Partial<EquipmentInventory>;
    activeEquipment?: Partial<ActiveEquipmentSelection>;
    latestShot?: ShotRecord;
    activeBean?: PantaBean;
    activeProfileTitle?: string;
    activeDose?: number;
    activeTargetYield?: number;
  }) => {
    let mergedShotsList: ShotRecord[] = shots;
    if (data.shots && data.shots.length > 0) {
      setShots((prev) => {
        mergedShotsList = mergeShots(prev, data.shots, "merge_deduplicate");
        saveShotHistoryToStorage(mergedShotsList);
        return mergedShotsList;
      });
    }

    let mergedBeansList: PantaBean[] = beans;
    if (data.beans && data.beans.length > 0) {
      setBeans((prev) => {
        mergedBeansList = mergeBeans(prev, data.beans!, "merge_deduplicate");
        saveBeansToStorage(mergedBeansList);
        return mergedBeansList;
      });
    }

    if (data.equipment) {
      setEquipmentInventory((prev) => {
        const updated: EquipmentInventory = {
          ...prev,
          grinders: Array.from(new Set([...prev.grinders, ...(data.equipment?.grinders || [])])),
          burrs: Array.from(new Set([...prev.burrs, ...(data.equipment?.burrs || [])])),
          baskets: Array.from(new Set([...prev.baskets, ...(data.equipment?.baskets || [])])),
          scales: Array.from(new Set([...prev.scales, ...(data.equipment?.scales || [])])),
          tampers: Array.from(new Set([...prev.tampers, ...(data.equipment?.tampers || [])])),
          distributors: Array.from(new Set([...prev.distributors, ...(data.equipment?.distributors || [])])),
        };
        saveEquipmentInventory(updated);
        return updated;
      });
    }

    if (data.activeEquipment) {
      setActiveEquipment((prev) => {
        const updated: ActiveEquipmentSelection = {
          ...prev,
          grinder: data.activeEquipment?.grinder || prev.grinder,
          burrs: data.activeEquipment?.burrs || prev.burrs,
          basket: data.activeEquipment?.basket || prev.basket,
          tampers: data.activeEquipment?.tampers && data.activeEquipment.tampers.length > 0 ? data.activeEquipment.tampers : prev.tampers,
          distributors: data.activeEquipment?.distributors && data.activeEquipment.distributors.length > 0 ? data.activeEquipment.distributors : prev.distributors,
        };
        saveActiveEquipment(updated);
        return updated;
      });
    }

    // Cockpit transition from latest shot
    const latest = data.latestShot || (data.shots && data.shots.length > 0 ? data.shots[0] : mergedShotsList[0]);
    if (latest) {
      // 1. Telemetry points for the middle pane extraction graph
      if (latest.telemetry && latest.telemetry.length > 0) {
        setCompletedShotHistory(latest.telemetry);
        try {
          localStorage.setItem("pantarhei_last_shot_history", JSON.stringify(latest.telemetry));
        } catch {}
      }

      // 2. Post-shot summary pill
      const summary = {
        extractionTime: latest.durationSeconds,
        yieldGrams: latest.actualYield,
        peakPressure: latest.peakPressure,
        eyPercentage: latest.ey,
        dose: latest.actualDose,
        avgFlow: latest.avgFlow,
      };
      setLastShotSummary(summary);
      try {
        localStorage.setItem("pantarhei_last_shot_summary", JSON.stringify(summary));
      } catch {}

      // 3. Active bean & last shot bean
      const allAvailableBeans = data.beans && data.beans.length > 0 ? data.beans : mergedBeansList;
      const targetBean =
        data.activeBean ||
        allAvailableBeans.find((b) => b.id === latest.beanId || b.name === latest.beanName) ||
        (allAvailableBeans.length > 0 ? allAvailableBeans[0] : undefined);

      if (targetBean) {
        setActiveBean(targetBean);
        setLastShotBean(targetBean);
        try {
          localStorage.setItem("pantarhei_active_bean_id", targetBean.id);
        } catch {}
      }

      // 4. Active profile & last shot profile
      const profTitle = data.activeProfileTitle || latest.profileTitle;
      if (profTitle) {
        setActiveProfileTitle(profTitle);
        setLastShotProfileTitle(profTitle);
        try {
          localStorage.setItem("pantarhei_active_profile_title", profTitle);
        } catch {}
      }

      // 5. Active dose & target yield for Cockpit
      const dose = data.activeDose || latest.actualDose || latest.targetDose || 18.0;
      const targetYield = data.activeTargetYield || latest.actualYield || latest.targetYield || 36.0;
      const ratio = dose > 0 ? Math.round((targetYield / dose) * 10) / 10 : 2.0;

      setCoffeeConfig((prev) => {
        const updated = {
          ...prev,
          dose,
          targetYield,
          ratioText: `1:${ratio}`,
          profileId: latest.profileId || latest.profileTitle || prev.profileId,
        };
        try {
          localStorage.setItem("pantarhei_coffee_config", JSON.stringify(updated));
        } catch {}
        return updated;
      });
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden flex flex-col bg-decent-dark text-decent-text">
      {/* 1. Ambient Blue Fluid Canvas Background (Confined to Middle & Right Panes) */}
      {fluidEnabled && !isExtracting && <FluidBackground isExtractionActive={isExtracting} />}

      {/* 2. Mode B: Live Extraction Dashboard (Full Screen Gauge Cluster & 60fps Graph) */}
      {isExtracting ? (
        <LiveExtractionDashboard
          currentPoint={currentPoint}
          history={telemetryHistory}
          machine={machine}
          scale={scale}
          targetYield={coffeeConfig.targetYield}
          shotStartTime={shotStartTime}
          onStopShot={handleStopShot}
          bean={activeBean}
          profileTitle={activeProfileTitle}
        />
      ) : (
        /* 3. Mode A: Ready / Idle Cockpit */
        <div className="w-full h-full flex flex-col justify-between relative z-10">
          {/* Top Stripe: Customizable Home Cafe Header with Clock & Contextual Action Buttons */}
          <HomeCafeHeader
            config={headerConfig}
            onOpenSettings={() => setIsSettingsOpen(true)}
            clockPaletteId={clockPaletteId}
            hasUpdateAvailable={hasUpdateAvailable}
            onOpenUpdates={() => handleOpenSettingsWithTab("pairing")}
            maintenanceStatus={maintenanceStatus}
            onNavigateToMaintenance={handleNavigateToMaintenanceContext}
            isMachineConnected={isMachineActive}
            isSimulatorMode={decaid.getMachineStatus() === "simulator"}
            onOpenPairing={() => setIsConnectModalOpen(true)}
            onStartAction={handleStartAction}
            isExtracting={isExtracting}
          />

          {/* Floating UL Compliance or Safety Notice */}
          {ulNotice && (
            <div className="absolute top-14 left-1/2 -translate-x-1/2 z-30 px-3.5 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-medium shadow-xl backdrop-blur-md animate-fade-in flex items-center space-x-2">
              <span>{ulNotice}</span>
              <button
                type="button"
                onClick={() => setUlNotice(null)}
                className="ml-2 text-amber-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* Main 2-Pane Cockpit Body: Recipe & Controls (Left), Expanded Live Telemetry & Graph (Right) */}
          <main className="flex-1 w-full min-h-0 flex items-stretch overflow-hidden">
            {/* Left Pane: 4 Dedicated Tabs (Coffee, Steam, Water, Maintenance) */}
            <LeftMenuPane
              activeTab={activeTab}
              onTabChange={setActiveTab}
              coffeeConfig={coffeeConfig}
              onCoffeeConfigChange={setCoffeeConfig}
              steamConfig={steamConfig}
              onSteamConfigChange={setSteamConfig}
              waterConfig={waterConfig}
              onWaterConfigChange={setWaterConfig}
              maintenanceConfig={maintenanceConfig}
              onMaintenanceConfigChange={setMaintenanceConfig}
              activeBean={activeBean}
              activeProfileTitle={activeProfileTitle}
              onOpenBeanDrawer={() => setIsBeanDrawerOpen(true)}
              onOpenProfileDrawer={() => setIsProfileDrawerOpen(true)}
              onOpenHistory={() => setIsHistoryDrawerOpen(true)}
              onOpenSettings={() => handleOpenSettingsWithTab("appearance")}
              onTriggerFlush={() => decaid.startFlush()}
              activeEquipment={activeEquipment}
              onOpenEquipmentSelection={() => setIsEquipmentModalOpen(true)}
              onOpenSettingsEquipment={() => handleOpenSettingsWithTab("equipment")}
            />

            {/* Center Pane: Ambient Machine Status, Previous Shot Bean Data & Graph (Now taking all remaining width!) */}
            <CenterStatusPane
              machine={machine}
              lastShotSummary={lastShotSummary}
              lastShotBean={lastShotBean}
              lastShotProfileTitle={lastShotProfileTitle}
              lastShotHistory={completedShotHistory}
              onOpenSummaryModal={() => setShowSummaryModal(true)}
            />
          </main>
        </div>
      )}

      {/* Post-Shot Summary Modal */}
      {showSummaryModal && (
        <PostShotSummaryModal
          history={completedShotHistory.length > 0 ? completedShotHistory : telemetryHistory}
          bean={activeBean}
          dose={coffeeConfig.dose}
          onClose={() => setShowSummaryModal(false)}
          onUpdateShot={(updatedSensory) => {
            if (shots.length > 0) {
              const latest = shots[0];
              const updatedShot: ShotRecord = {
                ...latest,
                tds: updatedSensory.tds,
                ey: updatedSensory.ey,
                rating: updatedSensory.rating,
                tags: updatedSensory.tags,
              };
              handleUpdateShot(updatedShot);
            }
          }}
        />
      )}

      {/* Coffee Inventory Drawer */}
      <BeanDrawer
        isOpen={isBeanDrawerOpen}
        onClose={() => setIsBeanDrawerOpen(false)}
        beans={beans}
        activeBeanId={activeBean?.id}
        onSelectBean={setActiveBean}
        onSaveBean={(newBean) => {
          setBeans((prev) => {
            const updated = [newBean, ...prev.filter((b) => b.id !== newBean.id)];
            saveBeansToStorage(updated);
            return updated;
          });
        }}
      />

      {/* Extraction Profiles Drawer */}
      <ProfileDrawer
        isOpen={isProfileDrawerOpen}
        onClose={() => setIsProfileDrawerOpen(false)}
        activeProfileTitle={activeProfileTitle}
        onSelectProfile={(p) => {
          setActiveProfileTitle(p.title);
          setActiveProfile(p);
          decaid.selectProfile(p);
          setCoffeeConfig((prev) => ({
            ...prev,
            profileId: p.id || p.title,
            targetYield: Number(p.target_weight) || prev.targetYield,
            dose: Number(p.target_dose) || prev.dose,
          }));
        }}
        onSaveProfile={(p) => {
          decaid.saveProfile(p).catch((e) => console.warn("[PantaRhei] Error saving profile to Decaid:", e));
        }}
      />

      {/* Shot History & Dial-in Archive Drawer */}
      <ShotHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        shots={shots}
        onSelectShotAsReference={(selectedShot) => {
          setCompletedShotHistory(selectedShot.telemetry);
          const matchingBean: PantaBean = beans.find((b) => b.id === selectedShot.beanId) || createNewBeanEntry({
            name: selectedShot.beanName,
            roaster: selectedShot.roaster,
            countryOfOrigin: selectedShot.countryOfOrigin || "Various",
            process: selectedShot.process || "Washed",
            totalGrams: 250,
          });
          setLastShotBean(matchingBean);
          setLastShotProfileTitle(selectedShot.profileTitle);
          setLastShotSummary({
            extractionTime: selectedShot.durationSeconds,
            yieldGrams: selectedShot.actualYield,
            peakPressure: selectedShot.peakPressure,
            eyPercentage: selectedShot.ey,
          });
        }}
        onRedialShot={(selectedShot) => {
          const matchingBean = beans.find(
            (b) => b.id === selectedShot.beanId || b.name === selectedShot.beanName
          );
          if (matchingBean) {
            setActiveBean(matchingBean);
          }
          setActiveProfileTitle(selectedShot.profileTitle);
          setCoffeeConfig((prev) => ({
            ...prev,
            dose: selectedShot.actualDose,
            targetYield: selectedShot.targetYield,
          }));
        }}
        onDeleteShot={(shotId) => {
          setShots((prev) => {
            const updated = prev.filter((s) => s.id !== shotId);
            saveShotHistoryToStorage(updated);
            return updated;
          });
          decaid.deleteShot(shotId).catch(() => {});
        }}
        onUpdateShot={handleUpdateShot}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        headerConfig={headerConfig}
        onHeaderConfigChange={setHeaderConfig}
        clockPaletteId={clockPaletteId}
        onClockPaletteChange={setClockPaletteId}
        fluidEnabled={fluidEnabled}
        onFluidEnabledChange={setFluidEnabled}
        screensaverConfig={screensaverConfig}
        onScreensaverConfigChange={setScreensaverConfig}
        beans={beans}
        onBeansChange={(newBeans) => {
          setBeans(newBeans);
          saveBeansToStorage(newBeans);
        }}
        shots={shots}
        onShotsChange={setShots}
        cockpitConfigs={{
          coffee: coffeeConfig,
          steam: steamConfig,
          water: waterConfig,
          maintenance: maintenanceConfig,
        }}
        onCockpitConfigsChange={(cfgs) => {
          if (cfgs.coffee) setCoffeeConfig(cfgs.coffee);
          if (cfgs.steam) setSteamConfig(cfgs.steam);
          if (cfgs.water) setWaterConfig(cfgs.water);
          if (cfgs.maintenance) setMaintenanceConfig(cfgs.maintenance);
        }}
        equipmentInventory={equipmentInventory}
        onEquipmentInventoryChange={handleEquipmentInventoryChange}
        maintenanceConfig={machineMaintenanceConfig}
        onMaintenanceConfigChange={handleMaintenanceConfigChange}
        onNavigateToMaintenanceContext={handleNavigateToMaintenanceContext}
        initialTab={settingsInitialTab}
        onImportData={handleImportMigratedData}
      />

      {/* Equipment Selection Modal for Upcoming Shot */}
      <EquipmentSelectionModal
        isOpen={isEquipmentModalOpen}
        onClose={() => setIsEquipmentModalOpen(false)}
        inventory={equipmentInventory}
        selection={activeEquipment}
        onSelectionChange={handleEquipmentSelectionChange}
        onOpenSettingsEquipment={() => {
          setIsEquipmentModalOpen(false);
          handleOpenSettingsWithTab("equipment");
        }}
      />

      {/* Ambient Screensaver Overlay */}
      <ScreensaverOverlay
        config={screensaverConfig}
        isMachineActive={isMachineActive}
      />

      {/* Disconnected DE1 Startup Modal */}
      {isConnectModalOpen && (
        <ConnectMachineModal
          isOpen={isConnectModalOpen}
          onClose={() => setIsConnectModalOpen(false)}
          onContinueSimulator={() => setIsConnectModalOpen(false)}
          onImportData={handleImportMigratedData}
          existingShots={shots}
        />
      )}
    </div>
  );
}

export default App;
