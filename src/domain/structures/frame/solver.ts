import { fixedDofs, frameReadiness, type FrameModel } from "./model";
export const FRAME_ENGINE = "plane-frame/1.0";
export const FRAME_ASSUMPTIONS = [
  "قاب صفحه‌ای با سه درجه آزادی در هر گره؛ عضو مستقیم منشوری و اتصال صلب بین اعضا؛ تکیه‌گاه با جابه‌جایی تحمیلی صفر.",
  "تحلیل استاتیکی خطی مرتبه اول Euler–Bernoulli؛ E و A و I مؤثر از ورودی کاربر. وزن خودکار، رهاسازی انتهای عضو و فنر نداریم.",
  "محور سراسری X به راست و Y به بالا؛ دوران و لنگر گره‌ای پادساعت‌گرد مثبت. x محلی از ابتدا به انتهای عضو و y محلی ۹۰ درجه پادساعت‌گرد آن است.",
  "بار گسترده یکنواخت در محور محلی عضو است؛ بار گره‌ای در محور سراسری. واحدها: متر، کیلونیوتن، کیلونیوتن‌متر و رادیان.",
  "نیروهای انتهایی، کنش گره بر عضو در محور محلی‌اند. در مقاطع داخلی N کشش مثبت است؛ V=dM/dx و M(0)=-fiM قرارداد نمودار است.",
  "اثرات P-Delta، کمانش، پیچش، برش، دینامیک، زلزله، ترک‌خوردگی خودکار و طراحی مقاومت/اتصالات محاسبه نمی‌شوند.",
  "نمودار نیرو درون عضو از تعادل دقیق بار یکنواخت؛ تغییرشکل میانی شامل حل خاص بار گسترده است. پوش نیروها شامل نقاط بحرانی تحلیلی است.",
  "ضرایب ترکیب بار اظهاری‌اند؛ حل عددی یا تعادل صحیح، تأیید ضابطه یا ایمنی سازه نیست.",
];
export interface NodeResult {
  node: string;
  ux: number;
  uy: number;
  rz: number;
  rx: number;
  ry: number;
  rm: number;
}
export interface SectionResult {
  x: number;
  n: number;
  v: number;
  m: number;
  u: number;
  w: number;
}
export interface MemberResult {
  member: string;
  length: number;
  endForces: number[];
  sections: SectionResult[];
  maxTranslation: number;
  translationBound: number;
  maxRotation: number;
}
export interface CaseResult {
  id: string;
  name: string;
  kind: "case" | "combination";
  factors: Record<string, number>;
  nodes: NodeResult[];
  members: MemberResult[];
  equilibrium: { fx: number; fy: number; mz: number; relative: number };
  residual: number;
  warnings: string[];
}
export interface FrameResult {
  engine: string;
  status: "blocked" | "solved" | "outside-domain";
  executionReady: false;
  issues: string[];
  assumptions: string[];
  results: CaseResult[];
  envelopes: {
    member: string;
    nMin: number;
    nMax: number;
    vMin: number;
    vMax: number;
    mMin: number;
    mMax: number;
    governing: { nMin: string; nMax: string; vMin: string; vMax: string; mMin: string; mMax: string };
  }[];
}
const zeros = (n: number) => Array(n).fill(0) as number[];
const matrix = (n: number) => Array.from({ length: n }, () => zeros(n));
const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
const mv = (a: number[][], v: number[]) => a.map((row) => dot(row, v));
/** تناظر قطری قبل از Cholesky؛ ماتریس نامثبت/نزدیک مکانیزم رد می‌شود، نه با فنر مصنوعی پایدار. */
function factor(K: number[][]) {
  const n = K.length,
    s = K.map((r, i) => Math.sqrt(r[i]));
  if (s.some((v) => !Number.isFinite(v) || v <= 0)) throw new Error("درجه آزادی بدون سختی؛ مدل ناپایدار است.");
  const L = matrix(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let v = K[i][j] / s[i] / s[j];
      for (let k = 0; k < j; k++) v -= L[i][k] * L[j][k];
      if (i === j) {
        if (v < 1e-10 || !Number.isFinite(v))
          throw new Error("ماتریس سختی تکین یا بدشرط است؛ تکیه‌گاه‌ها، اتصال‌ها و نسبت سختی‌ها بررسی شوند.");
        L[i][j] = Math.sqrt(v);
      } else L[i][j] = v / L[j][j];
    }
  return (f: number[]) => {
    const y = zeros(n),
      z = zeros(n);
    for (let i = 0; i < n; i++) {
      let v = f[i] / s[i];
      for (let j = 0; j < i; j++) v -= L[i][j] * y[j];
      y[i] = v / L[i][i];
    }
    for (let i = n - 1; i >= 0; i--) {
      let v = y[i];
      for (let j = i + 1; j < n; j++) v -= L[j][i] * z[j];
      z[i] = v / L[i][i];
    }
    return z.map((v, i) => v / s[i]);
  };
}
/** ریشه‌های چندجمله‌ای درجه حداکثر سه در بازه واحد؛ جداسازی با نقاط بحرانی و دونیم‌سازی. */
function rootsUnit(coeff: number[]): number[] {
  const a = [...coeff];
  while (a.length > 1 && a[a.length - 1] === 0) a.pop();
  if (a.length <= 1) return [];
  if (a.length === 2) {
    const t = -a[0] / a[1];
    return t > 0 && t < 1 ? [t] : [];
  }
  const cuts = [0, ...rootsUnit(a.slice(1).map((v, i) => v * (i + 1))), 1].sort((x, y) => x - y);
  const evalAt = (x: number) => a.reduceRight((s, c) => s * x + c, 0),
    eps = Math.max(...a.map(Math.abs)) * 1e-12,
    result: number[] = [];
  for (const t of cuts) if (t > 0 && t < 1 && Math.abs(evalAt(t)) <= eps) result.push(t);
  for (let i = 1; i < cuts.length; i++) {
    let lo = cuts[i - 1],
      hi = cuts[i],
      fl = evalAt(lo);
    if (fl * evalAt(hi) >= 0) continue;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2,
        fm = evalAt(mid);
      if (fl * fm <= 0) hi = mid;
      else {
        lo = mid;
        fl = fm;
      }
    }
    const t = (lo + hi) / 2;
    if (t > 0 && t < 1) result.push(t);
  }
  return [...new Set(result)];
}
export function solveFrame(model: FrameModel): FrameResult {
  const output: FrameResult = {
    engine: FRAME_ENGINE,
    status: "blocked",
    executionReady: false,
    issues: [],
    assumptions: [...FRAME_ASSUMPTIONS],
    results: [],
    envelopes: [],
  };
  output.issues = frameReadiness(model);
  if (output.issues.length) return output;
  try {
    const nd = model.nodes.length * 3,
      K = matrix(nd);
    const indices = new Map(model.nodes.map((n, i) => [n.id, i]));
    const elements = model.members.map((e) => {
      const ni = indices.get(e.start)!,
        nj = indices.get(e.end)!,
        a = model.nodes[ni],
        b = model.nodes[nj],
        length = Math.hypot(b.x - a.x, b.y - a.y),
        c = (b.x - a.x) / length,
        s = (b.y - a.y) / length;
      const E = e.eGPa * 1e6,
        A = e.areaCm2 * 1e-4,
        I = e.iCm4 * 1e-8,
        EA = E * A,
        EI = E * I,
        L = length,
        k = matrix(6),
        ax = EA / L,
        b1 = (12 * EI) / L ** 3,
        b2 = (6 * EI) / L ** 2,
        b3 = (4 * EI) / L,
        b4 = (2 * EI) / L;
      const vals = [
        [ax, 0, 0, -ax, 0, 0],
        [0, b1, b2, 0, -b1, b2],
        [0, b2, b3, 0, -b2, b4],
        [-ax, 0, 0, ax, 0, 0],
        [0, -b1, -b2, 0, b1, -b2],
        [0, b2, b4, 0, -b2, b3],
      ];
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) k[i][j] = vals[i][j];
      const T = [
        [c, s, 0, 0, 0, 0],
        [-s, c, 0, 0, 0, 0],
        [0, 0, 1, 0, 0, 0],
        [0, 0, 0, c, s, 0],
        [0, 0, 0, -s, c, 0],
        [0, 0, 0, 0, 0, 1],
      ];
      const dofs = [ni * 3, ni * 3 + 1, ni * 3 + 2, nj * 3, nj * 3 + 1, nj * 3 + 2];
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 6; j++) {
          let value = 0;
          for (let p = 0; p < 6; p++) for (let q = 0; q < 6; q++) value += T[p][i] * k[p][q] * T[q][j];
          K[dofs[i]][dofs[j]] += value;
        }
      return { e, L, c, s, EA, EI, k, T, dofs };
    });
    const fixed = model.nodes.flatMap((n) => fixedDofs(n.support));
    const free = fixed.flatMap((v, i) => (v ? [] : [i]));
    const solve = factor(free.map((i) => free.map((j) => K[i][j])));
    const scenarios = [
      ...model.cases.map((c) => ({ id: c.id, name: c.name, kind: "case" as const, factors: { [c.id]: 1 } })),
      ...model.combinations.map((c) => ({ id: c.id, name: c.name, kind: "combination" as const, factors: c.factors })),
    ];
    for (const scenario of scenarios) {
      const F = zeros(nd),
        distributed = new Map(elements.map((e) => [e.e.id, { qx: 0, qy: 0 }]));
      for (const loadCase of model.cases) {
        const f = Object.hasOwn(scenario.factors, loadCase.id) ? scenario.factors[loadCase.id] : 0;
        if (!f) continue;
        for (const l of loadCase.nodes) {
          const i = indices.get(l.node)! * 3;
          F[i] += f * l.fx;
          F[i + 1] += f * l.fy;
          F[i + 2] += f * l.mz;
        }
        for (const l of loadCase.members) {
          const q = distributed.get(l.member)!;
          q.qx += f * l.qx;
          q.qy += f * l.qy;
        }
      }
      const eq = elements.map((e) => {
        const { qx, qy } = distributed.get(e.e.id)!,
          L = e.L;
        const local = [(qx * L) / 2, (qy * L) / 2, (qy * L ** 2) / 12, (qx * L) / 2, (qy * L) / 2, (-qy * L ** 2) / 12];
        for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) F[e.dofs[i]] += e.T[j][i] * local[j];
        return local;
      });
      const D = zeros(nd),
        sol = solve(free.map((i) => F[i]));
      free.forEach((d, i) => (D[d] = sol[i]));
      if (D.some((v) => !Number.isFinite(v))) throw new Error("حل غیرمتناهی؛ نتیجه صادر نمی‌شود.");
      const internal = mv(K, D),
        reactions = internal.map((v, i) => v - F[i]);
      const forceScale = Math.max(1, ...F.map(Math.abs), ...internal.map(Math.abs));
      const residual = Math.max(0, ...free.map((i) => Math.abs(reactions[i]))) / forceScale;
      if (residual > 1e-7) throw new Error("باقیماندهٔ دستگاه بیش از آستانهٔ عددی است؛ نتیجه صادر نمی‌شود.");
      let sumX = 0,
        sumY = 0,
        sumM = 0,
        scaleM = 1;
      const nodes = model.nodes.map((n, i) => {
        const k = i * 3,
          rx = fixed[k] ? reactions[k] : 0,
          ry = fixed[k + 1] ? reactions[k + 1] : 0,
          rm = fixed[k + 2] ? reactions[k + 2] : 0;
        sumX += rx + F[k];
        sumY += ry + F[k + 1];
        sumM += rm + F[k + 2] + n.x * (ry + F[k + 1]) - n.y * (rx + F[k]);
        scaleM +=
          Math.abs(rm) +
          Math.abs(F[k + 2]) +
          Math.abs(n.x) * (Math.abs(ry) + Math.abs(F[k + 1])) +
          Math.abs(n.y) * (Math.abs(rx) + Math.abs(F[k]));
        return { node: n.id, ux: D[k], uy: D[k + 1], rz: D[k + 2], rx, ry, rm };
      });
      const relative = Math.max(Math.abs(sumX) / forceScale, Math.abs(sumY) / forceScale, Math.abs(sumM) / scaleM);
      if (relative > 1e-7) throw new Error("تعادل کلی نیرو یا لنگر برقرار نیست؛ نتیجه صادر نمی‌شود.");
      const warnings: string[] = [];
      const members = elements.map((e, ei) => {
        const d = mv(
            e.T,
            e.dofs.map((i) => D[i]),
          ),
          endForces = mv(e.k, d).map((v, i) => v - eq[ei][i]),
          { qx, qy } = distributed.get(e.e.id)!,
          L = e.L;
        // N=-fiX-qx*x; V=fiY+qy*x; M=-fiM+fiY*x+qy*x²/2. پایان: N=fjX,V=-fjY,M=fjM.
        const bubble = (qy * L ** 4) / (24 * e.EI),
          axial = (qx * L ** 2) / (2 * e.EA);
        const slope = [
          L * d[2],
          2 * (-3 * d[1] - 2 * L * d[2] + 3 * d[4] - L * d[5] + bubble),
          3 * (2 * d[1] + L * d[2] - 2 * d[4] + L * d[5] - 2 * bubble),
          4 * bubble,
        ];
        const xs = Array.from({ length: 21 }, (_, i) => (i * L) / 20);
        xs.push(...rootsUnit(slope).map((t) => t * L), ...rootsUnit([d[3] - d[0] + axial, -2 * axial]).map((t) => t * L));
        if (qy !== 0) {
          const critical = -endForces[1] / qy;
          if (critical > 0 && critical < L) xs.push(critical);
        }
        const sections = [...new Set(xs)]
          .sort((a, b) => a - b)
          .map((x) => {
            const t = x / L,
              u = (1 - t) * d[0] + t * d[3] + (qx * x * (L - x)) / (2 * e.EA),
              w =
                (1 - 3 * t * t + 2 * t ** 3) * d[1] +
                L * (t - 2 * t * t + t ** 3) * d[2] +
                (3 * t * t - 2 * t ** 3) * d[4] +
                L * (-t * t + t ** 3) * d[5] +
                (qy * x * x * (L - x) ** 2) / (24 * e.EI);
            return { x, n: -endForces[0] - qx * x, v: endForces[1] + qy * x, m: -endForces[2] + endForces[1] * x + (qy * x * x) / 2, u, w };
          });
        const maxTranslation = Math.max(...sections.map((p) => Math.hypot(p.u, p.w)));
        const translationBound = Math.max(...sections.map((p) => Math.abs(p.u))) + Math.max(...sections.map((p) => Math.abs(p.w)));
        const rotationPoints = [0, 1, ...rootsUnit(slope.slice(1).map((v, i) => v * (i + 1)))];
        const maxRotation = Math.max(...rotationPoints.map((t) => Math.abs(slope.reduceRight((s, c) => s * t + c, 0) / L)));
        if (translationBound / L > 0.01 || maxRotation > 0.02)
          warnings.push(
            `عضو ${e.e.id}: کران محافظه‌کارانهٔ انتقال یا دوران از حدود احتیاطی مدل کوچک‌تغییرشکل عبور کرده است (انتقال/طول ۱٪، دوران ۰٫۰۲ رادیان؛ نه حد آیین‌نامه).`,
          );
        return { member: e.e.id, length: L, endForces, sections, maxTranslation, translationBound, maxRotation };
      });
      output.results.push({ ...scenario, nodes, members, equilibrium: { fx: sumX, fy: sumY, mz: sumM, relative }, residual, warnings });
    }
    output.envelopes = model.members.map((e) => {
      const env = {
        member: e.id,
        nMin: Infinity,
        nMax: -Infinity,
        vMin: Infinity,
        vMax: -Infinity,
        mMin: Infinity,
        mMax: -Infinity,
        governing: { nMin: "", nMax: "", vMin: "", vMax: "", mMin: "", mMax: "" },
      };
      for (const r of output.results)
        for (const p of r.members.find((m) => m.member === e.id)!.sections) {
          for (const key of ["n", "v", "m"] as const) {
            const lo = `${key}Min` as const,
              hi = `${key}Max` as const;
            if (p[key] < env[lo]) {
              env[lo] = p[key];
              env.governing[lo] = `${r.kind}:${r.id}`;
            }
            if (p[key] > env[hi]) {
              env[hi] = p[key];
              env.governing[hi] = `${r.kind}:${r.id}`;
            }
          }
        }
      return env;
    });
    output.status = output.results.some((r) => r.warnings.length) ? "outside-domain" : "solved";
    return output;
  } catch (e) {
    output.status = "blocked";
    output.issues = [e instanceof Error ? e.message : "حل عددی ناموفق بود."];
    output.results = [];
    output.envelopes = [];
    return output;
  }
}
