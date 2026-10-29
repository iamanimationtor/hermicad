"use client";
import { structuralExportError } from "@/domain/structures/exportPolicy";
import { floorHeight, itemVertical, isOpening } from "@/domain/studio/parameters";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CATALOG, CATALOG_BY_ID, CATEGORIES, STUDIO_LAYERS, searchCatalog, type CatalogItem } from "@/domain/studio/catalog";
import {
  CLASSIFICATION_LABELS,
  addItem,
  documentBounds,
  documentFingerprint,
  duplicateItem,
  moveItem,
  removeItem,
  rotateItem,
  schedule,
  snapValue,
  updateItem,
  validateDocument,
  type StudioDocument,
  type StudioItem,
} from "@/domain/studio/document";
import { SLAB_REBAR_DEFAULTS, SLAB_PARAM_RANGES } from "@/domain/studio/slabConfig";
import { SharePanel } from "./SharePanel";
import { ItemChip, ItemPreview } from "./ItemPreview";

type Mode = "select" | "pan" | "place";
type DragMode = "move" | "resize" | "rotate" | "pan";

interface DragState {
  mode: DragMode;
  /** سند پیش از شروع کشیدن، برای اینکه واگرد دقیقاً به همان حالت برگردد */
  before?: StudioDocument;
  itemId?: string;
  handle?: string;
  startModel: { x: number; y: number };
  startItem?: StudioItem;
  startView?: { x: number; y: number; w: number; h: number };
  startPointer: { x: number; y: number };
}

const HANDLES: { id: string; ax: number; ay: number; cursor: string }[] = [
  { id: "nw", ax: -0.5, ay: -0.5, cursor: "nwse-resize" },
  { id: "n", ax: 0, ay: -0.5, cursor: "ns-resize" },
  { id: "ne", ax: 0.5, ay: -0.5, cursor: "nesw-resize" },
  { id: "e", ax: 0.5, ay: 0, cursor: "ew-resize" },
  { id: "se", ax: 0.5, ay: 0.5, cursor: "nwse-resize" },
  { id: "s", ax: 0, ay: 0.5, cursor: "ns-resize" },
  { id: "sw", ax: -0.5, ay: 0.5, cursor: "nesw-resize" },
  { id: "w", ax: -0.5, ay: 0, cursor: "ew-resize" },
];

const LAYER_SCREEN_COLOR: Record<string, string> = {
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

const FILL_SCREEN: Record<string, string> = {
  none: "none",
  soft: "rgba(148,163,184,0.15)",
  medium: "rgba(148,163,184,0.3)",
  dark: "rgba(226,232,240,0.5)",
  accent: "rgba(248,113,113,0.45)",
};

export function DesignStudio({ initialDesign }: { initialDesign: StudioDocument }) {
  const [doc, setDoc] = useState<StudioDocument>(initialDesign);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("select");
  const [pendingCatalog, setPendingCatalog] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | "all">("all");
  const [snapOn, setSnapOn] = useState(true);
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  // نمای اولیه از خود سند محاسبه می‌شود (نه در افکت با setState) تا رندر دوباره ناخواسته نباشد
  const [view, setView] = useState(() => {
    const bounds = documentBounds(initialDesign);
    const padX = Math.max(1, bounds.w * 0.08);
    const padY = Math.max(1, bounds.h * 0.08);
    return { x: bounds.x - padX, y: bounds.y - padY, w: bounds.w + padX * 2, h: bounds.h + padY * 2 };
  });
  const [size, setSize] = useState({ w: 900, h: 620 });
  const savedRevision = useRef(initialDesign.revision);
  const saving = useRef(false);
  const past = useRef<StudioDocument[]>([]);
  const future = useRef<StudioDocument[]>([]);
  const drag = useRef<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [showLayers, setShowLayers] = useState(true);

  const selected = doc.items.find((item) => item.id === selectedId) ?? null;
  const selectedDef = selected ? CATALOG_BY_ID[selected.catalogId] : null;
  const issues = useMemo(() => validateDocument(doc), [doc]);
  const summary = useMemo(() => schedule(doc), [doc]);

  const scalePx = Math.min(size.w / view.w, size.h / view.h);
  const offsetX = (size.w - view.w * scalePx) / 2;
  const offsetY = (size.h - view.h * scalePx) / 2;

  const commit = useCallback((next: StudioDocument, label = "") => {
    setDoc((current) => {
      past.current = [...past.current.slice(-40), current];
      future.current = [];
      return next;
    });
    if (label) setStatus(label);
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    setDoc((current) => {
      future.current = [...future.current, current];
      return previous;
    });
    setStatus("واگرد");
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    setDoc((current) => {
      past.current = [...past.current, current];
      return next;
    });
    setStatus("ازنو");
  }, []);

  const toModel = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      return {
        x: view.x + (px - offsetX) / scalePx,
        y: view.y + view.h - (py - offsetY) / scalePx,
      };
    },
    [offsetX, offsetY, scalePx, view.x, view.y, view.h],
  );

  const fit = useCallback(() => {
    const bounds = documentBounds(doc);
    const padX = Math.max(1, bounds.w * 0.08);
    const padY = Math.max(1, bounds.h * 0.08);
    setView({ x: bounds.x - padX, y: bounds.y - padY, w: bounds.w + padX * 2, h: bounds.h + padY * 2 });
  }, [doc]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setSize({ w: Math.max(200, rect.width), h: Math.max(200, rect.height) });
    });
    observer.observe(element);
    const rect = element.getBoundingClientRect();
    setSize({ w: Math.max(200, rect.width), h: Math.max(200, rect.height) });
    return () => observer.disconnect();
  }, []);

  const zoomBy = useCallback((factor: number, anchor?: { x: number; y: number }) => {
    setView((current) => {
      const nextW = Math.min(400, Math.max(1.5, current.w * factor));
      const nextH = Math.min(400, Math.max(1, current.h * factor));
      if (!anchor) {
        return { x: current.x + (current.w - nextW) / 2, y: current.y + (current.h - nextH) / 2, w: nextW, h: nextH };
      }
      const ratioX = (anchor.x - current.x) / current.w;
      const ratioY = (anchor.y - current.y) / current.h;
      return { x: anchor.x - nextW * ratioX, y: anchor.y - nextH * ratioY, w: nextW, h: nextH };
    });
  }, []);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const handler = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      const anchor = {
        x: view.x + (px - offsetX) / scalePx,
        y: view.y + view.h - (py - offsetY) / scalePx,
      };
      zoomBy(event.deltaY > 0 ? 1.12 : 1 / 1.12, anchor);
    };
    element.addEventListener("wheel", handler, { passive: false });
    return () => element.removeEventListener("wheel", handler);
  }, [offsetX, offsetY, scalePx, view.x, view.y, view.h, zoomBy]);

  const keyHandler = useCallback(
    (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && selectedId) {
        event.preventDefault();
        commit(duplicateItem(doc, selectedId), "تکثیر شد");
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        commit(removeItem(doc, selectedId), "حذف شد");
        setSelectedId(null);
        return;
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        setPendingCatalog(null);
        setMode("select");
        return;
      }
      if (!selected) return;
      const grid = snapOn ? Math.max(doc.grid, 0.05) : 0.05;
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-grid, 0],
        ArrowRight: [grid, 0],
        ArrowUp: [0, grid],
        ArrowDown: [0, -grid],
      };
      const delta = arrows[event.key];
      if (delta) {
        event.preventDefault();
        commit(moveItem(doc, selected.id, delta[0], delta[1]));
      }
    },
    [commit, doc, redo, selected, selectedId, snapOn, undo],
  );

  useEffect(() => {
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [keyHandler]);

  const placeAt = useCallback(
    (catalogId: string, at: { x: number; y: number }) => {
      const definition = CATALOG_BY_ID[catalogId];
      if (!definition) return;
      const next = addItem(doc, catalogId, at);
      commit(next, `${definition.nameFa} اضافه شد`);
      const added = next.items[next.items.length - 1];
      setSelectedId(added?.id ?? null);
      setMode("select");
      setPendingCatalog(null);
    },
    [commit, doc],
  );

  const onCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 1 || mode === "pan" || event.shiftKey) {
      drag.current = {
        mode: "pan",
        before: doc,
        startModel: toModel(event.clientX, event.clientY),
        startPointer: { x: event.clientX, y: event.clientY },
        startView: view,
      };
      (event.target as Element).setPointerCapture?.(event.pointerId);
      return;
    }
    if (mode === "place" && pendingCatalog) {
      placeAt(pendingCatalog, toModel(event.clientX, event.clientY));
      return;
    }
    setSelectedId(null);
  };

  const startItemDrag = (event: React.PointerEvent, item: StudioItem) => {
    event.stopPropagation();
    setSelectedId(item.id);
    if (mode === "place" && pendingCatalog) {
      placeAt(pendingCatalog, toModel(event.clientX, event.clientY));
      return;
    }
    if (mode === "pan") return;
    drag.current = {
      mode: "move",
      before: doc,
      itemId: item.id,
      startModel: toModel(event.clientX, event.clientY),
      startItem: item,
      startPointer: { x: event.clientX, y: event.clientY },
    };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const startResize = (event: React.PointerEvent, item: StudioItem, handle: string) => {
    event.stopPropagation();
    drag.current = {
      mode: "resize",
      before: doc,
      itemId: item.id,
      handle,
      startModel: toModel(event.clientX, event.clientY),
      startItem: item,
      startPointer: { x: event.clientX, y: event.clientY },
    };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const startRotate = (event: React.PointerEvent, item: StudioItem) => {
    event.stopPropagation();
    drag.current = {
      mode: "rotate",
      before: doc,
      itemId: item.id,
      startModel: toModel(event.clientX, event.clientY),
      startItem: item,
      startPointer: { x: event.clientX, y: event.clientY },
    };
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    if (!state) return;
    const model = toModel(event.clientX, event.clientY);
    if (state.mode === "pan" && state.startView) {
      const dx = (event.clientX - state.startPointer.x) / scalePx;
      const dy = (event.clientY - state.startPointer.y) / scalePx;
      setView({ ...state.startView, x: state.startView.x - dx, y: state.startView.y + dy });
      return;
    }
    if (!state.startItem || !state.itemId) return;
    const item = state.startItem;
    const grid = snapOn ? doc.grid : 0;

    if (state.mode === "move") {
      const dx = model.x - state.startModel.x;
      const dy = model.y - state.startModel.y;
      const nx = snapValue(item.x + dx, grid);
      const ny = snapValue(item.y + dy, grid);
      setDoc((current) => updateItem(current, item.id, { x: nx, y: ny }));
      return;
    }

    if (state.mode === "rotate") {
      const center = { x: item.x, y: item.y };
      const angle = (Math.atan2(model.x - center.x, model.y - center.y) * 180) / Math.PI;
      const snapped = event.shiftKey ? Math.round(angle / 15) * 15 : angle;
      setDoc((current) => updateItem(current, item.id, { rotationDeg: Math.round(snapped * 10) / 10 }));
      return;
    }

    if (state.mode === "resize" && state.handle) {
      const def = CATALOG_BY_ID[item.catalogId];
      const theta = (item.rotationDeg * Math.PI) / 180;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const sheetDx = model.x - state.startModel.x;
      const sheetDy = -(model.y - state.startModel.y);
      const localDx = sheetDx * cos + sheetDy * sin;
      const localDy = -sheetDx * sin + sheetDy * cos;
      let w = item.w;
      let d = item.d;
      let shiftLocalX = 0;
      let shiftLocalY = 0;
      if (state.handle.includes("e")) {
        w = item.w + localDx;
        shiftLocalX = localDx / 2;
      }
      if (state.handle.includes("w")) {
        w = item.w - localDx;
        shiftLocalX = localDx / 2;
      }
      if (state.handle.includes("s")) {
        d = item.d + localDy;
        shiftLocalY = localDy / 2;
      }
      if (state.handle.includes("n")) {
        d = item.d - localDy;
        shiftLocalY = localDy / 2;
      }
      const minW = def?.minSize?.w ?? 0.1;
      const minD = def?.minSize?.d ?? 0.1;
      w = Math.max(minW, w);
      d = Math.max(minD, d);
      const worldDx = shiftLocalX * cos - shiftLocalY * sin;
      const worldDy = -(shiftLocalX * sin + shiftLocalY * cos);
      setDoc((current) =>
        updateItem(current, item.id, {
          w: snapValue(w, grid),
          d: snapValue(d, grid),
          x: snapValue(item.x + worldDx, grid),
          y: snapValue(item.y + worldDy, grid),
        }),
      );
    }
  };

  const endDrag = () => {
    const state = drag.current;
    if (state && state.mode !== "pan" && state.before) {
      // فقط اگر واقعاً چیزی تغییر کرده باشد، در تاریخچه ثبت می‌شود
      if (state.before !== doc) {
        past.current = [...past.current.slice(-40), state.before];
        future.current = [];
      }
    }
    drag.current = null;
  };

  const filtered = useMemo(() => searchCatalog(query, category === "all" ? undefined : category), [query, category]);

  const save = useCallback(async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy("save");
    try {
      const response = await fetch(`/api/designs/${doc.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: { ...doc, revision: savedRevision.current } }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ذخیره ناموفق بود");
      const stored = payload.design as StudioDocument;
      savedRevision.current = stored.revision;
      // تغییرات حین انتظار پاسخ نباید با نسخهٔ ارسالی پاک شوند.
      setDoc((current) => (current === doc ? stored : { ...current, revision: stored.revision }));
      setStatus(`ذخیره شد · تجدیدنظر ${(payload.design as StudioDocument).revision}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "خطای ذخیره");
    } finally {
      saving.current = false;
      setBusy(null);
    }
  }, [doc]);

  const download = useCallback(
    async (format: string) => {
      setBusy(format);
      try {
        const response = await fetch("/api/designs/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            document: doc,
            format,
            options: { classification: doc.classification, theme: "print" },
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({ error: "خروجی ناموفق بود" }));
          throw new Error(payload.error ?? "خروجی ناموفق بود");
        }
        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition") ?? "";
        const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `hermicad.${format}`;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        URL.revokeObjectURL(url);
        setStatus(`خروجی ${format.toUpperCase()} دریافت شد`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "خطای خروجی");
      } finally {
        setBusy(null);
      }
    },
    [doc],
  );

  const print = useCallback(async () => {
    setBusy("print");
    try {
      const response = await fetch("/api/designs/export", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: doc, format: "svg", options: { theme: "print", classification: doc.classification } }),
      });
      const svg = await response.text();
      const win = window.open("", "_blank");
      if (!win) throw new Error("مرورگر پنجرهٔ چاپ را مسدود کرد.");
      win.document.write(
        `<html dir="rtl"><head><title>${doc.project.code}</title><style>@page{size:${doc.sheet.format} ${doc.sheet.orientation};margin:0}body{margin:0}svg{width:100%;height:auto}</style></head><body>${svg}</body></html>`,
      );
      win.document.close();
      setTimeout(() => win.print(), 400);
      setStatus("پیش‌نمایش چاپ باز شد");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "خطای چاپ");
    } finally {
      setBusy(null);
    }
  }, [doc]);

  const itemGroups = doc.items.filter((item) => {
    const def = CATALOG_BY_ID[item.catalogId];
    if (!def) return false;
    return doc.layers[def.layer];
  });

  const handleDragHandle = (item: StudioItem) => {
    const theta = (item.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    return HANDLES.map((handle) => {
      const lx = handle.ax * item.w;
      const ly = handle.ay * item.d;
      const x = item.x + lx * cos - ly * sin;
      const y = item.y - (lx * sin + ly * cos);
      return { ...handle, x, y };
    });
  };

  return (
    <div className="grid gap-3 px-3 py-3 xl:grid-cols-[280px_minmax(0,1fr)_310px]">
      {/* ─────────── کتابخانه ─────────── */}
      <aside className="panel flex max-h-[calc(100vh-120px)] flex-col overflow-hidden p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">کتابخانهٔ اشیا</h2>
          <span className="chip">{CATALOG.length} شیء</span>
        </div>
        <input
          className="field mt-2"
          placeholder="جست‌وجو: مبل، ستون، سینک…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={`chip ${category === "all" ? "border-teal-300/60 bg-teal-400/15 text-teal-100" : ""}`}
          >
            همه
          </button>
          {CATEGORIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              title={entry.blurb}
              onClick={() => setCategory(entry.id)}
              className={`chip ${category === entry.id ? "border-teal-300/60 bg-teal-400/15 text-teal-100" : ""}`}
            >
              {entry.label.split(" ")[0]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-5 text-slate-500">روی شیء کلیک کنید، سپس روی بوم بگذارید. {filtered.length} نتیجه.</p>
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto pl-1">
          {filtered.map((item) => (
            <ItemChip
              key={item.id}
              item={item}
              onPick={() => {
                setPendingCatalog(item.id);
                setMode("place");
                setStatus(`«${item.nameFa}» انتخاب شد — روی بوم کلیک کنید`);
              }}
            />
          ))}
        </div>
      </aside>

      {/* ─────────── بوم ─────────── */}
      <section className="panel flex min-h-[70vh] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-2 py-2 text-[11px]">
          <button
            type="button"
            onClick={() => {
              setMode("select");
              setPendingCatalog(null);
            }}
            className={`btn px-2 py-1 ${mode === "select" ? "btn-primary" : ""}`}
          >
            انتخاب
          </button>
          <button type="button" onClick={() => setMode("pan")} className={`btn px-2 py-1 ${mode === "pan" ? "btn-primary" : ""}`}>
            جابه‌جایی بوم
          </button>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <button type="button" onClick={() => zoomBy(1.25)} className="btn px-2 py-1" title="بزرگ‌نمایی">
            ＋
          </button>
          <button type="button" onClick={() => zoomBy(1 / 1.25)} className="btn px-2 py-1" title="کوچک‌نمایی">
            －
          </button>
          <button type="button" onClick={fit} className="btn px-2 py-1">
            اندازهٔ صفحه
          </button>
          <span className="chip mono">{`${Math.round((size.w / (view.w * scalePx)) * 100)}%`}</span>
          <span className="mx-1 h-5 w-px bg-white/10" />
          <button
            type="button"
            onClick={() => setSnapOn((value) => !value)}
            className={`btn px-2 py-1 ${snapOn ? "btn-primary" : ""}`}
            title="جذب به شبکه"
          >
            جذب {snapOn ? "روشن" : "خاموش"}
          </button>
          <select
            className="field w-auto py-1 text-[11px]"
            value={doc.grid}
            onChange={(event) => commit({ ...doc, grid: Number(event.target.value) })}
          >
            {[0.05, 0.1, 0.25, 0.5, 1].map((value) => (
              <option key={value} value={value}>{`شبکه ${value} m`}</option>
            ))}
          </select>
          <button type="button" onClick={undo} className="btn px-2 py-1" title="واگرد (Ctrl+Z)">
            ↶
          </button>
          <button type="button" onClick={redo} className="btn px-2 py-1" title="ازنو (Ctrl+Shift+Z)">
            ↷
          </button>
          <span className="flex-1" />
          <Link href={`/guide/${doc.id}`} onClick={e=>{if(!window.confirm("مسیر راهنما آخرین نسخهٔ ذخیره‌شده را باز می‌کند. تغییرات نقشه را ذخیره کرده‌اید؟"))e.preventDefault();}} className="btn px-3 py-1">پرونده و تحویل گام‌به‌گام</Link>
          <button type="button" onClick={save} disabled={busy === "save"} className="btn px-3 py-1">
            {busy === "save" ? "در حال ذخیره…" : "ذخیره"}
          </button>
          <button type="button" onClick={print} disabled={busy === "print"} className="btn btn-primary px-3 py-1">
            چاپ / PDF
          </button>
        </div>

        <div ref={canvasRef} className="relative flex-1 touch-none overflow-hidden bg-[#070c16]">
          <svg
            width={size.w}
            height={size.h}
            className="block select-none"
            style={{ cursor: mode === "pan" ? "grab" : mode === "place" ? "crosshair" : "default" }}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <defs>
              <pattern id="sheet-grid" width="1" height="1" patternUnits="userSpaceOnUse" />
              <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="0.03" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g transform={`translate(${offsetX},${offsetY}) scale(${scalePx},${-scalePx}) translate(${-view.x},${-(view.y + view.h)})`}>
              {/* شبکه */}
              {doc.gridVisible && doc.grid > 0 && scalePx * doc.grid > 4 && <GridLines view={view} grid={doc.grid} />}
              {/* اشیا */}
              {itemGroups.map((item) => {
                const def = CATALOG_BY_ID[item.catalogId];
                if (!def) return null;
                const theta = (item.rotationDeg * Math.PI) / 180;
                const cos = Math.cos(theta);
                const sin = Math.sin(theta);
                const map = (lx: number, ly: number) => ({ x: item.x + lx * cos - ly * sin, y: item.y - (lx * sin + ly * cos) });
                const stroke = LAYER_SCREEN_COLOR[def.layer] ?? "#cbd5e1";
                // محو کردن طبقات دیگر و رشته‌های دیگر؛ هیچ شیئی از بوم حذف نمی‌شود
                // (ویرایشگر باید همیشه همهٔ اشیای سند را نشان دهد، حتی اگر روی
                // برگهٔ چاپیِ رشتهٔ جاری نیایند).
                const otherDiscipline = doc.classification !== "all" && def.discipline !== doc.classification;
                const dim = item.level !== doc.currentLevel || Boolean(otherDiscipline);
                const isSelected = item.id === selectedId;
                return (
                  <g
                    key={item.id}
                    opacity={dim ? (item.level !== doc.currentLevel ? 0.3 : 0.5) : 1}
                    onPointerDown={(event) => startItemDrag(event, item)}
                    style={{ cursor: "move" }}
                  >
                    <polygon
                      points={[
                        map(-item.w / 2, -item.d / 2),
                        map(item.w / 2, -item.d / 2),
                        map(item.w / 2, item.d / 2),
                        map(-item.w / 2, item.d / 2),
                      ]
                        .map((point) => `${point.x},${point.y}`)
                        .join(" ")}
                      fill="rgba(0,0,0,0.001)"
                      stroke="none"
                    />
                    {def.parts.map((part, index) => {
                      const common = {
                        fill: FILL_SCREEN[part.fill ?? "none"],
                        stroke: isSelected ? "#5eead4" : stroke,
                        strokeWidth: 1.2 / scalePx,
                        strokeDasharray: part.dashed ? `${3 / scalePx} ${2 / scalePx}` : undefined,
                      };
                      if (part.kind === "rect") {
                        const x0 = (part.x - 0.5) * item.w;
                        const y0 = (part.y - 0.5) * item.d;
                        const x1 = x0 + part.w * item.w;
                        const y1 = y0 + part.h * item.d;
                        return (
                          <polygon
                            key={index}
                            points={[map(x0, y0), map(x1, y0), map(x1, y1), map(x0, y1)].map((point) => `${point.x},${point.y}`).join(" ")}
                            {...common}
                          />
                        );
                      }
                      if (part.kind === "circle") {
                        const center = map((part.cx - 0.5) * item.w, (part.cy - 0.5) * item.d);
                        return <circle key={index} cx={center.x} cy={center.y} r={part.r * Math.min(item.w, item.d) * 0.5} {...common} />;
                      }
                      if (part.kind === "poly") {
                        const pts = part.points
                          .map(([u, v]) => map((u - 0.5) * item.w, (v - 0.5) * item.d))
                          .map((point) => `${point.x},${point.y}`)
                          .join(" ");
                        return part.closed === false ? (
                          <polyline
                            key={index}
                            points={pts}
                            fill="none"
                            stroke={common.stroke}
                            strokeWidth={common.strokeWidth}
                            strokeDasharray={common.strokeDasharray}
                          />
                        ) : (
                          <polygon key={index} points={pts} {...common} />
                        );
                      }
                      if (part.kind === "mline") {
                        const a = map(part.x1, part.y1);
                        const b = map(part.x2, part.y2);
                        return (
                          <line
                            key={index}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            fill="none"
                            stroke={common.stroke}
                            strokeWidth={common.strokeWidth}
                            strokeDasharray={common.strokeDasharray}
                          />
                        );
                      }
                      if (part.kind === "marc") {
                        const steps = 16;
                        const pts: string[] = [];
                        for (let i = 0; i <= steps; i += 1) {
                          const angle = ((part.from + ((part.to - part.from) * i) / steps) * Math.PI) / 180;
                          const point = map(part.cx + part.r * Math.cos(angle), part.cy + part.r * Math.sin(angle));
                          pts.push(`${point.x},${point.y}`);
                        }
                        return (
                          <polyline
                            key={index}
                            points={pts.join(" ")}
                            fill="none"
                            stroke={common.stroke}
                            strokeWidth={common.strokeWidth}
                            strokeDasharray={common.strokeDasharray}
                          />
                        );
                      }
                      const a = map((part.x1 - 0.5) * item.w, (part.y1 - 0.5) * item.d);
                      const b = map((part.x2 - 0.5) * item.w, (part.y2 - 0.5) * item.d);
                      return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} {...common} />;
                    })}
                    {isSelected && (
                      <g>
                        {handleDragHandle(item).map((handle) => (
                          <rect
                            key={handle.id}
                            x={handle.x - 5 / scalePx}
                            y={handle.y - 5 / scalePx}
                            width={10 / scalePx}
                            height={10 / scalePx}
                            fill="#0f172a"
                            stroke="#5eead4"
                            strokeWidth={1.2 / scalePx}
                            style={{ cursor: handle.cursor }}
                            onPointerDown={(event) => startResize(event, item, handle.id)}
                          />
                        ))}
                        <circle
                          cx={map(0, -item.d / 2 - 0.35).x}
                          cy={map(0, -item.d / 2 - 0.35).y}
                          r={5 / scalePx}
                          fill="#5eead4"
                          stroke="#0f172a"
                          strokeWidth={1 / scalePx}
                          style={{ cursor: "crosshair" }}
                          onPointerDown={(event) => startRotate(event, item)}
                        />
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="pointer-events-none absolute bottom-2 left-2 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[10px] text-slate-400">
            {selectedDef
              ? `${selectedDef.nameFa} · ${selected!.w.toFixed(2)}×${selected!.d.toFixed(2)} m · ${selected!.rotationDeg}°`
              : "برای انتخاب، روی شیء کلیک کنید"}
          </div>
          {pendingCatalog && (
            <div className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-max rounded-lg border border-teal-300/40 bg-teal-400/10 px-3 py-1 text-[11px] text-teal-100">
              حالت درج: {CATALOG_BY_ID[pendingCatalog]?.nameFa} — روی بوم کلیک کنید
            </div>
          )}
          {status && (
            <div className="pointer-events-none absolute bottom-2 right-2 rounded-lg border border-white/10 bg-black/60 px-2 py-1 text-[10px] text-slate-300">
              {status}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-2 py-1.5 text-[10px] text-slate-400">
          <span>اشیا: {doc.items.length}</span>
          <span>·</span>
          <span>قابل‌مشاهده: {itemGroups.length}</span>
          <span>·</span>
          <span>زیربنا: {summary.reduce((sum, row) => sum + row.totalAreaM2, 0).toFixed(1)} m²</span>
          <span>·</span>
          <span className="mono">{documentFingerprint(doc)}</span>
          <span className="flex-1" />
          <span>{issues.length === 0 ? "بدون هشدار" : `${issues.length} هشدار`}</span>
        </div>
      </section>

      {/* ─────────── تنظیمات ─────────── */}
      <aside className="panel max-h-[calc(100vh-120px)] space-y-3 overflow-y-auto p-3 text-xs">
        <section>
          <h3 className="text-[11px] font-bold text-teal-200">شیء انتخاب‌شده</h3>
          {selected && selectedDef ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <ItemPreview item={selectedDef} size={40} />
                <div>
                  <div className="text-slate-100">{selectedDef.nameFa}</div>
                  <div className="mono text-[9px] text-slate-500">{selectedDef.ifcClass}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="label">عرض (m)</span>
                  <input
                    type="number"
                    step={0.05}
                    value={selected.w}
                    onChange={(event) => commit(updateItem(doc, selected.id, { w: Number(event.target.value) }), "ابعاد تغییر کرد")}
                    className="field field-mono"
                  />
                </label>
                <label className="block">
                  <span className="label">عمق (m)</span>
                  <input
                    type="number"
                    step={0.05}
                    value={selected.d}
                    onChange={(event) => commit(updateItem(doc, selected.id, { d: Number(event.target.value) }), "ابعاد تغییر کرد")}
                    className="field field-mono"
                  />
                </label>
                <label className="block">
                  <span className="label">ارتفاع شیء (متر)</span>
                  <input
                    className="field field-mono"
                    type="number"
                    min={0.05}
                    max={30}
                    step={0.05}
                    value={selected.heightM ?? ""}
                    placeholder={String(itemVertical(selected, doc).height)}
                    onChange={(event) =>
                      commit(
                        updateItem(doc, selected.id, { heightM: event.target.value === "" ? undefined : Number(event.target.value) }),
                        "ارتفاع شیء تغییر کرد",
                      )
                    }
                  />
                </label>
                {isOpening(selected) && (
                  <label className="block">
                    <span className="label">کف‌نشیمن بازشو (متر)</span>
                    <input
                      className="field field-mono"
                      type="number"
                      min={0}
                      max={12}
                      step={0.05}
                      value={selected.sillM ?? ""}
                      placeholder={String(itemVertical(selected, doc).sill)}
                      onChange={(event) =>
                        commit(
                          updateItem(doc, selected.id, { sillM: event.target.value === "" ? undefined : Number(event.target.value) }),
                          "کف‌نشیمن تغییر کرد",
                        )
                      }
                    />
                  </label>
                )}
                <label className="block">
                  <span className="label">چرخش (°)</span>
                  <input
                    type="number"
                    step={15}
                    value={selected.rotationDeg}
                    onChange={(event) => commit(updateItem(doc, selected.id, { rotationDeg: Number(event.target.value) }), "چرخش")}
                    className="field field-mono"
                  />
                </label>
                <label className="block">
                  <span className="label">طبقه</span>
                  <select
                    className="field"
                    value={selected.level}
                    onChange={(event) => commit(updateItem(doc, selected.id, { level: Number(event.target.value) }))}
                  >
                    {Array.from({ length: doc.levels }, (_, index) => (
                      <option key={index} value={index}>{`طبقه ${index + 1}`}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="label">تغییر نوع / شکل شیء</span>
                {/* همان شیء، با نوع دیگری از کتابخانه جایگزین می‌شود (شکل و کلاس
                    IFC عوض می‌شود، موقعیت و طبقه می‌ماند) */}
                <select
                  className="field"
                  value={selected.catalogId}
                  onChange={(event) => {
                    const next = CATALOG_BY_ID[event.target.value];
                    if (!next) return;
                    commit(
                      updateItem(doc, selected.id, {
                        catalogId: next.id,
                        heightM: undefined,
                        sillM: undefined,
                        w: next.defaultSize.w,
                        d: next.defaultSize.d,
                      }),
                      "نوع شیء تغییر کرد",
                    );
                  }}
                >
                  {CATEGORIES.map((category) => (
                    <optgroup key={category.id} label={category.label}>
                      {CATALOG.filter((entry) => entry.category === category.id).map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.nameFa}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="btn px-2 py-1" onClick={() => commit(rotateItem(doc, selected.id, 90), "چرخش ۹۰°")}>
                  ۹۰°
                </button>
                <button type="button" className="btn px-2 py-1" onClick={() => commit(rotateItem(doc, selected.id, -90), "چرخش ۹۰°")}>
                  ‑۹۰°
                </button>
                <button type="button" className="btn px-2 py-1" onClick={() => commit(duplicateItem(doc, selected.id), "تکثیر")}>
                  تکثیر
                </button>
                <button
                  type="button"
                  className="btn px-2 py-1 text-rose-200"
                  onClick={() => {
                    commit(removeItem(doc, selected.id), "حذف شد");
                    setSelectedId(null);
                  }}
                >
                  حذف
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              با انتخاب یک شیء، ابعاد، چرخش و طبقهٔ آن را اینجا تغییر دهید. دسته‌های تغییر اندازه روی بوم هم فعال‌اند.
            </p>
          )}
        </section>

        <SharePanel designId={doc.id} />

        <section>
          <h3 className="text-[11px] font-bold text-teal-200">خروجی بر اساس رشته</h3>
          <select
            className="field mt-1"
            value={doc.classification}
            onChange={(event) => commit({ ...doc, classification: event.target.value as StudioDocument["classification"] }, "فیلتر رشته")}
          >
            {CLASSIFICATION_LABELS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          <details className="mt-2 text-[11px]">
            <summary className="cursor-pointer text-teal-200">فرض‌های برآورد آرماتور سقف</summary>
            <p className="my-2 text-amber-200">
              ویژهٔ دال توپر مستطیلی؛ این تنظیمات طراحی یا تأیید آیین‌نامه‌ای نیستند. با سند ذخیره می‌شوند.
            </p>
            {Object.entries(SLAB_PARAM_RANGES).map(([key, [min, max, label]]) => {
              const name = key as keyof typeof SLAB_PARAM_RANGES;
              return (
                <label key={key} className="mb-2 block">
                  {label}
                  <input
                    aria-label={label}
                    type="number"
                    min={min}
                    max={max}
                    step={name.includes("Diameter") || name === "diameterMm" || name === "anchorageFactor" ? 1 : 0.01}
                    className="field mt-1"
                    value={doc.slabRebar?.[name] ?? SLAB_REBAR_DEFAULTS[name]}
                    onChange={(event) => {
                      const value = event.target.valueAsNumber;
                      if (Number.isFinite(value)) commit({ ...doc, slabRebar: { ...doc.slabRebar, [name]: value } }, "فرض‌های مترهٔ سقف");
                    }}
                  />
                </label>
              );
            })}
            <label className="block">
              نوار بالا
              <select
                className="field mt-1"
                value={doc.slabRebar?.topMode ?? "all"}
                onChange={(event) =>
                  commit({ ...doc, slabRebar: { ...doc.slabRebar, topMode: event.target.value as "all" | "perimeter" } }, "نوار بالای سقف")
                }
              >
                <option value="all">همهٔ لبه‌های دهانه‌ها (فرضی)</option>
                <option value="perimeter">پیرامونی؛ بدون لبه‌های مشترک</option>
              </select>
            </label>
            <button
              type="button"
              className="btn mt-2"
              onClick={() => commit({ ...doc, slabRebar: { ...SLAB_REBAR_DEFAULTS } }, "بازنشانی فرض‌های سقف")}
            >
              بازنشانی فرض‌ها
            </button>
          </details>
          <div className="mt-2 grid grid-cols-2 gap-1">
            {[
              { id: "svg", label: "SVG نقشه" },
              { id: "pdf", label: "PDF" },
              { id: "pdf-bundle", label: "PDF چندبرگی (طبقه × رشته)" },
              { id: "dxf", label: "DXF (اتوکد)" },
              { id: "csv", label: "CSV متره" },
              { id: "items-csv", label: "CSV اشیا" },
              { id: "elevations", label: "برگهٔ نماها SVG" },
              { id: "elevations-pdf", label: "برگهٔ نماها PDF" },
              { id: "section", label: "برش A-A (SVG)" },
              { id: "section-pdf", label: "برش A-A (PDF)" },
              { id: "elevations-dxf", label: "نماها DXF (۱:۱)" },
              { id: "section-dxf", label: "برش DXF (۱:۱)" },
              { id: "slab-rebar", label: "پلان آرماتور سقف (SVG)" },
              { id: "slab-rebar-pdf", label: "پلان آرماتور سقف (PDF)" },
              { id: "slab-rebar-csv", label: "جدول میلگرد سقف (CSV)" },
              { id: "schedules", label: "جداول و کیپلان (SVG)" },
              { id: "schedules-pdf", label: "جداول و کیپلان (PDF)" },
              { id: "details", label: "جزئیات سازه و میلگرد (SVG)" },
              { id: "details-pdf", label: "جزئیات سازه و میلگرد (PDF)" },
              { id: "details-dxf", label: "جزئیات سازه DXF (۱:۱)" },
              { id: "arch-details", label: "جزئیات معماری (SVG)" },
              { id: "arch-details-pdf", label: "جزئیات معماری (PDF)" },
              { id: "arch-details-dxf", label: "جزئیات معماری DXF" },
              { id: "xlsx", label: "XLSX متره و برآورد" },
              { id: "ifc", label: "IFC4 (BIM)" },
              { id: "json", label: "JSON مدل" },
            ].filter(format=>!structuralExportError(doc.brief?.structural?.family, format.id)).map((format) => (
              <button
                key={format.id}
                type="button"
                onClick={() => download(format.id)}
                disabled={busy === format.id}
                className={`btn px-2 py-1 ${format.id === "pdf-bundle" ? "col-span-2" : ""}`}
              >
                {busy === format.id ? "…" : format.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold text-teal-200">لایه‌ها</h3>
            <button type="button" className="text-[10px] text-slate-400" onClick={() => setShowLayers((value) => !value)}>
              {showLayers ? "بستن" : "باز کردن"}
            </button>
          </div>
          {showLayers && (
            <div className="mt-1 space-y-1">
              {STUDIO_LAYERS.map((layer) => (
                <label key={layer.id} className="flex items-center gap-2 text-[10px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={doc.layers[layer.id]}
                    onChange={(event) => commit({ ...doc, layers: { ...doc.layers, [layer.id]: event.target.checked } })}
                  />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: layer.color }} />
                  {layer.label}
                </label>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-[11px] font-bold text-teal-200">برگه و طبقات</h3>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">اندازهٔ برگه</span>
              <select
                className="field"
                value={doc.sheet.format}
                onChange={(event) =>
                  commit({ ...doc, sheet: { ...doc.sheet, format: event.target.value as StudioDocument["sheet"]["format"] } })
                }
              >
                {["A4", "A3", "A2", "A1", "A0"].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">مقیاس</span>
              <select
                className="field"
                value={doc.sheet.scale}
                onChange={(event) => commit({ ...doc, sheet: { ...doc.sheet, scale: Number(event.target.value) } })}
              >
                {[20, 25, 50, 75, 100, 200].map((value) => (
                  <option key={value} value={value}>{`1:${value}`}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">جهت</span>
              <select
                className="field"
                value={doc.sheet.orientation}
                onChange={(event) =>
                  commit({ ...doc, sheet: { ...doc.sheet, orientation: event.target.value as "landscape" | "portrait" } })
                }
              >
                <option value="landscape">افقی</option>
                <option value="portrait">عمودی</option>
              </select>
            </label>
            <label className="block">
              <span className="label">ارتفاع کف تا کف (متر)</span>
              <input
                type="number"
                className="field field-mono"
                min={2}
                max={12}
                step={0.1}
                value={doc.floorHeightM ?? ""}
                placeholder={String(floorHeight(doc))}
                onChange={(event) =>
                  commit(
                    { ...doc, floorHeightM: event.target.value === "" ? undefined : Number(event.target.value) },
                    "ارتفاع طبقات تغییر کرد",
                  )
                }
              />
            </label>
            <label className="block">
              <span className="label">تعداد طبقات</span>
              <input
                type="number"
                min={1}
                max={60}
                className="field field-mono"
                value={doc.levels}
                onChange={(event) => {
                  const levels = Math.max(1, Math.min(60, Math.trunc(Number(event.target.value))));
                  if (doc.items.some((item) => item.level >= levels)) {
                    setStatus("ابتدا اشیای طبقات حذف‌شونده را جابه‌جا یا حذف کنید.");
                    return;
                  }
                  commit({ ...doc, levels, currentLevel: Math.min(doc.currentLevel, levels - 1) });
                }}
              />
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {Array.from({ length: doc.levels }, (_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => commit({ ...doc, currentLevel: index })}
                className={`chip ${doc.currentLevel === index ? "border-teal-300/60 bg-teal-400/15 text-teal-100" : ""}`}
              >
                {`ط${index + 1}`}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-[11px] font-bold text-teal-200">جدول اشیا</h3>
          <div className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-[10px]">
            {summary.length === 0 && <p className="text-slate-500">هنوز شیئی اضافه نشده است.</p>}
            {summary.map((row) => (
              <div key={row.catalogId} className="flex items-center justify-between gap-2 border-b border-white/5 py-0.5">
                <span className="truncate text-slate-300">{row.nameFa}</span>
                <span className="mono text-slate-500">{row.count} ×</span>
              </div>
            ))}
          </div>
        </section>

        {issues.length > 0 && (
          <section>
            <h3 className="text-[11px] font-bold text-amber-200">هشدارهای یکپارچگی</h3>
            <ul className="mt-1 space-y-1 text-[10px] leading-5 text-amber-100/80">
              {issues.map((issue) => (
                <li key={issue.code}>• {issue.message}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="border-t border-white/10 pt-2 text-[10px] leading-5 text-slate-500">
          <p>
            {doc.project.name} · {doc.project.code}
          </p>
          <p>
            تجدیدنظر {doc.revision} · {doc.project.date}
          </p>
          <p className="mt-1">خروجی برای کنترل مهندس دارای صلاحیت است، نه تأییدیهٔ انطباق.</p>
          <Link href={`/design/${doc.id}/gallery`} className="btn btn-primary mt-2 w-full justify-center px-2 py-1">
            گالری رندرهای طبقه‌بندی‌شده
          </Link>
          <Link href="/design" className="btn mt-2 w-full justify-center px-2 py-1">
            همهٔ اسناد طراحی
          </Link>
        </section>
      </aside>
    </div>
  );
}

function GridLines({ view, grid }: { view: { x: number; y: number; w: number; h: number }; grid: number }) {
  const lines: React.ReactNode[] = [];
  const startX = Math.floor(view.x / grid) * grid;
  const startY = Math.floor(view.y / grid) * grid;
  const count = Math.ceil((view.w + view.h) / grid);
  if (count > 1200) return null;
  for (let x = startX; x <= view.x + view.w; x += grid) {
    lines.push(
      <line key={`x${x.toFixed(3)}`} x1={x} y1={view.y} x2={x} y2={view.y + view.h} stroke="rgba(148,163,184,0.12)" strokeWidth={0.5} />,
    );
  }
  for (let y = startY; y <= view.y + view.h; y += grid) {
    lines.push(
      <line key={`y${y.toFixed(3)}`} x1={view.x} y1={y} x2={view.x + view.w} y2={y} stroke="rgba(148,163,184,0.12)" strokeWidth={0.5} />,
    );
  }
  return <g>{lines}</g>;
}
