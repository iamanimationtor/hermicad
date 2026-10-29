import {FRAME_FORMULAS} from "../structures/frame/formulas";
import { STRUCTURAL_FORMULAS } from "../structures/formulas";
/**
 * Engineering formula registry (stage 4).
 *
 * Every numeric output of the engine is produced by a formula registered here
 * so that units, validity limits, classification and limitations travel with
 * the number. Nothing in this registry is presented as a verified engineering
 * design method: `classification` states exactly how trustable the expression
 * is, and `verification` records whether an external authority was consulted.
 */

export type FormulaClass =
  | "closed-form-geometry"
  | "screening-estimate"
  | "unverified-code-derived"
  | "arbitrary-index";

export interface FormulaInput {
  symbol: string;
  name: string;
  unit: string;
}

export interface FormulaValidity {
  /** Human-readable domain in which the expression may be applied. */
  domain: string;
  /** Concrete numeric guards; outside these the result must be flagged. */
  limits: { parameter: string; min: number | null; max: number | null; unit: string }[];
  failureMode: string;
}

export interface FormulaRecord {
  id: string;
  label: string;
  expression: string;
  resultUnit: string;
  inputs: FormulaInput[];
  classification: FormulaClass;
  assumptions: string[];
  validity: FormulaValidity;
  limitations: string;
  verification: "internally-tested" | "unverified";
  /** Set only when an official specification was actually consulted. */
  externalRef?: { body: string; document: string; url: string; checkedAt: string };
  usedByRules: string[];
}

const R = (record: FormulaRecord): FormulaRecord => record;

export const FORMULAS: Record<string, FormulaRecord> = {
  ...STRUCTURAL_FORMULAS,
  ...FRAME_FORMULAS,
  "GEO-SHOELACE": R({
    id: "GEO-SHOELACE",
    label: "مساحت چندضلعی (شولیس)",
    expression: "A = |Σ(x_i·y_(i+1) − x_(i+1)·y_i)| / 2",
    resultUnit: "m²",
    inputs: [
      { symbol: "x_i, y_i", name: "مختصات رئوس به ترتیب", unit: "m" },
      { symbol: "n", name: "تعداد رئوس", unit: "-" },
    ],
    classification: "closed-form-geometry",
    assumptions: ["رئوس به ترتیب پیمایش شده‌اند", "چندضلعی ساده (بدون خودتقاطع) است"],
    validity: {
      domain: "هر چندضلعی ساده با n ≥ ۳",
      limits: [{ parameter: "n", min: 3, max: null, unit: "رأس" }],
      failureMode: "برای مرز خودمتقاطع مقدار علامت‌دار بی‌معنا می‌شود؛ پیش از استفاده باید polygonIsSimple اجرا شود.",
    },
    limitations: "مساحت هیچ اطلاعاتی درباره ساخت‌پذیری یا توپوگرافی نمی‌دهد.",
    verification: "internally-tested",
    usedByRules: ["SITE-GEOM-01", "DATA-01-INTEGRITY"],
  }),
  "GEO-SETBACK-HALFPLANE": R({
    id: "GEO-SETBACK-HALFPLANE",
    label: "محدوده ساخت‌پذیر با تقاطع نیم‌صفحه",
    expression: "B = ∩_edges { p | (p − a_i)·n̂_i ≥ −s(dir(n̂_i)) }",
    resultUnit: "m² / m",
    inputs: [
      { symbol: "boundary", name: "مرز زمین", unit: "m" },
      { symbol: "s", name: "عقب‌نشینی جهت‌دار", unit: "m" },
    ],
    classification: "closed-form-geometry",
    assumptions: ["عقب‌نشینی جهت‌دار بر مبنای نرمال بیرونی هر ضلع", "برای اضلاع مورب، فاصله کاردینال ≥ فاصله عمودی است"],
    validity: {
      domain: "دقیق برای زمین محدب؛ برای زمین مقعر محافظه‌کارانه (زیرمجموعه)",
      limits: [
        { parameter: "setback", min: 0, max: null, unit: "m" },
        { parameter: "polygon vertices", min: 3, max: 200, unit: "رأس" },
      ],
      failureMode: "برای زمین مقعر ممکن است بخشی از سطح مجاز از دست برود؛ هرگز بیش‌برآورد نمی‌کند.",
    },
    limitations: "زمین‌های خودمتماس، جزایر داخلی (حیاط) و پهنه‌های ممنوعه به‌صورت سوراخ مدل نمی‌شوند.",
    verification: "internally-tested",
    usedByRules: ["SITE-GEOM-01", "CODE-04-COVERAGE"],
  }),
  "GEO-INSCRIBED-RECT": R({
    id: "GEO-INSCRIBED-RECT",
    label: "بیشینه مستطیل محاطی روی شبکه",
    expression: "max{w·h | rect ⊆ buildable, grid = 1 m}",
    resultUnit: "m",
    inputs: [
      { symbol: "buildable", name: "محدوده ساخت‌پذیر", unit: "m" },
      { symbol: "step", name: "گام شبکه", unit: "m" },
    ],
    classification: "screening-estimate",
    assumptions: ["شبکه ۱×۱ متر", "مرز سلول باید کامل داخل محدوده باشد"],
    validity: {
      domain: "مستطیل‌های بزرگ‌تر از ۲×۲ متر",
      limits: [{ parameter: "plate width/depth", min: 2, max: null, unit: "m" }],
      failureMode: "کوانتیزاسیون ۱ متری؛ ابعاد می‌تواند تا یک گام کمتر از واقعیت باشد.",
    },
    limitations: "استخراج مستطیل، شکل L یا حیاط مرکزی را به یک بلوک ساده تبدیل می‌کند.",
    verification: "internally-tested",
    usedByRules: ["SITE-GEOM-01"],
  }),
  "STRUCT-GRID": R({
    id: "STRUCT-GRID",
    label: "شبکه سازه از ابعاد بلوک",
    expression: "n_x = round(w / 6) + 1 ؛ L_x = w / (n_x − 1)",
    resultUnit: "m / تعداد دهانه",
    inputs: [
      { symbol: "w, h", name: "ابعاد بلوک", unit: "m" },
      { symbol: "L_target", name: "دهانه هدف", unit: "m" },
    ],
    classification: "screening-estimate",
    assumptions: ["دهانه هدف ۶ متر (مرز اقتصادی متعارف قاب بتن‌آرمه)"],
    validity: {
      domain: "دهانه‌های ۴ تا ۱۰ متر",
      limits: [
        { parameter: "span", min: 4, max: 10, unit: "m" },
        { parameter: "plate width", min: 8, max: 120, unit: "m" },
      ],
      failureMode: "خارج از بازه، کنترل‌های تیر/سقف معتبر نیستند و باید بازطراحی شوند.",
    },
    limitations: "دهانه واقعی، اثر دال یک‌طرفه/دوطرفه و موقعیت دیوار برشی محاسبه نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["STRUCT-02-COLUMN"],
  }),
  "STRUCT-AXIAL-SCREEN": R({
    id: "STRUCT-AXIAL-SCREEN",
    label: "کنترل مقدماتی ستون بتن‌آرمه",
    expression: "Pu = A_trib·n·(1.25·DL + 1.5·LL) ؛ b ≈ √(Pu·1000 / (0.35·f'c))",
    resultUnit: "kN / mm",
    inputs: [
      { symbol: "A_trib", name: "سطح بارگیر هر ستون", unit: "m²" },
      { symbol: "n", name: "تعداد طبقات", unit: "طبقه" },
      { symbol: "DL, LL", name: "بار مرده/زنده واحد سطح", unit: "kPa" },
      { symbol: "f'c", name: "مقاومت مشخصه بتن", unit: "MPa" },
    ],
    classification: "screening-estimate",
    assumptions: ["DL=۶.۵ kPa و LL=۲.۰ kPa فرض داخلی", "f'c=۲۵ MPa فرض داخلی", "ستون فقط محوری کنترل می‌شود"],
    validity: {
      domain: "ساختمان تا ۲۰ طبقه، f'c ۲۰–۴۰ MPa، ستون با لاغری کم",
      limits: [
        { parameter: "floors", min: 1, max: 20, unit: "طبقه" },
        { parameter: "f'c", min: 20, max: 40, unit: "MPa" },
        { parameter: "tributary area", min: 4, max: 81, unit: "m²" },
      ],
      failureMode: "برای ستون لاغر یا تحت لنگر، فرمول محوری غیرمحافظه‌کارانه است.",
    },
    limitations: "ترکیب بار کامل، لنگر، لاغری، الزامات لرزه‌ای و آرماتور کنترل نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["STRUCT-02-COLUMN"],
  }),
  "STRUCT-BEAM-DEPTH": R({
    id: "STRUCT-BEAM-DEPTH",
    label: "عمق تیر (قاعده سرانگشتی)",
    expression: "h = max(350, round_up(L_max·1000/12, 50))",
    resultUnit: "mm",
    inputs: [{ symbol: "L_max", name: "بزرگ‌ترین دهانه", unit: "m" }],
    classification: "screening-estimate",
    assumptions: ["نسبت L/h ≈ ۱۲ برای تیر پیوسته"],
    validity: {
      domain: "دهانه ۴ تا ۱۰ متر",
      limits: [{ parameter: "L_max", min: 4, max: 10, unit: "m" }],
      failureMode: "برای دهانه بزرگ‌تر، L/12 بدون کنترل خیز و آرماتور کافی نیست.",
    },
    limitations: "بار واقعی، خیز، لرزش و عرض تیر محاسبه نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["STRUCT-02-COLUMN"],
  }),
  "STRUCT-SLAB-DEPTH": R({
    id: "STRUCT-SLAB-DEPTH",
    label: "ضخامت دال (قاعده سرانگشتی)",
    expression: "t = max(150, round_up(min(L)·1000/35, 10))",
    resultUnit: "mm",
    inputs: [{ symbol: "min(L)", name: "کوچک‌ترین دهانه", unit: "m" }],
    classification: "screening-estimate",
    assumptions: ["نسبت L/t ≈ ۳۵ برای دال دوطرفه با تکیه‌گاه‌های ساده"],
    validity: {
      domain: "دهانه ۳ تا ۸ متر",
      limits: [{ parameter: "min span", min: 3, max: 8, unit: "m" }],
      failureMode: "برای دال کنسول یا بار متمرکز سنگین معتبر نیست.",
    },
    limitations: "کنترل خیز، لرزش، آرماتور و بار زنده واقعی انجام نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["STRUCT-02-COLUMN"],
  }),
  "STRUCT-SEISMIC-CW": R({
    id: "STRUCT-SEISMIC-CW",
    label: "ضریب زلزله و برش پایه (ساده‌شده)",
    expression: "C = A·B·I/R ؛ V = C·W ؛ W = GFA·(DL + 0.2·LL)",
    resultUnit: "- / kN",
    inputs: [
      { symbol: "A", name: "پارامتر پهنه (جدول داخلی)", unit: "-" },
      { symbol: "B", name: "ضریب بازتاب (ثابت ۲.۵)", unit: "-" },
      { symbol: "I", name: "ضریب اهمیت", unit: "-" },
      { symbol: "R", name: "ضریب رفتار", unit: "-" },
    ],
    classification: "unverified-code-derived",
    assumptions: ["B ثابت و بدون وابستگی به زمان تناوب", "I=۱.۰ و R=۷.۵ فرض داخلی", "جدول A تقریبی و تطبیق‌نشده"],
    validity: {
      domain: "فقط برای مقایسه نسبی گزینه‌ها در مرحله غربالگری",
      limits: [
        { parameter: "floors", min: 1, max: 20, unit: "طبقه" },
        { parameter: "C", min: 0, max: 0.5, unit: "-" },
      ],
      failureMode: "خارج از بازه یا برای طراحی واقعی، این رابطه معتبر نیست و نباید مبنای تصمیم قرار گیرد.",
    },
    limitations: "طیف طرح، ساختگاه، نامنظمی، پیچش، دریفت و ترکیب بار لرزه‌ای لحاظ نمی‌شود.",
    verification: "unverified",
    usedByRules: ["STRUCT-02-SEISMIC"],
  }),
  "STRUCT-FOOTING-SCREEN": R({
    id: "STRUCT-FOOTING-SCREEN",
    label: "عرض پی منفرد (کنترل تنش مجاز)",
    expression: "b = √(1.1·P_service / q_allow)",
    resultUnit: "m",
    inputs: [
      { symbol: "P_service", name: "بار خدمت ستون (DL+LL)", unit: "kN" },
      { symbol: "q_allow", name: "تنش مجاز خاک (ورودی کاربر)", unit: "kPa" },
    ],
    classification: "screening-estimate",
    assumptions: ["وزن پی ۱۰٪ بار ستون", "تنش یکنواخت فرض می‌شود"],
    validity: {
      domain: "q_allow ۱۰۰ تا ۴۰۰ kPa، بار محوری بدون لنگر",
      limits: [
        { parameter: "q_allow", min: 100, max: 400, unit: "kPa" },
        { parameter: "b", min: 0.8, max: 4, unit: "m" },
      ],
      failureMode: "بدون داده ژئوتکنیک معتبر، نتیجه فقط نشانگر ابعاد مقدماتی است.",
    },
    limitations: "نشست، ظرفیت نهایی، آب زیرزمینی، اثر نزدیکی پی‌ها و لنگر لحاظ نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["STRUCT-02-FOUNDATION"],
  }),
  "MEP-WATER-DEMAND": R({
    id: "MEP-WATER-DEMAND",
    label: "مصرف و ذخیره آب",
    expression: "D = N·q_climate ؛ V_tank = ceil(1.2·D / 100)·100",
    resultUnit: "L/روز / L",
    inputs: [
      { symbol: "N", name: "جمعیت معادل", unit: "نفر" },
      { symbol: "q_climate", name: "سرانه اقلیمی", unit: "L/نفر/روز" },
    ],
    classification: "screening-estimate",
    assumptions: ["سرانه ۱۴۰–۱۶۰ L بسته به اقلیم", "ذخیره ۱.۲ روز"],
    validity: {
      domain: "جمعیت ۱۰ تا ۲۰۰۰ نفر",
      limits: [
        { parameter: "occupancy", min: 1, max: 2000, unit: "نفر" },
        { parameter: "q", min: 100, max: 200, unit: "L/نفر/روز" },
      ],
      failureMode: "برای کاربری غیرمسکونی یا نیاز آتش‌نشانی، برآورد ناکافی است.",
    },
    limitations: "دبی همزمان واقعی، فشار شبکه، افت فشار مسیر و ذخیره آتش‌نشانی محاسبه نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["MEP-16-WATER"],
  }),
  "MEP-PIPE-FLOW": R({
    id: "MEP-PIPE-FLOW",
    label: "قطر لوله از دبی و سرعت",
    expression: "d = √(4Q / (π·v)) با v = 1.5 m/s",
    resultUnit: "mm",
    inputs: [
      { symbol: "Q", name: "دبی اوج", unit: "m³/s" },
      { symbol: "v", name: "سرعت مجاز", unit: "m/s" },
    ],
    classification: "screening-estimate",
    assumptions: ["دبی اوج = ۲.۵ × میانگین ۸ ساعته"],
    validity: {
      domain: "قطر حاصل ۲۵ تا ۲۰۰ mm (لوله اصلی ساختمان)",
      limits: [
        { parameter: "v", min: 0.6, max: 3, unit: "m/s" },
        { parameter: "d", min: 25, max: 200, unit: "mm" },
      ],
      failureMode: "برای شبکه بزرگ یا نیاز آتش‌نشانی، روش واحد بار (fixture units) لازم است.",
    },
    limitations: "افت فشار، طول معادل، شیرها و ضربه قوچ محاسبه نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["MEP-16-WATER"],
  }),
  "MEP-ELECTRICAL-DEMAND": R({
    id: "MEP-ELECTRICAL-DEMAND",
    label: "توان، تقاضا و ترانسفورماتور",
    expression: "C = units·k + 15 ؛ D = 0.6·C ؛ T = nextStandard(1.25·D)",
    resultUnit: "kVA",
    inputs: [
      { symbol: "units", name: "تعداد واحد", unit: "واحد" },
      { symbol: "k", name: "توان انشعاب هر واحد", unit: "kVA" },
    ],
    classification: "screening-estimate",
    assumptions: ["k = ۴.۵–۷.۵ kVA بر پایه سطح مالی پروژه", "ضریب همزمانی ۶۰٪", "حداقل ترانس ۱۰۰ kVA"],
    validity: {
      domain: "ساختمان مسکونی تا ۶۰ واحد",
      limits: [{ parameter: "units", min: 1, max: 60, unit: "واحد" }],
      failureMode: "برای بارهای خاص (آسانسور سنگین، مرکز داده) برآورد ناکافی است.",
    },
    limitations: "بارهای واقعی، ضریب همزمانی هر مصرف‌کننده، افت ولتاژ، حفاظت و ژنراتور بررسی نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["MEP-13-ELECTRICAL"],
  }),
  "PARKING-BRUTE-AREA": R({
    id: "PARKING-BRUTE-AREA",
    label: "ظرفیت برآوردی پارکینگ",
    expression: "ground = ⌊0.55·(plot − footprint)/32⌋ ؛ basement = ⌊0.78·footprint/28⌋",
    resultUnit: "جایگاه",
    inputs: [
      { symbol: "plot, footprint", name: "سطح زمین/اشغال", unit: "m²" },
      { symbol: "A_stall", name: "مساحت مؤثر هر جایگاه", unit: "m²" },
    ],
    classification: "screening-estimate",
    assumptions: ["۲۸ m² مؤثر شامل سهم رمپ و ستون", "۵۵٪ سطح باز قابل استفاده برای توقف"],
    validity: {
      domain: "بلوک‌های ۲۰۰ تا ۲۰۰۰ m²",
      limits: [{ parameter: "footprint", min: 100, max: 3000, unit: "m²" }],
      failureMode: "چیدمان نامناسب یا رمپ طولانی می‌تواند ظرفیت واقعی را کمتر کند.",
    },
    limitations: "چیدمان، شیب رمپ، ارتفاع آزاد، تهویه و جایگاه معلولین طراحی نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["NBR-21-PARKING"],
  }),
  "CIRC-TRAVEL-LOWERBOUND": R({
    id: "CIRC-TRAVEL-LOWERBOUND",
    label: "فاصله حرکت تا خروج (حد پایین)",
    expression: "d = max_rooms ‖center(room) − center(core)‖ × 1.2",
    resultUnit: "m",
    inputs: [
      { symbol: "room polygon", name: "مرکز فضای قابل سکونت", unit: "m" },
      { symbol: "core rect", name: "مرکز مستطیل هسته", unit: "m" },
      { symbol: "k_path", name: "ضریب مسیر", unit: "-" },
    ],
    classification: "screening-estimate",
    assumptions: ["مسیر مستقیم بین دو مرکز", "ضریب مسیر ۱.۲ برای گوشه‌ها"],
    validity: {
      domain: "پلان با راهرو خطی و حداقل یک هسته در هر طبقه",
      limits: [
        { parameter: "cores per floor", min: 1, max: null, unit: "هسته" },
        { parameter: "distance", min: 0, max: 100, unit: "m" },
      ],
      failureMode: "بدون هسته، هیچ فاصله‌ای محاسبه نمی‌شود و قاعده insufficient می‌شود (نه pass).",
    },
    limitations: "مانع، پیچ راهرو، در خروجی و مسیر محافظت‌شده لحاظ نمی‌شود؛ مقدار گزارش‌شده می‌تواند خوش‌بینانه باشد.",
    verification: "internally-tested",
    usedByRules: ["FIRE-03-TRAVEL"],
  }),
  "DAYLIGHT-PROXY": R({
    id: "DAYLIGHT-PROXY",
    label: "شاخص جایگزین نور روز",
    expression: "ratio = 0.9·facade_length / floor_area",
    resultUnit: "-",
    inputs: [
      { symbol: "facade_length", name: "طول نمای اتاق روی پوسته", unit: "m" },
      { symbol: "area", name: "مساحت اتاق", unit: "m²" },
    ],
    classification: "screening-estimate",
    assumptions: ["ارتفاع شیشه مؤثر ۰.۹ m", "بدون سایه‌اندازی و انعکاس"],
    validity: {
      domain: "اتاق‌های ۸ تا ۴۰ m² با یک جبهه نور",
      limits: [{ parameter: "area", min: 4, max: 60, unit: "m²" }],
      failureMode: "برای اتاق‌های عمیق یا نورگیر سقفی معتبر نیست؛ جانشین DF/DA نیست.",
    },
    limitations: "جهت‌گیری، سایه همسایه، ضریب عبور نور و عمق اتاق لحاظ نمی‌شود.",
    verification: "internally-tested",
    usedByRules: ["NBR-15-DAYLIGHT"],
  }),
  "COST-RELATIVE-INDEX": R({
    id: "COST-RELATIVE-INDEX",
    label: "شاخص نسبی هزینه ساخت",
    expression: "index = GFA·(950 + 22·floors + 130·basements + 0.9·(b_column − 300))·factor / 1e6",
    resultUnit: "شاخص بدون واحد پول",
    inputs: [
      { symbol: "GFA", name: "زیربنای کل", unit: "m²" },
      { symbol: "floors", name: "طبقات", unit: "طبقه" },
      { symbol: "basements", name: "زیرزمین", unit: "طبقه" },
    ],
    classification: "arbitrary-index",
    assumptions: ["ضرایب بر پایه قضاوت مهندسی داخلی انتخاب شده‌اند"],
    validity: {
      domain: "فقط مقایسه نسبی گزینه‌ها در یک پروژه",
      limits: [{ parameter: "GFA", min: 100, max: 100000, unit: "m²" }],
      failureMode: "هیچ تفسیر پولی یا برآورد هزینه‌ای از آن مجاز نیست.",
    },
    limitations: "قیمت مصالح، تورم، منطقه و بازار در آن نیست؛ عدد صرفاً رتبه‌بندی نسبی است.",
    verification: "internally-tested",
    usedByRules: [],
  }),
};

export function formula(id: string): FormulaRecord | null {
  return FORMULAS[id] ?? null;
}

export const FORMULA_LIST = Object.values(FORMULAS);

export interface ValidityIssue {
  formulaId: string;
  parameter: string;
  value: number;
  min: number | null;
  max: number | null;
  unit: string;
  message: string;
}

/** Checks a value against the registry domain and returns a traceable warning. */
export function checkValidity(formulaId: string, parameter: string, value: number): ValidityIssue | null {
  const record = formula(formulaId);
  if (!record) return null;
  const limit = record.validity.limits.find((l) => l.parameter === parameter);
  if (!limit || !Number.isFinite(value)) return null;
  const below = limit.min !== null && value < limit.min;
  const above = limit.max !== null && value > limit.max;
  if (!below && !above) return null;
  return {
    formulaId,
    parameter,
    value,
    min: limit.min,
    max: limit.max,
    unit: limit.unit,
    message: `${record.label}: ${parameter} = ${value} ${limit.unit} خارج از دامنه اعتبار (${limit.min ?? "−∞"} … ${limit.max ?? "+∞"} ${limit.unit}) است؛ نتیجهٔ این روش غیرقابل استفاده است.`,
  };
}

/**
 * Official specification references that were actually retrieved and used.
 * These are *schema semantics*, not building-code thresholds, and they do not
 * claim that the generated file is schema-valid.
 */
export const EXTERNAL_SPEC_REFERENCES = [
  {
    id: "IFC4-IFCPRODUCTDEFINITIONSHAPE",
    body: "buildingSMART International",
    document: "IFC4 specification — IfcProductDefinitionShape",
    url: "https://standards.buildingsmart.org/IFC/RELEASE/IFC4_3/HTML/lexical/IfcProductDefinitionShape.htm",
    checkedAt: "2026-02",
    verified: true,
    usedFor: "Representations: LIST[1:?] OF IfcRepresentation — تأیید می‌کند که IfcSpace باید به IfcProductDefinitionShape ارجاع دهد، نه مستقیماً به IfcShapeRepresentation.",
  },
  {
    id: "IFC4-IFCPRODUCT",
    body: "buildingSMART International",
    document: "IFC4 specification — IfcProduct",
    url: "https://standards.buildingsmart.org/IFC/DEV/IFC4_2/FINAL/HTML/schema/ifckernel/lexical/ifcproduct.htm",
    checkedAt: "2026-02",
    verified: true,
    usedFor: "قاعده صوری PlacementForShapeRepresentation: اگر Representation از نوع IfcProductDefinitionShape باشد، ObjectPlacement الزامی است.",
  },
] as const;
