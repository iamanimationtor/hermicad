/**
 * HERMICAD Studio — خروجی‌های صنعتی (XLSX و IFC4)
 *
 * چرا جدا از render.ts: render.ts فقط نقشه می‌سازد (SVG/PDF/DXF/CSV). این فایل
 * داده‌های «قابل تحویل به دفتر فنی و نرم‌افزار مدل‌سازی» را تولید می‌کند:
 *
 *  - XLSX: متره و برآورد + جدول درها و پنجره‌ها + فضاها + جدول اشیا + کنترل کیفیت.
 *    دقیقاً همان کاربرگی که در دفاتر ایرانی برای برآورد و صورت‌وضعیت استفاده می‌شود.
 *  - IFC4: مدل استاندارد برای انتقال به Revit/ArchiCAD/IFC.js. هر شیء یک
 *    IfcBuildingElementProxy با IfcClass کتابخانه و هندسهٔ واقعی مستطیلی است و
 *    فضاها IfcSpace هستند.
 *
 * هیچ کتابخانهٔ بیرونی استفاده نمی‌شود؛ ZIP و IFC هر دو بومی هستند.
 */

import { CATALOG_BY_ID, STUDIO_LAYERS } from "./catalog";
import {
  CLASSIFICATION_LABELS,
  documentFingerprint,
  renderableItems,
  schedule,
  validateDocument,
  type StudioDocument,
  type StudioItem,
} from "./document";
import { ifcGuid, sheetXml, zipStore } from "@/domain/exporters/reports";
import { rebarSchedule } from "./details";

const layerLabel = (id: string): string => STUDIO_LAYERS.find((layer) => layer.id === id)?.label ?? id;

const classificationLabel = (id: StudioDocument["classification"]): string =>
  CLASSIFICATION_LABELS.find((entry) => entry.id === id)?.label ?? id;

const round = (value: number, digits = 2): number => Number(value.toFixed(digits));

/* ───────────────────────────────── XLSX ───────────────────────────────── */

interface StudioWorkbookOptions {
  /** ضریب پرت/افت مصالح برای متره (پیش‌فرض ۵٪) */
  waste?: number;
  /** بهای واحد بر حسب میلیون ریال؛ اگر داده شود ستون بهای کل محاسبه می‌شود */
  unitPrices?: Record<string, number>;
}

const HEADERS = {
  schedule: ["ردیف", "کد کتابخانه", "شرح", "دسته", "رشته", "IFC", "تعداد", "مساحت واحد (م²)", "مساحت کل (م²)", "محیط (م)", "حجم تقریبی (م³)"],
  opening: ["ردیف", "شناسه", "نوع", "عرض (م)", "ارتفاع (م)", "طبقه", "چرخش (°)"],
  space: ["شناسه", "نام فضا", "مساحت (م²)", "طبقه", "مختصات مرکز"],
  items: ["شناسه", "کد کتابخانه", "نام", "دسته", "رشته", "لایه", "طبقه", "x (م)", "y (م)", "عرض (م)", "عمق (م)", "چرخش (°)"],
  issues: ["کد", "شدت", "پیام", "شناسهٔ شیء"],
  rebar: ["ردیف", "عضو", "قطر (mm)", "تعداد", "طول هر شاخه (m)", "طول کل (m)", "وزن (kg)", "شرح"],
};

/** تبدیل عدد به حروف فارسی برای مبالغ و متراژها (کاربرگ‌های رسمی). */
export function toPersianWords(value: number): string {
  const ones = ["صفر", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
  const teens = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
  const tens = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
  const hundreds = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
  const scales = ["", " هزار", " میلیون", " میلیارد"];

  const threeDigits = (num: number): string => {
    const parts: string[] = [];
    const hundred = Math.floor(num / 100);
    const rest = num % 100;
    if (hundred) parts.push(hundreds[hundred]);
    if (rest >= 10 && rest < 20) parts.push(teens[rest - 10]);
    else {
      const ten = Math.floor(rest / 10);
      const one = rest % 10;
      if (ten) parts.push(tens[ten]);
      if (one) parts.push(ones[one]);
    }
    return parts.join(" و ");
  };

  let remaining = Math.floor(Math.abs(value));
  if (remaining === 0) return ones[0];
  const groups: string[] = [];
  let scale = 0;
  while (remaining > 0 && scale < scales.length) {
    const chunk = remaining % 1000;
    if (chunk) groups.unshift(`${threeDigits(chunk)}${scales[scale]}`);
    remaining = Math.floor(remaining / 1000);
    scale += 1;
  }
  const fraction = Math.round((Math.abs(value) - Math.floor(Math.abs(value))) * 100);
  const head = groups.join(" و ");
  return fraction > 0 ? `${head} و ${threeDigits(fraction)} صدم` : head;
}

export function studioXlsx(doc: StudioDocument, options: StudioWorkbookOptions = {}): Uint8Array {
  const waste = options.waste ?? 0.05;
  const rows = schedule(doc);
  const visible = renderableItems(doc);
  const issues = validateDocument(doc);
  const spaces = doc.items.filter((item) => item.catalogId.startsWith("space-"));
  const openings = doc.items.filter((item) => ["door-single", "door-double", "window", "door-garage"].includes(item.catalogId));

  const scheduleRows: (string | number)[][] = [
    ["HERMICAD Studio — متره و برآورد", doc.name],
    ["کد نقشه", doc.project.code, "ویرایش", doc.revision, "اثر انگشت", documentFingerprint(doc)],
    ["تاریخ", doc.project.date, "برگه", `${doc.sheet.format} · 1:${doc.sheet.scale}`, "طبقات", doc.levels],
    ["خروجی ماشینی است؛ پیش از برآورد نهایی باید توسط مهندس متره کنترل شود.", "", "", "", "", "", "", "", "", "", ""],
    [],
    HEADERS.schedule,
  ];
  rows.forEach((row, index) => {
    const definition = CATALOG_BY_ID[row.catalogId];
    // محیط تقریبی از نمونهٔ اول همان کالا در سند (برای مترهٔ دیوار و کف‌سازی)
    const sample = doc.items.find((item) => item.catalogId === row.catalogId);
    const perimeter = sample ? 2 * (sample.w + sample.d) : 0;
    const height = definition?.defaultSize.h ?? 0;
    scheduleRows.push([
      index + 1,
      row.catalogId,
      row.nameFa,
      row.category,
      row.discipline,
      row.ifcClass,
      row.count,
      round(row.areaM2, 3),
      round(row.totalAreaM2 * (1 + waste), 3),
      round(perimeter * row.count, 2),
      round(row.totalAreaM2 * height, 3),
    ]);
  });
  const totalArea = rows.reduce((sum, row) => sum + row.totalAreaM2, 0);
  scheduleRows.push([]);
  scheduleRows.push(["جمع", "", "", "", "", "", rows.reduce((sum, row) => sum + row.count, 0), "", round(totalArea * (1 + waste), 3), "", ""]);
  scheduleRows.push(["جمع به حروف (متر مربع)", toPersianWords(round(totalArea * (1 + waste), 2))]);
  scheduleRows.push(["ضریب پرت اعمال‌شده", waste]);
  if (options.unitPrices) {
    scheduleRows.push([]);
    scheduleRows.push(["کد", "بهای واحد (میلیون ریال)", "بهای کل (میلیون ریال)"]);
    let total = 0;
    for (const row of rows) {
      const price = options.unitPrices[row.catalogId];
      if (price == null) continue;
      const cost = price * row.count;
      total += cost;
      scheduleRows.push([row.catalogId, price, round(cost, 3)]);
    }
    scheduleRows.push(["جمع برآورد", "", round(total, 3)]);
  }

  const openingRows: (string | number)[][] = [HEADERS.opening, ...openings.map((item, index) => [index + 1, item.id, CATALOG_BY_ID[item.catalogId]?.nameFa ?? item.catalogId, round(item.w, 3), round(CATALOG_BY_ID[item.catalogId]?.defaultSize.h ?? 0, 3), item.level + 1, round(item.rotationDeg, 1)])];
  const spaceRows: (string | number)[][] = [
    HEADERS.space,
    ...spaces.map((item) => [item.id, item.label ?? "فضا", round(item.w * item.d, 2), item.level + 1, `x=${round(item.x, 2)} , y=${round(item.y, 2)}`]),
  ];
  const spaceTotal = spaces.reduce((sum, item) => sum + item.w * item.d, 0);
  spaceRows.push(["جمع", `${spaces.length} فضا`, round(spaceTotal, 2), "", ""]);

  const itemRows: (string | number)[][] = [
    HEADERS.items,
    ...doc.items.map((item) => {
      const definition = CATALOG_BY_ID[item.catalogId];
      return [
        item.id,
        item.catalogId,
        definition?.nameFa ?? item.catalogId,
        definition?.category ?? "",
        definition?.discipline ?? "",
        definition ? layerLabel(definition.layer) : "",
        item.level + 1,
        round(item.x, 3),
        round(item.y, 3),
        round(item.w, 3),
        round(item.d, 3),
        round(item.rotationDeg, 1),
      ];
    }),
  ];

  const issueRows: (string | number)[][] = [
    HEADERS.issues,
    ...issues.map((issue) => [issue.code, issue.severity, issue.message, (issue.itemIds ?? []).join(", ")]),
    [],
    ["وضعیت", issues.length === 0 ? "بدون ایراد" : `${issues.length} ایراد`],
    ["نمایش‌داده‌شده روی برگه", visible.length],
    ["کل اشیای سند", doc.items.length],
    ["طبقه‌بندی", classificationLabel(doc.classification)],
  ];

  // برگهٔ میلگرد: برای برآورد و سفارش آرماتور
  const rebar = rebarSchedule(doc);
  const rebarRows: (string | number)[][] = [
    ["HERMICAD Studio — جدول میلگرد"],
    ["کد نقشه", doc.project.code, "ویرایش", doc.revision],
    ["محاسبه بر پایهٔ مدل پلان است؛ کنترل نهایی با مهندس دارای صلاحیت.", "", ""],
    [],
    HEADERS.rebar,
    ...rebar.rows.map((row, index) => [
      index + 1,
      row.member,
      row.diameterMm,
      row.count,
      row.lengthM,
      row.totalLengthM,
      row.weightKg,
      row.note,
    ]),
    [],
    ["جمع وزن (kg)", round(rebar.totalWeightKg * 1.05, 1), "با ۵٪ پرت"],
    ...rebar.notes.map((note) => [note]),
  ];

  const sheets = [
    { name: "متره", rows: scheduleRows },
    { name: "میلگرد", rows: rebarRows },
    { name: "در و پنجره", rows: openingRows },
    { name: "فضاها", rows: spaceRows },
    { name: "اشیاء", rows: itemRows },
    { name: "کنترل", rows: issueRows },
  ];

  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const files = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets
          .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
          .map((sheet, index) => `<sheet name="${escape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
          .join("")}</sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
          .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
          .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/styles.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`,
      ),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: Buffer.from(sheetXml(sheet.rows)),
    })),
  ];

  return new Uint8Array(zipStore(files));
}

/* ───────────────────────────────── IFC4 ───────────────────────────────── */

function rectSolid(
  item: StudioItem,
  height: number,
): { points: { x: number; y: number }[] } {
  const radians = (-item.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const hw = item.w / 2;
  const hd = item.d / 2;
  const rotate = (lx: number, ly: number) => ({
    x: item.x + (lx * cos - ly * sin),
    y: item.y + (lx * sin + ly * cos),
  });
  void height;
  return { points: [rotate(-hw, -hd), rotate(hw, -hd), rotate(hw, hd), rotate(-hw, hd)] };
}

/** نام لاتین قابل استفاده در IFC؛ اگر حروف لاتین باقی نماند، عنوان پیش‌فرض. */
function latinName(value: string, fallback: string): string {
  const cleaned = value.replace(/[^\x20-\x7E]/g, "").replace(/[()\-—]/g, " ").trim();
  return /[A-Za-z]/.test(cleaned) ? cleaned : fallback;
}

export function studioIfc(doc: StudioDocument): string {
  const lines: string[] = [];
  let id = 1;
  const next = () => id++;
  const F = (value: number) => (Number.isFinite(value) ? value.toFixed(3) : "0.000");

  lines.push("ISO-10303-21;", "HEADER;");
  lines.push("FILE_DESCRIPTION(('ViewDefinition [CoordinationView]','HERMICAD Studio IFC4: spaces + building element proxies'),'2;1');");
  lines.push(`FILE_NAME('${doc.project.code || doc.id}.ifc','${new Date(doc.updatedAt).toISOString()}',('HERMICAD'),('HERMICAD'),'hermicad-studio/1.0','HERMICAD','');`);
  lines.push("FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;");

  const person = next();
  const organization = next();
  const personOrg = next();
  const owner = next();
  const origin = next();
  const zDir = next();
  const axis = next();
  const context = next();
  const lengthUnit = next();
  const areaUnit = next();
  const units = next();
  lines.push(`#${person}=IFCPERSON($,$,'HERMICAD',$,$,$,$,$);`);
  lines.push(`#${organization}=IFCORGANIZATION($,'HERMICAD',$,$,$);`);
  lines.push(`#${personOrg}=IFCPERSONANDORGANIZATION(#${person},#${organization},$);`);
  lines.push(`#${owner}=IFCOWNERHISTORY(#${personOrg},$,$,.ADDED.,$,$,$,0);`);
  lines.push(`#${origin}=IFCCARTESIANPOINT((0.,0.,0.));`);
  lines.push(`#${zDir}=IFCDIRECTION((0.,0.,1.));`);
  lines.push(`#${axis}=IFCAXIS2PLACEMENT3D(#${origin},#${zDir},$);`);
  lines.push(`#${context}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${axis},$);`);
  lines.push(`#${lengthUnit}=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);`);
  lines.push(`#${areaUnit}=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);`);
  lines.push(`#${units}=IFCUNITASSIGNMENT((#${lengthUnit},#${areaUnit}));`);
  const projectPlacement = next();
  const project = next();
  const sitePlacement = next();
  const site = next();
  const buildingPlacement = next();
  const building = next();
  lines.push(`#${projectPlacement}=IFCAXIS2PLACEMENT3D(#${origin},#${zDir},$);`);
  lines.push(
    `#${project}=IFCPROJECT(${ifcGuid("studio-project" + doc.id)},$,'${doc.project.code || "HERMICAD"}','${latinName(doc.name, "HERMICAD STUDIO MODEL")}','IFC4',#${projectPlacement},(#${context}),#${units});`,
  );
  lines.push(`#${sitePlacement}=IFCLOCALPLACEMENT($,#${axis});`);
  lines.push(`#${site}=IFCSITE(${ifcGuid("studio-site" + doc.id)},$,'Site','Parcel',$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$);`);
  lines.push(`#${buildingPlacement}=IFCLOCALPLACEMENT(#${sitePlacement},#${axis});`);
  lines.push(`#${building}=IFCBUILDING(${ifcGuid("studio-building" + doc.id)},$,'Building','Building',$,#${buildingPlacement},$,$,.ELEMENT.,$,$,$);`);

  const storeyIds: number[] = [];
  for (let level = 0; level < doc.levels; level += 1) {
    const placement = next();
    const storey = next();
    lines.push(`#${placement}=IFCLOCALPLACEMENT(#${buildingPlacement},#${axis});`);
    lines.push(
      `#${storey}=IFCBUILDINGSTOREY(${ifcGuid(`studio-storey-${level}`)},$,'Level ${level + 1}','Level ${level + 1}',$,#${placement},$,$,.ELEMENT.,${F(level * 3.2)});`,
    );
    storeyIds.push(storey);
  }

  const productsByStorey = new Map<number, number[]>();
  for (const item of doc.items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    if (!definition) continue;
    const height = definition.defaultSize.h || 0.1;
    const isSpace = definition.ifcClass === "IfcSpace";
    const storeyId = storeyIds[Math.min(item.level, storeyIds.length - 1)];
    const { points } = rectSolid(item, height);
    const ox = Math.min(...points.map((point) => point.x));
    const oy = Math.min(...points.map((point) => point.y));
    const pointIds = points.map((point) => {
      const pointId = next();
      lines.push(`#${pointId}=IFCCARTESIANPOINT((${F(point.x - ox)},${F(point.y - oy)}));`);
      return pointId;
    });
    const listId = next();
    lines.push(`#${listId}=IFCCARTESIANPOINTLIST2D((${pointIds.map((pointId) => `#${pointId}`).join(",")}),$);`);
    const curveId = next();
    lines.push(`#${curveId}=IFCINDEXEDPOLYCURVE(#${listId},$,$);`);
    const profileId = next();
    lines.push(`#${profileId}=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'${item.catalogId.replace(/[^\w-]/g, "_")}',#${curveId});`);
    const solidAxis = next();
    lines.push(`#${solidAxis}=IFCAXIS2PLACEMENT3D(#${origin},#${zDir},$);`);
    const solid = next();
    lines.push(`#${solid}=IFCEXTRUDEDAREASOLID(#${profileId},#${solidAxis},#${zDir},${F(height)});`);
    const shape = next();
    lines.push(`#${shape}=IFCSHAPEREPRESENTATION(#${context},'Body','SweptSolid',(#${solid}));`);
    const productShape = next();
    lines.push(`#${productShape}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shape}));`);
    const localPlacement = next();
    lines.push(`#${localPlacement}=IFCLOCALPLACEMENT(#${storeyIds[Math.min(item.level, storeyIds.length - 1)]},#${axis});`);
    const placementPoint = next();
    lines.push(`#${placementPoint}=IFCCARTESIANPOINT((${F(ox)},${F(oy)}));`);
    const placementAxis = next();
    lines.push(`#${placementAxis}=IFCAXIS2PLACEMENT2D(#${placementPoint},$);`);
    const productPlacement = next();
    lines.push(`#${productPlacement}=IFCLOCALPLACEMENT(#${localPlacement},#${placementAxis});`);
    const product = next();
    if (isSpace) {
      lines.push(
        `#${product}=IFCSPACE(${ifcGuid("studio-item" + item.id)},#${owner},'${item.label?.replace(/[^\x20-\x7E]/g, "") || "SPACE"}','${item.catalogId}',$,#${productPlacement},#${productShape},$,.ELEMENT.,.INTERNAL.,$);`,
      );
    } else {
      lines.push(
        `#${product}=IFCBUILDINGELEMENTPROXY(${ifcGuid("studio-item" + item.id)},#${owner},'${definition.nameEn.replace(/[^\x20-\x7E]/g, "").trim() || item.catalogId}','${definition.ifcClass}',$,#${productPlacement},#${productShape},$,$);`,
      );
    }
    const list = productsByStorey.get(storeyId) ?? [];
    list.push(product);
    productsByStorey.set(storeyId, list);
  }

  for (const [storeyId, products] of productsByStorey) {
    const relation = next();
    lines.push(
      `#${relation}=IFCRELCONTAINEDINSPATIALSTRUCTURE(${ifcGuid(`studio-contain-${storeyId}`)},#${owner},$,$,(${products.map((product) => `#${product}`).join(",")}),#${storeyId});`,
    );
  }
  lines.push("ENDSEC;", "END-ISO-10303-21;");
  return lines.join("\n");
}
