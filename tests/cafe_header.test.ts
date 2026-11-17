/**
 * Automated test suite for PantaRhei Customizable Home Cafe Header
 * Verifies that the top header stripe fits the custom title, auto-scales when needed,
 * and strictly respects the 52px maximum height to protect left menu space.
 */

import type { CafeHeaderConfig } from "../src/types/header.ts";
import { calculateHeaderFit, DEFAULT_MAX_STRIPE_HEIGHT } from "../src/services/headerFit.ts";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

console.log("=== Testing PantaRhei Home Cafe Header Fit & Space Protection ===\n");

// 1. Standard Title Test
const standardConfig: CafeHeaderConfig = {
  enabled: true,
  text: "Caffè Panta Rhei",
  fontFamily: "sans-serif",
  fontSize: 22,
  color: "#F8FAFC",
  letterSpacing: 2,
};

const res1 = calculateHeaderFit(standardConfig);
assert(res1.fits === true, "Standard cafe name fits comfortably");
assert(res1.stripeHeight <= DEFAULT_MAX_STRIPE_HEIGHT, `Stripe height (${res1.stripeHeight}px) <= ${DEFAULT_MAX_STRIPE_HEIGHT}px`);
assert(res1.overflowX === false && res1.overflowY === false, "No horizontal or vertical overflow");

// 2. Title with Subtitle Test
const subtitleConfig: CafeHeaderConfig = {
  enabled: true,
  text: "The Workshop",
  fontFamily: "sans-serif",
  fontSize: 20,
  color: "#F59E0B",
  letterSpacing: 1,
  subtitleText: "Specialty Espresso Bar",
};

const res2 = calculateHeaderFit(subtitleConfig);
assert(res2.fits === true, "Title with subtitle fits within bounds");
assert(res2.stripeHeight <= DEFAULT_MAX_STRIPE_HEIGHT, `Title + Subtitle stripe height (${res2.stripeHeight}px) <= ${DEFAULT_MAX_STRIPE_HEIGHT}px`);

// 3. Oversized Font Auto-Scaling Test (User set 60px font, height ~81px exceeds 68px limit)
const largeFontConfig: CafeHeaderConfig = {
  enabled: true,
  text: "Idan's Strega & Flow Profiling Lab",
  fontFamily: "sans-serif",
  fontSize: 60, // Exceeds 68px max stripe height
  color: "#38BDF8",
  letterSpacing: 2,
};

const res3 = calculateHeaderFit(largeFontConfig);
assert(res3.fits === true, "Auto-scaling adjusts font to fit within constraints");
assert(res3.actualFontSize < 60, `Font was safely auto-downscaled from 60px to ${res3.actualFontSize}px`);
assert(res3.stripeHeight <= DEFAULT_MAX_STRIPE_HEIGHT, `Auto-scaled stripe height (${res3.stripeHeight}px) never exceeds ${DEFAULT_MAX_STRIPE_HEIGHT}px`);
assert(res3.warning !== undefined, "User warning is generated informing about auto-scaling");

// 4. Extreme Overflow Detection (Absurdly long title)
const extremeLongConfig: CafeHeaderConfig = {
  enabled: true,
  text: "The Ultra Scientific Specialty Coffee Laboratory and Micro-Roasting Atelier of the Northern Galilee High Plateau Established in 2024 for Decent Espresso Profile Experimentation",
  fontFamily: "sans-serif",
  fontSize: 24,
  color: "#FFFFFF",
  letterSpacing: 3,
};

const res4 = calculateHeaderFit(extremeLongConfig);
assert(res4.fits === false, "Extreme text triggers fits = false");
assert(res4.overflowX === true || res4.truncated === true, "Flags horizontal overflow / truncation");
assert(res4.stripeHeight <= DEFAULT_MAX_STRIPE_HEIGHT, `Even with extreme overflow, stripe height (${res4.stripeHeight}px) is strictly clamped <= ${DEFAULT_MAX_STRIPE_HEIGHT}px`);
assert(res4.warning !== undefined && res4.warning.includes("too long"), "Provides clear warning to shorten cafe name");

// 5. Left Menu Vertical Space Guarantee Test
// Screen height is 800px. Left menu needs at least 740px to display all next shot controls without scrolling.
const menuAvailableHeight = 800 - res1.stripeHeight;
assert(menuAvailableHeight >= 748, `Guaranteed vertical height for left menu (${menuAvailableHeight}px) >= 748px (eliminating scroll)`);

// 6. Disabled Header Test
const disabledConfig: CafeHeaderConfig = {
  ...standardConfig,
  enabled: false,
};

const resDisabled = calculateHeaderFit(disabledConfig);
assert(resDisabled.stripeHeight === 0, "Disabled header consumes 0px stripe height");
assert(resDisabled.fits === true, "Disabled header always fits");

console.log("\n🎉 ALL CAFE HEADER FIT TESTS PASSED SUCCESSFULLY!");
