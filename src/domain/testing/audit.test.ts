import { generateSchemes, analyzeSite } from "../layout";
import { auditScheme, auditRoomDaylight, auditPatterns, measureWallClearance } from "../audit/geometryAudit";
import { collectPatternCandidates } from "../architecture/layoutEngine";
import { validateScheme } from "../codes";
import { applySetbacks, polygonArea, rectArea } from "../geometry";
import { DEFAULT_REQUIREMENTS, DEFAULT_SITE, applyRequirementsPatch } from "../requirements";
import { EXTERIOR_WALL_THICKNESS_M, SETBACK_REFERENCE } from "../constants";
import type { CanonicalScheme, Level, Requirements, SiteModel } from "../types";
import { FIXTURES } from "./fixtures";
import { approx, assert, test } from "./harness";

const programme = (): Requirements =>
  applyRequirementsPatch(DEFAULT_REQUIREMENTS, {
    dwellings: [
      { type: "twoBed", count: 4, targetAreaM2: 80, minAreaM2: 70 },
      { type: "threeBed", count: 2, targetAreaM2: 104, minAreaM2: 90 },
    ],
  });

const PARCELS: { id: string; site: SiteModel }[] = [
  {
    id: "rect-17x26",
    site: {
      ...DEFAULT_SITE,
      boundary: [
        { x: 0, y: 0 },
        { x: 17, y: 0 },
        { x: 17, y: 26 },
        { x: 0, y: 26 },
      ],
      spotLevels: [],
      setbacks: { north: 3, east: 3, south: 3, west: 3 },
    },
  },
  {
    id: "L-shape",
    site: {
      ...DEFAULT_SITE,
      boundary: [
        { x: 0, y: 0 },
        { x: 26, y: 0 },
        { x: 26, y: 16 },
        { x: 15, y: 16 },
        { x: 15, y: 28 },
        { x: 0, y: 28 },
      ],
      spotLevels: [],
      setbacks: { north: 3, east: 3, south: 3, west: 3 },
    },
  },
  {
    id: "irregular-hex",
    site: {
      ...DEFAULT_SITE,
      boundary: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 34, y: 10 },
        { x: 30, y: 26 },
        { x: 12, y: 30 },
        { x: 0, y: 22 },
      ],
      spotLevels: [],
      setbacks: { north: 4, east: 4, south: 4, west: 4 },
    },
  },
  {
    id: "asym-setbacks",
    site: {
      ...DEFAULT_SITE,
      boundary: [
        { x: 0, y: 0 },
        { x: 28, y: 0 },
        { x: 28, y: 34 },
        { x: 0, y: 34 },
      ],
      spotLevels: [],
      setbacks: { north: 6, east: 2, south: 4, west: 5 },
    },
  },
];

const RESULTS = PARCELS.map((parcel) => {
  try {
    return {
      parcel,
      schemes: generateSchemes(parcel.site, programme(), { seed: 20260401, variants: 3 }),
      error: null as string | null,
    };
  } catch (error) {
    return { parcel, schemes: [] as CanonicalScheme[], error: (error as Error).message };
  }
});

test("audit", "قرارداد عقب‌نشینی: مرجع = سطح خارجی دیوار، یکسان در کل موتور", () => {
  assert(SETBACK_REFERENCE === "outer-wall-face", "مرجع عقب‌نشینی باید سطح خارجی دیوار باشد");
  const analysis = analyzeSite(PARCELS[0].site);
  assert(analysis.setbackReference === "outer-wall-face", "تحلیل زمین باید همان مرجع را اعلام کند");
  const half = EXTERIOR_WALL_THICKNESS_M / 2;
  for (const side of ["north", "east", "south", "west"] as const) {
    approx(
      analysis.centrelineSetbacks[side],
      analysis.requestedSetbacks[side] + half,
      1e-9,
      `centreline setback ${side}`,
    );
  }
  // Independent expectation: parcel 17 wide, 3 m each side + half wall ⇒ 10.75 strip
  const expected = applySetbacks(PARCELS[0].site.boundary, analysis.centrelineSetbacks);
  approx(polygonArea(expected), analysis.buildableAreaM2, 0.01, "buildable area derives from the same convention");
  approx(analysis.buildableAreaM2, (17 - 2 * (3 + half)) * (26 - 2 * (3 + half)), 0.6, "expected centreline envelope");
  return `مرجع: ${analysis.setbackReference} · عقب‌نشینی محور = درخواست + ${half} m · ساخت‌پذیر ${analysis.buildableAreaM2.toFixed(2)} m²`;
});

test("audit", "فاصله واقعی سطح خارجی دیوار تا مرز زمین ≥ عقب‌نشینی درخواستی", () => {
  const rows: string[] = [];
  for (const result of RESULTS) {
    assert(!result.error, `${result.parcel.id}: ${result.error}`);
    for (const scheme of result.schemes) {
      const audit = auditScheme(scheme);
      assert(audit.setbackReference === "outer-wall-face", "گزارش باید مرجع را حمل کند");
      for (const level of audit.levels) {
        assert(level.clearances.length > 0, `${result.parcel.id}: هیچ دیوار پیرامونی بررسی نشد`);
        for (const row of level.clearances) {
          assert(
            row.distanceToBoundaryM >= row.requestedM - 0.01,
            `${result.parcel.id}/${scheme.code}/${level.name}: ${row.wallId} (${row.side}) فاصله ${row.distanceToBoundaryM} < درخواست ${row.requestedM}`,
          );
          approx(
            row.distanceToBoundaryM,
            row.requestedM + row.surplusM,
            0.002,
            `${row.wallId} surplus bookkeeping`,
          );
        }
        const finding = level.findings.find((entry) => entry.id === "AUDIT-SETBACK-FACE")!;
        assert(finding.status === "pass", `${result.parcel.id}/${scheme.code}: ${finding.id} = ${finding.status} (${finding.value})`);
      }
      const minSurplus = Math.min(...audit.levels.flatMap((level) => level.clearances.map((row) => row.surplusM)));
      rows.push(`${result.parcel.id}:${minSurplus >= 0 ? "+" : ""}${minSurplus.toFixed(3)}m`);
    }
  }
  return rows.join(" · ");
});

test("audit", "برای هر ضلع، فاصله اندازه‌گیری‌شده با درخواست همان جهت مقایسه می‌شود", () => {
  const asymmetric = RESULTS.find((result) => result.parcel.id === "asym-setbacks")!;
  assert(asymmetric.schemes.length > 0, `زمین با عقب‌نشینی نامتقارن باید طرح بدهد: ${asymmetric.error}`);
  const scheme = asymmetric.schemes[0];
  const audit = auditScheme(scheme);
  const requested = asymmetric.parcel.site.setbacks;
  const expected: Record<string, number> = { شمال: requested.north, جنوب: requested.south, شرق: requested.east, غرب: requested.west };
  const checked: string[] = [];
  for (const row of audit.levels[0].clearances) {
    approx(row.requestedM, expected[row.side], 1e-9, `${row.wallId} requested for ${row.side}`);
    checked.push(`${row.side}:${row.distanceToBoundaryM}/${row.requestedM}`);
  }
  assert(new Set(audit.levels[0].clearances.map((row) => row.side)).size >= 2, "باید حداقل دو جهت بررسی شود");
  return checked.slice(0, 6).join(" · ");
});

test("audit", "پنجره معتبر: روی دیوار پیرامونی همان فضا، با جرز کافی و بدون تعارض", () => {
  const outputs: string[] = [];
  for (const result of RESULTS) {
    assert(!result.error, `${result.parcel.id}: ${result.error}`);
    for (const scheme of result.schemes) {
      const audit = auditScheme(scheme);
      for (const levelAudit of audit.levels) {
        const { habitable, withValidWindow, rejected, rows } = levelAudit.daylight;
        assert(habitable > 0, `${result.parcel.id}: فضای قابل سکونت وجود ندارد`);
        for (const row of rows) {
          assert(row.windowIds.length === row.validWindows, `${row.roomId}: شمارش شناسه پنجره ناسازگار`);
        }
        const finding = levelAudit.findings.find((entry) => entry.id === "AUDIT-DAYLIGHT-VALID")!;
        if (withValidWindow === habitable) {
          assert(rejected.length === 0, "در حالت کامل نباید موردی رد شود");
          assert(finding.status === "pass", `${result.parcel.id}: ${finding.id}=${finding.status}`);
        } else {
          // Geometrically impossible daylight must be DECLARED: the finding can
          // never be `pass`, every rejected room needs a concrete reason, and
          // the underlying rule must carry the shortfall in its trace.
          assert(finding.status !== "pass", `${result.parcel.id}: نبود پنجره معتبر نباید pass گزارش شود`);
          assert(rejected.length > 0, "فضای بی‌نور باید فهرست شود");
          for (const row of rejected) {
            assert(row.reason.length > 10, `${row.roomId}: دلیل رد باید مشخص باشد`);
            assert(row.facadeM > 0, `${row.roomId}: اتاق باید به نما چسبیده باشد، نه بی‌نما`);
          }
          const rule = validateScheme(scheme).evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
          const structure = validateScheme(scheme).evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
          assert(
            rule.trace.some((entry) => entry.includes("نورگیری مستقل")) || structure.trace.some((entry) => entry.includes("بازبینی مستقل")),
            `${result.parcel.id}: کمبود نور باید در ردیابی قاعده دیده شود`,
          );
        }
        outputs.push(`${result.parcel.id}:${withValidWindow}/${habitable}`);
      }
    }
  }
  return outputs.slice(0, 6).join(" · ");
});

test("audit", "بازبینی پنجره واقعاً رکورد صوری را رد می‌کند (آزمون منفی)", () => {
  const scheme = JSON.parse(JSON.stringify(FIXTURES.cleanScheme)) as CanonicalScheme;
  const level = scheme.levels[0];
  const room = level.rooms.find((candidate) => candidate.habitable)!;
  const interior = (level.walls ?? []).find((wall) => !wall.envelope && wall.lengthM > 1.5)!;
  // 1) window on an interior wall: must not count.
  level.openings = [
    ...(level.openings ?? []).filter((opening) => !opening.roomIds.includes(room.id)),
    {
      id: "FAKE-1",
      wallId: interior.id,
      kind: "window",
      widthM: 1.2,
      heightM: 1.4,
      sillM: 0.9,
      center: { x: (interior.start.x + interior.end.x) / 2, y: (interior.start.y + interior.end.y) / 2 },
      stationM: interior.lengthM / 2,
      roomIds: [room.id],
      note: "fake",
    },
  ];
  const audit = auditScheme(scheme);
  const rejected = audit.levels[0].daylight.rejected.find((row) => row.roomId === room.id);
  assert(!!rejected, "پنجره روی دیوار داخلی نباید معتبر شمرده شود");
  assert(rejected!.reason.includes("پیرامونی نیست"), `دلیل باید صریح باشد: ${rejected!.reason}`);
  const finding = audit.levels[0].findings.find((entry) => entry.id === "AUDIT-DAYLIGHT-VALID")!;
  assert(finding.status !== "pass", "گزارش نباید pass باشد");

  // 2) window whose centre is off the wall axis: must not count.
  const envelope = (level.walls ?? []).find((wall) => wall.envelope && wall.lengthM > 2)!;
  level.openings = [
    ...(level.openings ?? []).filter((opening) => !opening.roomIds.includes(room.id)),
    {
      id: "FAKE-2",
      wallId: envelope.id,
      kind: "window",
      widthM: 1.2,
      heightM: 1.4,
      sillM: 0.9,
      center: { x: envelope.start.x + 40, y: envelope.start.y },
      stationM: envelope.lengthM / 2,
      roomIds: [room.id],
      note: "fake-off-axis",
    },
  ];
  const offAxis = auditRoomDaylight(level, 3);
  const offRow = offAxis.rows.find((row) => row.roomId === room.id)!;
  assert(offRow.validWindows === 0, "پنجره با مرکز خارج از محور دیوار نباید معتبر باشد");
  assert(offRow.reason.includes("محور دیوار") || offRow.reason.includes("جرز"), `دلیل: ${offRow.reason}`);
  return "دو پنجره صوری رد شد";
});

test("audit", "توپولوژی: هم‌پوشانی، شکاف واحد، دیوار معلق و بازشوی بیرون دیوار", () => {
  const rows: string[] = [];
  for (const result of RESULTS) {
    assert(!result.error, `${result.parcel.id}: ${result.error}`);
    for (const scheme of result.schemes) {
      const audit = auditScheme(scheme);
      for (const level of audit.levels) {
        const overlap = level.findings.find((entry) => entry.id === "AUDIT-ROOM-OVERLAP")!;
        assert(overlap.status === "pass", `${result.parcel.id}/${scheme.code}: ${overlap.value}`);
        assert(level.topology.roomOverlapM2 <= 0.05, `همپوشانی ${level.topology.roomOverlapM2}`);
        const coverage = level.findings.find((entry) => entry.id === "AUDIT-UNIT-COVERAGE")!;
        assert(coverage.status === "pass", `${result.parcel.id}/${scheme.code}: ${coverage.value} — ${coverage.detail}`);
        const openings = level.findings.find((entry) => entry.id === "AUDIT-OPENINGS-IN-WALLS")!;
        assert(openings.status === "pass", `${result.parcel.id}: ${openings.value}`);
        const spacing = level.findings.find((entry) => entry.id === "AUDIT-OPENING-SPACING")!;
        assert(spacing.status === "pass", `${result.parcel.id}: ${spacing.detail}`);
        const walls = level.findings.find((entry) => entry.id === "AUDIT-WALL-TOPOLOGY")!;
        assert(walls.status === "pass", `${result.parcel.id}/${scheme.code}: ${walls.value} — ${walls.detail}`);
        assert(level.topology.orphanWalls.length === 0, "دیوار بدون مالک");
        const inside = level.findings.find((entry) => entry.id === "AUDIT-INSIDE-PARCEL")!;
        assert(inside.status === "pass", `${result.parcel.id}: ${inside.value}`);
        rows.push(`${result.parcel.id}:ok`);
      }
    }
  }
  return `${rows.length} طبقه بدون نقص توپولوژی`;
});

test("audit", "تفکیک سطح ناخالص/خالص و جایگاه ضخامت دیوار شفاف است", () => {
  const scheme = FIXTURES.cleanScheme;
  const audit = auditScheme(scheme);
  for (const level of audit.levels) {
    assert(level.areaAccounting.exteriorThicknessM === EXTERIOR_WALL_THICKNESS_M, "ضخامت پیرامونی باید از ثابت مشترک بیاید");
    assert(level.areaAccounting.explanation.length > 40, "توضیح روش لازم است");
    const modelLevel = scheme.levels.find((entry) => entry.index === level.level) as Level;
    const roomSum = modelLevel.rooms.filter((room) => room.unitIndex >= 0).reduce((sum, room) => sum + room.areaM2, 0);
    approx(level.areaAccounting.sumRoomsM2, Number(roomSum.toFixed(2)), 0.05, "sum of rooms");
    const plateArea = modelLevel.plateRects.reduce((sum, plate) => sum + rectArea(plate), 0);
    approx(level.areaAccounting.grossPlateM2, Number(plateArea.toFixed(2)), 0.05, "gross plate");
    assert(level.areaAccounting.sumRoomsM2 <= level.areaAccounting.grossPlateM2 + 0.05, "خالص نباید از ناخالص بیشتر شود");
  }
  return `ناخالص ${audit.levels[0].areaAccounting.grossPlateM2} m² · جمع فضاها ${audit.levels[0].areaAccounting.sumRoomsM2} m² · ضخامت ${EXTERIOR_WALL_THICKNESS_M} m`;
});

test("audit", "همه الگوهای تولیدی (نه فقط انتخاب‌شده) بازبینی می‌شوند", () => {
  const scheme = FIXTURES.cleanScheme;
  const rows = auditPatterns(scheme.levels.slice(0, 1), scheme.units, (rect, type, ctx) =>
    collectPatternCandidates(rect, type, ctx),
  );
  assert(rows.length >= scheme.units.length * 2, `تعداد الگوهای بازبینی‌شده کم است: ${rows.length}`);
  const patterns = new Set(rows.map((row) => row.patternId));
  assert(patterns.size >= 2, `تنوع الگو کم است: ${[...patterns].join(",")}`);
  const overlapping = rows.filter((row) => row.overlapM2 > 0.05);
  assert(overlapping.length === 0, `الگوهای دارای هم‌پوشانی: ${overlapping.map((r) => `${r.patternId}=${r.overlapM2}`).join(",")}`);
  const outside = rows.filter((row) => row.outsideUnitRooms > 0);
  assert(outside.length === 0, `الگوهای با فضای بیرون واحد: ${outside.map((r) => r.patternId).join(",")}`);
  const poorCoverage = rows.filter((row) => row.coverageRatio < 0.9);
  assert(
    poorCoverage.length === 0,
    `الگوهای با پوشش ناکافی: ${poorCoverage.map((r) => `${r.patternId}=${r.coverageRatio}`).join(",")}`,
  );
  for (const row of rows) {
    assert(row.rooms > 0, `${row.patternId}: بدون فضا`);
    assert(row.windowableRooms <= row.facadeRooms + 0.001, `${row.patternId}: شمارش نمای نامعقول`);
  }
  return `${rows.length} الگو × ${scheme.units.length} واحد: ${[...patterns].join("، ")}`;
});

test("audit", "DATA-01-INTEGRITY از بازبینی مستقل تغذیه می‌شود و ناسازگاری واقعی را می‌گیرد", () => {
  for (const result of RESULTS) {
    assert(!result.error, `${result.parcel.id}: ${result.error}`);
    for (const scheme of result.schemes) {
      const report = validateScheme(scheme);
      const integrity = report.evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
      assert(integrity.status === "pass", `${result.parcel.id}/${scheme.code}: ${integrity.status} → ${integrity.trace.slice(-3).join(" | ")}`);
      assert(
        integrity.trace.some((entry) => entry.includes("بازبینی مستقل")),
        "ردیابی قاعده باید نتیجه بازبینی مستقل را نشان دهد",
      );
    }
  }
  // Now inject a genuine violation: window pushed outside its wall.
  const broken = JSON.parse(JSON.stringify(FIXTURES.cleanScheme)) as CanonicalScheme;
  const level = broken.levels[0];
  const window = level.openings!.find((opening) => opening.kind === "window")!;
  window.stationM = 1e6;
  const report = validateScheme(broken);
  const integrity = report.evaluations.find((e) => e.ruleId === "DATA-01-INTEGRITY")!;
  assert(integrity.status === "fail", `ناسازگاری تزریق‌شده باید گرفته شود: ${integrity.status}`);
  const audit = auditScheme(broken);
  assert(!audit.planValid, "بازبینی مستقل باید طرح را نامعتبر اعلام کند");
  return `همه طرح‌های معتبر pass؛ ناسازگاری تزریقی fail (${audit.failed} یافته)`;
});

test("audit", "اندازه‌گیری فاصله مستقل از موتور: دیوار روی محور ۳ با ضخامت ۰٫۲۵", () => {
  const scheme = FIXTURES.cleanScheme;
  const level = scheme.levels[0];
  const wall = (level.walls ?? []).find((candidate) => candidate.envelope && Math.abs(candidate.start.x - candidate.end.x) < 1e-6)!;
  const measured = measureWallClearance(wall, level.plateRects, scheme.site.boundary);
  const mid = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
  const face = { x: mid.x + measured.normal.x * (wall.thicknessM / 2), y: mid.y + measured.normal.y * (wall.thicknessM / 2) };
  // Non-circular independent checks (the face point itself is produced by the
  // audit, so recomputing the same minimum would just re-run the same code):
  //   a) the outer face is half a wall thickness outside the centreline, and
  //   b) the measured clearance lies between (centreline clearance − t/2) and
  //      the centreline clearance.
  const boundary = scheme.site.boundary;
  const nearest = (px: number, py: number) => {
    let best = Infinity;
    for (let i = 0; i < boundary.length; i++) {
      const a = boundary[i];
      const b = boundary[(i + 1) % boundary.length];
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const len2 = abx * abx + aby * aby;
      const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby) / len2));
      best = Math.min(best, Math.hypot(px - (a.x + abx * t), py - (a.y + aby * t)));
    }
    return best;
  };
  const offset = wall.thicknessM / 2;
  approx(
    Math.hypot(face.x - mid.x, face.y - mid.y),
    offset,
    0.01,
    "outer face sits half a wall thickness from the centreline",
  );
  const centreClearance = nearest(mid.x, mid.y);
  assert(
    measured.outerFaceDistanceM <= centreClearance + 0.02,
    `فاصله وجه ${measured.outerFaceDistanceM} نباید از فاصله محور ${centreClearance.toFixed(3)} بیشتر باشد`,
  );
  assert(
    measured.outerFaceDistanceM >= centreClearance - offset - 0.05,
    `کاهش فاصله بیش از نیم‌ضخامت است: ${measured.outerFaceDistanceM} در برابر ${centreClearance.toFixed(3)}`,
  );
  const requested = measured.side === "شرق" ? scheme.site.setbacks.east : measured.side === "غرب" ? scheme.site.setbacks.west : measured.side === "شمال" ? scheme.site.setbacks.north : scheme.site.setbacks.south;
  assert(measured.outerFaceDistanceM >= requested - 0.01, `فاصله ${measured.outerFaceDistanceM} < ${requested}`);
  return `${measured.side}: وجه ${face.x.toFixed(3)} → فاصله ${measured.outerFaceDistanceM} m (درخواست ${requested})`;
});
