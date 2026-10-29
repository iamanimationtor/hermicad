import { Panel, StatusBadge } from "@/components/ui";
import { RULE_DOCS, SOURCE_AUDIT, rulesetFingerprint } from "@/domain/rules/docs";
import { FORMULA_LIST, EXTERNAL_SPEC_REFERENCES } from "@/domain/engineering/registry";
import { CODE_SET, ENGINE_VERSION, SEISMIC_PARAMS } from "@/domain/constants";
import { RULE_DOC_LIST } from "@/domain/rules/docs";
import { ANALYSIS_STATUS } from "@/domain/constants";

export const dynamic = "force-static";

const modules = [
  {
    name: "domain/types.ts — CEM",
    role: "قرارداد داده مرکزی",
    deps: "—",
    detail:
      "SiteModel، Requirements، CanonicalScheme، ValidationReport، Issue، MetricEntry، Assumption. تمام موتورها فقط با این تایپ‌ها کار می‌کنند.",
  },
  {
    name: "domain/geometry.ts",
    role: "هندسه محاسباتی قطعی",
    deps: "types",
    detail:
      "شولیس، محدب/مقعر، برش Sutherland–Hodgman، عقب‌نشینی نیم‌صفحه، بیشینه مستطیل محاطی (هیستوگرام O(n·m))، طول نما، PRNG mulberry32.",
  },
  {
    name: "domain/requirements.ts",
    role: "ساختاری‌سازی نیازمندی + اعتبارسنجی زمین",
    deps: "types",
    detail:
      "نرمال‌سازی ارقام فارسی، استخراج قاعده‌محور تعداد واحد/طبقه/تراکم/پارکینگ، ثبت تطبیق‌ها و اطمینان، اعتبارسنجی دامنه‌ای.",
  },
  {
    name: "domain/layout.ts",
    role: "طراحی مولد",
    deps: "geometry, requirements, analysis, constants",
    detail:
      "راهبردهای حجم، تخصیص برنامه واحد به بلوک، باند نما/دسترسی، بسته‌بندی قفسه‌ای فضاها، هسته و راهرو، بازتولید کامل مدل پس از اصلاح.",
  },
  {
    name: "domain/analysis.ts",
    role: "تحلیل مهندسی مقدماتی",
    deps: "geometry, units, constants",
    detail:
      "برش پایه (A·B·I/R)، ستون بر پایه Pu/(0.35f'c)، پی بر تنش مجاز، مخزن و لوله آب، بار الکتریکی و ترانس، سرمایش/گرمایش، پارکینگ، فاصله تا خروج، نور روز.",
  },
  {
    name: "domain/rules/docs.ts — rules package",
    role: "بسته مستند ضوابط + ممیزی منابع",
    deps: "types",
    detail:
      "برای هر قاعده: سند/نسخه/بند (همه null تا وقتی متن رسمی در دسترس نیست)، منشأ آستانه، سطح شواهد، ورودی‌های دارای واحد، فرمول، آزمون‌ها، محدودیت و اثر انگشت پایدار بسته.",
  },
  {
    name: "domain/rules/compat.ts",
    role: "سازگاری گزارش‌های قدیمی",
    deps: "types",
    detail:
      "گزارش‌های ذخیره‌شده پیش از مدل مستندات، هنگام خواندن نرمال‌سازی می‌شوند: داده عددی حفظ، متادیتای غایب «ثبت‌نشده/تأییدنشده» اعلام می‌شود و هیچ‌گاه pass فرض نمی‌شود.",
  },
  {
    name: "domain/codes.ts",
    role: "موتور ضوابط نسخه‌بندی‌شده",
    deps: "types, constants, requirements",
    detail: `هر قاعده: شناسه پایدار، شرح، ورودی دارای واحد، فرمول، آستانه و منشأ، سند/نسخه/بند، سطح شواهد، آزمون مثبت/منفی/مرزی، محدودیت و راهکار اصلاح. ${RULE_DOC_LIST.length} قاعده فعال؛ همه تأییدنشده.`,
  },
  {
    name: "domain/repair.ts",
    role: "اصلاح خودکار و بازاعتبارسنجی",
    deps: "codes, layout",
    detail:
      "کاهش طبقات، پارکینگ زیرزمینی، ادغام فضای کوچک، افزایش طبقات، اصلاح پی. اقدامات غیرقابل‌اجرا صریحاً «اعمال‌نشده» علامت می‌خورند.",
  },
  {
    name: "domain/optimize.ts",
    role: "بهینه‌سازی چندمعیاره",
    deps: "types",
    detail: "۱۰ معیار، نرمال‌سازی min-max، وزن‌های گروهی قابل‌تنظیم، جریمه طرح‌های Blocked، جبهه پارتو غیرمسلط.",
  },
  {
    name: "domain/exporters/*",
    role: "خروجی مهندسی",
    deps: "types, geometry",
    detail:
      "SVG و DXF دست‌ساز، PDF با فونت Base14 (برچسب لاتین)، XLSX با ZIP نویس داخلی، CSV با BOM، IFC4 فضایی. هیچ کتابخانه تجاری لازم نیست.",
  },
  {
    name: "server/projects.ts",
    role: "هماهنگ‌کننده و ماندگاری",
    deps: "domain, db",
    detail:
      "مخزن نسخه‌بندی‌شده زمین/نیازمندی، اجرای پایپ‌لاین، ذخیره طرح‌ها و گزارش‌ها، اقلام خروجی، رویدادهای حسابرسی. منطق مهندسی هیچ وابستگی‌ای به این لایه ندارد.",
  },
];

const AUDIT_FINDINGS: { id: string; finding: string; impact: string; fix: string; status: "fixed" | "open" }[] = [
  {
    id: "A1",
    finding: "سند ضوابط با وضعیت verified-thresholds و ارجاع به مبحث‌های رسمی معرفی شده بود.",
    impact: "ادعای انطباق قانونی بدون پشتوانه؛ خطر تصمیم غلط کاربر.",
    fix: "معرفی مدل Provenance: همه قواعد «تأییدنشده» اعلام شدند؛ سند به HMC-INT-RES (داخلی) تغییر کرد؛ یادداشت و سلب مسئولیت صریح.",
    status: "fixed",
  },
  {
    id: "A2",
    finding: "polygonIsSimple مساحت ≥ ۱ m² را شرط سادگی می‌گرفت و آستانه برش هم مطلق بود.",
    impact: "زمین‌های باریک/کوچک معتبر به‌اشتباه «هندسه نامعتبر» می‌شدند.",
    fix: "تفکیک سادگی از مساحت، پاک‌سازی رئوس تکراری، آستانه نسبی؛ آزمون مثلث ۰.۴۲ m² و نوار ۲×۳۴.",
    status: "fixed",
  },
  {
    id: "A3",
    finding: "شبکه سازه از مساحت با فرمول جذری تقریبی مشتق می‌شد.",
    impact: "دهانه‌های غیرواقعی (تا ~۱۰ m) و عمق تیر/سقف نادرست.",
    fix: "شبکه از ابعاد واقعی بلوک با هدف دهانه ۶ m؛ آزمون بازمحاسبه دهانه و عمق تیر L/12 و سقف L/35.",
    status: "fixed",
  },
  {
    id: "A4",
    finding: "وزن خود پی در محاسبه عرض پی لحاظ نمی‌شد.",
    impact: "کم‌برآورد عرض پی.",
    fix: "ضریب ۱.۱ برای وزن پی + آزمون عددی مستقل فرمول.",
    status: "fixed",
  },
  {
    id: "A5",
    finding: "IFCSPACE به‌جای IfcProductDefinitionShape به IfcShapeRepresentation ارجاع می‌داد.",
    impact: "فایل IFC از نظر اسکیمای IFC4 نامعتبر بود.",
    fix: "افزودن IFCPRODUCTDEFINITIONSHAPE برای هر فضا + آزمون یکتایی شناسه و حل ارجاع‌ها.",
    status: "fixed",
  },
  {
    id: "A6",
    finding: "برای زمین بسیار باریک، پلان بی‌معنا تولید می‌شد.",
    impact: "ادعای طرح مسکونی برای زمین غیرقابل ساخت.",
    fix: "پرچم viable و DomainError با دلیل صریح (عرض/عمق کمتر از حداقل) + آزمون زمین ۸×۴۰.",
    status: "fixed",
  },
  {
    id: "A7",
    finding: "تقریبی‌بودن عقب‌نشینی برای زمین مقعر در خروجی اعلام نمی‌شد.",
    impact: "کاربر نتیجه محافظه‌کارانه را «دقیق» می‌پنداشت.",
    fix: "geometryStatus، پرچم convexParcel، هشدار صریح و گزارش فاصله مؤثر هر ضلع.",
    status: "fixed",
  },
  {
    id: "A8",
    finding: "قواعد، ورودی/روش/محدودیت مستند نداشتند و تنها یک قاعده در آزمون‌ها قابل نقض بود.",
    impact: "قابل‌اعتماد نبودن اثبات عملکرد موتور ضوابط.",
    fix: "رجیستری مستندات برای ۲۱ قاعده + آزمون منفی قاعده‌به‌قاعده + آزمون مرزهای دقیق.",
    status: "fixed",
  },
  {
    id: "A9",
    finding: "هیچ آزمون ثابتی برای استقرار فضاها (اتاق⊆واحد⊆بلوک⊆ساخت‌پذیر) وجود نداشت.",
    impact: "احتمال قرار گرفتن فضا بیرون محدوده مجاز بدون شناسایی.",
    fix: "افزودن کنترل هندسی به قاعده DATA-01-INTEGRITY و آزمون یکپارچگی مستقل.",
    status: "fixed",
  },
  {
    id: "A10",
    finding: "خروجی‌ها فقط با HTTP 200 بررسی می‌شدند.",
    impact: "امکان تولید فایل خراب یا محتوای قالب اشتباه.",
    fix: "اعتبارسنج محتوایی هفت قالب + آزمون «قالب اشتباه» + خرابی مصنوعی (PDF/IFC/CSV).",
    status: "fixed",
  },
  {
    id: "A11",
    finding: "خروجی سازه/MEP/پارکینگ بدون تفکیک مرحله «مقدماتی» ارائه می‌شد.",
    impact: "احتمال استفاده از اعداد غربالگری به‌عنوان طراحی.",
    fix: "فیلد stage=preliminary-screening، پرچم notForConstruction، فهرست محدودیت‌ها در CEM و خروجی JSON.",
    status: "fixed",
  },
  {
    id: "A12",
    finding: "هیچ خط مبنای رگرسیون برای طرح‌های تولیدی وجود نداشت.",
    impact: "تغییر خاموش خروجی موتور در آینده.",
    fix: "اثر انگشت ۵ طرح به‌صورت ثابت در آزمون رگرسیون تثبیت شد.",
    status: "fixed",
  },
  {
    id: "A13",
    finding: "اصلاح خودکار می‌تواند به نورگیری/خروج منجر به اقدام غیرممکن شود.",
    impact: "انتظار نادرست از رفع خودکار همه ایرادها.",
    fix: "اقدامات غیرقابل‌اجرا با status=false و دلیل صریح ثبت می‌شوند؛ آزمون روی این رفتار.",
    status: "open",
  },
  {
    id: "A14",
    finding: "گزارش PDF فونت فارسی جاسازی‌شده ندارد و برچسب‌ها لاتین هستند.",
    impact: "محدودیت ارائه گزارش فارسی در PDF.",
    fix: "در مستندات و آزمون خروجی اعلام شده؛ رفع آن نیازمند جاسازی فونت است (نقشه راه).",
    status: "open",
  },
];

const REMAINING_LIMITATIONS: { title: string; body: string }[] = [
  ...ANALYSIS_STATUS.limitations.map((body, i) => ({ title: `تحلیل ${i + 1}`, body })),
  {
    title: "زمین مقعر و روش عقب‌نشینی",
    body: "محدوده ساخت‌پذیر از تقاطع نیم‌صفحه‌های اضلاع به‌دست می‌آید؛ برای زمین مقعر این مجموعه زیرمجموعه منطقه واقعی است (محافظه‌کارانه) و می‌تواند سطح مجاز را از دست بدهد. برای زمین محدب دقیق است.",
  },
  {
    title: "پلان شماتیک",
    body: "ضخامت دیوار، بازشو، پله و تأسیسات مدل هندسی ندارند؛ ۱۲٪ افت فرضی برای دیوار/شفت اعمال می‌شود.",
  },
  {
    title: "فاصله حرکت تا خروج",
    body: "فاصله مستقیم × ۱.۲ (حد پایین)؛ مسیر واقعی، مانع و در خروجی محاسبه نمی‌شود.",
  },
  {
    title: "PDF",
    body: "برچسب لاتین و بدون فونت فارسی؛ متن فارسی کامل در JSON/CSV/XLSX و رابط کاربری موجود است.",
  },
  {
    title: "IFC",
    body: "فقط زیرمجموعه فضایی (IfcSpace با احجام اکسترودشده)؛ دیوار، بازشو، سقف و MEP صادر نمی‌شود.",
  },
  {
    title: "XLSX",
    body: "بسته OOXML با ذخیره بدون فشرده‌سازی ساخته می‌شود؛ معتبر اما حجیم‌تر.",
  },
  {
    title: "منابع ضوابط",
    body: "آستانه‌ها داخلی و تأییدنشده‌اند؛ پیش از ادعای انطباق باید با سند معتبر حوزه پروژه و تأیید مهندس دارای صلاحیت جایگزین شوند.",
  },
];

const STAGE4_FIXES = [
  {
    title: "مرکز هسته در فاصله حرکت",
    body: "فاصله تا خروج با مرکز ثابت (+۲٫۶ m) محاسبه می‌شد که برای هسته‌های با ابعاد متفاوت خطا می‌داد؛ اکنون از مرکز واقعی مستطیل هسته استفاده می‌شود.",
    testRef: "accuracy: اصلاح باگ مرکز هسته",
  },
  {
    title: "دامنه اعتبار فرمول‌ها",
    body: "هر رابطه دارای دامنه عددی اعتبار است؛ خروج از بازه (مثلاً دهانه > ۱۰ m یا ۲۵ طبقه) به‌صورت یادداشت قابل‌ردیابی در همان تحلیل ثبت می‌شود.",
    testRef: "accuracy: دامنه اعتبار",
  },
  {
    title: "جلوی انطباق کاذب در رتبه‌بندی",
    body: "امتیاز اکنون با جریمه‌های شفاف (بحرانی ×۰٫۶، ارزیابی‌نشده ×۰٫۹، انحراف آستانه داخلی ×۰٫۹۵) و ادعای ثابت «not-established» همراه است.",
    testRef: "accuracy: امتیاز مشورتی",
  },
  {
    title: "شاخص هزینه بدون واحد پول",
    body: "واحد «میلیون واحد شاخص» به «شاخص» اصلاح شد و در رجیستری به‌عنوان arbitrary-index طبقه‌بندی شده است تا هیچ تفسیر پولی نداشته باشد.",
    testRef: "accuracy: رجیستری فرمول‌ها",
  },
  {
    title: "تفکیک IFC",
    body: "بررسی ساختاری (نحو، حل ارجاع، قاعده صوری IfcProduct) از اعتبارسنجی اسکیمای رسمی جدا شد؛ نبود ابزار صریحاً گزارش می‌شود.",
    testRef: "accuracy: تفکیک IFC",
  },
  {
    title: "ورودی منحط",
    body: "برای مساحت/واحد/طبقه صفر هیچ NaN یا مقدار منفی تولید نمی‌شود؛ همه خروجی‌ها متناهی و نامنفی هستند.",
    testRef: "accuracy: ورودی‌های منحط",
  },
];

const ROADMAP: { stage: string; outcome: string; reuse: string; work: string; acceptance: string; status: "done" | "partial" | "next" | "planned" }[] = [
  {
    stage: "A — ورودی هدایت‌شده + پلان واقعی",
    outcome: "کاربر غیرمتخصص ابعاد زمین و نیازها را انتخاب می‌کند، ۵ پلان با دیوار، در، پنجره، پله و اندازه‌گذاری می‌بیند و خروجی می‌گیرد.",
    reuse: "layout/generateSchemes، geometry، rules + plan layer جدید، exporters (SVG/DXF/PDF)",
    work: "ماژول architecture/plan، فرم چهارمرحله‌ای، تب «پلان بازبینی»، کنترل‌های لایه پلان",
    acceptance: "۹۴/۹۴ آزمون سبز؛ یکپارچگی پلان pass؛ SVG/DXF با لایه‌های WALL/DOOR/WINDOW/STAIR/DIM",
    status: "done",
  },
  {
    stage: "B — مدل واحد ساختمان (دیوار/بازشو/سقف به‌عنوان موجودیت پایدار)",
    outcome: "ویرایش دیوار/بازشو توسط کاربر و انتشار خودکار تغییر به مساحت، سازه و تأسیسات.",
    reuse: "Wall/Opening types، verifyPlanIntegrity، recomputeDerived",
    work: "مدل موجودیت قابل ویرایش + تاریخچه نسخه + اعتبارسنجی پیش از اعمال",
    acceptance: "هر ویرایش، مدل مرکزی و خروجی‌ها را همگام نگه دارد و هیچ کلاس آزمون موجودی نشکند",
    status: "partial",
  },
  {
    stage: "C — برگ نقشه مقیاس‌دار (اجراشده)",
    outcome: "برگ A3 با مقیاس واقعی (۱:۵۰…۱:۵۰۰)، لایه‌های قابل کنترل، اندازه‌گذاری، جدول بازشو، هشدارهای روی نقشه و کنترل بزرگ‌نمایی/جابه‌جایی.",
    reuse: "Wall/Opening/Dimension model، audit، exporters",
    work: "ماژول drawing/scene + رندررهای SVG/PDF/DXF از یک صحنه واحد + فضای کاری نقشه",
    acceptance: "مختصات SVG/DXF/PDF با مدل یکسان؛ DXF با dxf-parser واقعی خوانده شود؛ صفحه PDF با مقیاس صریح",
    status: "done",
  },
  {
    stage: "C2 — نما، برش، جداول و برگ‌بندی (اجراشده)",
    outcome: "برگ A1 شامل پلان + دو نما + سه جدول؛ برگ A2 شامل چهار نما + برش A-A؛ خروجی SVG/PDF/DXF از یک مدل.",
    reuse: "drawing scene + elevation/section modules + schedule tables",
    work: "elevation.ts (۴ نما)، section با دال/پله از مدل، جدول در/پنجره و فضا و طبقات، composer برگ، رندرر SVG/PDF برگ، DXF نما",
    acceptance: "ترازها = index×floorHeight، ضخامت سقف = مدل، جدول هم‌خوان با مدل، مقیاس مستقل هر قاب",
    status: "done",
  },
  {
    stage: "D — هماهنگی رشته‌ها",
    outcome: "تشخیص تداخل دیوار/تأسیسات/سازه و فهرست تداخل‌ها با شدت.",
    reuse: "analysis (سازه/MEP)، plan layer، rules engine",
    work: "مدل شفت/مسیر تأسیسات، تشخیص برخورد، قواعد هماهنگی",
    acceptance: "تداخل‌های مصنوعی شناسایی و در گزارش اعتبارسنجی ثبت شوند",
    status: "planned",
  },
  {
    stage: "E — چند طرح + توضیح دلیل انتخاب",
    outcome: "مقایسه گزینه‌ها با توضیح متنی «چرا این طرح» بر پایه معیارهای واقعی.",
    reuse: "optimize (criteria/pareto)، trace",
    work: "تولید توضیح قابل‌ردیابی از اختلاف معیارها (بدون ادعای طراحی تأییدشده)",
    acceptance: "هر امتیاز به معیار و عدد قابل ردیابی متصل باشد و ادعای انطباق نکند",
    status: "partial",
  },
  {
    stage: "F — خروجی ۳بعدی/IFC کامل",
    outcome: "مدل سه‌بعدی و IFC با دیوار/بازشو/سقف.",
    reuse: "IFC writer (spaces)، plan layer",
    work: "IfcWall/IfcOpeningElement/IfcSlab، بررسی اسکیمای رسمی",
    acceptance: "اعتبارسنجی اسکیمای IFC4 در محیط اجرا تأیید شود (نه فقط بررسی ساختاری)",
    status: "planned",
  },
  {
    stage: "G — ویرایش تعاملی و بازگشت تغییرات",
    outcome: "کشیدن دیوار/تغییر اندازه و undo/redo در رابط کاربری.",
    reuse: "CEM + recomputeDerived + API نسخه‌بندی",
    work: "لایه تعاملی SVG، فرمان‌ها، تاریخچه، دسترسی‌پذیری",
    acceptance: "ویرایش‌ها بدون شکستن اعتبارسنجی/خروجی‌ها و با undo کامل",
    status: "planned",
  },
];

const DRAWING_OUTPUTS: { format: string; status: "complete" | "limited"; content: string; limitation: string }[] = [
  {
    format: "SVG",
    status: "complete",
    content: "برگ A3 با viewBox میلی‌متری و مقیاس ۱:۵۰…۱:۵۰۰، ۱۶ گروه لایه (parcel/setback/wall/opening/stair/label/dimension/issue)، نام و مساحت فارسی فضاها، اندازه‌گذاری، شمال و نوار مقیاس.",
    limitation: "فونت فارسی به‌صورت وب‌فونت رندر می‌شود؛ در صورت نبود فونت، مرورگر جانشین می‌گذارد.",
  },
  {
    format: "PDF",
    status: "limited",
    content: "۶ صفحه؛ صفحه چهارم برگ نقشه با ابعاد واقعی A3 (۱۱۹۰٫۵۵×۸۴۱٫۸۹ pt)، مقیاس و واحد درج‌شده، دیوار/بازشو/پله/اندازه‌گذاری برداری.",
    limitation: "برچسب‌ها لاتین‌اند (Base-14 بدون جاسازی فونت فارسی)؛ نام فارسی در SVG/UI است.",
  },
  {
    format: "DXF",
    status: "complete",
    content: "AC1015، INSUNITS=۶ (متر)، ۱۵ لایه نوع‌دار، LWPOLYLINE/LINE/ARC/TEXT؛ مختصات فضای مدل = مختصات مدل مرکزی.",
    limitation: "بلوک‌های عنوان (title block) به‌صورت متن در فضای مدل درج می‌شوند، نه Layout/Viewport.",
  },
  {
    format: "برگ A1/A2 (SVG/PDF)",
    status: "complete",
    content: "ترکیب چند نقشه و جدول روی یک برگ با شماره شیت، کادر عنوان، مقیاس مستقل هر قاب و فهرست کمبود اطلاعات.",
    limitation: "نما/برش فقط تا تراز آخرین طبقه؛ بام، پاراپت، محوطه و شالوده در مدل نیستند و ترسیم نمی‌شوند.",
  },
  {
    format: "نما/برش DXF",
    status: "complete",
    content: "پنج نقشه (۴ نما + برش A-A) در یک DXF با آفست مستقل، فضای مدل متر، لایه‌های نوع‌دار.",
    limitation: "مختصات u/v نسبی است (u = بعد افقی، v = ارتفاع از ±۰٫۰۰)؛ تراز زمین طبیعی نگاشت نشده.",
  },
  {
    format: "JSON / CSV / XLSX",
    status: "complete",
    content: "مدل کامل + گزارش اعتبارسنجی + مبنای فرمول؛ برای پردازش بیرونی.",
    limitation: "جایگزین نقشه نیست؛ داده خام است.",
  },
];

export default function ArchitecturePage() {
  return (
    <main className="mx-auto max-w-[1400px] px-5 py-10">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="chip">{ENGINE_VERSION}</span>
          <span className="chip">{CODE_SET.code}@{CODE_SET.edition}</span>
          <span className="chip">Canonical Model v1</span>
          <span className="chip">Deterministic · seed-based</span>
        </div>
        <h1 className="mt-3 text-2xl font-extrabold text-white">معماری HERMICAD</h1>
        <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-300">
          معماری ابتدا نوشته شد و سپس کد از آن تبعیت کرد: مدل داده مرکزی، مرز ماژول‌ها، جهت وابستگی یک‌طرفه و قرارداد
          صریح برای ضوابط، تحلیل و خروجی. منطق مهندسی در لایه <span className="mono text-teal-200">domain</span> است و
          هیچ ارجاعی به React، Next یا Drizzle ندارد؛ بنابراین قابل تست واحد و قابل جایگزینی است.
        </p>
        <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[11px] leading-6 text-amber-100">
          <span className="font-bold">وضعیت اعتبار منابع: {CODE_SET.status}</span> — این مجموعه ضوابط رسمی نیست.
          شناسه قواعد شماره بند قانونی نیست و همه آستانه‌ها «داخلی و تأییدنشده» اعلام می‌شوند. دسترسی به سند رسمی:
          {CODE_SET.officialSourceAvailable ? " موجود" : " در سیستم ثبت نشده"}.
        </div>
      </header>

      <Panel
        className="mb-6"
        title="ممیزی فنی مرحله ۲ — یافته‌ها و اصلاحات"
        subtitle="هر مورد با شاهد کدی و آزمون مرتبط؛ موارد باقی‌مانده در همین صفحه به‌صورت محدودیت اعلام شده‌اند."
      >
        <div className="overflow-x-auto scroll-thin">
          <table className="table-eng">
            <thead>
              <tr>
                <th>#</th>
                <th>یافته</th>
                <th>اثر واقعی</th>
                <th>اصلاح</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {AUDIT_FINDINGS.map((f) => (
                <tr key={f.id}>
                  <td className="mono text-[10px] text-teal-200">{f.id}</td>
                  <td className="text-slate-100">{f.finding}</td>
                  <td className="text-[11px] leading-5 text-slate-300">{f.impact}</td>
                  <td className="text-[11px] leading-5 text-slate-300">{f.fix}</td>
                  <td><span className={`chip ${f.status === "fixed" ? "border-teal-400/40 bg-teal-400/10 text-teal-200" : "border-amber-400/40 bg-amber-400/10 text-amber-200"}`}>{f.status === "fixed" ? "اصلاح شد" : "محدودیت اعلام‌شده"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        className="mb-6"
        title="نقشه راه اجرایی — از موتور تولید طرح به سیستم طراحی ساختمان"
        subtitle="وضعیت بر پایه کد واقعی همین مخزن؛ هر مرحله با خروجی قابل مشاهده و معیار پذیرش."
      >
        <div className="overflow-x-auto scroll-thin">
          <table className="table-eng">
            <thead>
              <tr><th>مرحله</th><th>خروجی قابل مشاهده برای کاربر</th><th>قابل استفاده مجدد از کد فعلی</th><th>کار لازم</th><th>معیار پذیرش</th><th>وضعیت</th></tr>
            </thead>
            <tbody>
              {ROADMAP.map((row) => (
                <tr key={row.stage}>
                  <td className="text-slate-100">{row.stage}</td>
                  <td className="text-[11px] leading-5 text-slate-300">{row.outcome}</td>
                  <td className="text-[11px] leading-5 text-slate-400">{row.reuse}</td>
                  <td className="text-[11px] leading-5 text-slate-300">{row.work}</td>
                  <td className="text-[10px] leading-5 text-teal-200">{row.acceptance}</td>
                  <td>
                    <span className={`chip ${row.status === "done" ? "border-teal-400/40 bg-teal-400/10 text-teal-200" : row.status === "partial" ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : row.status === "next" ? "border-sky-400/40 bg-sky-400/10 text-sky-200" : "border-slate-500/30 bg-slate-500/10 text-slate-300"}`}>
                      {row.status === "done" ? "انجام‌شده" : row.status === "partial" ? "ناقص/محدود" : row.status === "next" ? "مرحله بعد" : "برنامه‌ریزی"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-lg border border-teal-400/30 bg-teal-400/10 p-2 text-[10px] leading-5 text-teal-100">
          <span className="font-bold">مرحله A (اجراشده در این تغییر):</span> مسیر کامل «ورودی هدایت‌شده → تولید پلان با دیوار/در/پنجره/پله/اندازه → کنترل لایه پلان → اعتبارسنجی و اصلاح → خروجی» با ۱۴ آزمون جدید (plan + intake) و بدون تغییر شناسه قواعد یا اثر انگشت بسته ضوابط.
          از آن مرحله تا امروز، این موارد هم اضافه شده‌اند: نمای و برش (SVG/PDF/DXF)، جدول‌ها و فهرست مقادیر، برگهٔ جزئیات سازه با جدول میلگرد و BBS، دیتیل‌های معماری، IFC نوع‌دار، و ویرایشگر گرافیکی Studio با بلوک‌های DXF. محدودیت‌های باقی‌مانده در بخش «وضعیت و محدودیت‌ها» فهرست شده است.
        </div>
      </Panel>

      <Panel
        className="mb-6"
        title="ممیزی منابع ضوابط (واقعیت بررسی‌شده)"
        subtitle="آنچه واقعاً بررسی شد و آنچه به‌عمد ثبت نشد؛ هیچ مقدار قانونی از منابع ثالث استخراج نشده است."
      >
        <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="panel-soft p-3">
            <p className="text-[11px] leading-6 text-slate-200">{SOURCE_AUDIT.method}</p>
            <p className="mt-2 text-[11px] leading-6 text-amber-200">{SOURCE_AUDIT.consequence}</p>
            <p className="mt-2 text-[10px] leading-5 text-slate-400">تاریخ ممیزی: {SOURCE_AUDIT.auditedAt} · متن رسمی به‌دست آمده: {SOURCE_AUDIT.officialTextObtained ? "بله" : "خیر"}</p>
          </div>
          <div className="space-y-2">
            {SOURCE_AUDIT.consultedSources.map((source) => (
              <div key={source.label} className="panel-soft p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-[11px] text-slate-200">{source.label}</span>
                  <span className="chip">{source.reachable ? "دسترس‌پذیر" : "دسترس‌ناپذیر"}</span>
                </div>
                <div className="mt-1 text-[10px] leading-5 text-slate-400">{source.note}</div>
                <div className="mt-1 text-[10px] text-rose-200">استفاده برای مقدار قانونی: خیر</div>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel
        className="mb-6"
        title="خروجی نقشه ۲بعدی — چه چیزی واقعاً تولید می‌شود"
        subtitle="همه قالب‌ها از یک صحنه واحد (drawing/scene) رندر می‌شوند؛ هندسه نمایشی جداگانه وجود ندارد."
      >
        <div className="overflow-x-auto scroll-thin">
          <table className="table-eng">
            <thead><tr><th>قالب</th><th>وضعیت</th><th>محتوا و واحد</th><th>محدودیت صریح</th></tr></thead>
            <tbody>
              {DRAWING_OUTPUTS.map((row) => (
                <tr key={row.format}>
                  <td className="mono text-[11px] text-teal-200">{row.format}</td>
                  <td><span className={`chip ${row.status === "complete" ? "border-teal-400/40 bg-teal-400/10 text-teal-200" : "border-amber-400/40 bg-amber-400/10 text-amber-200"}`}>{row.status === "complete" ? "تکمیل‌شده" : "محدود"}</span></td>
                  <td className="text-[11px] leading-5 text-slate-300">{row.content}</td>
                  <td className="text-[11px] leading-5 text-amber-200/90">{row.limitation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        className="mb-6"
        title="مرحله ۴ — کنترل صحت مهندسی و ضد انطباق کاذب"
        subtitle="بازبینی مستقل فرمول‌ها، دامنه اعتبار هر رابطه، تفکیک بررسی ساختاری از اعتبارسنجی رسمی، و جلوگیری از تفسیر امتیاز به‌عنوان انطباق."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="panel-soft p-3">
            <h3 className="text-[11px] font-bold text-teal-200">یافته‌های اصلاح‌شده در این مرحله</h3>
            <ul className="mt-1 space-y-1 text-[10px] leading-5 text-slate-300">
              {STAGE4_FIXES.map((fix) => (
                <li key={fix.title}>
                  <span className="font-semibold text-slate-100">{fix.title}:</span> {fix.body}
                  <span className="mono mr-1 text-[9px] text-slate-500">[{fix.testRef}]</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="panel-soft p-3">
            <h3 className="text-[11px] font-bold text-amber-200">ممیزی منابع (دور دوم، مرحله ۴)</h3>
            <ul className="mt-1 space-y-1 text-[10px] leading-5 text-slate-300">
              <li>• ناشر رسمی (bhrc.ac.ir/nbri) <span className="text-teal-200">دسترس‌پذیر</span> است و فهرست ویرایش مباحث را منتشر می‌کند، اما متن کامل/بندها به‌صورت رسمی در دسترس سیستم قرار نگرفت.</li>
              <li>• هیچ مقدار آستانه از منابع ثالث استخراج نشد؛ <span className="mono">document.clause</span> برای همه قواعد <span className="mono">null</span> است.</li>
              <li>• تنها ارجاع بیرونی تأییدشده، <span className="mono">IFC4 specification</span> از buildingSMART است که فقط برای معناشناسی اسکیمای IFC استفاده شد، نه برای ضوابط ساختمانی.</li>
              <li>• جمع‌بندی: تمام ۲۱ قاعده <span className="text-amber-200">تأییدنشده</span> باقی می‌مانند؛ اثر انگشت بسته <span className="mono">{rulesetFingerprint()}</span> بدون تغییر حفظ شد.</li>
            </ul>
            <div className="mt-2 space-y-1 text-[10px] leading-5 text-slate-400">
              {EXTERNAL_SPEC_REFERENCES.map((ref) => (
                <div key={ref.id} className="rounded border border-teal-400/20 bg-teal-400/5 p-1.5">
                  <span className="mono text-[9px] text-teal-200">{ref.id}</span>
                  <div className="text-[9px]">{ref.document} ({ref.checkedAt}) · {ref.verified ? "بررسی و استفاده‌شده" : "تأییدنشده"}</div>
                  <div className="text-[9px] text-slate-500">{ref.usedFor}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 overflow-x-auto scroll-thin">
          <table className="table-eng">
            <thead>
              <tr><th>فرمول</th><th>رابطه</th><th>واحد</th><th>طبقه‌بندی اعتبار</th><th>دامنه اعتبار</th><th>حالت شکست</th></tr>
            </thead>
            <tbody>
              {FORMULA_LIST.map((f) => (
                <tr key={f.id}>
                  <td>
                    <div className="mono text-[10px] text-teal-200">{f.id}</div>
                    <div className="text-[10px] text-slate-200">{f.label}</div>
                  </td>
                  <td className="mono text-[10px] leading-5 text-sky-200">{f.expression}</td>
                  <td className="mono text-[10px] text-slate-300">{f.resultUnit}</td>
                  <td>
                    <span className={`chip ${f.classification === "closed-form-geometry" ? "border-teal-400/40 bg-teal-400/10 text-teal-200" : f.classification === "arbitrary-index" ? "border-rose-400/40 bg-rose-500/10 text-rose-200" : f.classification === "unverified-code-derived" ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-sky-400/30 bg-sky-400/10 text-sky-200"}`}>
                      {f.classification}
                    </span>
                    <div className="mt-1 text-[9px] text-slate-500">{f.verification}</div>
                  </td>
                  <td className="text-[10px] leading-5 text-slate-300">
                    {f.validity.domain}
                    <div className="mono mt-0.5 text-[9px] text-slate-500">{f.validity.limits.map((l) => `${l.parameter}: ${l.min ?? "−∞"}…${l.max ?? "+∞"} ${l.unit}`).join(" · ")}</div>
                  </td>
                  <td className="text-[10px] leading-5 text-amber-200/90">{f.validity.failureMode}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <Panel title="مرز ماژول‌ها و جهت وابستگی" subtitle="UI/API → application → domain → (geometry, constants). هیچ وابستگی معکوسی وجود ندارد.">
            <div className="overflow-x-auto scroll-thin">
              <table className="table-eng">
                <thead>
                  <tr>
                    <th>ماژول</th>
                    <th>نقش</th>
                    <th>وابستگی</th>
                    <th>جزئیات</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.name}>
                      <td className="mono whitespace-nowrap text-[11px] text-teal-200">{m.name}</td>
                      <td className="font-semibold text-slate-100">{m.role}</td>
                      <td className="mono text-[10px] text-slate-400">{m.deps}</td>
                      <td className="text-[11px] leading-5 text-slate-300">{m.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="قرارداد موتور ضوابط" subtitle="قاعده = داده + تابع خالص. هیچ قاعده‌ای به UI، شبکه یا مدل آماری وابسته نیست.">
            <pre className="scroll-thin overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] leading-6 text-slate-300">
{`interface RuleDefinition {
  id: string;            // CODE-04-FAR
  title: string;
  category: string;      // massing | fire | parking | structure | mep | daylight
  source: string;        // مبحث ۴ / طرح تفصیلی
  edition: string;       // 1403.1
  severity: 'critical' | 'major' | 'minor' | 'info';
  remediation: string;   // راهکار اصلاح قابل اجرا
  evaluate(scheme: CanonicalScheme): {
    status: 'pass' | 'fail' | 'warn' | 'na';
    observed; required; unit;
    message; trace: string[]; location?;
  }
}`}
            </pre>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px]">
              <span className="chip">اثر انگشت بسته: <span className="mono">{rulesetFingerprint()}</span></span>
              <span className="chip">ممیزی منابع: {SOURCE_AUDIT.auditedAt}</span>
              <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-200">متن رسمی به‌دست نیامده</span>
              <span className="chip">بند قانونی ثبت‌شده: ۰</span>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="table-eng">
                <thead>
                  <tr>
                    <th>شناسه / شرح</th>
                    <th>ورودی‌ها (واحد)</th>
                    <th>فرمول و روش</th>
                    <th>آستانه و منشأ</th>
                    <th>سند / نسخه / بند</th>
                    <th>وضعیت منبع و تأیید</th>
                    <th>آزمون‌ها</th>
                  </tr>
                </thead>
                <tbody>
                  {RULE_DOC_LIST.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <div className="mono text-[10px] text-teal-200">{doc.id}</div>
                        <div className="mt-0.5 text-[10px] text-slate-200">{doc.titleFa}</div>
                        <div className="mt-1"><StatusBadge status={doc.thresholdBasis === "project-input" ? "info" : "minor"} /></div>
                      </td>
                      <td className="text-[10px] leading-5 text-slate-300">
                        {doc.inputsDetailed.map((i) => (
                          <div key={i.name}>
                            <span className="mono">{i.name}</span> <span className="text-slate-500">[{i.unit}]</span>
                          </div>
                        ))}
                      </td>
                      <td className="text-[10px] leading-5 text-slate-300">
                        <div>{doc.method}</div>
                        <div className="mono mt-1 text-[10px] text-sky-200">{doc.formula}</div>
                      </td>
                      <td className="text-[10px] leading-5 text-slate-300">
                        {doc.threshold}
                        <div className="mono mt-0.5 text-[10px] text-slate-500">{doc.thresholdBasis}</div>
                      </td>
                      <td className="text-[10px] leading-5 text-slate-300">
                        <div> عنوان: {doc.document.title ?? "—"}</div>
                        <div> نسخه: {doc.document.version ?? "—"}</div>
                        <div> بند: {doc.document.clause ?? "—"}</div>
                        <div className="mono mt-0.5 text-[9px] text-slate-500">{doc.document.availability}</div>
                      </td>
                      <td className="text-[10px] leading-5 text-slate-300">
                        <div className="mono text-[10px] text-amber-200">{doc.sourceStatus}</div>
                        <div className="mono text-[10px] text-slate-400">{doc.evidence}</div>
                        <div className="mt-1 chip border-amber-400/40 bg-amber-400/10 text-amber-200">{doc.verification}</div>
                        <div className="mt-1 text-[9px] text-slate-500">تأیید متن رسمی: خیر</div>
                        <div className="mt-1 text-[9px] leading-4 text-slate-400">محدودیت: {doc.limitations}</div>
                      </td>
                      <td className="text-[10px] leading-4 text-slate-400">
                        <div className="text-teal-200">مثبت: {doc.tests.positive}</div>
                        <div className="mt-1 text-rose-200">منفی: {doc.tests.negative}</div>
                        <div className="mt-1 text-amber-200">مرزی: {doc.tests.boundary}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel title="محدودیت‌های اعلام‌شده و علت آن‌ها" subtitle="این‌ها باگ نیستند؛ تصمیم‌های دامنه‌ای مستندشده‌اند.">
            <ul className="space-y-2 text-[11px] leading-6 text-slate-300">
              {REMAINING_LIMITATIONS.map((limitation) => (
                <li key={limitation.title}>
                  <span className="font-semibold text-amber-200">{limitation.title}:</span> {limitation.body}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="نقشه راه اجرایی" subtitle="ترتیب اجرا: زیرساخت → موتورها → مسکن → سازه → MEP → BIM">
            <div id="roadmap" className="space-y-2">
              {[
                ["فاز ۰ — معماری و زیرساخت", "مدل مرکزی، مرز ماژول، Drizzle/Postgres، API، دروازه کیفیت", "done"],
                ["فاز ۱ — موتورهای پایه", "هندسه، واحدها، موتور ضوابط، PRNG قطعی، اعتبارسنجی زمین/نیازمندی", "done"],
                ["فاز ۲ — محصول اول (مسکن)", "تولید چندطرح، تحلیل معماری/سازه/MEP/پارکینگ/گردش، مقایسه، اصلاح، خروجی‌ها", "done"],
                ["فاز ۳ — سازه پیشرفته", "قاب خمشی/برشی با تحلیل ماتریسی، طرح لرزه‌ای، دیتیل اعضا، نقشه سازه", "next"],
                ["فاز ۴ — MEP و انرژی", "سایزینگ شبکه، افت فشار، محاسبه بار حرارتی ساعتی، کنترل‌های انرژی", "next"],
                ["فاز ۵ — BIM کامل", "دیوار/بازشو/سقف به IFC، هم‌ارز IFC، کارگاه ویرایشگر گرافیکی", "planned"],
                ["فاز ۶ — ملاحظات سازمانی", "احراز هویت، نقش‌ها، امضای نسخه، تیمی و سطوح دسترسی", "planned"],
              ].map(([title, body, status]) => (
                <div key={title} className="panel-soft flex flex-col gap-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-100">{title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{body}</div>
                  </div>
                  <span className={`chip ${status === "done" ? "border-teal-400/40 bg-teal-400/10 text-teal-200" : status === "next" ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-slate-500/30 bg-slate-500/10 text-slate-300"}`}>
                    {status === "done" ? "انجام‌شده" : status === "next" ? "در نوبت" : "برنامه‌ریزی‌شده"}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="امنیت و ماندگاری" subtitle="مدل تهدید پایه برای نسخه فعلی">
            <ul className="space-y-2 text-[11px] leading-6 text-slate-300">
              <li>اعتبارسنجی سمت سرور برای زمین و نیازمندی پیش از هر نوشتن در دیتابیس.</li>
              <li>هیچ کلید/سرویس خارجی استفاده نمی‌شود؛ سطح حمله بیرونی حداقل است.</li>
              <li>تمام ورودی‌های خروجی از یک مدل معتبر بازسازی می‌شوند (allow-list قالب‌ها).</li>
              <li>هر تغییر مهم در جدول <span className="mono">audit_events</span> ثبت می‌شود.</li>
              <li>نسخه زمین/نیازمندی به‌صورت append-only نگهداری می‌شود تا امکان ردیابی باشد.</li>
              <li className="text-amber-200">
                احراز هویت واقعی وجود ندارد. برای استفادهٔ عمومی، هر بازدیدکننده یک «فضای کار» با کوکی
                HttpOnly می‌گیرد و اسنادش از بقیه جداست؛ اما همکاری چندنفره و اشتراک‌گذاری بین کاربران
                پیاده‌سازی نشده است.
              </li>
            </ul>
          </Panel>
          <Panel title="داده‌های ضابطه‌ای و لرزه‌ای" subtitle="جدول‌های قابل حسابرسی">
            <div className="space-y-1.5 text-[11px]">
              {Object.entries(SEISMIC_PARAMS).map(([zone, p]) => (
                <div key={zone} className="flex items-center justify-between border-b border-white/5 pb-1">
                  <span className="text-slate-300">پهنه {p.label}</span>
                  <span className="mono text-teal-200">A={p.A} B={p.B} R={p.R}</span>
                </div>
              ))}
              <p className="pt-1 text-[10px] leading-5 text-slate-400">
                C = A·B·I/R و V = C·W. مقادیر باید با استاندارد ۲۸۰۰ حوزه پروژه و تأیید مهندس سازه تطبیق داده شود.
              </p>
            </div>
          </Panel>
          <Panel title="آزمون و دروازه کیفیت" subtitle="Unit / Integration / Regression">
            <ul className="space-y-1.5 text-[11px] leading-5 text-slate-300">
              <li>• هندسه: مقادیر شولیس مستقل، عقب‌نشینی متقارن/نامتقارن با عدد دستی، زمین باریک ۸×۴۰، زمین مقعر (۲×۲)، رد شدن عقب‌نشینی بیش‌ازحد.</li>
              <li>• ضوابط: مستندات کامل ۲۱ قاعده، آزمون منفی قاعده‌به‌قاعده، توجیه عددی هر نقض، مرزهای دقیق (راهرو ۱.۴۹/۱.۵۰).</li>
              <li>• مهندسی: بازمحاسبه مستقل Pu، C، W، V، پی، مخزن/لوله، ترانس، پارکینگ، فاصله حرکت.</li>
              <li>• یکپارچگی: زنجیره اتاق⊆واحد⊆بلوک⊆ساخت‌پذیر، تایل‌بندی بدون همپوشانی، رد زمین/نیازمندی نامعتبر.</li>
              <li>• اصلاح: فهرست اقدامات مجاز، بازاعتبارسنجی، حفظ یکپارچگی.</li>
              <li>• خروجی: اعتبارسنج محتوایی PDF/DXF/SVG/IFC/XLSX/CSV/JSON + آزمون «قالب اشتباه» و خرابی مصنوعی.</li>
              <li>• Regression: اثر انگشت طرح‌ها، نسخه موتور/سند، بازه حجم فایل‌ها.</li>
            </ul>
            <a href="/api/quality" className="btn mt-3 w-full">
              اجرای زنده مجموعه آزمون‌ها
            </a>
          </Panel>
        </div>
      </div>
    </main>
  );
}
