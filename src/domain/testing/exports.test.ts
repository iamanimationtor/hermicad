import { exportScheme } from "../exporters/reports";
import { validateExport, type ExportValidation } from "../exporters/validate";
import { FIXTURES } from "./fixtures";
import { approx, assert, test } from "./harness";

const FORMATS = ["pdf", "dxf", "svg", "ifc", "xlsx", "csv", "json"] as const;

const generated = () => {
  const scheme = FIXTURES.cleanScheme;
  const report = FIXTURES.cleanReport;
  const results = FORMATS.map((format) => {
    const artifact = exportScheme(scheme, report, format);
    const validation = validateExport(format, artifact.data, scheme, report, {
      filename: artifact.filename,
      mime: artifact.mime,
    });
    return { format, artifact, validation };
  });
  return { scheme, report, results };
};

const CACHE = generated();

test("exports", "هر هفت قالب تولید می‌شود و اعتبارسنجی محتوایی مستقل را پاس می‌کند", () => {
  assert(CACHE.results.length === 7, "هفت قالب انتظار می‌رود");
  const failures: string[] = [];
  for (const { format, validation } of CACHE.results) {
    if (!validation.ok) {
      failures.push(`${format}: ${validation.checks.filter((c) => !c.passed).map((c) => c.name).join(",")}`);
    }
    assert(validation.bytes > 500, `${format}: حجم فایل مشکوک (${validation.bytes} بایت)`);
  }
  assert(failures.length === 0, `قالب‌های نامعتبر: ${failures.join(" | ")}`);
  return CACHE.results.map((r) => `${r.format}:${r.validation.checks.length}✓`).join(" ");
});

test("exports", "PDF یک PDF واقعی با ۶ صفحه و xref سالم است", () => {
  const pdf = CACHE.results.find((r) => r.format === "pdf")!;
  const text = pdf.artifact.data.toString("latin1");
  assert(text.startsWith("%PDF-1.4"), "امضای PDF");
  assert(text.trimEnd().endsWith("%%EOF"), "پایان فایل");
  approx((text.match(/\/Type \/Page\b/g) ?? []).length, 6, 0, "page count");
  assert(pdf.validation.checks.find((c) => c.name === "xref-integrity")!.passed, "آفست‌های xref باید به هدر آبجکت‌ها اشاره کنند");
  const ruleIds = ["CODE-04-FAR", "NBR-21-PARKING", "DATA-01-INTEGRITY", "MEP-16-WATER"];
  const listed = ruleIds.filter((id) => text.includes(id));
  assert(listed.length === ruleIds.length, `شناسه قواعد در گزارش PDF نیست: ${ruleIds.filter((id) => !text.includes(id)).join(",")}`);
  assert(text.includes(CACHE.scheme.code), "کد طرح باید در PDF باشد");
  return `۵ صفحه، xref سالم، ${ruleIds.length} شناسه قاعده، ${(pdf.validation.bytes / 1024).toFixed(1)} KB`;
});

test("exports", "DXF یک فایل DXF مستقل با لایه‌ها، واحد متر و مختصات متناهی است", () => {
  const dxf = CACHE.results.find((r) => r.format === "dxf")!;
  const text = dxf.artifact.data.toString("utf8");
  const lines = text.split(/\r?\n/);
  const unitsIndex = lines.indexOf("$INSUNITS");
  assert(unitsIndex >= 0 && lines[unitsIndex + 2] === "6", "واحد باید متر باشد");
  const entities = (text.match(/LWPOLYLINE/g) ?? []).length;
  assert(entities >= CACHE.scheme.levels[0].rooms.length + 2, `تعداد موجودیت کم است: ${entities}`);
  assert(!/NaN|undefined/.test(text), "مختصات نباید NaN باشد");
  // The DXF now carries the typed drawing-scene layers (uppercase).
  const layers = ["WALL-EXTERIOR", "WALL-INTERIOR", "WALL-PARTY", "OPENING-DOOR", "OPENING-WINDOW", "STAIR", "DIMENSION", "ROOM-LABEL"].filter((l) => text.includes(l));
  assert(layers.length >= 7, `لایه‌های اصلی ناقص: ${layers.join(",")}`);
  assert(!text.startsWith("<svg") && !text.includes("%PDF"), "DXF نباید محتوای قالب دیگری باشد");
  return `${entities} پلی‌لاین، ${layers.length} لایه، ${(dxf.validation.bytes / 1024).toFixed(1)} KB`;
});

test("exports", "SVG معتبر، متعادل و حاوی هندسه زمین و مقیاس است", () => {
  const svg = CACHE.results.find((r) => r.format === "svg")!;
  const text = svg.artifact.data.toString("utf8");
  assert(text.trimStart().startsWith("<svg"), "امضای SVG");
  assert(text.trimEnd().endsWith("</svg>"), "بسته‌شدن SVG");
  assert(/viewBox="[-0-9. ]+"/.test(text), "viewBox لازم است");
  assert((text.match(/<polygon /g) ?? []).length >= 2, "پلی‌گون مرز و محدوده ساخت‌پذیر لازم است");
  assert(text.includes(CACHE.scheme.code), "کد طرح در SVG");
  assert(!/NaN|undefined/.test(text), "مختصات باید متناهی باشند");
  return `${(text.match(/<polygon /g) ?? []).length} پلی‌گون، ${(svg.validation.bytes / 1024).toFixed(1)} KB`;
});

test("exports", "IFC4: شناسه‌های یکتا، ارجاع‌های حل‌شده و تعداد فضا برابر مدل", () => {
  const ifc = CACHE.results.find((r) => r.format === "ifc")!;
  const text = ifc.artifact.data.toString("utf8");
  const ids = [...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1]));
  assert(new Set(ids).size === ids.length, "شناسه IFC تکراری وجود دارد");
  const unique = new Set(ids);
  const unresolved = [...new Set([...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1])).filter((r) => !unique.has(r)))];
  assert(unresolved.length === 0, `ارجاع‌های حل‌نشده: ${unresolved.slice(0, 5).join(",")}`);
  const rooms = CACHE.scheme.levels.reduce((s, l) => s + l.rooms.length, 0);
  approx((text.match(/=IFCSPACE\(/g) ?? []).length, rooms, 0, "IfcSpace count");
  approx((text.match(/=IFCPRODUCTDEFINITIONSHAPE\(/g) ?? []).length, rooms, 0, "IfcProductDefinitionShape count");
  assert(!/=IFCWALL/.test(text), "دیوارها خارج از دامنه‌اند و نباید ادعا شوند");
  return `${ids.length} موجودیت یکتا، ${rooms} فضا، IFC4 فضایی`;
});

test("exports", "XLSX بسته OOXML با ۵ شیت و محتوای متصل به مدل است", () => {
  const xlsx = CACHE.results.find((r) => r.format === "xlsx")!;
  const buf = xlsx.artifact.data;
  approx(buf.readUInt32LE(0), 0x04034b50, 0, "ZIP signature");
  const text = buf.toString("latin1");
  const sheetParts = (text.match(/xl\/worksheets\/sheet\d+\.xml/g) ?? []).length;
  assert(sheetParts >= 5, `بخش‌های شیت ناکافی: ${sheetParts}`);
  assert(text.includes("[Content_Types].xml") && text.includes("xl/workbook.xml"), "ساختار بسته OOXML ناقص");
  assert(text.includes("plotArea") && text.includes("CODE-04-FAR"), "شناسه معیار و قاعده باید صادر شوند");
  assert(text.includes(String(Math.round(CACHE.scheme.grossFloorAreaM2))), "GFA باید در شیت باشد");
  assert(!text.includes("%PDF"), "نباید محتوای PDF داشته باشد");
  return `${sheetParts} شیت، ${(buf.length / 1024).toFixed(1)} KB`;
});

test("exports", "CSV بخش‌بندی‌شده و با تعداد سطرهای مطابق مدل است", () => {
  const csv = CACHE.results.find((r) => r.format === "csv")!;
  const text = csv.artifact.data.toString("utf8");
  assert(text.charCodeAt(0) === 0xfeff, "BOM لازم است");
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("METRICS"));
  const rooms = lines.findIndex((l) => l.startsWith("ROOMS"));
  const metricRows = lines.slice(start + 1, rooms).filter((l) => l.trim().length > 0).length;
  approx(metricRows, CACHE.scheme.metrics.length + 1, 0, "metric rows incl. header");
  assert(text.includes(CACHE.scheme.code) && text.includes(CACHE.scheme.engineVersion), "هویت طرح و موتور");
  assert(!text.trimStart().startsWith("{"), "CSV نباید JSON باشد");
  return `${CACHE.scheme.metrics.length} معیار + ${CACHE.scheme.levels[0].rooms.length} فضا`;
});

test("exports", "JSON خروجی، مدل مرکزی و گزارش را بدون افت بازگردانی می‌کند", () => {
  const json = CACHE.results.find((r) => r.format === "json")!;
  const parsed = JSON.parse(json.artifact.data.toString("utf8")) as {
    canonicalModel: typeof CACHE.scheme;
    validation: typeof CACHE.report;
  };
  assert(parsed.canonicalModel.code === CACHE.scheme.code, "کد طرح");
  approx(parsed.canonicalModel.grossFloorAreaM2, CACHE.scheme.grossFloorAreaM2, 0.01, "GFA round-trip");
  assert(parsed.canonicalModel.metrics.length === CACHE.scheme.metrics.length, "معیارها");
  assert(parsed.validation.evaluations.length === CACHE.report.evaluations.length, "ارزیابی قواعد");
  assert(parsed.validation.codeSetVerification === "unverified", "وضعیت اعتبار سند باید صادر شود");
  assert(parsed.canonicalModel.analysisStatus?.notForConstruction === true, "پرچم notForConstruction");
  return "مدل و گزارش کامل بازگردانی شد";
});

test("exports", "قالب‌ها متمایزند و هیچ قالب محتوای قالب دیگر را برنمی‌گرداند", () => {
  const buffers = CACHE.results.map((r) => r.artifact.data);
  const hashes = new Set(buffers.map((b) => `${b.length}:${b.subarray(0, 32).toString("hex")}`));
  assert(hashes.size === buffers.length, "دو قالب خروجی یکسان تولید کرده‌اند");
  const pdf = CACHE.results.find((r) => r.format === "pdf")!.artifact.data;
  const dxf = CACHE.results.find((r) => r.format === "dxf")!.artifact.data;
  const svg = CACHE.results.find((r) => r.format === "svg")!.artifact.data;
  const ifc = CACHE.results.find((r) => r.format === "ifc")!.artifact.data;
  const csv = CACHE.results.find((r) => r.format === "csv")!.artifact.data;
  const wrong: [string, Buffer][] = [
    ["pdf", dxf],
    ["dxf", svg],
    ["svg", pdf],
    ["ifc", csv],
    ["json", csv],
  ];
  const mistakes = wrong
    .map(([format, buffer]) => {
      const result = validateExport(format, buffer, CACHE.scheme, CACHE.report, { filename: "x", mime: "x" });
      return { format, ok: result.ok };
    })
    .filter((r) => r.ok);
  assert(mistakes.length === 0, `اعتبارسنج قالب، محتوای اشتباه را پذیرفت: ${mistakes.map((m) => m.format).join(",")}`);
  return `${CACHE.results.length} خروجی متمایز؛ ۵ آزمون محتوای اشتباه رد شد`;
});

test("exports", "اعتبارسنج خروجی می‌تواند خرابی واقعی را تشخیص دهد (آزمون منفی)", () => {
  const scheme = CACHE.scheme;
  const report = CACHE.report;
  const pdf = CACHE.results.find((r) => r.format === "pdf")!.artifact.data;
  const brokenPdf = Buffer.concat([pdf.subarray(0, pdf.length - 40), Buffer.from("\n")]);
  const brokenResult = validateExport("pdf", brokenPdf, scheme, report, { filename: "b.pdf", mime: "application/pdf" });
  assert(!brokenResult.ok, "PDF ناقص باید رد شود");
  const truncatedIfc = Buffer.from(
    CACHE.results
      .find((r) => r.format === "ifc")!
      .artifact.data.toString("utf8")
      .replace(/END-ISO-10303-21;/, ""),
    "utf8",
  );
  assert(
    !validateExport("ifc", truncatedIfc, scheme, report, { filename: "b.ifc", mime: "model/ifc" }).ok,
    "IFC ناقص باید رد شود",
  );
  const emptyCsv = Buffer.from("\uFEFF");
  assert(
    !validateExport("csv", emptyCsv, scheme, report, { filename: "b.csv", mime: "text/csv" }).ok,
    "CSV خالی باید رد شود",
  );
  return "۳ خرابی مصنوعی شناسایی شد";
});

export type { ExportValidation };
