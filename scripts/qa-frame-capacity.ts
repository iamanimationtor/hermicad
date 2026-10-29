/** آزمون ظرفیت، نه تضمین زمان پاسخ یا آزمون بار تولید. */
import { emptyFrame } from "../src/domain/structures/frame/model";
import { solveFrame } from "../src/domain/structures/frame/solver";
const m = emptyFrame();
m.confirmed = true;
m.basis = "آزمون ظرفیت سقف مدل";
for (let y = 0; y < 10; y++)
  for (let x = 0; x < 6; x++) m.nodes.push({ id: `N${y * 6 + x}`, x: x * 4, y: y * 4, support: y === 0 ? "fixed" : "free" });
for (let y = 0; y < 10; y++)
  for (let x = 0; x < 6; x++) {
    const id = y * 6 + x;
    for (const end of [x < 5 ? id + 1 : null, y < 9 ? id + 6 : null])
      if (end !== null)
        m.members.push({ id: `M${m.members.length}`, start: `N${id}`, end: `N${end}`, eGPa: 200, areaCm2: 100, iCm4: 8000, depthM: 0.3 });
  }
for (let i = 0; i < 12; i++)
  m.cases.push({
    id: `LC${i}`,
    name: "بار",
    source: "آزمون",
    nodes: [],
    members: m.members.map((e) => ({ member: e.id, qx: 0, qy: -0.1 * (i + 1) })),
  });
for (let i = 0; i < 24; i++)
  m.combinations.push({
    id: `CB${i}`,
    name: "ترکیب",
    source: "آزمون",
    factors: Object.fromEntries(m.cases.map((c, j) => [c.id, (i + j) / 24])),
  });
const start = performance.now(),
  r = solveFrame(m);
console.log({
  ms: performance.now() - start,
  nodes: m.nodes.length,
  members: m.members.length,
  status: r.status,
  cases: r.results.length,
  issues: r.issues,
  bytes: JSON.stringify(r).length,
});

if (r.results.length !== 36 || r.status === "blocked" || r.envelopes.length !== m.members.length)
  throw new Error("آزمون ظرفیت حل ناموفق بود.");
