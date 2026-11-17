import React, { useEffect, useRef } from "react";

interface FluidBackgroundProps {
  isExtractionActive: boolean;
  intensity?: number;
}

interface WaterDrop {
  x: number;
  y: number;
  vy: number;
  radius: number;
  alpha: number;
  targetY: number;
}

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

/**
 * Organic, interactive blue water wave and droplet fluid simulation.
 * Confined strictly to the middle and right panes (left of 380px) to keep the menu undisturbed.
 * Reacts naturally to touch and pointer movement, dropping water droplets and ripples.
 * Automatically pauses during active extraction to preserve 60fps graph performance.
 */
export const FluidBackground: React.FC<FluidBackgroundProps> = ({
  isExtractionActive,
  intensity = 0.65,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let step = 0;

    // Simulation entities
    const drops: WaterDrop[] = [];
    const ripples: Ripple[] = [];
    const touchPerturbations: { x: number; y: number; strength: number }[] = [];

    const resize = () => {
      // Confined to the middle and right panes (from 380px to full width)
      const leftOffset = 380;
      const w = Math.max(200, window.innerWidth - leftOffset);
      const h = window.innerHeight;
      canvas.width = w * window.devicePixelRatio;
      canvas.height = h * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    window.addEventListener("resize", resize);
    resize();

    // Spawn initial water droplets
    const spawnDrop = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = window.innerHeight;
      drops.push({
        x: Math.random() * (w - 40) + 20,
        y: -10,
        vy: 2.2 + Math.random() * 2.5,
        radius: 1.8 + Math.random() * 2.2,
        alpha: 0.6 + Math.random() * 0.3,
        targetY: h * (0.68 + Math.random() * 0.15),
      });
    };

    // Pointer move / touch listener to create ripples and wave disturbances
    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
        ripples.push({
          x,
          y,
          radius: 4,
          maxRadius: 45 + Math.random() * 25,
          alpha: 0.75,
        });

        touchPerturbations.push({
          x,
          y,
          strength: 1.0,
        });
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerdown", handlePointerMove);

    // Animation Loop
    let dropCooldown = 0;

    const render = () => {
      if (isExtractionActive) {
        return; // Pause during active extraction for 60fps graph guarantee
      }

      step += 0.015;
      dropCooldown++;

      const w = canvas.width / window.devicePixelRatio;
      const h = window.innerHeight;

      ctx.clearRect(0, 0, w, h);

      // Deep atmospheric dark slate / ocean base
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, "rgba(8, 11, 16, 0.95)");
      bgGrad.addColorStop(0.5, "rgba(10, 16, 26, 0.98)");
      bgGrad.addColorStop(1, "rgba(7, 18, 34, 1)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // 1. Render Fluid Waves (Vibrant Aquatic Blue / Cyan)
      const waveConfigs = [
        {
          color: "rgba(3, 105, 161, 0.28)", // Deep sky blue
          baseY: h * 0.78,
          amplitude: 30 * intensity,
          frequency: 0.003,
          speed: 1.0,
          phase: 0,
        },
        {
          color: "rgba(14, 165, 233, 0.35)", // Electric cyan blue
          baseY: h * 0.83,
          amplitude: 22 * intensity,
          frequency: 0.004,
          speed: -0.8,
          phase: 2.0,
        },
        {
          color: "rgba(56, 189, 248, 0.22)", // Bright sky cyan crest
          baseY: h * 0.88,
          amplitude: 16 * intensity,
          frequency: 0.005,
          speed: 1.4,
          phase: 4.0,
        },
      ];

      waveConfigs.forEach((cfg) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, cfg.baseY);

        for (let x = 0; x <= w; x += 15) {
          let waveY =
            cfg.baseY +
            Math.sin(x * cfg.frequency + step * cfg.speed + cfg.phase) * cfg.amplitude +
            Math.cos(x * (cfg.frequency * 0.6) - step * 0.5) * (cfg.amplitude * 0.4);

          // Add touch perturbation if near
          for (let pIdx = 0; pIdx < touchPerturbations.length; pIdx++) {
            const p = touchPerturbations[pIdx];
            const dist = Math.abs(x - p.x);
            if (dist < 120) {
              const impact = (1 - dist / 120) * 15 * p.strength;
              waveY += Math.sin(step * 6 + dist * 0.08) * impact;
            }
          }

          ctx.lineTo(x, waveY);
        }

        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = cfg.color;
        ctx.fill();
      });

      // Decay touch perturbations
      for (let i = touchPerturbations.length - 1; i >= 0; i--) {
        touchPerturbations[i].strength *= 0.94;
        if (touchPerturbations[i].strength < 0.05) {
          touchPerturbations.splice(i, 1);
        }
      }

      // 2. Spawn periodic water droplets
      if (dropCooldown > 80 && drops.length < 8) {
        spawnDrop();
        dropCooldown = 0;
      }

      // Update & Draw Droplets
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.y += d.vy;

        // Droplet tear shape
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${d.alpha * 0.8})`;
        ctx.shadowColor = "rgba(14, 165, 233, 0.7)";
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Droplet splash on wave surface
        if (d.y >= d.targetY) {
          ripples.push({
            x: d.x,
            y: d.targetY,
            radius: 2,
            maxRadius: 35 + Math.random() * 20,
            alpha: 0.8,
          });
          drops.splice(i, 1);
        }
      }

      // 3. Update & Draw Expanding Ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += 0.85;
        r.alpha *= 0.96;

        ctx.beginPath();
        // Slightly squished ellipse for 3D perspective
        ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.45, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(56, 189, 248, ${r.alpha * 0.6})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (r.radius >= r.maxRadius || r.alpha < 0.05) {
          ripples.splice(i, 1);
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    if (!isExtractionActive) {
      render();
    }

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerdown", handlePointerMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isExtractionActive, intensity]);

  return (
    <div
      ref={containerRef}
      className="absolute top-0 bottom-0 right-0 left-[390px] pointer-events-auto overflow-hidden -z-0"
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
