import { frameInputErrors, FRAME_FAMILIES, type FrameModel } from "./frame/model";
/** مسیرهای تخصصی؛ انتخاب مسیر، گواهی پوشش کامل ضوابط یا وجود حل‌گر اجرایی نیست. */
export const FAMILIES = [
  {
    id: "concrete",
    name: "ساختمان بتن‌آرمه",
    building: true,
    calculator: "beam",
    scope: "اعضای بتنی، سیستم باربر جانبی، پی و جزئیات بتن‌آرمه",
    references: ["مباحث ۶، ۷ و ۹", "استاندارد ۲۸۰۰ و ضوابط محلی"],
    deliverables: ["مدل تحلیل و ترکیبات بار", "طراحی اعضا و اتصالات", "پلان قالب‌بندی و آرماتور", "دفترچه محاسبات و کنترل تغییرمکان"],
  },
  {
    id: "steel",
    name: "ساختمان فولادی",
    building: true,
    calculator: "beam",
    scope: "اعضا و اتصالات فولادی، پایداری، ساخت و نصب",
    references: ["مباحث ۶، ۷ و ۱۰", "استاندارد ۲۸۰۰ و مشخصات ساخت"],
    deliverables: ["مدل تحلیل و پایداری", "طراحی اعضا و اتصالات", "نقشه ساخت و نصب", "کنترل جوش، پیچ و خوردگی"],
  },
  {
    id: "masonry",
    name: "ساختمان بنایی",
    building: true,
    calculator: "none",
    scope: "دیوارهای باربر، کلاف‌ها، بازشو و اتصال سقف",
    references: ["مباحث ۶، ۷ و ۸", "استاندارد ۲۸۰۰ و محدودیت کاربرد سیستم"],
    deliverables: ["کنترل مجازبودن سیستم", "طراحی دیوار و کلاف", "پلان دیوارهای باربر و بازشوها", "جزئیات اتصال سقف و پی"],
  },
  {
    id: "shed",
    name: "سوله و سالن صنعتی",
    building: true,
    calculator: "none",
    scope: "قاب صنعتی، لاپه، مهاربندی، جرثقیل و بارهای بهره‌برداری",
    references: ["مباحث ۶، ۷ و ۱۰", "ضوابط سازه صنعتی و مشخصات جرثقیل"],
    deliverables: ["تحلیل قاب و پایداری", "بارهای جرثقیل و خستگی", "طراحی اتصالات و مهاربندی", "نقشه ساخت و نصب"],
  },
  {
    id: "timber",
    name: "سازه چوبی",
    building: true,
    calculator: "none",
    scope: "محصول و سیستم چوبی؛ پرونده‌های قدیمی با عنوان «چوبی و سبک» نیازمند تشخیص دستی نوع واقعی سازه‌اند",
    references: ["مبحث ۶ و الزامات حریق", "مرجع طراحی و گواهی فنی مورد پذیرش مرجع پروژه"],
    deliverables: ["احراز دامنه کاربرد محصول", "طراحی اعضا و اتصالات", "کنترل حریق و دوام", "نقشه ساخت و مونتاژ"],
  },
  {
    id: "cold-formed-steel",
    name: "فولاد سردنوردشده / سبک",
    building: true,
    calculator: "none",
    scope: "ثبت جداگانهٔ سیستم فولادی سردنوردشده؛ طراحی اعضای نازک‌ورق و اتصالات هنوز وجود ندارد",
    references: ["مرجع طراحی سردنوردشده مورد پذیرش پروژه", "گواهی محصول، الزامات حریق و مشخصات اتصال"],
    deliverables: ["احراز سیستم و مشخصات محصول", "طراحی کمانش موضعی و اعوجاجی", "طراحی اتصالات و مهاربندی", "نقشه مونتاژ و مهار"],
  },
  {
    id: "retaining",
    name: "دیوار حائل",
    building: false,
    calculator: "wall",
    scope: "پایداری اولیه دیوار ثقلی؛ طراحی سازه و ژئوتکنیک مستقل لازم است",
    references: ["مباحث ۶ و ۷ در دامنه کاربرد پروژه", "گزارش ژئوتکنیک و مرجع طراحی دیوار حائل"],
    deliverables: [
      "فشار خاک و آب و زلزله",
      "لغزش، واژگونی، باربری و پایداری کلی",
      "طراحی سازه دیوار و پی",
      "زهکشی، گودبرداری و توالی اجرا",
    ],
  },
  {
    id: "tank",
    name: "مخزن و سازه نگهدارنده مایع",
    building: false,
    calculator: "hydro",
    scope: "بار هیدرواستاتیک دیوار قائم؛ آب‌بندی و پاسخ لرزه‌ای جداگانه",
    references: ["مرجع تخصصی مخازن مورد پذیرش پروژه", "ضوابط مصالح، زلزله و الزامات بهره‌بردار"],
    deliverables: [
      "تحلیل هیدرواستاتیک و هیدرودینامیک",
      "کنترل ترک و آب‌بندی",
      "طراحی دیواره، کف و اتصال‌ها",
      "تست آب‌بندی و مدارک بهره‌برداری",
    ],
  },
  {
    id: "bridge",
    name: "پل و سازه عبور",
    building: false,
    calculator: "none",
    scope: "عرشه، پایه، کوله، تکیه‌گاه، بار ترافیک و شرایط بستر",
    references: ["نشریات پل و بارگذاری مصوب پروژه", "ضوابط راه، زلزله پل، آب‌شستگی و بهره‌بردار"],
    deliverables: ["مدل بار متحرک و ترکیبات ویژه", "تحلیل عرشه و زیرسازه", "کنترل خستگی و تکیه‌گاه‌ها", "نقشه اجرایی، درز و توالی احداث"],
  },
  {
    id: "tower",
    name: "دکل و سازه مرتفع غیرساختمانی",
    building: false,
    calculator: "none",
    scope: "باد، تجهیزات، دینامیک، پایداری و فونداسیون",
    references: ["مرجع تخصصی دکل مورد پذیرش پروژه", "ضوابط باد، زلزله و مشخصات تجهیزات"],
    deliverables: ["تحلیل باد و دینامیک", "طراحی اعضا، کابل و اتصالات", "کنترل ارتعاش و پایداری", "نقشه نصب، مهار و پی"],
  },
  {
    id: "other",
    name: "سازه خاص / خارج از مسیرهای موجود",
    building: false,
    calculator: "none",
    scope: "تعریف دامنه و مبنای طراحی اختصاصی؛ بدون تحمیل مدل ساختمانی",
    references: ["مبنای طراحی مورد پذیرش مرجع پروژه"],
    deliverables: ["تعیین دامنه و روش تحلیل", "اعتبارسنجی حل‌گر تخصصی", "طراحی و کنترل مستقل", "مدارک اجرایی اختصاصی"],
  },
] as const;
export type Family = (typeof FAMILIES)[number]["id"];
export type Category = "basis" | "geometry" | "loads" | "assessment";
export const GROUPS = [
  ["basis", "مبنای طراحی"],
  ["geometry", "هندسه و مصالح"],
  ["loads", "بارها و شرایط محیطی"],
  ["assessment", "ارزیابی محدود"],
] as const;
export interface StructuralProfile {
  frame?: FrameModel;
  version: 1;
  family: Family;
  step: number;
  values: Record<string, string | number | null>;
  references: Record<string, { document: string; edition: string; checkedAt: string }>;
}
export interface StructuralField {
  key: string;
  label: string;
  help: string;
  group: Category;
  type: "number" | "text" | "select";
  unit?: string;
  integer?: boolean;
  min?: number;
  max?: number;
  options?: readonly string[];
  families?: readonly Family[];
  when?: { key: string; is: string };
}
const num = (
  key: string,
  label: string,
  group: Category,
  unit: string,
  min: number,
  max: number,
  families?: readonly Family[],
  help = "از مدارک پروژه وارد کنید؛ بازهٔ زیر محدودیت نرم‌افزار است نه ضابطه.",
): StructuralField => ({ key, label, group, unit, min, max, type: "number", families, help });
const txt = (
  key: string,
  label: string,
  group: Category,
  families?: readonly Family[],
  help = "مرجع، مقدار و واحد یا شرح قابل ردیابی را ثبت کنید.",
): StructuralField => ({ key, label, group, type: "text", families, help });
const sel = (key: string, label: string, group: Category, options: readonly string[], families?: readonly Family[]): StructuralField => ({
  key,
  label,
  group,
  type: "select",
  options,
  families,
  help: "انتخاب را مطابق شرایط واقعی و مدارک پروژه انجام دهید؛ خالی یعنی نامعلوم.",
});
export const STRUCTURAL_FIELDS: StructuralField[] = [
  txt("function", "کارکرد و کاربری واقعی سازه", "basis"),
  txt("location", "موقعیت و مرجع تأیید پروژه", "basis"),
  txt("designLife", "عمر طرح و شرایط بهره‌برداری", "basis"),
  txt("importance", "رده اهمیت / پیامد خرابی و مبنای تعیین آن", "basis"),
  txt("survey", "نقشه برداشت و مبنای مختصات/تراز", "basis"),
  txt("geotechnical", "گزارش ژئوتکنیک، تراز آب و خطرهای زمین", "basis"),
  txt("criteria", "معیارهای پذیرش و منبع هر معیار", "basis"),
  sel("work", "نوع مداخله", "basis", ["احداث جدید", "ارزیابی موجود", "بهسازی", "تغییر کاربری"]),
  { ...txt("asBuilt", "نقشه چون‌ساخت، آزمایش مصالح و وضعیت آسیب", "basis"), when: { key: "work", is: "ارزیابی موجود" } },
  { ...txt("retrofit", "ارزیابی موجود و هدف عملکرد بهسازی", "basis"), when: { key: "work", is: "بهسازی" } },
  { ...txt("newUse", "تفاوت بار و الزامات کاربری جدید", "basis"), when: { key: "work", is: "تغییر کاربری" } },
  num("span", "دهانه اصلی", "geometry", "متر", 0.5, 500, ["concrete", "steel", "masonry", "shed", "timber", "cold-formed-steel", "bridge"]),
  num("height", "ارتفاع کل", "geometry", "متر", 0.5, 1000, ["concrete", "steel", "masonry", "shed", "timber", "cold-formed-steel", "tower"]),
  {
    ...num("storeys", "تعداد ترازهای سازه‌ای", "geometry", "تراز", 1, 200, ["concrete", "steel", "masonry", "shed", "timber", "cold-formed-steel"]),
    integer: true,
  },
  txt("lateral", "سیستم باربر قائم و جانبی در هر جهت", "geometry", ["concrete", "steel", "masonry", "shed", "timber", "cold-formed-steel"]),
  txt("foundation", "نوع پی و ارتباط با گزارش ژئوتکنیک", "geometry"),
  num("fc", "مقاومت مشخصه بتن", "geometry", "مگاپاسکال", 5, 150, ["concrete"]),
  num("fyRebar", "تنش تسلیم آرماتور", "geometry", "مگاپاسکال", 100, 1000, ["concrete"]),
  num("cover", "پوشش بتن موردنیاز", "geometry", "میلی‌متر", 10, 200, ["concrete"]),
  txt("exposure", "رده محیطی، دوام و شرایط حریق", "geometry", ["concrete", "steel", "masonry", "timber", "cold-formed-steel", "tank"]),
  num("fySteel", "تنش تسلیم فولاد", "geometry", "مگاپاسکال", 100, 1000, ["steel", "shed", "cold-formed-steel", "tower"]),
  sel("connection", "نوع اتصال اصلی", "geometry", ["پیچی", "جوشی", "ترکیبی"], ["steel", "shed", "tower"]),
  {
    ...txt("bolt", "رده پیچ، سوراخ، پیش‌تنیدگی و استاندارد محصول", "geometry", ["steel", "shed", "tower"]),
    when: { key: "connection", is: "پیچی" },
  },
  {
    ...txt("weld", "مصالح جوش، WPS و برنامه کنترل کیفیت", "geometry", ["steel", "shed", "tower"]),
    when: { key: "connection", is: "جوشی" },
  },
  {
    ...txt("combined", "مشخصات پیچ و جوش و کنترل کیفیت هر دو", "geometry", ["steel", "shed", "tower"]),
    when: { key: "connection", is: "ترکیبی" },
  },
  num("wallThickness", "ضخامت دیوار باربر", "geometry", "میلی‌متر", 80, 1500, ["masonry"]),
  txt("masonryMaterial", "نوع واحد بنایی، ملات، مقاومت و کلاف‌ها", "geometry", ["masonry"]),
  num("bay", "فاصله قاب‌ها", "geometry", "متر", 0.5, 30, ["shed"]),
  num("roofSlope", "شیب سقف", "geometry", "درصد", 0, 100, ["shed"]),
  sel("crane", "آیا جرثقیل سقفی وجود دارد؟", "loads", ["بله", "خیر"], ["shed"]),
  { ...num("craneCapacity", "ظرفیت نامی جرثقیل", "loads", "تن", 0.1, 2000, ["shed"]), when: { key: "crane", is: "بله" } },
  { ...txt("craneLoads", "بار چرخ، ضربه، ترمز، کلاس کاری و خستگی", "loads", ["shed"]), when: { key: "crane", is: "بله" } },
  txt("timberProduct", "گونه/محصول، رده مقاومت، رطوبت و گواهی فنی", "geometry", ["timber"]),
  txt("coldFormedProduct", "محصول، شکل مقطع، ضخامت با واحد، پوشش و گواهی فنی", "geometry", ["cold-formed-steel"]),
  txt("coldFormedConnections", "اتصال ورق نازک، پیچ، سوراخ، مهار و مشخصات ساخت", "geometry", ["cold-formed-steel"]),
  txt("coldFormedBracing", "مهاربندی، قیود عضو و جزئیات نصب", "geometry", ["cold-formed-steel"]),
  num("retainedHeight", "ارتفاع خاک نگهداری‌شده", "geometry", "متر", 0.1, 50, ["retaining"]),
  txt("retainingGeometry", "مقطع دیوار، پاشنه، پنجه، کلید و زهکشی", "geometry", ["retaining"]),
  sel("tankShape", "شکل مخزن", "geometry", ["مستطیلی", "مدور", "سایر"], ["tank"]),
  { ...num("tankDiameter", "قطر داخلی مخزن", "geometry", "متر", 0.1, 200, ["tank"]), when: { key: "tankShape", is: "مدور" } },
  { ...txt("tankRectangle", "طول و عرض داخلی و تقسیم‌بندی مخزن", "geometry", ["tank"]), when: { key: "tankShape", is: "مستطیلی" } },
  { ...txt("tankOther", "شرح هندسهٔ ویژه مخزن", "geometry", ["tank"]), when: { key: "tankShape", is: "سایر" } },
  txt("tankMaterial", "مصالح، درزها، آب‌بندی و شرایط تماس با خاک", "geometry", ["tank"]),
  txt("bridgeSystem", "نوع عرشه، تعداد دهانه، پایه، کوله و تکیه‌گاه", "geometry", ["bridge"]),
  txt("traffic", "مدل بار ترافیک، ضربه، ترمز و خستگی", "loads", ["bridge"]),
  txt("scour", "هیدرولوژی، آب‌شستگی، برخورد و شرایط بستر", "loads", ["bridge"]),
  sel("towerType", "نوع دکل", "geometry", ["خودایستا", "مهاری", "تک‌پایه"], ["tower"]),
  { ...txt("guy", "هندسه کابل‌ها، پیش‌تنیدگی و مهارها", "geometry", ["tower"]), when: { key: "towerType", is: "مهاری" } },
  txt("equipment", "تجهیزات، سطح بادگیر، یخ و حدود ارتعاش", "loads", ["tower"]),
  txt("customScope", "هندسه، کارکرد و روش تحلیل موردنیاز", "geometry", ["other"]),
  txt("gravity", "بار مرده، زنده، تجهیزات و نحوه اعمال", "loads"),
  txt("wind", "باد مبنا، زبری، توپوگرافی و ضریب‌های مستند", "loads"),
  txt("seismic", "پارامترهای لرزه‌ای، نوع زمین و روش تحلیل", "loads"),
  txt("combinations", "ترکیبات بار و وضعیت‌های حدی با منبع", "loads"),
  txt("construction", "حالات موقت، توالی ساخت و خطرهای اجرا", "loads"),
  // ورودی‌های محاسبات مشخص؛ هیچ عددی از انتخاب خانواده حدس زده نمی‌شود.
  sel("beamModel", "دامنه مدل تیر", "assessment", ["تیر ساده منشوری؛ بار گسترده یکنواخت و تحلیل خطی", "شرایط دیگر"], ["concrete", "steel"]),
  ...[
    num("beamL", "طول تیر نمونه", "assessment", "متر", 0.2, 50),
    num("beamDepth", "ارتفاع مقطع تیر", "assessment", "متر", 0.02, 5),
    num("beamE", "مدول الاستیسیته مورد استفاده", "assessment", "گیگاپاسکال", 0.1, 500),
    num("beamI", "ممان دوم سطح مؤثر", "assessment", "سانتی‌متر به توان چهار", 1, 1e9),
    num("beamQ", "بار گسترده سرویس شامل وزن خود تیر", "assessment", "کیلو نیوتن بر متر", 0, 10000),
    num("beamLimit", "حد خیز واردشده از معیار پروژه", "assessment", "میلی‌متر", 0.01, 1000),
  ].map((f) => ({
    ...f,
    families: ["concrete", "steel"] as Family[],
    when: { key: "beamModel", is: "تیر ساده منشوری؛ بار گسترده یکنواخت و تحلیل خطی" },
  })),
  sel(
    "wallModel",
    "دامنه ارزیابی دیوار",
    "assessment",
    ["دیوار ثقلی؛ خاک خشک هموار بدون چسبندگی، زلزله و آب", "شرایط دیگر"],
    ["retaining"],
  ),
  ...[
    num("wallH", "ارتفاع خاک در مدل اولیه", "assessment", "متر", 0.1, 30),
    num("gamma", "وزن مخصوص خاک", "assessment", "کیلو نیوتن بر متر مکعب", 5, 35),
    num("phi", "زاویه اصطکاک داخلی", "assessment", "درجه", 0, 45),
    num("surcharge", "سربار یکنواخت", "assessment", "کیلوپاسکال", 0, 1000),
    num("baseB", "عرض پی دیوار", "assessment", "متر", 0.1, 30),
    num("weight", "نیروی قائم پایدارکننده در هر متر", "assessment", "کیلو نیوتن بر متر", 0.1, 100000),
    num("lever", "فاصله برآیند نیروی قائم از پنجه", "assessment", "متر", 0.01, 30),
    num("mu", "ضریب اصطکاک زیر پی", "assessment", "بدون بعد", 0.01, 1),
    num("bearing", "فشار مجاز زیر پی", "assessment", "کیلوپاسکال", 1, 10000),
    num("slideCriterion", "ضریب اطمینان لغزش موردنیاز پروژه", "assessment", "بدون بعد", 1, 10),
    num("overturnCriterion", "ضریب اطمینان واژگونی موردنیاز پروژه", "assessment", "بدون بعد", 1, 10),
  ].map((f) => ({
    ...f,
    families: ["retaining"] as Family[],
    when: { key: "wallModel", is: "دیوار ثقلی؛ خاک خشک هموار بدون چسبندگی، زلزله و آب" },
  })),
  sel("hydroModel", "دامنه مدل مایع", "assessment", ["مایع ساکن؛ دیوار قائم، سطح آزاد و فشار جو", "شرایط دیگر"], ["tank"]),
  ...[
    num("liquidH", "عمق مایع", "assessment", "متر", 0.01, 100),
    num("density", "چگالی مایع", "assessment", "کیلوگرم بر متر مکعب", 100, 3000),
  ].map((f) => ({ ...f, families: ["tank"] as Family[], when: { key: "hydroModel", is: "مایع ساکن؛ دیوار قائم، سطح آزاد و فشار جو" } })),
];
export function familyOf(id: unknown) {
  return FAMILIES.find((f) => f.id === id);
}
export function emptyStructure(family: Family): StructuralProfile {
  return { version: 1, family, step: 0, values: {}, references: {} };
}
export function fieldsFor(p: StructuralProfile) {
  return STRUCTURAL_FIELDS.filter((f) => (!f.families || f.families.includes(p.family)) && (!f.when || p.values[f.when.key] === f.when.is));
}
export function referenceList(family: Family) {
  return ["مبنای طراحی و مرجع تأیید پروژه", "گزارش ژئوتکنیک و برداشت", ...familyOf(family)!.references].map((label, i) => ({
    id: `ref-${i}`,
    label,
  }));
}
export function structuralErrors(value: unknown): string[] {
  const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
  if (
    !obj(value) ||
    value.version !== 1 ||
    !familyOf(value.family) ||
    !Number.isInteger(value.step) ||
    (value.step as number) < 0 ||
    (value.step as number) > 4 ||
    !obj(value.values) ||
    !obj(value.references)
  )
    return ["ساختار پروندهٔ تخصصی معتبر نیست."];
  const errors: string[] = Object.keys(value).some((k) => !["version", "family", "step", "values", "references", "frame"].includes(k))
    ? ["ویژگی ناشناخته در پروندهٔ تخصصی."]
    : [];
  const family = value.family as Family;
  if (value.frame !== undefined) {
    if (!FRAME_FAMILIES.some((f) => f === family)) errors.push("مدل قاب عمومی برای این مسیر فعال نیست؛ مدل تخصصی پیوسته لازم است.");
    errors.push(...frameInputErrors(value.frame));
  }
  for (const [key, v] of Object.entries(value.values)) {
    const f = STRUCTURAL_FIELDS.find((f) => f.key === key && (!f.families || f.families.includes(family)));
    if (!f) {
      errors.push("فیلد نامرتبط یا ناشناخته در مسیر سازه.");
      continue;
    }
    if (v === null || v === "") continue;
    if (f.type === "number") {
      if (typeof v !== "number" || !Number.isFinite(v) || v < f.min! || v > f.max! || (f.integer && !Number.isInteger(v)))
        errors.push(`${f.label}: بازهٔ نرم‌افزار ${f.min} تا ${f.max} ${f.unit} است.`);
    } else if (typeof v !== "string" || v.length > 2000 || (f.options && !f.options.includes(v)))
      errors.push(`${f.label}: مقدار معتبر نیست.`);
  }
  for (const [key, r] of Object.entries(value.references))
    if (
      !referenceList(family).some((x) => x.id === key) ||
      !obj(r) ||
      Object.keys(r).some((k) => !["document", "edition", "checkedAt"].includes(k)) ||
      (typeof r.checkedAt === "string" &&
        r.checkedAt !== "" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(r.checkedAt) ||
          !Number.isFinite(Date.parse(r.checkedAt)) ||
          new Date(r.checkedAt).toISOString().slice(0, 10) !== r.checkedAt)) ||
      ![r.document, r.edition, r.checkedAt].every((v) => typeof v === "string" && v.length <= 2000)
    )
      errors.push("مشخصات مرجع تخصصی معتبر نیست.");
  return errors;
}
