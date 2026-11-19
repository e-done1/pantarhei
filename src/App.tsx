import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { decaid } from "./services/decaidConnection.ts";
import { simulator, type TelemetryPoint, type MachineSnapshot, type ScaleSnapshot } from "./services/telemetrySimulator.ts";
import type { CockpitTabId, CoffeeTabConfig, SteamTabConfig, WaterTabConfig, MaintenanceTabConfig } from "./types/cockpitTabs.ts";
import { loadSteamConfigFromStorage, saveSteamConfigToStorage } from "./types/cockpitTabs.ts";
import type { PantaBean } from "./types/bean.ts";
import { loadBeansFromStorage, saveBeansToStorage, createNewBeanEntry, extractBeansFromShots } from "./types/bean.ts";
import type { CafeHeaderConfig } from "./types/header.ts";
import { syncShotToDYE } from "./services/dyeBridge.ts";
import { uploadShotToVisualizer, loadVisualizerSettings } from "./services/visualizerBridge.ts";
import { buildBackupEnvelope, saveAutoBackup } from "./services/backupManager.ts";
import { loadCustomProfilesFromStorage } from "./types/profile.ts";
import { syncFromDecaidGateway } from "./services/legacyMigration.ts";

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
import type { SystemVersionInfo, MachineConnectionStatus } from "./types/device.ts";
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
  const [beans, setBeans] = useState<PantaBean[]>(() => {
    let loadedBeans = loadBeansFromStorage([]);
    const initialShots = loadShotHistoryFromStorage();
    if (loadedBeans.length === 0 && initialShots.length > 0) {
      loadedBeans = extractBeansFromShots(initialShots);
      saveBeansToStorage(loadedBeans);
    }
    return loadedBeans;
  });

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
    let loadedBeans = loadBeansFromStorage([]);
    const initialShots = loadShotHistoryFromStorage();
    if (loadedBeans.length === 0 && initialShots.length > 0) {
      loadedBeans = extractBeansFromShots(initialShots);
      saveBeansToStorage(loadedBeans);
    }
    if (initialShots.length > 0) {
      const s = initialShots[0];
      const matched = loadedBeans.find((b) => b.id === s.beanId || b.name === s.beanName);
      if (matched) return matched;
      if (s.beanName) {
        return createNewBeanEntry({
          id: s.beanId || `bean-${s.beanName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          name: s.beanName,
          roaster: s.roaster || "Decaid Synced",
          totalGrams: 250,
        });
      }
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

  const targetYieldDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCoffeeConfigChange = (newConfig: CoffeeTabConfig) => {
    const prevYield = coffeeConfig.targetYield;
    setCoffeeConfig(newConfig);
    try {
      localStorage.setItem("pantarhei_coffee_config", JSON.stringify(newConfig));
    } catch {}
    if (newConfig.targetYield && newConfig.targetYield !== prevYield) {
      if (targetYieldDebounceRef.current) {
        clearTimeout(targetYieldDebounceRef.current);
      }
      targetYieldDebounceRef.current = setTimeout(() => {
        decaid.setTargetYield(newConfig.targetYield);
      }, 300);
    }
  };

  const [steamConfig, setSteamConfig] = useState<SteamTabConfig>(loadSteamConfigFromStorage);

  const handleSteamConfigChange = (newConfig: SteamTabConfig) => {
    setSteamConfig(newConfig);
    saveSteamConfigToStorage(newConfig);
    const targetGroupTemp = Number(activeProfile?.target_temperature || activeProfile?.steps?.[0]?.temperature || 93.0);
    const targetSteamTemp = newConfig.heaterEnabled === false ? 0 : (newConfig.temperature >= 135 ? newConfig.temperature : 0);
    decaid.triggerHeating({
      targetGroupTemp,
      targetSteamTemp,
      profile: activeProfile,
      steamConfig: newConfig,
    });
  };
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
    let loaded = loadBeansFromStorage([]);
    const initialShots = loadShotHistoryFromStorage();
    if (loaded.length === 0 && initialShots.length > 0) {
      loaded = extractBeansFromShots(initialShots);
      saveBeansToStorage(loaded);
    }
    try {
      const savedActiveId = localStorage.getItem("pantarhei_active_bean_id");
      if (savedActiveId) {
        const found = loaded.find((b) => b.id === savedActiveId);
        if (found) return found;
      }
    } catch {}
    if (initialShots.length > 0) {
      const s = initialShots[0];
      const matched = loaded.find((b) => b.id === s.beanId || b.name === s.beanName);
      if (matched) return matched;
      if (s.beanName) {
        return createNewBeanEntry({
          id: s.beanId || `bean-${s.beanName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
          name: s.beanName,
          roaster: s.roaster || "Decaid Synced",
          totalGrams: 250,
        });
      }
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

  // Drawers & Main Pane Embedded Views
  type MainPaneView = "graph" | "beans" | "profiles" | "equipment" | "history";
  const [mainPaneView, setMainPaneView] = useState<MainPaneView>("graph");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(() => {
    try {
      const optOut = localStorage.getItem("pantarhei_dont_show_startup_connect") === "true";
      return !optOut && !decaid.isLiveConnected();
    } catch {
      return false;
    }
  });

  // Machine Connection Status (reactive from Decaid Gateway)
  const [machineStatus, setMachineStatus] = useState<MachineConnectionStatus>(() => decaid.getMachineStatus());

  // Screensaver Configuration
  const [screensaverConfig, setScreensaverConfig] = useState<ScreensaverConfig>(() => loadScreensaverConfigFromStorage());
  const [ulNotice, setUlNotice] = useState<string | null>(null);

  // Equipment Inventory & Active Extraction Gear Selection
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

  // Screensaver State Transitions: Idle on activation, Heat on wake
  const handleScreensaverActivate = useCallback(() => {
    decaid.setScreensaverIdle();
  }, []);

  const handleScreensaverWake = useCallback(() => {
    const targetGroupTemp = Number(activeProfile?.target_temperature || activeProfile?.steps?.[0]?.temperature || 93.0);
    const targetSteamTemp = steamConfig.heaterEnabled === false ? 0 : (steamConfig.temperature >= 135 ? steamConfig.temperature : 0);
    decaid.triggerHeating({
      targetGroupTemp,
      targetSteamTemp,
      profile: activeProfile,
      steamConfig,
    });
  }, [activeProfile, steamConfig]);

  // Initial Boot & Profile Auto-Heat Trigger
  useEffect(() => {
    const profs = loadCustomProfilesFromStorage();
    const matched = profs.find(
      (p: ProfileItem) => p.title.toLowerCase() === activeProfileTitle.toLowerCase() || p.id === activeProfileTitle
    );
    const profToUse = matched || activeProfile || profs[0] || null;
    if (profToUse && !activeProfile) {
      setActiveProfile(profToUse);
    }
    const targetGroupTemp = Number(profToUse?.target_temperature || profToUse?.steps?.[0]?.temperature || 93.0);
    const targetSteamTemp = steamConfig.heaterEnabled === false ? 0 : (steamConfig.temperature >= 135 ? steamConfig.temperature : 0);

    decaid.triggerHeating({
      targetGroupTemp,
      targetSteamTemp,
      profile: profToUse,
      steamConfig,
    });
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

  // Subscribe to live/simulated Decaid telemetry and device connection events
  useEffect(() => {
    const unsubDevice = decaid.addDeviceListener(() => {
      setMachineStatus(decaid.getMachineStatus());
    });

    const unsubscribe = decaid.subscribe((point, mach, sc) => {
      setCurrentPoint(point);
      setMachine(mach);
      setScale(sc);

      if (mach.state === "espresso") {
        telemetryHistoryRef.current.push(point);
        setTelemetryHistory([...telemetryHistoryRef.current]);
      }
    });

    return () => {
      unsubDevice();
      unsubscribe();
    };
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

  // Automated Gateway Sync on Startup: Automatically queries Decaid Gateway for the latest real shots,
  // beans (e.g. Peony Benti Nenka), equipment and profiles, transitioning the cockpit seamlessly!
  useEffect(() => {
    let isMounted = true;
    const runAutoSync = async () => {
      try {
        const baseUrl = decaid.getBaseUrl();
        const data = await syncFromDecaidGateway(baseUrl, 100);
        if (!isMounted || !data || data.shots.length === 0) return;

        // Purge any legacy mock shots if real Decaid shots are present
        const realShots = data.shots.filter((s) => !s.id.startsWith("shot-20261116-"));
        if (realShots.length > 0) {
          console.log(`[PantaRhei] Auto-synced ${realShots.length} real shots & ${data.beans.length} beans from Decaid Gateway (${baseUrl}).`);
          handleImportMigratedData({
            profiles: data.profiles,
            shots: realShots,
            beans: data.beans,
            equipment: data.equipment,
            activeEquipment: data.activeEquipment,
            latestShot: data.latestShot || realShots[0],
            activeBean: data.activeBean,
            activeProfileTitle: data.activeProfileTitle,
            activeDose: data.activeDose,
            activeTargetYield: data.activeTargetYield,
          });
        }
      } catch (err) {
        // Decaid Gateway might be in simulator mode or not yet reachable
        console.log("[PantaRhei] Gateway auto-sync standby:", err);
      }
    };

    const timer = setTimeout(runAutoSync, 600);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  const handleCloseConnectModal = () => {
    try {
      localStorage.setItem("pantarhei_dont_show_startup_connect", "true");
      localStorage.setItem("pantarhei_onboarding_completed", "true");
    } catch {}
    setIsConnectModalOpen(false);
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
            isMachineConnected={machineStatus === "connected"}
            isSimulatorMode={machineStatus === "simulator"}
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

          {/* Main 2-Pane Cockpit Body: Recipe & Controls (Left), Expanded Live Telemetry & Full-Room Views (Right) */}
          <main className="flex-1 w-full min-h-0 flex items-stretch overflow-hidden">
            {/* Left Pane: 4 Dedicated Tabs (Coffee, Steam, Water, Maintenance) */}
            <LeftMenuPane
              activeTab={activeTab}
              onTabChange={(tab) => {
                setActiveTab(tab);
                setMainPaneView("graph");
              }}
              coffeeConfig={coffeeConfig}
              onCoffeeConfigChange={handleCoffeeConfigChange}
              steamConfig={steamConfig}
              onSteamConfigChange={handleSteamConfigChange}
              waterConfig={waterConfig}
              onWaterConfigChange={setWaterConfig}
              maintenanceConfig={maintenanceConfig}
              onMaintenanceConfigChange={setMaintenanceConfig}
              activeBean={activeBean}
              activeProfileTitle={activeProfileTitle}
              onOpenBeanDrawer={() => setMainPaneView((v) => (v === "beans" ? "graph" : "beans"))}
              onOpenProfileDrawer={() => setMainPaneView((v) => (v === "profiles" ? "graph" : "profiles"))}
              onOpenHistory={() => setMainPaneView((v) => (v === "history" ? "graph" : "history"))}
              onOpenSettings={() => handleOpenSettingsWithTab("appearance")}
              onTriggerFlush={() => decaid.startFlush()}
              activeEquipment={activeEquipment}
              onOpenEquipmentSelection={() => setMainPaneView((v) => (v === "equipment" ? "graph" : "equipment"))}
              onOpenSettingsEquipment={() => handleOpenSettingsWithTab("equipment")}
              activeSection={mainPaneView}
            />

            {/* Main Content Area: Seamlessly switches between Telemetry Graph and Full-Room Data Views (Beans, Profiles, Equipment, History) */}
            <div className="flex-1 min-w-0 h-full p-2 lg:p-3 overflow-hidden flex flex-col min-h-0">
              {mainPaneView === "graph" && (
                <CenterStatusPane
                  machine={machine}
                  lastShotSummary={lastShotSummary}
                  lastShotBean={lastShotBean}
                  lastShotProfileTitle={lastShotProfileTitle}
                  lastShotHistory={completedShotHistory}
                  onOpenSummaryModal={() => setShowSummaryModal(true)}
                />
              )}

              {mainPaneView === "beans" && (
                <BeanDrawer
                  isOpen={true}
                  embedded={true}
                  onClose={() => setMainPaneView("graph")}
                  beans={beans}
                  activeBeanId={activeBean?.id}
                  onSelectBean={(selected) => {
                    setActiveBean(selected);
                    try {
                      localStorage.setItem("pantarhei_active_bean_id", selected.id);
                    } catch {}

                    // Automatically load bean's preferred profile and communicate to Decaid
                    const customProfs = loadCustomProfilesFromStorage();
                    const targetProfId = selected.preferredProfileId || selected.preferredProfileTitle;
                    if (targetProfId) {
                      const matchedProf = customProfs.find(
                        (p) =>
                          p.id === targetProfId ||
                          p.title.toLowerCase() === targetProfId.toLowerCase()
                      );
                      if (matchedProf) {
                        setActiveProfileTitle(matchedProf.title);
                        setActiveProfile(matchedProf);
                        decaid.selectProfile(matchedProf, {
                          dose: selected.targetDose || coffeeConfig.dose,
                          targetYield: selected.targetYield || coffeeConfig.targetYield,
                          coffeeName: selected.name,
                          coffeeRoaster: selected.roaster,
                          grinderModel: activeEquipment?.grinder,
                          steamConfig,
                        });
                        setCoffeeConfig((prev) => ({
                          ...prev,
                          profileId: matchedProf.id || matchedProf.title,
                          targetYield: Number(matchedProf.target_weight) || prev.targetYield,
                          dose: Number(matchedProf.target_dose) || prev.dose,
                        }));
                      }
                    } else if (activeProfile) {
                      // Update Decaid workflow context with new bean metadata
                      decaid.selectProfile(activeProfile, {
                        dose: selected.targetDose || coffeeConfig.dose,
                        targetYield: selected.targetYield || coffeeConfig.targetYield,
                        coffeeName: selected.name,
                        coffeeRoaster: selected.roaster,
                        grinderModel: activeEquipment?.grinder,
                        steamConfig,
                      });
                    }
                    setMainPaneView("graph");
                  }}
                  onSaveBean={(newBean) => {
                    setBeans((prev) => {
                      const updated = [newBean, ...prev.filter((b) => b.id !== newBean.id)];
                      saveBeansToStorage(updated);
                      return updated;
                    });
                  }}
                />
              )}

              {mainPaneView === "profiles" && (
                <ProfileDrawer
                  isOpen={true}
                  embedded={true}
                  onClose={() => setMainPaneView("graph")}
                  activeProfileTitle={activeProfileTitle}
                  onSelectProfile={(p) => {
                    setActiveProfileTitle(p.title);
                    setActiveProfile(p);
                    const targetDose = Number(p.target_dose) || coffeeConfig.dose;
                    const targetYield = Number(p.target_weight) || coffeeConfig.targetYield;
                    decaid.selectProfile(p, {
                      dose: targetDose,
                      targetYield: targetYield,
                      coffeeName: activeBean?.name,
                      coffeeRoaster: activeBean?.roaster,
                      grinderModel: activeEquipment?.grinder,
                      steamConfig,
                    });
                    setCoffeeConfig((prev) => ({
                      ...prev,
                      profileId: p.id || p.title,
                      targetYield: targetYield || prev.targetYield,
                      dose: targetDose || prev.dose,
                    }));
                    try {
                      localStorage.setItem("pantarhei_active_profile_title", p.title);
                    } catch {}
                    setMainPaneView("graph");
                  }}
                  onSaveProfile={(p) => {
                    decaid.saveProfile(p).catch((e) => console.warn("[PantaRhei] Error saving profile to Decaid:", e));
                  }}
                />
              )}

              {mainPaneView === "equipment" && (
                <EquipmentSelectionModal
                  isOpen={true}
                  embedded={true}
                  onClose={() => setMainPaneView("graph")}
                  inventory={equipmentInventory}
                  selection={activeEquipment}
                  onSelectionChange={handleEquipmentSelectionChange}
                  onOpenSettingsEquipment={() => {
                    setMainPaneView("graph");
                    handleOpenSettingsWithTab("equipment");
                  }}
                />
              )}

              {mainPaneView === "history" && (
                <ShotHistoryDrawer
                  isOpen={true}
                  embedded={true}
                  onClose={() => setMainPaneView("graph")}
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
                    setMainPaneView("graph");
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
                    if (selectedShot.equipment) {
                      setActiveEquipment(selectedShot.equipment);
                      saveActiveEquipment(selectedShot.equipment);
                    }

                    // Communicate profile & shot recipe to Decaid
                    const customProfs = loadCustomProfilesFromStorage();
                    const matchedProf = customProfs.find(
                      (p) => p.title.toLowerCase() === selectedShot.profileTitle.toLowerCase()
                    );
                    if (matchedProf) {
                      setActiveProfile(matchedProf);
                      decaid.selectProfile(matchedProf, {
                        dose: selectedShot.actualDose,
                        targetYield: selectedShot.targetYield,
                        coffeeName: selectedShot.beanName,
                        coffeeRoaster: selectedShot.roaster,
                        grinderModel: selectedShot.equipment?.grinder,
                        grinderSetting: selectedShot.grindSetting,
                        steamConfig,
                      });
                    }
                    setMainPaneView("graph");
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
              )}
            </div>
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



      {/* Ambient Screensaver Overlay */}
      <ScreensaverOverlay
        config={screensaverConfig}
        isMachineActive={isMachineActive}
        onScreensaverActivate={handleScreensaverActivate}
        onScreensaverWake={handleScreensaverWake}
      />

      {/* Disconnected DE1 Startup Modal */}
      {isConnectModalOpen && (
        <ConnectMachineModal
          isOpen={isConnectModalOpen}
          onClose={handleCloseConnectModal}
          onContinueSimulator={handleCloseConnectModal}
          onImportData={handleImportMigratedData}
          existingShots={shots}
        />
      )}
    </div>
  );
}

export default App;
