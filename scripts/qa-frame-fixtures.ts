/** مجموعه قطعی برای مقایسه مستقل با NumPy و بازخوانی فایل‌ها. */
import { mkdirSync, writeFileSync } from "node:fs";
import { frameTemplate } from "../src/domain/structures/frame/templates";
import { solveFrame } from "../src/domain/structures/frame/solver";
import { createStudioDocument } from "../src/domain/studio/document";
import { emptyBrief } from "../src/domain/journey/model";
import { emptyStructure } from "../src/domain/structures/catalog";
import { structuralReport } from "../src/server/structuralReport";
const fixtures = [];
let seed = 42;
const random = () => {
  seed = (1664525 * seed + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (const kind of ["beam", "cantilever", "portal", "pitched"] as const) {
  for (let index = 0; index < 8; index++) {
    const model = frameTemplate(kind);
    model.confirmed = true;
    const angle = (random() - 0.5) * Math.PI,
      c = Math.cos(angle),
      s = Math.sin(angle),
      scale = 0.9 + random();
    model.nodes = model.nodes.map((n) => ({ ...n, x: (n.x * c - n.y * s) * scale + 5, y: (n.x * s + n.y * c) * scale - 3 }));
    // برای چرخش تیر ساده، تکیه‌گاه مفصلی/گیردار مستقل از زاویه نگه داشته می‌شود؛ نتیجه با مدل همسان مقایسه می‌شود.
    for (const e of model.members) {
      e.eGPa = 150 + random() * 80;
      e.areaCm2 = 80 + random() * 60;
      e.iCm4 = 8000 + random() * 5000;
      e.depthM = 0.2;
    }
    for (const load of model.cases) {
      for (const l of load.nodes) {
        l.fx += (random() - 0.5) * 8;
        l.fy += (random() - 0.5) * 8;
        l.mz = (random() - 0.5) * 3;
      }
      for (const l of load.members) {
        l.qx = (random() - 0.5) * 2;
        l.qy = -1 - random() * 5;
      }
    }
    const result = solveFrame(model);
    if (result.status === "blocked") throw new Error(result.issues.join(" "));
    fixtures.push({ kind, index, model, result });
  }
}
mkdirSync(".preview/frame-qa", { recursive: true });
writeFileSync(".preview/frame-qa/fixtures.json", JSON.stringify(fixtures));
const frame = frameTemplate("portal");
frame.confirmed = true;
const doc = createStudioDocument({
  name: "آزمون گزارش قاب یکپارچه",
  brief: { ...emptyBrief(), structural: { ...emptyStructure("steel"), frame } },
});
writeFileSync(".preview/frame-qa/fixture-report.zip", structuralReport(doc, "review"));
console.log(`${fixtures.length} مدل قطعی و گزارش قاب برای بازخوانی مستقل تولید شد.`);
