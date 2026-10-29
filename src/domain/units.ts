/**
 * Unit discipline. Engineering computation happens in SI base units; every
 * boundary (API, export, UI) converts explicitly. No untyped numbers in domain
 * code: values carry their unit in the name and in the returned `unit` field.
 */

export const UNIT_CATALOG = {
  lengthM: { symbol: "m", si: 1 },
  areaM2: { symbol: "m²", si: 1 },
  lengthMm: { symbol: "mm", si: 0.001 },
  lengthCm: { symbol: "cm", si: 0.01 },
  volumeL: { symbol: "L", si: 0.001 },
  massKg: { symbol: "kg", si: 1 },
  forceKN: { symbol: "kN", si: 1000 },
  stressMPa: { symbol: "MPa", si: 1e6 },
  pressureKPa: { symbol: "kPa", si: 1000 },
  powerKW: { symbol: "kW", si: 1000 },
  angleDeg: { symbol: "°", si: 1 },
  flowM3h: { symbol: "m³/h", si: 1 / 3600 },
} as const;

export type UnitKey = keyof typeof UNIT_CATALOG;

export function toSI(value: number, unit: UnitKey): number {
  return value * UNIT_CATALOG[unit].si;
}

export function fromSI(valueSI: number, unit: UnitKey): number {
  return valueSI / UNIT_CATALOG[unit].si;
}

export function convert(value: number, from: UnitKey, to: UnitKey): number {
  return fromSI(toSI(value, from), to);
}

export function formatArea(m2: number): string {
  return `${m2.toLocaleString("fa-IR", { maximumFractionDigits: 1 })} m²`;
}

export function formatNumber(n: number, digits = 2): string {
  return n.toLocaleString("fa-IR", { maximumFractionDigits: digits });
}

export function formatMeters(m: number, digits = 2): string {
  return `${formatNumber(m, digits)} m`;
}

/** Nearest standard rolled section / pipe diameter from a computed minimum. */
export function nextStandard(value: number, table: number[]): number {
  const sorted = [...table].sort((a, b) => a - b);
  return sorted.find((v) => v >= value) ?? sorted[sorted.length - 1];
}

export const PIPE_DIAMETERS_MM = [25, 32, 40, 50, 63, 75, 90, 110, 125, 160, 200, 250, 315];

export const TRANSFORMER_SIZES_KVA = [100, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600];
