// Comprehensive Polyfills for Legacy WebView (Chromium 69 / Android 9)

// 1. globalThis polyfill
if (typeof globalThis === "undefined") {
  (window as any).globalThis = window;
}

// 2. CanvasRenderingContext2D.prototype.roundRect and Path2D.prototype.roundRect
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (
    this: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number | number[] = 0
  ) {
    let r = 0;
    if (typeof radii === "number") {
      r = radii;
    } else if (Array.isArray(radii) && radii.length > 0) {
      r = Number(radii[0]) || 0;
    }
    r = Math.min(Math.max(0, r), Math.abs(w) / 2, Math.abs(h) / 2);
    if (r <= 0) {
      this.rect(x, y, w, h);
      return this;
    }
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

if (typeof Path2D !== "undefined" && !Path2D.prototype.roundRect) {
  Path2D.prototype.roundRect = CanvasRenderingContext2D.prototype.roundRect as any;
}

// 3. Array.prototype.at
if (!Array.prototype.at) {
  Array.prototype.at = function (this: any[], n: number) {
    n = Math.trunc(n) || 0;
    if (n < 0) n += this.length;
    if (n < 0 || n >= this.length) return undefined;
    return this[n];
  };
}

// 4. String.prototype.replaceAll
if (!String.prototype.replaceAll) {
  String.prototype.replaceAll = function (this: string, search: any, replace: any) {
    if (search instanceof RegExp) {
      return this.replace(search, replace);
    }
    return this.split(search).join(replace);
  };
}

// 5. Promise.allSettled
if (!Promise.allSettled) {
  (Promise as any).allSettled = function (promises: Iterable<any>) {
    return Promise.all(
      Array.from(promises).map((p) =>
        Promise.resolve(p).then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason) => ({ status: "rejected" as const, reason })
        )
      )
    );
  };
}

// 6. structuredClone fallback
if (typeof (window as any).structuredClone === "undefined") {
  (window as any).structuredClone = (val: any) => {
    if (val === undefined) return undefined;
    return JSON.parse(JSON.stringify(val));
  };
}

export {};
