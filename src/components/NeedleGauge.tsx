import React from "react";

interface NeedleGaugeProps {
  value: number;
  max: number;
  step: number;
  unit: string;
  title: string;
  color: string;
  subValue?: string;
  targetValue?: number;
}

/**
 * Automotive-style motorsport needle dial gauge.
 * Features fixed radial numbers, tick marks, a center metallic pivot hub,
 * and a sweeping needle moving from its base at the center/bottom like a car dashboard tachometer.
 * Sweep: 270 degrees clockwise starting at 7:30 o'clock (135°) to 4:30 o'clock (405° / 45°).
 */
export const NeedleGauge: React.FC<NeedleGaugeProps> = ({
  value,
  max,
  step,
  unit,
  title,
  color,
  subValue,
  targetValue,
}) => {
  const size = 160;
  const cx = 80;
  const cy = 80;
  const radius = 58;
  const startAngle = 135; // 7:30 o'clock (bottom-left)
  const totalSweep = 270; // 270 degree clockwise arc over the top (12 o'clock at 270°)
  const endAngle = startAngle + totalSweep; // 405° (45°, bottom-right)

  const safeVal = typeof value === "number" && !isNaN(value) ? value : 0;
  const clampedVal = Math.min(max, Math.max(0, safeVal));
  const fraction = max > 0 ? clampedVal / max : 0;
  const needleAngle = startAngle + fraction * totalSweep;

  // Background track start & end coordinates
  const trackStartX = cx + radius * Math.cos((startAngle * Math.PI) / 180);
  const trackStartY = cy + radius * Math.sin((startAngle * Math.PI) / 180);
  const trackEndX = cx + radius * Math.cos((endAngle * Math.PI) / 180);
  const trackEndY = cy + radius * Math.sin((endAngle * Math.PI) / 180);

  // Active progress coordinates
  const progressAngle = needleAngle;
  const progressX = cx + radius * Math.cos((progressAngle * Math.PI) / 180);
  const progressY = cy + radius * Math.sin((progressAngle * Math.PI) / 180);
  const isLargeProgressArc = fraction * totalSweep > 180 ? 1 : 0;

  // Target marker angle
  const targetAngle =
    targetValue !== undefined && targetValue > 0
      ? startAngle + Math.min(1, targetValue / max) * totalSweep
      : undefined;

  // Fixed tick marks and numbers around the dial
  const ticks = [];
  const numSteps = Math.round(max / step);
  for (let i = 0; i <= numSteps; i++) {
    const val = i * step;
    const angleDeg = startAngle + (val / max) * totalSweep;
    const angleRad = (angleDeg * Math.PI) / 180;

    const isMajor =
      i === 0 ||
      i === numSteps ||
      (max === 9 ? i % 3 === 0 : i % 2 === 0) ||
      step >= 2;
    const tickLen = isMajor ? 9 : 5;

    // Outer tick position
    const x1 = cx + (radius - 1) * Math.cos(angleRad);
    const y1 = cy + (radius - 1) * Math.sin(angleRad);
    const x2 = cx + (radius - 1 - tickLen) * Math.cos(angleRad);
    const y2 = cy + (radius - 1 - tickLen) * Math.sin(angleRad);

    // Number position
    const textRadius = radius - 17;
    const tx = cx + textRadius * Math.cos(angleRad);
    const ty = cy + textRadius * Math.sin(angleRad);

    ticks.push({
      val,
      x1,
      y1,
      x2,
      y2,
      tx,
      ty,
      isMajor,
    });
  }

  return (
    <div className="flex flex-col items-center justify-center p-3 rounded-2xl bg-decent-surface/85 border border-decent-border/60 shadow-xl select-none relative">
      <span
        className="text-[11px] font-bold tracking-widest uppercase mb-0.5"
        style={{ color }}
      >
        {title}
      </span>

      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg
          className="w-full h-full overflow-visible"
          viewBox={`0 0 ${size} ${size}`}
        >
          {/* Subtle Dial Face Background */}
          <circle
            cx={cx}
            cy={cy}
            r={radius + 8}
            fill="rgba(10, 12, 16, 0.85)"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="1.5"
          />

          {/* Background Track Arc (270° clockwise from bottom-left to bottom-right) */}
          <path
            d={`M ${trackStartX} ${trackStartY} A ${radius} ${radius} 0 1 1 ${trackEndX} ${trackEndY}`}
            fill="none"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />

          {/* Target Value Tick/Marker */}
          {targetAngle !== undefined && (
            <line
              x1={cx + (radius + 2) * Math.cos((targetAngle * Math.PI) / 180)}
              y1={cy + (radius + 2) * Math.sin((targetAngle * Math.PI) / 180)}
              x2={cx + (radius - 8) * Math.cos((targetAngle * Math.PI) / 180)}
              y2={cy + (radius - 8) * Math.sin((targetAngle * Math.PI) / 180)}
              stroke="#fbbf24"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="2 2"
            />
          )}

          {/* Colored Value Progress Arc */}
          {fraction > 0.01 && (
            <path
              d={`M ${trackStartX} ${trackStartY} A ${radius} ${radius} 0 ${isLargeProgressArc} 1 ${progressX} ${progressY}`}
              fill="none"
              stroke={color}
              strokeWidth="4"
              strokeLinecap="round"
              className="transition-all duration-75"
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />
          )}

          {/* Fixed Ticks & Dashboard Numbers */}
          {ticks.map((t) => (
            <g key={t.val}>
              <line
                x1={t.x1}
                y1={t.y1}
                x2={t.x2}
                y2={t.y2}
                stroke="rgba(255, 255, 255, 0.5)"
                strokeWidth={t.isMajor ? "1.8" : "1"}
              />
              <text
                x={t.tx}
                y={t.ty}
                textAnchor="middle"
                dominantBaseline="central"
                fill="rgba(255, 255, 255, 0.75)"
                fontSize="9.5"
                fontFamily="ui-monospace, monospace"
                fontWeight="bold"
              >
                {t.val}
              </text>
            </g>
          ))}

          {/* Sweeping Needle (Motorsport Pointer) */}
          <g
            style={{
              transform: `rotate(${needleAngle}deg)`,
              transformOrigin: `${cx}px ${cy}px`,
              transition: "transform 100ms cubic-bezier(0.1, 0.9, 0.2, 1.0)",
            }}
          >
            {/* Needle Counterweight (opposite tail) */}
            <line
              x1={cx}
              y1={cy}
              x2={cx - 12}
              y2={cy}
              stroke="#64748b"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Needle Shaft */}
            <line
              x1={cx}
              y1={cy}
              x2={cx + (radius - 4)}
              y2={cy}
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 5px ${color})`,
              }}
            />
            {/* Needle Tip Arrowhead */}
            <polygon
              points={`${cx + (radius - 2)},${cy} ${cx + (radius - 9)},${cy - 3} ${
                cx + (radius - 9)
              },${cy + 3}`}
              fill="#ffffff"
            />
          </g>

          {/* Metallic Center Pivot Hub Boss */}
          <circle
            cx={cx}
            cy={cy}
            r="9"
            fill="#1e2229"
            stroke="#475569"
            strokeWidth="2.5"
            style={{ filter: "drop-shadow(0 2px 5px rgba(0,0,0,0.8))" }}
          />
          <circle cx={cx} cy={cy} r="4" fill={color} />
        </svg>

        {/* Digital Numeric Readout in Open Bottom Gap */}
        <div className="absolute bottom-2 flex flex-col items-center">
          <div className="font-mono text-2xl font-black text-white leading-none tracking-tight">
            {safeVal.toFixed(1)}
          </div>
          <span className="text-[10px] font-mono text-decent-muted leading-none mt-0.5">
            {unit}
          </span>
        </div>
      </div>

      {subValue && (
        <span className="text-[11px] font-mono text-cyan-400 mt-1 font-medium">
          {subValue}
        </span>
      )}
    </div>
  );
};
