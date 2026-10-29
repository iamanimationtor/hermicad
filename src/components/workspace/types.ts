import type { ProjectBundle, RepairSummary, StoredScheme } from "@/domain/bundle";
import type { WeightMap } from "@/domain/optimize";
import type { RankedScheme } from "@/domain/types";

export type PlanMode = "site" | "floor";
export type WorkspaceTab = "schemes" | "plan" | "sheets" | "site" | "requirements" | "validation" | "analysis" | "exports";

export interface Notice {
  kind: "ok" | "error" | "info";
  text: string;
  detail?: string[];
}

export interface Ctx {
  projectId: string;
  bundle: ProjectBundle;
  active: StoredScheme | undefined;
  ranking: RankedScheme[];
  weights: WeightMap;
  busy: string | null;
  notice: Notice | null;
  planMode: PlanMode;
  levelIndex: number;
  repair: RepairSummary | null;
  seed: number;
  variants: number;
  setSeed: (value: number) => void;
  setVariants: (value: number) => void;
  onGenerate: () => void;
  onRepair: () => void;
  onSaveWeights: () => void;
  onWeightsChange: (weights: WeightMap) => void;
  onSelectScheme: (modelId: string) => void;
  applyBundle: (bundle: ProjectBundle) => void;
  setNotice: (notice: Notice | null) => void;
  setBusy: (value: string | null) => void;
  setPlanMode: (mode: PlanMode) => void;
  setLevelIndex: (index: number) => void;
  setRepair: (repair: RepairSummary | null) => void;
}

export function fmt(value: number | string, digits = 1): string {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("fa-IR", { maximumFractionDigits: digits });
}

export function schemeLabel(index: number): string {
  return String.fromCharCode(65 + index);
}
