import { round } from "../geometry";
import { ROOM_LABEL_FA } from "../program";
import type { CanonicalScheme, Level, Opening, Room } from "../types";

/**
 * ARCHITECTURAL SCHEDULES (stage C).
 *
 * Every cell is read from the canonical model. Fields the model does not hold
 * (fire rating, material, finish, frame type, manufacturer) are reported as
 * MISSING — `null` + an explicit note — and are never filled with a plausible
 * looking default.
 */

export const NOT_MODELLED = "در مدل موجود نیست";

export interface ColumnSpec {
  key: string;
  label: string;
  widthMm: number;
  align: "start" | "middle" | "end";
}

export interface TableCell {
  value: string;
  available: boolean;
}

export interface TableRow {
  id: string;
  cells: Record<string, TableCell>;
}

export interface ScheduleTable {
  id: string;
  title: string;
  subtitle: string;
  columns: ColumnSpec[];
  rows: TableRow[];
  missingFields: string[];
  totals: { label: string; value: string }[];
  emptyReason?: string;
}

const cell = (value: string | number | null | undefined, available = true): TableCell => ({
  value: value === null || value === undefined || value === "" ? NOT_MODELLED : String(value),
  available: available && value !== null && value !== undefined && value !== "",
});

export function doorWindowSchedule(scheme: CanonicalScheme, levelIndex = 0): ScheduleTable {
  const level = scheme.levels[Math.min(levelIndex, scheme.levels.length - 1)];
  const walls = new Map((level.walls ?? []).map((wall) => [wall.id, wall]));
  const openings = level.openings ?? [];
  const columns: ColumnSpec[] = [
    { key: "tag", label: "شناسه", widthMm: 26, align: "start" },
    { key: "type", label: "نوع", widthMm: 20, align: "start" },
    { key: "count", label: "تعداد", widthMm: 14, align: "middle" },
    { key: "width", label: "عرض (m)", widthMm: 18, align: "middle" },
    { key: "height", label: "ارتفاع (m)", widthMm: 20, align: "middle" },
    { key: "sill", label: "کف (m)", widthMm: 16, align: "middle" },
    { key: "area", label: "سطح (m²)", widthMm: 18, align: "middle" },
    { key: "wall", label: "دیوار", widthMm: 22, align: "start" },
    { key: "rooms", label: "فضای میزبان", widthMm: 40, align: "start" },
    { key: "material", label: "مصالح", widthMm: 28, align: "start" },
    { key: "fire", label: "مقاومت حریق", widthMm: 26, align: "start" },
  ];

  // Group by (kind, width, height, sill) so the schedule reads like a real tag list.
  const groups = new Map<string, { kind: Opening["kind"]; width: number; height: number; sill: number; items: Opening[] }>();
  for (const opening of openings) {
    const key = `${opening.kind}|${opening.widthM.toFixed(2)}|${opening.heightM.toFixed(2)}|${opening.sillM.toFixed(2)}`;
    const found = groups.get(key);
    if (found) found.items.push(opening);
    else groups.set(key, { kind: opening.kind, width: opening.widthM, height: opening.heightM, sill: opening.sillM, items: [opening] });
  }

  const rows: TableRow[] = [...groups.entries()]
    .sort((a, b) => b[1].items.length - a[1].items.length || a[1].kind.localeCompare(b[1].kind))
    .map(([key, group], index) => {
      const tag = `${group.kind === "window" ? "W" : "D"}-${String(index + 1).padStart(2, "0")}`;
      const rooms = new Set<string>();
      for (const item of group.items) {
        for (const roomId of item.roomIds) {
          const room = level.rooms.find((candidate) => candidate.id === roomId);
          if (room) rooms.add(ROOM_LABEL_FA[room.kind] ?? room.kind);
        }
      }
      return {
        id: key,
        cells: {
          tag: cell(tag),
          type: cell(group.kind === "window" ? "پنجره" : group.kind === "entryDoor" ? "درِ ورودی" : group.kind === "slidingDoor" ? "در کشویی" : "در"),
          count: cell(group.items.length),
          width: cell(group.width.toFixed(2)),
          height: cell(group.height.toFixed(2)),
          sill: cell(group.sill.toFixed(2)),
          area: cell((group.width * group.height).toFixed(2)),
          wall: cell([...new Set(group.items.map((item) => item.wallId))].slice(0, 2).join(", ")),
          rooms: cell([...rooms].slice(0, 3).join("، ")),
          material: cell(null, false),
          fire: cell(null, false),
        },
      };
    });

  const windows = openings.filter((opening) => opening.kind === "window");
  const doors = openings.filter((opening) => opening.kind !== "window");
  const totalGlass = windows.reduce((sum, opening) => sum + opening.widthM * opening.heightM, 0);
  void walls;

  return {
    id: "door-window-schedule",
    title: "جدول درها و پنجره‌ها",
    subtitle: `${level.name} · ابعاد از مدل مرکزی · ${openings.length} بازشو در ${groups.size} گونه`,
    columns,
    rows,
    missingFields: ["مصالح", "مقاومت حریق", "نوع بازشو (لولایی/کشویی)", "جنس چهارچوب"],
    totals: [
      { label: "پنجره", value: `${windows.length} عدد` },
      { label: "در", value: `${doors.length} عدد` },
      { label: "سطح شیشه", value: `${round(totalGlass, 2)} m²` },
    ],
    emptyReason: openings.length === 0 ? "هیچ بازشویی در مدل این طبقه تولید نشده است." : undefined,
  };
}

export function roomSchedule(scheme: CanonicalScheme, levelIndex = 0): ScheduleTable {
  const level = scheme.levels[Math.min(levelIndex, scheme.levels.length - 1)];
  const columns: ColumnSpec[] = [
    { key: "id", label: "شناسه", widthMm: 46, align: "start" },
    { key: "name", label: "نام فضا", widthMm: 30, align: "start" },
    { key: "unit", label: "واحد", widthMm: 14, align: "middle" },
    { key: "area", label: "مساحت (m²)", widthMm: 22, align: "middle" },
    { key: "min", label: "حداقل برنامه (m²)", widthMm: 26, align: "middle" },
    { key: "facade", label: "طول نما (m)", widthMm: 22, align: "middle" },
    { key: "daylight", label: "شاخص نور", widthMm: 20, align: "middle" },
    { key: "habitable", label: "قابل سکونت", widthMm: 22, align: "middle" },
    { key: "finish", label: "کف/دیوار", widthMm: 28, align: "start" },
  ];
  const rooms = level.rooms;
  const rows: TableRow[] = rooms.map((room: Room) => ({
    id: room.id,
    cells: {
      id: cell(room.id),
      name: cell(ROOM_LABEL_FA[room.kind] ?? room.kind),
      unit: cell(room.unitIndex >= 0 ? room.unitIndex + 1 : "مشاعات"),
      area: cell(room.areaM2.toFixed(2)),
      min: cell(room.minAreaM2 > 0 ? room.minAreaM2.toFixed(1) : null),
      facade: cell(room.facadeM.toFixed(2)),
      daylight: cell(room.daylightFactorProxy.toFixed(3)),
      habitable: cell(room.habitable ? "بله" : "خیر"),
      finish: cell(null, false),
    },
  }));
  const net = rooms.filter((room) => room.unitIndex >= 0).reduce((sum, room) => sum + room.areaM2, 0);
  const gross = level.plateAreaM2;
  return {
    id: "room-schedule",
    title: "جدول فضاها",
    subtitle: `${level.name} · ${rooms.length} فضا · مساحت از هندسه چندضلعی`,
    columns,
    rows,
    missingFields: ["مصالح کف", "مصالح دیوار", "ارتفاع تمام‌شده", "تأسیسات"],
    totals: [
      { label: "جمع فضاهای واحدها", value: `${round(net, 2)} m²` },
      { label: "سطح ناخالص بلوک", value: `${round(gross, 2)} m²` },
      { label: "ضریب خالص/ناخالص", value: `${gross > 0 ? Math.round((net / gross) * 100) : 0}٪` },
      { label: "کف واحدها", value: `${scheme.unitsPerFloor} واحد` },
    ],
    emptyReason: rooms.length === 0 ? "طبقه هیچ فضایی ندارد." : undefined,
  };
}

/** Level-by-level summary used on the general sheet. */
export function levelSummaryTable(scheme: CanonicalScheme): ScheduleTable {
  const columns: ColumnSpec[] = [
    { key: "level", label: "طبقه", widthMm: 34, align: "start" },
    { key: "elev", label: "تراز (m)", widthMm: 24, align: "middle" },
    { key: "plate", label: "سطح بلوک (m²)", widthMm: 30, align: "middle" },
    { key: "rooms", label: "فضا", widthMm: 18, align: "middle" },
    { key: "units", label: "واحد", widthMm: 18, align: "middle" },
    { key: "walls", label: "دیوار", widthMm: 18, align: "middle" },
    { key: "openings", label: "بازشو", widthMm: 20, align: "middle" },
  ];
  const rows: TableRow[] = scheme.levels.map((level: Level) => ({
    id: `level-${level.index}`,
    cells: {
      level: cell(level.name),
      elev: cell((level.index * scheme.floorHeightM).toFixed(2)),
      plate: cell(level.plateAreaM2.toFixed(1)),
      rooms: cell(level.rooms.length),
      units: cell(scheme.unitsPerFloor),
      walls: cell((level.walls ?? []).length),
      openings: cell((level.openings ?? []).length),
    },
  }));
  return {
    id: "level-summary",
    title: "جدول طبقات",
    subtitle: `${scheme.levels.length} طبقه × ${scheme.floorHeightM.toFixed(2)} m`,
    columns,
    rows,
    missingFields: [],
    totals: [
      { label: "زیربنای کل", value: `${scheme.grossFloorAreaM2.toFixed(1)} m²` },
      { label: "ارتفاع کل (بدون بام)", value: `${(scheme.levels.length * scheme.floorHeightM).toFixed(2)} m` },
    ],
  };
}

/** Facts the drawing set cannot state because the model lacks them. */
export function drawingMissingData(scheme: CanonicalScheme): { item: string; detail: string }[] {
  const missing: { item: string; detail: string }[] = [
    { item: "بام و پاراپت", detail: "فرم بام، شیب، جان‌پناه و ارتفاع آن در مدل تعریف نشده است." },
    { item: "تراز زمین و محوطه", detail: `${scheme.site.spotLevels.length} تراز نقطه‌ای ثبت شده اما نگاشت آن به تراز نسبی نما تعریف نشده است.` },
    { item: "بالکن، سایبان، پله فرار", detail: "این اجزا موجودیت مدل نیستند و در نقشه‌ها ترسیم نمی‌شوند." },
    { item: "مصالح و دیتیل", detail: "لایه‌های تکمیلی، عایق، نازک‌کاری و دیتیل اتصال مدل نشده‌اند." },
    { item: "شالوده و سازه اجرایی", detail: "پی در مدل هندسی نیست؛ ضخامت سقف از تحلیل مقدماتی سازه آمده است." },
    { item: "تأسیسات", detail: "مسیر و ابعاد تأسیسات مدل هندسی ندارد؛ نقشه هماهنگی تولید نمی‌شود." },
  ];
  return missing;
}
