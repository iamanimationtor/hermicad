/**
 * HERMICAD — Canonical Engineering Model (CEM)
 *
 * Single source of truth for every engine. Pure data: no DB, no UI, no I/O.
 * All geometry is stored in metres in a local, north-aligned project frame
 * (x = east, y = north) before the optional geo anchor rotation is applied.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeoAnchor {
  lat: number;
  lng: number;
}

export interface SpotLevel {
  x: number;
  y: number;
  z: number;
}

export interface Setbacks {
  north: number;
  east: number;
  south: number;
  west: number;
}

export type SeismicZone = "low" | "moderate" | "high" | "veryHigh";
export type Climate = "hotDry" | "hotHumid" | "cold" | "moderate";

export interface SiteModel {
  /** Irregular parcel boundary, projected coordinates in metres, CCW. */
  boundary: Vec2[];
  northAngleDeg: number;
  geoAnchor: GeoAnchor | null;
  spotLevels: SpotLevel[];
  setbacks: Setbacks;
  noBuildZones: Vec2[][];
  soilBearingKPa: number;
  seismicZone: SeismicZone;
  climate: Climate;
  notes: string[];
}

export type DwellingType = "studio" | "twoBed" | "threeBed" | "fourBed";

export interface DwellingProgram {
  type: DwellingType;
  count: number;
  targetAreaM2: number;
  minAreaM2: number;
}

export interface Requirements {
  buildingType: "residential";
  dwellings: DwellingProgram[];
  floorsMax: number;
  floorHeightM: number;
  farMax: number;
  coverageMax: number;
  parkingPerDwelling: number;
  visitorParkingRatio: number;
  includeBasementParking: boolean;
  budget: "economy" | "standard" | "premium";
  orientationPreference: "south" | "east" | "west" | "north" | "balanced";
  specialNotes: string[];
  rawText: string;
  parse: ParseResult;
}

export interface ParseResult {
  confidence: number;
  warnings: string[];
  trace: string[];
  matched: { key: string; value: string; source: string }[];
}

export type AssumptionConfidence = "code" | "engineering-judgement" | "default";

export interface Assumption {
  id: string;
  label: string;
  value: string;
  unit: string;
  basis: string;
  confidence: AssumptionConfidence;
}

export type RoomKind =
  | "living"
  | "kitchen"
  | "masterBedroom"
  | "bedroom"
  | "bath"
  | "wc"
  | "entry"
  | "hall"
  | "storage"
  | "corridor"
  | "core"
  | "lobby"
  | "balcony"
  | "void"
  | "parking";

export interface Room {
  id: string;
  kind: RoomKind;
  label: string;
  unitIndex: number;
  level: number;
  polygon: Vec2[];
  areaM2: number;
  minAreaM2: number;
  habitable: boolean;
  facadeM: number;
  daylightFactorProxy: number;
}

export interface Core {
  id: string;
  kind: "stair" | "stairElevator";
  rect: Rect;
  polygon: Vec2[];
  x: number;
  y: number;
}

export type WallKind = "exterior" | "party" | "interior" | "shaft";

export interface Wall {
  id: string;
  kind: WallKind;
  start: Vec2;
  end: Vec2;
  thicknessM: number;
  lengthM: number;
  roomIds: string[];
  /** true when the wall lies on the building envelope (outdoor side). */
  envelope: boolean;
}

export type OpeningKind = "door" | "entryDoor" | "window" | "slidingDoor";

export interface Opening {
  id: string;
  wallId: string;
  kind: OpeningKind;
  widthM: number;
  heightM: number;
  sillM: number;
  center: Vec2;
  /** distance of the opening centre from the wall start, in metres */
  stationM: number;
  roomIds: string[];
  note: string;
}

export interface DimensionLine {
  id: string;
  kind: "overall" | "room" | "unit";
  start: Vec2;
  end: Vec2;
  offsetM: number;
  valueM: number;
  label: string;
}

export interface StairSummary {
  floorToFloorM: number;
  riserCount: number;
  riserHeightM: number;
  treadCount: number;
  goingM: number;
  stairWidthM: number;
  requiredDepthM: number;
  availableDepthM: number;
  landingM: number;
  elevatorShaftM: { w: number; h: number; requiredW: number; requiredH: number };
  fits: boolean;
  notes: string[];
}

export interface LevelPlanCheck {
  id: string;
  title: string;
  passed: boolean;
  value: string;
  requirement: string;
  /** integrity = model consistency (may fail a rule); quality = design target. */
  severity: "integrity" | "quality";
  /** Rooms implicated by the check, so the UI can point at the problem. */
  roomIds?: string[];
  reason?: string;
  /** pass | warning | fail | insufficient */
  status?: "pass" | "warning" | "fail" | "insufficient";
}

export interface UnitLayoutPlan {
  unitIndex: number;
  type: string;
  pattern: string;
  patternLabel: string;
  score: number;
  feasible: boolean;
  alternatives: { patternId: string; label: string; feasible: boolean; score: number; reason: string }[];
  narrowRooms: { label: string; width: number; depth: number; area: number }[];
  darkHabitable: string[];
  notes: string[];
}

export interface Level {
  index: number;
  name: string;
  rooms: Room[];
  cores: Core[];
  corridors: Rect[];
  corridorWidthM: number;
  plateRects: Rect[];
  plateAreaM2: number;
  netAreaM2: number;
  /** Architectural plan layer (stage A). Optional for stored legacy models. */
  walls?: Wall[];
  openings?: Opening[];
  dimensions?: DimensionLine[];
  stair?: StairSummary;
  planChecks?: LevelPlanCheck[];
  unitLayouts?: UnitLayoutPlan[];
}

export interface UnitInstance {
  index: number;
  type: DwellingType;
  label: string;
  level: number;
  rect: Rect;
  areaM2: number;
  roomIds: string[];
  facadeM: number;
}

export type UnitMix = Record<string, number>;

export type SourceStatus =
  | "project-requirement"
  | "internal-engineering-threshold"
  | "unverified-citation"
  | "internal-integrity-check";

export type VerificationLevel = "unverified" | "internally-tested" | "externally-verified";

/** How the rule's *threshold* is justified. */
export type EvidenceLevel =
  | "project-input"
  | "internal-assumption"
  | "integrity-check"
  | "unverified-external";

/** Whether an official document was actually obtained for this rule. */
export type SourceAvailability =
  | "no-legal-source-applicable"
  | "project-supplied-only"
  | "official-text-not-obtained";

export interface RuleDocumentRef {
  /** Title of the document the rule is meant to screen against, if any. */
  title: string | null;
  /** Edition/year of that document, only when actually obtained. */
  version: string | null;
  /** Clause number — always null while no official text is held. */
  clause: string | null;
  availability: SourceAvailability;
  /** Human-readable record of what was checked and when. */
  auditNote: string;
}

export interface RuleTestRefs {
  positive: string;
  negative: string;
  boundary: string;
}

export interface RuleInputRef {
  name: string;
  unit: string;
  required: boolean;
  origin: string;
}

export interface StructuralSummary {
  method: string;
  stage: "preliminary-screening";
  formulaRefs: string[];
  validityNotes: string[];
  gridX: number;
  gridY: number;
  spansX: number[];
  spansY: number[];
  columns: number;
  columnSizeMm: number;
  beamDepthMm: number;
  slabThicknessMm: number;
  seismicBaseShearKN: number;
  seismicCoefficient: number;
  buildingWeightKN: number;
  requiredFoundationWidthM: number;
  columnLoadKN: number;
  assumptions: Assumption[];
}

export interface MepSummary {
  method: string;
  stage: "preliminary-screening";
  formulaRefs: string[];
  validityNotes: string[];
  occupancy: number;
  waterDailyLiters: number;
  waterTankLiters: number;
  waterMainDiameterMm: number;
  sewageMainDiameterMm: number;
  electricalConnectedKVA: number;
  electricalDemandKVA: number;
  transformerKVA: number;
  coolingLoadKW: number;
  heatingLoadKW: number;
  gasDemandM3h: number;
  assumptions: Assumption[];
}

export interface ParkingSummary {
  method: string;
  stage: "preliminary-screening";
  formulaRefs: string[];
  validityNotes: string[];
  requiredStalls: number;
  providedStalls: number;
  basementLevels: number;
  stallWidthM: number;
  stallLengthM: number;
  aisleWidthM: number;
  effectiveAreaPerStallM2: number;
  note: string;
}

export interface CirculationSummary {
  method: string;
  stage: "preliminary-screening";
  formulaRefs: string[];
  validityNotes: string[];
  maxTravelDistanceM: number;
  allowedTravelDistanceM: number;
  coresPerFloor: number;
  corridorWidthM: number;
  corridorRequiredM: number;
  routeMethod: string;
}

export interface DaylightSummary {
  method: string;
  stage: "preliminary-screening";
  formulaRefs: string[];
  validityNotes: string[];
  habitableRooms: number;
  compliantRooms: number;
  averageWindowRatio: number;
  criticalRoomIds: string[];
}

export interface MetricEntry {
  id: string;
  label: string;
  value: number;
  unit: string;
  better: "higher" | "lower";
  category: "mass" | "yield" | "quality" | "structure" | "mep" | "parking" | "cost";
}

export interface TraceStep {
  step: string;
  detail: string;
  output: string;
}

export interface CanonicalScheme {
  id: string;
  code: string;
  seed: number;
  strategy: string;
  strategyLabel: string;
  engineVersion: string;
  site: SiteModel;
  requirements: Requirements;
  plotAreaM2: number;
  buildablePolygon: Vec2[];
  buildableAreaM2: number;
  footprintRects: Rect[];
  footprintAreaM2: number;
  floors: number;
  floorHeightM: number;
  unitsTotal: number;
  unitsPerFloor: number;
  unitMix: UnitMix;
  levels: Level[];
  units: UnitInstance[];
  grossFloorAreaM2: number;
  netAreaM2: number;
  structural: StructuralSummary;
  mep: MepSummary;
  parking: ParkingSummary;
  circulation: CirculationSummary;
  daylight: DaylightSummary;
  metrics: MetricEntry[];
  assumptions: Assumption[];
  trace: TraceStep[];
  generatedAt: string;
  /** Screening-stage declaration; optional so older stored models stay readable. */
  analysisStatus?: {
    level: "preliminary-screening";
    requiresEngineerReview: boolean;
    notForConstruction: boolean;
    limitations: string[];
  };
  layoutDecision?: {
    candidateCounts: number[];
    chosenUnitsPerFloor: number;
    candidates: { unitsPerFloor: number; score: number; feasibleUnits: number; adjusted: number }[];
    notes: string[];
  };
  geometryStatus?: {
    buildableMethod: "convex-halfplane-setback";
    exact: boolean;
    convexParcel: boolean;
    note: string;
  };
}

export type Severity = "critical" | "major" | "minor" | "info";

export interface IssueLocation {
  level?: number;
  roomId?: string;
  rect?: Rect;
  polygon?: Vec2[];
}

export interface Issue {
  id: string;
  ruleId: string;
  title: string;
  severity: Severity;
  category: string;
  observed: number | string;
  required: number | string | null;
  unit: string;
  message: string;
  source: string;
  remediation: string;
  location?: IssueLocation;
  trace: string[];
}

export type RuleStatus = "pass" | "fail" | "warn" | "na" | "insufficient";

export interface RuleEvaluation {
  ruleId: string;
  title: string;
  category: string;
  source: string;
  edition: string;
  sourceStatus: SourceStatus;
  verification: VerificationLevel;
  evidence: EvidenceLevel;
  method: string;
  formula: string;
  inputs: string[];
  inputsDetailed: RuleInputRef[];
  limitations: string;
  document?: RuleDocumentRef;
  tests?: RuleTestRefs;
  severity: Severity;
  status: RuleStatus;
  observed: number | string;
  required: number | string | null;
  unit: string;
  message: string;
  remediation: string;
  location?: IssueLocation;
  trace: string[];
}

export interface ValidationReport {
  reportId: string;
  schemeId: string;
  schemeCode: string;
  codeSetCode: string;
  codeSetEdition: string;
  engineVersion: string;
  evaluatedAt: string;
  iteration: number;
  evaluations: RuleEvaluation[];
  issues: Issue[];
  passed: number;
  failed: number;
  warnings: number;
  /** Rules that could not be evaluated because required inputs are missing. */
  insufficient?: number;
  evidenceSummary?: Record<string, number>;
  dataCompleteness?: { item: string; present: boolean; impact: string }[];
  blocked: boolean;
  categorySummary: Record<string, { pass: number; fail: number; warn: number; na: number; insufficient?: number }>;
  disclaimer: string;
  codeSetStatus?: string;
  codeSetVerification?: VerificationLevel;
  codeSetNote?: string;
}

export interface ScoreCriterion {
  id: string;
  label: string;
  weight: number;
  raw: number;
  normalized: number;
  contribution: number;
  unit: string;
  direction: "higher" | "lower";
}

export interface ScoreBreakdown {
  schemeId: string;
  schemeCode: string;
  criteria: ScoreCriterion[];
  rawScore: number;
  total: number;
  hardBlocked: boolean;
}

export interface SchemeVerification {
  /** Fixed statement: ranking never establishes compliance or safety. */
  claim: "not-established";
  advisory: boolean;
  label: string;
  ruleCount: number;
  insufficientRules: number;
  projectInputFailures: number;
  internalAssumptionFailures: number;
  unverifiedExternalFailures: number;
  integrityFailures: number;
  evidenceTiers: Record<string, number>;
  confidencePenalty: number;
  notes: string[];
}

export interface RankedScheme {
  schemeId: string;
  schemeCode: string;
  strategyLabel: string;
  /** Advisory score (0-100) after evidence/blocking penalties. */
  score: number;
  /** Weighted score before penalties, kept for traceability. */
  rawScore: number;
  blocked: boolean;
  criticalIssues: number;
  pareto: boolean;
  criteria: ScoreCriterion[];
  verification: SchemeVerification;
}

export interface RepairAction {
  action: string;
  reason: string;
  ruleId: string;
  applied: boolean;
  detail: string;
}

export interface RepairResult {
  scheme: CanonicalScheme;
  actions: RepairAction[];
  before: ValidationReport;
  after: ValidationReport;
  iterations: number;
}

export type ExportFormat =
  | "json"
  | "pdf"
  | "dxf"
  | "svg"
  | "csv"
  | "xlsx"
  | "ifc"
  | "sheet-svg"
  | "sheet-pdf"
  | "elevations-svg"
  | "elevations-dxf";

export interface ExportResult {
  filename: string;
  mime: string;
  data: Buffer;
  meta: Record<string, unknown>;
}

export interface ProjectDocument {
  id: string;
  code: string;
  name: string;
  client: string | null;
  jurisdiction: string;
  status: string;
  description: string | null;
  site: SiteModel;
  siteRevision: number;
  requirements: Requirements;
  requirementRevision: number;
}
