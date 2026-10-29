import { stepText } from "@/domain/exporters/step";
import { itemVertical, isOpening, floorHeight } from "./parameters";
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
  schedule: [
    "ردیف",
    "کد کتابخانه",
    "شرح",
    "دسته",
    "رشته",
    "IFC",
    "تعداد",
    "مساحت واحد (م²)",
    "مساحت کل (م²)",
    "محیط (م)",
    "حجم تقریبی (م³)",
  ],
  opening: ["ردیف", "شناسه", "نوع", "عرض (م)", "ارتفاع (م)", "طبقه", "چرخش (°)", "ارتفاع کف‌نشیمن (م)"],
  space: ["شناسه", "نام فضا", "مساحت (م²)", "طبقه", "مختصات مرکز"],
  items: [
    "شناسه",
    "کد کتابخانه",
    "نام",
    "دسته",
    "رشته",
    "لایه",
    "طبقه",
    "x (م)",
    "y (م)",
    "عرض (م)",
    "عمق (م)",
    "چرخش (°)",
    "ارتفاع (م)",
    "کف‌نشیمن (م)",
  ],
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
  const openings = doc.items.filter(isOpening);

  const scheduleRows: (string | number)[][] = [
    ["HERMICAD Studio — متره و برآورد", doc.name],
    ["کد نقشه", doc.project.code, "ویرایش", doc.revision, "اثر انگشت", documentFingerprint(doc)],
    ["تاریخ", doc.project.date, "برگه", `${doc.sheet.format} · 1:${doc.sheet.scale}`, "طبقات", doc.levels],
    ["خروجی ماشینی است؛ پیش از برآورد نهایی باید توسط مهندس متره کنترل شود.", "", "", "", "", "", "", "", "", "", ""],
    [],
    HEADERS.schedule,
  ];
  rows.forEach((row, index) => {
    // محیط تقریبی از نمونهٔ اول همان کالا در سند (برای مترهٔ دیوار و کف‌سازی)
    const sample = doc.items.find((item) => item.catalogId === row.catalogId);
    const perimeter = sample ? 2 * (sample.w + sample.d) : 0;
    const group = doc.items.filter((item) => item.catalogId === row.catalogId);
    const volume = group.reduce((sum, item) => sum + item.w * item.d * itemVertical(item, doc).height, 0);
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
      round(volume, 3),
    ]);
  });
  const totalArea = rows.reduce((sum, row) => sum + row.totalAreaM2, 0);
  scheduleRows.push([]);
  scheduleRows.push([
    "جمع",
    "",
    "",
    "",
    "",
    "",
    rows.reduce((sum, row) => sum + row.count, 0),
    "",
    round(totalArea * (1 + waste), 3),
    "",
    "",
  ]);
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

  const openingRows: (string | number)[][] = [
    HEADERS.opening,
    ...openings.map((item, index) => [
      index + 1,
      item.id,
      CATALOG_BY_ID[item.catalogId]?.nameFa ?? item.catalogId,
      round(item.w, 3),
      round(itemVertical(item, doc).height, 3),
      item.level + 1,
      round(item.rotationDeg, 1),
      round(itemVertical(item, doc).sill, 3),
    ]),
  ];
  const spaceRows: (string | number)[][] = [
    HEADERS.space,
    ...spaces.map((item) => [
      item.id,
      item.label ?? "فضا",
      round(item.w * item.d, 2),
      item.level + 1,
      `x=${round(item.x, 2)} , y=${round(item.y, 2)}`,
    ]),
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
        round(itemVertical(item, doc).height, 3),
        round(itemVertical(item, doc).sill, 3),
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
          .map(
            (_, index) =>
              `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join(
            "",
          )}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
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
          .map(
            (_, index) =>
              `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
          )
          .join(
            "",
          )}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
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

/**
 * نگاشت کلاس کتابخانه به موجودیت IFC4.
 *
 * چرا: اگر همهٔ اشیا IfcBuildingElementProxy باشند، BIM ناظر نمی‌تواند «همهٔ
 * ستون‌ها» یا «همهٔ دیوارهای برشی» را فیلتر کند و جدول مصالح بی‌معنا می‌شود.
 *
 * `trailing` تعداد `$` اضافی است که هر موجودیت بعد از ریپریزنتیشن لازم دارد
 * (PredefinedType و در درب/پنجره OverallHeight/OverallWidth/OperationType).
 */
const IFC_ENTITY_BY_CLASS: Record<string, { entity: string; trailing: string }> = {
  IfcWall: { entity: "IFCWALL", trailing: ",.STANDARD." },
  IfcWallStandardCase: { entity: "IFCWALL", trailing: ",.STANDARD." },
  IfcSlab: { entity: "IFCSLAB", trailing: ",.FLOOR." },
  IfcColumn: { entity: "IFCCOLUMN", trailing: ",.COLUMN." },
  IfcBeam: { entity: "IFCBEAM", trailing: ",.BEAM." },
  IfcMember: { entity: "IFCMEMBER", trailing: ",.BRACE." },
  IfcCovering: { entity: "IFCCOVERING", trailing: ",.FLOORING." },
  IfcStair: { entity: "IFCSTAIR", trailing: ",.STRAIGHT_RUN_STAIR." },
  IfcRamp: { entity: "IFCRAMP", trailing: ",.STRAIGHT_RUN_RAMP." },
  IfcFurniture: { entity: "IFCFURNITURE", trailing: ",.NOTDEFINED." },
  IfcFurnishingElement: { entity: "IFCFURNITURE", trailing: ",.NOTDEFINED." },
  IfcSanitaryTerminal: { entity: "IFCSANITARYTERMINAL", trailing: ",.NOTDEFINED." },
  // درب/پنجره: Tag، ارتفاع، عرض، نوع، نحوهٔ بازشو، فیلد آزاد
  IfcDoor: { entity: "IFCDOOR", trailing: ",$,$,.DOOR.,.SINGLE_SWING_LEFT.,$" },
  IfcWindow: { entity: "IFCWINDOW", trailing: ",$,$,.WINDOW.,.SINGLE_PANEL.,$" },
};

/** IFC4 حجمی: زنجیرهٔ جانمایی سه‌بعدی و ساختار فضایی معتبر؛ نه مدل اتصال اجرایی. */
export function studioIfc(doc: StudioDocument): string {
  const lines: string[] = [];
  let sequence = 0;
  const entity = (type: string, args: string): number => {
    const id = ++sequence;
    lines.push(`#${id}=${type}(${args});`);
    return id;
  };
  const ref = (id: number) => `#${id}`;
  const F = (value: number) => value.toFixed(6);
  const guid = (key: string) => stepText(ifcGuid(doc.id + ":" + key));
  const origin = entity("IFCCARTESIANPOINT", "(0.,0.,0.)");
  const z = entity("IFCDIRECTION", "(0.,0.,1.)");
  const axis = entity("IFCAXIS2PLACEMENT3D", `#${origin},$,$`);
  const context = entity("IFCGEOMETRICREPRESENTATIONCONTEXT", `$,'Model',3,1.E-05,#${axis},$`);
  const metre = entity("IFCSIUNIT", "*,.LENGTHUNIT.,$,.METRE.");
  const area = entity("IFCSIUNIT", "*,.AREAUNIT.,$,.SQUARE_METRE.");
  const units = entity("IFCUNITASSIGNMENT", `(#${metre},#${area})`);
  const person = entity("IFCPERSON", "$,$,'HERMICAD',$,$,$,$,$");
  const org = entity("IFCORGANIZATION", "$,'HERMICAD',$,$,$");
  const user = entity("IFCPERSONANDORGANIZATION", `#${person},#${org},$`);
  const app = entity("IFCAPPLICATION", `#${org},'1.0','HERMICAD','HERMICAD'`);
  const owner = entity("IFCOWNERHISTORY", `#${user},#${app},$,.ADDED.,0,$,$,0`);
  const placement = (parent: number | null, x: number, y: number, elevation: number, rotation = 0) => {
    const point = entity("IFCCARTESIANPOINT", `(${F(x)},${F(y)},${F(elevation)})`);
    const angle = (-rotation * Math.PI) / 180;
    const direction = entity("IFCDIRECTION", `(${F(Math.cos(angle))},${F(Math.sin(angle))},0.)`);
    const localAxis = entity("IFCAXIS2PLACEMENT3D", `#${point},#${z},#${direction}`);
    return entity("IFCLOCALPLACEMENT", `${parent ? ref(parent) : "$"},#${localAxis}`);
  };
  const project = entity(
    "IFCPROJECT",
    `${guid("project")},#${owner},${stepText(doc.project.code)},${stepText(doc.project.name)},$,$,$,(#${context}),#${units}`,
  );
  const sitePlacement = placement(null, 0, 0, 0);
  const site = entity("IFCSITE", `${guid("site")},#${owner},'Site',$,$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$`);
  const buildingPlacement = placement(sitePlacement, 0, 0, 0);
  const building = entity(
    "IFCBUILDING",
    `${guid("building")},#${owner},${stepText(doc.name)},$,$,#${buildingPlacement},$,$,.ELEMENT.,$,$,$`,
  );
  const aggregate = (key: string, parent: number, children: number[]) => {
    if (children.length) entity("IFCRELAGGREGATES", `${guid(key)},#${owner},$,$,#${parent},(${children.map(ref).join(",")})`);
  };
  aggregate("project-site", project, [site]);
  aggregate("site-building", site, [building]);
  const storeys: { id: number; placement: number; spaces: number[]; products: number[] }[] = [];
  for (let level = 0; level < doc.levels; level++) {
    const at = placement(buildingPlacement, 0, 0, level * floorHeight(doc));
    const id = entity(
      "IFCBUILDINGSTOREY",
      `${guid("storey-" + level)},#${owner},${stepText(`طبقه ${level + 1}`)},$,$,#${at},$,$,.ELEMENT.,${F(level * floorHeight(doc))}`,
    );
    storeys.push({ id, placement: at, spaces: [], products: [] });
  }
  aggregate(
    "building-storeys",
    building,
    storeys.map((s) => s.id),
  );
  for (const item of doc.items) {
    const definition = CATALOG_BY_ID[item.catalogId];
    const storey = storeys[item.level];
    if (!definition || !storey) continue;
    const { height, sill } = itemVertical(item, doc);
    let shape: number;
    if (height <= 0) {
      const points = [
        [-item.w / 2, -item.d / 2],
        [item.w / 2, -item.d / 2],
        [item.w / 2, item.d / 2],
        [-item.w / 2, item.d / 2],
      ].map(([x, y]) => entity("IFCCARTESIANPOINT", `(${F(x)},${F(y)},0.)`));
      const curve = entity("IFCPOLYLINE", `(${[...points, points[0]].map(ref).join(",")})`);
      const curves = entity("IFCGEOMETRICCURVESET", `(#${curve})`);
      shape = entity("IFCSHAPEREPRESENTATION", `#${context},'FootPrint','GeometricCurveSet',(#${curves})`);
    } else {
      const profile =
        item.catalogId === "column-round" || item.catalogId === "pile"
          ? entity("IFCCIRCLEPROFILEDEF", `.AREA.,$,$,${F(Math.min(item.w, item.d) / 2)}`)
          : entity("IFCRECTANGLEPROFILEDEF", `.AREA.,$,$,${F(item.w)},${F(item.d)}`);
      const solid = entity("IFCEXTRUDEDAREASOLID", `#${profile},#${axis},#${z},${F(height)}`);
      shape = entity("IFCSHAPEREPRESENTATION", `#${context},'Body','SweptSolid',(#${solid})`);
    }
    const representation = entity("IFCPRODUCTDEFINITIONSHAPE", `$,$,(#${shape})`);
    const at = placement(storey.placement, item.x, item.y, definition.category === "foundation" ? -height : sill, item.rotationDeg);
    const base = `${guid("item-" + item.id)},#${owner},${stepText(item.label || definition.nameFa)},${stepText("نمایش حجمی؛ جزئیات اتصال و میزبان بازشو مدل نشده")},${stepText(item.catalogId)},#${at},#${representation},$`;
    let product: number;
    if (height <= 0) {
      product = entity("IFCANNOTATION", base.slice(0, -2));
      storey.products.push(product);
    } else if (definition.ifcClass === "IfcSpace") {
      product = entity("IFCSPACE", base + ",.ELEMENT.,.NOTDEFINED.,$");
      storey.spaces.push(product);
    } else {
      const mapping = IFC_ENTITY_BY_CLASS[definition.ifcClass];
      let trailing = mapping?.trailing ?? ",.NOTDEFINED.";
      if (definition.ifcClass === "IfcDoor") trailing = `,${F(height)},${F(item.w)},.DOOR.,.NOTDEFINED.,$`;
      if (definition.ifcClass === "IfcWindow") trailing = `,${F(height)},${F(item.w)},.WINDOW.,.NOTDEFINED.,$`;
      product = entity(mapping?.entity ?? "IFCBUILDINGELEMENTPROXY", base + trailing);
      storey.products.push(product);
    }
  }
  storeys.forEach((s, index) => {
    aggregate("spaces-" + index, s.id, s.spaces);
    if (s.products.length)
      entity("IFCRELCONTAINEDINSPATIALSTRUCTURE", `${guid("products-" + index)},#${owner},$,$,(${s.products.map(ref).join(",")}),#${s.id}`);
  });
  const date = Number.isFinite(Date.parse(doc.updatedAt)) ? new Date(doc.updatedAt).toISOString() : "1970-01-01T00:00:00.000Z";
  return [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('HERMICAD IFC4 geometric reference; not a certified MVD'),'2;1');",
    `FILE_NAME(${stepText((doc.project.code || doc.id) + ".ifc")},${stepText(date)},('HERMICAD'),('HERMICAD'),'hermicad-studio','HERMICAD','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
    ...lines,
    "ENDSEC;",
    "END-ISO-10303-21;",
  ].join("\n");
}
