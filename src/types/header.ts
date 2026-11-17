/**
 * PantaRhei Customizable Home Cafe Header Types
 * Configuration and constraints for the centered title stripe in Ready / Idle mode.
 */

export interface CafeHeaderConfig {
  enabled: boolean;              // Toggle header visibility
  text: string;                  // Custom cafe name (e.g. "Caffè Panta Rhei", "The Workshop")
  fontFamily: string;            // Font family: "sans-serif" | "serif" | "monospace" | custom webfont
  fontSize: number;              // Target font size in px (e.g. 18px to 42px)
  color: string;                 // Hex or rgba color string (e.g. "#F8FAFC", "#F59E0B")
  letterSpacing: number;         // Tracking in px (e.g. 0 to 6px)
  subtitleText?: string;         // Optional tagline/subtitle (e.g. "Specialty Espresso Bar")
  subtitleColor?: string;        // Hex or rgba color for subtitle (e.g. "#94A3B8")
  maxHeight?: number;            // Custom stripe height limit (defaults to DEFAULT_MAX_STRIPE_HEIGHT)
}

export interface HeaderFitResult {
  fits: boolean;                 // True if title fits without clipping or overflow
  actualFontSize: number;        // Effective font size (auto-downscaled if needed)
  estimatedWidth: number;        // Total rendered text width in px
  estimatedHeight: number;       // Total rendered text height (including line-height & padding)
  stripeHeight: number;          // Allocated stripe height clamped to maxAllowedHeight
  maxAllowedWidth: number;       // Maximum available width (e.g. 1280px)
  maxAllowedHeight: number;      // Maximum allowed stripe height (e.g. 68px)
  overflowX: boolean;            // Indicates horizontal overflow beyond maxAllowedWidth
  overflowY: boolean;            // Indicates vertical overflow beyond maxAllowedHeight
  truncated: boolean;            // True if text had to be truncated or clamped at min font size
  warning?: string;              // Descriptive warning for the settings preview
}
