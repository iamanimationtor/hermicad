/**
 * HERMICAD Studio — شکل‌دهی متن فارسی/عربی برای خروجی‌های غیرمرورگری
 *
 * چرا لازم است: مرورگر خودش حروف فارسی را به شکل درست (آغازین/میانی/پایانی) و
 * متن را از راست به چپ می‌چیند. اما PDF و DXF هیچ‌کدام این کار را انجام
 * نمی‌دهند؛ اگر «سلام» را همان‌طور که هست بفرستیم، «س ل ا م» جدا و برعکس
 * درمی‌آید. این ماژول همان دو مرحله را انجام می‌دهد:
 *
 *   ۱) شکل‌دهی (Shaping): انتخاب شکل درست هر حرف بر اساس اتصال به حرف‌های
 *      همسایه، و ترکیب «لا» (لام+الف) به لیگاتور.
 *   ۲) دوسویه‌نویسی (Bidi): چیدن نشانه‌ها به ترتیب دیداری، با حفظ ترتیب
 *      داخلی اعداد و کلمات لاتین.
 *
 * خروجی، دنبالهٔ کدهای «اشکال نمایشی» (Arabic Presentation Forms) است که
 * فونت‌های فارسی مثل وزیرمتن آن‌ها را دارند؛ بنابراین به موتور GSUB نیاز نیست.
 *
 * همه‌چیز خالص و قطعی است و با آزمون پوشش داده شده.
 */

/** نوع اتصال حرف: D=دوطرفه، R=فقط از راست، C=اتصال‌دهنده، T=شفاف، U=بدون اتصال */
type JoinType = "D" | "R" | "C" | "T" | "U";

/**
 * اشکال نمایشی هر حرف: [تنها، پایانی، آغازین، میانی]
 * برای حرف‌های راست‌چسب فقط دو شکل (تنها و پایانی) وجود دارد.
 */
const FORMS: Record<number, number[]> = {
  0x0621: [0xfe80], // ء
  0x0622: [0xfe81, 0xfe82], // آ
  0x0623: [0xfe83, 0xfe84], // أ
  0x0624: [0xfe85, 0xfe86], // ؤ
  0x0625: [0xfe87, 0xfe88], // إ
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], // ئ
  0x0627: [0xfe8d, 0xfe8e], // ا
  0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], // ب
  0x0629: [0xfe93, 0xfe94], // ة
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], // ت
  0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], // ث
  0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0], // ج
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], // ح
  0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], // خ
  0x062f: [0xfea9, 0xfeaa], // د
  0x0630: [0xfeab, 0xfeac], // ذ
  0x0631: [0xfead, 0xfeae], // ر
  0x0632: [0xfeaf, 0xfeb0], // ز
  0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], // س
  0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8], // ش
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], // ص
  0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], // ض
  0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4], // ط
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8], // ظ
  0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], // ع
  0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0], // غ
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], // ف
  0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8], // ق
  0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc], // ك عربی
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0], // ل
  0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], // م
  0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8], // ن
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], // ه
  0x0648: [0xfeed, 0xfeee], // و
  0x0649: [0xfeef, 0xfef0], // ى
  0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4], // ي عربی
  0x0671: [0xfb50, 0xfb51], // ٱ
  0x067e: [0xfb56, 0xfb57, 0xfb58, 0xfb59], // پ
  0x0686: [0xfb7a, 0xfb7b, 0xfb7c, 0xfb7d], // چ
  0x0698: [0xfb8a, 0xfb8b], // ژ
  0x06a9: [0xfb8e, 0xfb8f, 0xfb90, 0xfb91], // ک فارسی
  0x06af: [0xfb92, 0xfb93, 0xfb94, 0xfb95], // گ
  0x06c0: [0xfba4, 0xfba5], // ۀ
  0x06cc: [0xfbfc, 0xfbfd, 0xfbfe, 0xfbff], // ی فارسی
};

/** لیگاتور لام + الف: [تنها، پایانی] برای هر الف */
const LAM_ALEF: Record<number, [number, number]> = {
  0x0622: [0xfef5, 0xfef6], // لآ
  0x0623: [0xfef7, 0xfef8], // لأ
  0x0625: [0xfef9, 0xfefa], // لإ
  0x0627: [0xfefb, 0xfefc], // لا
};

/** حرف‌هایی که فقط از سمت راست می‌چسبند (به حرف بعدی نمی‌چسبند). */
const RIGHT_JOINING = new Set([0x0622, 0x0623, 0x0624, 0x0625, 0x0627, 0x0629, 0x062f, 0x0630, 0x0631, 0x0632, 0x0648, 0x0671, 0x0698, 0x06c0]);

/**
 * علامت‌های اعراب و اعراب‌گذاری: شفاف (اتصال را نمی‌شکنند و شکل نمی‌گیرند).
 * نیم‌فاصله (ZWNJ) عمداً شفاف نیست: وظیفهٔ آن شکستن اتصال است، پس باید مثل
 * یک جداکننده دیده شود، وگرنه «می‌رود» به شکل «میـرود» چسبیده درمی‌آید.
 */
const TRANSPARENT = (cp: number): boolean =>
  (cp >= 0x064b && cp <= 0x065f) || cp === 0x0670 || (cp >= 0x06d6 && cp <= 0x06ed);

function joinType(cp: number): JoinType {
  if (TRANSPARENT(cp)) return "T";
  if (cp === 0x200d || cp === 0x0640) return "C"; // ZWJ و کشیده
  if (FORMS[cp]) return RIGHT_JOINING.has(cp) ? "R" : "D";
  return "U";
}

/** آیا این کد، حرف فارسی/عربی است؟ */
export const isArabicLetter = (cp: number): boolean => cp >= 0x0600 && cp <= 0x06ff;

/** نگاشت شکل نمایشی به حرف پایه (برای ToUnicode و کپی متن از PDF). */
export const PRESENTATION_TO_BASE: Map<number, number> = (() => {
  const map = new Map<number, number>();
  for (const [base, forms] of Object.entries(FORMS)) {
    for (const form of forms) if (form) map.set(form, Number(base));
  }
  for (const [alef, [iso, fin]] of Object.entries(LAM_ALEF)) {
    // «لا» به لام + الف برمی‌گردد تا متن کپی‌شده خوانا باشد
    map.set(iso, 0x0644);
    map.set(fin, 0x0644);
    void alef;
  }
  return map;
})();

/**
 * شکل‌دهی متن در ترتیب منطقی (بدون تغییر ترتیب جمله).
 * ZWNJ (نیم‌فاصله) اتصال را می‌شکند و خودش هیچ گلیفی ندارد.
 */
export function shapeLogical(text: string): number[] {
  const cps = [...text].map((char) => char.codePointAt(0) ?? 0);
  const out: number[] = [];
  for (let index = 0; index < cps.length; index += 1) {
    const cp = cps[index];
    const type = joinType(cp);
    if (cp === 0x200c) continue; // نیم‌فاصله: فقط اتصال را می‌شکند
    if (type === "U" || type === "T" || type === "C") {
      out.push(cp);
      continue;
    }
    // همسایهٔ قبلی/بعدی با نادیده‌گرفتن علامت‌های شفاف
    let prevIndex = index - 1;
    while (prevIndex >= 0 && joinType(cps[prevIndex]) === "T") prevIndex -= 1;
    let nextIndex = index + 1;
    while (nextIndex < cps.length && joinType(cps[nextIndex]) === "T") nextIndex += 1;

    const prevType = prevIndex >= 0 ? joinType(cps[prevIndex]) : "U";
    const nextType = nextIndex < cps.length ? joinType(cps[nextIndex]) : "U";
    const joinsPrev = prevType === "D" || prevType === "C";
    const joinsNextLetter = nextType === "D" || nextType === "R" || nextType === "C";

    // لیگاتور لام-الف
    if (cp === 0x0644 && nextIndex < cps.length && LAM_ALEF[cps[nextIndex]] && type === "D") {
      const [isolated, final] = LAM_ALEF[cps[nextIndex]];
      out.push(joinsPrev ? final : isolated);
      index = nextIndex; // الف مصرف شد
      continue;
    }

    const forms = FORMS[cp];
    let form: number | undefined;
    if (type === "R") {
      form = joinsPrev ? forms[1] : forms[0];
    } else if (joinsPrev && joinsNextLetter) {
      form = forms[3] ?? forms[1];
    } else if (joinsPrev) {
      form = forms[1];
    } else if (joinsNextLetter) {
      form = forms[2] ?? forms[0];
    } else {
      form = forms[0];
    }
    out.push(form ?? cp);
  }
  return out;
}

/* ───────────────────────────── دوسویه‌نویسی (Bidi) ───────────────────────────── */

type BidiClass = "R" | "L" | "N";

const DIGIT = (cp: number): boolean =>
  (cp >= 0x30 && cp <= 0x39) ||
  (cp >= 0x06f0 && cp <= 0x06f9) ||
  (cp >= 0x0660 && cp <= 0x0669) ||
  // جداکنندهٔ اعشار فارسی «٫» و هزارگان «٬» بخشی از عدد هستند؛ اگر خنثی
  // شمرده شوند، «۰٫۸۰» در چیدمان دیداری به «۸۰٫۰» می‌شکند.
  cp === 0x066b ||
  cp === 0x066c;

function bidiClass(cp: number): BidiClass {
  // مهم: ارقام فارسی/عربی هم داخل بازهٔ ۰۶۰۰..۰۶FF هستند؛ باید پیش از
  // تشخیص حرف بررسی شوند، وگرنه «۱۲» به‌صورت راست‌به‌چپ معکوس می‌شود.
  if (DIGIT(cp)) return "L";
  if (isArabicLetter(cp) || (cp >= 0xfb50 && cp <= 0xfdff) || (cp >= 0xfe70 && cp <= 0xfeff)) return "R";
  if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a)) return "L";
  if (cp >= 0x00c0 && cp <= 0x024f) return "L"; // لاتین گسترده (é, ø, …)
  if (cp === 0x00b2 || cp === 0x00b3 || cp === 0x00b0 || cp === 0x00d7 || cp === 0x00f7) return "L";
  return "N";
}

/** جفت‌های آینه‌ای: در متن راست‌به‌چپ، پرانتز باید آینه شود. */
const MIRROR: Record<number, number> = {
  0x28: 0x29,
  0x29: 0x28,
  0x5b: 0x5d,
  0x5d: 0x5b,
  0x7b: 0x7d,
  0x7d: 0x7b,
  0x3c: 0x3e,
  0x3e: 0x3c,
};

/**
 * تبدیل ترتیب منطقی به ترتیب دیداری برای پاراگراف راست‌به‌چپ.
 * الگوریتم: تفکیک به «قوی راست»، «قوی چپ» و «خنثی»؛ خنثی جهت همسایه‌های
 * قوی را می‌گیرد (وگرنه جهت پایه). سپس دنباله معکوس می‌شود، اما بلوک‌های
 * چپ‌به‌راست داخلی سرِ جای خود می‌مانند.
 */
export function reorderVisual(cps: number[], baseDirection: "rtl" | "ltr" = "rtl"): number[] {
  if (baseDirection === "ltr") return cps;
  const classes = cps.map(bidiClass);

  // حل جهت خنثی‌ها
  let index = 0;
  while (index < classes.length) {
    if (classes[index] !== "N") {
      index += 1;
      continue;
    }
    let end = index;
    while (end < classes.length && classes[end] === "N") end += 1;
    const before = index > 0 ? classes[index - 1] : "R";
    const after = end < classes.length ? classes[end] : "R";
    const resolved: BidiClass = before === after ? before : "R";
    for (let i = index; i < end; i += 1) classes[i] = resolved;
    index = end;
  }

  // تفکیک به بلوک‌ها
  type Block = { dir: BidiClass; items: number[] };
  const blocks: Block[] = [];
  for (let i = 0; i < cps.length; i += 1) {
    const dir = classes[i];
    const last = blocks[blocks.length - 1];
    if (last && last.dir === dir) last.items.push(cps[i]);
    else blocks.push({ dir, items: [cps[i]] });
  }

  // پاراگراف راست‌به‌چپ: ترتیب بلوک‌ها معکوس؛ داخل بلوک راست، حروف معکوس
  const visual: number[] = [];
  for (const block of [...blocks].reverse()) {
    if (block.dir === "R") {
      for (let i = block.items.length - 1; i >= 0; i -= 1) {
        const cp = block.items[i];
        visual.push(MIRROR[cp] ?? cp);
      }
    } else {
      visual.push(...block.items);
    }
  }
  return visual;
}

/** متن آمادهٔ رسم: شکل‌دهی + چیدمان دیداری. */
export function shapeForDisplay(text: string, baseDirection: "rtl" | "ltr" = "rtl"): number[] {
  const clean = text.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
  return reorderVisual(shapeLogical(clean), baseDirection);
}

/** آیا متن حداقل یک حرف فارسی/عربی دارد؟ (برای انتخاب مسیر رسم) */
export const hasPersian = (text: string): boolean => /[\u0600-\u06ff\u0750-\u077f]/.test(text);
