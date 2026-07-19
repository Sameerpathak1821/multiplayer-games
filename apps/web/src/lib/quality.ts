/**
 * Graphics quality: decide whether the 3D experience runs at all, and at
 * what fidelity. The rule: 3D is a delight layer — never a requirement.
 */

export type GfxPref = "3d" | "2d";

const PREF_KEY = "gamehub.gfx";

/** Hard gates: reduced-motion users and devices without WebGL never get 3D. */
export function systemAllows3D(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function getGfxPref(): GfxPref {
  if (!systemAllows3D()) return "2d";
  const stored = localStorage.getItem(PREF_KEY);
  return stored === "2d" ? "2d" : "3d";
}

export function setGfxPref(pref: GfxPref): void {
  localStorage.setItem(PREF_KEY, pref);
}

/** Touch-first device? Drives on-screen game controls and hint text. */
export function isCoarsePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}

/** Rough device tier for resolution scaling. */
export function deviceTier(): "high" | "low" {
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) return "low";
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return "low";
  return "high";
}

/** Max device-pixel-ratio the canvas should render at. */
export function maxDpr(): number {
  return deviceTier() === "high" ? Math.min(window.devicePixelRatio, 2) : 1.25;
}
