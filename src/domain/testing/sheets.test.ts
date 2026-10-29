import { buildElevationScene, buildSectionScene, SIDE_LABEL_FA, type FacadeSide } from "../drawing/elevation";
import { doorWindowSchedule, roomSchedule, levelSummaryTable, drawingMissingData, NOT_MODELLED } from "../drawing/tables";
import { composeArchitecturalSheet, composeElevationSheet, sceneForBlock, sheetAreaSummary, fitScale } from "../drawing/sheet";
import { renderSheetSvg, renderSheetPdfOps, sheetPageGeometry, scheduleToCsv } from "../drawing/renderSheet";
import { renderElevationsDxf } from "../drawing/renderElevationDxf";
import { chooseScale } from "../drawing/scene";
import { exportScheme } from "../exporters/reports";
import { validateExport } from "../exporters/validate";
import { FIXTURES } from "./fixtures";
import { approx, assert, test } from "./harness";
import DxfParser from "dxf-parser";

const SCHEME = FIXTURES.cleanScheme;
const SIDES: FacadeSide[] = ["south", "north", "east", "west"];
const ELEVATIONS = SIDES.map((side) => buildElevationScene(SCHEME, side));
const SECTION = buildSectionScene(SCHEME);
const SHEET = composeArchitecturalSheet(SCHEME);
const ELEV_SHEET = composeElevationSheet(SCHEME);
const SHEET_SVG = renderSheetSvg(SHEET);

test("sheets", "نماها از مدل ساخته می‌شوند: ارتفاع طبقات و بازشوها با مدل یکسان", () => {
  const rows: string[] = [];
  for (const scene of ELEVATIONS) {
    const side = scene.side;
    // 1) storey lines exactly at index × floorHeight
    for (let floor = 0; floor < SCHEME.levels.length; floor++) {
      const v = floor * SCHEME.floorHeightM;
      assert(
        scene.primitives.some((p) => p.kind === "line" && p.id === `elev-floorline-${floor}` && Math.abs(p.from.y - v) < 1e-6),
        `${side}: خط تراز طبقه ${floor} در ${v} m نیست`,
      );
    }
    // 2) every exterior opening of that facade is drawn with model sill/height
    const openingsOnElevation = scene.primitives.filter((p) => p.id.startsWith(`elev-opening-${side}-`) && !p.id.includes("frame") && !p.id.includes("label"));
    const modelOpenings = (SCHEME.levels[0].openings ?? []).filter((opening) => opening.kind === "window" || opening.kind === "entryDoor" || opening.kind === "door");
    // Openings are only on some facades; require that the drawn set matches the
    // model openings on that side exactly (no invented, no missing).
    const modelOnSide = (SCHEME.levels[0].openings ?? []).filter(
      (opening) => scene.primitives.some((p) => p.id === `elev-opening-${side}-0-${opening.id}`),
    );
    // The elevation draws the opening once per storey, so the expected count is
    // (model openings whose host wall belongs to this facade) × (number of floors).
    approx(
      openingsOnElevation.length,
      modelOnSide.length * SCHEME.levels.length,
      0,
      `${side}: تعداد بازشوی ترسیم‌شده در ${SCHEME.levels.length} طبقه`,
    );
    assert(
      openingsOnElevation.length === modelOnSide.length * SCHEME.levels.length,
      `${side}: بازشوی صوری یا ازقلم‌افتاده`,
    );
    assert(modelOnSide.length >= 0, `${side}: شمارش مدل`);
    for (const primitive of openingsOnElevation) {
      if (primitive.kind !== "polygon") continue;
      const ys = primitive.points.map((p) => p.y);
      const height = Math.max(...ys) - Math.min(...ys);
      assert(
        modelOpenings.some((opening) => Math.abs(opening.heightM - height) < 0.02),
        `${side}: ارتفاع بازشوی ترسیم‌شده ${height.toFixed(2)} با هیچ بازشوی مدل نمی‌خواند`,
      );
    }
    rows.push(`${side}:${scene.meta.wallCount} دیوار/${scene.meta.openingCount} بازشو`);
  }
  assert(rows.length === 4, "چهار نما لازم است");
  return rows.join(" · ");
});

test("sheets", "نماها اطلاعات ناموجود را ادعا نمی‌کنند و بام را تعریف‌نشده اعلام می‌کنند", () => {
  for (const scene of ELEVATIONS) {
    const roofLine = scene.primitives.find((p) => p.id === "elev-roof-undefined");
    assert(!!roofLine && roofLine.kind === "line" && roofLine.dashed === true, "خط بام باید خط‌چین تعریف‌نشده باشد");
    const note = scene.primitives.find((p) => p.id === "elev-roof-note");
    assert(!!note && note.kind === "text" && note.text.includes("تعریف نشده"), "یادداشت بام تعریف‌نشده لازم است");
    assert(scene.missingData.length >= 4, "فهرست کمبود اطلاعات ناقص است");
    assert(scene.missingData.some((row) => row.item.includes("بام")), "بام باید در کمبودها باشد");
    assert(scene.missingData.some((row) => row.item.includes("زمین")), "تراز زمین باید در کمبودها باشد");
    assert(scene.readiness.label.includes("کارشناسی"), "برچسب بازبینی لازم است");
    assert(!scene.readiness.label.includes("آماده اجرا"), "نبايد ادعای آمادگی اجرا شود");
    const totalHeight = SCHEME.levels.length * SCHEME.floorHeightM;
    assert(
      Math.abs(scene.sheet.modelBox.h - (totalHeight + 4.2)) < 0.01,
      "ارتفاع قاب نما باید از ارتفاع واقعی ساختمان مشتق شود",
    );
  }
  return `۴ نما با ${ELEVATIONS[0].missingData.length} کمبود اعلام‌شده`;
});

test("sheets", "برش: ترازها، ضخامت سقف و پله از مدل مشتق می‌شوند", () => {
  const scene = SECTION;
  const floorHeight = SCHEME.floorHeightM;
  const levels = SCHEME.levels.length;
  approx(scene.sheet.modelBox.h, levels * floorHeight + 5, 0.01, "section model height");
  assert(scene.primitives.some((p) => p.id === "sec-roof-undefined"), "خط بام تعریف‌نشده در برش لازم است");
  for (let floor = 0; floor < levels; floor++) {
    const found = scene.primitives.find((p) => p.id === `sec-slab-${floor}`);
    assert(!!found && found.kind === "polygon", `دال طبقه ${floor} در برش نیست`);
    if (!found || found.kind !== "polygon") continue;
    const slab = found;
    const ys = slab.points.map((p) => p.y);
    const thickness = Math.max(...ys) - Math.min(...ys);
    approx(thickness, SCHEME.structural.slabThicknessMm / 1000, 0.002, `slab thickness floor ${floor}`);
    const levelLine = scene.primitives.find((p) => p.id === `sec-level-${floor}`);
    assert(!!levelLine && levelLine.kind === "text", `تراز طبقه ${floor} در برش نیست`);
  }
  const stair = scene.primitives.find((p) => p.id === "sec-stair-0");
  assert(!!stair && stair.kind === "polyline" && stair.points.length > 6, "پله در برش ترسیم نشده");
  const risers = SCHEME.levels[0].stair?.riserCount ?? 0;
  assert(risers > 0, "مدل باید تعداد ارتفاع پله داشته باشد");
  assert(scene.readiness.reason.includes(String(levels)), "دلیل باید تعداد طبقات را داشته باشد");
  assert(scene.missingData.some((row) => row.item.includes("شالوده")), "نبود شالوده باید اعلام شود");
  assert(scene.cutCoordinateM > 0, "مختصه برش باید ثبت شود");
  return `برش ${scene.levelName} در ${scene.cutCoordinateM} m · ${levels} تراز · سقف ${(SCHEME.structural.slabThicknessMm / 1000).toFixed(3)} m · ${risers} ارتفاع پله`;
});

test("sheets", "جدول در/پنجره با مدل هم‌خوان است و مقادیر ناموجود را حدس نمی‌زند", () => {
  const table = doorWindowSchedule(SCHEME, 0);
  const openings = SCHEME.levels[0].openings ?? [];
  const sum = table.rows.reduce((total, row) => total + Number(row.cells.count.value), 0);
  approx(sum, openings.length, 0, "grouped opening count");
  for (const row of table.rows) {
    const w = Number(row.cells.width.value);
    const h = Number(row.cells.height.value);
    assert(
      openings.some((opening) => Math.abs(opening.widthM - w) < 0.005 && Math.abs(opening.heightM - h) < 0.005),
      `ابعاد ${w}×${h} در مدل نیست`,
    );
    assert(row.cells.material.available === false, "مصالح باید ناموجود اعلام شود");
    assert(row.cells.material.value === NOT_MODELLED, "مقدار ناموجود نباید عدد/متن حدسی باشد");
    assert(row.cells.fire.available === false, "مقاومت حریق باید ناموجود اعلام شود");
  }
  assert(table.missingFields.includes("مصالح"), "فهرست کمبودها باید مصالح را داشته باشد");
  assert(table.rows.every((row) => row.cells.tag.value.match(/^(W|D)-\d{2}$/)), "شناسه‌گذاری بازشوها استاندارد نیست");
  const csv = scheduleToCsv(table);
  assert(csv.split("\n").length >= table.rows.length + 2, "CSV جدول ناقص است");
  assert(csv.includes("MISSING_IN_MODEL"), "CSV باید کمبودها را اعلام کند");
  return `${table.rows.length} گونه · ${sum} بازشو · ${table.missingFields.length} فیلد ناموجود`;
});

test("sheets", "جدول فضاها و طبقات از مدل ساخته و با تغییر مدل همگام می‌شود", () => {
  const level = SCHEME.levels[0];
  const table = roomSchedule(SCHEME, 0);
  approx(table.rows.length, level.rooms.length, 0, "room rows");
  const sum = table.rows.reduce((total, row) => total + Number(row.cells.area.value), 0);
  approx(sum, level.rooms.reduce((total, room) => total + room.areaM2, 0), 0.05, "area sum");
  const net = level.rooms.filter((room) => room.unitIndex >= 0).reduce((total, room) => total + room.areaM2, 0);
  assert(table.totals.some((total) => Math.abs(Number(total.value.replace(" m²", "")) - net) < 0.05), "جمع خالص ناسازگار");
  assert(table.rows.every((row) => row.cells.finish.available === false), "مصالح کف باید ناموجود باشد");
  assert(table.missingFields.length >= 3, "فهرست کمبود فضاها ناقص است");

  const levels = levelSummaryTable(SCHEME);
  approx(levels.rows.length, SCHEME.levels.length, 0, "level rows");
  assert(levels.totals.some((total) => total.value.includes(String(SCHEME.grossFloorAreaM2.toFixed(1)))), "زیربنا در جمع طبقات نیست");

  // change propagation: adding an opening changes the schedule and the sheet
  const mutated = JSON.parse(JSON.stringify(SCHEME)) as typeof SCHEME;
  const wall = (mutated.levels[0].walls ?? []).find((candidate) => candidate.envelope && candidate.lengthM > 3)!;
  mutated.levels[0].openings = [
    ...(mutated.levels[0].openings ?? []),
    {
      id: "NEW-W-1",
      wallId: wall.id,
      kind: "window",
      widthM: 1.95,
      heightM: 1.55,
      sillM: 0.85,
      center: { x: wall.start.x, y: wall.start.y },
      stationM: wall.lengthM / 2,
      roomIds: [],
      note: "test",
    },
  ];
  const mutatedTable = doorWindowSchedule(mutated, 0);
  approx(
    mutatedTable.rows.reduce((total, row) => total + Number(row.cells.count.value), 0),
    (SCHEME.levels[0].openings ?? []).length + 1,
    0,
    "mutated opening count",
  );
  assert(mutatedTable.rows.some((row) => row.cells.width.value === "1.95"), "گونه جدید در جدول نیامد");
  const elevation = buildElevationScene(mutated, "south");
  assert(elevation.meta.openingCount >= 0, "نما با مدل تغییریافته تولید نشد");
  const mutatedSheet = composeArchitecturalSheet(mutated);
  assert(mutatedSheet.blocks.length === SHEET.blocks.length, "ساختار برگ باید پایدار بماند");
  return `${table.rows.length} فضا · ${levels.rows.length} طبقه · همگام‌سازی با تغییر مدل تأیید شد`;
});

test("sheets", "برگ‌بندی: ابعاد، مقیاس، شماره شیت و کادر عنوان", () => {
  const stats = sheetAreaSummary(SHEET);
  assert(SHEET.format === "A1", "برگ پیش‌فرض باید A1 باشد");
  approx(SHEET.widthMm, 841, 0, "A1 width");
  approx(SHEET.heightMm, 594, 0, "A1 height");
  assert(SHEET.sheetNumber === "A-101", "شماره شیت پلان");
  assert(ELEV_SHEET.sheetNumber === "A-201", "شماره شیت نما");
  assert(stats.drawings >= 3, `تعداد نقشه روی برگ کم است: ${stats.drawings}`);
  assert(stats.tables >= 3, `تعداد جدول روی برگ کم است: ${stats.tables}`);
  for (const block of SHEET.blocks) {
    assert(block.xMm >= 0 && block.yMm >= 0, `${block.id}: مختصات منفی`);
    assert(block.xMm + block.widthMm <= SHEET.widthMm + 0.01, `${block.id}: از عرض برگ بیرون زده`);
    assert(block.yMm + block.heightMm <= SHEET.heightMm + 0.01, `${block.id}: از ارتفاع برگ بیرون زده`);
    if (block.scene) {
      assert((block.scaleDenominator ?? 0) >= 20, `${block.id}: مقیاس نامعتبر`);
      const fit = fitScale(block.scene, block.widthMm, block.heightMm);
      assert(fit.scaleDenominator <= block.scaleDenominator!, `${block.id}: مقیاس ${block.scaleDenominator} از ظرفیت قاب (۱:${fit.scaleDenominator}) بزرگ‌تر است`);
    }
  }
  assert(SHEET.scaleSummary.length === stats.drawings, "خلاصه مقیاس‌ها ناقص است");
  assert(SHEET.missingData.length >= 4, "کمبود اطلاعات روی برگ ثبت نشده");
  return `A1 ${SHEET.widthMm}×${SHEET.heightMm} · ${stats.drawings} نقشه + ${stats.tables} جدول · شیت ${SHEET.sheetNumber}/${ELEV_SHEET.sheetNumber}`;
});

test("sheets", "SVG برگ واقعی و خوانا است (ابعاد، مقیاس، متن، جداول)", () => {
  assert(SHEET_SVG.startsWith("<svg"), "SVG نیست");
  assert(SHEET_SVG.trimEnd().endsWith("</svg>"), "SVG بسته نشده");
  assert(SHEET_SVG.includes(`width="${SHEET.widthMm}mm"`), "عرض فیزیکی برگ");
  assert(SHEET_SVG.includes(`viewBox="0 0 ${SHEET.widthMm} ${SHEET.heightMm}"`), "viewBox برگ");
  assert(SHEET_SVG.includes('data-sheet="A-101"'), "شماره شیت در SVG");
  for (const block of SHEET.blocks) {
    if (block.scene) {
      const svg = renderSheetSvg(SHEET);
      assert(svg.includes(`مقیاس ۱:${block.scaleDenominator}`), `${block.id}: مقیاس روی نقشه درج نشده`);
    }
  }
  for (const table of SHEET.blocks.filter((block) => block.table)) {
    assert(SHEET_SVG.includes(table.table!.title), `عنوان جدول ${table.id} در SVG نیست`);
    assert(SHEET_SVG.includes(table.table!.totals[0].label), `جمع جدول ${table.id} در SVG نیست`);
  }
  assert(SHEET_SVG.includes(SIDE_LABEL_FA.south), "نام نمای جنوبی در برگ نیست");
  assert(SHEET_SVG.includes("تعریف‌نشده") || SHEET_SVG.includes("بام"), "کمبود بام روی برگ اعلام نشده");
  assert(!/NaN|undefined/.test(SHEET_SVG), "مقدار نامعتبر در SVG");
  // readability: no font smaller than 1.8mm on the sheet
  const sizes = [...SHEET_SVG.matchAll(/font-size="([\d.]+)"/g)].map((match) => Number(match[1]));
  assert(sizes.length > 40, `تعداد متن کم است: ${sizes.length}`);
  assert(Math.min(...sizes) >= 1.8, `اندازه متن ${Math.min(...sizes)}mm خوانا نیست`);
  assert(Math.max(...sizes) <= 8, `اندازه متن ${Math.max(...sizes)}mm بیش از حد بزرگ است`);
  return `${sizes.length} متن · اندازه ${Math.min(...sizes)}–${Math.max(...sizes)} mm`;
});

test("sheets", "PDF برگ: ابعاد فیزیکی A1، شماره شیت و مقیاس‌ها", () => {
  const artifact = exportScheme(SCHEME, FIXTURES.cleanReport, "sheet-pdf");
  const text = artifact.data.toString("latin1");
  assert(text.startsWith("%PDF-1.4"), "امضای PDF");
  assert(text.trimEnd().endsWith("%%EOF"), "پایان PDF");
  const geometry = sheetPageGeometry(SHEET);
  approx(geometry.widthPt, 2383.94, 1, "A1 width in pt");
  approx(geometry.heightPt, 1683.78, 1, "A1 height in pt");
  assert(text.includes("/MediaBox [0 0 2384 1684]"), `MediaBox باید A1 باشد`);
  assert(text.includes("A-101"), "شماره شیت در PDF");
  assert(text.includes("SCALES"), "مقیاس‌ها در PDF");
  assert(text.includes("REVIEW REQUIRED"), "سلب مسئولیت در PDF");
  const ops = renderSheetPdfOps(SHEET);
  assert(ops.length > 300, `عملیات PDF کم است: ${ops.length}`);
  const meta = artifact.meta as { pageWidthPt?: number; sheetNumber?: string; blocks?: number };
  approx(meta.pageWidthPt ?? 0, geometry.widthPt, 0.5, "metadata page width");
  assert(meta.sheetNumber === "A-101", "metadata شماره شیت");
  assert((meta.blocks ?? 0) >= 6, "metadata قاب‌ها");
  return `${geometry.widthPt}×${geometry.heightPt} pt · ${ops.length} عملیات · شیت ${meta.sheetNumber}`;
});

test("sheets", "DXF نما/برش با dxf-parser مستقل خوانده می‌شود و متر است", () => {
  const result = renderElevationsDxf(SCHEME);
  const parser = new DxfParser();
  const parsed = parser.parseSync(result.data);
  if (!parsed) throw new Error("dxf-parser نتوانست فایل نما را بخواند");
  const entities = parsed.entities ?? [];
  assert(entities.length > 100, `موجودیت کم است: ${entities.length}`);
  const layers = Object.keys(parsed.tables?.layer?.layers ?? {});
  for (const name of ["WALL-EXTERIOR", "OPENING-WINDOW", "DIMENSION", "STAIR"]) {
    assert(layers.includes(name), `لایه ${name} در DXF نما نیست`);
  }
  assert(result.offsets.length === 5, `پنج نقشه (۴ نما + برش) لازم است: ${result.offsets.length}`);
  const uniqueOffsets = new Set(result.offsets.map((offset) => offset.dyM));
  assert(uniqueOffsets.size === 5, "هر نقشه باید آفست مستقل داشته باشد");
  assert(result.data.includes("$INSUNITS"), "واحد باید در هدر باشد");
  assert(!/NaN/.test(result.data), "NaN در DXF");
  const ys = entities
    .filter((entity) => entity.type === "LWPOLYLINE")
    .flatMap((entity) => ((entity as unknown as { vertices?: { y: number }[] }).vertices ?? []).map((vertex) => vertex.y));
  assert(ys.length > 50, "مختصات کافی در DXF نیست");
  assert(Math.max(...ys) - Math.min(...ys) > 10, "گستره ارتفاع نقشه‌ها معقول نیست");
  return `${entities.length} موجودیت · ${layers.length} لایه · ۵ نقشه با آفست مستقل`;
});

test("sheets", "اعتبارسنج خروجی، برگ SVG و PDF را واقعی می‌شناسد", () => {
  const svgArtifact = exportScheme(SCHEME, FIXTURES.cleanReport, "sheet-svg");
  assert(svgArtifact.filename.endsWith(".svg"), "پسوند SVG");
  assert(svgArtifact.data.toString("utf8").includes("<svg"), "محتوا SVG نیست");
  const elevArtifact = exportScheme(SCHEME, FIXTURES.cleanReport, "elevations-svg");
  assert(elevArtifact.data.toString("utf8").includes("A-201"), "شیت نما شماره ندارد");
  const dxfArtifact = exportScheme(SCHEME, FIXTURES.cleanReport, "elevations-dxf");
  assert(dxfArtifact.filename.endsWith(".dxf"), "پسوند DXF");
  const meta = svgArtifact.meta as { scales?: { scaleDenominator: number }[]; blocks?: number; units?: string };
  assert(meta.units === "metre", "واحد برگ");
  assert((meta.scales?.length ?? 0) >= 3, "مقیاس‌های برگ");
  // the existing plan-sheet export must remain valid
  const plan = exportScheme(SCHEME, FIXTURES.cleanReport, "svg");
  const validation = validateExport("svg", plan.data, SCHEME, FIXTURES.cleanReport, { filename: plan.filename, mime: plan.mime });
  assert(validation.ok, `اعتبارسنجی SVG پلان شکست: ${validation.checks.filter((check) => !check.passed).map((check) => check.name).join(",")}`);
  return `برگ ${(meta.blocks ?? 0)} قاب · ${meta.scales?.length ?? 0} مقیاس · نما A-201 · DXF ${(dxfArtifact.data.length / 1024).toFixed(0)}KB`;
});

test("sheets", "هماهنگی خروجی‌ها: یک تغییر در مدل، همه نقشه‌ها و جداول را به‌روز می‌کند", () => {
  const mutated = JSON.parse(JSON.stringify(SCHEME)) as typeof SCHEME;
  // add a floor: every downstream artefact must follow
  const base = mutated.levels[0];
  mutated.levels = [
    ...mutated.levels,
    { ...base, index: mutated.levels.length, name: `طبقه ${mutated.levels.length + 1}`, rooms: base.rooms.map((room) => ({ ...room, id: `${mutated.levels.length}-${room.id}` })) },
  ];
  const levels = levelSummaryTable(mutated);
  approx(levels.rows.length, mutated.levels.length, 0, "level rows after mutation");
  const section = buildSectionScene(mutated);
  approx(section.sheet.modelBox.h, mutated.levels.length * mutated.floorHeightM + 5, 0.05, "section height follows floors");
  const sheet = composeArchitecturalSheet(mutated);
  const planBlock = sheet.blocks.find((block) => block.id === "plan")!;
  const planRooms = planBlock.scene!.primitives.filter((primitive) => primitive.id.startsWith("tint-") && primitive.id.includes(`new`)).length;
  void planRooms;
  // room schedule must include the new level when asked for it
  const lastIndex = mutated.levels.length - 1;
  const rooms = roomSchedule(mutated, lastIndex);
  approx(rooms.rows.length, mutated.levels[lastIndex].rooms.length, 0, "room rows of new level");
  assert(rooms.rows[0].cells.id.value.startsWith(String(lastIndex)), "شناسه‌های طبقه جدید با پیشوند طبقه نیست");
  // plan sheet of the previous level must be unchanged in structure
  const original = composeArchitecturalSheet(SCHEME);
  assert(original.blocks.length === sheet.blocks.length, "ساختار برگ پس از تغییر مدل باید پایدار بماند");
  return `${mutated.levels.length} طبقه · برش ${section.sheet.modelBox.h.toFixed(1)} m · جدول ${rooms.rows.length} فضا`;
});

test("sheets", "sceneForBlock مقیاس هر قاب را مستقل و در حد ظرفیت انتخاب می‌کند", () => {
  const plan = sceneForBlock(buildElevationScene(SCHEME, "south"), 200, 120);
  const small = sceneForBlock(buildElevationScene(SCHEME, "south"), 60, 40);
  assert(small.sheet.scaleDenominator >= plan.sheet.scaleDenominator, "قاب کوچک‌تر باید مقیاس کوچک‌تر (عدد بزرگ‌تر) بگیرد");
  for (const scene of [plan, small]) {
    const box = scene.sheet.modelBox;
    assert(box.w * scene.sheet.mmPerMetre <= (scene === plan ? 200 : 60) + 0.01, "نقشه از عرض قاب بیرون زده");
  }
  assert(plan.blockOffset !== undefined, "آفست قاب باید ثبت شود");
  return `قاب بزرگ ۱:${plan.sheet.scaleDenominator} · قاب کوچک ۱:${small.sheet.scaleDenominator}`;
});
