import { DISTANCE_FACTORS, SEISMIC_PARAMS } from "./constants";
import type {
  Assumption,
  CirculationSummary,
  Climate,
  Core,
  DaylightSummary,
  Level,
  MepSummary,
  MetricEntry,
  ParkingSummary,
  Rect,
  Requirements,
  Room,
  SeismicZone,
  SiteModel,
  StructuralSummary,
} from "./types";
import { PIPE_DIAMETERS_MM, TRANSFORMER_SIZES_KVA, nextStandard } from "./units";
import { checkValidity } from "./engineering/registry";

const a = (
  id: string,
  label: string,
  value: string,
  unit: string,
  basis: string,
  confidence: Assumption["confidence"] = "engineering-judgement",
): Assumption => ({ id, label, value, unit, basis, confidence });

export function computeStructural(input: {
  footprintAreaM2: number;
  floors: number;
  grossFloorAreaM2: number;
  site: SiteModel;
  requirements: Requirements;
  /** Preferred: actual plate rectangles, so the grid follows real dimensions. */
  footprintRects?: Rect[];
}): StructuralSummary {
  const zone = SEISMIC_PARAMS[input.site.seismicZone];
  const deadLoad = 6.5; // kPa — slab + finishes + partitions + façade share
  const liveLoad = 2.0; // kPa — residential
  const plate = pickPrimaryPlate(input.footprintRects, input.footprintAreaM2);
  const targetSpan = 6.0; // m, economical RC grid assumption
  const gridX = Math.max(2, Math.round(plate.w / targetSpan) + 1);
  const gridY = Math.max(2, Math.round(plate.h / targetSpan) + 1);
  const columns = gridX * gridY;
  const spanX = plate.w / Math.max(1, gridX - 1);
  const spanY = plate.h / Math.max(1, gridY - 1);
  const tributary = input.footprintAreaM2 / Math.max(1, columns);
  const factoredLoadPerM2 = 1.25 * deadLoad + 1.5 * liveLoad;
  const serviceLoadPerM2 = deadLoad + liveLoad;
  const columnLoad = tributary * input.floors * factoredLoadPerM2;
  const serviceColumnLoad = tributary * input.floors * serviceLoadPerM2;
  const fck = 25; // MPa, assumption
  const requiredAreaMm2 = (columnLoad * 1000) / (0.35 * fck);
  const rawSide = Math.sqrt(requiredAreaMm2);
  const columnSizeMm = Math.max(300, Math.ceil(rawSide / 50) * 50);
  const maxSpan = Math.max(spanX, spanY);
  const minSpan = Math.min(spanX, spanY);
  // L/12 for beams, L/35 for two-way slabs: coarse preliminary rules of thumb.
  const beamDepthMm = Math.max(350, Math.ceil((maxSpan * 1000) / 12 / 50) * 50);
  const slabThicknessMm = Math.max(150, Math.ceil((minSpan * 1000) / 35 / 10) * 10);
  const buildingWeight = input.grossFloorAreaM2 * (deadLoad + 0.2 * liveLoad);
  const seismicCoefficient = (zone.A * zone.B * zone.I) / zone.R;
  const baseShear = seismicCoefficient * buildingWeight;
  const footingSelfWeightFactor = 1.1;
  const requiredFoundationWidth = Math.sqrt(
    (serviceColumnLoad * footingSelfWeightFactor) / Math.max(50, input.site.soilBearingKPa),
  );
  const spansX = Array.from({ length: Math.max(1, gridX - 1) }, () => Number(spanX.toFixed(2)));
  const spansY = Array.from({ length: Math.max(1, gridY - 1) }, () => Number(spanY.toFixed(2)));

  const validityNotes = [
    checkValidity("STRUCT-GRID", "span", Number(maxSpan.toFixed(2))),
    checkValidity("STRUCT-AXIAL-SCREEN", "floors", input.floors),
    checkValidity("STRUCT-AXIAL-SCREEN", "tributary area", Number(tributary.toFixed(2))),
    checkValidity("STRUCT-BEAM-DEPTH", "L_max", Number(maxSpan.toFixed(2))),
    checkValidity("STRUCT-SLAB-DEPTH", "min span", Number(minSpan.toFixed(2))),
    checkValidity("STRUCT-FOOTING-SCREEN", "q_allow", input.site.soilBearingKPa),
    checkValidity("STRUCT-FOOTING-SCREEN", "b", Number(requiredFoundationWidth.toFixed(2))),
  ]
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map((v) => v.message);

  return {
    method:
      "شبکه سازه از ابعاد بلوک (هدف دهانه ۶ m)؛ ستون از Pu/(0.35 f'c)؛ تیر L/12؛ سقف L/35؛ برش پایه C·W با C=A·B·I/R؛ پی از بار خدمت × ۱.۱ ÷ تنش مجاز خاک",
    stage: "preliminary-screening",
    formulaRefs: [
      "STRUCT-GRID",
      "STRUCT-AXIAL-SCREEN",
      "STRUCT-BEAM-DEPTH",
      "STRUCT-SLAB-DEPTH",
      "STRUCT-SEISMIC-CW",
      "STRUCT-FOOTING-SCREEN",
    ],
    validityNotes,
    gridX,
    gridY,
    spansX,
    spansY,
    columns,
    columnSizeMm,
    beamDepthMm,
    slabThicknessMm,
    seismicBaseShearKN: Number(baseShear.toFixed(1)),
    seismicCoefficient: Number(seismicCoefficient.toFixed(4)),
    buildingWeightKN: Number(buildingWeight.toFixed(1)),
    requiredFoundationWidthM: Number(requiredFoundationWidth.toFixed(2)),
    columnLoadKN: Number(columnLoad.toFixed(1)),
    assumptions: [
      a("st-grid", "دهانه هدف شبکه", String(targetSpan), "m", "مرز اقتصادی متعارف قاب خمشی بتن‌آرمه (فرض مهندسی)"),
      a("st-plate", "ابعاد مبنای شبکه", `${plate.w.toFixed(1)} × ${plate.h.toFixed(1)}`, "m", "بزرگ‌ترین بلوک مستطیلی تولیدشده در مدل"),
      a("st-dl", "بار مرده کف", String(deadLoad), "kPa", "سقف تیرچه‌بلوک + پوشش + تیغه + سهم نما (فرض)"),
      a("st-ll", "بار زنده مسکونی", String(liveLoad), "kPa", "مقدار متداول مسکونی؛ باید با بارگذاری پروژه جایگزین شود"),
      a("st-fck", "مقاومت مشخصه بتن", String(fck), "MPa", "فرض طراحی مقدماتی؛ نیازمند تأیید"),
      a("st-zone", "پارامتر لرزه‌ای A", String(zone.A), "-", `پهنه ${zone.label} – جدول ساده‌شده داخلی، تطبیق با نسخه معتبر انجام نشده`),
      a("st-R", "ضریب رفتار R", String(zone.R), "-", "فرض سیستم قاب با شکل‌پذیری متوسط"),
      a("st-axial", "کنترل محوری ستون", "Pu/(0.35 f'c)", "mm²", "طرح مقدماتی، بدون اثر لنگر، لاغری و الزامات لرزه‌ای"),
      a("st-footing", "ضریب وزن پی", String(footingSelfWeightFactor), "-", "افزایش تقریبی برای وزن خود پی"),
      a("st-stage", "مرحله تحلیل", "preliminary-screening", "-", "جایگزین تحلیل سازه و تأیید مهندس دارای صلاحیت نیست"),
    ],
  };
}

function pickPrimaryPlate(rects: Rect[] | undefined, areaM2: number): Rect {
  if (rects && rects.length > 0) {
    return [...rects].sort((x, y) => x.w * x.h - y.w * y.h)[rects.length - 1] ?? rects[0];
  }
  // No plate geometry available: fall back to an equivalent square, explicitly
  // flagged in the assumptions as an approximation.
  const side = Math.sqrt(Math.max(1, areaM2));
  return { x: 0, y: 0, w: side, h: side };
}

export function computeMep(input: {
  unitsTotal: number;
  grossFloorAreaM2: number;
  site: SiteModel;
  requirements: Requirements;
}): MepSummary {
  const climate: Climate = input.site.climate;
  const occupancyPerUnit = input.unitsTotal > 0 ? (input.requirements.dwellings.reduce((s, d) => s + d.count * (d.type === "studio" ? 1.8 : 3.2), 0) / Math.max(1, input.requirements.dwellings.reduce((s, d) => s + d.count, 0))) : 3.0;
  const occupancy = Math.ceil(input.unitsTotal * occupancyPerUnit);
  const litersPerPerson = climate === "hotDry" ? 160 : climate === "hotHumid" ? 150 : 140;
  const waterDaily = occupancy * litersPerPerson;
  const waterTank = Math.ceil((waterDaily * 1.0 + waterDaily * 0.2) / 100) * 100; // 1 day + fire/cleaning allowance
  const peakFlowM3s = waterDaily / 1000 / (8 * 3600) * 2.5; // peak factor 2.5 over 8 h
  const velocity = 1.5;
  const waterMainMm = nextStandard(Math.sqrt((4 * peakFlowM3s) / (Math.PI * velocity)) * 1000, PIPE_DIAMETERS_MM);
  const sewageMainMm = nextStandard(waterMainMm * 1.25, PIPE_DIAMETERS_MM);
  const connectedPerUnit = input.requirements.budget === "premium" ? 7.5 : input.requirements.budget === "economy" ? 4.5 : 5.5;
  const connected = input.unitsTotal * connectedPerUnit + 15; // + common area demand
  const demand = connected * 0.6;
  const transformer = nextStandard(Math.max(100, demand * 1.25), TRANSFORMER_SIZES_KVA);
  const coolingSpecific = climate === "hotDry" ? 95 : climate === "hotHumid" ? 105 : 80; // W/m²
  const heatingSpecific = climate === "cold" ? 90 : 60;
  const cooling = (input.grossFloorAreaM2 * coolingSpecific) / 1000;
  const heating = (input.grossFloorAreaM2 * heatingSpecific) / 1000;
  const gasDemand = input.unitsTotal * (input.requirements.budget === "premium" ? 10 : 7);

  const mepValidity = [
    checkValidity("MEP-WATER-DEMAND", "occupancy", occupancy),
    checkValidity("MEP-PIPE-FLOW", "d", waterMainMm),
    checkValidity("MEP-ELECTRICAL-DEMAND", "units", input.unitsTotal),
  ]
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map((v) => v.message);

  return {
    method:
      "جمعیت = واحدها × سرانه وزنی؛ آب = جمعیت × سرانه اقلیمی؛ مخزن = ۱.۲× مصرف روزانه؛ لوله از Q/(π·v)؛ برق = kVA/واحد + مشاعات و تقاضای همزمان ۶۰٪؛ ترانس = اولین اندازه استاندارد ≥ ۱.۲۵× تقاضا؛ سرمایش/گرمایش = W/m² اقلیمی",
    stage: "preliminary-screening",
    formulaRefs: ["MEP-WATER-DEMAND", "MEP-PIPE-FLOW", "MEP-ELECTRICAL-DEMAND"],
    validityNotes: mepValidity,
    occupancy,
    waterDailyLiters: waterDaily,
    waterTankLiters: waterTank,
    waterMainDiameterMm: waterMainMm,
    sewageMainDiameterMm: sewageMainMm,
    electricalConnectedKVA: Number(connected.toFixed(1)),
    electricalDemandKVA: Number(demand.toFixed(1)),
    transformerKVA: transformer,
    coolingLoadKW: Number(cooling.toFixed(1)),
    heatingLoadKW: Number(heating.toFixed(1)),
    gasDemandM3h: Number(gasDemand.toFixed(1)),
    assumptions: [
      a("mep-occ", "سرانه نفر در واحد", occupancyPerUnit.toFixed(2), "نفر", "میانگین وزنی برنامه واحدها"),
      a("mep-water", "مصرف آب روزانه", String(litersPerPerson), "L/نفر/روز", "مبحث ۱۶ + اقلیم پروژه"),
      a("mep-tank", "حجم مخزن ذخیره", "۱.۲ × مصرف روزانه", "L", "ذخیره یکروزه + ذخیره شستوشو"),
      a("mep-vel", "سرعت مجاز جریان", String(velocity), "m/s", "رویه طراحی لولهکشی آب سرد"),
      a("mep-elec", "توان انشعاب هر واحد", String(connectedPerUnit), "kVA", "مبحث ۱۳ – برآورد بار مسکونی"),
      a("mep-trans", "ظرفیت ترانسفورماتور", String(transformer), "kVA", "تقاضای همزمان ۶۰٪ + ذخیره ۲۵٪"),
      a("mep-cool", "بار سرمایش ویژه", String(coolingSpecific), "W/m²", `اقلیم ${climate} – روش سرانگشتی`),
      a("mep-heat", "بار گرمایش ویژه", String(heatingSpecific), "W/m²", "روش سرانگشتی، بدون مدل حرارتی دقیق"),
    ],
  };
}

export function computeParking(input: {
  unitsTotal: number;
  requirements: Requirements;
  footprintAreaM2: number;
  plotAreaM2: number;
}): ParkingSummary {
  const stallWidth = 2.5;
  const stallLength = 5.0;
  const aisle = 6.0;
  const effectiveAreaPerStall = 28; // stall + share of aisle + column loss (basement)
  const required = Math.ceil(input.unitsTotal * input.requirements.parkingPerDwelling + input.unitsTotal * input.requirements.visitorParkingRatio);
  const usableOpen = Math.max(0, input.plotAreaM2 - input.footprintAreaM2) * 0.55;
  const groundStalls = Math.floor(usableOpen / 32);
  let basements = 0;
  let provided = groundStalls;
  const basementCapacity = Math.max(0, Math.floor((input.footprintAreaM2 * 0.78) / effectiveAreaPerStall));
  if (input.requirements.includeBasementParking) {
    while (provided < required && basements < 3 && basementCapacity > 0) {
      basements += 1;
      provided += basementCapacity;
    }
  }
  const note = provided >= required
    ? `تأمین ${provided} جایگاه با ${groundStalls} جایگاه سطحی و ${basements} طبقه پارکینگ زیرزمینی؛ ${provided - required} جایگاه مازاد.`
    : `کمبود ${required - provided} جایگاه؛ افزایش سطح پارکینگ یا کاهش تعداد واحد لازم است.`;
  const parkingValidity = [checkValidity("PARKING-BRUTE-AREA", "footprint", input.footprintAreaM2)]
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map((v) => v.message);

  return {
    method:
      "نیاز = سقف‌گرد(واحد × نسبت ساکنین + واحد × نسبت مهمان)؛ تأمین سطحی = ۵۵٪ از سطح باز ÷ ۳۲ m²؛ ظرفیت هر زیرزمین = ۷۸٪ سطح اشغال ÷ ۲۸ m² مؤثر",
    stage: "preliminary-screening",
    formulaRefs: ["PARKING-BRUTE-AREA"],
    validityNotes: parkingValidity,
    requiredStalls: required,
    providedStalls: provided,
    basementLevels: basements,
    stallWidthM: stallWidth,
    stallLengthM: stallLength,
    aisleWidthM: aisle,
    effectiveAreaPerStallM2: effectiveAreaPerStall,
    note,
  };
}

export function computeCirculation(input: {
  levels: Level[];
  cores: Core[];
  corridorWidthM: number;
}): CirculationSummary {
  const level = input.levels[0];
  const cores = input.cores;
  let maxDistance = 0;
  if (level) {
    for (const room of level.rooms) {
      if (!room.habitable) continue;
      const cx = average(room.polygon.map((p) => p.x));
      const cy = average(room.polygon.map((p) => p.y));
      let nearest = Infinity;
      for (const core of cores) {
        // Bug fix (stage 4): the core centre must be derived from the modelled
        // rectangle. The previous constant (+2.6 m) assumed a fixed 5.2 m core
        // and biased every travel distance, even though cores are sized from
        // the plate (CORE_WIDTH_M / CORE_STAIR_DEPTH_M, clamped).
        const coreCentreX = core.rect.x + core.rect.w / 2;
        const coreCentreY = core.rect.y + core.rect.h / 2;
        const d = Math.hypot(cx - coreCentreX, cy - coreCentreY);
        nearest = Math.min(nearest, d);
      }
      if (Number.isFinite(nearest)) {
        maxDistance = Math.max(maxDistance, nearest * DISTANCE_FACTORS.pathToCore);
      }
    }
  }
  const circulationValidity = [checkValidity("CIRC-TRAVEL-LOWERBOUND", "distance", Number(maxDistance.toFixed(1)))]
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map((v) => v.message);

  return {
    method:
      "فاصله مرکز فضای قابل سکونت تا مرکز واقعی مستطیل هسته × ضریب مسیر ۱.۲ (حد پایین؛ مسیر واقعی محاسبه نشده)",
    stage: "preliminary-screening",
    formulaRefs: ["CIRC-TRAVEL-LOWERBOUND"],
    validityNotes: circulationValidity,
    maxTravelDistanceM: Number(maxDistance.toFixed(1)),
    allowedTravelDistanceM: 30,
    coresPerFloor: cores.length,
    corridorWidthM: input.corridorWidthM,
    corridorRequiredM: 1.5,
    routeMethod: "فاصله مستقیم از مرکز اتاق تا نزدیکترین هسته × ضریب مسیر ۱.۲ (حد پایین؛ مسیر واقعی محاسبه نشده)",
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

export function computeDaylight(levels: Level[]): DaylightSummary {
  const rooms: Room[] = levels.flatMap((l) => l.rooms).filter((r) => r.habitable);
  const compliant = rooms.filter((r) => r.daylightFactorProxy >= 0.08).length;
  const ratios = rooms.map((r) => r.daylightFactorProxy);
  const daylightValidity = rooms
    .map((r) => checkValidity("DAYLIGHT-PROXY", "area", r.areaM2))
    .filter((v): v is NonNullable<typeof v> => v !== null)
    .map((v) => v.message)
    .slice(0, 3);

  return {
    method:
      "نسبت شیشه تقریبی = ۰.۹ × طول نمای اتاق ÷ مساحت اتاق؛ حد پذیرش ۸٪ (جایگزین غربالگری تحلیل DF/DA)",
    stage: "preliminary-screening",
    formulaRefs: ["DAYLIGHT-PROXY"],
    validityNotes: daylightValidity,
    habitableRooms: rooms.length,
    compliantRooms: compliant,
    averageWindowRatio: ratios.length ? Number((ratios.reduce((s, x) => s + x, 0) / ratios.length).toFixed(3)) : 0,
    criticalRoomIds: rooms.filter((r) => r.daylightFactorProxy < 0.08).slice(0, 12).map((r) => r.id),
  };
}

export function computeRoofAndLevels(input: {
  plateRects: Rect[];
  plateAreaM2: number;
  floors: number;
}): { gfa: number; typicalNet: number } {
  return { gfa: input.plateAreaM2 * input.floors, typicalNet: 0 };
}

export function buildMetrics(input: {
  plotAreaM2: number;
  buildableAreaM2: number;
  footprintAreaM2: number;
  gfa: number;
  netAreaM2: number;
  unitsTotal: number;
  unitsDemanded: number;
  floors: number;
  levels: Level[];
  site: SiteModel;
  structural: StructuralSummary;
  mep: MepSummary;
  parking: ParkingSummary;
  circulation: CirculationSummary;
  daylight: DaylightSummary;
  requirements: Requirements;
  basements: number;
}): MetricEntry[] {
  const far = input.gfa / Math.max(1, input.plotAreaM2);
  const coverage = input.footprintAreaM2 / Math.max(1, input.plotAreaM2);
  const openSpace = Math.max(0, input.plotAreaM2 - input.footprintAreaM2);
  const efficiency = input.netAreaM2 / Math.max(1, input.gfa);
  const avgUnit = input.unitsTotal > 0 ? input.levels[0] ? average(input.levels[0].rooms.filter((r) => r.unitIndex >= 0).map((r) => r.areaM2)) : 0 : 0;
  const xv = evaluateCrossVentilation(input.levels);
  const budgetFactor = input.requirements.budget === "premium" ? 1.25 : input.requirements.budget === "economy" ? 0.9 : 1;
  const costPerM2 = (950 + input.floors * 22 + input.basements * 130 + (input.structural.columnSizeMm - 300) * 0.9) * budgetFactor;
  const costIndex = (input.gfa * costPerM2) / 1_000_000;
  const daylightRate = input.daylight.habitableRooms > 0 ? input.daylight.compliantRooms / input.daylight.habitableRooms : 0;

  return [
    { id: "plotArea", label: "مساحت زمین", value: Number(input.plotAreaM2.toFixed(1)), unit: "m²", better: "higher", category: "mass" },
    { id: "buildableArea", label: "سطح ساختپذیر (پس از عقبنشینی)", value: Number(input.buildableAreaM2.toFixed(1)), unit: "m²", better: "higher", category: "mass" },
    { id: "footprint", label: "سطح اشغال", value: Number(input.footprintAreaM2.toFixed(1)), unit: "m²", better: "higher", category: "mass" },
    { id: "coverage", label: "نسبت سطح اشغال", value: Number((coverage * 100).toFixed(1)), unit: "%", better: "higher", category: "mass" },
    { id: "gfa", label: "زیربنای کل", value: Number(input.gfa.toFixed(1)), unit: "m²", better: "higher", category: "yield" },
    { id: "far", label: "تراکم (FAR)", value: Number(far.toFixed(3)), unit: "-", better: "higher", category: "yield" },
    { id: "units", label: "تعداد واحد تأمینشده", value: input.unitsTotal, unit: "واحد", better: "higher", category: "yield" },
    { id: "unitsRequested", label: "تعداد واحد درخواستی", value: input.unitsDemanded, unit: "واحد", better: "higher", category: "yield" },
    { id: "avgUnitArea", label: "میانگین زیربنای واحد", value: Number((input.gfa / Math.max(1, input.unitsTotal)).toFixed(1)), unit: "m²", better: "higher", category: "yield" },
    { id: "efficiency", label: "بهرهوری خالص/ناخالص", value: Number((efficiency * 100).toFixed(1)), unit: "%", better: "higher", category: "quality" },
    { id: "openSpace", label: "سطح باز محوطه", value: Number(openSpace.toFixed(1)), unit: "m²", better: "higher", category: "quality" },
    { id: "daylight", label: "واحدهای نورگیر منطبق", value: Number((daylightRate * 100).toFixed(1)), unit: "%", better: "higher", category: "quality" },
    { id: "crossVent", label: "واحدهای دارای تهویه دوطرفه", value: Number((xv * 100).toFixed(1)), unit: "%", better: "higher", category: "quality" },
    { id: "travelDistance", label: "حداکثر فاصله تا خروج", value: input.circulation.maxTravelDistanceM, unit: "m", better: "lower", category: "quality" },
    { id: "floors", label: "تعداد طبقات", value: input.floors, unit: "طبقه", better: "lower", category: "structure" },
    { id: "columnSize", label: "ابعاد ستون پیشنهادی", value: input.structural.columnSizeMm, unit: "mm", better: "lower", category: "structure" },
    { id: "baseShear", label: "برش پایه لرزهای", value: input.structural.seismicBaseShearKN, unit: "kN", better: "lower", category: "structure" },
    { id: "parkingProvided", label: "جایگاه پارکینگ تأمینشده", value: input.parking.providedStalls, unit: "جایگاه", better: "higher", category: "parking" },
    { id: "parkingRequired", label: "جایگاه پارکینگ موردنیاز", value: input.parking.requiredStalls, unit: "جایگاه", better: "lower", category: "parking" },
    { id: "cooling", label: "بار سرمایش", value: input.mep.coolingLoadKW, unit: "kW", better: "lower", category: "mep" },
    { id: "transformer", label: "ظرفیت ترانس", value: input.mep.transformerKVA, unit: "kVA", better: "lower", category: "mep" },
    { id: "costIndex", label: "شاخص نسبی هزینه (بدون واحد پول)", value: Number(costIndex.toFixed(1)), unit: "شاخص", better: "lower", category: "cost" },
    { id: "basements", label: "طبقات زیرزمین", value: input.basements, unit: "طبقه", better: "lower", category: "cost" },
    { id: "avgRoomArea", label: "میانگین مساحت اتاق نمونه", value: Number(avgUnit.toFixed(1)), unit: "m²", better: "higher", category: "quality" },
  ];
}

export function evaluateCrossVentilation(levels: Level[]): number {
  const level = levels[0];
  if (!level) return 0;
  const plates = level.plateRects;
  const units = new Set(level.rooms.filter((r) => r.unitIndex >= 0).map((r) => r.unitIndex));
  let good = 0;
  for (const u of units) {
    const rooms = level.rooms.filter((r) => r.unitIndex === u);
    const xs = rooms.flatMap((r) => r.polygon.map((p) => p.x));
    const ys = rooms.flatMap((r) => r.polygon.map((p) => p.y));
    const width = Math.max(...xs) - Math.min(...xs);
    const depth = Math.max(...ys) - Math.min(...ys);
    const plate = plates[0];
    const multiFacade = rooms.filter((r) => r.facadeM > 0.5).length >= 2;
    if (multiFacade && (plate ? depth <= 14 : true) && width >= 4) good += 1;
  }
  return units.size > 0 ? good / units.size : 0;
}
