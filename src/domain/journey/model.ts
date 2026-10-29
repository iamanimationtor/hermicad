import { structuralErrors, type StructuralProfile } from "../structures/catalog";
/** قرارداد مسیر راهنما؛ حدود عددی این فرم حدود نرم‌افزارند، نه ضابطهٔ ایران. */
export const USES = [
  ["residential", "مسکونی"],
  ["office", "اداری"],
  ["school", "آموزشی"],
  ["clinic", "درمانی"],
  ["commercial", "تجاری"],
  ["hotel", "اقامتی"],
  ["industrial", "صنعتی"],
  ["warehouse", "انبار"],
  ["mixed", "مختلط"],
  ["other", "سایر کاربری‌ها"],
] as const;
export const TRADES = [
  ["architecture", "معماری"],
  ["structure", "سازه"],
  ["mechanical", "مکانیک"],
  ["electrical", "برق"],
  ["plumbing", "آب و فاضلاب"],
  ["fire", "حریق"],
  ["site", "محوطه"],
] as const;
export type Trade = (typeof TRADES)[number][0];
export type Use = (typeof USES)[number][0];
export const STEPS = ["پروژه و هدف", "زمین و مجوز", "نیازهای ساختمان", "رشته‌ها و مدارک", "کنترل و رفع کمبود", "بستهٔ تحویل"] as const;
export interface Brief {
  structural?: StructuralProfile;
  version: 1;
  step: number;
  use: Use;
  goal: "concept" | "permit" | "execution";
  trades: Trade[];
  values: Record<string, string | number | null>;
  sources: Record<string, { reference: string; edition: string; date: string }>;
  outputs: string[];
}
export interface Field {
  key: string;
  label: string;
  help: string;
  step: 1 | 2 | 3;
  type: "number" | "text" | "select";
  unit?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  options?: readonly string[];
  uses?: readonly Use[];
  trades?: readonly Trade[];
}
export const FIELDS: Field[] = [
  {
    key: "city",
    label: "شهر و مرجع صدور پروانه",
    help: "مثلاً شهرداری منطقه و شهر؛ ضوابط محلی با شهر دیگر یکسان فرض نمی‌شود.",
    step: 1,
    type: "text",
  },
  {
    key: "plotWidth",
    label: "عرض زمین",
    help: "از نقشهٔ برداشت یا سند؛ در این کنترل اولیه، زمین مستطیلی فرض می‌شود.",
    step: 1,
    type: "number",
    unit: "متر",
    min: 1,
    max: 1000,
  },
  {
    key: "plotDepth",
    label: "عمق زمین",
    help: "برای زمین نامنظم، کنترل هندسی تخصصی در کارگاه مولد لازم است.",
    step: 1,
    type: "number",
    unit: "متر",
    min: 1,
    max: 1000,
  },
  ...["north", "south", "east", "west"].map((side, i): Field => ({
    key: side,
    label: `عقب‌نشینی ${["شمال", "جنوب", "شرق", "غرب"][i]}`,
    help: "فقط مقدار مصوب پروژه را وارد کنید؛ صفر نیز باید مستند باشد.",
    step: 1,
    type: "number",
    unit: "متر",
    min: 0,
    max: 100,
  })),
  {
    key: "coverage",
    label: "سطح اشغال مجاز",
    help: "درصد مجاز طبق دستور نقشه؛ اگر نمی‌دانید خالی بگذارید.",
    step: 1,
    type: "number",
    unit: "درصد",
    min: 1,
    max: 100,
  },
  {
    key: "far",
    label: "تراکم مجاز",
    help: "نسبت زیربنای مشمول تراکم به زمین؛ نحوهٔ احتساب زیرزمین و استثناها باید توسط مرجع پروژه تعیین شود.",
    step: 1,
    type: "number",
    unit: "درصد",
    min: 1,
    max: 2000,
  },
  {
    key: "allowedFloors",
    label: "تعداد طبقات مجاز",
    help: "طبق مجوز؛ نه تعداد طبقات دلخواه شما.",
    step: 1,
    type: "number",
    min: 1,
    max: 60,
    integer: true,
  },
  {
    key: "floors",
    label: "تعداد طبقات موردنیاز",
    help: "مدل باید برای هر طبقه اشیای مستقل داشته باشد؛ تغییر این عدد طبقهٔ طراحی‌شده تولید نمی‌کند.",
    step: 2,
    type: "number",
    min: 1,
    max: 60,
    integer: true,
  },
  {
    key: "height",
    label: "ارتفاع کف تا کف",
    help: "فاصلهٔ کف یک طبقه تا کف بعدی؛ با ارتفاع خالص اتاق متفاوت است.",
    step: 2,
    type: "number",
    unit: "متر",
    min: 2,
    max: 12,
  },
  {
    key: "width",
    label: "عرض پیشنهادی ساختمان",
    help: "برای کنترل اولیهٔ جانمایی؛ با عرض زمین متفاوت است.",
    step: 2,
    type: "number",
    unit: "متر",
    min: 1,
    max: 500,
  },
  {
    key: "depth",
    label: "عمق پیشنهادی ساختمان",
    help: "این مقدار باید با حدود واقعی دیوارهای نقشه تطبیق داده شود.",
    step: 2,
    type: "number",
    unit: "متر",
    min: 1,
    max: 500,
  },
  {
    key: "capacity",
    label: "جمعیت بهره‌بردار",
    help: "مبنای بررسی خروج و تأسیسات؛ تعیین بار تصرف قانونی همچنان کنترل تخصصی لازم دارد.",
    step: 2,
    type: "number",
    unit: "نفر",
    min: 1,
    max: 100000,
    integer: true,
  },
  {
    key: "units",
    label: "تعداد واحد مسکونی",
    help: "فقط واحد مسکونی؛ برای پروژهٔ مختلط بخش‌های دیگر را در شرح فضاها بنویسید.",
    step: 2,
    type: "number",
    min: 1,
    max: 10000,
    integer: true,
    uses: ["residential", "mixed"],
  },
  {
    key: "classrooms",
    label: "تعداد کلاس",
    help: "ظرفیت و گروه سنی هر کلاس را در شرح فضاها مشخص کنید.",
    step: 2,
    type: "number",
    min: 1,
    max: 1000,
    integer: true,
    uses: ["school"],
  },
  {
    key: "treatment",
    label: "نوع خدمات درمانی",
    help: "سرپایی، بستری، جراحی یا سایر خدمات؛ الگوی آماده فقط سرپاییِ اولیه است.",
    step: 2,
    type: "select",
    options: ["سرپایی", "بستری", "جراحی", "سایر"],
    uses: ["clinic"],
  },
  {
    key: "process",
    label: "شرح فرایند و مواد نگهداری‌شده",
    help: "برای صنعت/انبار، خطر مواد، ماشین‌آلات و بارگذاری باید مشخص شود.",
    step: 2,
    type: "text",
    uses: ["industrial", "warehouse"],
  },
  {
    key: "rooms",
    label: "فضاهای لازم و ظرفیت هر فضا",
    help: "مثلاً سه اتاق معاینه، انتظار ۲۰ نفر، اتاق کارکنان و سرویس دسترس‌پذیر. این متن برنامهٔ نیاز است، نه نقشهٔ تولیدشده.",
    step: 2,
    type: "text",
  },
  {
    key: "parking",
    label: "تعداد پارکینگ الزامی",
    help: "طبق کاربری و دستور نقشه؛ از تعداد واحدها حدس زده نمی‌شود.",
    step: 2,
    type: "number",
    min: 0,
    max: 10000,
    integer: true,
  },
  {
    key: "system",
    label: "سیستم سازهٔ پیشنهادی",
    help: "انتخاب نهایی و مجازبودن سیستم نیازمند طراحی و کنترل لرزه‌ای است.",
    step: 3,
    type: "select",
    options: ["بتن‌آرمه", "فولادی", "بنایی", "سایر"],
    trades: ["structure"],
  },
  {
    key: "bearing",
    label: "ظرفیت مجاز باربری خاک",
    help: "فقط از گزارش ژئوتکنیکِ همین زمین؛ این فیلد محاسبهٔ پی نیست.",
    step: 3,
    type: "number",
    unit: "کیلوپاسکال",
    min: 1,
    max: 5000,
    trades: ["structure"],
  },
  {
    key: "seismic",
    label: "پهنهٔ خطر و نوع زمین",
    help: "پهنه و نوع زمین را با ارجاع به گزارش/استاندارد پروژه ثبت کنید؛ شهر به‌تنهایی کافی نیست.",
    step: 3,
    type: "text",
    trades: ["structure"],
  },
  {
    key: "hvac",
    label: "نیاز گرمایش، سرمایش و تهویه",
    help: "اقلیم، ساعات کار، شرایط داخل و فضاهای ویژه؛ ظرفیت دستگاه از این شرح به‌تنهایی تعیین نمی‌شود.",
    step: 3,
    type: "text",
    trades: ["mechanical"],
  },
  {
    key: "power",
    label: "توان انشعاب یا بار درخواست‌شده",
    help: "از جدول بار یا پاسخ شرکت برق؛ جای طراحی مدار، ارت و حفاظت نیست.",
    step: 3,
    type: "number",
    unit: "کیلووات",
    min: 0.1,
    max: 100000,
    trades: ["electrical"],
  },
  {
    key: "water",
    label: "شرایط انشعاب آب و دفع فاضلاب",
    help: "فشار/دبی موجود، اتصال به شبکه یا روش دفع مجاز را ثبت کنید.",
    step: 3,
    type: "text",
    trades: ["plumbing"],
  },
  {
    key: "fireBrief",
    label: "الزامات اعلام و اطفا",
    help: "نامهٔ آتش‌نشانی و شرایط خطر پروژه؛ جانمایی کپسول به معنی طراحی حریق نیست.",
    step: 3,
    type: "text",
    trades: ["fire"],
  },
  {
    key: "grading",
    label: "ترازها و زهکشی محوطه",
    help: "مبنای ارتفاعی، شیب و محل دفع آب سطحی از نقشهٔ برداشت.",
    step: 3,
    type: "text",
    trades: ["site"],
  },
];
export interface Reference {
  id: string;
  label: string;
  trades: readonly Trade[];
  help: string;
  uses?: readonly Use[];
}
export const REFERENCES: readonly Reference[] = [
  {
    id: "municipal",
    label: "دستور نقشه، طرح تفصیلی و ضوابط محلی",
    trades: [] as Trade[],
    help: "شماره و تاریخ دستور نقشه و مرجع شهرداری؛ الزامات آتش‌نشانی و دسترس‌پذیری محلی نیز بررسی شوند.",
  },
  {
    id: "architecture",
    label: "مباحث ۳، ۴، ۱۵، ۱۹ و ضوابط دسترس‌پذیری",
    trades: ["architecture"] as Trade[],
    help: "ویرایش لازم‌الاجرا و دورهٔ گذار هر مرجع را جداگانه در شرح نسخه ثبت کنید.",
  },
  {
    id: "structure",
    label: "مباحث ۶، ۷، ۸/۹/۱۰ و استاندارد ۲۸۰۰",
    trades: ["structure"] as Trade[],
    help: "مبحث مصالح متناسب با سیستم انتخاب شود؛ ژئوتکنیک، بارگذاری و ضوابط لرزه‌ای همگی لازم‌اند.",
  },
  {
    id: "mechanical",
    label: "مباحث ۱۴، ۱۷ و ۱۹ و الزامات تجهیز",
    trades: ["mechanical"] as Trade[],
    help: "کاربرد گاز و سایر سامانه‌ها مشروط به پروژه است؛ فهرست حاضر ادعای شمول کامل ندارد.",
  },
  {
    id: "electrical",
    label: "مبحث ۱۳ و الزامات شرکت برق",
    trades: ["electrical"] as Trade[],
    help: "نسخه، اصلاحیه و ضوابط اتصال، ارت و حفاظت باید برای محل پروژه کنترل شود.",
  },
  { id: "plumbing", label: "مبحث ۱۶ و الزامات آبفا", trades: ["plumbing"] as Trade[], help: "مجوز اتصال/دفع و نسخهٔ لازم‌الاجرای مرجع." },
  {
    id: "fire",
    label: "مبحث ۳ و دستورالعمل مرجع آتش‌نشانی",
    trades: ["fire"] as Trade[],
    help: "بار تصرف، خروج، دسترسی امدادی، اعلام و اطفا کنترل‌های جداگانه‌اند.",
  },
  {
    id: "site",
    label: "ضوابط محوطه، دسترس‌پذیری و شبکه‌های شهری",
    trades: ["site"] as Trade[],
    help: "محدودیت‌های محلی و نقشه‌های برداشت مبنا هستند.",
  },
  {
    id: "education",
    label: "ضوابط تخصصی فضاهای آموزشی و مرجع نوسازی مدارس",
    trades: [],
    uses: ["school"],
    help: "گروه سنی، ظرفیت، نوع آموزش و الزامات مرجع تخصصی باید جداگانه تعیین شوند.",
  },
  {
    id: "healthcare",
    label: "ضوابط وزارت بهداشت و مجوز نوع مرکز درمانی",
    trades: [],
    uses: ["clinic"],
    help: "بستری/جراحی با درمانگاه سرپایی یکسان نیست؛ نیازهای کنترل عفونت و تأسیسات ویژه باید بررسی شوند.",
  },
  {
    id: "industrial",
    label: "الزامات تخصصی صنعت، مواد خطرناک و مرجع بهره‌برداری",
    trades: [],
    uses: ["industrial", "warehouse"],
    help: "کلاس خطر و فرایند، تجهیزات، بارگذاری و مجوزهای مرتبط را ثبت کنید.",
  },
  {
    id: "special-use",
    label: "ضوابط تخصصی کاربری و مجوز بهره‌برداری",
    trades: [],
    uses: ["commercial", "hotel", "mixed", "other"],
    help: "مرجع تخصصی کاربری و تداخل الزامات کاربری‌های مختلط باید تعیین شود.",
  },
  {
    id: "execution",
    label: "مباحث ۲، ۵، ۱۲، ۲۲ و مشخصات فنی پروژه",
    trades: [] as Trade[],
    help: "ایمنی کارگاه، مصالح، مسئولیت‌ها، نگهداری و مدارک قرارداد؛ نیازمند بررسی متخصص.",
  },
] as const;
export const OUTPUTS = [
  { id: "architecture", label: "پلان معماری؛ PDF و DXF", trade: "architecture", formats: ["pdf", "dxf"] },
  { id: "vertical", label: "نما و برش؛ PDF", trade: "architecture", formats: ["elevations-pdf", "section-pdf"] },
  { id: "tables", label: "جدول در و پنجره و متره؛ PDF و XLSX", trade: "architecture", formats: ["schedules-pdf", "xlsx"] },
  { id: "structure", label: "پلان سازه و جزئیات تیپ؛ PDF", trade: "structure", formats: ["pdf", "details-pdf"] },
  { id: "mechanical", label: "جانمایی مکانیکی؛ PDF و DXF", trade: "mechanical", formats: ["pdf", "dxf"] },
  { id: "electrical", label: "جانمایی برق؛ PDF و DXF", trade: "electrical", formats: ["pdf", "dxf"] },
  { id: "plumbing", label: "جانمایی آب و فاضلاب؛ PDF و DXF", trade: "plumbing", formats: ["pdf", "dxf"] },
  { id: "fire", label: "جانمایی حریق؛ PDF و DXF", trade: "fire", formats: ["pdf", "dxf"] },
  { id: "site", label: "پلان محوطه؛ PDF و DXF", trade: "site", formats: ["pdf", "dxf"] },
  { id: "bim", label: "مدل حجمی مرجع؛ IFC", trade: null, formats: ["ifc"] },
] as const;
export function emptyBrief(): Brief {
  return {
    version: 1,
    step: 0,
    use: "residential",
    goal: "concept",
    trades: ["architecture"],
    values: {},
    sources: {},
    outputs: ["architecture", "vertical", "tables", "bim"],
  };
}
export function activeFields(brief: Brief) {
  return FIELDS.filter((f) => (!f.uses || f.uses.includes(brief.use)) && (!f.trades || f.trades.some((t) => brief.trades.includes(t))));
}
export function activeReferences(brief: Brief) {
  return REFERENCES.filter(
    (r) => (!r.uses || r.uses.includes(brief.use)) && (!r.trades.length || r.trades.some((t) => brief.trades.includes(t))),
  );
}
export function availableOutputs(brief: Brief) {
  return OUTPUTS.filter((o) => !o.trade || brief.trades.includes(o.trade));
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** پیش‌نویس ناقص پذیرفته می‌شود؛ مقدار نامعتبر و حدود غیرمجاز هرگز. */
export function briefErrors(value: unknown): string[] {
  if (!object(value)) return ["پروندهٔ راهنما باید یک شیء باشد."];
  const errors: string[] = value.structural === undefined ? [] : structuralErrors(value.structural);
  if (value.version !== 1 || !Number.isInteger(value.step) || (value.step as number) < 0 || (value.step as number) >= STEPS.length)
    errors.push("نسخه یا مرحلهٔ راهنما معتبر نیست.");
  if (!USES.some((u) => u[0] === value.use) || !["concept", "permit", "execution"].includes(String(value.goal)))
    errors.push("کاربری یا هدف معتبر نیست.");
  if (
    !Array.isArray(value.trades) ||
    !value.trades.length ||
    new Set(value.trades).size !== value.trades.length ||
    value.trades.some((t) => !TRADES.some((x) => x[0] === t))
  )
    errors.push("رشته‌های پروژه معتبر نیستند.");
  if (
    !Array.isArray(value.outputs) ||
    value.outputs.length > OUTPUTS.length ||
    new Set(value.outputs).size !== value.outputs.length ||
    value.outputs.some((v) => !OUTPUTS.some((o) => o.id === v))
  )
    errors.push("فهرست خروجی معتبر نیست.");
  if (
    Array.isArray(value.outputs) &&
    Array.isArray(value.trades) &&
    value.outputs.some((id) => {
      const o = OUTPUTS.find((o) => o.id === id);
      return o?.trade && !(value.trades as unknown[]).includes(o.trade);
    })
  )
    errors.push("خروجی رشتهٔ انتخاب‌نشده در فهرست وجود دارد.");
  if (!object(value.values)) errors.push("اطلاعات راهنما معتبر نیست.");
  else
    for (const [key, v] of Object.entries(value.values)) {
      const field = FIELDS.find((f) => f.key === key);
      if (!field) {
        errors.push("فیلد ناشناخته در راهنما.");
        continue;
      }
      if (v === null || v === "") continue;
      if (field.type === "number") {
        if (typeof v !== "number" || !Number.isFinite(v) || v < field.min! || v > field.max! || (field.integer && !Number.isInteger(v)))
          errors.push(`${field.label}: مقدار باید ${field.integer ? "صحیح و " : ""}بین ${field.min} و ${field.max} باشد.`);
      } else if (typeof v !== "string" || v.length > 2000 || (field.options && !field.options.includes(v)))
        errors.push(`${field.label}: متن یا گزینه معتبر نیست.`);
    }
  if (!object(value.sources)) errors.push("مدارک راهنما معتبر نیست.");
  else
    for (const [key, v] of Object.entries(value.sources)) {
      if (
        !REFERENCES.some((r) => r.id === key) ||
        !object(v) ||
        ![v.reference, v.edition, v.date].every((x) => typeof x === "string" && x.length <= 2000)
      )
        errors.push("مشخصات مرجع معتبر نیست.");
    }
  return errors;
}
