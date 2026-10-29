import { bbox, polygonArea, rectRight, rectTop } from "../geometry";
import { ROOM_COLORS, ROOM_LABEL_FA } from "../program";
import type { CanonicalScheme, DimensionLine, Level, Opening, Rect, Room, Vec2, Wall } from "../types";

const ROOM_CODE: Record<string, string> = {
  living: "LIV",
  kitchen: "KIT",
  masterBedroom: "MBED",
  bedroom: "BED",
  bath: "BATH",
  wc: "WC",
  entry: "ENTRY",
  hall: "HALL",
  storage: "STOR",
  corridor: "CORR",
  core: "CORE",
  lobby: "LOBBY",
  balcony: "BALC",
  void: "SHAFT",
  parking: "PARK",
};


interface WallBand {
  corners: Vec2[];
  cx: number;
  cy: number;
  angleDeg: number;
}

/** Rectangle band around a wall centreline (used by SVG, PDF and DXF). */
export function wallBand(wall: Wall): WallBand {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy * (wall.thicknessM / 2);
  const ny = ux * (wall.thicknessM / 2);
  return {
    corners: [
      { x: wall.start.x + nx, y: wall.start.y + ny },
      { x: wall.end.x + nx, y: wall.end.y + ny },
      { x: wall.end.x - nx, y: wall.end.y - ny },
      { x: wall.start.x - nx, y: wall.start.y - ny },
    ],
    cx: (wall.start.x + wall.end.x) / 2,
    cy: (wall.start.y + wall.end.y) / 2,
    angleDeg: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}

export function openingGapRect(wall: Wall, opening: Opening): { x: number; y: number; w: number; h: number } {
  const band = wallBand(wall);
  const half = opening.widthM / 2;
  const alongX = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
  const thickness = wall.thicknessM + 0.02;
  if (alongX) {
    return { x: opening.center.x - half, y: band.cy - thickness / 2, w: opening.widthM, h: thickness };
  }
  return { x: band.cx - thickness / 2, y: opening.center.y - half, w: thickness, h: opening.widthM };
}

const WALL_FILL: Record<Wall["kind"], string> = {
  exterior: "#0f172a",
  party: "#334155",
  interior: "#475569",
  shaft: "#7c3aed",
};

export function roomCode(room: Room): string {
  return ROOM_CODE[room.kind] ?? "SPACE";
}

function polyPoints(poly: Vec2[], map: (p: Vec2) => { x: number; y: number }): string {
  return poly.map((p) => {
    const q = map(p);
    return `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
  }).join(" ");
}

interface SvgOptions {
  width?: number;
  title: string;
  subtitle: string;
  level?: Level;
  showGrid?: boolean;
}

function sceneBounds(scheme: CanonicalScheme): Rect {
  const box = bbox(scheme.site.boundary);
  return { x: box.x - 4, y: box.y - 4, w: box.w + 8, h: box.h + 8 };
}

function svgHeader(width: number, height: number, vb: Rect): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" width="${width}" height="${height}" font-family="Vazirmatn, Tahoma, sans-serif" direction="rtl" role="img">`;
}

function legend(items: { label: string; color: string }[]): string {
  return items
    .map((item, i) => `<g transform="translate(0,${i * 2})"><rect width="1.6" height="1.6" fill="${item.color}"/><text x="2" y="1.3" font-size="1">${item.label}</text></g>`)
    .join("");
}


function svgDimension(dim: DimensionLine): string {
  const horizontal = Math.abs(dim.start.y - dim.end.y) < Math.abs(dim.start.x - dim.end.x);
  const parts: string[] = [];
  const offset = dim.offsetM;
  const text = `${dim.valueM.toFixed(2)} m`;
  if (horizontal) {
    const y = dim.start.y + offset;
    parts.push(`<line x1="${dim.start.x}" y1="${y}" x2="${dim.end.x}" y2="${y}" stroke="#0f172a" stroke-width="0.03"/>`);
    for (const x of [dim.start.x, dim.end.x]) {
      parts.push(`<line x1="${x}" y1="${y - 0.25}" x2="${x}" y2="${y + 0.25}" stroke="#0f172a" stroke-width="0.05"/>`);
      parts.push(`<line x1="${x}" y1="${dim.start.y}" x2="${x}" y2="${y}" stroke="#94a3b8" stroke-width="0.02" stroke-dasharray="0.2 0.15"/>`);
    }
    parts.push(`<text x="${(dim.start.x + dim.end.x) / 2}" y="${y - 0.25}" font-size="0.62" text-anchor="middle" fill="#0f172a">${text}</text>`);
  } else {
    const x = dim.start.x + offset;
    parts.push(`<line x1="${x}" y1="${dim.start.y}" x2="${x}" y2="${dim.end.y}" stroke="#0f172a" stroke-width="0.03"/>`);
    for (const y of [dim.start.y, dim.end.y]) {
      parts.push(`<line x1="${x - 0.25}" y1="${y}" x2="${x + 0.25}" y2="${y}" stroke="#0f172a" stroke-width="0.05"/>`);
      parts.push(`<line x1="${dim.start.x}" y1="${y}" x2="${x}" y2="${y}" stroke="#94a3b8" stroke-width="0.02" stroke-dasharray="0.2 0.15"/>`);
    }
    parts.push(`<text x="${x - 0.25}" y="${(dim.start.y + dim.end.y) / 2}" font-size="0.62" text-anchor="middle" transform="rotate(-90 ${x - 0.25} ${(dim.start.y + dim.end.y) / 2})" fill="#0f172a">${text}</text>`);
  }
  return parts.join("");
}

export function sitePlanSvg(scheme: CanonicalScheme, title = "Site plan"): string {
  const vb = sceneBounds(scheme);
  const width = 1200;
  const height = Math.round((vb.h / vb.w) * width);
  const boundary = scheme.site.boundary;
  const parts: string[] = [];
  parts.push(svgHeader(width, height, vb));
  parts.push(`<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#f8fafc"/>`);
  // grid
  const step = 5;
  for (let x = Math.floor(vb.x / step) * step; x < vb.x + vb.w; x += step) {
    parts.push(`<line x1="${x}" y1="${vb.y}" x2="${x}" y2="${vb.y + vb.h}" stroke="#e2e8f0" stroke-width="0.02"/>`);
  }
  for (let y = Math.floor(vb.y / step) * step; y < vb.y + vb.h; y += step) {
    parts.push(`<line x1="${vb.x}" y1="${y}" x2="${vb.x + vb.w}" y2="${y}" stroke="#e2e8f0" stroke-width="0.02"/>`);
  }
  parts.push(`<polygon points="${polyPoints(boundary, (p) => p)}" fill="#e7f5ec" stroke="#166534" stroke-width="0.12"/>`);
  if (scheme.buildablePolygon.length >= 3) {
    parts.push(
      `<polygon points="${polyPoints(scheme.buildablePolygon, (p) => p)}" fill="none" stroke="#b45309" stroke-width="0.08" stroke-dasharray="0.6 0.4"/>`,
    );
  }
  for (const rect of scheme.footprintRects) {
    parts.push(
      `<rect x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}" fill="#1e293b" fill-opacity="0.1" stroke="#1e293b" stroke-width="0.12"/>`,
    );
    for (const room of scheme.levels[0].rooms) {
      if (!insideRect(room, rect)) continue;
      parts.push(
        `<polygon points="${polyPoints(room.polygon, (p) => p)}" fill="${ROOM_COLORS[room.kind]}" stroke="#334155" stroke-width="0.035"/>`,
      );
    }
  }
  for (const point of scheme.site.spotLevels) {
    parts.push(`<circle cx="${point.x}" cy="${point.y}" r="0.35" fill="#0ea5e9" stroke="#fff" stroke-width="0.08"/>`);
    parts.push(`<text x="${point.x + 0.6}" y="${point.y + 0.2}" font-size="1" fill="#0369a1">${point.z.toFixed(1)}</text>`);
  }
  const top = vb.y + 3;
  parts.push(`<text x="${vb.x + vb.w - 1}" y="${top}" font-size="2.2" font-weight="700" fill="#0f172a">${title}</text>`);
  parts.push(
    `<text x="${vb.x + vb.w - 1}" y="${top + 2.6}" font-size="1.3" fill="#334155">${scheme.code} · ${scheme.strategyLabel} · مساحت زمین ${scheme.plotAreaM2} m² · تراکم ${(scheme.grossFloorAreaM2 / Math.max(1, scheme.plotAreaM2)).toFixed(2)}</text>`,
  );
  // north arrow
  const nx = vb.x + vb.w - 6;
  const ny = vb.y + 6;
  parts.push(
    `<g transform="rotate(${-scheme.site.northAngleDeg} ${nx} ${ny})"><line x1="${nx}" y1="${ny + 3}" x2="${nx}" y2="${ny - 2}" stroke="#0f172a" stroke-width="0.12"/><polygon points="${nx - 0.7},${ny - 1.2} ${nx + 0.7},${ny - 1.2} ${nx},${ny - 2.6}" fill="#0f172a"/><text x="${nx}" y="${ny + 4}" font-size="1.2" text-anchor="middle" fill="#0f172a">N</text></g>`,
  );
  // scale bar
  const sx = vb.x + 4;
  const sy = vb.y + vb.h - 4;
  parts.push(`<line x1="${sx}" y1="${sy}" x2="${sx + 10}" y2="${sy}" stroke="#0f172a" stroke-width="0.12"/>`);
  parts.push(`<line x1="${sx}" y1="${sy - 0.4}" x2="${sx}" y2="${sy + 0.4}" stroke="#0f172a" stroke-width="0.12"/>`);
  parts.push(`<line x1="${sx + 10}" y1="${sy - 0.4}" x2="${sx + 10}" y2="${sy + 0.4}" stroke="#0f172a" stroke-width="0.12"/>`);
  parts.push(`<text x="${sx + 5}" y="${sy + 1.6}" font-size="1" text-anchor="middle" fill="#0f172a">10 m</text>`);
  parts.push(`<text x="${sx}" y="${sy - 1}" font-size="0.9" fill="#475569">مرز زمین / خط‌چین: سطح ساخت‌پذیر پس از عقب‌نشینی</text>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

export function floorPlanSvg(scheme: CanonicalScheme, levelIndex = 0, title?: string, highlightRoomIds: string[] = []): string {
  const level = scheme.levels[Math.min(levelIndex, scheme.levels.length - 1)];
  const hasPlan = (level.walls?.length ?? 0) > 0;
  const box = bbox(level.plateRects.flatMap((r) => [
    { x: r.x, y: r.y },
    { x: rectRight(r), y: rectTop(r) },
  ]));
  const vb = { x: box.x - 5, y: box.y - 4, w: box.w + 10, h: box.h + 13 };
  const width = 1400;
  const height = Math.round((vb.h / vb.w) * width);
  const parts: string[] = [];
  parts.push(svgHeader(width, height, vb));
  parts.push(`<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#ffffff"/>`);
  for (const plate of level.plateRects) {
    parts.push(`<rect x="${plate.x}" y="${plate.y}" width="${plate.w}" height="${plate.h}" fill="#f8fafc" stroke="none"/>`);
  }
  // room tints + labels
  for (const room of level.rooms) {
    parts.push(
      `<polygon points="${polyPoints(room.polygon, (p) => p)}" fill="${ROOM_COLORS[room.kind]}" fill-opacity="${hasPlan ? "0.28" : "0.55"}" stroke="none"/>`,
    );
    const c = centroidOf(room.polygon);
    if (room.areaM2 > 1.0) {
      parts.push(`<text x="${c.x}" y="${c.y - 0.15}" font-size="${room.areaM2 > 14 ? 0.78 : 0.55}" text-anchor="middle" fill="#0f172a">${roomCode(room)}</text>`);
      parts.push(`<text x="${c.x}" y="${c.y + 1.0}" font-size="${room.areaM2 > 14 ? 0.62 : 0.45}" text-anchor="middle" fill="#334155">${room.areaM2.toFixed(1)} m²</text>`);
    }
  }
  if (hasPlan) {
    const walls = level.walls ?? [];
    const openings = level.openings ?? [];
    const wallById = new Map(walls.map((wall) => [wall.id, wall]));
    // 1) walls as solid bands
    for (const wall of walls) {
      const band = wallBand(wall);
      parts.push(`<polygon points="${polyPoints(band.corners, (p) => p)}" fill="${WALL_FILL[wall.kind]}" stroke="#0b1220" stroke-width="0.012"/>`);
    }
    // 2) openings punched out (white) then symbols
    for (const opening of openings) {
      const wall = wallById.get(opening.wallId);
      if (!wall) continue;
      const gap = openingGapRect(wall, opening);
      parts.push(`<rect x="${gap.x}" y="${gap.y}" width="${gap.w}" height="${gap.h}" fill="#ffffff"/>`);
      const band = wallBand(wall);
      const alongX = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
      if (opening.kind === "window") {
        // window: three parallel lines + sill annotation
        if (alongX) {
          for (const dy of [-0.09, 0, 0.09]) {
            parts.push(
              `<line x1="${opening.center.x - opening.widthM / 2}" y1="${band.cy + dy}" x2="${opening.center.x + opening.widthM / 2}" y2="${band.cy + dy}" stroke="#0369a1" stroke-width="0.035"/>`,
            );
          }
        } else {
          for (const dx of [-0.09, 0, 0.09]) {
            parts.push(
              `<line x1="${band.cx + dx}" y1="${opening.center.y - opening.widthM / 2}" x2="${band.cx + dx}" y2="${opening.center.y + opening.widthM / 2}" stroke="#0369a1" stroke-width="0.035"/>`,
            );
          }
        }
        parts.push(
          `<text x="${opening.center.x}" y="${opening.center.y + (alongX ? -0.35 : 0.35)}" font-size="0.42" text-anchor="middle" fill="#0369a1">W${opening.widthM.toFixed(2)}×${opening.heightM.toFixed(2)}</text>`,
        );
      } else {
        // door: leaf + 90° swing arc
        const leaf = opening.widthM;
        const hinge = {
          x: opening.center.x - (alongX ? leaf / 2 : 0),
          y: opening.center.y - (alongX ? 0 : leaf / 2),
        };
        const leafEnd = alongX ? { x: hinge.x, y: hinge.y + leaf } : { x: hinge.x + leaf, y: hinge.y };
        parts.push(
          `<line x1="${hinge.x}" y1="${hinge.y}" x2="${leafEnd.x}" y2="${leafEnd.y}" stroke="#7c2d12" stroke-width="0.07" stroke-linecap="round"/>`,
        );
        const arcStart = alongX ? { x: hinge.x + leaf, y: hinge.y } : { x: hinge.x, y: hinge.y + leaf };
        parts.push(
          `<path d="M ${arcStart.x} ${arcStart.y} A ${leaf} ${leaf} 0 0 1 ${leafEnd.x} ${leafEnd.y}" fill="none" stroke="#7c2d12" stroke-width="0.03" stroke-dasharray="0.12 0.1"/>`,
        );
        parts.push(
          `<text x="${opening.center.x}" y="${opening.center.y + (alongX ? 1.1 : -0.5)}" font-size="0.4" text-anchor="middle" fill="#7c2d12">D${opening.widthM.toFixed(2)}</text>`,
        );
      }
    }
    // 3) stair + lift symbol inside each core
    for (const core of level.cores) {
      const cx = core.rect.x + core.rect.w / 2;
      const cy = core.rect.y + core.rect.h / 2;
      const steps = 9;
      for (let i = 0; i < steps; i++) {
        const y = core.rect.y + 0.3 + ((core.rect.h - 0.6) / steps) * i;
        parts.push(`<line x1="${core.rect.x + 0.25}" y1="${y}" x2="${core.rect.x + core.rect.w - 0.25}" y2="${y}" stroke="#7f1d1d" stroke-width="0.025"/>`);
      }
      parts.push(
        `<rect x="${core.rect.x + 0.3}" y="${core.rect.y + 0.3}" width="${Math.max(0.6, core.rect.w - 0.6)}" height="${Math.max(0.6, core.rect.h * 0.35)}" fill="none" stroke="#7f1d1d" stroke-width="0.04" stroke-dasharray="0.15 0.1"/>`,
      );
      parts.push(`<text x="${cx}" y="${core.rect.y + core.rect.h + 0.55}" font-size="0.5" text-anchor="middle" fill="#7f1d1d">پله + آسانسور</text>`);
      parts.push(`<text x="${cx}" y="${cy}" font-size="0.42" text-anchor="middle" fill="#7f1d1d">LIFT</text>`);
    }
    // 4) dimensions
    for (const dim of level.dimensions ?? []) parts.push(svgDimension(dim));
      // 4.5) problem highlight (kept above the plan so it is visible when printed)
    if (highlightRoomIds.length > 0) {
      for (const room of level.rooms) {
        if (!highlightRoomIds.includes(room.id)) continue;
        parts.push(
          `<polygon points="${polyPoints(room.polygon, (p) => p)}" fill="rgba(244,63,94,0.22)" stroke="#e11d48" stroke-width="0.16" stroke-dasharray="0.5 0.25"/>`,
        );
        const c = centroidOf(room.polygon);
        parts.push(`<text x="${c.x}" y="${c.y + 2.2}" font-size="0.62" text-anchor="middle" fill="#be123c" font-weight="700">${roomCode(room)} · مشکل</text>`);
      }
    }
  // 5) unit boundary annotation
    for (const unit of scheme.units) {
      parts.push(
        `<rect x="${unit.rect.x}" y="${unit.rect.y}" width="${unit.rect.w}" height="${unit.rect.h}" fill="none" stroke="#0369a1" stroke-width="0.05" stroke-dasharray="0.35 0.2"/>`,
      );
      parts.push(
        `<text x="${unit.rect.x + 0.25}" y="${unit.rect.y + 0.75}" font-size="0.6" fill="#075985">UNIT ${unit.type} · ${unit.areaM2.toFixed(0)} m²</text>`,
      );
    }
  } else {
    for (const corridor of level.corridors) {
      parts.push(
        `<rect x="${corridor.x}" y="${corridor.y}" width="${corridor.w}" height="${corridor.h}" fill="#94a3b8" fill-opacity="0.5" stroke="#334155" stroke-width="0.04"/>`,
      );
    }
    for (const core of level.cores) {
      parts.push(
        `<rect x="${core.rect.x}" y="${core.rect.y}" width="${core.rect.w}" height="${core.rect.h}" fill="none" stroke="#be123c" stroke-width="0.13" stroke-dasharray="0.5 0.3"/>`,
      );
    }
  }
  // north arrow + scale bar (always)
  const nx = vb.x + vb.w - 2.2;
  const ny = vb.y + 2.4;
  parts.push(
    `<g transform="rotate(${-scheme.site.northAngleDeg} ${nx} ${ny})"><line x1="${nx}" y1="${ny + 1.6}" x2="${nx}" y2="${ny - 1.2}" stroke="#0f172a" stroke-width="0.07"/><polygon points="${nx - 0.4},${ny - 0.6} ${nx + 0.4},${ny - 0.6} ${nx},${ny - 1.7}" fill="#0f172a"/></g>`,
  );
  parts.push(`<text x="${nx}" y="${ny + 2.6}" font-size="0.6" text-anchor="middle" fill="#0f172a">N</text>`);
  const sx = vb.x + 1;
  const sy = vb.y + vb.h - 1.2;
  parts.push(`<line x1="${sx}" y1="${sy}" x2="${sx + 10}" y2="${sy}" stroke="#0f172a" stroke-width="0.08"/>`);
  for (const x of [sx, sx + 5, sx + 10]) parts.push(`<line x1="${x}" y1="${sy - 0.22}" x2="${x}" y2="${sy + 0.22}" stroke="#0f172a" stroke-width="0.05"/>`);
  parts.push(`<text x="${sx + 5}" y="${sy + 0.95}" font-size="0.55" text-anchor="middle" fill="#0f172a">0 — 5 — 10 m</text>`);

  parts.push(
    `<text x="${vb.x + vb.w - 1}" y="${vb.y + vb.h - 0.2}" font-size="0.62" text-anchor="end" fill="#334155">${title ?? `${scheme.code} · ${level.name}`} · ${level.plateAreaM2.toFixed(1)} m² · ${hasPlan ? "دیوار/بازشو مدل‌شده" : "نمای شماتیک فضا"}</text>`,
  );
  parts.push(
    `<text x="${vb.x + 1}" y="${vb.y + 1.2}" font-size="0.55" fill="#b45309">پلان شماتیک با ابعاد مرجع؛ ضخامت دیوار مدل شده اما دیتیل اجرایی، آکس‌بندی و مقاطع تأیید نشده است.</text>`,
  );
  parts.push(`</svg>`);
  return parts.join("\n");
}

function centroidOf(poly: Vec2[]): Vec2 {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function insideRect(room: Room, rect: Rect): boolean {
  const c = centroidOf(room.polygon);
  return c.x >= rect.x - 0.5 && c.x <= rectRight(rect) + 0.5 && c.y >= rect.y - 0.5 && c.y <= rectTop(rect) + 0.5;
}

/** AutoLISP-compatible ASCII DXF (AC1015) with layered polylines and text. */
export function schemeDxf(scheme: CanonicalScheme, levelIndex = 0): string {
  const level = scheme.levels[Math.min(levelIndex, scheme.levels.length - 1)];
  const layers: { name: string; color: number }[] = [
    { name: "SITE-BOUNDARY", color: 3 },
    { name: "SITE-BUILDABLE", color: 30 },
    { name: "BLDG-FOOTPRINT", color: 8 },
    { name: "ROOM", color: 4 },
    { name: "CORE", color: 1 },
    { name: "CORRIDOR", color: 9 },
    { name: "WALL", color: 7 },
    { name: "DOOR", color: 30 },
    { name: "WINDOW", color: 5 },
    { name: "STAIR", color: 1 },
    { name: "DIM", color: 2 },
    { name: "TEXT", color: 7 },
  ];
  const out: string[] = [];
  const push = (...values: (string | number)[]) => out.push(...values.map(String));
  push(0, "SECTION", 2, "HEADER");
  push(9, "$ACADVER", 1, "AC1015");
  push(9, "$INSUNITS", 70, 6);
  push(0, "ENDSEC");
  push(0, "SECTION", 2, "TABLES");
  push(0, "TABLE", 2, "LAYER", 70, layers.length);
  for (const layer of layers) {
    push(0, "LAYER", 2, layer.name, 70, 0, 62, layer.color, 6, "CONTINUOUS");
  }
  push(0, "ENDTAB", 0, "ENDSEC");
  push(0, "SECTION", 2, "ENTITIES");

  const polyline = (poly: Vec2[], layer: string, closed = true) => {
    push(0, "LWPOLYLINE", 8, layer, 90, poly.length, 70, closed ? 1 : 0);
    for (const p of poly) push(10, p.x.toFixed(3), 20, p.y.toFixed(3));
  };
  const text = (p: Vec2, value: string, height: number, layer = "TEXT") => {
    push(0, "TEXT", 8, layer, 10, p.x.toFixed(3), 20, p.y.toFixed(3), 40, height.toFixed(2), 1, value, 50, 0);
  };

  polyline(scheme.site.boundary, "SITE-BOUNDARY");
  if (scheme.buildablePolygon.length >= 3) polyline(scheme.buildablePolygon, "SITE-BUILDABLE");
  for (const rect of scheme.footprintRects) {
    polyline(
      [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.w, y: rect.y },
        { x: rect.x + rect.w, y: rect.y + rect.h },
        { x: rect.x, y: rect.y + rect.h },
      ],
      "BLDG-FOOTPRINT",
    );
  }
  for (const room of level.rooms) {
    polyline(room.polygon, room.kind === "core" ? "CORE" : "ROOM");
    const c = centroidOf(room.polygon);
    if (room.areaM2 > 2) text(c, `${roomCode(room)} ${room.areaM2.toFixed(1)}m2`, Math.min(0.6, Math.sqrt(room.areaM2) / 6));
  }

  // Architectural wall bands (real thickness), openings, stairs and dimensions.
  const walls = level.walls ?? [];
  const openings = level.openings ?? [];
  for (const wall of walls) {
    const band = wallBand(wall);
    polyline(band.corners, "WALL");
  }
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  for (const opening of openings) {
    const wall = wallById.get(opening.wallId);
    if (!wall) continue;
    const alongX = Math.abs(wall.end.x - wall.start.x) >= Math.abs(wall.end.y - wall.start.y);
    const half = opening.widthM / 2;
    const jambA = alongX
      ? { x: opening.center.x - half, y: wall.start.y }
      : { x: wall.start.x, y: opening.center.y - half };
    const jambB = alongX
      ? { x: opening.center.x + half, y: wall.start.y }
      : { x: wall.start.x, y: opening.center.y + half };
    if (opening.kind === "window") {
      polyline([jambA, jambB], "WINDOW", false);
      text(
        { x: opening.center.x, y: opening.center.y + (alongX ? -0.3 : 0.3) },
        `W${opening.widthM.toFixed(2)}x${opening.heightM.toFixed(2)} sill${opening.sillM.toFixed(2)}`,
        0.32,
        "WINDOW",
      );
    } else {
      const hinge = alongX ? { x: opening.center.x - half, y: opening.center.y } : { x: opening.center.x, y: opening.center.y - half };
      const leafEnd = alongX ? { x: hinge.x, y: hinge.y + opening.widthM } : { x: hinge.x + opening.widthM, y: hinge.y };
      polyline([hinge, leafEnd], "DOOR", false);
      text({ x: opening.center.x, y: opening.center.y + (alongX ? 0.9 : -0.4) }, `D${opening.widthM.toFixed(2)}`, 0.3, "DOOR");
    }
  }
  for (const core of level.cores) {
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const y = core.rect.y + ((core.rect.h) / steps) * i;
      polyline(
        [
          { x: core.rect.x + 0.2, y },
          { x: core.rect.x + core.rect.w - 0.2, y },
        ],
        "STAIR",
        false,
      );
    }
    text({ x: core.rect.x + core.rect.w / 2, y: core.rect.y + core.rect.h / 2 }, "STAIR+LIFT", 0.35, "STAIR");
  }
  for (const dim of level.dimensions ?? []) {
    const horizontal = Math.abs(dim.start.y - dim.end.y) < Math.abs(dim.start.x - dim.end.x);
    if (horizontal) {
      const y = dim.start.y + dim.offsetM;
      polyline([{ x: dim.start.x, y }, { x: dim.end.x, y }], "DIM", false);
      text({ x: (dim.start.x + dim.end.x) / 2, y: y - 0.25 }, `${dim.valueM.toFixed(2)}m`, 0.32, "DIM");
    } else {
      const x = dim.start.x + dim.offsetM;
      polyline([{ x, y: dim.start.y }, { x, y: dim.end.y }], "DIM", false);
      text({ x: x - 0.25, y: (dim.start.y + dim.end.y) / 2 }, `${dim.valueM.toFixed(2)}m`, 0.32, "DIM");
    }
  }
  for (const corridor of level.corridors) {
    polyline(
      [
        { x: corridor.x, y: corridor.y },
        { x: corridor.x + corridor.w, y: corridor.y },
        { x: corridor.x + corridor.w, y: corridor.y + corridor.h },
        { x: corridor.x, y: corridor.y + corridor.h },
      ],
      "CORRIDOR",
    );
  }
  text(
    { x: scheme.site.boundary[0]?.x ?? 0, y: (scheme.site.boundary[0]?.y ?? 0) - 3 },
    `${scheme.code} ${level.name} PLOT ${scheme.plotAreaM2.toFixed(1)}m2 GFA ${scheme.grossFloorAreaM2.toFixed(1)}m2 UNITS ${scheme.unitsTotal}`,
    1.2,
  );
  push(0, "ENDSEC", 0, "EOF");
  return out.join("\r\n");
}

export function svgSiteAreaLabel(scheme: CanonicalScheme): string {
  return `${scheme.plotAreaM2.toFixed(1)} m² (${polygonArea(scheme.site.boundary).toFixed(1)} m² shoelace)`;
}

export { ROOM_LABEL_FA, legend };
