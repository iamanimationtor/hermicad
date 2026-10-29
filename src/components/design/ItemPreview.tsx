"use client";

import type { CatalogItem, Part } from "@/domain/studio/catalog";

const LAYER_COLOR: Record<string, string> = {
  walls: "#e2e8f0",
  structure: "#fca5a5",
  foundation: "#fdba74",
  furniture: "#67e8f9",
  sanitary: "#7dd3fc",
  kitchen: "#5eead4",
  mep: "#d8b4fe",
  electrical: "#fcd34d",
  fire: "#fca5a5",
  site: "#86efac",
  annotation: "#cbd5e1",
  grid: "#64748b",
  dimension: "#94a3b8",
};

const FILL: Record<string, string> = {
  none: "none",
  soft: "rgba(148,163,184,0.16)",
  medium: "rgba(148,163,184,0.32)",
  dark: "rgba(226,232,240,0.6)",
  accent: "rgba(248,113,113,0.5)",
};

function partShape(part: Part, index: number, stroke: string, weight: number): React.ReactNode {
  const common = {
    fill: FILL[part.fill ?? "none"],
    stroke,
    strokeWidth: weight,
    strokeDasharray: part.dashed ? "0.06 0.04" : undefined,
  };
  switch (part.kind) {
    case "rect":
      return <rect key={index} x={part.x} y={part.y} width={part.w} height={part.h} rx={part.r ?? 0} {...common} />;
    case "circle":
      return <circle key={index} cx={part.cx} cy={part.cy} r={part.r} {...common} />;
    case "poly": {
      const points = part.points.map(([x, y]) => `${x},${y}`).join(" ");
      return part.closed === false ? (
        <polyline key={index} points={points} fill="none" stroke={stroke} strokeWidth={weight} strokeDasharray={part.dashed ? "0.06 0.04" : undefined} />
      ) : (
        <polygon key={index} points={points} {...common} />
      );
    }
    case "mline":
      return <line key={index} x1={0.5 + part.x1} y1={0.5 - part.y1} x2={0.5 + part.x2} y2={0.5 - part.y2} stroke={stroke} strokeWidth={weight} strokeDasharray={part.dashed ? "0.06 0.04" : undefined} />;
    case "marc": {
      const steps = 14;
      const pts: string[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const angle = ((part.from + ((part.to - part.from) * i) / steps) * Math.PI) / 180;
        pts.push(`${0.5 + part.cx + part.r * Math.cos(angle)},${0.5 - (part.cy + part.r * Math.sin(angle))}`);
      }
      return <polyline key={index} points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth={weight} strokeDasharray={part.dashed ? "0.06 0.04" : undefined} />;
    }
    case "line":
      return (
        <line key={index} x1={part.x1} y1={part.y1} x2={part.x2} y2={part.y2} stroke={stroke} strokeWidth={weight} strokeDasharray={part.dashed ? "0.06 0.04" : undefined} />
      );
  }
}

/** پیش‌نمایش کوچک و سریع یک شیء کتابخانه (بدون وابستگی به رندر برگه). */
export function ItemPreview({ item, size = 46, className = "" }: { item: CatalogItem; size?: number; className?: string }) {
  const stroke = LAYER_COLOR[item.layer] ?? "#cbd5e1";
  const weight = item.layer === "structure" ? 0.035 : 0.022;
  return (
    <svg
      width={size}
      height={size}
      viewBox="-0.04 -0.04 1.08 1.08"
      className={className}
      role="img"
      aria-label={item.nameFa}
      style={{ background: "rgba(2,6,23,0.35)", borderRadius: 8 }}
    >
      {item.parts.map((part, index) => partShape(part, index, stroke, weight))}
    </svg>
  );
}

/** پیش‌نمایش نقشهٔ شیء در ابعاد واقعی شیء (برای کارت انتخاب). */
export function ItemChip({ item, onPick }: { item: CatalogItem; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={`${item.nameFa} — ${item.defaultSize.w.toFixed(2)}×${item.defaultSize.d.toFixed(2)} m`}
      className="group flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-1.5 text-right transition hover:border-teal-300/50 hover:bg-teal-400/5"
    >
      <ItemPreview item={item} size={38} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] text-slate-200 group-hover:text-teal-100">{item.nameFa}</span>
        <span className="mono block text-[9px] text-slate-500">
          {item.defaultSize.w.toFixed(2)}×{item.defaultSize.d.toFixed(2)}
        </span>
      </span>
    </button>
  );
}
