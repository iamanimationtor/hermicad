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

export type MemberKind = "column" | "beam" | "footing" | "shear-wall" | "raft" | "pile";

export const MEMBER_LABELS: Record<MemberKind, string> = {
  column: "ستون بتنی",
  beam: "تیر بتنی",
  footing: "پی",
  "shear-wall": "دیوار برشی",
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

/** نوع عضو سازه‌ای از شناسهٔ کتابخانه. */
function memberKind(item: StudioItem): MemberKind | null {
  const id = item.catalogId;
  if (id === "column-concrete") return "column";
  if (id === "beam-concrete") return "beam";
  if (id === "shear-wall") return "shear-wall";
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
        length = definition.defaultSize.h || DEFAULT_FLOOR_HEIGHT;
        bars = columnBars(b, depth, length);
        break;
      case "beam":
        b = Math.min(item.w, item.d);
        depth = definition.defaultSize.h || 0.5;
        length = Math.max(item.w, item.d);
        bars = beamBars(b, depth, length);
        break;
      case "shear-wall":
        length = definition.defaultSize.h || DEFAULT_FLOOR_HEIGHT;
        bars = shearWallBars(depth, b, length);
        break;
      case "pile":
        length = definition.defaultSize.h || 12;
        bars = pileBars(b, length);
        break;
      case "raft":
      default:
        // پی: ابعاد پلان همان w و d است و ضخامت از کتابخانه
        b = Math.min(item.w, item.d);
        depth = Math.max(item.w, item.d);
        length = definition.defaultSize.h || 0.5;
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
        note: member.kind === "column" || member.kind === "beam" ? "خاموت" : member.kind === "pile" ? "مارپیچ" : "افقی/تنگی",
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

const MARGIN = 8;
const HEADER_H = 12;
const FOOTER_H = 26;

interface Sheet {
  width: number;
  height: number;
}

function frameOf(doc: StudioDocument): { sheet: Sheet; area: { x: number; y: number; w: number; h: number } } {
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
function sheetChrome(scene: Scene, doc: StudioDocument, title: string, subtitle: string): void {
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
function drawColumnDetail(scene: Scene, member: RebarMember, x: number, y: number, size: number): void {
  // مقیاس جزئیات: حداکثر ۱:۱۰ (۱۰۰ میلی‌متر بر متر) تا مقطع واقع‌گرا بماند
  const scale = Math.min(100, (size - 12) / Math.max(member.b, member.h));
  const w = member.b * scale;
  const h = member.h * scale;
  const left = x + (size - w) / 2;
  const top = y + 8;
  scene.text(x + size, y + 5, "جزئیات ستون", 2.8, { anchor: "end", bold: true, gray: 0.15 });
  scene.rect(left, top, w, h, { width: 0.5 });
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
  scene.text(left + w / 2, top + h + 13, member.bars.note, 2.2, { anchor: "middle", gray: 0.35, direction: "ltr" });
  scene.text(left + w / 2, top - 4, `مقطع ${barLabel(member.bars.mainCount, member.bars.mainDia)}`, 2.2, { anchor: "middle", gray: 0.25 });
}

/** مقطع تیر با آرماتور بالا/پایین. */
function drawBeamDetail(scene: Scene, member: RebarMember, x: number, y: number, size: number): void {
  const scale = Math.min(80, (size - 12) / Math.max(member.b, member.h));
  const w = member.b * scale;
  const h = member.h * scale;
  const left = x + (size - w) / 2;
  const top = y + 8;
  scene.text(x + size, y + 5, "جزئیات تیر", 2.8, { anchor: "end", bold: true, gray: 0.15 });
  scene.rect(left, top, w, h, { width: 0.5 });
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
  scene.text(left + w / 2, top + h + 13, member.bars.note, 2.2, { anchor: "middle", gray: 0.35, direction: "ltr" });
  scene.text(left + w / 2, top - 4, `مقطع ${faNumber(member.b)}×${faNumber(member.h)}`, 2.2, { anchor: "middle", gray: 0.25 });
}

/** جزئیات پی: مقطع با شبکهٔ آرماتور و هاشور بتن. */
function drawFootingDetail(scene: Scene, member: RebarMember, x: number, y: number, size: number): void {
  const scale = Math.min(90, (size - 12) / Math.max(member.b, 0.6));
  const w = member.b * scale;
  const h = Math.max(6, member.length * scale);
  const left = x + (size - w) / 2;
  const top = y + 14;
  scene.text(x + size, y + 5, "جزئیات پی", 2.8, { anchor: "end", bold: true, gray: 0.15 });
  scene.rect(left, top, w, h, { width: 0.5 });
  scene.hatch(left, top, w, h, 3, { gray: 0.55, width: 0.16 });
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

/** جزئیات دیوار برشی/شمع: نمای آرماتوربندی ساده. */
function drawWallDetail(scene: Scene, member: RebarMember, x: number, y: number, size: number, height: number): void {
  scene.text(x + size, y + 5, member.kind === "pile" ? "جزئیات شمع" : "جزئیات دیوار برشی", 2.8, {
    anchor: "end",
    bold: true,
    gray: 0.15,
  });
  const w = Math.max(20, (size - 24) * 0.5);
  const h = Math.max(30, height - 30);
  scene.rect(x + 10, y + 14, w, h, { width: 0.45 });
  scene.hatch(x + 10, y + 14, w, h, 3.4, { gray: 0.55, width: 0.16 });
  for (let gy = y + 18; gy < y + 14 + h; gy += 4) {
    scene.circle(x + 13, gy, 0.6, { fill: 0.25, width: 0.1 });
    scene.circle(x + 10 + w - 3, gy, 0.6, { fill: 0.25, width: 0.1 });
  }
  scene.text(x + 10 + w / 2, y + 14 + h + 7, member.bars.note, 2, { anchor: "middle", gray: 0.35 });
}

/** جزئیات تیپ دال: مقطع دال دوطرفه با شبکهٔ بالا و پایین روی تیرهای تکیه‌گاه. */
function drawSlabDetail(
  scene: Scene,
  data: { thickness: number; span: number; topNote: string; bottomNote: string },
  x: number,
  y: number,
  size: number,
): void {
  // جا برای اندازه‌گذاری ضخامت در سمت راست و برچسب‌ها در پایین
  const scale = Math.min(70, (size - 52) / data.span);
  const spanMm = data.span * scale;
  const thicknessMm = Math.max(6, data.thickness * scale);
  const beamW = Math.max(5, spanMm * 0.04);
  const beamH = Math.max(8, thicknessMm * 1.8);
  const left = x + (size - spanMm) / 2;
  const top = y + 18;
  scene.text(x + size, y + 5, "جزئیات تیپ دال", 2.8, { anchor: "end", bold: true, gray: 0.15 });
  scene.rect(left, top, spanMm, thicknessMm, { width: 0.5 });
  scene.hatch(left, top, spanMm, thicknessMm, 2.4, { gray: 0.55, width: 0.16 });
  for (const bx of [left - beamW, left + spanMm]) {
    scene.rect(bx, top + thicknessMm, beamW, beamH, { width: 0.45 });
    scene.hatch(bx, top + thicknessMm, beamW, beamH, 2, { gray: 0.62, width: 0.14 });
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
  // برچسب بالای دال: کنار خط اندازه یا زیر آن، متن از کادر بیرون می‌زد.
  scene.text(left, top - 3, `ضخامت ${faNumber(data.thickness)} متر`, 2, { gray: 0.35 });
  const textTop = top + thicknessMm + beamH + 7;
  scene.text(left + spanMm / 2, textTop, `دهانهٔ تیپ ${faNumber(data.span)} متر`, 2.2, { anchor: "middle", gray: 0.3 });
  scene.text(left + spanMm / 2, textTop + 5, data.bottomNote, 1.9, { anchor: "middle", gray: 0.35 });
  scene.text(left + spanMm / 2, textTop + 9.5, data.topNote, 1.9, { anchor: "middle", gray: 0.35 });
}

/** جزئیات اتصال تیر به ستون: ناحیهٔ اتصال، خاموت متراکم و طول وصله. */
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
  scene.hatch(left, top, colW, colH, 3.2, { gray: 0.62, width: 0.15 });
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
  const columns = schedule.members.filter((member) => member.kind === "column");
  const beams = schedule.members.filter((member) => member.kind === "beam");
  const footings = schedule.members.filter((member) => member.kind === "footing" || member.kind === "raft");
  const walls = schedule.members.filter((member) => member.kind === "shear-wall" || member.kind === "pile");

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
    | { type: "connection"; column: RebarMember; beam: RebarMember };
  const entries: DetailEntry[] = [];
  for (const member of [columns[0], beams[0], footings[0], walls[0]]) {
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

  if (entries.length === 0) {
    scene.rect(area.x + 2, area.y + 2, detailW - 4, area.h - 8, { width: 0.2, gray: 0.75, dash: [3, 2] });
    scene.text(area.x + detailW / 2, area.y + area.h / 2, "اعضای سازه‌ای در سند ثبت نشده است", 2.6, {
      anchor: "middle",
      gray: 0.55,
    });
  } else {
    const cols = entries.length >= 3 ? 2 : 1;
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
      if (entry.type === "connection") {
        drawConnectionDetail(scene, entry.column, entry.beam, x, y, width);
        return;
      }
      const member = entry.member;
      if (member.kind === "column") drawColumnDetail(scene, member, x, y, width);
      else if (member.kind === "beam") drawBeamDetail(scene, member, x, y, width);
      else if (member.kind === "footing" || member.kind === "raft") drawFootingDetail(scene, member, x, y, width);
      else drawWallDetail(scene, member, x, y, width, cellH - 8);
    });
  }

  // جدول میلگرد + یادداشت‌های فنی زیر آن (نه روی جزئیات)
  const tableBottom = drawRebarTable(scene, schedule, area.x + detailW + 4, area.y + 4, tableW, area.h - 12);
  scene.text(area.x + area.w, tableBottom + 20, "یادداشت‌های فنی", 2.6, { anchor: "end", bold: true, gray: 0.2 });
  schedule.notes.slice(0, 4).forEach((note, index) => {
    scene.text(area.x + area.w - 2, tableBottom + 26 + index * 4.4, `• ${note}`, 2.1, { anchor: "end", gray: 0.3 });
  });
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
