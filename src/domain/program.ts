import type { DwellingType, RoomKind } from "./types";

export interface RoomTarget {
  kind: RoomKind;
  label: string;
  ratio: number;
  minAreaM2: number;
  habitable: boolean;
  /** Preferred position in the depth stack: 0 = facade side, 1 = access side. */
  zone: "facade" | "middle" | "access" | "any";
}

/**
 * Room programme ratios are *net* area fractions of a dwelling. Minimum areas
 * follow the residential design thresholds used in the rule registry
 * (مبحث ۴ + رویه متداول مسکن) and are shown to the user as assumptions.
 */
export const ROOM_PROGRAMS: Record<DwellingType, RoomTarget[]> = {
  studio: [
    { kind: "living", label: "نشیمن/خواب", ratio: 0.36, minAreaM2: 12, habitable: true, zone: "facade" },
    { kind: "kitchen", label: "آشپزخانه", ratio: 0.16, minAreaM2: 5.5, habitable: false, zone: "facade" },
    { kind: "bath", label: "حمام", ratio: 0.1, minAreaM2: 2.5, habitable: false, zone: "access" },
    { kind: "wc", label: "سرویس", ratio: 0.06, minAreaM2: 1.5, habitable: false, zone: "access" },
    { kind: "entry", label: "ورودی/راهرو", ratio: 0.2, minAreaM2: 3.5, habitable: false, zone: "access" },
    { kind: "storage", label: "انباری", ratio: 0.07, minAreaM2: 1.5, habitable: false, zone: "access" },
    { kind: "balcony", label: "بالکن", ratio: 0.09, minAreaM2: 2, habitable: false, zone: "facade" },
  ],
  twoBed: [
    { kind: "living", label: "نشیمن", ratio: 0.26, minAreaM2: 12, habitable: true, zone: "facade" },
    { kind: "masterBedroom", label: "اتاق خواب مستر", ratio: 0.15, minAreaM2: 11, habitable: true, zone: "facade" },
    { kind: "bedroom", label: "اتاق خواب ۲", ratio: 0.12, minAreaM2: 9, habitable: true, zone: "facade" },
    { kind: "kitchen", label: "آشپزخانه", ratio: 0.11, minAreaM2: 5.5, habitable: false, zone: "middle" },
    { kind: "bath", label: "حمام", ratio: 0.055, minAreaM2: 2.5, habitable: false, zone: "access" },
    { kind: "wc", label: "سرویس", ratio: 0.035, minAreaM2: 1.5, habitable: false, zone: "access" },
    { kind: "entry", label: "ورودی/راهرو", ratio: 0.16, minAreaM2: 3.5, habitable: false, zone: "access" },
    { kind: "storage", label: "انباری", ratio: 0.04, minAreaM2: 1.5, habitable: false, zone: "access" },
    { kind: "balcony", label: "بالکن", ratio: 0.06, minAreaM2: 2, habitable: false, zone: "facade" },
  ],
  threeBed: [
    { kind: "living", label: "نشیمن", ratio: 0.24, minAreaM2: 14, habitable: true, zone: "facade" },
    { kind: "masterBedroom", label: "اتاق خواب مستر", ratio: 0.14, minAreaM2: 12, habitable: true, zone: "facade" },
    { kind: "bedroom", label: "اتاق خواب ۲", ratio: 0.11, minAreaM2: 9, habitable: true, zone: "facade" },
    { kind: "bedroom", label: "اتاق خواب ۳", ratio: 0.09, minAreaM2: 9, habitable: true, zone: "facade" },
    { kind: "kitchen", label: "آشپزخانه", ratio: 0.1, minAreaM2: 6, habitable: false, zone: "middle" },
    { kind: "bath", label: "حمام", ratio: 0.055, minAreaM2: 2.5, habitable: false, zone: "access" },
    { kind: "wc", label: "سرویس", ratio: 0.035, minAreaM2: 1.5, habitable: false, zone: "access" },
    { kind: "entry", label: "ورودی/راهرو", ratio: 0.15, minAreaM2: 4, habitable: false, zone: "access" },
    { kind: "storage", label: "انباری", ratio: 0.035, minAreaM2: 1.5, habitable: false, zone: "access" },
    { kind: "balcony", label: "بالکن", ratio: 0.045, minAreaM2: 2, habitable: false, zone: "facade" },
  ],
  fourBed: [
    { kind: "living", label: "نشیمن", ratio: 0.23, minAreaM2: 16, habitable: true, zone: "facade" },
    { kind: "masterBedroom", label: "اتاق خواب مستر", ratio: 0.14, minAreaM2: 13, habitable: true, zone: "facade" },
    { kind: "bedroom", label: "اتاق خواب ۲", ratio: 0.1, minAreaM2: 9, habitable: true, zone: "facade" },
    { kind: "bedroom", label: "اتاق خواب ۳", ratio: 0.09, minAreaM2: 9, habitable: true, zone: "facade" },
    { kind: "bedroom", label: "اتاق خواب ۴", ratio: 0.08, minAreaM2: 9, habitable: true, zone: "facade" },
    { kind: "kitchen", label: "آشپزخانه", ratio: 0.1, minAreaM2: 7, habitable: false, zone: "middle" },
    { kind: "bath", label: "حمام", ratio: 0.055, minAreaM2: 3, habitable: false, zone: "access" },
    { kind: "wc", label: "سرویس", ratio: 0.035, minAreaM2: 1.5, habitable: false, zone: "access" },
    { kind: "entry", label: "ورودی/راهرو", ratio: 0.14, minAreaM2: 4.5, habitable: false, zone: "access" },
    { kind: "storage", label: "انباری", ratio: 0.03, minAreaM2: 1.5, habitable: false, zone: "access" },
  ],
};

export const ROOM_COLORS: Record<RoomKind, string> = {
  living: "#7dd3fc",
  kitchen: "#fbbf24",
  masterBedroom: "#a7f3d0",
  bedroom: "#6ee7b7",
  bath: "#c4b5fd",
  wc: "#a5b4fc",
  entry: "#e2e8f0",
  hall: "#e2e8f0",
  storage: "#94a3b8",
  corridor: "#64748b",
  core: "#f472b6",
  lobby: "#67e8f9",
  balcony: "#fca5a5",
  void: "#0f172a",
  parking: "#475569",
};

export const ROOM_LABEL_FA: Record<RoomKind, string> = {
  living: "نشیمن",
  kitchen: "آشپزخانه",
  masterBedroom: "مستر",
  bedroom: "اتاق خواب",
  bath: "حمام",
  wc: "سرویس",
  entry: "ورودی",
  hall: "راهرو",
  storage: "انباری",
  corridor: "راهرو مشترک",
  core: "هسته",
  lobby: "لابی",
  balcony: "بالکن",
  void: "حیاط/باز",
  parking: "پارکینگ",
};
