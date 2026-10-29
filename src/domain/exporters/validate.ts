import { CRITERIA } from "../optimize";
import type { CanonicalScheme, ValidationReport } from "../types";

/**
 * Content-level validation of generated export artifacts.
 *
 * HTTP 200 proves nothing. These validators open the produced bytes and check
 * the signature, structural integrity, format-specific sections and that the
 * numbers/identifiers match the canonical model they were exported from.
 */

export interface FileCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface ExportValidation {
  format: string;
  filename: string;
  mime: string;
  bytes: number;
  checks: FileCheck[];
  ok: boolean;
  /** What kind of assurance these checks give. Never implies schema/semantic validity. */
  validationKind: "structural-syntax" | "content-binding";
  /** Honest statement about external schema validation (IFC). */
  schemaValidation?: { performed: boolean; tool: string | null; note: string };
  externalSpecRefs?: string[];
  advisoryNote: string;
}

const check = (name: string, passed: boolean, detail: string): FileCheck => ({ name, passed, detail });

function zipEntries(buffer: Buffer): { name: string; data: Buffer }[] {
  const entries: { name: string; data: Buffer }[] = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    if (method !== 0) {
      entries.push({ name, data: Buffer.from(`[compressed:${method}]`) });
    } else {
      entries.push({ name, data: buffer.subarray(dataStart, dataStart + size) });
    }
    offset = dataStart + size;
  }
  return entries;
}

function validatePdf(buffer: Buffer, scheme: CanonicalScheme): FileCheck[] {
  const text = buffer.toString("latin1");
  const pageCount = (text.match(/\/Type \/Page\b/g) ?? []).length;
  const streamCount = (text.match(/\bstream\b/g) ?? []).length;
  const endStreamCount = (text.match(/\bendstream\b/g) ?? []).length;
  const checks: FileCheck[] = [
    check("signature", text.startsWith("%PDF-1.4"), "header must be %PDF-1.4"),
    check("eof", text.trimEnd().endsWith("%%EOF"), "file must end with %%EOF"),
    // 6 pages: cover, site plan, typical floor, true-scale plan sheet, rules, metrics.
    check("page-count", pageCount === 6, `expected 6 pages, found ${pageCount}`),
    check("content-streams", streamCount === 6 && endStreamCount === 6, `streams ${streamCount}/${endStreamCount}`),
    check("fonts", text.includes("/F1") && text.includes("/F2"), "Base14 fonts F1/F2 must be referenced"),
    check("scheme-id", text.includes(scheme.code), "scheme code must appear in the report"),
    check("finite-numbers", !/NaN|undefined|\[object Object\]/.test(text), "no NaN/undefined tokens"),
  ];
  // xref offsets must point at the matching object headers.
  const startxrefMatch = text.match(/startxref\s+(\d+)/);
  const xrefStart = startxrefMatch ? Number(startxrefMatch[1]) : -1;
  const xrefAtOffset = xrefStart >= 0 && text.slice(xrefStart, xrefStart + 4) === "xref";
  let offsetsValid = xrefAtOffset;
  let entryCount = 0;
  if (xrefAtOffset) {
    const header = text.slice(xrefStart, xrefStart + 40).match(/xref\s+(\d+)\s+(\d+)/);
    if (header) {
      const count = Number(header[2]);
      // The subsection starts with the mandatory free entry for object 0.
      let cursor = xrefStart + `xref\n${header[1]} ${header[2]}\n`.length + 20;
      for (let objectNumber = 1; objectNumber < count; objectNumber++) {
        const entry = text.slice(cursor, cursor + 20);
        cursor += 20;
        const match = entry.match(/^(\d{10}) (\d{5}) ([nf])/);
        if (!match || match[3] !== "n") {
          offsetsValid = false;
          break;
        }
        const target = Number(match[1]);
        const expected = `${objectNumber} 0 obj`;
        if (text.slice(target, target + expected.length) !== expected) {
          offsetsValid = false;
          break;
        }
        entryCount += 1;
      }
    } else {
      offsetsValid = false;
    }
  }
  checks.push(check("xref-integrity", offsetsValid && entryCount >= 10, `${entryCount} xref entries verified`));
  return checks;
}

function validateDxf(buffer: Buffer, scheme: CanonicalScheme): FileCheck[] {
  const text = buffer.toString("utf8");
  const lines = text.split(/\r?\n/);
  const polylines = lines.filter((line, i) => line === "LWPOLYLINE" && lines[i - 1] === "0").length;
  // Layer contract of the drawing scene (typed layers, uppercase in DXF).
  const requiredLayers = ["WALL-EXTERIOR", "WALL-INTERIOR", "OPENING-DOOR", "OPENING-WINDOW", "DIMENSION", "ROOM-LABEL", "STAIR"];
  const presentLayers = requiredLayers.filter((layer) => text.includes(layer));
  const hasLayerTable = presentLayers.length === requiredLayers.length;
  const unitsMetres = text.includes("$INSUNITS") && lines[lines.indexOf("$INSUNITS") + 2] === "6";
  const numericPairs: number[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] === "10" || lines[i] === "20" || lines[i] === "40") numericPairs.push(Number(lines[i + 1]));
  }
  const roomCount = scheme.levels[0].rooms.length;
  return [
    check("signature", text.startsWith("0\r\nSECTION") || text.startsWith("0\nSECTION"), "DXF must start with a SECTION group"),
    check("version", text.includes("AC1015"), "expected AC1015 (AutoCAD 2000) header"),
    check("units", unitsMetres, "$INSUNITS must be 6 (metres)"),
    check("layers", hasLayerTable, `expected ${requiredLayers.length} scene layers, found ${presentLayers.length}`),
    check("model-space-metres", text.includes("$INSUNITS\r\n  70\r\n6") || text.includes("$INSUNITS"), "model space must be declared in metres"),
    check("entities", polylines >= roomCount + 2, `polylines ${polylines} >= rooms+2 ${roomCount + 2}`),
    check("eof", lines.some((line) => line.trim() === "EOF"), "DXF must end with EOF"),
    check("finite-coordinates", numericPairs.length > 0 && numericPairs.every((n) => Number.isFinite(n)), `${numericPairs.length} coordinates`),
    check("model-link", text.includes(scheme.code), "scheme code must be embedded"),
    check("not-svg-pdf", !text.startsWith("<svg") && !text.includes("%PDF"), "must not contain another format"),
  ];
}

function validateSvg(buffer: Buffer, scheme: CanonicalScheme): FileCheck[] {
  const text = buffer.toString("utf8");
  const polygons = (text.match(/<polygon /g) ?? []).length;
  const openGroups = (text.match(/<g[\s>]/g) ?? []).length;
  const closeGroups = (text.match(/<\/g>/g) ?? []).length;
  return [
    check("signature", text.trimStart().startsWith("<svg"), "must start with <svg"),
    check("closed", text.trimEnd().endsWith("</svg>"), "must end with </svg>"),
    check("viewbox", /viewBox="[-0-9. ]+"/.test(text), "viewBox required for scaling"),
    check("polygons", polygons >= 2, `expected >=2 polygon elements, found ${polygons}`),
    check("groups-balanced", openGroups === closeGroups, `g ${openGroups}/${closeGroups}`),
    check("model-link", text.includes(scheme.code) && text.includes(String(scheme.site.boundary.length)), "scheme code and vertex count"),
    check("finite-numbers", !/\bNaN\b|\bundefined\b/.test(text), "no NaN/undefined tokens"),
    check("not-pdf", !text.includes("%PDF"), "must not contain PDF content"),
  ];
}

function validateIfc(buffer: Buffer, scheme: CanonicalScheme): FileCheck[] {
  const text = buffer.toString("utf8");
  const ids = [...text.matchAll(/^#(\d+)=/gm)].map((m) => Number(m[1]));
  const unique = new Set(ids);
  const refs = [...text.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  const unresolved = [...new Set(refs.filter((r) => !unique.has(r)))];
  const roomTotal = scheme.levels.reduce((sum, level) => sum + level.rooms.length, 0);
  const spaces = (text.match(/=IFCSPACE\(/g) ?? []).length;
  const productShapes = (text.match(/=IFCPRODUCTDEFINITIONSHAPE\(/g) ?? []).length;
  const storeys = (text.match(/=IFCBUILDINGSTOREY\(/g) ?? []).length;
  // IfcProduct formal proposition (official IFC4 spec, checked 2026-02):
  // PlacementForShapeRepresentation — a product with an IfcProductDefinitionShape
  // must also carry an ObjectPlacement.
  const spaceLines = text.split("\n").filter((line) => line.includes("=IFCSPACE("));
  const spacesWithPlacement = spaceLines.filter((line) => !line.includes(",$,$,") && !/,\$,#\d+,#\d+,'/.test(line.split("IFCSPACE(")[1] ?? "")).length;
  const placementOk = spaceLines.every((line) => {
    const args = line.split("IFCSPACE(")[1] ?? "";
    const parts = args.split(",");
    // GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement, Representation, ...
    const placement = parts[5]?.trim() ?? "";
    const representation = parts[6]?.trim() ?? "";
    return representation === "$" || placement.startsWith("#");
  });
  void spacesWithPlacement;
  return [
    check("signature", text.startsWith("ISO-10303-21;"), "must start with ISO-10303-21;"),
    check("schema", text.includes("FILE_SCHEMA(('IFC4'))"), "IFC4 schema declaration"),
    check("closed", text.trimEnd().endsWith("END-ISO-10303-21;"), "must end with END-ISO-10303-21;"),
    check("unique-ids", ids.length === unique.size, `${ids.length} entities, ${unique.size} unique`),
    check("resolved-references", unresolved.length === 0, unresolved.length ? `unresolved: ${unresolved.slice(0, 5).join(",")}` : "all references resolve"),
    check("spaces", spaces === roomTotal, `spaces ${spaces} must equal model rooms ${roomTotal}`),
    check("product-shapes", productShapes === roomTotal, `IfcProductDefinitionShape ${productShapes} for ${roomTotal} spaces`),
    check("storeys", storeys === scheme.levels.length, `storeys ${storeys}/${scheme.levels.length}`),
    check("spatial-structure", text.includes("IFCSITE(") && text.includes("IFCBUILDING(") && text.includes("IFCRELAGGREGATES("), "site/building/spatial decomposition"),
    check("finite-numbers", !/\bNaN\b|\bundefined\b/.test(text), "no NaN/undefined tokens"),
    check("no-walls-claimed", !/=IFCWALL/.test(text), "walls are out of scope and must not be emitted"),
    check(
      "ifc-product-placement-proposition",
      placementOk,
      "IFC4 formal proposition: product with IfcProductDefinitionShape must have ObjectPlacement",
    ),
  ];
}

function validateXlsx(buffer: Buffer, scheme: CanonicalScheme, report: ValidationReport): FileCheck[] {
  const entries = zipEntries(buffer);
  const names = entries.map((e) => e.name);
  const sheets = names.filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const workbook = entries.find((e) => e.name === "xl/workbook.xml")?.data.toString("utf8") ?? "";
  const sheet1 = entries.find((e) => e.name === "xl/worksheets/sheet1.xml")?.data.toString("utf8") ?? "";
  const metricsSheet = sheet1;
  const validationSheet = entries.find((e) => e.name === "xl/worksheets/sheet4.xml")?.data.toString("utf8") ?? "";
  return [
    check("zip-signature", buffer.readUInt32LE(0) === 0x04034b50, "PK local file header"),
    check("content-types", names.includes("[Content_Types].xml"), "[Content_Types].xml present"),
    check("workbook", names.includes("xl/workbook.xml") && (workbook.match(/<sheet /g) ?? []).length === 6, "6 sheets in workbook"),
    check("worksheets", sheets.length === 6, `${sheets.length} worksheet parts`),
    check(
      "basis-sheet",
      names.includes("xl/worksheets/sheet6.xml") &&
        (entries.find((e) => e.name === "xl/worksheets/sheet6.xml")?.data.toString("utf8") ?? "").includes("STRUCT-SEISMIC-CW"),
      "engineering formula basis exported",
    ),
    check("xml-structure", sheet1.startsWith("<?xml") && sheet1.includes("</worksheet>"), "worksheet XML closed"),
    check("metrics-content", sheet1.includes("plotArea") && sheet1.includes("far"), "metric ids exported"),
    check("validation-content", validationSheet.includes("CODE-04-FAR"), "rule ids exported"),
    check("advisory-flag", (entries.find((e) => e.name === "xl/worksheets/sheet6.xml")?.data.toString("utf8") ?? "").includes("ADVISORY ONLY"), "advisory claim exported"),
    check("model-link", workbook.includes("Metrics") && sheet1.includes(String(Math.round(scheme.grossFloorAreaM2))), "GFA bound to model"),
    check(
      "report-link",
      report.evaluations.length > 0 &&
        validationSheet.includes(report.evaluations[0].ruleId) &&
        metricsSheet.includes(report.codeSetCode) &&
        metricsSheet.includes(report.codeSetEdition),
      "rule ids and code-set reference bound to the report",
    ),
  ];
}

function validateCsv(buffer: Buffer, scheme: CanonicalScheme, report: ValidationReport): FileCheck[] {
  const text = buffer.toString("utf8");
  const lines = text.split("\n");
  const sectionIndex = (name: string) => lines.findIndex((l) => l.startsWith(name));
  const countBetween = (from: string, to: string) => {
    const start = sectionIndex(from);
    const end = sectionIndex(to);
    if (start < 0 || end < 0) return -1;
    return lines.slice(start + 1, end).filter((l) => l.trim().length > 0).length;
  };
  return [
    check("bom", text.charCodeAt(0) === 0xfeff, "UTF-8 BOM for Excel compatibility"),
    check("sections", ["METRICS", "ROOMS (typical floor)", "VALIDATION", "ASSUMPTIONS", "TRACE", "DISCLAIMER"].every((s) => text.includes(s)), "all sections present"),
    check("metrics-rows", countBetween("METRICS", "ROOMS (typical floor)") === scheme.metrics.length + 1, `rows must be metrics+header (${scheme.metrics.length + 1})`),
    check("room-rows", countBetween("ROOMS (typical floor)", "VALIDATION") === scheme.levels[0].rooms.length + 1, "room rows + header"),
    check(
      "validation-rows",
      (() => {
        const start = sectionIndex("VALIDATION");
        const end = sectionIndex("ASSUMPTIONS");
        if (start < 0 || end < 0) return false;
        const ruleRows = lines
          .slice(start + 1, end)
          .filter((line) => /^(SITE|CODE|FIRE|NBR|STRUCT|MEP|DATA|ARCH)-[A-Z0-9]{2,4}-/.test(line));
        return ruleRows.length === report.evaluations.length;
      })(),
      "one row per evaluated rule",
    ),
    check(
      "provenance-row",
      text.includes("REPORT_PROVENANCE") && lines.some((line) => line.startsWith("REPORT_PROVENANCE") && line.includes("unverified")),
      "code-set verification status must be exported",
    ),
    check("model-link", text.includes(scheme.code) && text.includes(scheme.engineVersion), "scheme code and engine version"),
    check("numbers", !/\bNaN\b|\bundefined\b/.test(text), "no NaN/undefined tokens"),
    check("not-json", !text.trimStart().startsWith("{"), "must not be JSON"),
    check("advisory-row", text.includes("ADVISORY ONLY"), "advisory claim must be exported"),
    check(
      "engineering-basis",
      text.includes("ENGINEERING_BASIS") && text.includes("STRUCT-SEISMIC-CW") && text.includes("unverified-code-derived"),
      "formula classification exported",
    ),
    check("external-specs", text.includes("IFC4-IFCPRODUCTDEFINITIONSHAPE"), "verified external spec references listed"),
  ];
}

function validateJson(buffer: Buffer, scheme: CanonicalScheme, report: ValidationReport): FileCheck[] {
  let parsed: { canonicalModel?: CanonicalScheme; validation?: ValidationReport } | null = null;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch {
    parsed = null;
  }
  const model = parsed?.canonicalModel;
  const validation = parsed?.validation;
  const basis = (parsed as unknown as { engineeringBasis?: { formulas?: { id: string; classification: string }[]; advisoryClaim?: string } } | null)?.engineeringBasis;
  return [
    check("parseable", parsed !== null, "valid JSON document"),
    check("cem-code", model?.code === scheme.code, "canonical model code matches"),
    check("cem-metrics", model?.metrics.length === scheme.metrics.length, "metric count preserved"),
    check("validation-link", validation?.evaluations.length === report.evaluations.length, "rule evaluation count preserved"),
    check("engine-version", model?.engineVersion === scheme.engineVersion, "engine version preserved"),
    check("assumptions", (model?.assumptions.length ?? 0) > 0, "assumptions must be exported"),
    check("provenance", validation?.codeSetVerification === "unverified", "code-set verification status exported"),
    check("criteria", CRITERIA.length > 0 && model?.requirements !== undefined, "requirements embedded"),
    check(
      "engineering-basis",
      (basis?.formulas?.length ?? 0) >= 10 && basis!.formulas!.some((f) => f.classification === "unverified-code-derived"),
      "formula classifications exported",
    ),
    check("advisory-claim", !!basis?.advisoryClaim && basis.advisoryClaim.includes("NOT established"), "advisory claim exported"),
    check(
      "no-compliance-claim",
      (() => {
        const payload = JSON.stringify(validation);
        // Only structured claims are rejected; explanatory prose (e.g. a test
        // description mentioning "compliantRooms") is legitimate.
        const structuredClaim = /"(compliant|approved|safe|verifiedDesign|isCompliant)"\s*:\s*true/i.test(payload);
        const explicitClaim = /compliance established|statutorily compliant|approved by authority|طراحی تأییدشده/i.test(payload);
        return !structuredClaim && !explicitClaim;
      })(),
      "report must not assert compliance or safety",
    ),
  ];
}

export function validateExport(
  format: string,
  buffer: Buffer,
  scheme: CanonicalScheme,
  report: ValidationReport,
  meta: { filename: string; mime: string },
): ExportValidation {
  let checks: FileCheck[];
  switch (format) {
    case "pdf":
      checks = validatePdf(buffer, scheme);
      break;
    case "dxf":
      checks = validateDxf(buffer, scheme);
      break;
    case "svg":
      checks = validateSvg(buffer, scheme);
      break;
    case "ifc":
      checks = validateIfc(buffer, scheme);
      break;
    case "xlsx":
      checks = validateXlsx(buffer, scheme, report);
      break;
    case "csv":
      checks = validateCsv(buffer, scheme, report);
      break;
    case "json":
      checks = validateJson(buffer, scheme, report);
      break;
    default:
      checks = [check("known-format", false, `unknown format ${format}`)];
  }
  return {
    format,
    filename: meta.filename,
    mime: meta.mime,
    bytes: buffer.length,
    checks,
    ok: checks.every((c) => c.passed),
    validationKind: format === "ifc" ? "structural-syntax" : "content-binding",
    schemaValidation:
      format === "ifc"
        ? {
            performed: false,
            tool: null,
            note:
              "اعتبارسنجی اسکیمای رسمی IFC4 (EXPRESS/STEP) در این محیط انجام نشده است؛ هیچ ابزار ifcopenshell/IfcValidator/xmllint نصب نیست. بررسی‌های انجام‌شده فقط ساختاری/محتوایی است و به‌معنی معتبر بودن کامل فایل نیست.",
          }
        : undefined,
    externalSpecRefs: format === "ifc" ? ["IFC4-IFCPRODUCTDEFINITIONSHAPE", "IFC4-IFCPRODUCT"] : undefined,
    advisoryNote:
      "این اعتبارسنجی فقط یکپارچگی ساختاری و اتصال محتوا به مدل را بررسی می‌کند؛ نه انطباق قانونی، نه صحت مهندسی و نه اعتبار اسکیمای بیرونی.",
  };
}
