/**
 * PantaRhei Home Cafe Header Fit & Space Protection Service
 * Verifies that the centered customizable home cafe header fits within the allocated
 * top stripe (max 52px height) to prevent stealing vertical space from the left menu.
 */

import type { CafeHeaderConfig, HeaderFitResult } from "../types/header.ts";

export const DEFAULT_MAX_STRIPE_HEIGHT = 68; // Max px allocated for the top header stripe (allows bold, prominent title)
export const DEFAULT_MAX_ALLOWED_WIDTH = 1240; // Max px width (accounting for edge paddings)
export const MIN_READABLE_FONT_SIZE = 12; // Lower bound before declaring overflow/truncation

/**
 * Estimates text width using DOM Canvas if available, or calibrated character metrics in headless/Node.
 */
export function measureTextWidth(text: string, fontSize: number, letterSpacing = 0): number {
  if (!text || text.length === 0) return 0;

  if (typeof document !== "undefined") {
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.font = `${fontSize}px sans-serif`;
        const width = ctx.measureText(text).width;
        return width + Math.max(0, text.length - 1) * letterSpacing;
      }
    } catch {
      // Fallback if canvas is unavailable
    }
  }

  // Calibrated typographic metric table for proportional sans-serif fonts
  let totalWidth = 0;
  for (const char of text) {
    if (char === " ") {
      totalWidth += fontSize * 0.28;
    } else if (/[iljft1.,:;!'|]/.test(char)) {
      totalWidth += fontSize * 0.28;
    } else if (/[mwMW@#%&]/.test(char)) {
      totalWidth += fontSize * 0.78;
    } else if (/[A-Z]/.test(char)) {
      totalWidth += fontSize * 0.64;
    } else if (/[0-9]/.test(char)) {
      totalWidth += fontSize * 0.55;
    } else {
      // Standard lowercase letters
      totalWidth += fontSize * 0.50;
    }
  }

  // Add tracking (letter spacing)
  totalWidth += Math.max(0, text.length - 1) * letterSpacing;
  return Math.round(totalWidth * 10) / 10;
}

/**
 * Estimates rendered height including line-height and padding
 */
export function estimateTextHeight(fontSize: number, hasSubtitle: boolean, subtitleFontSize: number): number {
  const linePadding = 8; // Top (4px) + bottom (4px) padding
  const mainLineHeight = fontSize * 1.15;
  if (!hasSubtitle) {
    return Math.round(mainLineHeight + linePadding);
  }
  const subtitleLineHeight = subtitleFontSize * 1.15;
  const gap = 3; // Space between title and subtitle
  return Math.round(mainLineHeight + subtitleLineHeight + gap + linePadding);
}

/**
 * Calculates whether the home cafe title fits inside the top stripe,
 * auto-downscaling font size if necessary while clamping stripe height to protect the left menu.
 */
export function calculateHeaderFit(
  config: CafeHeaderConfig,
  constraints?: { maxWidth?: number; maxHeight?: number }
): HeaderFitResult {
  const maxAllowedWidth = constraints?.maxWidth ?? DEFAULT_MAX_ALLOWED_WIDTH;
  const maxAllowedHeight = constraints?.maxHeight ?? DEFAULT_MAX_STRIPE_HEIGHT;

  if (!config.enabled || !config.text.trim()) {
    return {
      fits: true,
      actualFontSize: config.fontSize,
      estimatedWidth: 0,
      estimatedHeight: 0,
      stripeHeight: 0,
      maxAllowedWidth,
      maxAllowedHeight,
      overflowX: false,
      overflowY: false,
      truncated: false,
    };
  }

  const titleText = config.text.trim();
  const hasSubtitle = Boolean(config.subtitleText && config.subtitleText.trim());
  const subtitleText = hasSubtitle ? config.subtitleText!.trim() : "";

  let currentFontSize = Math.max(8, config.fontSize);
  let subtitleFontSize = Math.max(8, Math.round(currentFontSize * 0.68));

  let textWidth = measureTextWidth(titleText, currentFontSize, config.letterSpacing);
  let subWidth = hasSubtitle ? measureTextWidth(subtitleText, subtitleFontSize, config.letterSpacing) : 0;
  let estimatedWidth = Math.max(textWidth, subWidth);
  let estimatedHeight = estimateTextHeight(currentFontSize, hasSubtitle, subtitleFontSize);

  let truncated = false;
  let warning: string | undefined = undefined;

  // Auto-scale down if text exceeds bounds
  while (
    (estimatedWidth > maxAllowedWidth || estimatedHeight > maxAllowedHeight) &&
    currentFontSize > MIN_READABLE_FONT_SIZE
  ) {
    currentFontSize -= 1;
    subtitleFontSize = Math.max(8, Math.round(currentFontSize * 0.68));
    textWidth = measureTextWidth(titleText, currentFontSize, config.letterSpacing);
    subWidth = hasSubtitle ? measureTextWidth(subtitleText, subtitleFontSize, config.letterSpacing) : 0;
    estimatedWidth = Math.max(textWidth, subWidth);
    estimatedHeight = estimateTextHeight(currentFontSize, hasSubtitle, subtitleFontSize);
  }

  // Check if it still overflows at minimum font size
  const overflowX = estimatedWidth > maxAllowedWidth;
  const overflowY = estimatedHeight > maxAllowedHeight;

  if (overflowX || overflowY) {
    truncated = true;
    const reasons: string[] = [];
    if (overflowX) reasons.push(`width ${Math.round(estimatedWidth)}px exceeds max ${maxAllowedWidth}px`);
    if (overflowY) reasons.push(`height ${Math.round(estimatedHeight)}px exceeds max ${maxAllowedHeight}px`);
    warning = `Cafe name is too long for the top stripe (${reasons.join(", ")}). Consider shortening it to prevent clipping.`;
  } else if (currentFontSize < config.fontSize) {
    warning = `Font size auto-scaled from ${config.fontSize}px to ${currentFontSize}px to fit the allocated ${maxAllowedHeight}px stripe.`;
  }

  // Clamped stripe height guarantees that the left menu always gets full remaining height
  const stripeHeight = Math.min(estimatedHeight, maxAllowedHeight);

  return {
    fits: !overflowX && !overflowY,
    actualFontSize: currentFontSize,
    estimatedWidth: Math.round(estimatedWidth),
    estimatedHeight: Math.round(estimatedHeight),
    stripeHeight,
    maxAllowedWidth,
    maxAllowedHeight,
    overflowX,
    overflowY,
    truncated,
    warning,
  };
}
