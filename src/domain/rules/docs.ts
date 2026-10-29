import type {
  EvidenceLevel,
  RuleDocumentRef,
  RuleInputRef,
  RuleTestRefs,
  SourceAvailability,
  SourceStatus,
  VerificationLevel,
} from "../types";

/**
 * HERMICAD rules package (stage 3).
 *
 * SOURCE AUDIT RESULT (recorded, not assumed)
 * -------------------------------------------
 * No official/licensed copy of the Iranian national building code (مقررات ملی
 * ساختمان / مرکز تحقیقات راه، مسکن و شهرسازی) is held by this system. A
 * reachability check was performed on 2026-02 and found only third-party
 * mirrors of the PDFs; no authoritative text or clause numbering could be
 * obtained, and none was retrieved into the repository. Consequently:
 *   - `document.clause` is null for every rule;
 *   - `verifiedAgainstOfficialText` is false for every rule;
 *   - no rule claims statutory compliance.
 * Labels such as CODE-04 / FIRE-03 are STABLE INTERNAL IDS kept only for
 * backwards compatibility with stored reports. They are not clause numbers and
 * must not be cited as such.
 */

export interface RuleDoc {
  id: string;
  titleFa: string;
  topic: string;
  inputs: string[];
  inputsDetailed: RuleInputRef[];
  method: string;
  formula: string;
  threshold: string;
  thresholdBasis: "engine-constant" | "project-input" | "internal-default";
  sourceStatus: SourceStatus;
  verification: VerificationLevel;
  evidence: EvidenceLevel;
  citation: string;
  limitations: string;
  document: RuleDocumentRef;
  tests: RuleTestRefs;
  verifiedAgainstOfficialText: false;
  remediation: string;
}

const AUDIT_DATE = "2026-02 (reachability check; no official text obtained)";

const auditNoteFor = (topic: string, availability: SourceAvailability): string => {
  switch (availability) {
    case "no-legal-source-applicable":
      return "این قاعده یک کنترل داخلی/هندسی است و ماهیتاً بند قانونی ندارد.";
    case "project-supplied-only":
      return "آستانه از ورودی پروژه (کاربر) می‌آید؛ سند قانونی مستقلی برای این پروژه ثبت نشده است.";
    case "official-text-not-obtained":
    default:
      return `موضوع «${topic}» در مقررات ملی دارای بند است، اما متن رسمی در دسترس سیستم نیست (${AUDIT_DATE}). شماره بند و مقدار قانونی ثبت نمی‌شود.`;
  }
};

const inputs = (rows: RuleInputRef[]): RuleInputRef[] => rows;

const internalAudit = (topic: string): RuleDocumentRef => ({
  title: null,
  version: null,
  clause: null,
  availability: "official-text-not-obtained",
  auditNote: auditNoteFor(topic, "official-text-not-obtained"),
});

const projectDoc = (): RuleDocumentRef => ({
  title: null,
  version: null,
  clause: null,
  availability: "project-supplied-only",
  auditNote: auditNoteFor("برنامه پروژه", "project-supplied-only"),
});

const integrityDoc = (): RuleDocumentRef => ({
  title: "HERMICAD model invariants",
  version: "1.1.0",
  clause: null,
  availability: "no-legal-source-applicable",
  auditNote: auditNoteFor("یکپارچگی مدل", "no-legal-source-applicable"),
});

const testsOf = (positive: string, negative: string, boundary: string): RuleTestRefs => ({
  positive,
  negative,
  boundary,
});

export const RULE_DOCS: Record<string, RuleDoc> = {
  "SITE-GEOM-01": {
    id: "SITE-GEOM-01",
    titleFa: "اعتبار هندسه زمین و استقرار بلوک‌ها",
    topic: "هندسه",
    inputs: ["boundary[]", "setbacks", "footprintRects[]", "buildablePolygon[]"],
    inputsDetailed: inputs([
      { name: "boundary[]", unit: "m (x,y)", required: true, origin: "ورودی زمین" },
      { name: "setbacks", unit: "m", required: true, origin: "ورودی زمین" },
      { name: "footprintRects[]", unit: "m", required: true, origin: "موتور طراحی مولد" },
      { name: "buildablePolygon[]", unit: "m", required: true, origin: "هندسه محاسباتی" },
    ]),
    method:
      "مساحت با فرمول شولیس؛ سادگی مرز با آزمون تقاطع اضلاع؛ استقرار با آزمون داخل‌بودن گوشه‌ها و پوشش هندسی بلوک در محدوده ساخت‌پذیر.",
    formula: "A = |Σ(x_i·y_(i+1) − x_(i+1)·y_i)| / 2 ؛ سپس polygonInsidePolygon(block, buildable)",
    threshold: "مساحت > ۰ و همه گوشه‌های بلوک داخل محدوده ساخت‌پذیر (تحمل ۱e-۶ m)",
    thresholdBasis: "engine-constant",
    sourceStatus: "internal-integrity-check",
    verification: "internally-tested",
    evidence: "integrity-check",
    citation: "کنترل یکپارچگی داخلی HERMICAD (آزمون هندسی، بدون ادعای قانونی)",
    limitations:
      "مرزهای خودمتماس و اضلاع هم‌خط با همپوشانی جزئی به‌طور کامل تشخیص داده نمی‌شوند.",
    document: integrityDoc(),
    tests: testsOf(
      "geometry.test: «مساحت شولیس با مقادیر مستقل» + استقرار بلوک‌ها در طرح نمونه",
      "rules.test: وارد کردن بلوک ۵۰۰ m بیرون از محدوده → نقض",
      "integration.test: زنجیره اتاق⊆واحد⊆بلوک⊆ساخت‌پذیر و زمین خودمتقاطع",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "مختصات مرز را اصلاح کنید؛ مرز نباید خودمتقاطع یا دارای مساحت صفر باشد.",
  },
  "CODE-04-FAR": {
    id: "CODE-04-FAR",
    titleFa: "کنترل تراکم ساختمانی",
    topic: "تراکم",
    inputs: ["grossFloorAreaM2", "plotAreaM2", "requirements.farMax"],
    inputsDetailed: inputs([
      { name: "grossFloorAreaM2", unit: "m²", required: true, origin: "محاسبه از هندسه" },
      { name: "plotAreaM2", unit: "m²", required: true, origin: "محاسبه از مرز زمین" },
      { name: "requirements.farMax", unit: "نسبت (-)", required: true, origin: "ورودی پروژه" },
    ]),
    method: "FAR = زیربنای کل ÷ مساحت زمین؛ مقایسه با سقف واردشده توسط کاربر.",
    formula: "FAR = GFA / plotArea ؛ نقض اگر FAR > farMax",
    threshold: "FAR ≤ requirements.farMax (بدون مقدار پیش‌فرض داخلی)",
    thresholdBasis: "project-input",
    sourceStatus: "project-requirement",
    verification: "internally-tested",
    evidence: "project-input",
    citation: "سقف تراکم پروژه (ورودی کاربر) — سند قانونی مستقل ثبت نشده",
    limitations:
      "منطقه‌بندی، تراکم تشویقی، معافیت زیرزمین و مساحت‌های معاف محاسبه نمی‌شوند. سقف از ورودی پروژه است، نه سند رسمی.",
    document: projectDoc(),
    tests: testsOf(
      "طرح نمونه: FAR ≤ سقف پروژه → منطبق",
      "rules.test: GFA = زمین × (farMax + 1) → نقض",
      "engineering.test: FAR معیار با محاسبه مستقیم GFA/plotArea",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "تعداد طبقات یا سطح اشغال را کاهش دهید تا تراکم مجاز رعایت شود.",
  },
  "CODE-04-COVERAGE": {
    id: "CODE-04-COVERAGE",
    titleFa: "کنترل سطح اشغال",
    topic: "سطح اشغال",
    inputs: ["footprintAreaM2", "plotAreaM2", "requirements.coverageMax"],
    inputsDetailed: inputs([
      { name: "footprintAreaM2", unit: "m²", required: true, origin: "هندسه بلوک‌ها" },
      { name: "plotAreaM2", unit: "m²", required: true, origin: "محاسبه از مرز زمین" },
      { name: "requirements.coverageMax", unit: "نسبت (-)", required: true, origin: "ورودی پروژه" },
    ]),
    method: "سطح اشغال = مجموع مساحت بلوک‌های همکف ÷ مساحت زمین.",
    formula: "coverage = footprint / plotArea ؛ نقض اگر coverage > coverageMax",
    threshold: "coverage ≤ requirements.coverageMax (بدون مقدار پیش‌فرض داخلی)",
    thresholdBasis: "project-input",
    sourceStatus: "project-requirement",
    verification: "internally-tested",
    evidence: "project-input",
    citation: "سقف سطح اشغال پروژه (ورودی کاربر) — سند قانونی مستقل ثبت نشده",
    limitations: "بالکن، پیش‌آمدگی، پاسیو و تفکیک قطعات محاسبه نمی‌شود.",
    document: projectDoc(),
    tests: testsOf(
      "طرح نمونه: نسبت ≤ سقف → منطبق",
      "rules.test: footprint = زمین × (coverageMax + 0.2) → نقض",
      "engineering.test: نسبت معیار با footprint/plotArea",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "پلان اشغال را کوچک‌تر کنید یا ارتفاع را افزایش دهید.",
  },
  "CODE-04-HEIGHT": {
    id: "CODE-04-HEIGHT",
    titleFa: "کنترل تعداد طبقات",
    topic: "ارتفاع",
    inputs: ["floors", "floorHeightM", "requirements.floorsMax"],
    inputsDetailed: inputs([
      { name: "floors", unit: "طبقه", required: true, origin: "مدل تولیدشده" },
      { name: "floorHeightM", unit: "m", required: false, origin: "ورودی پروژه" },
      { name: "requirements.floorsMax", unit: "طبقه", required: true, origin: "ورودی پروژه" },
    ]),
    method: "مقایسه تعداد طبقات مدل با سقف پروژه؛ ارتفاع کل فقط برای ردیابی گزارش می‌شود.",
    formula: "نقض اگر floors > floorsMax ؛ height = floors × floorHeightM (گزارشی)",
    threshold: "floors ≤ requirements.floorsMax (بدون مقدار پیش‌فرض داخلی)",
    thresholdBasis: "project-input",
    sourceStatus: "project-requirement",
    verification: "internally-tested",
    evidence: "project-input",
    citation: "سقف طبقات پروژه (ورودی کاربر) — سند قانونی مستقل ثبت نشده",
    limitations: "ارتفاع مجاز بر مبنای تراز خیابان، تاج بام، خرپشته و محدودیت‌های منطقه‌بندی کنترل نمی‌شود.",
    document: projectDoc(),
    tests: testsOf(
      "طرح نمونه: floors = floorsMax − ۱ → منطبق",
      "rules.test: floors = floorsMax + ۲ → نقض",
      "boundary: floors = floorsMax → منطبق (مرز بسته)",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "تعداد طبقات را به سقف مجاز کاهش دهید.",
  },
  "CODE-04-UNIT-SUPPLY": {
    id: "CODE-04-UNIT-SUPPLY",
    titleFa: "تأمین تعداد واحدهای برنامه",
    topic: "برنامه واحدها",
    inputs: ["unitsTotal", "requirements.dwellings[].count"],
    inputsDetailed: inputs([
      { name: "unitsTotal", unit: "واحد", required: true, origin: "مدل تولیدشده" },
      { name: "dwellings[].count", unit: "واحد", required: true, origin: "ورودی پروژه" },
    ]),
    method: "جمع تعداد واحدهای مدل‌شده در همه طبقات در برابر جمع برنامه درخواستی.",
    formula: "نقض اگر unitsTotal < Σ dwellings[].count",
    threshold: "تأمین‌شده ≥ درخواستی",
    thresholdBasis: "project-input",
    sourceStatus: "project-requirement",
    verification: "internally-tested",
    evidence: "project-input",
    citation: "برنامه واحدهای پروژه (ورودی کاربر)",
    limitations:
      "تأمین «مازاد» می‌تواند نشانه ناکفایتی برنامه‌ریزی مساحت باشد و در معیار بهره‌وری دیده می‌شود. بدون برنامه واحد، قاعده قابل ارزیابی نیست.",
    document: projectDoc(),
    tests: testsOf(
      "طرح نمونه: ۱۵ واحد در برابر برنامه ۱۴ → منطبق",
      "rules.test: unitsTotal = ۱ → نقض",
      "integration.test: افزایش طبقات تا تأمین کامل برنامه پس از اصلاح",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "ظرفیت طبقه یا تعداد طبقات را افزایش دهید تا تمام واحدهای درخواستی تأمین شود.",
  },
  "CODE-04-UNIT-MIX": {
    id: "CODE-04-UNIT-MIX",
    titleFa: "تطابق آمیزه گونه‌های واحد",
    topic: "برنامه واحدها",
    inputs: ["unitMix", "requirements.dwellings[]"],
    inputsDetailed: inputs([
      { name: "unitMix", unit: "واحد به تفکیک گونه", required: true, origin: "مدل تولیدشده" },
      { name: "dwellings[]", unit: "واحد به تفکیک گونه", required: true, origin: "ورودی پروژه" },
    ]),
    method: "مقایسه تعداد تأمین‌شده هر گونه با برنامه؛ «تأمین صفر» نقض و «کمبود جزئی» هشدار است.",
    formula: "برای هر گونه: delivered ≥ requested ؛ otherwise fail/warn",
    threshold: "برای هر گونه: تأمین‌شده ≥ درخواستی",
    thresholdBasis: "project-input",
    sourceStatus: "project-requirement",
    verification: "internally-tested",
    evidence: "project-input",
    citation: "برنامه واحدهای پروژه (ورودی کاربر)",
    limitations: "گونه‌های واحد از پیش تعریف‌شده‌اند؛ واحدهای قابل انعطاف یا ترکیبی مدل نمی‌شوند.",
    document: projectDoc(),
    tests: testsOf(
      "طرح نمونه: آمیزه ۱۰ دوخوابه + ۵ سه‌خوابه در برابر برنامه ۸+۶ → هشدار کمبود جزئی",
      "rules.test: unitMix = {twoBed:1, threeBed:0} → نقض",
      "integration.test: مجموع آمیزه = unitsTotal",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "با تغییر تعداد طبقات یا تخصیص گونه‌ها در طبقه، آمیزه واحدها را به برنامه نزدیک کنید.",
  },
  "CODE-04-MIN-DWELLING": {
    id: "CODE-04-MIN-DWELLING",
    titleFa: "حداقل زیربنای واحدها",
    topic: "حداقل سطح واحد",
    inputs: ["units[].areaM2", "UNIT_NET_FACTOR", "requirements.dwellings[].minAreaM2"],
    inputsDetailed: inputs([
      { name: "units[].areaM2", unit: "m² (ناخالص)", required: true, origin: "مدل تولیدشده" },
      { name: "UNIT_NET_FACTOR", unit: "نسبت (-)", required: true, origin: "فرض موتور (۰.۸۸)" },
      { name: "dwellings[].minAreaM2", unit: "m²", required: true, origin: "ورودی پروژه" },
    ]),
    method: "زیربنای خالص برآوردی = مساحت مستطیل واحد × ۰.۸۸؛ مقایسه با حداقل ورودی هر گونه.",
    formula: "net = area × 0.88 ؛ نقض اگر net + 0.05 < minAreaM2",
    threshold: "مساحت خالص هر واحد ≥ حداقل برنامه (بدون آستانه کشوری ادعاشده)",
    thresholdBasis: "project-input",
    sourceStatus: "project-requirement",
    verification: "internally-tested",
    evidence: "project-input",
    citation: "حداقل زیربنای برنامه (ورودی کاربر) — آستانه کشوری تأییدنشده و ثبت نشده",
    limitations:
      "مساحت بر پایه مستطیل ناخالص است، بدون تفکیک دیوار خارجی، بالکن غیرمحصور یا فضای زیر شیب. ضریب ۰.۸۸ فرض موتور است.",
    document: projectDoc(),
    tests: testsOf(
      "طرح نمونه: واحدها ≥ حداقل برنامه → منطبق",
      "rules.test: areaM2 = ۲۰ برای همه واحدها → نقض",
      "engineering.test: GFA/واحد و مساحت خالص بازمحاسبه می‌شود",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "چیدمان را با تعداد واحد کمتر در طبقه بازتولید کنید یا مساحت اشغال را افزایش دهید.",
  },
  "CODE-04-ROOM-MIN": {
    id: "CODE-04-ROOM-MIN",
    titleFa: "حداقل مساحت فضاهای اصلی",
    topic: "ابعاد فضا",
    inputs: ["levels[0].rooms[].areaM2", "rooms[].minAreaM2", "UNIT_NET_FACTOR"],
    inputsDetailed: inputs([
      { name: "rooms[].areaM2", unit: "m²", required: true, origin: "هندسه چیدمان" },
      { name: "rooms[].minAreaM2", unit: "m²", required: true, origin: "برنامه اتاق موتور (ROOM_PROGRAMS)" },
      { name: "UNIT_NET_FACTOR", unit: "نسبت (-)", required: true, origin: "فرض موتور (۰.۸۸)" },
    ]),
    method: "برای هر فضای دارای حداقل: مساحت خالص برآوردی با حداقل برنامه موتور مقایسه می‌شود.",
    formula: "نقض اگر area × 0.88 + 0.05 < minArea",
    threshold: "آستانه‌های داخلی HERMICAD در ROOM_PROGRAMS (غیررسمی)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "آستانه پیش‌فرض داخلی HERMICAD — بدون شماره بند و بدون ادعای انطباق",
    limitations:
      "ابعاد حداقلی، عرض قابل استفاده، نور و تهویه هر فضا کنترل نمی‌شود؛ مقادیر قابل جایگزینی با برنامه تأییدشده پروژه هستند.",
    document: internalAudit("حداقل ابعاد و سطح فضاهای مسکونی"),
    tests: testsOf(
      "طرح نمونه: فضاهای بالای حداقل → منطبق",
      "rules.test: کاهش مساحت یک اتاق به ۰.۵ m² → هشدار",
      "integration.test: مجموع مساحت فضاها = مساحت واحد",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "فضای کوچک را با فضای مجاور ادغام کنید یا برنامه واحد را بازتوزیع کنید.",
  },
  "FIRE-03-CORRIDOR": {
    id: "FIRE-03-CORRIDOR",
    titleFa: "حداقل عرض راهروی مشترک",
    topic: "راه فرار",
    inputs: ["levels[].corridorWidthM"],
    inputsDetailed: inputs([
      { name: "corridorWidthM", unit: "m", required: true, origin: "پارامتر موتور چیدمان" },
    ]),
    method: "مقایسه عرض مدل‌شده راهرو با حداقل داخلی ۱.۵ متر.",
    formula: "نقض اگر corridorWidthM < 1.5",
    threshold: "۱.۵ m (آستانه پیش‌فرض داخلی؛ مقدار قانونی ادعا نمی‌شود)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "آستانه پیش‌فرض داخلی HERMICAD (موضوع: راه فرار) — بدون شماره بند",
    limitations:
      "عرض مفید با احتساب بازشوها، ضخامت دیوار، دستگیره و مبلمان کاهش می‌یابد و کنترل نمی‌شود.",
    document: internalAudit("عرض راهرو و راه فرار"),
    tests: testsOf(
      "طرح نمونه: عرض ۲.۰ m → منطبق",
      "rules.test: عرض ۰.۹ m → نقض",
      "rules.test: ۱.۴۹ → نقض و ۱.۵۰ → منطبق (مرز دقیق)",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "عرض راهرو را حداقل به ۱.۵ متر افزایش دهید.",
  },
  "FIRE-03-EXITS": {
    id: "FIRE-03-EXITS",
    titleFa: "تعداد خروج‌های امن",
    topic: "راه فرار",
    inputs: ["levels[0].cores.length", "unitsPerFloor", "floors", "floorHeightM"],
    inputsDetailed: inputs([
      { name: "cores.length", unit: "تعداد", required: true, origin: "مدل چیدمان" },
      { name: "unitsPerFloor", unit: "واحد", required: true, origin: "مدل تولیدشده" },
      { name: "floors", unit: "طبقه", required: true, origin: "مدل تولیدشده" },
      { name: "floorHeightM", unit: "m", required: false, origin: "ورودی پروژه" },
    ]),
    method: "قاعده داخلی: اگر تعداد واحد در طبقه > ۵ یا ارتفاع کل > ۲۱ متر، حداقل دو هسته مستقل لازم است.",
    formula: "required = (unitsPerFloor > 5 || floors × floorHeightM > 21) ? 2 : 1",
    threshold: "≥۲ هسته در شرایط مذکور، در غیر این صورت ≥۱ (آستانه داخلی)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "آستانه پیش‌فرض داخلی HERMICAD برای تفکیک راه خروج — بدون شماره بند",
    limitations:
      "مقاومت حریق، عرض پله، فاصله محافظت‌شده، فشار مثبت و راهروی مشترک ایمن مدل نمی‌شود. با نبود هسته، قاعده نقض می‌دهد نه انطباق.",
    document: internalAudit("تعداد و تفکیک راه‌های خروج"),
    tests: testsOf(
      "طرح نمونه: ۲ هسته برای ۳ واحد در طبقه → منطبق",
      "rules.test: حذف هسته‌ها → نقض",
      "rules.test: ۶ واحد در طبقه → نیاز به دو خروج (مرز ۵/۶)",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "برای هر طبقه حداقل دو هسته مستقل فرار پیش‌بینی کنید.",
  },
  "FIRE-03-TRAVEL": {
    id: "FIRE-03-TRAVEL",
    titleFa: "حداکثر فاصله حرکت تا خروج",
    topic: "راه فرار",
    inputs: ["rooms[].polygon", "cores[].rect", "DISTANCE_FACTORS.pathToCore"],
    inputsDetailed: inputs([
      { name: "rooms[].polygon", unit: "m", required: true, origin: "هندسه چیدمان" },
      { name: "cores[].rect", unit: "m", required: true, origin: "مدل چیدمان" },
      { name: "pathToCore factor", unit: "-", required: true, origin: "فرض موتور (۱.۲)" },
    ]),
    method:
      "فاصله مرکز هر فضای قابل سکونت تا مرکز نزدیک‌ترین هسته × ضریب مسیر ۱.۲. در صورت نبود هسته، ارزیابی انجام نمی‌شود (insufficient) چون مقدار صفر به‌طور کاذب انطباق نشان می‌داد.",
    formula: "d = max over habitable rooms( dist(roomCenter, coreCenter) × 1.2 )",
    threshold: "۳۰ m (آستانه پیش‌فرض داخلی)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "آستانه پیش‌فرض داخلی HERMICAD (موضوع: فاصله حرکت) — بدون شماره بند",
    limitations:
      "مسیر واقعی، مانع، پیچ راهرو و فاصله تا در خروجی محاسبه نمی‌شود؛ مقدار گزارش‌شده حد پایین و خوش‌بینانه است.",
    document: internalAudit("فاصله حرکت تا خروج"),
    tests: testsOf(
      "طرح نمونه: فاصله محاسبه‌شده زیر ۳۰ m → منطبق",
      "rules.test: maxTravelDistanceM = ۴۰ → نقض",
      "rules.test: حذف هسته‌ها → insufficient (نه انطباق کاذب)",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "هسته فرار دوم یا خروج اضطراری اضافه کنید تا فاصله حرکت کاهش یابد.",
  },
  "NBR-21-PARKING": {
    id: "NBR-21-PARKING",
    titleFa: "تأمین پارکینگ",
    topic: "پارکینگ",
    inputs: [
      "unitsTotal",
      "requirements.parkingPerDwelling",
      "requirements.visitorParkingRatio",
      "footprintAreaM2",
      "plotAreaM2",
    ],
    inputsDetailed: inputs([
      { name: "unitsTotal", unit: "واحد", required: true, origin: "مدل تولیدشده" },
      { name: "parkingPerDwelling", unit: "جایگاه/واحد", required: true, origin: "ورودی پروژه" },
      { name: "visitorParkingRatio", unit: "نسبت", required: true, origin: "ورودی پروژه" },
      { name: "footprintAreaM2 / plotAreaM2", unit: "m²", required: true, origin: "هندسه" },
    ]),
    method:
      "نیاز = سقف‌گرد(واحد × نسبت ساکنین + واحد × نسبت مهمان). تأمین = جایگاه سطحی برآوردی + ظرفیت زیرزمین بر پایه ۲۸ m² مؤثر هر جایگاه.",
    formula: "required = ceil(u×(p+v)) ؛ provided = floor(open×0.55/32) + n×floor(0.78×footprint/28)",
    threshold: "تأمین ≥ نیاز (نسبت‌ها ورودی پروژه، مساحت مؤثر آستانه داخلی)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "نسبت‌های ورودی کاربر + آستانه مساحت داخلی HERMICAD — بدون شماره بند",
    limitations:
      "چیدمان، رمپ، شیب، ارتفاع آزاد، تهویه، تعداد معلولین و ظرفیت واقعی طراحی نمی‌شود؛ عدد تأمین برآوردی است.",
    document: internalAudit("تأمین پارکینگ"),
    tests: testsOf(
      "طرح نمونه: ۱۸ جایگاه برای ۱۷ نیاز → منطبق",
      "stress fixture (بدون زیرزمین، نسبت ۱.۴) → نقض",
      "rules.test: providedStalls = ۰ → نقض",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "پارکینگ زیرزمینی/سطحی بیشتری تخصیص دهید یا تعداد واحد را کاهش دهید.",
  },
  "NBR-15-DAYLIGHT": {
    id: "NBR-15-DAYLIGHT",
    titleFa: "نور روز فضاهای قابل سکونت",
    topic: "نور و تهویه",
    inputs: ["rooms[].facadeM", "rooms[].areaM2", "GLAZING_RATIO_MIN"],
    inputsDetailed: inputs([
      { name: "rooms[].facadeM", unit: "m", required: true, origin: "هندسه چیدمان" },
      { name: "rooms[].areaM2", unit: "m²", required: true, origin: "هندسه چیدمان" },
      { name: "GLAZING_RATIO_MIN", unit: "نسبت", required: true, origin: "آستانه داخلی (۰.۰۸)" },
    ]),
    method:
      "شاخص جایگزین: (۰.۹ × طول نمای اتاق) ÷ مساحت اتاق؛ حد پذیرش ۰.۰۸. اگر هیچ فضای قابل سکونتی وجود نداشته باشد ارزیابی انجام نمی‌شود (insufficient).",
    formula: "ratio = 0.9 × facadeM / areaM2 ؛ منطبق اگر ratio ≥ 0.08",
    threshold: "ratio ≥ ۰.۰۸ (آستانه داخلی، جانشین تحلیل DF/DA)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "آستانه پیش‌فرض داخلی HERMICAD — تحلیل نور روز واقعی انجام نمی‌شود",
    limitations:
      "ارتفاع پنجره، سایه‌اندازی همسایگی، جهت‌گیری، انعکاس و ضریب عبور نور مدل نمی‌شوند. نتیجه غربالگری است، نه تحلیل نور روز.",
    document: internalAudit("نورگیری فضاهای اصلی"),
    tests: testsOf(
      "طرح نمونه: همه فضاهای قابل سکونت ≥ ۰.۰۸ → منطبق",
      "rules.test: compliantRooms = ۰ → نقض",
      "rules.test: حذف تمام فضاهای قابل سکونت → insufficient (نه انطباق کاذب)",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "چیدمان را تغییر دهید تا هر فضای قابل سکونت به نمای خارجی دسترسی داشته باشد.",
  },
  "NBR-15-CROSSVENT": {
    id: "NBR-15-CROSSVENT",
    titleFa: "تهویه دوطرفه واحدها",
    topic: "نور و تهویه",
    inputs: ["units[].rect.h", "MAX_CROSS_VENTILATION_DEPTH_M"],
    inputsDetailed: inputs([
      { name: "units[].rect.h", unit: "m", required: true, origin: "مدل چیدمان" },
      { name: "MAX_CROSS_VENTILATION_DEPTH_M", unit: "m", required: true, origin: "آستانه داخلی (۱۴ m)" },
    ]),
    method: "مقایسه عمق واحد با حد ۱۴ متر به‌عنوان شاخص امکان تهویه دوطرفه.",
    formula: "warn اگر maxUnitDepth > 14",
    threshold: "عمق واحد ≤ ۱۴ m (آستانه داخلی)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "آستانه پیش‌فرض داخلی HERMICAD — بدون شماره بند",
    limitations: "وجود بازشو در دو جبهه به‌صورت هندسی کنترل نمی‌شود؛ فقط عمق سنجیده می‌شود.",
    document: internalAudit("تهویه طبیعی"),
    tests: testsOf(
      "طرح نمونه: عمق واحد ≤ ۱۴ m → منطبق",
      "rules.test: عمق ۲۲ m → هشدار",
      "boundary: عمق ۱۴.۰ → منطبق",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "عمق واحد را کاهش دهید یا چاه نور میانی اضافه کنید.",
  },
  "STRUCT-02-COLUMN": {
    id: "STRUCT-02-COLUMN",
    titleFa: "کنترل مقدماتی ابعاد ستون",
    topic: "سازه",
    inputs: ["structural.columnSizeMm", "structural.columnLoadKN", "footprintAreaM2"],
    inputsDetailed: inputs([
      { name: "columnSizeMm", unit: "mm", required: true, origin: "محاسبه موتور" },
      { name: "columnLoadKN", unit: "kN", required: true, origin: "محاسبه موتور (بار سرانگشتی)" },
      { name: "footprintAreaM2", unit: "m²", required: true, origin: "هندسه" },
    ]),
    method:
      "بار محوری = سطح بارگیر × طبقات × (۱.۲۵ × بار مرده + ۱.۵ × بار زنده)؛ Ag = Pu/(۰.۳۵ f'c)؛ بعد مقاطع به مضرب ۵۰ mm.",
    formula: "Pu = A_trib × n × (1.25×6.5 + 1.5×2.0) kPa ؛ b ≈ √(Pu·1000/(0.35×25))",
    threshold: "بعد ستون ≤ ۷۰۰ mm به‌عنوان محدوده متعارف (آستانه داخلی)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "روش طراحی مقدماتی داخلی (فقط کنترل اولیه) — جایگزین تحلیل و طرح سازه نیست",
    limitations:
      "ترکیب بار، لنگر، لاغری، اثر زلزله در ستون، ضریب رفتار و الزامات لرزه‌ای ستون کنترل نمی‌شود.",
    document: internalAudit("طراحی ستون بتن‌آرمه"),
    tests: testsOf(
      "engineering.test: بازمحاسبه Pu و بعد ستون با فرمول مستقل",
      "rules.test: columnSizeMm = ۹۰۰ → هشدار",
      "structural grid از ابعاد بلوک با هدف دهانه ۶ m",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "ابعاد ستون یا تعداد دهانه‌ها را بازتنظیم کنید؛ طرح نهایی نیازمند تحلیل سازه است.",
  },
  "STRUCT-02-FOUNDATION": {
    id: "STRUCT-02-FOUNDATION",
    titleFa: "کنترل مقدماتی تنش پی",
    topic: "سازه",
    inputs: ["structural.requiredFoundationWidthM", "site.soilBearingKPa", "structural.columnLoadKN"],
    inputsDetailed: inputs([
      { name: "requiredFoundationWidthM", unit: "m", required: true, origin: "محاسبه موتور" },
      { name: "soilBearingKPa", unit: "kPa", required: true, origin: "ورودی زمین (بدون آزمون ژئوتکنیک)" },
      { name: "columnLoadKN", unit: "kN", required: true, origin: "محاسبه موتور" },
    ]),
    method: "عرض پی = √(بار خدمت ستون × ۱.۱ ÷ تنش مجاز خاک)؛ مقایسه با ۳ متر.",
    formula: "b = √(1.1 × P_service / q_allow) ؛ هشدار/نقض اگر b > 3 m",
    threshold: "عرض پی ≤ ۳ m (آستانه داخلی)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "روش مقدماتی داخلی — ظرفیت خاک ورودی کاربر و تأییدنشده است",
    limitations:
      "نشست، ظرفیت نهایی، آب زیرزمینی و اثر زلزله بررسی نمی‌شود. نبود ظرفیت خاک معتبر ⇒ ارزیابی انجام نمی‌شود (insufficient).",
    document: internalAudit("پی‌سازی و ظرفیت باربری خاک"),
    tests: testsOf(
      "engineering.test: بازمحاسبه عرض پی از بار خدمت × ۱.۱ ÷ q",
      "rules.test: requiredFoundationWidthM = ۴.۲ → نقض",
      "rules.test: soilBearingKPa = ۰ → insufficient (نه انطباق)",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "ابعاد پی را افزایش دهید یا رادیه/شمع پیش‌بینی کنید؛ داده ژئوتکنیک را تأمین کنید.",
  },
  "STRUCT-02-SEISMIC": {
    id: "STRUCT-02-SEISMIC",
    titleFa: "کنترل مقدماتی ضریب زلزله",
    topic: "سازه",
    inputs: ["structural.seismicCoefficient", "site.seismicZone", "SEISMIC_PARAMS"],
    inputsDetailed: inputs([
      { name: "seismicCoefficient", unit: "-", required: true, origin: "محاسبه موتور" },
      { name: "site.seismicZone", unit: "enum", required: true, origin: "ورودی زمین" },
      { name: "SEISMIC_PARAMS.A", unit: "-", required: true, origin: "جدول داخلی ساده‌شده (تأییدنشده)" },
    ]),
    method: "C = A·B·I/R؛ V = C·W؛ A از جدول ساده‌شده پهنه (۰.۲۰ تا ۰.۳۵)، B=۲.۵، I=۱.۰، R=۷.۵.",
    formula: "C = A×B×I/R ؛ V = C×W",
    threshold: "C ≤ ۰.۱۵ (آستانه داخلی)",
    thresholdBasis: "engine-constant",
    sourceStatus: "unverified-citation",
    verification: "internally-tested",
    evidence: "unverified-external",
    citation:
      "پیاده‌سازی ساده‌شده با موضوع لرزه‌ای؛ مقادیر A در جدول داخلی تقریب زده شده و با هیچ نسخه معتبری تطبیق داده نشده است (تنها قاعده با ارجاع بیرونی تأییدنشده)",
    limitations:
      "طیف طرح، اثر ساختگاه، نزدیکی گسل، نامنظمی، زمان تناوب، دریفت، پیچش و ترکیب بار لرزه‌ای بررسی نمی‌شود. این یک تصمیم طراحی نیست.",
    document: {
      title: null,
      version: null,
      clause: null,
      availability: "official-text-not-obtained",
      auditNote:
        "جدول A و ضرایب B/I/R از حافظه مهندسی وارد شده و هیچ متن رسمی برای تطبیق در دسترس نبود. مقدار قانونی اعلام نمی‌شود.",
    },
    tests: testsOf(
      "engineering.test: C، W و V با ثابت‌های اعلام‌شده بازمحاسبه می‌شود",
      "rules.test: seismicCoefficient = ۰.۴ → هشدار",
      "engineering.test: فرض st-zone باید عدم تطبیق با نسخه معتبر را اعلام کند",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "سیستم سازه‌ای با شکل‌پذیری بالاتر یا تحلیل دینامیکی لازم است؛ جدول A باید با نسخه معتبر جایگزین شود.",
  },
  "MEP-16-WATER": {
    id: "MEP-16-WATER",
    titleFa: "ظرفیت ذخیره آب",
    topic: "تأسیسات",
    inputs: ["mep.occupancy", "mep.waterDailyLiters", "mep.waterTankLiters", "site.climate"],
    inputsDetailed: inputs([
      { name: "occupancy", unit: "نفر", required: true, origin: "محاسبه از برنامه واحدها" },
      { name: "waterDailyLiters", unit: "L/روز", required: true, origin: "محاسبه موتور" },
      { name: "waterTankLiters", unit: "L", required: true, origin: "محاسبه موتور" },
    ]),
    method: "مصرف روزانه = جمعیت × سرانه اقلیمی (۱۴۰–۱۶۰ L)؛ مخزن = ۱.۲ برابر مصرف روزانه (سقف‌گرد ۱۰۰ L).",
    formula: "D = N × q_climate ؛ V_tank = ceil(1.2 × D / 100) × 100",
    threshold: "حجم مخزن ≥ ۰.۹ × مصرف روزانه",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "روش برآورد مقدماتی داخلی (موضوع: تأمین آب) — بدون شماره بند",
    limitations:
      "ذخیره آتش‌نشانی، دبی همزمان واقعی، فشار شبکه، افت فشار مسیر و کیفیت آب محاسبه نمی‌شود.",
    document: internalAudit("تأمین و ذخیره آب"),
    tests: testsOf(
      "engineering.test: بازمحاسبه مصرف، مخزن و قطر لوله از جدول استاندارد",
      "rules.test: مخزن ۱۰ L در برابر مصرف ۱۰٬۰۰۰ L → هشدار",
      "boundary: مخزن = ۰.۹ × مصرف → منطبق",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "حجم مخزن ذخیره را افزایش دهید.",
  },
  "MEP-13-ELECTRICAL": {
    id: "MEP-13-ELECTRICAL",
    titleFa: "ظرفیت ترانسفورماتور",
    topic: "تأسیسات",
    inputs: ["mep.electricalConnectedKVA", "mep.electricalDemandKVA", "mep.transformerKVA"],
    inputsDetailed: inputs([
      { name: "electricalConnectedKVA", unit: "kVA", required: true, origin: "محاسبه موتور" },
      { name: "electricalDemandKVA", unit: "kVA", required: true, origin: "محاسبه موتور" },
      { name: "transformerKVA", unit: "kVA", required: true, origin: "جدول اندازه استاندارد" },
    ]),
    method:
      "توان نصب‌شده = واحدها × kVA/واحد + ۱۵ kVA مشاعات؛ تقاضا = ۰.۶ × نصب‌شده؛ ترانس = اولین اندازه استاندارد ≥ ۱.۲۵ × تقاضا.",
    formula: "demand = 0.6 × connected ؛ transformer = nextStandard(1.25 × demand)",
    threshold: "ظرفیت ترانس ≥ تقاضای همزمان",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "روش برآورد مقدماتی داخلی (موضوع: برق) — بدون شماره بند",
    limitations:
      "بارهای واقعی، ضریب همزمانی هر مصرف‌کننده، افت ولتاژ، شبکه توزیع، حفاظت و ژنراتور اضطراری بررسی نمی‌شود.",
    document: internalAudit("برآورد بار الکتریکی"),
    tests: testsOf(
      "engineering.test: ترانس از جدول استاندارد و ≥ تقاضا",
      "rules.test: ترانس ۵ kVA در برابر تقاضای ۱۲۰ kVA → نقض",
      "engineering.test: اندازه‌های ترانس باید در فهرست استاندارد باشند",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "ظرفیت ترانس را یک پله استاندارد افزایش دهید.",
  },
  "DATA-01-INTEGRITY": {
    id: "DATA-01-INTEGRITY",
    titleFa: "یکپارچگی مدل مهندسی",
    topic: "داده",
    inputs: [
      "levels[].rooms[].polygon/areaM2",
      "levels[].plateAreaM2",
      "grossFloorAreaM2",
      "footprintRects[]",
      "buildablePolygon[]",
    ],
    inputsDetailed: inputs([
      { name: "rooms[].polygon / areaM2", unit: "m / m²", required: true, origin: "مدل مرکزی" },
      { name: "levels[].plateAreaM2", unit: "m²", required: true, origin: "مدل مرکزی" },
      { name: "footprintRects[] / buildablePolygon[]", unit: "m", required: true, origin: "هندسه" },
    ]),
    method:
      "بازسازی مساحت چندضلعی، یکتایی شناسه‌ها، برابری مجموع سطح طبقات با GFA، کنترل هندسی زنجیره اتاق ⊆ بلوک ⊆ محدوده ساخت‌پذیر، و کنترل لایه پلان (پوشش دیوار، استقرار بازشو، پنجره هر فضای قابل سکونت، دسترسی از در، جای‌گیری پله).",
    formula:
      "Σ area(poly_i) ≈ area_i (±0.05 m²) ∧ rooms ⊆ plates ⊆ buildable ∧ openings ⊆ walls ∧ window(habitable) ∧ stair(depth,width)",
    threshold: "صفر ناسازگاری (تحمل ۰.۰۵ m² و ۰.۰۲ m)",
    thresholdBasis: "engine-constant",
    sourceStatus: "internal-integrity-check",
    verification: "internally-tested",
    evidence: "integrity-check",
    citation: "قاعده یکپارچگی داخلی HERMICAD" as string,
    limitations:
      "همپوشانی جزئی بین فضاها فقط به‌طور غیرمستقیم (مساحت/مرز) دیده می‌شود، نه با آزمون کامل همپوشانی چندضلعی. ضخامت دیوار در مساحت‌های خالص لحاظ نشده است (طبقه‌بندی ناخالص/خالص با ضریب ۱۲٪).",
    document: integrityDoc(),
    tests: testsOf(
      "integration.test: زنجیره استقرار و تایل‌بندی در همه طرح‌ها",
      "rules.test: افزودن ۵ m² به areaM2 یک اتاق → نقض",
      "integration.test: یکپارچگی پس از اصلاح خودکار حفظ می‌شود",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "مدل را بازتولید کنید؛ اختلاف بین هندسه و مقادیر ثبت‌شده نشانه نقص داده است.",
  },
  "ARCH-04-EFFICIENCY": {
    id: "ARCH-04-EFFICIENCY",
    titleFa: "بهره‌وری خالص به ناخالص",
    topic: "کیفیت طراحی",
    inputs: ["netAreaM2", "grossFloorAreaM2"],
    inputsDetailed: inputs([
      { name: "netAreaM2", unit: "m²", required: true, origin: "محاسبه موتور" },
      { name: "grossFloorAreaM2", unit: "m²", required: true, origin: "محاسبه موتور" },
    ]),
    method: "نسبت زیربنای خالص (پس از ۱۲٪ افت) به GFA؛ آستانه ۶۰٪.",
    formula: "efficiency = net / GFA × 100 ؛ warn اگر < 60",
    threshold: "≥ ۶۰٪ (آستانه داخلی)",
    thresholdBasis: "internal-default",
    sourceStatus: "internal-engineering-threshold",
    verification: "internally-tested",
    evidence: "internal-assumption",
    citation: "آستانه پیش‌فرض داخلی HERMICAD برای سنجش توزیع سطح",
    limitations:
      "مساحت مفید قابل فروش، تفکیک مشاعات و انعطاف‌پذیری پلان ارزیابی نمی‌شود؛ عدد به ضریب فرضی ۱۲٪ وابسته است.",
    document: internalAudit("بهره‌وری سطوح"),
    tests: testsOf(
      "طرح نمونه: بهره‌وری ≥ ۶۰٪ → منطبق",
      "rules.test: efficiency = ۱۰ → هشدار",
      "engineering.test: GFA = footprint × floors",
    ),
    verifiedAgainstOfficialText: false,
    remediation: "سطح مشاعات/هسته را کاهش دهید یا چیدمان واحدها را فشرده‌تر کنید.",
  },
};

export function ruleDoc(id: string): RuleDoc {
  return (
    RULE_DOCS[id] ?? {
      id,
      titleFa: id,
      topic: "نامشخص",
      inputs: [],
      inputsDetailed: [],
      method: "مستند نشده",
      formula: "نامشخص",
      threshold: "نامشخص",
      thresholdBasis: "internal-default",
      sourceStatus: "internal-engineering-threshold" as SourceStatus,
      verification: "unverified" as VerificationLevel,
      evidence: "internal-assumption" as EvidenceLevel,
      citation: "منبع مستند نشده",
      limitations: "برای این قاعده مستندات ثبت نشده است؛ نتیجه نباید مبنای تصمیم قرار گیرد.",
      document: {
        title: null,
        version: null,
        clause: null,
        availability: "official-text-not-obtained",
        auditNote: "مستندات قاعده ثبت نشده است.",
      },
      tests: { positive: "—", negative: "—", boundary: "—" },
      verifiedAgainstOfficialText: false,
      remediation: "مستندات قاعده را تکمیل کنید.",
    }
  );
}

export const RULE_DOC_LIST = Object.values(RULE_DOCS);

/** Stable fingerprint of the rules package (ids + provenance + thresholds). */
export function rulesetFingerprint(): string {
  const payload = Object.values(RULE_DOCS)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((d) =>
      [
        d.id,
        d.sourceStatus,
        d.verification,
        d.evidence,
        d.thresholdBasis,
        d.document.availability,
        d.document.clause ?? "null",
        d.document.version ?? "null",
        String(d.verifiedAgainstOfficialText),
      ].join("|"),
    )
    .join("\n");
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return `hpm-${hash.toString(16).padStart(8, "0")}`;
}

export const SOURCE_AUDIT = {
  auditedAt: "2026-02",
  officialTextObtained: false,
  method:
    "بررسی دسترس‌پذیری متن رسمی مباحث مقررات ملی؛ نتایج عمومی فقط نسخه‌های بازنشرشده توسط سایت‌های ثالث بودند و متن/شماره بند معتبر در دسترس سیستم قرار نگرفت.",
  consultedSources: [
    {
      label: "مرکز تحقیقات راه، مسکن و شهرسازی / پایگاه مقررات ملی (متن رسمی)",
      reachable: false,
      usedForValues: false,
      note: "دسترسی به متن رسمی/لایسنس‌دار در این محیط برقرار نشد.",
    },
    {
      label: "آینه‌های عمومی PDF مبحث ۴ (سایت‌های ثالث)",
      reachable: true,
      usedForValues: false,
      note: "فقط تأیید وجود ویرایش‌هایی مانند ۱۳۹۶؛ هیچ مقدار یا شماره بندی از آن‌ها استخراج نشد.",
    },
  ],
  consequence:
    "تمام ۲۱ قاعده unverified می‌مانند؛ document.clause برای همه null است و هیچ آستانه‌ای به‌عنوان مقدار قانونی گزارش نمی‌شود.",
} as const;
