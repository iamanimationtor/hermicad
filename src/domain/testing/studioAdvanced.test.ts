import { assert, test } from "./harness";
import { DESIGN_TEMPLATES, createDesignTemplate } from "../studio/templates";
import { CATALOG_BY_ID } from "../studio/catalog";
import { addItem, createStudioDocument, documentFingerprint, validateDocument } from "../studio/document";
import { floorHeight, itemVertical, parameterErrors } from "../studio/parameters";
import { studioSchedules } from "../studio/schedules";
import { studioIfc } from "../studio/exporters";
import { studioItemsCsv, exportStudio } from "../studio/render";
import { viewGeometry } from "../studio/vertical";
import { ifcGuid, stepText } from "../exporters/step";
for (const template of DESIGN_TEMPLATES)
  test("studio/templates", `الگوی ${template.label}: اشیای معتبر، فضاهای مجزا و خروجی`, () => {
    const doc = createDesignTemplate(template.id);
    assert(
      validateDocument(doc).every((i) => i.severity !== "error"),
      "سند نامعتبر",
    );
    const spaces = doc.items.filter((i) => i.catalogId === "space-room");
    assert(spaces.length === 7, "شش اتاق و راهرو لازم است");
    for (const a of spaces)
      for (const b of spaces)
        if (a.id !== b.id)
          assert(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 || Math.abs(a.y - b.y) >= (a.d + b.d) / 2, "فضاها هم‌پوشانی دارند");
    for (const item of doc.items) {
      assert(!!CATALOG_BY_ID[item.catalogId], "کد ناشناخته");
      if (["furniture", "education", "healthcare", "sanitary"].includes(CATALOG_BY_ID[item.catalogId].category)) {
        const radians = (item.rotationDeg * Math.PI) / 180;
        const w = Math.abs(item.w * Math.cos(radians)) + Math.abs(item.d * Math.sin(radians)),
          d = Math.abs(item.w * Math.sin(radians)) + Math.abs(item.d * Math.cos(radians));
        assert(
          spaces.some((s) => Math.abs(item.x - s.x) + w / 2 <= s.w / 2 + 0.01 && Math.abs(item.y - s.y) + d / 2 <= s.d / 2 + 0.01),
          `شیء خارج از اتاق: ${item.catalogId}`,
        );
      }
    }
    for (const format of ["svg", "pdf", "dxf", "ifc", "xlsx"] as const) assert(exportStudio(doc, format).data.length > 100, format);
    assert(
      studioSchedules(doc).walls.every((w) => w.openingArea === 0),
      "از قطعه‌های جداشده کنار بازشو نباید دوباره سطح کسر شود",
    );
  });
test("studio/parameters", "ارتفاع و کف‌نشیمن در جدول، نما، CSV و IFC از یک مدل می‌آید", () => {
  let doc = createStudioDocument({ levels: 2, floorHeightM: 4 });
  doc = addItem(doc, "window", { x: 0, y: 0 }, { heightM: 1.7, sillM: 0.5, level: 1, label: "پنجرهٔ آزمون" });
  const item = doc.items[0];
  assert(floorHeight(doc) === 4 && itemVertical(item, doc).height === 1.7, "پارامترها");
  const opening = studioSchedules(doc).openings[0];
  assert(opening.height === 1.7 && opening.sill === 0.5, "جدول");
  const block = viewGeometry(doc, { direction: "south" }, { x: 0, y: 0, w: 180, h: 100 }).blocks.find((b) => b.kind === "opening");
  assert(block?.y0 === 4.5 && Math.abs(block.y1 - 6.2) < 1e-9, "تراز نما");
  assert(studioItemsCsv(doc).includes("1.7,0.5"), "CSV");
  assert(studioIfc(doc).includes("1.700000"), "ارتفاع IFC");
  assert(documentFingerprint(doc) !== documentFingerprint({ ...doc, floorHeightM: 3.5 }), "اثر انگشت طبقه");
  assert(documentFingerprint(doc) !== documentFingerprint({ ...doc, items: [{ ...item, heightM: 1.8 }] }), "اثر انگشت شیء");
});
test("studio/parameters", "پارامتر نامعتبر در ذخیره/خروجی قابل تشخیص است", () => {
  let doc = addItem(createStudioDocument(), "window", { x: 0, y: 0 }, { heightM: 3, sillM: 1 });
  assert(parameterErrors(doc).length > 0, "تاج بالاتر از طبقه");
  let rejected = false;
  try {
    exportStudio(doc, "ifc");
  } catch {
    rejected = true;
  }
  assert(rejected, "خروجی نامعتبر باید متوقف شود");
  doc = { ...doc, items: [{ ...doc.items[0], heightM: NaN }] };
  assert(parameterErrors(doc).length > 0, "NaN");
  assert(parameterErrors({ ...doc, items: [], floorHeightM: 1 }).length > 0, "ارتفاع طبقه");
});
test("studio/parameters", "جدول ابعاد متفاوت را ادغام نمی‌کند", () => {
  let doc = createStudioDocument();
  for (const sillM of [0.5, 0.9]) doc = addItem(doc, "window", { x: 0, y: 0 }, { sillM });
  for (const heightM of [2.8, 3.2]) doc = addItem(doc, "wall-exterior", { x: 0, y: 0 }, { heightM });
  const tables = studioSchedules(doc);
  assert(tables.openings.length === 2 && tables.walls.length === 2, "ارتفاع/کف‌نشیمن متفاوت نباید یک ردیف شود");
});
test("studio/ifc", "GUID استاندارد، متن فارسی و جانمایی سه‌بعدی", () => {
  for (let i = 0; i < 100; i++) assert(/^[0-3][0-9A-Za-z_$]{21}$/.test(ifcGuid(String(i))), "شناسه ۱۲۸ بیتی");
  assert(stepText("الف'\\").includes("''"), "نقل‌قول");
  assert(stepText("الف").includes("\\X4\\"), "فارسی");
  const ifc = studioIfc(createDesignTemplate("office"));
  assert(!ifc.includes("##"), "ارجاع دوبل");
  assert(ifc.includes("IFCRELAGGREGATES("), "ساختار فضایی");
  assert(!ifc.includes("IFCAXIS2PLACEMENT2D("), "جانمایی محصول باید سه‌بعدی باشد");
});

test("studio/input", "مرز JSON: شیء null، شناسه تکراری، ابعاد نامعتبر و طبقات افراطی رد می‌شوند", () => {
  const doc = createDesignTemplate("clinic");
  assertStudioDocument(doc);
  const invalid: unknown[] = [
    null,
    { ...doc, levels: 100000 },
    { ...doc, items: [null] },
    { ...doc, items: [doc.items[0], doc.items[0]] },
    { ...doc, items: [{ ...doc.items[0], w: 0 }] },
    { ...doc, sheet: { ...doc.sheet, scale: 0 } },
    { ...doc, items: [{ ...doc.items[0], catalogId: "__proto__" }] },
  ];
  for (const value of invalid) {
    let rejected = false;
    try {
      assertStudioDocument(value);
    } catch {
      rejected = true;
    }
    assert(rejected, "ورودی خراب نباید پذیرفته شود");
  }
});

import { assertStudioDocument } from "../studio/input";

test("studio/parameters", "عمق پی در برش و مدل IFC منفی و برابر ارتفاع واقعی است", () => {
  const doc = addItem(createStudioDocument(), "footing-isolated", { x: 0, y: 0 }, { heightM: 0.8 });
  const block = viewGeometry(doc, { direction: "south", sectionAt: 0 }, { x: 0, y: 0, w: 180, h: 100 }).blocks.find(
    (b) => b.layer === "foundation",
  );
  assert(block?.y0 === -0.8 && block.y1 === 0, "عمق پی نباید دوبرابر یا بالای تراز باشد");
  assert(studioIfc(doc).includes("-0.800000"), "تراز منفی پی در IFC");
});
