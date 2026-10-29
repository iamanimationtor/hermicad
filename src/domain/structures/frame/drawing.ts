import { Scene, sceneSvg } from "../../studio/draw";
import type { FrameModel } from "./model";
import type { CaseResult } from "./solver";
export type FrameView = "model" | "deformed" | "moment";
/** ترسیم همان مدل/نتیجه؛ نه پلان ساختمان. مختصات صحنه میلی‌متر و Y ترسیم رو به پایین است. */
export function frameDrawing(model: FrameModel, result?: CaseResult, view: FrameView = "model") {
  const scene = new Scene(),
    width = 190,
    height = 115;
  let amplification = 1;
  if (!model.nodes.length) return { scene, width, height, amplification };
  const minX = Math.min(...model.nodes.map((n) => n.x)),
    maxX = Math.max(...model.nodes.map((n) => n.x)),
    minY = Math.min(...model.nodes.map((n) => n.y)),
    maxY = Math.max(...model.nodes.map((n) => n.y));
  const sx = Math.max(maxX - minX, 1),
    sy = Math.max(maxY - minY, 1),
    span = Math.max(sx, sy),
    scale = Math.min(160 / sx, 83 / sy);
  const project = (x: number, y: number): [number, number] => [95 + (x - (maxX + minX) / 2) * scale, 56 - (y - (maxY + minY) / 2) * scale];
  const memberMap = new Map(result?.members.map((m) => [m.member, m]) ?? []);
  if (result && view === "deformed") {
    const max = Math.max(0, ...result.members.map((m) => m.maxTranslation));
    amplification = max > 0 ? Math.min(10000, (span * 0.08) / max) : 1;
  }
  const momentMax = result ? Math.max(0, ...result.members.flatMap((m) => m.sections.map((s) => Math.abs(s.m)))) : 0;
  for (const e of model.members) {
    const a = model.nodes.find((n) => n.id === e.start)!,
      b = model.nodes.find((n) => n.id === e.end)!;
    if (!a || !b) continue;
    const pa = project(a.x, a.y),
      pb = project(b.x, b.y);
    scene.line(...pa, ...pb, { width: 0.6, color: "#334155" });
    const mid = (pa[0] + pb[0]) / 2;
    scene.text(mid, (pa[1] + pb[1]) / 2 - 2, e.id, 3, { anchor: mid < 45 ? "start" : mid > 145 ? "end" : "middle", direction: "ltr" });
    const r = memberMap.get(e.id);
    if (r && view !== "model") {
      const L = r.length,
        c = (b.x - a.x) / L,
        s = (b.y - a.y) / L;
      const points = r.sections.map((p) => {
        let x = a.x + c * p.x,
          y = a.y + s * p.x;
        if (view === "deformed") {
          x += amplification * (c * p.u - s * p.w);
          y += amplification * (s * p.u + c * p.w);
        } else {
          const offset = momentMax > 0 ? (p.m / momentMax) * span * 0.08 : 0;
          x -= s * offset;
          y += c * offset;
        }
        return project(x, y);
      });
      scene.poly(points, { closed: false, width: 0.4, color: view === "deformed" ? "#0f766e" : "#9f1239" });
    }
  }
  for (const n of model.nodes) {
    const [x, y] = project(n.x, n.y);
    scene.circle(x, y, 1.1, { fill: 1, width: 0.3 });
    scene.text(x > 95 ? x - 2 : x + 2, y - 3, n.id, 3, { direction: "ltr", anchor: x > 95 ? "end" : "start" });
    if (n.support === "fixed") scene.rect(x - 2, y + 1, 4, 2, { fill: 0.4 });
    else if (n.support === "pin")
      scene.poly(
        [
          [x, y + 1],
          [x - 2, y + 4],
          [x + 2, y + 4],
        ],
        { closed: true, width: 0.3 },
      );
    else if (n.support !== "free") scene.circle(x, y + 3, 1.4, { width: 0.3 });
  }
  scene.text(185, 7, "مدل تحلیلی صفحه‌ای — نه نقشهٔ اجرایی", 3.2, { anchor: "end", bold: true });
  const label =
    view === "deformed"
      ? `تغییرشکل با بزرگنمایی ${Number(amplification.toPrecision(4))}`
      : view === "moment"
        ? "لنگر مثبت در جهت +y محلی؛ مقیاس نمودار نسبی است"
        : "X به راست، Y به بالا؛ هندسه برحسب متر";
  scene.text(185, 105, label, 2.8, { anchor: "end" });
  if (result)
    scene.text(185, 111, `${result.kind === "case" ? "حالت بار" : "ترکیب"}: ${result.id} — ${result.name.slice(0, 30)}`, 2.5, {
      anchor: "end",
    });
  return { scene, width, height, amplification };
}
export function frameSvg(model: FrameModel, result?: CaseResult, view: FrameView = "model") {
  const { scene, width, height } = frameDrawing(model, result, view);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}mm" height="${height}mm"><rect width="100%" height="100%" fill="white"/>${sceneSvg(scene)}</svg>`;
}
