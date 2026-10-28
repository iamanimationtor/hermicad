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
} from "@/domain/studio/render";
import { sampleDesignItems } from "@/server/designs";

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
  assert(CATALOG.length >= 90, `تعداد اشیا کمتر از انتظار: ${CATALOG.length}`);
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
  assert(text.startsWith("%PDF-1.4"), "سرصفحهٔ PDF");
  assert(text.includes("xref"), "xref ندارد");
  assert(text.includes("%%EOF"), "پایان فایل ندارد");
  assert(/MediaBox \[0 0 [\d.]+ [\d.]+]/.test(text), "MediaBox ندارد");
  const media = /MediaBox \[0 0 ([\d.]+) ([\d.]+)]/.exec(text);
  const widthPt = Number(media?.[1]);
  assert(Math.abs(widthPt - 420 * (72 / 25.4)) < 1, `عرض صفحهٔ A3: ${widthPt}pt`);
  assert(pdf.length > 3000, `حجم PDF کم است: ${pdf.length}`);
  const lineOps = (text.match(/ l\n/g) ?? []).length;
  assert(lineOps >= 20, `تعداد مسیرهای برداری کم است: ${lineOps}`);
  assert(text.includes("BT"), "متن برداری ندارد");
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
