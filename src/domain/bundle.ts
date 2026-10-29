import type {
  CanonicalScheme,
  ExportFormat,
  ProjectDocument,
  RankedScheme,
  ValidationReport,
} from "./types";

export interface StoredScheme {
  rowId: string;
  model: CanonicalScheme;
  report: ValidationReport;
  pareto: boolean;
  score: number;
  createdAt: string;
}

export interface GenerationRunInfo {
  id: string;
  seed: number;
  variants: number;
  engineVersion: string;
  weights: Record<string, number>;
  createdAt: string;
}

export interface ArtifactInfo {
  id: string;
  format: string;
  filename: string;
  bytes: number;
  createdAt: string;
  schemeId: string | null;
}

export interface ProjectBundle {
  project: ProjectDocument;
  schemes: StoredScheme[];
  ranking: RankedScheme[];
  runs: GenerationRunInfo[];
  artifacts: ArtifactInfo[];
  warnings: string[];
}

export interface ApiError {
  error: string;
  detail: string[];
}

export interface RepairSummary {
  schemeCode: string;
  iterations: number;
  actions: { action: string; reason: string; ruleId: string; applied: boolean; detail: string }[];
  beforeFailed: number;
  afterFailed: number;
  beforeWarnings: number;
  afterWarnings: number;
}

export interface RepairResponse {
  bundle: ProjectBundle;
  repair: RepairSummary;
}

export const EXPORT_FORMATS: { id: ExportFormat; label: string; note: string }[] = [
  { id: "sheet-svg", label: "برگ معماری (SVG)", note: "A1: پلان + نماها + جدول در/پنجره و فضاها، هر قاب با مقیاس درج‌شده" },
  { id: "sheet-pdf", label: "برگ معماری (PDF)", note: "همان برگ با ابعاد فیزیکی واقعی؛ برچسب‌ها لاتین" },
  { id: "elevations-svg", label: "نماها و برش (SVG)", note: "چهار نما + برش A-A با ترازها و اندازه‌گذاری" },
  { id: "elevations-dxf", label: "نماها و برش (DXF)", note: "فضای مدل بر حسب متر؛ هر نما با آفست مشخص" },
  { id: "pdf", label: "PDF گزارش", note: "۵ صفحه برداری: کاور، پلان زمین، پلان طبقه، ضوابط، معیارها (برچسب لاتین)" },
  { id: "dxf", label: "DXF نقشه", note: "لایه‌بندی‌شده، ورودی AutoCAD (متر، AC1015)" },
  { id: "svg", label: "SVG برداری", note: "پلان زمین با برچسب فارسی و مقیاس" },
  { id: "ifc", label: "IFC4 (BIM)", note: "زیرمجموعه فضایی: فقط IfcSpace؛ دیوار/MEP صادر نمی‌شود" },
  { id: "xlsx", label: "XLSX", note: "۵ شیت: معیار، واحد، فضا، ضوابط، فرضیات" },
  { id: "csv", label: "CSV", note: "داده خام مدل برای پردازش بیرونی" },
  { id: "json", label: "JSON (CEM)", note: "مدل مهندسی کامل + گزارش اعتبارسنجی" },
];
