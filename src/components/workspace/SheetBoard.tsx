"use client";

import { useMemo, useState } from "react";
import { composeArchitecturalSheet, composeElevationSheet } from "@/domain/drawing/sheet";
import { renderSheetSvg } from "@/domain/drawing/renderSheet";
import { doorWindowSchedule, roomSchedule, levelSummaryTable, drawingMissingData } from "@/domain/drawing/tables";
import type { CanonicalScheme } from "@/domain/types";
import { Panel, Stat, StatusBadge } from "@/components/ui";

/**
 * Sheet workspace: read-only review of the composed architectural sheets and
 * schedules. Both panels render exactly what the exporters produce (same
 * composer + same SVG renderer), so the review cannot drift from the download.
 */
export function SheetBoard({ scheme, schemeRowId, schemeRevision, projectId, downloadAllowed }: { scheme: CanonicalScheme; schemeRowId: string; schemeRevision: number; projectId: string; downloadAllowed: boolean }) {
  const [kind, setKind] = useState<"plan" | "elevations">("plan");
  const [levelIndex, setLevelIndex] = useState(0);
  const [zoom, setZoom] = useState(1);

  const doc = useMemo(
    () => (kind === "plan" ? composeArchitecturalSheet(scheme, { levelIndex }) : composeElevationSheet(scheme)),
    [scheme, kind, levelIndex],
  );
  const svg = useMemo(() => renderSheetSvg(doc), [doc]);
  const schedules = useMemo(
    () => ({ doorWindow: doorWindowSchedule(scheme, levelIndex), rooms: roomSchedule(scheme, levelIndex), levels: levelSummaryTable(scheme) }),
    [scheme, levelIndex],
  );
  const missing = useMemo(() => drawingMissingData(scheme), [scheme]);

  const base = `/api/projects/${projectId}/schemes/${encodeURIComponent(schemeRowId)}`;

  return (
    <div className="space-y-4">
      <Panel
        title="برگ‌های معماری"
        subtitle={`${doc.sheetNumber} · ${doc.format} · ${doc.widthMm}×${doc.heightMm} mm · ${doc.blocks.length} قاب · واحد متر`}
        action={
          <div className="flex flex-wrap items-center gap-1">
            <button type="button" className={`chip ${kind === "plan" ? "border-teal-400/60 text-teal-200" : ""}`} onClick={() => setKind("plan")}>برگ پلان</button>
            <button type="button" className={`chip ${kind === "elevations" ? "border-teal-400/60 text-teal-200" : ""}`} onClick={() => setKind("elevations")}>برگ نما و برش</button>
            <select className="field w-auto py-1 text-[0.8125rem]" value={levelIndex} onChange={(event) => setLevelIndex(Number(event.target.value))}>
              {scheme.levels.map((level) => (
                <option key={level.index} value={level.index}>{level.name}</option>
              ))}
            </select>
            <button type="button" className="btn px-2 py-1 text-[0.8125rem]" onClick={() => setZoom((value) => Math.max(0.4, Number((value - 0.2).toFixed(2))))}>−</button>
            <span className="mono chip">{Math.round(zoom * 100)}٪</span>
            <button type="button" className="btn px-2 py-1 text-[0.8125rem]" onClick={() => setZoom((value) => Math.min(3, Number((value + 0.2).toFixed(2))))}>+</button>
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap gap-1 text-xs">
          {doc.scaleSummary.map((item) => (
            <span key={item.blockId} className="chip">{item.title}: <span className="mono">۱:{item.scaleDenominator}</span></span>
          ))}
          <span className="chip border-amber-400/40 bg-amber-400/10 text-amber-200">{doc.readiness.label}</span>
        </div>
        <div className="overflow-auto rounded-lg border border-white/10 bg-white scroll-thin" style={{ maxHeight: "70vh" }}>
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "top right", width: `${100 / zoom}%` }} dangerouslySetInnerHTML={{ __html: svg }} />
        </div>
        {downloadAllowed ? <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <a className="btn px-2 py-1 text-xs" href={`${base}/export?format=${kind === "plan" ? "sheet-svg" : "elevations-svg"}&revision=${schemeRevision}`}>دانلود برگ SVG</a>
          <a className="btn px-2 py-1 text-xs" href={`${base}/export?format=sheet-pdf&revision=${schemeRevision}`}>دانلود برگ PDF</a>
          <a className="btn px-2 py-1 text-xs" href={`${base}/export?format=elevations-dxf&revision=${schemeRevision}`}>نما/برش DXF</a>
          <a className="btn px-2 py-1 text-xs" href={`${base}/schedules?revision=${schemeRevision}`} target="_blank" rel="noreferrer">داده جدول‌ها (JSON)</a>
        </div> : <p className="mt-2 text-xs text-amber-200">دریافت فایل تا تولید مجدد غیرفعال است.</p>}
        <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-400">
          {doc.notes.map((note) => <li key={note}>• {note}</li>)}
        </ul>
        <p className="mt-1 rounded border border-rose-400/30 bg-rose-500/10 p-2 text-xs leading-5 text-rose-100">{doc.readiness.disclaimer}</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={schedules.doorWindow.title} subtitle={schedules.doorWindow.subtitle}>
          <div className="max-h-72 overflow-auto scroll-thin">
            <div className="overflow-x-auto scroll-thin -mx-1 px-1">
              <table className="table-eng">
                <thead><tr>{schedules.doorWindow.columns.slice(0, 8).map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                <tbody>
                  {schedules.doorWindow.rows.map((row) => (
                    <tr key={row.id}>
                      {schedules.doorWindow.columns.slice(0, 8).map((column) => (
                        <td key={column.key} className={`text-xs ${row.cells[column.key]?.available === false ? "text-amber-300" : "text-slate-200"}`}>
                          {row.cells[column.key]?.value ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {schedules.doorWindow.totals.map((total) => <span key={total.label} className="chip">{total.label}: {total.value}</span>)}
          </div>
          {schedules.doorWindow.missingFields.length > 0 && (
            <p className="mt-1 text-xs text-amber-200">در مدل موجود نیست: {schedules.doorWindow.missingFields.join("، ")}</p>
          )}
        </Panel>

        <Panel title={schedules.rooms.title} subtitle={schedules.rooms.subtitle}>
          <div className="max-h-72 overflow-auto scroll-thin">
            <div className="overflow-x-auto scroll-thin -mx-1 px-1">
              <table className="table-eng">
                <thead><tr>{schedules.rooms.columns.slice(0, 7).map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                <tbody>
                  {schedules.rooms.rows.slice(0, 60).map((row) => (
                    <tr key={row.id}>
                      {schedules.rooms.columns.slice(0, 7).map((column) => (
                        <td key={column.key} className="text-xs text-slate-200">{row.cells[column.key]?.value ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1 text-xs">
            {schedules.rooms.totals.map((total) => <span key={total.label} className="chip">{total.label}: {total.value}</span>)}
          </div>
        </Panel>
      </div>

      <Panel title="طبقات و کمبود اطلاعات مدل" subtitle="جدول طبقات + فهرست صریح آنچه در مدل نیست">
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="overflow-x-auto scroll-thin -mx-1 px-1">
              <table className="table-eng">
                <thead><tr>{schedules.levels.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
                <tbody>
                  {schedules.levels.rows.map((row) => (
                    <tr key={row.id}>
                      {schedules.levels.columns.map((column) => (
                        <td key={column.key} className="text-xs text-slate-200">{row.cells[column.key]?.value ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-xs">
              {schedules.levels.totals.map((total) => <span key={total.label} className="chip">{total.label}: {total.value}</span>)}
            </div>
          </div>
          <div>
            <ul className="space-y-1 text-xs leading-5 text-amber-200">
              {missing.map((row) => (
                <li key={row.item}>• <span className="font-semibold">{row.item}:</span> {row.detail}</li>
              ))}
            </ul>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="قاب‌های برگ" value={doc.blocks.length} hint={`${doc.scaleSummary.length} نقشه + ${doc.blocks.filter((block) => block.table).length} جدول`} />
              <Stat label="وضعیت" value={doc.readiness.status === "review-required" ? "بازبینی" : doc.readiness.status} tone="warn" hint="آماده اجرا نیست" />
            </div>
            <div className="mt-2"><StatusBadge status="warn" /></div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
