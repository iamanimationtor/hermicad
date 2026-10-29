/**
 * پیش‌نمایش تصویری نقشه — ابزار کنترل کیفیت (فقط توسعه)
 *
 * چرا وجود دارد: خروجی SVG در مرورگر دیده می‌شود، اما برای «کنترل کیفیت واقعی»
 * باید همان فایل روی ماشین رندر و چشمی بازبینی شود. این اسکریپت SVG استودیو را
 * به PNG تبدیل می‌کند تا هر تغییر هندسی/چیدمانی پیش از تحویل دیده شود.
 *
 * اجرا:
 *   npm run preview:design            → همهٔ رشته‌ها + هر طبقه
 *   npm run preview:design -- structure
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { Resvg } from "@resvg/resvg-js";

import type { StudioDocument } from "@/domain/studio/document";
import { renderStudioSvg } from "@/domain/studio/render";
import { sampleDesign } from "@/server/designs";

const DISCIPLINES: StudioDocument["classification"][] = [
  "all",
  "architecture",
  "structure",
  "mechanical",
  "electrical",
  "plumbing",
  "fire",
  "site",
];

function renderToPng(svg: string, width: number): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { loadSystemFonts: true },
  })
    .render()
    .asPng();
}

function main(): void {
  const only = process.argv[2] as StudioDocument["classification"] | undefined;
  const outDir = resolve(process.cwd(), ".preview");
  mkdirSync(outDir, { recursive: true });

  const doc = sampleDesign();

  const wanted = only ? [only] : DISCIPLINES;
  for (const classification of wanted) {
    for (let level = 0; level < doc.levels; level += 1) {
      const view: StudioDocument = { ...doc, classification, currentLevel: level };
      const svg = renderStudioSvg(view, { classification, onlyLevel: level });
      const png = renderToPng(svg, 1800);
      const name = `${classification}-L${level + 1}.png`;
      writeFileSync(resolve(outDir, name), png);
      console.log(`${name}  ${(png.length / 1024).toFixed(0)} KB`);
    }
  }
  console.log(`\nخروجی در ${outDir}`);
}

main();
