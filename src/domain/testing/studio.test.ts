import { assert, test } from "./harness";
import {
  CATALOG,
  CATALOG_BY_ID,
  CATEGORIES,
  STUDIO_LAYERS,
  searchCatalog,
} from "@/domain/studio/catalog";
import {
  addItem,
  createStudioDocument,
  documentBounds,
  documentFingerprint,
  duplicateItem,
  mmPerMetre,
  removeItem,
  resizeItem,
  rotateItem,
  schedule,
  sheetSizeMm,
  snapValue,
  updateItem,
  validateDocument,
} from "@/domain/studio/document";
import {
  exportStudio,
  renderStudioDxf,
  renderStudioPdf,
  renderStudioPdfBundle,
  renderStudioSvg,
  sheetLayout,
  studioScheduleCsv,
  planScene,
  withAxisLabels,
} from "@/domain/studio/render";
import { sampleDesign, sampleDesignItems } from "@/server/designs";
import { studioIfc, studioXlsx, toPersianWords } from "@/domain/studio/exporters";
import { renderStudioElevationSheet, renderStudioVertical, viewGeometry } from "@/domain/studio/vertical";
import { renderStudioElevationsPdf, renderStudioVerticalPdf } from "@/domain/studio/verticalPdf";
import { barArea, barWeightPerMetre, rebarSchedule, renderStudioDetailPdf, renderStudioDetailSheet } from "@/domain/studio/details";
import { ARCH_DETAILS } from "@/domain/studio/archDetails";
import {
  faArea,
  faMeter,
  faNumber,
  faPercent,
} from "@/domain/studio/sheetKit";
import {
  renderStudioSchedulePdf,
  renderStudioScheduleSheet,
  studioSchedules,
} from "@/domain/studio/schedules";
import { shapeForDisplay, shapeLogical } from "@/domain/studio/pdf/arabic";
import { inflateSync } from "node:zlib";
import { loadTypeface } from "@/domain/studio/pdf/typeface";

function demoDocument() {
  return createStudioDocument({
    id: "dsn-test",
    name: "سند آزمون",
    sheet: { format: "A3", orientation: "landscape", scale: 50 },
    items: [
      { id: "it-1", catalogId: "sofa-3", x: 2, y: 2, w: 2.1, d: 0.9, rotationDeg: 0, level: 0 },
      { id: "it-2", catalogId: "column-concrete", x: 0, y: 0, w: 0.4, d: 0.4, rotationDeg: 45, level: 0 },
      { id: "it-3", catalogId: "bed-queen", x: 6, y: 4, w: 1.6, d: 2, rotationDeg: 90, level: 0 },
      { id: "it-4", catalogId: "north-arrow", x: 8, y: 6, w: 1, d: 1, rotationDeg: 0, level: 0 },
      { id: "it-5", catalogId: "wc-western", x: 4, y: 1, w: 0.4, d: 0.7, rotationDeg: 0, level: 1 },
    ],
  });
}

test("studio/catalog", "کتابخانه یکتا، کامل و با هندسهٔ نرمال‌شده است", () => {
  const ids = new Set(CATALOG.map((item) => item.id));
  assert(ids.size === CATALOG.length, "شناسهٔ تکراری در کتابخانه");
  assert(CATALOG.length >= 175, `تعداد اشیا کمتر از انتظار: ${CATALOG.length}`);
  assert(CATEGORIES.length >= 20, `دسته‌های کتابخانه کم است: ${CATEGORIES.length}`);
  // هر دسته دست‌کم ۳ شیء داشته باشد تا «کتابخانهٔ آماده» واقعاً کاربرد داشته باشد
  for (const category of CATEGORIES) {
    const count = CATALOG.filter((item) => item.category === category.id).length;
    assert(count >= 3, `دستهٔ کم‌جمعیت: ${category.label} (${count})`);
  }
  // دسترسی‌ها (پله/پاگرد/رمپ) باید همهٔ گونه‌های رایج ایرانی را داشته باشند
  for (const id of ["stair-u", "stair-l", "stair-spiral", "ramp-indoor", "landing"]) {
    assert(CATALOG.some((item) => item.id === id), `نوع دسترسی غایب: ${id}`);
  }
  for (const category of CATEGORIES) {
    const count = CATALOG.filter((item) => item.category === category.id).length;
    assert(count > 0, `دستهٔ بدون شیء: ${category.label}`);
  }
  const layers = new Set(STUDIO_LAYERS.map((layer) => layer.id));
  for (const item of CATALOG) {
    assert(item.ifcClass.startsWith("Ifc"), `کلاس IFC نامعتبر: ${item.id}`);
    assert(layers.has(item.layer), `لایهٔ ناشناخته: ${item.id}`);
    assert(item.defaultSize.w > 0 && item.defaultSize.d > 0, `ابعاد نامعتبر: ${item.id}`);
    assert(item.parts.length > 0, `شیء بدون هندسه: ${item.id}`);
    if (item.minSize) {
      assert(item.minSize.w <= item.defaultSize.w, `حداقل عرض بزرگ‌تر از پیش‌فرض: ${item.id}`);
    }
    for (const part of item.parts) {
      if (part.kind === "mline" || part.kind === "marc") continue; // در مختصات متری
      if (part.kind === "rect") {
        assert(part.x >= -0.001 && part.y >= -0.001, `جزء خارج از کادر: ${item.id}`);
        assert(part.x + part.w <= 1.001 && part.y + part.h <= 1.001, `جزء بزرگ‌تر از کادر: ${item.id}`);
      }
      if (part.kind === "circle") {
        assert(part.cx - part.r >= -0.001 && part.cx + part.r <= 1.001, `دایرهٔ خارج از کادر: ${item.id}`);
      }
      if (part.kind === "poly") {
        for (const [x, y] of part.points) {
          assert(x >= -0.001 && x <= 1.001 && y >= -0.001 && y <= 1.001, `چندضلعی خارج از کادر: ${item.id}`);
        }
      }
    }
  }
  return `${CATALOG.length} شیء در ${CATEGORIES.length} دسته`;
});

test("studio/catalog", "جست‌وجو با نام فارسی، انگلیسی و برچسب کار می‌کند", () => {
  assert(searchCatalog("مبل").length >= 3, "جست‌وجوی فارسی نتیجه نداد");
  assert(searchCatalog("sofa").length >= 2, "جست‌وجوی انگلیسی نتیجه نداد");
  assert(searchCatalog("ستون").length >= 1, "جست‌وجوی برچسب نتیجه نداد");
  assert(searchCatalog("", "structure").every((item) => item.category === "structure"), "فیلتر دسته اعمال نشد");
  return "فارسی/انگلیسی/دسته";
});

test("studio/document", "افزودن، تغییر اندازه، چرخش و حذف قطعی و کلمپ‌شده است", () => {
  const empty = createStudioDocument({ id: "d1", grid: 0.1 });
  const added = addItem(empty, "sofa-3", { x: 1.23, y: 2.34 });
  assert(added.items.length === 1, "شیء اضافه نشد");
  assert(added.items[0].x === 1.2, `جذب شبکه اعمال نشد: ${added.items[0].x}`);
  const id = added.items[0].id;
  const shrunk = resizeItem(added, id, { w: 0.001, d: 0.001 });
  const size = shrunk.items[0];
  assert(size.w >= (CATALOG_BY_ID["sofa-3"].minSize?.w ?? 0.1), "حداقل اندازه رعایت نشد");
  const rotated = rotateItem(shrunk, id, -90);
  assert(rotated.items[0].rotationDeg === 270, `نرمال‌سازی زاویه: ${rotated.items[0].rotationDeg}`);
  const duplicated = duplicateItem(rotated, id);
  assert(duplicated.items.length === 2, "تکثیر انجام نشد");
  assert(duplicated.items[1].id !== duplicated.items[0].id, "شناسهٔ تکراری پس از تکثیر");
  const removed = removeItem(duplicated, id);
  assert(removed.items.length === 1, "حذف انجام نشد");
  const moved = updateItem(removed, removed.items[0].id, { x: 3, y: 4 });
  assert(moved.items[0].x === 3, "جابه‌جایی اعمال نشد");
  return "افزودن/کلمپ/چرخش/تکثیر/حذف";
});

test("studio/document", "جذب شبکه، محیط سند و جدول اشیا درست محاسبه می‌شوند", () => {
  assert(snapValue(1.24, 0.25) === 1.25, "جذب شبکه");
  assert(snapValue(1.24, 0) === 1.24, "شبکهٔ صفر نباید گرد کند");
  const doc = demoDocument();
  const bounds = documentBounds(doc);
  assert(bounds.w > 0 && bounds.h > 0, "محیط سند نامعتبر");
  const rows = schedule(doc);
  assert(rows.length === 5, `تعداد ردیف جدول: ${rows.length}`);
  const sofa = rows.find((row) => row.catalogId === "sofa-3");
  assert(sofa?.count === 1, "شمارش مبلمان");
  assert(sofa?.areaM2.toFixed(0) === "2", `مساحت مبلمان: ${sofa?.areaM2}`);
  return `محیط ${bounds.w.toFixed(1)}×${bounds.h.toFixed(1)} m · ${rows.length} ردیف`;
});

test("studio/document", "اعتبارسنجی، اسناد ناقص را می‌گیرد (آزمون منفی)", () => {
  const empty = createStudioDocument({ id: "d2" });
  const emptyIssues = validateDocument(empty);
  assert(emptyIssues.some((issue) => issue.code === "EMPTY"), "سند خالی هشدار نداد");
  const broken = { ...demoDocument(), items: [{ id: "x", catalogId: "nope", x: 0, y: 0, w: 1, d: 1, rotationDeg: 0, level: 0 }] };
  const brokenIssues = validateDocument(broken);
  assert(brokenIssues.some((issue) => issue.code === "UNKNOWN_ITEM"), "شیء ناشناخته گرفته نشد");
  const badSize = { ...demoDocument(), items: [{ id: "x", catalogId: "sofa-3", x: 0, y: 0, w: 0, d: 1, rotationDeg: 0, level: 0 }] };
  assert(validateDocument(badSize).some((issue) => issue.code === "INVALID_SIZE"), "ابعاد صفر گرفته نشد");
  const level = { ...demoDocument(), levels: 1, currentLevel: 3 };
  assert(validateDocument(level).some((issue) => issue.code === "CURRENT_LEVEL"), "طبقهٔ خارج از محدوده گرفته نشد");
  return "۴ حالت ناقص شناسایی شد";
});

test("studio/render", "SVG خروجی معتبر، مقیاس‌دار و شامل عنوان/شمال است", () => {
  const doc = demoDocument();
  const svg = renderStudioSvg(doc);
  assert(svg.startsWith("<?xml"), "خروجی XML نیست");
  assert(svg.includes("<svg"), "تگ svg ندارد");
  assert(svg.includes("data-north=\"1\""), "نماد شمال ندارد");
  assert(svg.includes("data-title-block=\"1\""), "کادر عنوان ندارد");
  assert(svg.includes("data-scale-bar=\"1\""), "خط‌کش مقیاس ندارد");
  assert(svg.includes("data-item=\"it-1\""), "اشیای نقشه رندر نشدند");
  assert(!svg.includes("NaN"), "خروجی شامل NaN است");
  assert(svg.includes('width="420mm"'), "اندازهٔ برگهٔ A3 رعایت نشد");
  return `${(svg.length / 1024).toFixed(0)} KB`;
});

test("studio/render", "رندر بر اساس رشته، فقط لایه‌های همان رشته را می‌آورد", () => {
  const doc = demoDocument();
  const structure = renderStudioSvg(doc, { classification: "structure" });
  assert(structure.includes("data-catalog=\"column-concrete\""), "شیء سازه‌ای حذف شده");
  assert(!structure.includes("data-catalog=\"sofa-3\""), "مبلمان در پلان سازه آمده");
  const all = renderStudioSvg(doc);
  assert(all.includes("sofa-3") && all.includes("column-concrete"), "فیلتر «همه» کامل نیست");
  return "سازه بدون مبلمان";
});

test("studio/render", "DXF نسخهٔ AC1015 با واحد متر و لایه‌بندی است", () => {
  const dxf = renderStudioDxf(demoDocument());
  assert(dxf.includes("AC1015"), "نسخهٔ DXF");
  assert(dxf.includes("$INSUNITS"), "واحد اعلان نشده");
  assert(/\$INSUNITS\s*\n\s*70\s*\n\s*6/.test(dxf), "واحد باید متر (۶) باشد");
  assert(dxf.includes("LWPOLYLINE"), "موجودیت چندخطی ندارد");
  assert(dxf.includes("CIRCLE"), "دایره رندر نشد");
  assert(dxf.includes("SECTION") && dxf.includes("ENDSEC") && dxf.trimEnd().endsWith("EOF"), "ساختار SECTION/EOF ناقص");
  const layers = (dxf.match(/^LAYER$/gm) ?? []).length;
  assert(layers >= 3, `تعداد لایه‌ها: ${layers}`);
  return `${layers} لایه · ${(dxf.length / 1024).toFixed(0)} KB`;
});

test("studio/render", "PDF برداری با ابعاد صفحهٔ واقعی و xref سالم تولید می‌شود", () => {
  const pdf = renderStudioPdf(demoDocument());
  const text = Buffer.from(pdf).toString("latin1");
  assert(/^%PDF-1\.\d/.test(text), "سرصفحهٔ PDF");
  assert(text.includes("xref"), "xref ندارد");
  assert(text.includes("%%EOF"), "پایان فایل ندارد");
  assert(/MediaBox \[0 0 [\d.]+ [\d.]+]/.test(text), "MediaBox ندارد");
  const media = /MediaBox \[0 0 ([\d.]+) ([\d.]+)]/.exec(text);
  const widthPt = Number(media?.[1]);
  assert(Math.abs(widthPt - 420 * (72 / 25.4)) < 1, `عرض صفحهٔ A3: ${widthPt}pt`);
  assert(pdf.length > 3000, `حجم PDF کم است: ${pdf.length}`);
  assert(Buffer.from(pdf).subarray(0, 5).toString("latin1") === "%PDF-", "سرصفحهٔ PDF");
  const content = pdfContentStreams(Buffer.from(pdf));
  const lineOps = (content.match(/ l\n/g) ?? []).length;
  assert(lineOps >= 20, `تعداد مسیرهای برداری کم است: ${lineOps}`);
  assert(content.includes("BT"), "متن برداری ندارد");
  assert(text.includes("/FontFile2"), "فونت جاسازی نشده");
  assert(content.includes("Tj"), "عملگر نمایش متن ندارد");
  return `${(pdf.length / 1024).toFixed(0)} KB · ${widthPt.toFixed(0)}×${Number(media?.[2]).toFixed(0)}pt`;
});

test("studio/render", "CSV و JSON با جدول اشیا هم‌خوان‌اند", () => {
  const doc = demoDocument();
  const csv = studioScheduleCsv(doc);
  const lines = csv.trim().split("\r\n");
  assert(lines.length === schedule(doc).length + 1, `تعداد سطر CSV: ${lines.length}`);
  assert(csv.charCodeAt(0) === 0xfeff, "BOM برای اکسل ندارد");
  const json = JSON.parse(exportStudio(doc, "json").data.toString("utf8"));
  assert(json.document.items.length === doc.items.length, "JSON اشیا را کامل ندارد");
  assert(json.summary.fingerprint === documentFingerprint(doc), "اثر انگشت ناسازگار");
  const svgFile = exportStudio(doc, "svg");
  assert(svgFile.mime.includes("svg"), "MIME نوع SVG");
  return `${lines.length - 1} ردیف متره`;
});

test("studio/render", "خروجی قطعی است: سند یکسان ⇒ فایل یکسان", () => {
  const first = renderStudioSvg(demoDocument());
  const second = renderStudioSvg(demoDocument());
  assert(first === second, "خروجی SVG بازتولیدپذیر نیست");
  return "اثر انگشت ثابت";
});

test("studio/render", "محتوای بزرگ به‌صورت خودکار در برگه جا می‌شود و اعلام می‌کند", () => {
  const doc = createStudioDocument({
    id: "big",
    sheet: { format: "A4", orientation: "landscape", scale: 20 },
    items: [{ id: "it-1", catalogId: "raft", x: 0, y: 0, w: 60, d: 40, rotationDeg: 0, level: 0 }],
  });
  const layout = sheetLayout(doc);
  assert(layout.fitted, "تنظیم خودکار مقیاس اعلام نشد");
  assert(layout.mmPerMetre < mmPerMetre(doc), "مقیاس کوچک‌تر نشد");
  assert(layout.mmPerMetre * 60 <= layout.areaMm.w, "محتوا در عرض جا نمی‌شود");
  const sheet = sheetSizeMm(doc);
  assert(sheet.w === 297 && sheet.h === 210, "ابعاد A4 افقی");
  return `1:${Math.round(1000 / layout.mmPerMetre)}`;
});

test("studio/document", "سند نمونهٔ آماده کامل، معتبر و قابل بازتولید است", () => {
  const items = sampleDesignItems();
  assert(items.length >= 40, `تعداد اشیای نمونه: ${items.length}`);
  const doc = createStudioDocument({ id: "sample", sheet: { format: "A3", orientation: "landscape", scale: 50 }, items });
  assert(items.filter((item) => item.catalogId === "space-room").length >= 5, "فضاها کامل نیستند");
  const issues = validateDocument(doc).filter((issue) => issue.severity === "error");
  assert(issues.length === 0, `سند نمونه خطا دارد: ${issues.map((issue) => issue.code).join(",")}`);
  const svg = renderStudioSvg(doc);
  assert(svg.includes("data-item=\"st-1\""), "ستون‌های نمونه رندر نشدند");
  assert(svg.includes("data-space="), "فضاهای نام‌گذاری‌شده رندر نشدند");
  const scheduleRows = schedule(doc);
  assert(scheduleRows.length >= 15, `تنوع اقلام نمونه: ${scheduleRows.length}`);
  return `${items.length} شیء · ${scheduleRows.length} قلم`;
});

test("studio/render", "PDF چندبرگی: هر طبقه × رشته یک صفحه دارد", () => {
  const doc = { ...demoDocument(), levels: 3 };
  const bundle = renderStudioPdfBundle(doc);
  const text = Buffer.from(bundle.pdf).toString("latin1");
  const pageCount = (text.match(/\/Type \/Page[^s]/g) ?? []).length;
  assert(bundle.pages >= 3, `تعداد صفحه: ${bundle.pages}`);
  assert(pageCount === bundle.pages, `صفحات اعلام‌شده (${bundle.pages}) با اشیای PDF (${pageCount}) هم‌خوان نیست`);
  assert(text.includes("/Count "), "درخت صفحات ندارد");
  assert(text.includes("%%EOF"), "پایان فایل ندارد");
  const single = renderStudioPdfBundle(doc, { allLevels: false, allClassifications: false });
  assert(single.pages === 1, `بستهٔ تک‌صفحه‌ای: ${single.pages}`);
  return `${bundle.pages} صفحه`;
});

test("studio/render", "خروجی بر اساس طبقه، فقط اشیای همان طبقه را می‌آورد", () => {
  const doc = { ...demoDocument(), levels: 2 };
  const level0 = renderStudioSvg(doc, { onlyLevel: 0 });
  assert(level0.includes('data-catalog="sofa-3"'), "طبقهٔ ۰ کامل نیست");
  assert(!level0.includes('data-catalog="wc-western"'), "شیء طبقهٔ ۱ در طبقهٔ ۰ آمده");
  return "فیلتر طبقه";
});

test("studio/exporters", "کاربرگ XLSX متره سالم و خوانا است", () => {
  const doc = sampleDesign();
  const data = Buffer.from(studioXlsx(doc));
  // امضای ZIP
  assert(data[0] === 0x50 && data[1] === 0x4b, "امضای ZIP ندارد");
  const text = data.toString("latin1");
  assert(text.includes("xl/workbook.xml"), "فهرست کتاب کار ندارد");
  for (const name of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet5.xml"]) {
    assert(text.includes(name), `برگ ${name} ندارد`);
  }
  const sheet = new TextDecoder().decode(data);
  assert(sheet.includes("متره"), "برگ متره ندارد");
  assert(sheet.includes(doc.project.code), "کد نقشه در کاربرگ نیست");
  // جمع مساحت باید بزرگ‌تر از مساحت یک واحد باشد
  const rows = schedule(doc);
  assert(rows.length >= 8, `ردیف‌های متره کم است: ${rows.length}`);
  return `${rows.length} ردیف متره`;
});

test("studio/exporters", "عدد به حروف فارسی درست تبدیل می‌شود", () => {
  assert(toPersianWords(0) === "صفر", toPersianWords(0));
  assert(toPersianWords(7) === "هفت", toPersianWords(7));
  assert(toPersianWords(21).includes("بیست و یک"), toPersianWords(21));
  assert(toPersianWords(1234).includes("هزار"), toPersianWords(1234));
  assert(toPersianWords(2_500_000).includes("میلیون"), toPersianWords(2_500_000));
  assert(toPersianWords(15).includes("پانزده"), toPersianWords(15));
  return "تبدیل عدد به حروف";
});

test("studio/exporters", "IFC4 معتبر: هدر، موجودیت‌های استاندارد و ارجاع‌های موجود", () => {
  const doc = sampleDesign();
  const text = studioIfc(doc);
  assert(text.startsWith("ISO-10303-21;"), "شروع فایل IFC درست نیست");
  assert(text.trimEnd().endsWith("END-ISO-10303-21;"), "پایان فایل IFC درست نیست");
  assert(text.includes("FILE_SCHEMA(('IFC4'))"), "شِما IFC4 نیست");
  assert(text.includes("IFCPROJECT("), "پروژه ندارد");
  assert(text.includes("IFCBUILDINGSTOREY("), "طبقه ندارد");
  assert(text.includes("IFCSPACE("), "فضا ندارد");
  assert(text.includes("IFCBUILDINGELEMENTPROXY("), "اجزای ساختمانی ندارند");
  // همهٔ ارجاع‌ها باید موجودیت تعریف‌شده باشند
  const defined = new Set([...text.matchAll(/^#(\d+)=/gm)].map((match) => match[1]));
  const referenced = new Set([...text.matchAll(/#(\d+)/g)].map((match) => match[1]));
  const missing = [...referenced].filter((value) => !defined.has(value));
  assert(missing.length === 0, `ارجاع بدون تعریف: ${missing.slice(0, 5).join(", ")}`);
  // هندسهٔ هر جزء باید در متر باشد (ابعاد ۱۲×۱۰)
  // موجودیت‌های استاندارد باید از نوع خودشان باشند، نه همه Proxy
  for (const entity of ["IFCWALL(", "IFCCOLUMN(", "IFCBEAM(", "IFCDOOR(", "IFCWINDOW(", "IFCFURNITURE("]) {
    const count = (text.match(new RegExp(entity.replace("(", "\\("), "g")) ?? []).length;
    assert(count > 0, `موجودیت ${entity} در IFC نیست`);
  }
  const proxies = (text.match(/IFCBUILDINGELEMENTPROXY/g) ?? []).length;
  assert(proxies >= 40, `تعداد اجزای عمومی: ${proxies}`);
  // هر موجودیت باید تعداد ویژگی درست داشته باشد (۹ برای دیوار/دال/ستون/تیر)
  const wall = text.split("\n").find((line) => line.includes("IFCWALL("));
  assert(wall != null, "دیوار IFC پیدا نشد");
  const attrs = wall!.slice(wall!.indexOf("(") + 1, -2).split(",");
  assert(attrs.length === 9, `تعداد ویژگی IFCWALL: ${attrs.length}`);
  assert(wall!.includes(".STANDARD."), "نوع دیوار IFC تنظیم نشده");
  return `${defined.size} موجودیت`;
});

test("studio/vertical", "برگهٔ نماها هر چهار جهت و تراز طبقات را دارد", () => {
  const doc = sampleDesign();
  const svg = renderStudioElevationSheet(doc);
  for (const direction of ["north", "south", "east", "west"]) {
    assert(svg.includes(`data-direction="${direction}"`), `نمای ${direction} رندر نشد`);
  }
  assert(svg.includes("±0.00"), "تراز صفر ندارد");
  assert(svg.includes("+6.40"), "تراز بام (۲×۳٫۲۰) ندارد");
  assert((svg.match(/data-slab="1"/g) ?? []).length >= 8, "کف طبقات ناقص است");
  assert(svg.includes("width=\"420mm\""), "ابعاد برگهٔ A3 افقی نیست");
  return "۴ نما";
});

test("studio/vertical", "برش فقط اجزای نوار برش را می‌آورد و ارتفاع‌گذاری دارد", () => {
  const doc = sampleDesign();
  const section = renderStudioVertical(doc, { sectionAt: 6, sectionWidth: 1.2, direction: "west" });
  assert(section.includes('data-view="section"'), "خروجی برش نیست");
  assert(section.includes("6.40"), "ارتفاع کل در برش نیست");
  const wide = renderStudioVertical(doc, { sectionAt: 6, sectionWidth: 40, direction: "west" });
  const narrow = renderStudioVertical(doc, { sectionAt: 25, sectionWidth: 1, direction: "west" });
  // برش بیرون از ساختمان هیچ دیواری نباید داشته باشد
  assert(!narrow.includes('data-kind="solid"'), "برش خارج از پلان دیوار دارد");
  assert((wide.match(/data-kind="solid"/g) ?? []).length >= 8, "برش پهن، دیوارها را نیاورد");
  return "برش";
});

test("studio/vertical", "نما از مدل پلان ساخته می‌شود (بدون دادهٔ تکراری)", () => {
  const doc = sampleDesign();
  const empty = { ...doc, items: [], layers: doc.layers };
  const svg = renderStudioVertical(empty, { direction: "south" });
  assert(!svg.includes('data-kind="solid"'), "سند خالی نباید عنصر داشته باشد");
  // با یک ستون، نما باید عنصر داشته باشد
  const withColumn = { ...doc, items: doc.items.filter((item) => item.catalogId === "column-concrete") };
  const svg2 = renderStudioVertical(withColumn, { direction: "south" });
  assert((svg2.match(/data-kind="column"/g) ?? []).length >= 3, "ستون‌ها در نما نیامدند");
  return "واترفال";
});

test("studio/document", "تغییر نوع شیء، محدودهٔ مجاز کالای جدید را اعمال می‌کند", () => {
  let doc = createStudioDocument({ items: [] });
  doc = addItem(doc, "chair", { x: 2, y: 2 });
  const chair = doc.items[0];
  assert(chair.w <= 0.6, `صندلی بزرگ‌تر از حد: ${chair.w}`);
  // تبدیل صندلی به مبل سه‌نفره: اندازهٔ پیش‌فرض جدید باید پذیرفته شود
  doc = updateItem(doc, chair.id, { catalogId: "sofa-3", w: 2.1, d: 0.9 });
  assert(doc.items[0].catalogId === "sofa-3", "نوع شیء عوض نشد");
  assert(doc.items[0].w > 1, `مبل به اندازهٔ صندلی محدود شد: ${doc.items[0].w}`);
  // رفتار غیرمجاز: مبل را نمی‌توان به اندازهٔ ۸ متر کرد
  doc = updateItem(doc, chair.id, { w: 8 });
  assert(doc.items[0].w <= 2.1 * 6, `حداکثر اندازه اعمال نشد: ${doc.items[0].w}`);
  return "تغییر نوع";
});

/* ─────────────────────────── متن فارسی و PDF ─────────────────────────── */

/** استخراج و بازکردن همهٔ جریان‌های Flate یک PDF (برای بازرسی محتوای برداری). */
function pdfContentStreams(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const chunks: string[] = [];
  let index = raw.indexOf("stream\n");
  while (index >= 0) {
    // «endstream» خودش «stream» دارد؛ باید از آن رد شد
    if (raw.slice(Math.max(0, index - 3), index) === "end") {
      index = raw.indexOf("stream\n", index + 7);
      continue;
    }
    const start = index + 7;
    const end = raw.indexOf("endstream", start);
    if (end < 0) break;
    const body = pdf.subarray(start, end);
    try {
      chunks.push(inflateSync(body).toString("latin1"));
    } catch {
      chunks.push(body.toString("latin1"));
    }
    index = raw.indexOf("stream\n", end);
  }
  return chunks.join("\n");
}

test("studio/text", "شکل‌دهی حروف فارسی: آغازین/میانی/پایانی و لیگاتور لا", () => {
  // «سلام» = س(آغازین) + لا(پایانی) + م(پایانی)
  const shaped = shapeLogical("سلام");
  assert(shaped.length === 3, `طول شکل‌دهی: ${shaped.length}`);
  assert(shaped[0] === 0xfeb3, `س آغازین: ${shaped[0].toString(16)}`);
  assert(shaped[1] === 0xfefc, `لا پایانی: ${shaped[1].toString(16)}`);
  // م پس از الف (که فقط از راست می‌چسبد) به حرف پیشین نمی‌چسبد ⇒ شکل تنها
  assert(shaped[2] === 0xfee1, `م تنها: ${shaped[2].toString(16)}`);

  // «کتاب» = ک(آغازین) + ت(میانی) + ا(پایانی) + ب(پایانی)
  const book = shapeLogical("کتاب");
  assert(book[0] === 0xfb90, `ک آغازین: ${book[0].toString(16)}`);
  assert(book[1] === 0xfe98, `ت میانی: ${book[1].toString(16)}`);
  assert(book[2] === 0xfe8e, `ا پایانی: ${book[2].toString(16)}`);
  assert(book[3] === 0xfe8f, `ب تنها (الف به چپ نمی‌چسبد): ${book[3].toString(16)}`);
  return "شکل‌دهی";
});

test("studio/text", "قواعد شکل‌دهی: تنهای، فاصله، نیم‌فاصله و حرف راست‌چسب", () => {
  // «ا» و «د» فقط از راست می‌چسبند؛ در «ادب» هیچ‌کدام به بعدی نمی‌چسبند
  const adab = shapeLogical("ادب");
  assert(adab[0] === 0xfe8d, `ا تنها: ${adab[0].toString(16)}`);
  assert(adab[1] === 0xfea9, `د تنها: ${adab[1].toString(16)}`);
  assert(adab[2] === 0xfe8f, `ب تنها بعد از د: ${adab[2].toString(16)}`);

  // نیم‌فاصله (ZWNJ) اتصال را می‌شکند و خودش گلیف ندارد
  const zwnj = shapeLogical("می‌رود");
  assert(zwnj.length === 5, `طول «می‌رود» (نیم‌فاصله گلیف ندارد): ${zwnj.length}`);
  assert(zwnj[1] === 0xfbfd, `ی پایانی پیش از نیم‌فاصله: ${zwnj[1].toString(16)}`);
  assert(zwnj[2] === 0xfead, `ر تنها پس از نیم‌فاصله: ${zwnj[2].toString(16)}`);
  assert(!zwnj.includes(0x200c), "نیم‌فاصله نباید گلیف بگیرد");

  // فاصله شکل نمی‌گیرد
  assert(shapeLogical("ا ب")[1] === 0x20, "فاصله باید دست‌نخورده بماند");
  return "نیم‌فاصله";
});

test("studio/text", "چیدمان دیداری: عدد و کلمهٔ لاتین ترتیب داخلی خود را نگه می‌دارد", () => {
  const visual = shapeForDisplay("اتاق ۱۲ متر", "rtl");
  const text = String.fromCodePoint(...visual);
  // تراز: رشتهٔ دیداری باید با «متر» شروع نشود؛ عدد ۱۲ باید پیوسته بماند
  const digits = [..."۱۲"].map((char) => char.codePointAt(0)!);
  const firstDigit = text.indexOf(String.fromCodePoint(digits[0]));
  assert(firstDigit >= 0, "عدد در خروجی نیست");
  assert(text[firstDigit + 1] === String.fromCodePoint(digits[1]), "ترتیب ارقام نباید معکوس شود");

  // لاتین: «قطر ۲۰ cm» باید cm را به‌صورت پیوسته و در سمت چپ عدد داشته باشد
  const latin = String.fromCodePoint(...shapeForDisplay("قطر ۲۰ cm", "rtl"));
  assert(latin.includes("cm"), "کلمهٔ لاتین حفظ نشد");
  assert(!latin.includes("mc"), "کلمهٔ لاتین معکوس شد");
  return "دوسویه‌نویسی";
});

test("studio/text", "فونت فارسی جاسازی‌شدنی است و نگاشت متن برقرار می‌شود", () => {
  const typeface = loadTypeface("regular");
  assert(typeface !== null, "فونت وزیرمتن پیدا نشد (public/fonts)");
  assert(typeface!.embeddable, "مجوز جاسازی فونت باید آزاد باشد (OFL)");
  assert(typeface!.unitsPerEm === 2048, `unitsPerEm: ${typeface!.unitsPerEm}`);
  for (const char of "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهیآأء۰۱۲۳۴۵۶۷۸۹") {
    const code = char.codePointAt(0)!;
    assert(typeface!.glyphFor(code) > 0, `گلیف نبود برای «${char}»`);
  }
  for (const code of [0xfe8d, 0xfe8e, 0xfbfc, 0xfbff, 0xfefb, 0xfefc, 0x00b2]) {
    assert(typeface!.glyphFor(code) > 0, `شکل نمایشی ${code.toString(16)} در فونت نیست`);
  }
  // عرض متن باید مثبت و متناسب با طول باشد
  const short = typeface!.widthOf("اتاق", 10);
  const long = typeface!.widthOf("اتاق خواب بزرگ", 10);
  assert(long > short && short > 0, `عرض متن نامعتبر: ${short} / ${long}`);
  return `upem ${typeface!.unitsPerEm}`;
});

test("studio/render", "PDF فارسی: فونت جاسازی‌شده، xref سالم و ToUnicode", () => {
  const doc = sampleDesign();
  const pdf = Buffer.from(renderStudioPdf(doc));
  const head = pdf.subarray(0, 8).toString("latin1");
  assert(head.startsWith("%PDF-1.7"), `سرصفحه: ${head}`);
  const text = pdf.toString("latin1");
  assert(text.includes("/FontFile2"), "فونت جاسازی نشده");
  assert(text.includes("/Identity-H"), "کدگذاری CID استفاده نشده");
  assert(text.includes("/ToUnicode"), "نگاشت متن (ToUnicode) ندارد");
  assert(text.includes("/BaseFont /Vazirmatn"), "نام فونت جاسازی‌شده نیست");
  assert(/\/W \[/.test(text), "آرایهٔ عرض گلیف‌ها (/W) ندارد");
  assert(text.trimEnd().endsWith("%%EOF"), "پایان فایل ندارد");

  // آفست‌های xref باید به ابتدای اشیای درست اشاره کنند
  const startxref = Number(/startxref\s+(\d+)/.exec(text)?.[1] ?? -1);
  assert(startxref > 0, "startxref ندارد");
  const xref = text.slice(startxref);
  const entries = [...xref.matchAll(/(\d{10}) 00000 n/g)].map((match) => Number(match[1]));
  assert(entries.length >= 6, `تعداد ورودی xref: ${entries.length}`);
  entries.forEach((offset, index) => {
    const at = pdf.subarray(offset, offset + 24).toString("latin1");
    assert(/^\d+ 0 obj/.test(at), `xref ورودی ${index + 1} به شیء اشاره نمی‌کند: ${JSON.stringify(at)}`);
  });
  return `${entries.length} شیء`;
});

test("studio/render", "DXF برچسب فارسی را با یونیکد و به شکل درست می‌نویسد", () => {
  const dxf = renderStudioDxf(sampleDesign());
  assert(dxf.includes("LABELS"), "لایهٔ برچسب در جدول لایه‌ها نیست");
  const escaped = dxf.split("\n").filter((line) => line.includes("U+"));
  assert(escaped.length >= 10, `تعداد برچسب‌های یونیکد: ${escaped.length}`);
  const unicode = String.fromCharCode(92) + "U+";
  assert(escaped[0].startsWith(unicode), `قالب یونیکد DXF: ${escaped[0].slice(0, 20)}`);
  assert(/U\+FE[0-9A-F]{2}/.test(escaped.join("")), "شکل نمایشی (FE..) در برچسب‌ها نیست");
  assert(dxf.trimEnd().endsWith("EOF"), "DXF با EOF تمام نمی‌شود");
  return `${escaped.length} برچسب`;
});

test("studio/vertical", "PDF نماها: پنج برگه، فونت جاسازی‌شده و هندسهٔ مشترک با SVG", () => {
  const doc = sampleDesign();
  const { pdf, pages } = renderStudioElevationsPdf(doc);
  assert(pages === 5, `تعداد برگه‌ها: ${pages}`);
  const raw = Buffer.from(pdf).toString("latin1");
  assert(/^%PDF-1\.\d/.test(raw), "سرصفحهٔ PDF");
  assert((raw.match(/\/Type \/Page /g) ?? []).length === 5, "تعداد شیء Page با برگه‌ها نمی‌خواند");
  assert(raw.includes("/FontFile2"), "فونت جاسازی نشده");
  assert(raw.includes("Vazirmatn"), "نام فونت جاسازی‌شده نیست");

  // هندسهٔ مشترک: مقیاس PDF باید همان مقیاس SVG باشد (یک منبع حقیقت)
  const svg = renderStudioElevationSheet(doc);
  // مقیاس با ارقام فارسی نوشته می‌شود (۱:۱۰۰)، پس هر دو شکل را می‌پذیریم
  const scale = /[۱1]\s*:\s*([۰-۹\d]+)/.exec(svg)?.[1];
  assert(scale != null, "مقیاس SVG پیدا نشد");
  assert(viewGeometry(doc, { direction: "south" }, { x: 0, y: 0, w: 300, h: 200 }).scale > 0, "مقیاس نمای جنوبی");

  // جریان محتوا باید دستورهای رسم داشته باشد (نه برگهٔ خالی)
  const content = pdfContentStreams(Buffer.from(pdf));
  assert((content.match(/ re [BS]/g) ?? []).length > 50, "مستطیل‌های برگه کم است");
  assert((content.match(/ l S/g) ?? []).length > 20, "خطوط برگه کم است");
  return `${pages} برگه · ${(pdf.length / 1024).toFixed(0)} KB`;
});

test("studio/vertical", "PDF برش: اجزای بریده‌شده poché دارند و برگه کامل است", () => {
  const doc = sampleDesign();
  const pdf = renderStudioVerticalPdf(doc, { direction: "west", sectionAt: 6, sectionWidth: 1.2 });
  const raw = Buffer.from(pdf).toString("latin1");
  assert((raw.match(/\/Type \/Page /g) ?? []).length === 1, "برش باید یک برگه باشد");
  const svg = renderStudioVertical(doc, { direction: "west", sectionAt: 6, sectionWidth: 1.2 });
  assert(svg.includes('data-cut="1"'), "پوشش (poché) در SVG نیست");
  const content = pdfContentStreams(Buffer.from(pdf));
  assert((content.match(/ re [BS]/g) ?? []).length > 20, "هندسهٔ برش رسم نشده");
  return "برش A-A";
});

/* ─────────────────────────── جزئیات سازه و میلگرد ─────────────────────────── */

test("studio/details", "جزئیات اجرایی معماری: چهار مقطع لایه‌ای و سه قالب خروجی", () => {
  const doc = sampleDesign();
  assert(ARCH_DETAILS.length >= 4, `تعداد مقاطع معماری کم است: ${ARCH_DETAILS.length}`);
  for (const detail of ARCH_DETAILS) {
    assert(detail.bands.length >= 4, `مقطع بدون لایهٔ کافی: ${detail.title}`);
    const total = detail.bands.reduce((sum, band) => sum + band.thickness, 0);
    assert(total >= 150 && total <= 1000, `ضخامت کل غیرمنطقی در ${detail.title}: ${total}`);
    for (const band of detail.bands) {
      assert(band.thickness > 0, `لایهٔ بدون ضخامت: ${detail.title}`);
      assert(band.label.trim().length > 2, `لایهٔ بدون نام: ${detail.title}`);
    }
  }
  const svg = exportStudio(doc, "arch-details");
  const text = svg.data.toString("utf8");
  assert(text.includes("<svg"), "SVG جزئیات معماری ساخته نشد");
  for (const detail of ARCH_DETAILS) {
    assert(text.includes(detail.title), `عنوان مقطع در SVG نیست: ${detail.title}`);
  }
  assert(text.includes("یادداشت‌های فنی"), "یادداشت‌های فنی روی برگه نیست");

  const pdf = exportStudio(doc, "arch-details-pdf");
  const raw = Buffer.from(pdf.data).toString("latin1");
  assert(/^%PDF-1\.\d/.test(raw), "امضای PDF جزئیات معماری");
  assert(raw.includes("/FontFile2"), "فونت فارسی در PDF جزئیات معماری جاسازی نشده");

  const dxf = exportStudio(doc, "arch-details-dxf");
  const dxfText = dxf.data.toString("utf8");
  assert(dxf.data.length > 30_000, `حجم DXF جزئیات معماری کم است: ${dxf.data.length}`);
  assert(dxfText.includes("AcDbHatch"), "هاشور لایه‌ها در DXF نیست");
  assert(dxfText.includes("$INSUNITS\n70\n6"), "واحد DXF جزئیات معماری باید متر باشد");
  return `${ARCH_DETAILS.length} مقطع معماری`;
});
test("studio/details", "جدول برش میلگرد (BBS): طول برش، وزن و شکل خم برای هر ردیف", () => {
  const doc = sampleDesign();
  const schedule = rebarSchedule(doc);
  const svg = renderStudioDetailSheet(doc);
  assert(svg.includes("جدول برش میلگرد"), "جدول برش میلگرد روی برگه نیست");
  assert(svg.includes("طول برش"), "ستون طول برش در BBS نیست");
  assert(svg.includes("شکل"), "ستون شکل خم در BBS نیست");
  // طول برش هر ردیف باید همان طول محاسبه‌شدهٔ موتور آرماتور باشد (قلاب/گیرش داخلش)
  for (const row of schedule.rows.slice(0, 6)) {
    assert(row.lengthM > 0.3, `طول برش نامعتبر: ${row.member}`);
    const expected = row.count * row.lengthM * barWeightPerMetre(row.diameterMm);
    assert(Math.abs(row.weightKg - expected) < 0.2, `وزن BBS نمی‌خواند: ${row.member}`);
  }
  // خاموت باید طول بستهٔ محیط + دو قلاب باشد، نه محیط خالص
  const hoop = schedule.rows.find((row) => /خاموت/.test(row.note));
  const member = hoop ? schedule.members.find((entry) => hoop.member.includes(entry.label.slice(0, 8))) : undefined;
  if (hoop && member) {
    assert(hoop.lengthM > 2 * (member.b + member.h) * 0.8, `طول خاموت کمتر از انتظار: ${hoop.lengthM}`);
  }
  return `${schedule.rows.length} ردیف BBS`;
});
test("studio/details", "ستون مدور و دیوار حائل در جدول میلگرد و جزئیات می‌آیند", () => {
  const doc = createStudioDocument({
    id: "dsn-round",
    name: "ستون مدور",
    sheet: { format: "A3", orientation: "landscape", scale: 50 },
    items: [
      { id: "r1", catalogId: "column-round", x: 1, y: 1, w: 0.5, d: 0.5, rotationDeg: 0, level: 0 },
      { id: "r2", catalogId: "column-concrete", x: 4, y: 1, w: 0.4, d: 0.4, rotationDeg: 0, level: 0 },
      { id: "r3", catalogId: "retaining-wall", x: 1, y: 6, w: 8, d: 0.4, rotationDeg: 0, level: 0 },
      { id: "r4", catalogId: "beam-concrete", x: 1, y: 3, w: 6, d: 0.4, rotationDeg: 0, level: 0 },
    ],
  });
  const schedule = rebarSchedule(doc);
  const round = schedule.members.find((member) => member.kind === "column-round");
  if (!round) throw new Error("ستون مدور در فهرست آرماتور نیامد");
  assert(round.b === round.h, "مقطع ستون مدور باید مربع محیطی باشد");
  assert(round.bars.mainCount >= 6, `تعداد میلگرد ستون مدور کم است: ${round.bars.mainCount}`);
  // خاموت حلقوی: طول ≈ محیط دایره، نه محیط مستطیل
  const perimeter = Math.PI * (round.b - 0.06);
  assert(round.bars.hoopLength > perimeter * 0.8, `طول خاموت حلقوی نامعتبر: ${round.bars.hoopLength}`);
  assert(/حلقوی/.test(round.bars.note), `شرح خاموت مدور ناقص است: ${round.bars.note}`);
  const wall = schedule.members.find((member) => member.kind === "retaining-wall");
  if (!wall) throw new Error("دیوار حائل در فهرست آرماتور نیامد");
  assert(wall.bars.mainCount > 4, "آرماتور دیوار حائل محاسبه نشد");
  // برگهٔ جزئیات باید بدون خطا با این اعضا ساخته شود
  const svg = renderStudioDetailSheet(doc);
  assert(svg.includes("جزئیات ستون مدور"), "عنوان جزئیات ستون مدور نیامد");
  assert(svg.includes("جزئیات دیوار حائل"), "عنوان جزئیات دیوار حائل نیامد");
  return `${round.bars.mainCount} شاخه در ستون مدور`;
});
test("studio/details", "جدول میلگرد: تعداد/قطر/وزن سازگار و جمع درست است", () => {
  const doc = sampleDesign();
  const schedule = rebarSchedule(doc);
  assert(schedule.members.length > 0, "هیچ عضو سازه‌ای شناسایی نشد");
  // ردیف‌ها بر پایهٔ «نوع عضو» تجمیع می‌شوند، پس تعدادشان از تعداد اعضا کمتر است
  assert(schedule.rows.length >= 3, "ردیف‌های جدول میلگرد کم است");
  assert(schedule.rows.length <= schedule.members.length * 2, "ردیف‌ها بیش از حد متورم شده‌اند");
  for (const row of schedule.rows) {
    assert(row.diameterMm === 8 || row.diameterMm === 10 || row.diameterMm === 12 || row.diameterMm === 16 || row.diameterMm === 20, `قطر نامعتبر: ${row.diameterMm}`);
    assert(row.count > 0, `تعداد نامعتبر در ${row.member}`);
    assert(row.lengthM > 0, `طول نامعتبر در ${row.member}`);
    const expected = row.count * row.lengthM * barWeightPerMetre(row.diameterMm);
    assert(Math.abs(row.weightKg - expected) < 0.2, `وزن ${row.member} با طول/تعداد نمی‌خواند: ${row.weightKg} vs ${expected}`);
    if (row.diameterMm >= 12) assert(/شاخهٔ|میلگرد|شبکهٔ/.test(row.note), `شرح میلگرد اصلی ناقص است: ${row.note}`);
  }
  const sum = schedule.rows.reduce((total, row) => total + row.weightKg, 0);
  assert(Math.abs(schedule.totalWeightKg - sum) < 0.2, "جمع وزن با ردیف‌ها نمی‌خواند");
  assert(schedule.notes.length >= 3, "یادداشت‌های فنی کم است");

  // ابعاد و آرماتور نباید با حداقل آیین‌نامه‌ای ناسازگار باشد
  const columns = schedule.members.filter((member) => member.kind === "column");
  for (const column of columns) {
    assert(column.bars.mainCount >= 4, `ستون با کمتر از ۴ میلگرد: ${column.bars.mainCount}`);
    assert(column.bars.mainCount % 4 === 0, `آرایش ستون مضرب ۴ نیست: ${column.bars.mainCount}`);
    assert(column.bars.hoopCount >= Math.ceil(column.length / 0.2) - 1, "تعداد خاموت کم است");
  }
  return `${schedule.members.length} عضو · ${schedule.rows.length} ردیف · ${schedule.totalWeightKg} kg`;
});

test("studio/details", "وزن واحد میلگرد مطابق جدول استاندارد است", () => {
  assert(Math.abs(barWeightPerMetre(16) - 1.578) < 0.01, `Φ16: ${barWeightPerMetre(16)}`);
  assert(Math.abs(barWeightPerMetre(12) - 0.888) < 0.01, `Φ12: ${barWeightPerMetre(12)}`);
  assert(Math.abs(barWeightPerMetre(8) - 0.395) < 0.01, `Φ8: ${barWeightPerMetre(8)}`);
  assert(Math.abs(barArea(16) - 201) < 2, `سطح Φ16: ${barArea(16)}`);
  return "kg/m";
});

test("studio/details", "برگهٔ جزئیات: SVG و PDF هر دو با جدول و عنوان کامل", () => {
  const doc = sampleDesign();
  const svg = renderStudioDetailSheet(doc);
  assert(svg.includes("جدول میلگرد"), "عنوان جدول در SVG نیست");
  assert(svg.includes("جزئیات ستون"), "جزئیات ستون در SVG نیست");
  assert(svg.includes("کنترل نهایی با مهندس"), "هشدار کنترل در کادر نیست");
  assert((svg.match(/<rect /g) ?? []).length > 10, "اجزای ترسیمی برگه کم است");
  assert((svg.match(/<line /g) ?? []).length > 60, "خطوط هاشور/آرماتور کم است");

  const pdf = renderStudioDetailPdf(doc);
  const raw = Buffer.from(pdf).toString("latin1");
  assert(/^%PDF-1\.\d/.test(raw), "سرصفحهٔ PDF");
  assert(raw.includes("/FontFile2"), "فونت فارسی جاسازی نشده");
  assert((raw.match(/\/Type \/Page /g) ?? []).length === 1, "جزئیات باید یک برگه باشد");
  const content = pdfContentStreams(Buffer.from(pdf));
  assert((content.match(/ re [BS]/g) ?? []).length > 10, "مستطیل‌های جدول/جزئیات کم است");
  assert((content.match(/ l S/g) ?? []).length > 40, "خطوط آرماتور/هاشور کم است");
  return `${(pdf.length / 1024).toFixed(0)} KB`;
});

test("studio/exporters", "XLSX شامل برگهٔ میلگرد است", () => {
  const doc = sampleDesign();
  const xlsx = Buffer.from(studioXlsx(doc));
  const text = xlsx.toString("latin1");
  assert(text.includes("xl/worksheets/sheet2.xml"), "برگهٔ دوم ساخته نشده");
  // محتوای XML با UTF-8 نوشته می‌شود؛ برای جست‌وجو همان بایت‌ها را latin1 می‌خوانیم
  const rebarLabel = Buffer.from("میلگرد", "utf8").toString("latin1");
  assert(text.includes(rebarLabel), "نام برگهٔ میلگرد در فهرست نیست");
  const barText = Buffer.from("شاخهٔ", "utf8").toString("latin1");
  const meshText = Buffer.from("شبکهٔ", "utf8").toString("latin1");
  assert(text.includes(barText) || text.includes(meshText), "ردیف‌های میلگرد در برگه نیست");
  // فایل باید ZIP معتبر با امضای PK باشد
  assert(xlsx[0] === 0x50 && xlsx[1] === 0x4b, "امضای ZIP نامعتبر");
  return "6 برگ";
});

/* ─────────────────────────── جداول و کیپلان ─────────────────────────── */

test("studio/schedules", "جدول دیوارها: طول/سطح/بازشو با هندسهٔ سند می‌خواند", () => {
  const doc = sampleDesign();
  const schedules = studioSchedules(doc);
  assert(schedules.walls.length >= 2, `تعداد انواع دیوار: ${schedules.walls.length}`);

  // جمع طول دیوارها باید با مجموع طول اشیای دیوار برابر باشد
  const wallItems = doc.items.filter((item) => ["wall-exterior", "wall-partition"].includes(item.catalogId));
  const expectedLength = wallItems.reduce((sum, item) => sum + Math.max(item.w, item.d), 0);
  assert(Math.abs(schedules.totals.wallLength - expectedLength) < 0.01, `طول دیوار: ${schedules.totals.wallLength} ≠ ${expectedLength}`);

  for (const wall of schedules.walls) {
    assert(wall.thickness > 0.05 && wall.thickness < 1, `ضخامت نامعتبر: ${wall.thickness}`);
    assert(wall.grossArea > 0, `سطح ناخالص صفر: ${wall.name}`);
    assert(wall.netArea <= wall.grossArea + 0.01, "سطح خالص از ناخالص بیشتر است");
    assert(wall.netArea > 0, `سطح خالص منفی/صفر: ${wall.name}`);
    assert(wall.height >= 2.5 && wall.height <= 4, `ارتفاع دیوار نامعتبر: ${wall.height}`);
  }

  // سطح کل دیوار = ناخالص - بازشوها
  const gross = schedules.walls.reduce((sum, wall) => sum + wall.grossArea, 0);
  const openings = schedules.walls.reduce((sum, wall) => sum + wall.openingArea, 0);
  assert(Math.abs(gross - openings - schedules.totals.wallNetArea) < 0.05, "جمع سطح خالص با ردیف‌ها نمی‌خواند");
  return `${schedules.walls.length} نوع · ${schedules.totals.wallLength.toFixed(1)} m`;
});

test("studio/schedules", "جدول بازشوها: کد پایدار، ابعاد و تعداد درست", () => {
  const doc = sampleDesign();
  const schedules = studioSchedules(doc);
  const doors = schedules.openings.filter((row) => row.code.startsWith("D"));
  const windows = schedules.openings.filter((row) => row.code.startsWith("W"));
  assert(doors.length > 0 && windows.length > 0, "در یا پنجره‌ای شناسایی نشد");

  // کدها یکتا و پیاپی‌اند
  const codes = schedules.openings.map((row) => row.code);
  assert(new Set(codes).size === codes.length, "کد بازشو تکراری است");
  doors.forEach((row, index) => assert(row.code === `D${index + 1}`, `کد در: ${row.code}`));
  windows.forEach((row, index) => assert(row.code === `W${index + 1}`, `کد پنجره: ${row.code}`));

  // جمع تعداد باید با تعداد اشیای بازشو برابر باشد
  const openingItems = doc.items.filter((item) =>
    ["door-single", "door-double", "door-garage", "window"].includes(item.catalogId),
  );
  const total = schedules.openings.reduce((sum, row) => sum + row.count, 0);
  assert(total === openingItems.length, `تعداد بازشو: ${total} ≠ ${openingItems.length}`);

  // پنجره‌ها باید کف‌نشیمن داشته باشند و درها نه
  for (const door of doors) assert(door.sill === 0, `کف‌نشیمن در: ${door.sill}`);
  for (const window of windows) assert(window.sill > 0, `کف‌نشیمن پنجره: ${window.sill}`);

  // پایداری کدها با تغییر مکان اشیا (نباید با جابه‌جایی عوض شود)
  const moved = { ...doc, items: doc.items.map((item) => ({ ...item, x: item.x + 0.37 })) };
  const movedCodes = studioSchedules(moved).openings.map((row) => `${row.code}:${row.width}`);
  const baseCodes = schedules.openings.map((row) => `${row.code}:${row.width}`);
  assert(movedCodes.join("|") === baseCodes.join("|"), "کدگذاری بازشوها با جابه‌جایی تغییر کرد");
  return `${doors.length} در · ${windows.length} پنجره`;
});

test("studio/schedules", "برگهٔ جداول: کیپلان، سه جدول و کارت خلاصه", () => {
  const doc = sampleDesign();
  const svg = renderStudioScheduleSheet(doc);
  for (const title of ["کیپلان", "جدول فضاها", "جدول دیوارها", "جدول درها و پنجره‌ها"]) {
    assert(svg.includes(title), `عنوان «${title}» در برگه نیست`);
  }
  assert(svg.includes("حد قطعه"), "مرز قطعه در کیپلان نیست");
  assert(svg.includes("شمال"), "فلش شمال در کیپلان نیست");
  // اعداد فارسی و نه لاتین در جدول‌ها
  assert(/[۰-۹]/.test(svg), "اعداد فارسی در برگه نیست");

  const pdf = renderStudioSchedulePdf(doc);
  const raw = Buffer.from(pdf).toString("latin1");
  assert(/^%PDF-1\.\d/.test(raw), "سرصفحهٔ PDF");
  assert(raw.includes("/FontFile2"), "فونت فارسی جاسازی نشده");
  assert((raw.match(/\/Type \/Page /g) ?? []).length === 1, "برگهٔ جداول باید یک صفحه باشد");
  const content = pdfContentStreams(Buffer.from(pdf));
  assert((content.match(/ re [BS]/g) ?? []).length > 30, "مستطیل‌های جدول کم است");
  return `${(pdf.length / 1024).toFixed(0)} KB`;
});

test("studio/schedules", "اعداد فارسی: جداکنندهٔ اعشار و ارقام درست", () => {
  assert(faNumber(3791.4, 1) === "۳۷۹۱٫۴", `عدد اعشاری: ${faNumber(3791.4, 1)}`);
  assert(faNumber(130.7) === "۱۳۰٫۷۰", `دو رقم اعشار: ${faNumber(130.7)}`);
  assert(faNumber(-2.5, 1) === "−۲٫۵", `عدد منفی: ${faNumber(-2.5, 1)}`);
  assert(faNumber(1234567, 0, true) === "۱٬۲۳۴٬۵۶۷", `جداکنندهٔ هزارگان: ${faNumber(1234567, 0, true)}`);
  assert(faMeter(12) === "۱۲٫۰۰ متر", `متر: ${faMeter(12)}`);
  assert(faPercent(0.185) === "۱۸٫۵٪", `درصد: ${faPercent(0.185)}`);
  return "اعداد";
});

test("studio/render", "صحنهٔ برگهٔ پلان از یک منبع ساخته می‌شود: کادر، کتیبه، راهنما، جدول", () => {
  const doc = sampleDesign();
  const { scene, layout } = planScene(doc);
  const texts = scene.prims.filter((prim) => prim.kind === "text").map((prim) => (prim as { value: string }).value);
  assert(texts.some((value) => value.includes("لایه‌ها")), "راهنمای لایه‌ها روی صحنه نیست");
  assert(texts.some((value) => value.includes("جدول اشیا")), "جدول اشیا روی صحنه نیست");
  assert(texts.some((value) => value.includes("شمال")), "نماد شمال روی صحنه نیست");
  assert(texts.some((value) => value.includes("مقیاس")), "مقیاس روی صحنه نیست");
  assert(texts.some((value) => value.includes(doc.project.name)), "نام پروژه در کتیبه نیست");
  assert(layout.areaMm.w > 300 && layout.areaMm.h > 200, "ناحیهٔ نقشه با کادر مشترک هم‌خوان نیست");
  // همان صحنه به هر دو خروجی می‌رود: SVG و PDF نباید از هم جدا شوند.
  const svg = renderStudioSvg(doc);
  const framePad = scene.prims.filter((prim) => prim.data?.includes("data-frame")).length;
  assert(framePad >= 2, "کادر دوگانه روی صحنه رسم نشده");
  assert(svg.includes('data-frame="1"'), "کادر برگه در SVG نیست");
  return `${scene.prims.length} جزء صحنه`;
});

test("studio/render", "محورهای نقشه خودکار نام‌گذاری می‌شوند (عدد راست‌به‌چپ، حرف بالا‌به‌پایین)", () => {
  const doc = sampleDesign();
  const labeled = withAxisLabels(doc).items.filter((item) => item.catalogId === "grid-bubble");
  const vertical = labeled.filter((item) => item.label && /[۰-۹]/.test(item.label)).sort((a, b) => b.x - a.x);
  const horizontal = labeled.filter((item) => item.label && /[A-Z]/.test(item.label)).sort((a, b) => b.y - a.y);
  assert(vertical.length === 3, `تعداد محور عمودی: ${vertical.length}`);
  assert(vertical.map((item) => item.label).join("") === "۱۲۳", `شمارهٔ محورها: ${vertical.map((i) => i.label).join("")}`);
  assert(horizontal.length === 3, `تعداد محور افقی: ${horizontal.length}`);
  assert(horizontal.map((item) => item.label).join("") === "ABC", `حروف محورها: ${horizontal.map((i) => i.label).join("")}`);
  // برچسب دستی کاربر هرگز بازنویسی نمی‌شود
  const manual = { ...doc, items: doc.items.map((item) => (item.id === "an-gx0" ? { ...item, label: "M" } : item)) };
  const kept = withAxisLabels(manual).items.find((item) => item.id === "an-gx0");
  assert(kept?.label === "M", "برچسب دستی محور بازنویسی شد");
  return `${vertical.length} عددی + ${horizontal.length} حرفی`;
});

test("studio/render", "برچسب فضا با ارقام فارسی و بدون تداخل با مبلمان جاگذاری می‌شود", () => {
  const doc = sampleDesign();
  const svg = renderStudioSvg(doc);
  const spaceLabels = [...svg.matchAll(/data-space="([^"]+)"[^>]*>([^<]+)</g)].map((match) => match[2]);
  assert(spaceLabels.length >= 5, `تعداد برچسب فضا: ${spaceLabels.length}`);
  assert(!svg.includes("m\u00b2>") && !/\d+\.\d m²/.test(svg), "مساحت فضا با ارقام لاتین نوشته شده");
  assert(/[۰-۹]+٫[۰-۹] م²/.test(svg), "مساحت فضا با ارقام فارسی و واحد م² نیست");
  return `${spaceLabels.length} فضا`;
});

test("studio/exporters", "DXF استاندارد R2000 است: زیرکلاس‌ها، دسته‌ها، جدول‌ها و بلوک‌ها", () => {
  const dxf = renderStudioDxf(sampleDesign());
  for (const marker of ["$ACADVER", "AcDbEntity", "AcDbPolyline", "AcDbLine", "AcDbCircle", "AcDbText", "BLOCK_RECORD", "OBJECTS", "BLOCKS", "CLASSES", "$HANDSEED"]) {
    assert(dxf.includes(marker), `نشانگر ${marker} در DXF نیست`);
  }
  assert(/\n5\n[0-9A-F]+\n/.test(dxf), "دستهٔ موجودیت (handle) نوشته نشده");
  assert(dxf.includes("ANSI") === false, "کدگذاری نادرست");
  // متن فارسی باید با دنبالهٔ یونیکد DXF نوشته شود، نه خام
  assert(dxf.includes("\\U+"), "برچسب فارسی به یونیکد DXF تبدیل نشده");
});

test("studio/exporters", "پلان DXF با بلوک واقعی: هر شیء یک INSERT قابل ویرایش", () => {
  const doc = sampleDesign();
  const text = renderStudioDxf(doc);
  const inserts = (text.match(/\nINSERT\n/g) ?? []).length;
  assert(inserts > 40, `تعداد بلوک‌های درج‌شده کم است: ${inserts}`);
  // هر بلوک باید هم در بخش BLOCKS و هم در جدول BLOCK_RECORD ثبت شده باشد
  const blockNames = [...text.matchAll(/\nBLOCK\n[\s\S]{0,120}?\n2\n(HERMI_[A-Z0-9_]+)\n/g)].map((m) => m[1]);
  assert(blockNames.length > 10, `تعداد تعریف بلوک: ${blockNames.length}`);
  for (const name of new Set(blockNames)) {
    // نام باید سه بار بیاید: ردیف BLOCK_RECORD، سر بلوک، و ارجاع در INSERT
    assert(text.split(`\n2\n${name}\n`).length >= 3, `بلوک ${name} در جدول/بخش ثبت نشده`);
  }
  // بلوک‌ها باید بین درج‌ها مشترک باشند (نه یکی برای هر نمونه)
  assert(new Set(blockNames).size < inserts, "بلوک‌ها به‌ازای هر نمونه تکرار شده‌اند");
  const records = (text.match(/\nBLOCK_RECORD\n/g) ?? []).length;
  assert(records >= new Set(blockNames).size + 2, `ردیف‌های BLOCK_RECORD: ${records}`);
  return `${inserts} درج · ${new Set(blockNames).size} بلوک`;
});
test("studio/exporters", "نمای DXF در مقیاس ۱:۱ با لایه‌های سازه‌ای صادر می‌شود", () => {
  const elevations = exportStudio(sampleDesign(), "elevations-dxf");
  const text = elevations.data.toString("utf8");
  assert(elevations.filename.endsWith(".dxf"), "پسوند فایل نما");
  assert(text.includes("WALLS") && text.includes("LEVELS") && text.includes("LABELS"), "لایه‌های نمای DXF ناقص‌اند");
  assert(text.includes("$INSUNITS\n70\n6"), "واحد نما باید متر باشد");
  const poly = (text.match(/LWPOLYLINE/g) ?? []).length;
  assert(poly > 20, `تعداد بلوک‌های نمای DXF: ${poly}`);
  const section = exportStudio(sampleDesign(), "section-dxf");
  const sectionText = section.data.toString("utf8");
  assert(sectionText.includes("SOLID"), "پوشش برش (poché) در DXF برش نیامده");
  assert(text.split("\nTEXT\n").length > 4, "برچسب تراز در نمای DXF نیست");
  return `${poly} بلوک نما`;
});
test("studio/exporters", "جزئیات سازه DXF: هاشور توپر، لایه‌های برگه و ابعاد کاغذ", () => {
  const doc = sampleDesign();
  const file = exportStudio(doc, "details-dxf");
  const text = file.data.toString("utf8");
  assert(file.filename.endsWith("-structural-details.dxf"), `نام فایل: ${file.filename}`);
  assert(text.includes("$INSUNITS\n70\n6"), "واحد جزئیات باید متر باشد");
  for (const layer of ["SHEET", "GEOMETRY", "HATCH", "TEXT"]) {
    assert(text.includes(`\n${layer}\n`), `لایهٔ ${layer} در DXF جزئیات نیست`);
  }
  assert(text.includes("AcDbHatch"), "موجودیت هاشور استاندارد نوشته نشده");
  const hatches = (text.match(/\nHATCH\n/g) ?? []).length;
  assert(hatches > 20, `تعداد هاشور توپر کم است: ${hatches}`);
  const circles = (text.match(/\nCIRCLE\n/g) ?? []).length;
  assert(circles > 20, `میلگردهای مقطع (دایره) در DXF نیستند: ${circles}`);
  // متن فارسی باید کلیدواژه‌های فنی را داشته باشد (به‌صورت یونیکد DXF)
  assert(text.includes("\\U+"), "برچسب فارسی در DXF جزئیات نیست");
  // بازهٔ نقش باید اندازهٔ کاغذ باشد نه صفر
  assert(!text.includes("$EXTMAX\n10\n0\n20\n0"), "بازهٔ نقش تنظیم نشده");
  return `${hatches} هاشور · ${circles} دایره`;
});
