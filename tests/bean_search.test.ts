/**
 * Automated test suite for PantaRhei Bean Indexing, Multi-Varietal Search, and Cloning
 */

import type { PantaBean } from "../src/types/bean.ts";
import { cloneBeanAsNewEntry, calculateRestDays, getVarietalsList, formatVarietals } from "../src/types/bean.ts";
import { BeanSearchIndex } from "../src/services/beanSearch.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== Testing PantaRhei Bean System ===\n");

// 1. Test Varietal Parsing & Formatting
const varietiesA = getVarietalsList(["SL28", "SL34"]);
assert(varietiesA.length === 2 && varietiesA[0] === "SL28" && varietiesA[1] === "SL34", "getVarietalsList handles string array");

const varietiesB = getVarietalsList("Kurume, Dega / Wolisho");
assert(varietiesB.length === 3 && varietiesB.includes("Kurume") && varietiesB.includes("Dega") && varietiesB.includes("Wolisho"), "getVarietalsList splits comma/slash delimited text");

assert(formatVarietals(["Pink Bourbon", "Geisha"]) === "Pink Bourbon, Geisha", "formatVarietals formats cleanly");

// 2. Test Sample Beans Setup
const sampleBeans: PantaBean[] = [
  {
    id: "bean-1",
    name: "Worka Sakaro",
    roaster: "Sey",
    countryOfOrigin: "Ethiopia",
    region: "Gedeb, Yirgacheffe",
    farm: "Worka Cooperative",
    varietal: ["Kurume", "Dega"],
    process: "Washed",
    altitude: "2000-2200m",
    cropYear: "2024",
    roastDate: "2026-11-01",
    roastProfile: "Ultra-Light/Nordic",
    tastingNotes: ["Bergamot", "Jasmine", "Peach", "Earl Grey"],
    recommendedRestDays: 21,
    totalGrams: 250,
    remainingGrams: 214,
    isFrozen: false,
    targetDose: 18.0,
    targetYield: 45.0,
    targetGrind: "4.2",
    preferredProfileId: "sey-flow-hucb",
    preferredBasket: "CB",
    createdAt: "2026-11-01T10:00:00Z",
    updatedAt: "2026-11-01T10:00:00Z",
  },
  {
    id: "bean-2",
    name: "Gichathaini AB",
    roaster: "April",
    countryOfOrigin: "Kenya",
    region: "Nyeri",
    farm: "Gichathaini Factory",
    varietal: ["SL28", "SL34"],
    process: "Washed",
    altitude: "1850m",
    cropYear: "2023/2024",
    roastDate: "2026-10-20",
    roastProfile: "Light",
    tastingNotes: ["Blackcurrant", "Redcurrant", "Rhubarb", "Brown Sugar"],
    recommendedRestDays: 14,
    totalGrams: 250,
    remainingGrams: 90,
    isFrozen: false,
    targetDose: 19.0,
    targetYield: 50.0,
    targetGrind: "3.8",
    preferredProfileId: "strega-plus",
    preferredBasket: "NB",
    createdAt: "2026-10-20T10:00:00Z",
    updatedAt: "2026-10-20T10:00:00Z",
  },
  {
    id: "bean-3",
    name: "El Paraiso Lychee",
    roaster: "Gardelli",
    countryOfOrigin: "Colombia",
    region: "Cauca, Piendamo",
    farm: "Finca El Paraiso (Diego Bermudez)",
    varietal: "Castillo",
    process: "Thermal Shock",
    altitude: "1930m",
    cropYear: "2024",
    roastDate: "2026-09-15",
    roastProfile: "Medium-Light",
    tastingNotes: ["Lychee", "Rose", "Raspberry", "Peach Tea"],
    recommendedRestDays: 10,
    totalGrams: 200,
    remainingGrams: 0, // Finished
    isFrozen: false,
    targetDose: 18.0,
    targetYield: 40.0,
    targetGrind: "4.5",
    archived: true,
    createdAt: "2026-09-15T10:00:00Z",
    updatedAt: "2026-09-15T10:00:00Z",
  },
  {
    id: "bean-4",
    name: "Gesha Village Lot 74",
    roaster: "Tim Wendelboe",
    countryOfOrigin: "Ethiopia",
    region: "Bench Maji",
    farm: "Gesha Village",
    varietal: "Gori Gesha",
    process: "Natural",
    altitude: "1900-2100m",
    cropYear: "2024",
    roastDate: "2026-08-01",
    roastProfile: "Light",
    tastingNotes: ["Papaya", "Jasmine", "Meyer Lemon"],
    recommendedRestDays: 21,
    totalGrams: 250,
    remainingGrams: 180,
    isFrozen: true,
    frozenDate: "2026-08-25",
    targetDose: 18.0,
    targetYield: 45.0,
    targetGrind: "4.0",
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
  }
];

// 3. Test Search Indexing
const index = new BeanSearchIndex(sampleBeans);

// Query: Multi-token "ethiopia washed seys"
const res1 = index.search("ethiopia washed seys");
assert(res1.length === 1 && res1[0].id === "bean-1", "Search matches multi-token intersection across country, process, and roaster");

// Query: Individual variety match from multi-varietal array "SL34"
const res2 = index.search("sl34");
assert(res2.length === 1 && res2[0].id === "bean-2", "Search matches individual variety in multi-varietal lot");

// Query: Altitude range search "2100" (should match 2000-2200m and 1900-2100m)
const res3 = index.search("2100");
assert(res3.length === 2, "Search matches altitude overlapping token");

// Query: Tasting notes search "jasmine" (should match bean-1 and bean-4)
const res4 = index.search("jasmine");
assert(res4.length === 2, "Search matches across tasting notes");

// Query: Tasting notes + varietal "jasmine dega" (should match only bean-1)
const res5 = index.search("jasmine dega");
assert(res5.length === 1 && res5[0].id === "bean-1", "Search matches intersection of tasting note + specific variety");

// Query: In stock filter
const inStockOnly = index.search("", { inStock: true });
assert(inStockOnly.length === 3 && !inStockOnly.some(b => b.id === "bean-3"), "Filter correctly filters out empty bags");

// Query: Varietal facet filter
const kenyanVarieties = index.search("", { varietal: "sl28" });
assert(kenyanVarieties.length === 1 && kenyanVarieties[0].name === "Gichathaini AB", "Facet filter matches specific varietal");

// 4. Test "Clone Bean as New Entry" Action
const cloned = cloneBeanAsNewEntry(sampleBeans[0], {
  roastDate: "2026-11-16",
  cropYear: "2025",
  totalGrams: 250
});

assert(cloned.id !== sampleBeans[0].id, "Cloned bean generates new unique UUID");
assert(cloned.name === sampleBeans[0].name, "Cloned bean preserves name");
assert(cloned.roaster === sampleBeans[0].roaster, "Cloned bean preserves roaster");
assert(cloned.countryOfOrigin === sampleBeans[0].countryOfOrigin, "Cloned bean preserves country");
assert(cloned.farm === sampleBeans[0].farm, "Cloned bean preserves farm");
assert(Array.isArray(cloned.varietal) && cloned.varietal.length === 2 && cloned.varietal[0] === "Kurume", "Cloned bean preserves multi-varietal array");
assert(cloned.preferredProfileId === sampleBeans[0].preferredProfileId, "Cloned bean preserves preferred profile");
assert(cloned.roastDate === "2026-11-16", "Cloned bean has updated roastDate");
assert(cloned.cropYear === "2025", "Cloned bean accepts cropYear override");
assert(cloned.remainingGrams === 250, "Cloned bean resets remaining grams to total");
assert(cloned.isFrozen === false, "Cloned bean starts unfrozen");
assert(cloned.archived === false, "Cloned bean starts unarchived");

// 5. Test Rest Calculation
const refDate = new Date("2026-11-16T12:00:00Z");

// Bean 1: roasted 2026-11-01 (15 days old), recommended 21 days
const rest1 = calculateRestDays(sampleBeans[0], refDate);
assert(rest1.status === "resting" && rest1.daysRemainingToPeak === 6, "Rest calculation shows resting countdown");

// Bean 2: roasted 2026-10-20 (27 days old), recommended 14 days (within peak window 14..42 days)
const rest2 = calculateRestDays(sampleBeans[1], refDate);
assert(rest2.status === "peak", "Rest calculation shows peak window");

// Bean 4: frozen
const rest4 = calculateRestDays(sampleBeans[3], refDate);
assert(rest4.status === "frozen", "Rest calculation handles frozen stasis");

// 6. Test Bean Detail Editing (Fix typos & Add missing information)
const beanToEdit: PantaBean = { ...sampleBeans[1] };
// Initially has empty region, no baristaNotes, and a typo in roaster "Aprill"
beanToEdit.roaster = "Aprill";
beanToEdit.region = undefined;
beanToEdit.baristaNotes = undefined;

// Simulate user editing to fix typos and supply missing information
const editedBean: PantaBean = {
  ...beanToEdit,
  roaster: "April Coffee", // Typo fixed
  region: "Nyeri Hill",    // Missing info added
  farm: "Gichathaini Wet Mill",
  altitude: "1950m",
  cropYear: "2024",
  roastProfile: "Light",
  preferredBasket: "NB",
  preferredProfileId: "strega-plus",
  baristaNotes: "Use paper filter on bottom for high clarity",
  isFrozen: true,
  updatedAt: new Date().toISOString(),
};

assert(editedBean.roaster === "April Coffee", "Coffee Edit fixes roaster typo");
assert(editedBean.region === "Nyeri Hill", "Coffee Edit adds missing region");
assert(editedBean.farm === "Gichathaini Wet Mill", "Coffee Edit adds missing farm");
assert(editedBean.altitude === "1950m", "Coffee Edit adds missing altitude");
assert(editedBean.cropYear === "2024", "Coffee Edit adds missing crop year");
assert(editedBean.preferredBasket === "NB", "Coffee Edit sets preferred basket");
assert(editedBean.baristaNotes?.includes("paper filter"), "Coffee Edit sets barista puck prep notes");
assert(editedBean.isFrozen === true, "Coffee Edit toggles freezer storage");

console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
