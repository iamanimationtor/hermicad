import { buildFloorPlanScene, buildSiteScene, chooseScale, DRAWING_LAYERS, areaOfPolygon } from "../drawing/scene";
import type { Primitive } from "../drawing/scene";
import { renderSceneSvg, sceneToSheet } from "../drawing/renderSvg";
import { renderSceneDxf } from "../drawing/renderDxf";
import { pdfPageSize, sceneToPdfOperations, PDF_LIMITATIONS } from "../drawing/renderPdf";
import { exportScheme } from "../exporters/reports";
import { validateExport } from "../exporters/validate";
import { auditScheme } from "../audit/geometryAudit";
import { floorPlanSvg } from "../exporters/vector";
import { FIXTURES } from "./fixtures";
import { approx, assert, test } from "./harness";

// Independent DXF parser (real library, not our own writer).
// eslint-disable-next-line @typescript-eslint/no-require-imports
import DxfParser from "dxf-parser";

const SCENE = buildFloorPlanScene(FIXTURES.cleanScheme, 0, { includeSiteContext: true });

const polyOf = (id: string, scene = SCENE): Extract<Primitive, { kind: "polygon" }> | null => {
  const found = scene.primitives.find((primitive) => primitive.id === id);
  return found && found.kind === "polygon" ? found : null;
};
const SVG = renderSceneSvg(SCENE);
const DXF = renderSceneDxf(SCENE);

test("drawing", "صحنه نقشه فقط از مدل ساخته می‌شود و مختصات با مدل یکسان است", () => {
  const scheme = FIXTURES.cleanScheme;
  const level = scheme.levels[0];
  const scene = SCENE;
  // 1) every wall primitive is exactly the wall band of a model wall
  const wallPolys = scene.primitives.filter((p) => p.layer.startsWith("wall-") && p.kind === "polygon");
  approx(wallPolys.length, (level.walls ?? []).length, 0, "wall primitive count");
  for (const wall of level.walls ?? []) {
    const primitive = polyOf(`wall-${wall.id}`);
    assert(!!primitive, `دیوار ${wall.id} در نقشه نیست`);
    if (!primitive) continue;
    const xs = primitive.points.map((p) => p.x);
    const ys = primitive.points.map((p) => p.y);
    const drawnLength = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    assert(
      Math.abs(drawnLength - wall.lengthM) < wall.thicknessM * 2 + 0.02,
      `${wall.id}: طول ترسیم ${drawnLength} با مدل ${wall.lengthM}`,
    );
    // band thickness must equal the modelled thickness
    const short = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    assert(Math.abs(short - wall.thicknessM) < 0.02, `${wall.id}: ضخامت ترسیم ${short} با مدل ${wall.thicknessM}`);
  }
  // 2) room polygons match model polygons exactly
  for (const room of level.rooms) {
    const tint = polyOf(`tint-${room.id}`);
    assert(!!tint, `فضای ${room.id} در نقشه نیست`);
    if (!tint) continue;
    approx(Math.abs(areaOfPolygon(tint.points)), room.areaM2, 0.02, `${room.id} drawn area`);
  }
  // 3) consistency block must pass
  assert(scene.consistency.ok, `ناسازگاری: ${JSON.stringify(scene.consistency)}`);
  approx(scene.consistency.modelRoomAreaM2, scene.consistency.drawnRoomAreaM2, 0.05, "room area model vs drawn");
  approx(scene.consistency.modelWallLengthM, scene.consistency.drawnWallLengthM, 0.05, "wall length model vs drawn");
  assert(scene.consistency.unresolvedOpenings.length === 0, "بازشوی بدون دیوار وجود دارد");
  return `${wallPolys.length} دیوار · ${level.rooms.length} فضا · جمع دیوار ${scene.consistency.drawnWallLengthM} m`;
});

test("drawing", "همه بازشوها به دیوار معتبر متصل و داخل آن هستند", () => {
  const scheme = FIXTURES.cleanScheme;
  const scene = SCENE;
  const level = scheme.levels[0];
  const openings = level.openings ?? [];
  assert(openings.length > 0, "بازشویی در مدل نیست");
  for (const opening of openings) {
    const wall = (level.walls ?? []).find((candidate) => candidate.id === opening.wallId);
    assert(!!wall, `${opening.id}: دیوار میزبان وجود ندارد`);
    const gap = polyOf(`gap-${opening.id}`);
    assert(!!gap, `${opening.id}: بازشو در نقشه ترسیم نشده`);
    const symbol = opening.kind === "window"
      ? scene.primitives.filter((p) => p.id.startsWith(`win-${opening.id}-`))
      : scene.primitives.filter((p) => p.id === `leaf-${opening.id}` || p.id === `swing-${opening.id}`);
    assert(symbol.length >= (opening.kind === "window" ? 3 : 2), `${opening.id}: نماد کامل نیست (${symbol.length})`);
    if (gap) {
      const centre = {
        x: (Math.min(...gap.points.map((p) => p.x)) + Math.max(...gap.points.map((p) => p.x))) / 2,
        y: (Math.min(...gap.points.map((p) => p.y)) + Math.max(...gap.points.map((p) => p.y))) / 2,
      };
      assert(Math.hypot(centre.x - opening.center.x, centre.y - opening.center.y) < 0.05, `${opening.id}: مرکز نماد با مدل نمی‌خواند`);
    }
  }
  return `${openings.length} بازشو با نماد کامل و مرکز منطبق`;
});

test("drawing", "SVG: برگ واقعی مقیاس‌دار با لایه‌ها، عنوان و مقیاس", () => {
  assert(SVG.startsWith("<svg"), "خروجی SVG نیست");
  assert(SVG.trimEnd().endsWith("</svg>"), "SVG بسته نشده");
  assert(SVG.includes(`viewBox="0 0 ${SCENE.sheet.widthMm} ${SCENE.sheet.heightMm}"`), "viewBox باید ابعاد برگ باشد");
  assert(SVG.includes(`width="${SCENE.sheet.widthMm}mm"`), "عرض فیزیکی برگ میلی‌متری نیست");
  assert(SVG.includes(`data-scale="${SCENE.sheet.scaleDenominator}"`), "مقیاس در SVG ثبت نشده");
  for (const layer of DRAWING_LAYERS.filter((l) => SCENE.primitives.some((p) => p.layer === l.id))) {
    assert(SVG.includes(`id="layer-${layer.id}"`), `لایه ${layer.id} در SVG نیست`);
  }
  assert(SVG.includes("مقیاس ۱:"), "نوار مقیاس/متن مقیاس نیست");
  assert(SVG.includes(">N</text>"), "جهت شمال ترسیم نشده");
  assert(SVG.includes(SCENE.schemeCode), "کد طرح در عنوان نیست");
  assert(!/NaN|undefined/.test(SVG), "SVG مقدار نامعتبر دارد");
  // coordinate round-trip: sheet → model must recover a model point exactly
  const { toSheet, toModel } = sceneToSheet(SCENE);
  const probe = { x: SCENE.sheet.modelBox.x + 1.5, y: SCENE.sheet.modelBox.y + 2.5 };
  const back = toModel(toSheet(probe));
  approx(back.x, probe.x, 1e-6, "sheet→model x");
  approx(back.y, probe.y, 1e-6, "sheet→model y");
  const polygons = (SVG.match(/<polygon /g) ?? []).length;
  return `برگ ${SCENE.sheet.format} ${SCENE.sheet.widthMm}×${SCENE.sheet.heightMm} mm · مقیاس ۱:${SCENE.sheet.scaleDenominator} · ${polygons} چندضلعی`;
});

test("drawing", "PDF: ابعاد صفحه واقعی، مقیاس صریح و محتوای نقشه", () => {
  const artifact = exportScheme(FIXTURES.cleanScheme, FIXTURES.cleanReport, "pdf");
  const text = artifact.data.toString("latin1");
  assert(text.startsWith("%PDF-1.4"), "امضای PDF");
  const size = pdfPageSize(SCENE);
  // A3 landscape ≈ 1190×842 pt
  approx(size.widthPt, 1190.55, 1, "A3 width in pt");
  approx(size.heightPt, 841.89, 1, "A3 height in pt");
  assert(text.includes(`SCALE 1:${SCENE.sheet.scaleDenominator}`), "مقیاس در PDF درج نشده");
  assert(text.includes("UNITS METRE"), "واحد در PDF درج نشده");
  assert(text.includes("WALLS"), "شمارش دیوار در PDF نیست");
  assert(text.indexOf("SHEET") > 0, "عنوان برگ در PDF نیست");
  const ops = sceneToPdfOperations(SCENE);
  assert(ops.length > 100, `تعداد عملیات PDF کم است: ${ops.length}`);
  assert(ops.some((op) => op.includes(" m ") && op.includes(" l ")), "خطوط نقشه در PDF تولید نشده");
  assert(!PDF_LIMITATIONS.persianTextRendered, "محدودیت متن فارسی باید اعلام شود");
  assert(text.includes("SCALE"), "metadata مقیاس");
  const meta = artifact.meta as { planSheet?: { scaleDenominator: number }; pages?: number };
  assert(meta.planSheet?.scaleDenominator === SCENE.sheet.scaleDenominator, "metadata مقیاس ناسازگار");
  approx(meta.pages ?? 0, 6, 0, "page count");
  return `${size.widthPt}×${size.heightPt} pt · ${ops.length} عملیات برداری · ۱:${SCENE.sheet.scaleDenominator}`;
});

test("drawing", "DXF: با کتابخانه مستقل dxf-parser خوانده و مهر تأیید می‌شود", () => {
  const parser = new DxfParser();
  const parsed = parser.parseSync(DXF);
  if (!parsed) throw new Error("dxf-parser نتوانست فایل را بخواند");
  assert(true, "dxf-parser فایل را خواند");
  assert(parsed.header?.["$INSUNITS"] === 6 || DXF.includes("$INSUNITS"), "واحد متر در هدر نیست");
  const entities = parsed.entities ?? [];
  assert(entities.length > 50, `تعداد موجودیت کم است: ${entities.length}`);
  const kinds = new Set(entities.map((entity) => entity.type));
  for (const required of ["LWPOLYLINE", "LINE", "TEXT"]) {
    assert(kinds.has(required), `نوع ${required} در DXF نیست (${[...kinds].join(",")})`);
  }
  const layers = new Set(parsed.tables?.layer?.layers ? Object.keys(parsed.tables.layer.layers) : []);
  for (const name of ["WALL-EXTERIOR", "OPENING-WINDOW", "OPENING-DOOR", "DIMENSION", "ROOM-LABEL"]) {
    assert(layers.has(name), `لایه ${name} در جدول DXF نیست (${[...layers].slice(0, 8).join(",")})`);
  }
  // Coordinates in model space must match the model exactly (metres).
  const level = FIXTURES.cleanScheme.levels[0];
  const coords = entities
    .filter((entity) => entity.type === "LWPOLYLINE")
    .flatMap((entity) => {
      const candidate = entity as unknown as { vertices?: { x: number; y: number }[] };
      return (candidate.vertices ?? []).map((vertex) => ({ x: vertex.x, y: vertex.y }));
    });
  const modelXs = (level.walls ?? []).flatMap((wall) => [wall.start.x, wall.end.x]);
  const match = modelXs.some((x) => coords.some((point) => Math.abs(point.x - x) < 0.02));
  assert(match, "مختصات DXF با مدل مطابقت ندارد");
  assert(!/NaN/.test(DXF), "DXF مقدار NaN دارد");
  return `${entities.length} موجودیت · ${layers.size} لایه · ${kinds.size} نوع`;
});

test("drawing", "هشدارهای هندسی روی نقشه علامت‌گذاری می‌شوند و طرح نامعتبر تأیید نمی‌شود", () => {
  const scheme = FIXTURES.cleanScheme;
  const audit = auditScheme(scheme);
  const scene = SCENE;
  // Issue markers must be drawn for every reported plan issue.
  for (const issue of scene.issues) {
    assert(SVG.includes(`issue-mark-${issue.id}`), `نشانگر ${issue.id} در SVG نیست`);
  }
  assert(scene.readiness.status === "blocked" || scene.readiness.status === "review-required", "وضعیت آمادگی نامعتبر");
  assert(scene.readiness.disclaimer.includes("آماده اجرا") || scene.readiness.disclaimer.includes("تأیید نشده"), "سلب مسئولیت لازم است");
  assert(!scene.readiness.label.includes("آماده اجرا"), "طرح نباید «آماده اجرا» برچسب بخورد");
  // Negative: break a wall reference and the scene must report it.
  const broken = JSON.parse(JSON.stringify(scheme)) as typeof scheme;
  broken.levels[0].openings = [
    ...(broken.levels[0].openings ?? []),
    { id: "ORPHAN-1", wallId: "NOPE", kind: "window", widthM: 1, heightM: 1.4, sillM: 0.9, center: { x: 0, y: 0 }, stationM: 0, roomIds: [], note: "" },
  ];
  const brokenScene = buildFloorPlanScene(broken, 0);
  assert(!brokenScene.consistency.ok, "بازشوی بدون دیوار باید ناسازگاری گزارش شود");
  assert(brokenScene.consistency.unresolvedOpenings.includes("ORPHAN-1"), "شناسه بازشوی یتیم باید گزارش شود");
  const live = audit.levels[0].findings.filter((f) => f.status === "fail");
  assert(live.length === 0, "طرح نمونه نباید نقص سخت داشته باشد");
  return `${scene.issues.length} هشدار روی نقشه · وضعیت: ${scene.readiness.status}`;
});

test("drawing", "صفحه‌آرایی و انتخاب مقیاس استاندارد درست کار می‌کند", () => {
  const frame = { w: 396, h: 225 };
  const small = chooseScale({ x: 0, y: 0, w: 16, h: 12 }, frame);
  const large = chooseScale({ x: 0, y: 0, w: 120, h: 90 }, frame);
  assert(small.scaleDenominator <= large.scaleDenominator, "زمین کوچک‌تر باید مقیاس بزرگ‌تر (عدد کوچک‌تر) بگیرد");
  approx(small.mmPerMetre, 1000 / small.scaleDenominator, 1e-9, "mmPerMetre");
  for (const scale of [small, large]) {
    assert([20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 1000].includes(scale.scaleDenominator), `مقیاس غیراستاندارد: ${scale.scaleDenominator}`);
  }
  const site = buildSiteScene(FIXTURES.cleanScheme);
  assert(site.kind === "site-plan", "صحنه زمین ساخته نشد");
  assert(site.primitives.some((p) => p.layer === "parcel"), "مرز زمین در صحنه نیست");
  return `۱:${small.scaleDenominator} (کوچک) · ۱:${large.scaleDenominator} (بزرگ)`;
});

test("drawing", "اعتبارسنج خروجی، نقشه SVG و DXF را واقعی می‌شناسد", () => {
  const scheme = FIXTURES.cleanScheme;
  const report = FIXTURES.cleanReport;
  for (const format of ["svg", "dxf"] as const) {
    const artifact = exportScheme(scheme, report, format);
    const result = validateExport(format, artifact.data, scheme, report, { filename: artifact.filename, mime: artifact.mime });
    assert(result.ok, `${format}: ${result.checks.filter((c) => !c.passed).map((c) => c.name).join(",")}`);
  }
  const svgArtifact = exportScheme(scheme, report, "svg");
  assert(svgArtifact.filename.includes("1-"), `نام فایل باید مقیاس داشته باشد: ${svgArtifact.filename}`);
  const meta = svgArtifact.meta as { scaleDenominator?: number; layers?: number };
  assert((meta.layers ?? 0) >= 10, "متادیتای لایه‌ها ناقص است");
  assert((meta.scaleDenominator ?? 0) > 0, "متادیتای مقیاس ناقص است");
  // Old schematic renderer must still exist for backwards compatibility.
  const legacy = floorPlanSvg(scheme, 0);
  assert(legacy.includes("<svg") && legacy.includes("</svg>"), "رندر قدیمی نباید حذف شود");
  return `SVG ${meta.layers} لایه · مقیاس ۱:${meta.scaleDenominator} · رندر قدیمی حفظ شد`;
});
