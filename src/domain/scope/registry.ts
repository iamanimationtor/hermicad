import { FAMILIES, STRUCTURAL_FIELDS, type Family } from "../structures/catalog";
import { FRAME_FAMILIES, FRAME_LIMITS } from "../structures/frame/model";

/**
 * ک۰۱: فهرست مشاهده‌شده، نه دامنهٔ مصوب یا سازوکار صدور تأیید.
 * کد، آزمون نرم‌افزاری و مرجع رسمی سه نوع شاهد متفاوت‌اند. هیچ رکوردی در این
 * دفتر با اضافه‌شدن یک مسیر، نتیجهٔ «پشتیبانی مهندسی» یا «اجازهٔ اجرا» نمی‌گیرد.
 */
export const SCOPE_SCHEMA = "hermicad-scope-draft/1" as const;
export const SCOPE_BASELINE = "f7e735ad311493873f143b5d428db3189c80ca2c";
export const SCOPE_REVIEW_DATE = "2026-10-29";

export const STAGES = [
  ["information", "ثبت اطلاعات"],
  ["analysis", "تحلیل / محاسبه"],
  ["design", "طراحی تحویلی"],
  ["drawing", "ترسیم و مدارک"],
  ["validation", "اعتبارسنجی"],
  ["release", "صدور"],
] as const;
export type StageKey = (typeof STAGES)[number][0];
export type StageState = "limited" | "not-implemented" | "separate-row" | "software-evidence" | "not-assessed" | "review-only";
export const STAGE_STATE_LABELS: Record<StageState, string> = {
  limited: "محدود",
  "not-implemented": "ارائه نشده",
  "separate-row": "در ردیف دیگر",
  "software-evidence": "شاهد نرم‌افزاری محدود",
  "not-assessed": "احراز نشده",
  "review-only": "فقط بازبینی مقدماتی",
};
export interface StageAssessment {
  state: StageState;
  detail: string;
}
export type Stages = Record<StageKey, StageAssessment>;
export interface ScopeInput {
  key: string;
  label: string;
  unit: string | null;
  min: number | null;
  max: number | null;
}
export interface ScopeRow {
  id: string;
  kind: "intake" | "analysis" | "discipline";
  title: string;
  discipline: string;
  familyId: Family | null;
  family: string;
  system: string;
  method: string;
  use: string;
  jurisdiction: string;
  boundaries: string[];
  inputs: ScopeInput[];
  inputProvenance: string;
  exclusions: string[];
  availableOutputs: string[];
  requiredDeliverables: string[];
  acceptanceNeeds: string[];
  codeReferences: string[];
  softwareEvidence: string[];
  stages: Stages;
}

const stage = (state: StageState, detail: string): StageAssessment => ({ state, detail });
const noProfessionalValidation =
  "آزمون کد یا مقایسهٔ عددی، پذیرش حرفه‌ای مستقل برای یک دامنهٔ مصوب نیست؛ شاهد چنین پذیرشی در این دفتر ثبت نشده است.";
const jurisdiction = "تعیین نشده؛ منابع و شرایط کاربرد برای پروژه باید احراز شوند. این ردیف ادعای انطباق قانونی ندارد.";
const acceptanceNeeds = [
  "تعیین و تصویب سیستم، کاربری، محل، محدودیت‌ها، مسئول و بازبین مستقل برای همین ردیف.",
  "احراز منابع و شرایط کاربرد؛ تعیین روش و تلرانس پیش از مقایسه با مسائل و پروژه‌های مرجع مجاز.",
  "تولید و کنترل مدارک الزامی از مدل همان پروژه و ثبت شواهد سه دروازهٔ مرتبط.",
];

/** محدودیت‌ها از همان قرارداد فرم خوانده می‌شوند تا جدول با فرم بی‌صدا اختلاف پیدا نکند. */
function formInputs(keys: readonly string[]): ScopeInput[] {
  return keys.map((key) => {
    const field = STRUCTURAL_FIELDS.find((candidate) => candidate.key === key);
    if (!field) throw new Error(`Unknown scope input: ${key}`);
    return { key, label: field.label, unit: field.unit ?? null, min: field.min ?? null, max: field.max ?? null };
  });
}

const intakeRows: ScopeRow[] = FAMILIES.map((family) => ({
  id: `intake-${family.id}`,
  kind: "intake",
  title: `ثبت مشخصات: ${family.name}`,
  discipline: "سازه",
  familyId: family.id,
  family: family.name,
  system: "سیستم و زیرخانواده باید از مدارک پروژه تعیین شوند؛ نام خانواده کافی نیست.",
  method: "ثبت اطلاعات و مدارک اظهاری؛ روش‌های محاسبه، در صورت وجود، ردیف جدا دارند.",
  use: "کاربری واقعی باید در پرونده مشخص شود؛ برای هیچ کاربری تأیید طراحی فرض نمی‌شود.",
  jurisdiction,
  boundaries: ["بازه‌های فرم، حد پذیرش نرم‌افزارند نه حدود قانونی یا حدود اعتبار طراحی.", family.scope],
  inputs: formInputs(["function", "location", "designLife", "geotechnical", "criteria", "gravity", "seismic", "combinations"]),
  inputProvenance: "اطلاعات و مرجع توسط کاربر ثبت می‌شوند؛ ثبت عنوان یا تاریخ مرجع، اصالت آن را تأیید نمی‌کند.",
  exclusions: [
    "انتخاب خانواده یا تکمیل فرم، طراحی عضو، اتصال، پی و کنترل بهره‌برداری آن خانواده نیست.",
    ...(family.id === "timber"
      ? ["شناسهٔ timber در نسخه‌های قدیمی با عنوان «چوبی و سبک» به کار رفته است؛ پرونده‌های قدیمی خودکار بازطبقه‌بندی نمی‌شوند."]
      : []),
  ],
  availableOutputs: ["پروندهٔ اطلاعات و گزارش تخصصی برای بازبینی مقدماتی؛ نه مدرک مصوب."],
  requiredDeliverables: [...family.deliverables],
  acceptanceNeeds,
  codeReferences: ["src/domain/structures/catalog.ts", "src/domain/structures/assessment.ts", "src/server/structuralReport.ts"],
  softwareEvidence: ["src/domain/testing/structures.test.ts", "scripts/qa-structures-http.ts"],
  stages: {
    information: stage("limited", "فیلدها و منابع اظهاری ثبت می‌شوند؛ راستی‌آزمایی و منشأ کامل داده پیاده نشده است."),
    analysis: stage("separate-row", "این ردیف فقط ثبت اطلاعات است؛ وجود یا نبود هر مدل محاسبه را جداگانه ببینید."),
    design: stage("not-implemented", "طراحی کامل اعضا، اتصال‌ها و پی این خانواده ارائه نشده است."),
    drawing: family.building
      ? stage("limited", "ترسیم عمومی استودیو در دسترس است؛ به معنی نقشهٔ طراحی‌شدهٔ این خانواده نیست.")
      : stage("not-implemented", "برگهٔ طراحی اختصاصی این خانواده در این مسیر ارائه نشده است."),
    validation: stage("software-evidence", noProfessionalValidation),
    release: stage("review-only", "گزارش فقط با هدف بازبینی مقدماتی صادر می‌شود؛ تحویل اجرایی تأیید نشده است."),
  },
}));

interface MethodDefinition {
  id: string;
  title: string;
  familyIds: readonly Family[];
  system: string;
  method: string;
  boundaries: string[];
  inputs: ScopeInput[];
  inputProvenance: string;
  exclusions: string[];
  availableOutputs: string[];
  codeReferences: string[];
  softwareEvidence: string[];
  drawing: StageAssessment;
}
const methods: MethodDefinition[] = [
  {
    id: "simple-beam",
    title: "تیر ساده با بار گستردهٔ یکنواخت",
    familyIds: ["concrete", "steel"],
    system: "یک تیر منشوری دوسر ساده؛ این مدل، سیستم باربر کل ساختمان نیست.",
    method: "خمش خطی تیر Euler–Bernoulli با بار یکنواخت؛ سختی مؤثر و حد خیز از کاربر.",
    boundaries: ["نسبت طول به ارتفاع کمتر از ۱۰ یا خیز بیش از یک درصد طول، خارج از دامنهٔ این تقریب نرم‌افزاری است."],
    inputs: formInputs(["beamModel", "beamL", "beamDepth", "beamE", "beamI", "beamQ", "beamLimit", "criteria"]),
    inputProvenance: "مدل، بار و سختی از کاربر؛ شرح معیار برای مقایسه لازم است. اعتبار این داده‌ها را سامانه احراز نمی‌کند.",
    exclusions: ["طراحی مقاومت، ترک، خزش، کمانش، ارتعاش، اتصال و تحلیل کل قاب انجام نمی‌شود."],
    availableOutputs: ["واکنش، لنگر و خیز محدود؛ مقایسه با حد اعلامی فقط در صورت ثبت شرح معیار."],
    codeReferences: ["src/domain/structures/catalog.ts", "src/domain/structures/assessment.ts", "src/domain/structures/formulas.ts"],
    softwareEvidence: ["src/domain/testing/structures.test.ts"],
    drawing: stage("not-implemented", "این محاسبه، نقشهٔ عضو طراحی‌شده تولید نمی‌کند."),
  },
  {
    id: "gravity-wall",
    title: "دیوار ثقلی با فشار رانکین",
    familyIds: ["retaining"],
    system: "دیوار ثقلی با خاک خشک هموارِ بدون چسبندگی، آب و زلزله.",
    method: "فشار رانکین و بررسی اولیهٔ لغزش، واژگونی و فشار تمام‌تماس بر پایهٔ نیروهای اظهاری.",
    boundaries: ["بازوی نیروی قائم باید در عرض پی باشد؛ خارج از هستهٔ میانی، فشار تمام‌تماس گزارش نمی‌شود."],
    inputs: formInputs(["wallModel", "wallH", "gamma", "phi", "surcharge", "baseB", "weight", "lever", "mu", "bearing", "slideCriterion", "overturnCriterion", "criteria"]),
    inputProvenance: "نیرو، بازو، خاک و معیارها توسط کاربر وارد می‌شوند؛ گزارش ژئوتکنیک خودکار احراز نمی‌شود.",
    exclusions: ["فشار آب و زلزله، پایداری کلی، نشست، طراحی سازهٔ دیوار و پی، گود و زهکشی پوشش داده نمی‌شوند."],
    availableOutputs: ["ضریب فشار، نیرو، لنگر، ضریب‌های اولیه و فشار زیر پی در محدودهٔ مدل."],
    codeReferences: ["src/domain/structures/catalog.ts", "src/domain/structures/assessment.ts", "src/domain/structures/formulas.ts"],
    softwareEvidence: ["src/domain/testing/structures.test.ts"],
    drawing: stage("not-implemented", "مقطع، زهکشی و جزئیات طراحی‌شدهٔ دیوار تولید نمی‌شود."),
  },
  {
    id: "hydrostatic-wall",
    title: "فشار هیدرواستاتیک دیوار قائم",
    familyIds: ["tank"],
    system: "مایع ساکن و همگن با سطح آزاد تحت فشار جو؛ دیوار قائم به ازای هر متر عرض.",
    method: "محاسبهٔ فشار، نیروی برآیند و لنگر بار نسبت به پای دیوار.",
    boundaries: ["محدودهٔ عددی عمق و چگالی از فرم دریافت می‌شود؛ این حدود مجوز طراحی مخزن نیستند."],
    inputs: formInputs(["hydroModel", "liquidH", "density"]),
    inputProvenance: "مدل، عمق و چگالی از کاربر دریافت می‌شوند و توسط سامانه احراز نمی‌شوند.",
    exclusions: ["پاسخ لرزه‌ای و هیدرودینامیک، تلاطم، آب‌بندی و طراحی دیواره، کف و اتصال‌ها محاسبه نمی‌شود."],
    availableOutputs: ["فشار، نیروی برآیند و لنگر بار؛ لنگر بار، لنگر طراحی عضو نیست."],
    codeReferences: ["src/domain/structures/catalog.ts", "src/domain/structures/assessment.ts", "src/domain/structures/formulas.ts"],
    softwareEvidence: ["src/domain/testing/structures.test.ts"],
    drawing: stage("not-implemented", "نقشهٔ طراحی‌شدهٔ مخزن تولید نمی‌شود."),
  },
  {
    id: "plane-frame",
    title: "قاب صفحه‌ای استاتیکی خطی",
    familyIds: FRAME_FAMILIES,
    system: "اعضای مستقیم منشوری دوبعدی با اتصال صلب و تکیه‌گاه‌های مدل‌شده؛ مدل از CAD استخراج نمی‌شود.",
    method: "تحلیل خطی مرتبهٔ اول Euler–Bernoulli، بار گره‌ای و بار گستردهٔ یکنواخت محلی؛ ترکیب‌های اظهاری.",
    boundaries: [
      `سقف فنی: ${FRAME_LIMITS.nodes} گره، ${FRAME_LIMITS.members} عضو، ${FRAME_LIMITS.cases} حالت و ${FRAME_LIMITS.combinations} ترکیب بار.`,
      "نسبت طول به ارتفاع هر عضو دست‌کم ۱۰ است؛ مکانیزم، بدشرطی و تغییرشکل خارج دامنه مانع نتیجهٔ قابل استفاده‌اند.",
    ],
    inputs: [
      { key: "nodes", label: "گره، مختصات و تکیه‌گاه", unit: "متر", min: null, max: null },
      { key: "members", label: "عضو و سختی مؤثر E، A، I و ارتفاع", unit: "GPa، cm²، cm⁴، متر", min: null, max: null },
      { key: "cases", label: "حالت بار گره‌ای و گسترده به همراه منبع", unit: "kN، kN·m، kN/m", min: null, max: null },
      { key: "combinations", label: "ترکیب و ضرایب اظهاری، در صورت نیاز", unit: "بدون بعد", min: null, max: null },
      { key: "basis", label: "مبنای مدل و بررسی صریح فرض‌ها", unit: null, min: null, max: null },
    ],
    inputProvenance: "همهٔ هندسه، سختی، بارها و ترکیب‌ها جداگانه توسط کاربر وارد می‌شوند؛ هیچ منبع مقرراتی انتخاب یا تأیید نمی‌شود.",
    exclusions: ["مدل سه‌بعدی، رهاسازی، فنر، وزن خودکار، دینامیک، P-Delta، کمانش و طراحی مقاومت/اتصالات وجود ندارد."],
    availableOutputs: ["واکنش‌ها، تغییرشکل، نیروهای هر حالت، نمودار و پوش نیرو برای بازبینی مقدماتی."],
    codeReferences: ["src/domain/structures/frame/model.ts", "src/domain/structures/frame/solver.ts", "src/domain/structures/frame/exports.ts"],
    softwareEvidence: ["src/domain/testing/frame.test.ts", "scripts/qa-frame-fixtures.ts", "scripts/qa-frame-independent.py"],
    drawing: stage("limited", "نمودار تحلیل قابل دریافت است؛ نقشهٔ طراحی‌شدهٔ سازه نیست."),
  },
];

const analysisRows: ScopeRow[] = methods.flatMap((method) =>
  method.familyIds.map((familyId): ScopeRow => {
    const family = FAMILIES.find((item) => item.id === familyId);
    if (!family) throw new Error(`Unknown scope family: ${familyId}`);
    return {
      id: `${method.id}-${familyId}`,
      kind: "analysis",
      title: `${method.title} — ${family.name}`,
      discipline: "سازه",
      familyId,
      family: family.name,
      system: method.system,
      method: method.method,
      use: "کاربری و سیستم واقعی پروژه باید مستقلاً تعیین شوند؛ انتخاب خانواده اعتبار روش را اثبات نمی‌کند.",
      jurisdiction,
      boundaries: method.boundaries,
      inputs: method.inputs,
      inputProvenance: method.inputProvenance,
      exclusions: method.exclusions,
      availableOutputs: method.availableOutputs,
      requiredDeliverables: [...family.deliverables],
      acceptanceNeeds,
      codeReferences: method.codeReferences,
      softwareEvidence: method.softwareEvidence,
      stages: {
        information: stage("limited", "فقط ورودی‌های مدل محدود به‌صورت دستی دریافت می‌شوند."),
        analysis: stage("limited", "حل فقط در فرض‌ها و حدود ذکرشده انجام می‌شود؛ نه تحلیل کامل پروژه."),
        design: stage("not-implemented", "نتیجهٔ عددی به طراحی معتبر عضو، اتصال یا پی تبدیل نمی‌شود."),
        drawing: method.drawing,
        validation: stage("software-evidence", noProfessionalValidation),
        release: stage("review-only", "خروجی و گزارش، بازبینی مقدماتی‌اند و تأیید اجرایی یا مقرراتی نیستند."),
      },
    };
  }),
);

interface DisciplineDefinition {
  id: string;
  title: string;
  input: string;
  analysis: StageAssessment;
  drawing: StageAssessment;
  outputs: string[];
  exclusions: string[];
  codeReferences: string[];
  softwareEvidence: string[];
}
const disciplines: DisciplineDefinition[] = [
  {
    id: "architecture",
    title: "معماری و کاربری‌ها",
    input: "فرم کاربری و برخی نیازها؛ الگوهای شروع، برنامهٔ کامل کاربری نیستند.",
    analysis: stage("limited", "چیدمان مولد مسکونی و کنترل‌های هندسی و آستانه‌های داخلی وجود دارند؛ ضوابط رسمی احراز نشده‌اند."),
    drawing: stage("limited", "پلان، نما و برش مقدماتی از مدل ترسیمی؛ نه مدارک اجرایی هماهنگ."),
    outputs: ["طرح و برگه‌های مقدماتی برای بازبینی"],
    exclusions: ["طراحی معتبر همهٔ کاربری‌ها، خروج و حریق، دسترس‌پذیری و کنترل جامع محلی وجود ندارد."],
    codeReferences: ["src/domain/journey/model.ts", "src/domain/architecture/layoutEngine.ts", "src/domain/studio/render.ts"],
    softwareEvidence: ["src/domain/testing/journey.test.ts", "src/domain/testing/layoutEngine.test.ts"],
  },
  {
    id: "geotechnics",
    title: "ژئوتکنیک و پی",
    input: "امکان ثبت شرح گزارش خاک و مقدار اظهاری؛ نه مدل لایه‌ها و آزمایش‌ها.",
    analysis: stage("limited", "برآورد سرانگشتی پی و مدل محدود دیوار ثقلی وجود دارند؛ ردیف دیوار را جدا ببینید."),
    drawing: stage("not-implemented", "نقشهٔ پی و گود مبتنی بر طراحی ژئوتکنیکی ارائه نشده است."),
    outputs: ["اطلاعات اظهاری و نتایج محدود اولیه"],
    exclusions: ["نشست، لایه‌بندی، آب زیرزمینی، پایداری کلی و اندرکنش خاک–سازه طراحی نمی‌شوند."],
    codeReferences: ["src/domain/analysis.ts", "src/domain/structures/assessment.ts"],
    softwareEvidence: ["src/domain/testing/structures.test.ts", "src/domain/testing/engineering.test.ts"],
  },
  {
    id: "mechanical",
    title: "مکانیک",
    input: "ثبت نیاز رشته و جانمایی اشیای مکانیکی به‌صورت مقدماتی.",
    analysis: stage("limited", "برآورد گرمایش/سرمایش بر پایهٔ مساحت و اقلیم؛ نه محاسبهٔ تفصیلی بار و شبکه."),
    drawing: stage("limited", "جانمایی و خطوط ترسیمی؛ اتصال و ظرفیت شبکه تأیید نمی‌شود."),
    outputs: ["جانمایی مقدماتی و برآورد سرانگشتی"],
    exclusions: ["هوای تازه، افت فشار مسیر، بالانس، انتخاب مهندسی تجهیزات و طراحی کانال/لوله ارائه نشده است."],
    codeReferences: ["src/domain/analysis.ts", "src/domain/studio/catalog.ts", "src/domain/journey/review.ts"],
    softwareEvidence: ["src/domain/testing/engineering.test.ts", "src/domain/testing/journey.test.ts"],
  },
  {
    id: "plumbing",
    title: "آب و فاضلاب",
    input: "ثبت نیاز رشته و جانمایی تجهیزات و خطوط مقدماتی.",
    analysis: stage("limited", "برآورد سرانگشتی آب و قطر اسمی؛ نه تحلیل شبکهٔ متصل و افت فشار."),
    drawing: stage("limited", "جانمایی ترسیمی و خروجی مقدماتی؛ شبکهٔ طراحی‌شده نیست."),
    outputs: ["جانمایی مقدماتی و برآورد سرانگشتی"],
    exclusions: ["طراحی مسیر بحرانی، فشار، شیب، ونت، پمپ و هماهنگی شبکه ارائه نشده است."],
    codeReferences: ["src/domain/analysis.ts", "src/domain/studio/catalog.ts", "src/domain/journey/review.ts"],
    softwareEvidence: ["src/domain/testing/engineering.test.ts", "src/domain/testing/journey.test.ts"],
  },
  {
    id: "electrical",
    title: "برق",
    input: "ثبت نیاز رشته و جانمایی تابلو و مصرف‌کننده به‌صورت مقدماتی.",
    analysis: stage("limited", "برآورد سرانگشتی بار و ترانس در مسیر مولد؛ نه طراحی مدار."),
    drawing: stage("limited", "جانمایی ترسیمی؛ اتصال و حفاظت شبکه احراز نمی‌شود."),
    outputs: ["جانمایی مقدماتی و برآورد سرانگشتی"],
    exclusions: ["طراحی مدار، افت ولتاژ، اتصال کوتاه، حفاظت، ارت و روشنایی ارائه نشده است."],
    codeReferences: ["src/domain/analysis.ts", "src/domain/studio/catalog.ts", "src/domain/journey/review.ts"],
    softwareEvidence: ["src/domain/testing/engineering.test.ts", "src/domain/testing/journey.test.ts"],
  },
  {
    id: "gas",
    title: "گاز",
    input: "شرح نیاز از کاربر و نماد لوله در کتابخانه؛ مسیر تخصصی مستقل وجود ندارد.",
    analysis: stage("limited", "فقط برآورد سرانگشتی تقاضا در مسیر مولد؛ طراحی شبکهٔ گاز نیست."),
    drawing: stage("limited", "نماد و خط ترسیمی؛ نه نقشهٔ شبکهٔ محاسبه‌شده."),
    outputs: ["نماد ترسیمی و برآورد اولیهٔ تقاضا"],
    exclusions: ["محاسبهٔ قطر، افت فشار، تهویه و ایمنی شبکهٔ گاز ارائه نشده است."],
    codeReferences: ["src/domain/analysis.ts", "src/domain/studio/catalog.ts"],
    softwareEvidence: ["src/domain/testing/engineering.test.ts", "src/domain/testing/studio.test.ts"],
  },
  {
    id: "fire",
    title: "حریق",
    input: "ثبت نیاز و جانمایی اشیای حریق به‌صورت مقدماتی.",
    analysis: stage("not-implemented", "راهبرد حریق و محاسبهٔ شبکهٔ اعلام/اطفا و تخلیهٔ دود ارائه نشده است."),
    drawing: stage("limited", "جانمایی نمادها؛ نه طراحی یا تأیید سیستم حریق."),
    outputs: ["جانمایی مقدماتی نمادها"],
    exclusions: ["هماهنگی خروج، محاسبهٔ فشار و دبی، اعلام/اطفا و تخلیه دود انجام نمی‌شود."],
    codeReferences: ["src/domain/studio/catalog.ts", "src/domain/journey/model.ts", "src/domain/journey/review.ts"],
    softwareEvidence: ["src/domain/testing/journey.test.ts", "src/domain/testing/studio.test.ts"],
  },
  {
    id: "energy",
    title: "انرژی و عملکرد",
    input: "اقلیم و برخی مشخصات کلی قابل ثبت‌اند؛ ورودی کامل مدل انرژی وجود ندارد.",
    analysis: stage("not-implemented", "محاسبهٔ مصرف و کنترل جامع انرژی ساختمان ارائه نشده است."),
    drawing: stage("not-implemented", "مدارک عملکردی مبتنی بر مدل انرژی ارائه نشده‌اند."),
    outputs: ["داده‌های کلی پروژه؛ نه گزارش طراحی انرژی"],
    exclusions: ["مدل دقیق پوسته، مصرف سالانه، کنترل انرژی، آسایش و آکوستیک پوشش داده نمی‌شوند."],
    codeReferences: ["src/domain/analysis.ts", "src/domain/journey/model.ts"],
    softwareEvidence: ["src/domain/testing/engineering.test.ts"],
  },
];
const disciplineRows: ScopeRow[] = disciplines.map((item) => ({
  id: `discipline-${item.id}`,
  kind: "discipline",
  title: item.title,
  discipline: item.title,
  familyId: null,
  family: "خانواده و سیستم پروژه هنوز باید تفکیک و تصویب شوند.",
  system: "این ردیف جمع‌بندی نرم‌افزاری است، نه ردیف کامل هر سیستم و کاربری.",
  method: item.analysis.detail,
  use: "کاربری واقعی و نیازهای تخصصی باید برای هر پروژه تعیین شوند.",
  jurisdiction,
  boundaries: ["حدود کاربرد، معیار پذیرش و پروژهٔ مرجع برای یک دامنهٔ مصوب هنوز ثبت نشده‌اند."],
  inputs: [],
  inputProvenance: "داده‌ها و مراجع اظهاری کاربرند؛ ثبت نام مرجع، احراز رسمی آن نیست.",
  exclusions: item.exclusions,
  availableOutputs: item.outputs,
  requiredDeliverables: ["مدارک محاسباتی و نقشه‌های اختصاصی هماهنگ پروژه، مطابق دامنه‌ای که باید تصویب شود."],
  acceptanceNeeds,
  codeReferences: item.codeReferences,
  softwareEvidence: item.softwareEvidence,
  stages: {
    information: stage("limited", item.input),
    analysis: item.analysis,
    design: stage("not-implemented", "طراحی جامع و تأییدشدهٔ این رشته برای دامنهٔ پروژه ارائه نشده است."),
    drawing: item.drawing,
    validation: stage("software-evidence", noProfessionalValidation),
    release: stage("review-only", "فایل احتمالی صرفاً برای بازبینی مقدماتی است؛ مدرک مصوب رشته نیست."),
  },
}));

export const SCOPE_ROWS: readonly ScopeRow[] = [...intakeRows, ...analysisRows, ...disciplineRows];

export const READINESS_GATES = [
  {
    id: "software",
    title: "آمادگی نرم‌افزاری",
    state: "not-assessed",
    needs: ["دامنه و معیارهای قابل آزمون باید تصویب شوند.", "شواهد قرارداد داده، خطا، امنیت و آزمون برای همان دامنه باید بررسی شوند."],
    doesNotProve: "به‌تنهایی انطباق قانونی یا پذیرش مهندسی پروژه را ثابت نمی‌کند.",
  },
  {
    id: "engineering",
    title: "اعتبار مهندسی محصول",
    state: "not-assessed",
    needs: ["منابع و حوزهٔ کاربرد باید احراز شوند.", "تلرانس از پیش تعیین‌شده، پروژهٔ مرجع و بازبینی مستقل هر دامنه لازم است."],
    doesNotProve: "تأیید خودکار پروژه با دادهٔ ناقص یا مجوز اجرای ساختمان نیست.",
  },
  {
    id: "operations",
    title: "آمادگی بهره‌برداری عمومی",
    state: "not-assessed",
    needs: ["اهداف ظرفیت، دسترس‌پذیری و بازیابی باید تصویب شوند.", "شواهد امنیت، بار، پشتیبان و بازیابی واقعی در این دفتر ثبت نشده‌اند."],
    doesNotProve: "امضای حرفه‌ای یا قبول مسئولیت مهندس پروژه نیست.",
  },
] as const;

/** فقط بازتاب وضع فعلی است؛ این ثابت جایگزین کنترل‌های صدور در سرویس‌ها نیست. */
export function scopeRegister() {
  return {
    schema: SCOPE_SCHEMA,
    baseline: SCOPE_BASELINE,
    reviewedAt: SCOPE_REVIEW_DATE,
    status: "draft" as const,
    scopeApproved: false as const,
    releaseApproved: false as const,
    regulatoryCompliance: "not-established" as const,
    note: "دفتر مشاهده‌شده و ناقص است، نه دامنهٔ متعهدشده، پروندهٔ پذیرش یا سازوکار تأیید و صدور.",
    gates: READINESS_GATES,
    rows: SCOPE_ROWS,
  };
}
