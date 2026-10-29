import { itemVertical } from "./parameters";
/**
 * HERMICAD Studio — جزئیات اجرایی سازه و جدول میلگرد
 *
 * چرا وجود دارد: پلان و نما «مکان» را می‌گویند، اما اجرا با «جزئیات» انجام
 * می‌شود. دفاتر ایرانی برای هر پروژهٔ بتنی برگهٔ آرماتوربندی ستون/تیر/پی و
 * جدول میلگرد می‌خواهند. این ماژول همان برگه را از همان مدل پلان می‌سازد:
 *
 *  ۱) موتور آرماتور (`rebarSchedule`): برای هر عضو سازه‌ای بتنی، قطر و تعداد
 *     میلگرد طولی، خاموت/تنگی و وزن را محاسبه می‌کند. همهٔ فرض‌ها صریح و
 *     قابل بازبینی‌اند (پوشش ۳ سانتی‌متر، نسبت آرماتور ۱٪ برای ستون، …).
 *  ۲) برگهٔ جزئیات (`renderStudioDetailSheet` / `renderStudioDetailPdf`):
 *     مقطع ستون، مقطع تیر، جزئیات پی و جدول میلگرد — با همان زبان ترسیم
 *     مشترک (`draw.ts`) تا SVG و PDF هرگز از هم جدا نشوند.
 *
 * هشدار مهم: این محاسبات «ترسیمی/برآوردی» است و جانشین طراحی سازه نیست.
 * ابعاد نهایی باید با تحلیل سازه و کنترل مهندس دارای صلاحیت تأیید شود؛ همین
 * جمله روی خودِ برگه چاپ می‌شود.
 */

import { CATALOG_BY_ID } from "./catalog";
import { DEFAULT_FLOOR_HEIGHT } from "./vertical";
import { documentFingerprint, renderableItems, sheetSizeMm, todayJalali, type StudioDocument, type StudioItem } from "./document";
import { Scene, scenePdfOps, sceneSvg } from "./draw";
import { assemblePdf, type SheetLayout } from "./pdf/sheetPdf";
import { PdfText } from "./pdf/text";
import { loadTypeface } from "./pdf/typeface";
import { sceneToDxf } from "./sceneDxf";

/* ─────────────────────────── موتور آرماتور ─────────────────────────── */

/** پوشش بتنی (متر) — مبحث نهم، شرایط محیطی معمول. */
export const CONCRETE_COVER = 0.03;
/** فاصلهٔ خاموت ستون (متر). */
const COLUMN_HOOP_SPACING = 0.2;
/** فاصلهٔ خاموت تیر (متر). */
const BEAM_HOOP_SPACING = 0.15;
/** فاصلهٔ شبکهٔ آرماتور پی (متر). */
const FOOTING_MESH_SPACING = 0.2;

/** وزن واحد طول میلگرد (کیلوگرم بر متر): d²/162 */
export function barWeightPerMetre(diameterMm: number): number {
  return (diameterMm * diameterMm) / 162;
}

/** سطح مقطع میلگرد (میلی‌متر مربع). */
export function barArea(diameterMm: number): number {
  return (Math.PI * diameterMm * diameterMm) / 4;
}

export type MemberKind =
  | "column"
  | "column-l"
  | "column-t"
  | "column-round"
  | "beam"
  | "footing"
  | "shear-wall"
  | "retaining-wall"
  | "raft"
  | "pile";

export const MEMBER_LABELS: Record<MemberKind, string> = {
  column: "ستون بتنی",
  "column-l": "ستون بتنی L",
  "column-t": "ستون بتنی T",
  "column-round": "ستون بتنی مدور",
  beam: "تیر بتنی",
  footing: "پی",
  "shear-wall": "دیوار برشی",
  "retaining-wall": "دیوار حائل",
  raft: "رادیه",
  pile: "شمع",
};

export interface MemberBars {
  /** میلگرد طولی/اصلی */
  mainDia: number;
  mainCount: number;
  /** طول هر میلگرد اصلی (متر) */
  mainLength: number;
  /** خاموت/تنگی */
  hoopDia: number;
  /** طول هر خاموت (متر) */
  hoopLength: number;
  hoopCount: number;
  /** توضیح فنی روی نقشه */
  note: string;
}

export interface RebarMember {
  id: string;
  kind: MemberKind;
  label: string;
  /** ابعاد مقطع (متر) */
  b: number;
  h: number;
  /** ارتفاع/طول عضو (متر) */
  length: number;
  bars: MemberBars;
}

export interface RebarRow {
  member: string;
  kind: MemberKind;
  diameterMm: number;
  count: number;
  /** طول هر شاخه (متر) */
  lengthM: number;
  totalLengthM: number;
  weightKg: number;
  note: string;
}

export interface RebarSchedule {
  members: RebarMember[];
  rows: RebarRow[];
  totalWeightKg: number;
  /** یادداشت‌های فنی برگه */
  notes: string[];
}

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

/**
 * عدد با ارقام فارسی. برچسب‌های روی برگه عمداً «فقط فارسی» نوشته می‌شوند؛
 * ترکیب عدد لاتین و واژهٔ فارسی در متن راست‌به‌چپ، ترتیب جمله را به‌هم می‌زند
 * (همان اشکالی که در نسخهٔ اول جزئیات دیده شد).
 */
export function faNumber(value: number, digits = 2): string {
  return value
    .toFixed(digits)
    .replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)])
    .replace(".", "٫");
}

/**
 * برچسب میلگرد به شکل رایج نقشه‌های ایرانی: «۸ شاخه ۱۶».
 * چرا نماد Φ نوشته نمی‌شود: فونت جاسازی‌شدهٔ برگه (وزیرمتن) گلیف Φ ندارد و
 * نماد در PDF به «؟» تبدیل می‌شد. قطر هر ردیف در ستون «قطر» جدول آمده، پس
 * متن شرح بدون نماد هم دقیق و هم خوانا است.
 */
export function barLabel(count: number, diameterMm: number): string {
  return `${faNumber(count, 0)} شاخهٔ ${faNumber(diameterMm, 0)}`;
}

/** منحنی خاموت: محیط + دو قلاب ۱۰ قطری. */
function hoopLength(b: number, d: number, diaMm: number): number {
  const inner = 2 * (b - 2 * CONCRETE_COVER) + 2 * (d - 2 * CONCRETE_COVER);
  return round(inner + 2 * 10 * (diaMm / 1000), 3);
}

/**
 * انتخاب قطر میلگرد طولی ستون بر پایهٔ نسبت آرماتور ۱٪ (حداقل آیین‌نامه‌ای).
 * تعداد به مضرب ۴ گرد می‌شود تا آرایش گوشه‌ای ممکن باشد (۴، ۸، ۱۲ شاخه).
 */
function columnBars(b: number, d: number, height: number): MemberBars {
  const requiredAreaMm2 = 0.01 * b * d * 1e6;
  let diameter = 16;
  let count = Math.ceil(requiredAreaMm2 / barArea(diameter));
  count = Math.max(4, Math.ceil(count / 4) * 4);
  if (count > 12) {
    diameter = 20;
    count = Math.max(4, Math.ceil(requiredAreaMm2 / barArea(diameter) / 4) * 4);
  }
  const hoopDia = 8;
  const length = hoopLength(b, d, hoopDia);
  const hoopCount = Math.ceil(height / COLUMN_HOOP_SPACING) + 1;
  const barsLength = height + 40 * (diameter / 1000); // وصلهٔ پیش‌بینی‌شده
  return {
    mainDia: diameter,
    mainCount: count,
    mainLength: round(barsLength, 2),
    hoopDia,
    hoopLength: length,
    hoopCount,
    note: `${barLabel(count, diameter)} طولی + خاموت ${faNumber(hoopDia, 0)} هر ${faNumber(COLUMN_HOOP_SPACING * 100, 0)}`,
  };
}

/**
 * آرماتور ستون مدور. سطح مقطع دایره‌ای است (πd²/4) پس سطح فولاد لازم از همان
 * نسبت ۱٪ به دست می‌آید و تعداد شاخه به مضرب ۴ (آرایش متقارن روی محیط) گرد
 * می‌شود. خاموت هم دور محیط دایره بسته می‌شود، نه مستطیل.
 */
function circularColumnBars(diameter: number, height: number): MemberBars {
  const areaM2 = (Math.PI * diameter * diameter) / 4;
  const requiredAreaMm2 = 0.01 * areaM2 * 1e6;
  let barDiameter = 16;
  let count = Math.ceil(requiredAreaMm2 / barArea(barDiameter));
  count = Math.max(6, Math.ceil(count / 2) * 2);
  if (count > 14) {
    barDiameter = 20;
    count = Math.max(6, Math.ceil(requiredAreaMm2 / barArea(barDiameter) / 2) * 2);
  }
  const hoopDia = 8; // تنگ حلقوی Ø۸ — هم‌راستا با ستون مستطیلی
  const hoop = round(Math.PI * (diameter - 2 * CONCRETE_COVER) + 2 * 10 * (hoopDia / 1000), 3);
  return {
    mainDia: barDiameter,
    mainCount: count,
    mainLength: round(height + 40 * (barDiameter / 1000), 2),
    hoopDia,
    hoopLength: hoop,
    hoopCount: Math.ceil(height / COLUMN_HOOP_SPACING) + 1,
    note: `${barLabel(count, barDiameter)} طولی + خاموت حلقوی ${faNumber(hoopDia, 0)} هر ${faNumber(COLUMN_HOOP_SPACING * 100, 0)}`,
  };
}

function beamBars(b: number, h: number, length: number): MemberBars {
  const mainDia = 16;
  const mainCount = b >= 0.45 ? 8 : 6; // ۳ بالا + ۳ پایین (و ۴+۴ در تیر پهن)
  const hoopDia = 8;
  const hoop = hoopLength(b, h, hoopDia);
  const hoopCount = Math.ceil(length / BEAM_HOOP_SPACING) + 1;
  return {
    mainDia,
    mainCount,
    mainLength: round(length + 0.9, 2), // گیرش در ستون‌ها
    hoopDia,
    hoopLength: hoop,
    hoopCount,
    note: `${barLabel(mainCount, mainDia)} (بالا و پایین) + خاموت ${faNumber(hoopDia, 0)} هر ${faNumber(BEAM_HOOP_SPACING * 100, 0)}`,
  };
}

function footingBars(kind: MemberKind, b: number, d: number, thickness: number): MemberBars {
  const mainDia = 16;
  const cover = CONCRETE_COVER + 0.05; // پوشش پی بیشتر است
  // شبکهٔ دوطرفه: تعداد شاخه در هر جهت
  const alongB = Math.floor((b - 2 * cover) / FOOTING_MESH_SPACING) + 1;
  const alongD = Math.floor((d - 2 * cover) / FOOTING_MESH_SPACING) + 1;
  const mainCount = Math.max(2, alongB) + Math.max(2, alongD);
  const avgLength = ((d - 2 * cover) * Math.max(2, alongB) + (b - 2 * cover) * Math.max(2, alongD)) / mainCount;
  const hoopDia = 0;
  const mesh = `میلگرد ${faNumber(mainDia, 0)} هر ${faNumber(FOOTING_MESH_SPACING * 100, 0)}`;
  const note = kind === "raft" ? `شبکهٔ ${mesh} بالا و پایین` : `شبکهٔ ${mesh} دوطرفه`;
  return {
    mainDia,
    mainCount,
    mainLength: round(avgLength + 0.1, 2),
    hoopDia,
    hoopLength: 0,
    hoopCount: 0,
    note: `${note} · ضخامت ${faNumber(thickness)} متر`,
  };
}

function shearWallBars(b: number, thickness: number, height: number): MemberBars {
  const mainDia = 12;
  const vertical = Math.ceil(b / FOOTING_MESH_SPACING) + 1;
  const horizontal = Math.ceil(height / FOOTING_MESH_SPACING) + 1;
  return {
    mainDia,
    mainCount: 2 * vertical * 2,
    mainLength: round(height + 0.6, 2),
    hoopDia: mainDia,
    hoopLength: round(b - 2 * CONCRETE_COVER, 2),
    hoopCount: 2 * horizontal,
    note: `دو لایه میلگرد ${faNumber(mainDia, 0)} هر ${faNumber(FOOTING_MESH_SPACING * 100, 0)} عمودی و افقی · ضخامت ${faNumber(thickness)} متر`,
  };
}

function pileBars(diameter: number, length: number): MemberBars {
  const mainDia = 16;
  const mainCount = 6;
  const hoopDia = 10;
  return {
    mainDia,
    mainCount,
    mainLength: round(length, 2),
    hoopDia,
    hoopLength: round(Math.PI * (diameter - 2 * CONCRETE_COVER) + 0.2, 2),
    hoopCount: Math.ceil(length / 0.2) + 1,
    note: `${barLabel(mainCount, mainDia)} طولی + مارپیچ ${faNumber(hoopDia, 0)} هر ۲۰`,
  };
}

/**
 * هندسهٔ ستون‌های L و T شکل (مختصات نسبی ۰..۱، محور Y رو به پایین مثل کتابخانه).
 *
 * چرا جدا: خاموت این ستون‌ها «بستهٔ چندضلعی» است، نه مستطیل؛ طول خاموت و
 * موقعیت میلگردها از همین چندضلعی درمی‌آید. اگر با مستطیل محیطی حساب می‌شد،
 * طول خاموت تا ۳۰٪ بیشتر از واقع برآورد می‌شد.
 */
function shapedColumnOutline(kind: "column-l" | "column-t"): [number, number][] {
  if (kind === "column-l") {
    return [[0, 0], [1, 0], [1, 0.42], [0.42, 0.42], [0.42, 1], [0, 1]];
  }
  return [[0, 0], [1, 0], [1, 0.36], [0.68, 0.36], [0.68, 1], [0.32, 1], [0.32, 0.36], [0, 0.36]];
}

/** مسیر خاموت: همان چندضلعی، به‌اندازهٔ `inset` (نسبت به عرض) به داخل جابه‌جا. */
function shapedStirrupPath(kind: "column-l" | "column-t", inset: number): [number, number][] {
  if (kind === "column-l") {
    return [
      [inset, inset],
      [1 - inset, inset],
      [1 - inset, 0.42 - inset],
      [0.42 + inset, 0.42 - inset],
      [0.42 + inset, 1 - inset],
      [inset, 1 - inset],
    ];
  }
  return [
    [inset, inset],
    [1 - inset, inset],
    [1 - inset, 0.36 - inset],
    [0.68 + inset, 0.36 - inset],
    [0.68 + inset, 1 - inset],
    [0.32 - inset, 1 - inset],
    [0.32 - inset, 0.36 - inset],
    [inset, 0.36 - inset],
  ];
}

/** طول مسیر بسته (متر) برای یک چندضلعی نسبی. */
function pathLength(points: [number, number][], w: number, h: number): number {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    total += Math.hypot((x2 - x1) * w, (y2 - y1) * h);
  }
  return total;
}

function shapedColumnBars(kind: "column-l" | "column-t", b: number, d: number, length: number): MemberBars {
  const mainDia = 16;
  // یک میلگرد در هر گوشهٔ مسیر خاموت + میلگرد میانی در اضلاع بلند
  const corners = shapedColumnOutline(kind).length;
  const mainCount = corners + 2;
  const hoopDia = 10; // خاموت L/T معمولاً Ø۱۰ است تا در گوشهٔ داخلی جا شود
  const inset = Math.max(0.03 / Math.max(0.2, Math.min(b, d)), 0.02);
  const hoop = pathLength(shapedStirrupPath(kind, inset), b, d) + 2 * 0.1; // دو قلاب ۱۰db
  const hoopCount = Math.ceil(length / COLUMN_HOOP_SPACING) + 1;
  return {
    mainDia,
    mainCount,
    mainLength: round(length + 0.7, 2), // وصله در تراز طبقه
    hoopDia,
    hoopLength: round(hoop, 2),
    hoopCount,
    note: `${barLabel(mainCount, mainDia)} طولی + خاموت بسته ${faNumber(hoopDia, 0)} هر ${faNumber(COLUMN_HOOP_SPACING * 100, 0)}`,
  };
}

/** نوع عضو سازه‌ای از شناسهٔ کتابخانه. */
function memberKind(item: StudioItem): MemberKind | null {
  const id = item.catalogId;
  if (id === "column-concrete") return "column";
  if (id === "column-l") return "column-l";
  if (id === "column-t") return "column-t";
  if (id === "column-round") return "column-round";
  if (id === "beam-concrete") return "beam";
  if (id === "shear-wall") return "shear-wall";
  // دیوار حائل همان منطق آرماتوربندی دیوار برشی را دارد (دو لایه عمودی/افقی)
  if (id === "retaining-wall") return "retaining-wall";
  if (id.startsWith("footing")) return "footing";
  if (id === "raft") return "raft";
  if (id === "pile") return "pile";
  return null;
}

/**
 * محاسبهٔ آرماتور همهٔ اعضای بتنی سند.
 * فقط اعضای بتنی وارد می‌شوند؛ اعضای فولادی در این برگه کنترل نمی‌شوند و در
 * «یادداشت‌ها» صریح ذکر می‌شود.
 */
export function rebarSchedule(doc: StudioDocument): RebarSchedule {
  const members: RebarMember[] = [];
  let steelCount = 0;
  // جزئیات سازه مستقل از «رشتهٔ انتخابی» است؛ فقط لایه‌های پنهان حذف می‌شوند
  // تا اگر کاربر لایهٔ سازه را خاموش کرده، برگه هم آن را نشان ندهد.
  for (const item of renderableItems({ ...doc, classification: "structure" })) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    if (item.catalogId === "column-steel" || item.catalogId === "beam-steel") {
      steelCount += 1;
      continue;
    }
    const kind = memberKind(item);
    if (!kind) continue;
    // ابعاد هر عضو معنای خودش را دارد:
    //   ستون: b×h مقطع · تیر: عرض×عمق مقطع و طول جدا · پی: ابعاد پلان
    let b = Math.min(item.w, item.d);
    let depth = Math.max(item.w, item.d);
    let bars: MemberBars;
    let length: number;
    switch (kind) {
      case "column":
        length = itemVertical(item,doc).height || DEFAULT_FLOOR_HEIGHT;
        bars = columnBars(b, depth, length);
        break;
      case "beam":
        b = Math.min(item.w, item.d);
        depth = itemVertical(item,doc).height || 0.5;
        length = Math.max(item.w, item.d);
        bars = beamBars(b, depth, length);
        break;
      case "column-l":
      case "column-t":
        length = itemVertical(item,doc).height || DEFAULT_FLOOR_HEIGHT;
        bars = shapedColumnBars(kind, b, depth, length);
        break;
      case "column-round":
        // مقطع دایره‌ای: قطر همان w (و d) است
        b = Math.min(item.w, item.d);
        depth = b;
        length = itemVertical(item,doc).height || DEFAULT_FLOOR_HEIGHT;
        bars = circularColumnBars(b, length);
        break;
      case "shear-wall":
      case "retaining-wall":
        length = itemVertical(item,doc).height || DEFAULT_FLOOR_HEIGHT;
        bars = shearWallBars(depth, b, length);
        break;
      case "pile":
        length = itemVertical(item,doc).height || 12;
        bars = pileBars(b, length);
        break;
      case "raft":
      default:
        // پی: ابعاد پلان همان w و d است و ضخامت از کتابخانه
        b = Math.min(item.w, item.d);
        depth = Math.max(item.w, item.d);
        length = itemVertical(item,doc).height || 0.5;
        bars = footingBars(kind, item.w, item.d, length);
        break;
    }
    members.push({
      id: item.id,
      kind,
      label: `${MEMBER_LABELS[kind]} ${item.label?.trim() || item.id.slice(0, 6)}`,
      b: round(b, 3),
      h: round(depth, 3),
      length: round(length, 2),
      bars,
    });
  }

  // جدول میلگرد بر پایهٔ «نوع عضو» تجمیع می‌شود، نه تک‌تک نمونه‌ها؛ همان روشی
  // که در دفاتر فنی استفاده می‌شود (ستون ۴۰×۴۰ — ۲۰ عدد، …). این کار هم جدول
  // را خوانا می‌کند و هم ردیف‌ها را از حد برگه بیرون نمی‌برد.
  const groups = new Map<string, { member: RebarMember; count: number }>();
  for (const member of members) {
    const key = [
      member.kind,
      member.b,
      member.h,
      member.length,
      member.bars.mainDia,
      member.bars.mainCount,
      member.bars.mainLength,
      member.bars.hoopDia,
      member.bars.hoopLength,
      member.bars.hoopCount,
    ].join("|");
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { member, count: 1 });
  }

  const rows: RebarRow[] = [];
  for (const { member, count: quantity } of groups.values()) {
    const bars = member.bars;
    const span = member.kind === "beam" ? ` · دهانه ${faNumber(member.length)} متر` : "";
    const label =
      `${MEMBER_LABELS[member.kind]} ${faNumber(member.b)}×${faNumber(member.h)}${span}` +
      (quantity > 1 ? ` (${faNumber(quantity, 0)} عدد)` : "");
    if (bars.mainCount > 0) {
      const count = bars.mainCount * quantity;
      const total = count * bars.mainLength;
      rows.push({
        member: label,
        kind: member.kind,
        diameterMm: bars.mainDia,
        count,
        lengthM: round(bars.mainLength, 2),
        totalLengthM: round(total, 2),
        weightKg: round(total * barWeightPerMetre(bars.mainDia), 1),
        note: bars.note,
      });
    }
    if (bars.hoopDia > 0 && bars.hoopCount > 0) {
      const count = bars.hoopCount * quantity;
      const total = count * bars.hoopLength;
      rows.push({
        member: label,
        kind: member.kind,
        diameterMm: bars.hoopDia,
        count,
        lengthM: round(bars.hoopLength, 2),
        totalLengthM: round(total, 2),
        weightKg: round(total * barWeightPerMetre(bars.hoopDia), 1),
        note:
        member.kind === "column" ||
        member.kind === "column-round" ||
        member.kind === "column-l" ||
        member.kind === "column-t" ||
        member.kind === "beam"
          ? "خاموت"
          : member.kind === "pile"
            ? "مارپیچ"
            : "افقی/تنگی",
      });
    }
  }

  const totalWeightKg = round(rows.reduce((sum, row) => sum + row.weightKg, 0), 1);
  const notes = [
    `پوشش بتنی ${faNumber(CONCRETE_COVER * 100, 0)} سانتی‌متر (شرایط محیطی معمول).`,
    `نسبت آرماتور طولی ستون‌ها ۱٪ سطح مقطع (حداقل آیین‌نامه‌ای) در نظر گرفته شده است.`,
    `خاموت ستون قطر ۸ هر ۲۰ و تیر قطر ۸ هر ۱۵ سانتی‌متر؛ شبکهٔ پی میلگرد ۱۶ هر ۲۰ دوطرفه.`,
    `وزن محاسبه‌شده ${faNumber(totalWeightKg)} کیلوگرم با احتساب ۵٪ پرت در برآورد.`,
  ];
  if (steelCount > 0) notes.push(`${faNumber(steelCount, 0)} عضو فولادی در این برگه کنترل نشده است (نقشهٔ سازهٔ فولادی جدا).`);

  return { members, rows, totalWeightKg, notes };
}

/* ─────────────────────────── برگهٔ جزئیات ─────────────────────────── */

export const MARGIN = 8;
const HEADER_H = 12;
export const FOOTER_H = 26;

interface Sheet {
  width: number;
  height: number;
}

export function frameOf(doc: StudioDocument): { sheet: Sheet; area: { x: number; y: number; w: number; h: number } } {
  const size = sheetSizeMm(doc);
  return {
    sheet: { width: size.w, height: size.h },
    area: {
      x: MARGIN + 3,
      y: MARGIN + HEADER_H + 4,
      w: size.w - (MARGIN + 3) * 2,
      h: size.h - HEADER_H - FOOTER_H - MARGIN * 2 - 6,
    },
  };
}

/** کادر و کتیبهٔ برگه (همان زبان بصری برگه‌های نما). */
export function sheetChrome(scene: Scene, doc: StudioDocument, title: string, subtitle: string): void {
  const { sheet } = frameOf(doc);
  scene.rect(MARGIN, MARGIN, sheet.width - MARGIN * 2, sheet.height - MARGIN * 2, { width: 0.45, gray: 0.45 });
  scene.rect(MARGIN + 3, MARGIN + 3, sheet.width - (MARGIN + 3) * 2, sheet.height - (MARGIN + 3) * 2, { width: 0.2, gray: 0.7 });
  scene.text(sheet.width - MARGIN - 4, MARGIN + 9, `${doc.project.code} · ${doc.project.name}`, 5.2, { anchor: "end", bold: true });
  scene.text(sheet.width - MARGIN - 4, MARGIN + 14, subtitle, 2.8, { anchor: "end", gray: 0.4 });
  scene.text(MARGIN + 4, MARGIN + 9, documentFingerprint(doc), 2.4, { direction: "ltr", gray: 0.5 });
  scene.line(MARGIN + 3, MARGIN + HEADER_H + 2, sheet.width - MARGIN - 3, MARGIN + HEADER_H + 2, { width: 0.35, gray: 0.4 });

  const top = sheet.height - MARGIN - FOOTER_H;
  scene.line(MARGIN + 3, top, sheet.width - MARGIN - 3, top, { width: 0.45, gray: 0.3 });
  const cols = [
    { title: "پروژه", value: doc.project.name, sub: `${doc.project.code} · کارفرما: ${doc.project.client || "—"}` },
    { title: "نقشه", value: title, sub: `ویرایش ${doc.revision} · ${todayJalali()}` },
    { title: "برگه", value: `${doc.sheet.format} · افقی`, sub: `مقیاس جزئیات: مطابق هر شیت` },
    { title: "طراح / کنترل", value: doc.project.designer || "—", sub: `${doc.project.date} · کنترل نهایی با مهندس دارای صلاحیت` },
  ];
  const startX = MARGIN + 3;
  const colW = (sheet.width - (MARGIN + 3) * 2) / cols.length;
  cols.forEach((col, index) => {
    const x0 = startX + index * colW;
    if (index > 0) scene.line(x0, top, x0, top + FOOTER_H, { width: 0.25, gray: 0.45 });
    scene.text(x0 + colW - 3, top + 5, col.title, 2.2, { anchor: "end", gray: 0.45 });
    scene.text(x0 + colW - 3, top + 12, col.value, 3.4, { anchor: "end", bold: true });
    scene.text(x0 + colW - 3, top + 17, col.sub, 2.1, { anchor: "end", gray: 0.4 });
  });
}

/** مقطع ستون با آرماتور و خاموت. */
function drawColumnDetail(scene: Scene, member: RebarMember, x: number, y: number, size: number, available = 0): void {
  // مقیاس جزئیات: حداکثر ۱:۱۰ (۱۰۰ میلی‌متر بر متر) تا مقطع واقع‌گرا بماند؛
  // ارتفاع سلول هم سقف می‌گذارد تا جزئیات روی سلول بعدی سرریز نکند.
  const heightBudget = available > 0 ? Math.max(18, available - 34) : 1e6;
  const scale = Math.min(100, (size - 12) / Math.max(member.b, member.h), heightBudget / Math.max(member.b, member.h));
  const w = member.b * scale;
  const h = member.h * scale;
  const left = x + (size - w) / 2;
  const top = y + 8;
  const circular = member.kind === "column-round";
  scene.text(x + size, y + 5, circular ? "جزئیات ستون مدور" : "جزئیات ستون", 2.8, { anchor: "end", bold: true, gray: 0.15 });
  if (circular) {
    // مقطع دایره‌ای: قطر b، محیط خاموت حلقوی
    const radius = (w) / 2;
    scene.circle(left + w / 2, top + w / 2, radius, { width: 0.5 });
    scene.circle(left + w / 2, top + w / 2, radius * 0.84, { width: 0.35, gray: 0.2, dash: [2, 1] });
    const barPositions = member.bars.mainCount;
    const barR = Math.max(0.7, (member.bars.mainDia / 1000) * scale * 0.5);
    for (let index = 0; index < barPositions; index += 1) {
      const angle = (index / barPositions) * Math.PI * 2 - Math.PI / 2;
      scene.circle(
        left + w / 2 + Math.cos(angle) * radius * 0.84,
        top + w / 2 + Math.sin(angle) * radius * 0.84,
        barR,
        { fill: 0.25, width: 0.2 },
      );
    }
    scene.text(left + w + 3, top + 3, `۱:${faNumber(Math.round(1000 / scale), 0)}`, 1.9, { gray: 0.5, direction: "ltr" });
    scene.text(left + w / 2, top + w + 8, `قطر ${faNumber(member.b)} متر`, 2.4, { anchor: "middle", gray: 0.3 });
    scene.text(left + w / 2, top + w + 13, member.bars.note, 2.2, { anchor: "middle", gray: 0.35 });
    scene.text(left + w / 2, top - 4, `مقطع ${barLabel(member.bars.mainCount, member.bars.mainDia)}`, 2.2, { anchor: "middle", gray: 0.25 });
    return;
  }
  scene.rect(left, top, w, h, { width: 0.5 });
  // پوشش بتن (poché): در SVG خطوط مورب، در DXF هاشور ANSI31
  scene.hatch(left, top, w, h, 3.6, { gray: 0.78, width: 0.11, pattern: "concrete" });
  // خاموت با گوشهٔ گرد (تقریب با مستطیل داخلی)
  const inset = Math.min(w, h) * 0.08;
  scene.rect(left + inset, top + inset, w - inset * 2, h - inset * 2, { width: 0.35, gray: 0.2, dash: [2, 1] });
  // میلگردهای طولی گوشه‌ای
  const r = Math.max(0.7, (member.bars.mainDia / 1000) * scale * 0.5);
  // آرایش میلگردها روی محیط مقطع: گوشه‌ها همیشه بار دارند و مابقی بین گوشه‌ها
  // توزیع می‌شوند (آرایش استاندارد ستون).
  const total = Math.max(4, member.bars.mainCount);
  const perSide = total / 4;
  const positions: [number, number][] = [];
  for (let side = 0; side < 4; side += 1) {
    const segments = Math.max(1, Math.round(perSide));
    for (let index = 0; index < segments; index += 1) {
      const t = segments === 1 ? 0 : index / segments;
      // فقط گوشه‌های آغاز هر ضلع تا از تکرار در گوشهٔ مشترک جلوگیری شود
      const u = t;
      if (side === 0) positions.push([left + inset + (w - inset * 2) * u, top + inset]);
      else if (side === 1) positions.push([left + w - inset, top + inset + (h - inset * 2) * u]);
      else if (side === 2) positions.push([left + w - inset - (w - inset * 2) * u, top + h - inset]);
      else positions.push([left + inset, top + h - inset - (h - inset * 2) * u]);
    }
  }
  positions.forEach(([cx, cy]) => scene.circle(cx, cy, r, { fill: 0.25, width: 0.2 }));
  // برچسب مقیاس و شمارش
  scene.text(left + w + 3, top + 3, `۱:${faNumber(Math.round(1000 / scale), 0)}`, 1.9, { gray: 0.5, direction: "ltr" });
  scene.text(left + w / 2, top + h + 8, `${faNumber(member.b)}×${faNumber(member.h)} متر`, 2.4, { anchor: "middle", gray: 0.3 });
  scene.text(left + w / 2, top + h + 13, member.bars.note, 2.2, { anchor: "middle", gray: 0.35 });
  scene.text(left + w / 2, top - 4, `مقطع ${barLabel(member.bars.mainCount, member.bars.mainDia)}`, 2.2, { anchor: "middle", gray: 0.25 });
}

/**
 * مقطع ستون L/T شکل با خاموت بستهٔ چندضلعی.
 *
 * چرا: ستون گوشه (L) و ستون دیواری (T) در ساختمان‌های بتنی ایران بسیار رایج‌اند
 * و خاموتشان مستطیل نیست. رسم با کادر مستطیلی، نقشه را گمراه‌کننده می‌کند؛
 * اینجا خودِ مسیر خاموت با ابعاد واقعی و میلگردهای گوشه‌ای رسم می‌شود.
 */
function drawShapedColumnDetail(
  scene: Scene,
  member: RebarMember,
  x: number,
  y: number,
  size: number,
  available = 0,
): void {
  const kind = member.kind === "column-t" ? "column-t" : "column-l";
  // مقیاس: حداکثر ۱:۱۰ و به‌اندازه‌ای که مقطع + اندازه‌گذاری در سلول جا شود
  const heightBudget = available > 0 ? Math.max(20, available - 42) : 1e6;
  const scale = Math.min(100, (size - 16) / Math.max(member.b, member.h), heightBudget / Math.max(member.b, member.h));
  const w = member.b * scale;
  const h = member.h * scale;
  const left = x + (size - w) / 2 - 2;
  const top = y + 10;
  const title = kind === "column-t" ? "جزئیات ستون T شکل" : "جزئیات ستون L شکل";
  scene.text(x + size, y + 5, title, 2.8, { anchor: "end", bold: true, gray: 0.15 });

  const toScene = (points: [number, number][]): [number, number][] =>
    points.map(([u, v]) => [left + u * w, top + v * h] as [number, number]);
  const outline = toScene(shapedColumnOutline(kind));
  scene.poly(outline, { width: 0.5, fill: 0.94 });
  // هاشور بتن فقط داخل خودِ مقطع (نه کل کادر محیطی؛ وگرنه گوشهٔ خالی هاشور می‌خورد)
  if (kind === "column-l") {
    scene.hatch(left, top, w * 0.42, h, 4.2, { gray: 0.9, width: 0.1, pattern: "concrete" });
    scene.hatch(left + w * 0.42, top, w * 0.58, h * 0.42, 4.2, { gray: 0.9, width: 0.1, pattern: "concrete" });
  } else {
    scene.hatch(left, top, w, h * 0.36, 4.2, { gray: 0.9, width: 0.1, pattern: "concrete" });
    scene.hatch(left + w * 0.32, top + h * 0.36, w * 0.36, h * 0.64, 4.2, { gray: 0.9, width: 0.1, pattern: "concrete" });
  }

  // خاموت بسته با پوشش ۳ سانتی‌متر
  const inset = Math.min(0.14, Math.max(0.03 / Math.max(member.b, member.h), 0.035));
  const stirrup = toScene(shapedStirrupPath(kind, inset));
  scene.poly(stirrup, { width: 0.35, gray: 0.2 });
  // دو قلاب ۱۳۵ درجهٔ خاموت در گوشهٔ آزاد
  const hookBase = stirrup[stirrup.length - 1];
  const hookEnd = stirrup[0];
  const hx = hookEnd[0] - hookBase[0];
  const hy = hookEnd[1] - hookBase[1];
  const hl = Math.hypot(hx, hy) || 1;
  scene.line(hookBase[0], hookBase[1], hookBase[0] + hx * 0.35 - (hy / hl) * 2.4, hookBase[1] + hy * 0.35 + (hx / hl) * 2.4, {
    width: 0.3,
    gray: 0.25,
  });

  // میلگردها: گوشه‌های مسیر خاموت + دو شاخهٔ میانی در اضلاع بلند
  const r = Math.max(0.75, (member.bars.mainDia / 1000) * scale * 0.5);
  // تعداد میلگردهای رسم‌شده باید **دقیقاً** با جدول میلگرد یکی باشد؛ وگرنه
  // نقشه و متره با هم نمی‌خوانند. ابتدا گوشه‌ها، سپس میانهٔ بلندترین اضلاع.
  const bars: [number, number][] = stirrup.map(([bx, by]) => [bx, by] as [number, number]);
  const edges = stirrup
    .map(([x1, y1], index) => {
      const [x2, y2] = stirrup[(index + 1) % stirrup.length];
      return { x1, y1, x2, y2, len: Math.hypot(x2 - x1, y2 - y1) };
    })
    .sort((a, b) => b.len - a.len);
  const target = Math.max(bars.length, member.bars.mainCount);
  for (const edge of edges) {
    if (bars.length >= target) break;
    bars.push([(edge.x1 + edge.x2) / 2, (edge.y1 + edge.y2) / 2]);
  }
  bars.slice(0, target).forEach(([cx, cy]) => scene.circle(cx, cy, r, { fill: 0.2, width: 0.15 }));

  // اندازه‌گذاری: عرض و ارتفاع کل مقطع + ضخامت بال
  const dimY = top + h + 6;
  scene.line(left, dimY, left + w, dimY, { width: 0.2, gray: 0.4 });
  for (const dx of [left, left + w]) scene.line(dx - 1.2, dimY - 1.2, dx + 1.2, dimY + 1.2, { width: 0.2, gray: 0.4 });
  scene.text(left + w / 2, dimY + 4.4, `${faNumber(member.b)} متر`, 1.9, { anchor: "middle", gray: 0.4 });
  const dimX = left + w + 5;
  scene.line(dimX, top, dimX, top + h, { width: 0.2, gray: 0.4 });
  for (const dy of [top, top + h]) scene.line(dimX - 1.2, dy, dimX + 1.2, dy, { width: 0.2, gray: 0.4 });
  scene.text(dimX + 1.4, top + h / 2, `${faNumber(member.h)} متر`, 1.9, { anchor: "start", gray: 0.4 });

  // ضخامت بال: مقدار نسبت ثابت هندسه (۰٫۴۲ عرض / ۰٫۳۶ عمق)
  const flange = kind === "column-t" ? member.h * 0.36 : member.b * 0.42;
  scene.text(left + w / 2, top + h + 16, `ضخامت بال ${faNumber(round(flange, 2))} متر`, 1.8, { anchor: "middle", gray: 0.45 });
  scene.text(left + w / 2, top + h + 21, member.bars.note, 1.8, { anchor: "middle", gray: 0.35 });
  scene.text(left + w / 2, top - 3.4, `مقطع ${barLabel(member.bars.mainCount, member.bars.mainDia)}`, 2.1, {
    anchor: "middle",
    gray: 0.25,
  });
}

/** مقطع تیر با آرماتور بالا/پایین. */
function drawBeamDetail(scene: Scene, member: RebarMember, x: number, y: number, size: number, available = 0): void {
  const heightBudget = available > 0 ? Math.max(16, available - 34) : 1e6;
  const scale = Math.min(80, (size - 12) / Math.max(member.b, member.h), heightBudget / Math.max(member.b, member.h));
  const w = member.b * scale;
  const h = member.h * scale;
  const left = x + (size - w) / 2;
  const top = y + 8;
  scene.text(x + size, y + 5, "جزئیات تیر", 2.8, { anchor: "end", bold: true, gray: 0.15 });
  scene.rect(left, top, w, h, { width: 0.5 });
  scene.hatch(left, top, w, h, 3.4, { gray: 0.78, width: 0.11, pattern: "concrete" });
  const inset = Math.min(w, h) * 0.14;
  scene.rect(left + inset, top + inset, w - inset * 2, h - inset * 2, { width: 0.3, gray: 0.2, dash: [1.6, 1] });
  const r = Math.max(0.6, (member.bars.mainDia / 1000) * scale * 0.5);
  const count = Math.max(2, Math.round(member.bars.mainCount / 2));
  for (let index = 0; index < count; index += 1) {
    const cx = left + inset + ((w - inset * 2) * index) / Math.max(1, count - 1);
    scene.circle(cx, top + inset, r, { fill: 0.25, width: 0.2 });
    scene.circle(cx, top + h - inset, r, { fill: 0.25, width: 0.2 });
  }
  scene.text(left + w / 2, top + h + 8, `دهانه ${faNumber(member.length)} متر`, 2.4, { anchor: "middle", gray: 0.3 });
  scene.text(left + w / 2, top + h + 13, member.bars.note, 2.2, { anchor: "middle", gray: 0.35 });
  scene.text(left + w / 2, top - 4, `مقطع ${faNumber(member.b)}×${faNumber(member.h)}`, 2.2, { anchor: "middle", gray: 0.25, direction: "ltr" });
}

/** جزئیات پی: مقطع با شبکهٔ آرماتور و هاشور بتن. */
function drawFootingDetail(scene: Scene, member: RebarMember, x: number, y: number, size: number, available = 0): void {
  const heightBudget = available > 0 ? Math.max(12, available - 40) : 1e6;
  const scale = Math.min(90, (size - 12) / Math.max(member.b, 0.6), heightBudget / Math.max(member.length, 0.2));
  const w = member.b * scale;
  const h = Math.max(6, member.length * scale);
  const left = x + (size - w) / 2;
  const top = y + 14;
  scene.text(x + size, y + 5, "جزئیات پی", 2.8, { anchor: "end", bold: true, gray: 0.15 });
  scene.rect(left, top, w, h, { width: 0.5 });
  scene.hatch(left, top, w, h, 3, { gray: 0.55, width: 0.16, pattern: "concrete" });
  // شبکهٔ آرماتور
  const coverMm = Math.max(1.5, w * (CONCRETE_COVER / member.b));
  scene.line(left + coverMm, top + h - coverMm, left + w - coverMm, top + h - coverMm, { width: 0.5, gray: 0.1 });
  for (let cx = left + coverMm; cx <= left + w - coverMm + 0.001; cx += 3.2) {
    scene.circle(cx, top + h - coverMm, 0.7, { fill: 0.2, width: 0.1 });
  }
  scene.text(left + w / 2, top + h + 8, `عرض ${faNumber(member.b)} متر · ضخامت ${faNumber(member.length)} متر`, 2.3, { anchor: "middle", gray: 0.3 });
  scene.text(left + w / 2, top + h + 13, member.bars.note, 2.1, { anchor: "middle", gray: 0.35 });
}

/** جدول میلگرد روی برگه. */
function drawRebarTable(scene: Scene, schedule: RebarSchedule, x: number, y: number, w: number, h: number): number {
  scene.text(x + w, y + 5, "جدول میلگرد", 3.2, { anchor: "end", bold: true });
  const headers = ["ردیف", "عضو", "قطر (mm)", "تعداد", "طول شاخه (m)", "طول کل (m)", "وزن (kg)", "شرح"];
  const widths = [10, 46, 16, 13, 24, 22, 18, 36];
  const total = widths.reduce((sum, value) => sum + value, 0);
  const factor = w / total;
  const rowH = 5.4;
  const tableTop = y + 9;
  const height = Math.min(h - 30, rowH * (schedule.rows.length + 1));
  scene.rect(x, tableTop, w, height, { width: 0.35, gray: 0.3 });
  // سرستون‌ها
  scene.rect(x, tableTop, w, rowH, { fill: 0.9, width: 0.35, gray: 0.3 });
  let cursor = x + w;
  headers.forEach((header, index) => {
    const cellW = widths[index] * factor;
    if (index > 0) scene.line(cursor, tableTop, cursor, tableTop + height, { width: 0.15, gray: 0.55 });
    scene.text(cursor - cellW / 2, tableTop + rowH - 2, header, 1.9, { anchor: "middle", gray: 0.15 });
    cursor -= cellW;
  });
  scene.line(x, tableTop + rowH, x + w, tableTop + rowH, { width: 0.25, gray: 0.45 });

  const visible = schedule.rows.slice(0, Math.max(1, Math.floor((height - rowH) / rowH)));
  visible.forEach((row, index) => {
    const rowY = tableTop + rowH * (index + 1);
    if (index % 2 === 0) scene.rect(x, rowY, w, rowH, { fill: 0.97, width: 0, gray: 1 });
    scene.line(x, rowY, x + w, rowY, { width: 0.12, gray: 0.7 });
    const cells = [
      faNumber(index + 1, 0),
      row.member,
      faNumber(row.diameterMm, 0),
      faNumber(row.count, 0),
      faNumber(row.lengthM),
      faNumber(row.totalLengthM, 1),
      faNumber(row.weightKg, 1),
      row.note,
    ];
    let cellCursor = x + w;
    cells.forEach((cell, cellIndex) => {
      const cellW = widths[cellIndex] * factor;
      const isNumber = cellIndex >= 2 && cellIndex <= 6;
      const size = cellIndex === 7 ? 1.6 : 1.9;
      scene.text(cellCursor - cellW / 2, rowY + rowH - 2, cell, size, {
        anchor: "middle",
        gray: 0.12,
        direction: isNumber ? "ltr" : "rtl",
      });
      if (cellIndex > 0) scene.line(cellCursor, rowY, cellCursor, rowY + rowH, { width: 0.1, gray: 0.75 });
      cellCursor -= cellW;
    });
  });
  const tableBottom = tableTop + rowH * (visible.length + 1);
  const hidden = schedule.rows.length - visible.length;
  if (hidden > 0) {
    scene.text(x + w / 2, tableBottom + 4.4, `و ${hidden.toLocaleString("fa-IR")} ردیف دیگر — فهرست کامل در خروجی XLSX/CSV`, 1.9, {
      anchor: "middle",
      gray: 0.45,
    });
  }
  const totalY = tableBottom + (hidden > 0 ? 10 : 6);
  scene.text(x + w, totalY, `جمع وزن میلگرد: ${faNumber(schedule.totalWeightKg)} کیلوگرم`, 2.6, {
    anchor: "end",
    bold: true,
  });
  return totalY;
}

/**
 * جدول برش میلگرد (Bar Bending Schedule).
 *
 * چرا لازم است: «جدول میلگرد» می‌گوید چه چیزی و چه مقدار، اما کارخانهٔ آرماتور
 * و متره‌ور «طول برش» و «شکل خم» می‌خواهد. ستون «شکل» با یک نماد کوچک رسم
 * می‌شود تا اپراتور بدون مراجعه به متن بداند میلگرد مستقیم است، خاموت بسته یا
 * مارپیچ شمع. طول برش از همان `hoopLength`/`mainLength` می‌آید که قلاب‌های
 * ۱۰db در آن لحاظ شده است.
 */
function drawBarShape(scene: Scene, cx: number, cy: number, shape: BarShape, size: number): void {
  const h = size / 2;
  if (shape === "stirrup") {
    scene.poly([[cx - h, cy - h * 0.8], [cx + h, cy - h * 0.8], [cx + h, cy + h * 0.8], [cx - h, cy + h * 0.8]], {
      width: 0.25,
      gray: 0.15,
    });
    // دو قلاب ۱۳۵ درجه در گوشه
    scene.line(cx - h, cy - h * 0.8, cx - h + h * 0.5, cy - h * 0.8 - h * 0.45, { width: 0.2, gray: 0.15 });
    scene.line(cx + h, cy + h * 0.8, cx + h - h * 0.5, cy + h * 0.8 + h * 0.45, { width: 0.2, gray: 0.15 });
    return;
  }
  if (shape === "spiral") {
    const steps = 6;
    const points: [number, number][] = [];
    for (let index = 0; index <= steps; index += 1) {
      points.push([cx - h + (index / steps) * size, cy + (index % 2 === 0 ? -h : h) * 0.7]);
    }
    scene.poly(points, { closed: false, width: 0.22, gray: 0.15 });
    return;
  }
  if (shape === "mesh") {
    for (const offset of [-h * 0.6, 0, h * 0.6]) {
      scene.line(cx - h, cy + offset, cx + h, cy + offset, { width: 0.2, gray: 0.3 });
    }
    return;
  }
  // مستقیم با دو قلاب انتهایی (شکل ۱ رایج)
  scene.line(cx - h, cy, cx + h, cy, { width: 0.25, gray: 0.15 });
  scene.line(cx - h, cy, cx - h + h * 0.35, cy - h * 0.55, { width: 0.2, gray: 0.15 });
  scene.line(cx + h, cy, cx + h - h * 0.35, cy - h * 0.55, { width: 0.2, gray: 0.15 });
}

type BarShape = "straight" | "stirrup" | "spiral" | "mesh";

const SHAPE_LABELS: Record<BarShape, string> = {
  straight: "مستقیم",
  stirrup: "خاموت بسته",
  spiral: "مارپیچ",
  mesh: "شبکه",
};

function shapeOfRow(note: string): BarShape {
  if (/مارپیچ/.test(note)) return "spiral";
  if (/خاموت|تنگی/.test(note)) return "stirrup";
  if (/شبکه/.test(note)) return "mesh";
  return "straight";
}

function drawBendingTable(scene: Scene, schedule: RebarSchedule, x: number, y: number, w: number, maxH: number): number {
  const rowH = 5;
  const capacity = Math.floor((maxH - 12) / rowH) - 1;
  if (capacity < 3) return y;
  const rows = schedule.rows.slice(0, Math.min(capacity, schedule.rows.length));
  if (rows.length === 0) return y;

  scene.text(x + w, y + 5, "جدول برش میلگرد (BBS)", 3, { anchor: "end", bold: true });
  const headers = ["ردیف", "عضو", "قطر", "تعداد", "طول برش (m)", "وزن (kg)", "شکل"];
  const widths = [10, 44, 12, 12, 24, 18, 16];
  const total = widths.reduce((sum, value) => sum + value, 0);
  const factor = w / total;
  const tableTop = y + 9;
  const height = rowH * (rows.length + 1);
  scene.rect(x, tableTop, w, height, { width: 0.35, gray: 0.3 });
  scene.rect(x, tableTop, w, rowH, { fill: 0.9, width: 0.35, gray: 0.3 });
  let cursor = x + w;
  headers.forEach((header, index) => {
    const cellW = widths[index] * factor;
    if (index > 0) scene.line(cursor, tableTop, cursor, tableTop + height, { width: 0.15, gray: 0.55 });
    scene.text(cursor - cellW / 2, tableTop + rowH - 1.8, header, 1.8, { anchor: "middle", gray: 0.15 });
    cursor -= cellW;
  });
  scene.line(x, tableTop + rowH, x + w, tableTop + rowH, { width: 0.25, gray: 0.45 });

  rows.forEach((row, index) => {
    const rowY = tableTop + rowH * (index + 1);
    if (index % 2 === 0) scene.rect(x, rowY, w, rowH, { fill: 0.97, width: 0, gray: 1 });
    scene.line(x, rowY, x + w, rowY, { width: 0.12, gray: 0.7 });
    const shape = shapeOfRow(row.note);
    const cells = [
      faNumber(index + 1, 0),
      row.member,
      faNumber(row.diameterMm, 0),
      faNumber(row.count, 0),
      faNumber(row.lengthM),
      faNumber(row.weightKg, 1),
      "",
    ];
    let cellCursor = x + w;
    cells.forEach((cell, cellIndex) => {
      const cellW = widths[cellIndex] * factor;
      if (cellIndex === 6) {
        drawBarShape(scene, cellCursor - cellW / 2, rowY + rowH / 2, shape, Math.min(cellW * 0.55, rowH * 0.75));
      } else {
        const isNumberText = cellIndex >= 2 && cellIndex <= 5;
        scene.text(cellCursor - cellW / 2, rowY + rowH - 1.7, cell, cellIndex === 1 ? 1.55 : 1.8, {
          anchor: "middle",
          gray: 0.12,
          direction: isNumberText ? "ltr" : "rtl",
        });
      }
      if (cellIndex > 0) scene.line(cellCursor, rowY, cellCursor, rowY + rowH, { width: 0.1, gray: 0.75 });
      cellCursor -= cellW;
    });
  });

  const bottom = tableTop + height;
  const hidden = schedule.rows.length - rows.length;
  const note = hidden > 0 ? `و ${faNumber(hidden, 0)} ردیف دیگر در خروجی XLSX` : "طول برش شامل قلاب/گیرش ۱۰db است · پوشش ۳ سانتی‌متر";
  scene.text(x + w, bottom + 4.2, note, 1.7, { anchor: "end", gray: 0.45 });
  // این جدول فقط برای ردیف‌های اتصال است؛ شرح کامل شکل‌ها در یادداشت‌ها می‌آید.
  void SHAPE_LABELS;
  return bottom + 6;
}

/** جزئیات دیوار برشی/شمع: نمای آرماتوربندی ساده. */
/**
 * مقطع افقی المان مرزی دیوار برشی.
 *
 * چرا لازم است: مبحث نهم برای دیوار برشی، «ناحیهٔ محصور» در دو انتها الزام
 * می‌کند (طول ≥ ۱۵٪ طول دیوار و ≥ ۴۰ سانتی‌متر) با خاموت متراکم و میلگرد
 * قائم متمرکز. بدون این مقطع، نمای آرماتوربندی دیوار برای اجرا کافی نیست.
 * مقادیر این ماژول همان فرض‌های موتور آرماتور است (پوشش ۳ سانتی‌متر، خاموت
 * Ø۸ هر ۲۰ و متراکم‌تر در ناحیهٔ مرزی) و روی خودِ برگه نوشته می‌شود.
 */
function drawBoundarySection(
  scene: Scene,
  member: RebarMember,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const thickness = Math.max(0.15, member.b); // ضخامت دیوار (متر)
  const lengthAlong = Math.max(1, member.h); // طول دیوار (متر)
  const confined = Math.min(lengthAlong * 0.5, Math.max(0.4, 0.15 * lengthAlong));

  // مقیاس ۱:۲۰ (۵۰ میلی‌متر کاغذ بر متر) — همان مقیاس متعارف مقاطع اجرایی.
  // کل ۸ متر دیوار رسم نمی‌شود؛ ناحیهٔ محصور + بخشی از میانه و بعد «شکست»
  // (break line) می‌آید تا ضخامت و خاموت‌ها خوانا بمانند.
  const scale = Math.min(50, (width - 30) / (confined + 0.9));
  const L = (confined + 0.85) * scale;
  const T = Math.max(10, thickness * scale);
  const left = x + (width - L) / 2 - 2;
  const top = y + 26;

  scene.text(x + width - 4, y + 6, "مقطع افقی — المان مرزی", 2.1, { anchor: "end", gray: 0.35 });
  scene.rect(left, top, L, T, { width: 0.45 });
  scene.hatch(left, top, L, T, 3.4, { gray: 0.62, width: 0.15, pattern: "concrete" });

  // ناحیهٔ محصور
  const bc = confined * scale;
  scene.rect(left, top, bc, T, { width: 0.4, gray: 0.2 });
  const hoopStep = Math.max(1.5, 0.075 * scale);
  for (let gx = left + hoopStep; gx < left + bc - 0.4; gx += hoopStep) {
    scene.line(gx, top + 0.7, gx, top + T - 0.7, { width: 0.18, gray: 0.12 });
  }
  // خاموت معمولی میانهٔ دیوار
  for (let gx = left + bc + 0.2 * scale; gx < left + L - 1.2; gx += Math.max(2.4, 0.2 * scale)) {
    scene.line(gx, top + 0.7, gx, top + T - 0.7, { width: 0.14, gray: 0.45, dash: [1.6, 1.4] });
  }
  // میلگرد قائم: ۴ شاخه متمرکز در ناحیهٔ محصور + دو لایه در میانه
  const barR = Math.max(0.7, 0.016 * scale * 0.5);
  for (let index = 0; index < 4; index += 1) {
    const bx = left + 2 + index * Math.max(2.6, (bc - 4) / 3);
    scene.circle(bx, top + T * 0.25, barR, { fill: 0.2, width: 0.12 });
    scene.circle(bx, top + T * 0.75, barR, { fill: 0.2, width: 0.12 });
  }
  for (let gx = left + bc + 0.2 * scale; gx < left + L - 1.6; gx += Math.max(4, 0.2 * scale)) {
    scene.circle(gx, top + T * 0.25, barR, { fill: 0.35, width: 0.1 });
    scene.circle(gx, top + T * 0.75, barR, { fill: 0.35, width: 0.1 });
  }

  // شکست در انتهای راست (ادامهٔ دیوار)
  const bx0 = left + L;
  scene.poly([[bx0 - 1.4, top], [bx0 + 1.2, top + T * 0.35], [bx0 - 1.4, top + T * 0.7], [bx0 + 1.2, top + T]], {
    closed: false,
    width: 0.25,
    gray: 0.3,
  });

  // اندازه‌گذاری: طول ناحیهٔ محصور و ضخامت دیوار
  const dimY = top + T + 5;
  scene.line(left, dimY, left + bc, dimY, { width: 0.2, gray: 0.4 });
  for (const dx of [left, left + bc]) scene.line(dx - 1.2, dimY - 1.2, dx + 1.2, dimY + 1.2, { width: 0.2, gray: 0.4 });
  scene.text(left + bc / 2, dimY + 4, `${faNumber(confined)} متر`, 1.8, { anchor: "middle", gray: 0.4 });
  const dimX = left + L + 6;
  scene.line(dimX, top, dimX, top + T, { width: 0.2, gray: 0.4 });
  for (const dy of [top, top + T]) scene.line(dimX - 1.2, dy, dimX + 1.2, dy, { width: 0.2, gray: 0.4 });
  scene.text(dimX + 1.6, top + T / 2 + 0.7, `${faNumber(thickness)} متر`, 1.7, { anchor: "start", gray: 0.4 });

  scene.text(left + bc / 2, top - 2.2, "ناحیهٔ محصور", 1.8, { anchor: "middle", gray: 0.3 });
  scene.text(left + L / 2, dimY + 9, "خاموت ۸: هر ۷٫۵ در ناحیهٔ محصور · هر ۲۰ در میانه", 1.65, { anchor: "middle", gray: 0.4 });
  scene.text(left + L / 2, dimY + 13, "مقیاس ۱:۲۰ · میلگرد قائم مطابق جدول میلگرد", 1.6, { anchor: "middle", gray: 0.45 });
}

function drawWallDetail(scene: Scene, member: RebarMember, x: number, y: number, size: number, height: number): void {
  const title =
    member.kind === "pile" ? "جزئیات شمع" : member.kind === "retaining-wall" ? "جزئیات دیوار حائل" : "جزئیات دیوار برشی";
  scene.text(x + size, y + 5, title, 2.8, { anchor: "end", bold: true, gray: 0.15 });

  // نمای آرماتوربندی باید «تناسب» داشته باشد: دیوار ۸ متری نباید مثل یک مربع
  // ۳×۳ دیده شود. طول و ارتفاع از خود عضو گرفته می‌شود و مقیاس طوری انتخاب
  // می‌شود که در سلول جا شود (شمع استثناست، چون نمای قائم آن بلند و باریک است).
  const isPile = member.kind === "pile";
  const lengthM = isPile ? 1 : Math.max(1, member.h);
  const heightM = Math.max(1, member.length);
  // برای دیوار برشی/حائل، نیمهٔ چپ سلول به مقطع المان مرزی اختصاص می‌یابد
  const hasBoundary = !isPile && (member.kind === "shear-wall" || member.kind === "retaining-wall");
  const availableH = Math.max(24, hasBoundary ? height - 40 : height - 30);
  const availableW = Math.max(24, hasBoundary ? size * 0.5 - 18 : size - 30);
  const scale = isPile
    ? availableH / heightM
    : Math.min(availableW / lengthM, availableH / heightM);
  const w = Math.max(14, lengthM * scale);
  const h = Math.max(24, heightM * scale);
  const left = hasBoundary
    ? x + size - 12 - w
    : x + 12 + (availableW - w) / 2;
  const top = y + 16;

  scene.rect(left, top, w, h, { width: 0.45 });
  scene.hatch(left, top, w, h, 3.4, { gray: 0.55, width: 0.16, pattern: "concrete" });

  // دو لایهٔ میلگرد قائم در دو لبه (لبهٔ کشش و فشار) + میلگرد افقی
  const cover = 2.2;
  for (let gy = top + 4; gy < top + h - 2; gy += 4) {
    scene.circle(left + cover, gy, 0.6, { fill: 0.25, width: 0.1 });
    scene.circle(left + w - cover, gy, 0.6, { fill: 0.25, width: 0.1 });
  }
  const horizontalCount = Math.max(2, Math.round(heightM / 0.2));
  const stepY = (h - 2 * cover) / Math.max(1, horizontalCount - 1);
  for (let index = 0; index < horizontalCount; index += 1) {
    const gy = top + cover + index * stepY;
    scene.line(left + cover, gy, left + w - cover, gy, { width: 0.12, gray: 0.55, dash: [2, 1] });
  }

  // اندازه‌گذاری: طول دیوار (پایین) و ارتفاع (چپ)
  const dimY = top + h + 4;
  scene.line(left, dimY, left + w, dimY, { width: 0.2, gray: 0.4 });
  for (const dx of [left, left + w]) {
    scene.line(dx - 1.2, dimY - 1.2, dx + 1.2, dimY + 1.2, { width: 0.2, gray: 0.4 });
  }
  const dimX = left - 5;
  scene.line(dimX, top, dimX, top + h, { width: 0.2, gray: 0.4 });
  for (const dy of [top, top + h]) {
    scene.line(dimX - 1.2, dy - 1.2, dimX + 1.2, dy + 1.2, { width: 0.2, gray: 0.4 });
  }
  scene.text(left + w / 2, dimY + 4, `${faNumber(lengthM)} متر`, 1.9, { anchor: "middle", gray: 0.4 });
  if (hasBoundary) {
    scene.text(left + w / 2, top + h + 12, member.bars.note, 1.8, { anchor: "middle", gray: 0.35 });
    drawBoundarySection(scene, member, x + 6, y, size * 0.46, height);
    return;
  }
  scene.text(left + w / 2, top + h + 12, member.bars.note, 1.9, { anchor: "middle", gray: 0.35 });
}

/** جزئیات تیپ دال: مقطع دال دوطرفه با شبکهٔ بالا و پایین روی تیرهای تکیه‌گاه. */
function drawSlabDetail(
  scene: Scene,
  data: { thickness: number; span: number; topNote: string; bottomNote: string },
  x: number,
  y: number,
  size: number,
): void {
  scene.text(x + size, y + 5, "جزئیات تیپ دال", 2.8, { anchor: "end", bold: true, gray: 0.15 });

  // چیدمان: مقطع دال در دو سوم چپ، پلان شبکهٔ آرماتور در یک سوم راست.
  // پیش‌تر فقط مقطع رسم می‌شد و نوار بزرگی از سلول خالی می‌ماند؛ پلان شبکه هم
  // همان چیزی است که دفتر فنی برای بستن میلگرد دال لازم دارد.
  const planW = Math.max(28, size * 0.3);
  const sectionW = size - planW - 10;

  const scale = Math.min(70, (sectionW - 46) / data.span);
  const spanMm = data.span * scale;
  const thicknessMm = Math.max(6, data.thickness * scale);
  const beamW = Math.max(5, spanMm * 0.04);
  const beamH = Math.max(8, thicknessMm * 1.8);
  const left = x + (sectionW - spanMm) / 2;
  const top = y + 18;
  scene.rect(left, top, spanMm, thicknessMm, { width: 0.5 });
  scene.hatch(left, top, spanMm, thicknessMm, 2.4, { gray: 0.55, width: 0.16, pattern: "concrete" });
  for (const bx of [left - beamW, left + spanMm]) {
    scene.rect(bx, top + thicknessMm, beamW, beamH, { width: 0.45 });
    scene.hatch(bx, top + thicknessMm, beamW, beamH, 2, { gray: 0.62, width: 0.14, pattern: "concrete" });
  }
  const cover = Math.max(1.2, thicknessMm * 0.22);
  for (const barY of [top + cover, top + thicknessMm - cover]) {
    scene.line(left + 1, barY, left + spanMm - 1, barY, { width: 0.45, gray: 0.05 });
    const step = Math.max(3.6, spanMm / 16);
    for (let cx = left + 3; cx <= left + spanMm - 3; cx += step) {
      scene.circle(cx, barY, 0.55, { fill: 0.2, width: 0.1 });
    }
  }
  // اندازه‌گذاری ضخامت (سمت چپ، تا از کادر بیرون نزند)
  const dimX = left - beamW - 4;
  scene.line(dimX, top, dimX, top + thicknessMm, { width: 0.2, gray: 0.4 });
  scene.line(dimX - 1.2, top, dimX + 1.2, top, { width: 0.2, gray: 0.4 });
  scene.line(dimX - 1.2, top + thicknessMm, dimX + 1.2, top + thicknessMm, { width: 0.2, gray: 0.4 });
  scene.text(left, top - 3, `ضخامت ${faNumber(data.thickness)} متر`, 2, { gray: 0.35 });
  const textTop = top + thicknessMm + beamH + 7;
  scene.text(left + spanMm / 2, textTop, `دهانهٔ تیپ ${faNumber(data.span)} متر`, 2.2, { anchor: "middle", gray: 0.3 });
  scene.text(left + spanMm / 2, textTop + 5, data.bottomNote, 1.9, { anchor: "middle", gray: 0.35 });
  scene.text(left + spanMm / 2, textTop + 9.5, data.topNote, 1.9, { anchor: "middle", gray: 0.35 });

  /* ── پلان شبکهٔ آرماتور (یک دهانهٔ تیپ) ── */
  const planSpanM = Math.min(3.4, data.span);
  const planScale = planW / planSpanM;
  const planDepthM = Math.min(2.2, planSpanM * 0.7);
  const planH = planDepthM * planScale;
  const px = x + size - planW;
  const py = y + 20;
  // تیرهای مرزی
  // تیرهای مرزی: نوار دوتایی (خط داخلی وجه تیر)
  scene.rect(px, py, planW, planH, { width: 0.5 });
  scene.rect(px + 2.4, py + 2.4, planW - 4.8, planH - 4.8, { width: 0.3, gray: 0.35 });
  // میلگرد دوطرفه هر ۲۰ سانتی‌متر
  const meshStep = 0.2 * planScale;
  // میلگردها فقط تا وجه داخلی تیرهای مرزی کشیده می‌شوند، نه روی نوار تیر.
  const inner = 3.2;
  for (let gx = px + inner + meshStep; gx < px + planW - inner; gx += meshStep) {
    scene.line(gx, py + inner, gx, py + planH - inner, { width: 0.3, gray: 0.12 });
  }
  for (let gy = py + inner + meshStep; gy < py + planH - inner; gy += meshStep) {
    scene.line(px + inner, gy, px + planW - inner, gy, { width: 0.3, gray: 0.12 });
  }
  scene.text(px + planW / 2, py + planH + 5, "پلان شبکهٔ آرماتور دال", 1.9, { anchor: "middle", gray: 0.35 });
  scene.text(px + planW / 2, py + planH + 9.5, "میلگرد ۱۲ هر ۲۰ دوطرفه", 1.8, { anchor: "middle", gray: 0.4 });
}

/** جزئیات اتصال تیر به ستون: ناحیهٔ اتصال، خاموت متراکم و طول وصله. */
/**
 * جزئیات سقف تیرچه‌بلوک (مقطع عمود بر تیرچه‌ها).
 *
 * چرا لازم است: سقف تیرچه‌بلوک پرکاربردترین سقف مسکونی ایران است و جزئیات آن —
 * گام تیرچه، بتن رویه، شبکهٔ حرارتی و میلگرد تیرچه — روی برگهٔ سازه باید باشد.
 * مقیاس ترسیمی ثابت است (نمونهٔ تیپ)، نه مقیاس واقعی؛ ابعاد عددی چاپ می‌شود.
 */
function drawJoistSlabDetail(scene: Scene, x: number, y: number, size: number, available = 0): void {
  scene.text(x + size, y + 5, "جزئیات سقف تیرچه‌بلوک", 2.8, { anchor: "end", bold: true, gray: 0.15 });

  const pitch = Math.min(15, size / 6.2); // گام تیرچه روی کاغذ
  const joistW = pitch * 0.28;
  const blockW = pitch - joistW - 1.2;
  const topH = 6; // بتن رویه
  const joistH = Math.min(20, Math.max(14, (available > 0 ? available : 60) * 0.3));
  const bays = 4;
  const totalW = pitch * bays + joistW;
  const left = x + Math.max(6, (size - totalW) / 2);
  const top = y + 16;

  // بتن رویه
  scene.rect(left, top, totalW, topH, { width: 0.45 });
  scene.hatch(left, top, totalW, topH, 2.2, { gray: 0.62, width: 0.13, pattern: "concrete" });
  // شبکهٔ حرارتی (میلگرد ۶ هر ۲۰) در بتن رویه
  for (let gx = left + 3; gx <= left + totalW - 2; gx += 4.6) {
    scene.circle(gx, top + topH / 2, 0.55, { fill: 0.25, width: 0.1 });
  }
  scene.text(left + totalW + 2, top + topH - 0.6, "بتن رویه ۶", 1.8, { anchor: "start", gray: 0.4 });

  // تیرچه‌ها و بلوک‌ها
  for (let index = 0; index <= bays; index += 1) {
    const jx = left + index * pitch;
    scene.rect(jx, top + topH, joistW, joistH, { width: 0.45 });
    scene.hatch(jx, top + topH, joistW, joistH, 2.6, { gray: 0.64, width: 0.14, pattern: "concrete" });
    // میلگرد پایین ۱۲ و بالای ۸ تیرچه
    scene.circle(jx + joistW / 2, top + topH + joistH - 1.8, Math.max(0.7, joistW * 0.22), { fill: 0.12, width: 0.1 });
    scene.circle(jx + joistW / 2, top + topH + 1.8, Math.max(0.45, joistW * 0.15), { fill: 0.3, width: 0.1 });
    if (index === bays) continue;
    const bx = jx + joistW + 0.6;
    scene.rect(bx, top + topH, blockW, joistH, { width: 0.35, gray: 0.3 });
    // بلوک سفالی: دو جداره + تیغهٔ میانی و بافت بنایی
    scene.hatch(bx, top + topH, blockW, joistH, 2.8, { gray: 0.78, width: 0.1, pattern: "masonry" });
    scene.line(bx + blockW * 0.28, top + topH + 1, bx + blockW * 0.28, top + topH + joistH - 1, { width: 0.16, gray: 0.45 });
    scene.line(bx + blockW * 0.72, top + topH + 1, bx + blockW * 0.72, top + topH + joistH - 1, { width: 0.16, gray: 0.45 });
  }

  // اندازه‌گذاری گام تیرچه (پایین)
  const dimY = top + topH + joistH + 4;
  scene.line(left, dimY, left + totalW, dimY, { width: 0.2, gray: 0.4 });
  for (let index = 0; index <= bays; index += 1) {
    const dx = left + index * pitch + joistW / 2;
    scene.line(dx, dimY - 1.2, dx, dimY + 1.2, { width: 0.2, gray: 0.4 });
  }
  scene.text(left + totalW / 2, dimY + 4.4, "گام تیرچه ۵۰ سانتی‌متر", 1.9, { anchor: "middle", gray: 0.35 });
  scene.text(
    left + totalW / 2,
    dimY + 9,
    "میلگرد تیرچه: ۱ شاخهٔ ۱۲ پایین + ۱ شاخهٔ ۸ بالا · خاموت ۶ هر ۲۰ · شبکهٔ ۶ هر ۲۰",
    1.75,
    { anchor: "middle", gray: 0.4 },
  );
}

/**
 * جزئیات تقویت بازشوی دال.
 *
 * بازشوی دال (چاهک آسانسور، داکت، نورگیر) بدون میلگرد تقویتی اجرا نمی‌شود.
 * قاعدهٔ عرف: ۲ شاخهٔ ۱۶ در هر لبه به امتداد ۱۰۰ سانتی‌متر + ۲ شاخهٔ ۱۲ قطری در گوشه‌ها.
 */
function drawSlabOpeningDetail(scene: Scene, x: number, y: number, size: number, available = 0): void {
  scene.text(x + size, y + 5, "جزئیات بازشوی دال", 2.8, { anchor: "end", bold: true, gray: 0.15 });

  const planW = Math.min(size - 16, 78);
  const planH = Math.min(Math.max(28, (available > 0 ? available : 60) * 0.5), 46);
  const left = x + (size - planW) / 2;
  const top = y + 14;
  const opening = Math.min(planW, planH) * 0.34;
  const ox = left + (planW - opening) / 2;
  const oy = top + (planH - opening) / 2;
  // امتداد میلگرد تقویتی روی کاغذ؛ هرگز از لبهٔ دال بیرون نمی‌زند
  const ext = Math.max(5, Math.min(14, opening * 0.85, (planH - opening) / 2 - 2, (planW - opening) / 2 - 2));

  // دال، سپس بازشو با پس‌زمینهٔ سفید تا هاشور دال داخل بازشو دیده نشود
  scene.rect(left, top, planW, planH, { width: 0.45 });
  scene.hatch(left, top, planW, planH, 6, { gray: 0.86, width: 0.1 });
  scene.rect(ox, oy, opening, opening, { fill: 1, width: 0.55, gray: 0.1, dash: [2.4, 1.4] });
  scene.text(ox + opening / 2, oy + opening / 2 - 0.5, "بازشو", 1.9, { anchor: "middle", gray: 0.3 });
  scene.text(ox + opening / 2, oy + opening / 2 + 3.4, "۶۰×۶۰", 1.8, { anchor: "middle", gray: 0.4, direction: "ltr" });

  // میلگرد تقویتی ۲ شاخهٔ ۱۶ در هر لبه — بیرون از دهانهٔ بازشو، با امتداد دو طرف
  const pair = (x1: number, y1: number, x2: number, y2: number, offsetX: number, offsetY: number) => {
    scene.line(x1, y1, x2, y2, { width: 0.55, gray: 0.15 });
    scene.line(x1 + offsetX, y1 + offsetY, x2 + offsetX, y2 + offsetY, { width: 0.55, gray: 0.15 });
  };
  const gap = Math.max(1.1, opening * 0.06); // فاصلهٔ دو شاخه
  pair(ox - ext, oy - gap, ox + opening + ext, oy - gap, 0, -gap); // لبهٔ بالا
  pair(ox - ext, oy + opening + gap, ox + opening + ext, oy + opening + gap, 0, gap); // لبهٔ پایین
  pair(ox - gap, oy - ext, ox - gap, oy + opening + ext, -gap, 0); // لبهٔ چپ
  pair(ox + opening + gap, oy - ext, ox + opening + gap, oy + opening + ext, gap, 0); // لبهٔ راست

  // میلگرد قطری گوشه‌ها (۲ شاخهٔ ۱۲) در ناحیهٔ گوشه، بیرون از بازشو
  const diag = Math.max(4, opening * 0.32);
  for (const [cx, cy, sx, sy] of [
    [ox, oy, -1, -1],
    [ox + opening, oy, 1, -1],
    [ox, oy + opening, -1, 1],
    [ox + opening, oy + opening, 1, 1],
  ] as const) {
    for (const shift of [0, 1.1]) {
      scene.line(cx + sx * shift, cy + sy * shift, cx + sx * (diag + shift), cy + sy * (diag + shift), { width: 0.4, gray: 0.35 });
    }
  }

  // برچسب‌ها
  scene.text(left, top + planH + 5, "میلگرد تقویتی: ۲ شاخهٔ ۱۶ در هر لبه، امتداد ۱۰۰ سانتی‌متر از لبهٔ بازشو", 1.85, {
    anchor: "start",
    gray: 0.35,
  });
  scene.text(left, top + planH + 9.4, "گوشه‌ها: ۲ شاخهٔ ۱۲ قطری · بازشوی بزرگ‌تر از ۳۰ سانتی‌متر نیازمند محاسبه", 1.8, {
    anchor: "start",
    gray: 0.4,
  });
}

function drawConnectionDetail(scene: Scene, column: RebarMember, beam: RebarMember, x: number, y: number, size: number): void {
  const beamDrawLen = Math.min(beam.length, 4);
  const scale = Math.min(70, (size - 40) / (column.b + beamDrawLen));
  const colW = Math.max(10, column.b * scale);
  const colH = Math.max(30, Math.min(size * 0.45, colW * 2.4));
  const beamH = Math.max(8, beam.h * scale);
  const beamLen = beamDrawLen * scale;
  const left = x + (size - (colW + beamLen)) / 2;
  const top = y + 20;
  scene.text(x + size, y + 5, "جزئیات اتصال تیر به ستون", 2.8, { anchor: "end", bold: true, gray: 0.15 });
  scene.rect(left, top, colW, colH, { width: 0.55 });
  scene.hatch(left, top, colW, colH, 3.2, { gray: 0.62, width: 0.15, pattern: "concrete" });
  const inset = Math.max(1.2, colW * 0.2);
  for (const bx of [left + inset, left + colW - inset]) {
    scene.line(bx, top + 1.5, bx, top + colH - 1.5, { width: 0.5, gray: 0.05 });
  }
  // خاموت ستون در ارتفاع طبقه
  for (let gy = top + 5; gy < top + colH - 2; gy += 4.2) {
    scene.line(left + inset - 1.4, gy, left + colW - inset + 1.4, gy, { width: 0.25, gray: 0.35 });
  }
  // خاموت متراکم در ناحیهٔ اتصال (بالای ستون)
  for (let gy = top + 2; gy < top + Math.min(14, colH * 0.35); gy += 2) {
    scene.line(left + inset - 1.4, gy, left + colW - inset + 1.4, gy, { width: 0.35, gray: 0.15 });
  }
  // تیر واردشده از سمت راست
  const beamTop = top + colH * 0.3;
  scene.rect(left + colW, beamTop, beamLen, beamH, { width: 0.5 });
  const beamInset = Math.max(1.2, beamH * 0.2);
  for (const by of [beamTop + beamInset, beamTop + beamH - beamInset]) {
    scene.line(left + colW + 1, by, left + colW + beamLen - 1, by, { width: 0.5, gray: 0.05 });
  }
  for (let gx = left + colW + 4; gx < left + colW + beamLen - 2; gx += 4) {
    scene.line(gx, beamTop + beamInset - 1.2, gx, beamTop + beamH - beamInset + 1.2, { width: 0.25, gray: 0.35 });
  }
  // مقاطع و برچسب‌ها
  scene.text(left + colW / 2, top - 4, `ستون ${faNumber(column.b)}×${faNumber(column.h)}`, 1.9, {
    anchor: "middle",
    gray: 0.3,
  });
  scene.text(left + colW + beamLen / 2, beamTop + beamH + 4, `تیر ${faNumber(beam.b)}×${faNumber(beam.h)}`, 1.9, {
    anchor: "middle",
    gray: 0.3,
  });
  const lap = 40 * (column.bars.mainDia / 1000);
  const noteTop = top + colH + 8;
  scene.text(left, noteTop, `طول وصله ${faNumber(lap)} متر (۴۰db)`, 2.1, { gray: 0.3 });
  scene.text(
    left,
    noteTop + 5,
    `خاموت ستون ${faNumber(column.bars.hoopDia, 0)} هر ${faNumber(COLUMN_HOOP_SPACING * 100, 0)} سانتی‌متر`,
    2,
    { gray: 0.35 },
  );
  scene.text(left, noteTop + 10, "خاموت متراکم ناحیهٔ اتصال هر ۷٫۵ سانتی‌متر در ناحیهٔ ۲h", 1.9, { gray: 0.4 });
}

/** ساخت صحنهٔ برگهٔ جزئیات (مشترک SVG و PDF). */
export function detailSheetScene(doc: StudioDocument): { scene: Scene; schedule: RebarSchedule } {
  const schedule = rebarSchedule(doc);
  const { sheet, area } = frameOf(doc);
  const scene = new Scene();
  sheetChrome(scene, doc, "جزئیات اجرایی سازه و جدول میلگرد", `${doc.project.code} · ${doc.sheet.format} · ویرایش ${doc.revision}`);

  // ستون اول: جزئیات؛ ستون دوم: جدول میلگرد
  const detailW = area.w * 0.56;
  const tableW = area.w - detailW - 4;
  const cellW = detailW / 2;
  const cellH = (area.h - 10) / 2;
  const columns = schedule.members.filter(
    (member) =>
      member.kind === "column" ||
      member.kind === "column-round" ||
      member.kind === "column-l" ||
      member.kind === "column-t",
  );
  const beams = schedule.members.filter((member) => member.kind === "beam");
  const footings = schedule.members.filter((member) => member.kind === "footing" || member.kind === "raft");
  const walls = schedule.members.filter(
    (member) => member.kind === "shear-wall" || member.kind === "retaining-wall" || member.kind === "pile",
  );

  /**
   * چیدمان جزئیات: تنها اعضای موجود در سند رسم می‌شوند.
   *
   * پیش‌تر چهار سلول ثابت ۲×۲ بود و اگر عضوی (مثلاً دیوار برشی) در سند نبود،
   * یک کادر خالی بزرگ با پیام «ثبت نشده است» نصف برگه را می‌گرفت. حالا تعداد
   * سلول‌ها به تعداد جزئیات موجود وابسته است و آخرین جزئیات اگر فرد باشد، عرض
   * کامل می‌گیرد تا نقشه‌ها بزرگ‌تر و برگه پرتر باشد.
   */
  type DetailEntry =
    | { type: "member"; member: RebarMember }
    | { type: "slab"; thickness: number; span: number }
    | { type: "joist" }
    | { type: "opening" }
    | { type: "connection"; column: RebarMember; beam: RebarMember };
  const entries: DetailEntry[] = [];
  // یک جزئیات برای هر «تیپ» ستون (مستطیل، مدور، L، T) — نه فقط اولین ستون؛
  // وگرنه ستون گوشه‌ای/دیواری موجود در نقشه هیچ جزئیاتی روی برگه ندارد.
  for (const kind of ["column", "column-round", "column-l", "column-t"] as const) {
    const member = schedule.members.find((entry) => entry.kind === kind);
    if (member) entries.push({ type: "member", member });
  }
  for (const member of [beams[0], footings[0], walls[0]]) {
    if (member) entries.push({ type: "member", member });
  }
  // جزئیات تیپ اتصال: وقتی هم ستون و هم تیر داریم، اتصال تیر به ستون رسم می‌شود
  // (طول وصله ۴۰db، خاموت متراکم ناحیهٔ اتصال) — چیزی که برگهٔ سازه بدون آن
  // ناقص است.
  if (columns[0] && beams[0]) entries.push({ type: "connection", column: columns[0], beam: beams[0] });
  // جزئیات تیپ دال: ضخامت از رادیه/پی موجود یا ۰٫۳۰ متر پیش‌فرض، دهانه از تیر.
  const slabThickness = round(schedule.members.find((member) => member.kind === "raft")?.length ?? 0.3, 2);
  const slabSpan = round(Math.min(6, beams[0]?.length ?? 5), 1);
  entries.push({ type: "slab", thickness: slabThickness, span: slabSpan });
  // دو تیپ همیشه‌حاضر در برگهٔ سازهٔ ایران: سقف تیرچه‌بلوک و تقویت بازشوی دال.
  entries.push({ type: "joist" });
  entries.push({ type: "opening" });

  if (entries.length === 0) {
    scene.rect(area.x + 2, area.y + 2, detailW - 4, area.h - 8, { width: 0.2, gray: 0.75, dash: [3, 2] });
    scene.text(area.x + detailW / 2, area.y + area.h / 2, "اعضای سازه‌ای در سند ثبت نشده است", 2.6, {
      anchor: "middle",
      gray: 0.55,
    });
  } else {
    // چیدمان تطبیقی: تا ۶ سلول دوستونی، بیشتر از آن سه‌ستونی تا جزئیات کوچک نشوند
    const cols = entries.length > 6 ? 3 : entries.length >= 3 ? 2 : 1;
    const rows = Math.ceil(entries.length / cols);
    const cellW = detailW / cols;
    const cellH = (area.h - 10) / Math.max(1, rows);
    entries.forEach((entry, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const isLastOdd = entries.length % cols === 1 && index === entries.length - 1;
      const x = area.x + col * cellW;
      const y = area.y + 4 + row * cellH;
      const width = isLastOdd ? cellW * 2 - 6 : cellW - 6;
      if (entry.type === "slab") {
        drawSlabDetail(
          scene,
          {
            thickness: entry.thickness,
            span: entry.span,
            bottomNote: "شبکهٔ پایین: میلگرد ۱۲ هر ۲۰ دوطرفه",
            topNote: "شبکهٔ بالا: میلگرد ۱۲ هر ۲۰ دوطرفه (روی تکیه‌گاه‌ها)",
          },
          x,
          y,
          width,
        );
        return;
      }
      if (entry.type === "joist") {
        drawJoistSlabDetail(scene, x, y, width, cellH);
        return;
      }
      if (entry.type === "opening") {
        drawSlabOpeningDetail(scene, x, y, width, cellH);
        return;
      }
      if (entry.type === "connection") {
        drawConnectionDetail(scene, entry.column, entry.beam, x, y, width);
        return;
      }
      const member = entry.member;
      if (member.kind === "column" || member.kind === "column-round")
        drawColumnDetail(scene, member, x, y, width, cellH - 8);
      else if (member.kind === "column-l" || member.kind === "column-t")
        drawShapedColumnDetail(scene, member, x, y, width, cellH - 8);
      else if (member.kind === "beam") drawBeamDetail(scene, member, x, y, width, cellH - 8);
      else if (member.kind === "footing" || member.kind === "raft") drawFootingDetail(scene, member, x, y, width, cellH - 8);
      else drawWallDetail(scene, member, x, y, width, cellH - 8);
    });
  }

  // جدول میلگرد + یادداشت‌های فنی زیر آن (نه روی جزئیات)
  const tableBottom = drawRebarTable(scene, schedule, area.x + detailW + 4, area.y + 4, tableW, area.h - 12);
  scene.text(area.x + area.w, tableBottom + 20, "یادداشت‌های فنی", 2.6, { anchor: "end", bold: true, gray: 0.2 });
  schedule.notes.slice(0, 4).forEach((note, index) => {
    scene.text(area.x + area.w - 2, tableBottom + 26 + index * 4.4, `• ${note}`, 2.1, { anchor: "end", gray: 0.3 });
  });
  // جدول برش میلگرد در فضای باقی‌ماندهٔ ستون راست (زیر یادداشت‌ها)
  const bbsTop = tableBottom + 46;
  const bbsSpace = area.y + area.h - bbsTop - 2;
  if (bbsSpace > 40) drawBendingTable(scene, schedule, area.x + detailW + 4, bbsTop, tableW, bbsSpace);
  void sheet;
  return { scene, schedule };
}

/** برگهٔ جزئیات به‌صورت SVG کامل. */
export function renderStudioDetailSheet(doc: StudioDocument): string {
  const { sheet } = frameOf(doc);
  const { scene } = detailSheetScene(doc);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}">
  <rect width="${sheet.width}" height="${sheet.height}" fill="#ffffff"/>
  ${sceneSvg(scene)}
</svg>`;
}

/** برگهٔ جزئیات به‌صورت PDF یک‌صفحه‌ای. */
/**
 * برگهٔ جزئیات به DXF.
 *
 * چرا: برگهٔ PDF برای چاپ است، اما دفتر فنی معمولاً جدول میلگرد و جزئیات را در
 * اتوکد ویرایش می‌کند (تغییر قطر، افزودن جزئیات). همان صحنهٔ SVG/PDF به DXF
 * تبدیل می‌شود تا هر سه خروجی هرگز از هم جدا نشوند. مختصات مدل ۱:۱ (متر) است؛
 * یعنی فاصلهٔ میلگردها در اتوکد اندازه‌گیری‌شدنی است، نه فقط تصویری.
 */
export function renderStudioDetailDxf(doc: StudioDocument): string {
  const { sheet } = frameOf(doc);
  const { scene } = detailSheetScene(doc);
  return sceneToDxf(scene, { widthMm: sheet.width, heightMm: sheet.height });
}

export function renderStudioDetailPdf(doc: StudioDocument): Uint8Array {
  const { sheet, area } = frameOf(doc);
  const { scene } = detailSheetScene(doc);
  const text = new PdfText(loadTypeface("regular"), loadTypeface("bold"));
  const layout: SheetLayout = {
    widthMm: sheet.width,
    heightMm: sheet.height,
    mmPerMetre: 1000 / (doc.sheet.scale || 50),
    requestedScale: doc.sheet.scale || 50,
    fitted: false,
    areaMm: area,
    titleBlock: { x: MARGIN + 3, y: sheet.height - MARGIN - FOOTER_H, w: sheet.width - (MARGIN + 3) * 2, h: FOOTER_H },
    bounds: { x: 0, y: 0, w: sheet.width, h: sheet.height },
  };
  return assemblePdf([{ ops: scenePdfOps(scene, sheet.height, text), layout }], text, doc);
}
