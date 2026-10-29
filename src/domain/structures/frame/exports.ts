import type { FrameResult } from "./solver";
/** CSV امن برای صفحه‌گسترده؛ متن اظهاری نمی‌تواند فرمول اجرا کند. */
function csv(rows: (string | number)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            if (typeof value === "number") return String(value);
            const text = /^[=+@\-\t\r]/.test(value) ? "'" + value : value;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}
export function frameCsv(result: FrameResult) {
  const nodes: (string | number)[][] = [["engine", "kind", "case", "name", "node", "ux_m", "uy_m", "rz_rad", "rx_kN", "ry_kN", "rm_kNm"]];
  const sections: (string | number)[][] = [
    ["engine", "kind", "case", "name", "member", "x_m", "N_kN", "V_kN", "M_kNm", "u_local_m", "v_local_m"],
  ];
  const ends: (string | number)[][] = [
    ["kind", "case", "member", "fiX_kN", "fiY_kN", "fiM_kNm", "fjX_kN", "fjY_kN", "fjM_kNm", "translation_bound_m", "max_rotation_rad"],
  ];
  for (const r of result.results) {
    for (const n of r.nodes) nodes.push([result.engine, r.kind, r.id, r.name, n.node, n.ux, n.uy, n.rz, n.rx, n.ry, n.rm]);
    for (const m of r.members) {
      ends.push([r.kind, r.id, m.member, ...m.endForces, m.translationBound, m.maxRotation]);
      for (const p of m.sections) sections.push([result.engine, r.kind, r.id, r.name, m.member, p.x, p.n, p.v, p.m, p.u, p.w]);
    }
  }
  const envelopes: (string | number)[][] = [
    [
      "member",
      "Nmin_kN",
      "Nmin_case",
      "Nmax_kN",
      "Nmax_case",
      "Vmin_kN",
      "Vmin_case",
      "Vmax_kN",
      "Vmax_case",
      "Mmin_kNm",
      "Mmin_case",
      "Mmax_kNm",
      "Mmax_case",
    ],
  ];
  for (const e of result.envelopes)
    envelopes.push([
      e.member,
      e.nMin,
      e.governing.nMin,
      e.nMax,
      e.governing.nMax,
      e.vMin,
      e.governing.vMin,
      e.vMax,
      e.governing.vMax,
      e.mMin,
      e.governing.mMin,
      e.mMax,
      e.governing.mMax,
    ]);
  return {
    "frame-nodes.csv": csv(nodes),
    "frame-sections.csv": csv(sections),
    "frame-ends.csv": csv(ends),
    "frame-envelopes.csv": csv(envelopes),
  };
}
