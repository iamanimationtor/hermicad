"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { DrawingScene } from "@/domain/drawing/scene";
import { renderSceneSvg } from "@/domain/drawing/renderSvg";

/**
 * Interactive drawing board.
 *
 * Renders the SAME SVG sheet that the export endpoint produces (one renderer),
 * then layers zoom / pan / layer visibility on top by toggling the `display` of
 * the exported <g id="layer-…"> groups inside a sandboxed wrapper. No drawing
 * geometry is created here, so what the user sees is exactly what is exported.
 */
export function DrawingBoard({
  scene,
  projectId,
  schemeRowId,
  schemeRevision,
  downloadAllowed,
  levelOptions,
  levelIndex,
  onLevelChange,
}: {
  scene: DrawingScene;
  projectId: string;
  schemeRowId: string;
  schemeRevision: number;
  downloadAllowed: boolean;
  levelOptions: { index: number; name: string }[];
  levelIndex: number;
  onLevelChange: (index: number) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [showLabels, setShowLabels] = useState(true);
  const [showDimensions, setShowDimensions] = useState(true);
  const [showTints, setShowTints] = useState(true);
  const [activeIssue, setActiveIssue] = useState<string | null>(null);
  const dragging = useRef<{ x: number; y: number } | null>(null);
  // وضعیت «در حال کشیدن» باید state باشد؛ خواندن ref در رندر مجاز نیست
  const [isDragging, setIsDragging] = useState(false);

  const svg = useMemo(() => {
    const base = renderSceneSvg(scene, {
      highlightIssueIds: activeIssue ? [activeIssue] : [],
    });
    // Apply visibility flags to the exported layer groups (ids are stable).
    const withLayers = base.replace(/<g id="layer-([a-z-]+)" data-layer="[a-z-]+"( style="[^"]*")?>/g, (match, id: string, style?: string) => {
      const off =
        hidden[id] ||
        (id === "room-label" && !showLabels) ||
        (id === "dimension" && !showDimensions) ||
        (id === "room-tint" && !showTints);
      if (!off) return match;
      return `<g id="layer-${id}" data-layer="${id}" style="display:none">`;
    });
    // Viewport zoom/pan is applied on the root <svg> via a wrapper transform.
    return withLayers;
  }, [scene, hidden, showLabels, showDimensions, showTints, activeIssue]);

  const toggle = useCallback((id: string) => {
    setHidden((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const onPointerDown = (event: React.PointerEvent) => {
    dragging.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    setIsDragging(true);
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!dragging.current) return;
    setPan({ x: event.clientX - dragging.current.x, y: event.clientY - dragging.current.y });
  };
  const onPointerUp = () => {
    dragging.current = null;
    setIsDragging(false);
  };

  const blocking = scene.issues.filter((issue) => issue.severity === "fail");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="field w-auto py-1 text-[0.8125rem]" value={levelIndex} onChange={(event) => onLevelChange(Number(event.target.value))}>
          {levelOptions.map((option) => (
            <option key={option.index} value={option.index}>{option.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <button type="button" className="btn px-2 py-1 text-[0.8125rem]" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))}>−</button>
          <span className="mono chip">{Math.round(zoom * 100)}٪</span>
          <button type="button" className="btn px-2 py-1 text-[0.8125rem]" onClick={() => setZoom((value) => Math.min(6, Number((value + 0.25).toFixed(2))))}>+</button>
          <button type="button" className="btn px-2 py-1 text-[0.8125rem]" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>بازنشانی نما</button>
        </div>
        <span className="chip">مقیاس ۱:{scene.sheet.scaleDenominator}</span>
        <span className="chip">{scene.sheet.format}</span>
        <span className="chip">واحد: متر</span>
        <span className={`chip ${blocking.length > 0 ? "border-rose-400/40 bg-rose-500/10 text-rose-200" : "border-teal-400/40 bg-teal-400/10 text-teal-200"}`}>
          {scene.readiness.label}
        </span>
        {activeIssue && (
          <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setActiveIssue(null)}>پاک‌کردن نشانگر مشکل</button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        <button type="button" className={`chip ${showLabels ? "border-teal-400/50 text-teal-200" : ""}`} onClick={() => setShowLabels((v) => !v)}>نام و مساحت فضاها</button>
        <button type="button" className={`chip ${showDimensions ? "border-teal-400/50 text-teal-200" : ""}`} onClick={() => setShowDimensions((v) => !v)}>اندازه‌گذاری</button>
        <button type="button" className={`chip ${showTints ? "border-teal-400/50 text-teal-200" : ""}`} onClick={() => setShowTints((v) => !v)}>رنگ فضاها</button>
        {scene.layers
          .filter((layer) => !["room-label", "dimension", "room-tint", "annotation"].includes(layer.id))
          .map((layer) => (
            <button
              key={layer.id}
              type="button"
              className={`chip ${hidden[layer.id] ? "opacity-50" : "border-teal-400/40 text-teal-200"}`}
              onClick={() => toggle(layer.id)}
              style={{ borderColor: hidden[layer.id] ? undefined : layer.color }}
            >
              {layer.label}
            </button>
          ))}
      </div>

      <div
        className="relative overflow-hidden rounded-lg border border-white/10 bg-white"
        style={{ cursor: isDragging ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={(event) => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          setZoom((value) => Math.min(6, Math.max(0.5, Number((value + (event.deltaY > 0 ? -0.15 : 0.15)).toFixed(2)))));
        }}
      >
        <div
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center", transition: isDragging ? "none" : "transform 120ms ease-out" }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
        <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[9px] text-white">
          {scene.consistency.ok ? "هم‌خوانی هندسه با مدل: تأییدشده" : "ناسازگاری هندسه با مدل"} · {scene.meta.wallCount} دیوار · {scene.meta.openingCount} بازشو
        </div>
      </div>

      {scene.issues.length > 0 && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 p-2">
          <div className="text-[0.8125rem] font-bold text-amber-100">هشدارهای نقشه ({scene.issues.length}) — با کلیک، محل مشکل روی نقشه مشخص می‌شود</div>
          <ul className="mt-1 space-y-1">
            {scene.issues.map((issue) => (
              <li key={issue.id}>
                <button
                  type="button"
                  className={`w-full rounded px-2 py-1 text-right text-xs leading-5 ${activeIssue === issue.id ? "bg-rose-500/20 text-rose-100" : "text-amber-100 hover:bg-white/5"}`}
                  onClick={() => setActiveIssue(issue.id)}
                >
                  <span className="font-semibold">{issue.title}</span> — {issue.detail}
                  <span className="mono mr-1 text-[9px] text-slate-400">
                    ({issue.at.x.toFixed(2)}, {issue.at.y.toFixed(2)})
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="chip">مساحت زمین {scene.meta.plotAreaM2.toFixed(1)} m²</span>
        <span className="chip">سطح اشغال {scene.meta.plateAreaM2.toFixed(1)} m²</span>
        <span className="chip">ضخامت دیوار پیرامونی {scene.meta.exteriorThicknessM} m</span>
        <span className="chip">مرجع عقب‌نشینی: سطح خارجی دیوار</span>
        {downloadAllowed && <a
          className="chip hover:border-teal-400/50"
          href={`/api/projects/${projectId}/schemes/${encodeURIComponent(schemeRowId)}/plan?format=svg&level=${levelIndex}&revision=${schemeRevision}`}
          target="_blank"
          rel="noreferrer"
        >
          SVG همین برگ
        </a>}
      </div>

      <p className="rounded border border-rose-400/30 bg-rose-500/10 p-2 text-xs leading-5 text-rose-100">{scene.readiness.disclaimer}</p>
    </div>
  );
}
