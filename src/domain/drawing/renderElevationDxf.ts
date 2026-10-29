import { renderSceneDxf } from "./renderDxf";
import type { DrawingScene } from "./scene";
import { buildElevationScene, buildSectionScene, SIDE_LABEL_FA, type FacadeSide } from "./elevation";
import type { CanonicalScheme } from "../types";

/**
 * Elevations + section in one DXF. Each drawing keeps its own model-space
 * coordinates (u, v in metres) and is translated vertically so the four
 * elevations do not overlap. Layers/aerial units come from the shared writer.
 */
export function renderElevationsDxf(scheme: CanonicalScheme): { data: string; offsets: { id: string; dyM: number }[] } {
  const sides: FacadeSide[] = ["south", "north", "east", "west"];
  const scenes: DrawingScene[] = sides.map((side) => buildElevationScene(scheme, side));
  scenes.push(buildSectionScene(scheme));
  const lines: string[] = [];
  const offsets: { id: string; dyM: number }[] = [];
  let cursorY = 0;
  let headerWritten = false;
  for (const scene of scenes) {
    const dy = cursorY;
    const raw = renderSceneDxf(scene).split("\r\n");
    offsets.push({ id: scene.levelName, dyM: dy });
    // Find the ENTITIES section start of the produced file and splice entities.
    const startIdx = raw.findIndex((line, index) => line.trim() === "ENTITIES" && raw[index - 2]?.trim() === "SECTION");
    const endIdx = raw.findIndex((line, index) => line.trim() === "ENDSEC" && index > startIdx);
    if (!headerWritten) {
      // copy header+tables of the first file up to ENTITIES
      lines.push(...raw.slice(0, startIdx + 1));
      headerWritten = true;
    }
    // translate all Y (group code 20 / 21) coordinates by dy
    const body = raw.slice(startIdx + 1, endIdx);
    // The slice stops at "ENDSEC"; its preceding "0" group code would otherwise
    // dangle and desynchronise the group/value pairs of the following section.
    while (body.length > 0 && body[body.length - 1].trim() === "0") body.pop();
    for (let i = 0; i < body.length; i++) {
      const code = body[i].trim();
      if ((code === "20" || code === "21") && i + 1 < body.length) {
        const value = Number.parseFloat(body[i + 1]);
        if (Number.isFinite(value)) body[i + 1] = (value + dy).toFixed(4);
      }
      if (code === "1" && i + 1 < body.length && body[i + 1].includes("HERMICAD")) {
        body[i + 1] = `${body[i + 1]} [${scene.levelName}]`;
      }
    }
    lines.push(...body);
    const extent = scene.sheet.modelBox.h + 6;
    cursorY += extent;
  }
  lines.push("0", "ENDSEC", "0", "EOF");
  void SIDE_LABEL_FA;
  return { data: lines.join("\r\n"), offsets };
}
