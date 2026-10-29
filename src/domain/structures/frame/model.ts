/** قرارداد مستقل مدل خطی دوبعدی؛ هیچ سازگاری آیین‌نامه‌ای از انتخاب خانواده نتیجه نمی‌شود. */
export const FRAME_FAMILIES = ["concrete", "steel", "shed", "timber", "bridge", "tower", "other"] as const;
export const SUPPORTS = {
  free: "آزاد",
  fixed: "گیردار",
  pin: "مفصلی (دو انتقال بسته)",
  rollerY: "غلتکی؛ حرکت قائم بسته",
  rollerX: "غلتکی؛ حرکت افقی بسته",
} as const;
export type Support = keyof typeof SUPPORTS;
export interface FrameNode {
  id: string;
  x: number;
  y: number;
  support: Support;
}
export interface FrameMember {
  id: string;
  start: string;
  end: string;
  eGPa: number;
  areaCm2: number;
  iCm4: number;
  depthM: number;
}
export interface NodalLoad {
  node: string;
  fx: number;
  fy: number;
  mz: number;
}
export interface MemberLoad {
  member: string;
  qx: number;
  qy: number;
}
export interface LoadCase {
  id: string;
  name: string;
  source: string;
  nodes: NodalLoad[];
  members: MemberLoad[];
}
export interface Combination {
  id: string;
  name: string;
  source: string;
  factors: Record<string, number>;
}
export interface FrameModel {
  version: 1;
  confirmed: boolean;
  basis: string;
  nodes: FrameNode[];
  members: FrameMember[];
  cases: LoadCase[];
  combinations: Combination[];
}
/** حدهای فنی ورودی، نه ضابطهٔ طراحی یا پذیرش. */
export const FRAME_RANGES = {
  x: [-10000, 10000],
  y: [-10000, 10000],
  eGPa: [0.1, 500],
  areaCm2: [0.01, 1e6],
  iCm4: [0.001, 1e12],
  depthM: [0.001, 20],
  fx: [-1e7, 1e7],
  fy: [-1e7, 1e7],
  mz: [-1e8, 1e8],
  qx: [-1e6, 1e6],
  qy: [-1e6, 1e6],
  factor: [-10, 10],
} as const;
export const FRAME_LIMITS = { nodes: 60, members: 120, cases: 12, combinations: 24 } as const;
export function emptyFrame(): FrameModel {
  return { version: 1, confirmed: false, basis: "", nodes: [], members: [], cases: [], combinations: [] };
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every((k) => allowed.includes(k));
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,23}$/.test(v);
const text = (v: unknown, max = 2000) => typeof v === "string" && v.length <= max;
const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
export function frameInputErrors(v: unknown): string[] {
  if (
    !obj(v) ||
    !keys(v, ["version", "confirmed", "basis", "nodes", "members", "cases", "combinations"]) ||
    v.version !== 1 ||
    typeof v.confirmed !== "boolean" ||
    !text(v.basis)
  )
    return ["ساختار مدل تحلیل دوبعدی معتبر نیست."];
  for (const k of ["nodes", "members", "cases", "combinations"] as const)
    if (!Array.isArray(v[k]) || v[k].length > FRAME_LIMITS[k])
      return ["تعداد ردیف‌های مدل بیش از سقف نرم‌افزار یا ساختار آرایه نامعتبر است."];
  const nodes = v.nodes as unknown[],
    members = v.members as unknown[],
    cases = v.cases as unknown[],
    combos = v.combinations as unknown[];
  const errors: string[] = [];
  const unique = (rows: unknown[]) => rows.every(obj) && new Set(rows.map((r) => (r as Record<string, unknown>).id)).size === rows.length;
  if (![nodes, members, cases, combos].every(unique)) return ["شناسه‌های هر گروه باید یکتا و ردیف‌ها شیء باشند."];
  for (const n of nodes)
    if (
      !obj(n) ||
      !keys(n, ["id", "x", "y", "support"]) ||
      !id(n.id) ||
      !num(n.x, ...FRAME_RANGES.x) ||
      !num(n.y, ...FRAME_RANGES.y) ||
      !Object.keys(SUPPORTS).includes(String(n.support))
    )
      errors.push("گره: شناسه، مختصات یا تکیه‌گاه معتبر نیست.");
  if (errors.length) return errors;
  const nodeMap = new Map((nodes as FrameNode[]).map((n) => [n.id, n]));
  for (const m of members) {
    if (
      !obj(m) ||
      !keys(m, ["id", "start", "end", "eGPa", "areaCm2", "iCm4", "depthM"]) ||
      !id(m.id) ||
      !id(m.start) ||
      !id(m.end) ||
      !nodeMap.has(m.start) ||
      !nodeMap.has(m.end) ||
      m.start === m.end ||
      !num(m.eGPa, ...FRAME_RANGES.eGPa) ||
      !num(m.areaCm2, ...FRAME_RANGES.areaCm2) ||
      !num(m.iCm4, ...FRAME_RANGES.iCm4) ||
      !num(m.depthM, ...FRAME_RANGES.depthM)
    ) {
      errors.push("عضو: اتصال، شناسه یا مشخصات E، A، I و ارتفاع معتبر نیست.");
      continue;
    }
    const a = nodeMap.get(m.start)!,
      b = nodeMap.get(m.end)!;
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 0.05 || L > 1000) errors.push(`عضو ${m.id}: طول باید بین ۰٫۰۵ و ۱۰۰۰ متر باشد؛ این بازه حد نرم‌افزار است.`);
  }
  if (errors.length) return errors;
  const memberIds = new Set((members as FrameMember[]).map((m) => m.id));
  for (const c of cases) {
    if (
      !obj(c) ||
      !keys(c, ["id", "name", "source", "nodes", "members"]) ||
      !id(c.id) ||
      !text(c.name, 150) ||
      !text(c.source) ||
      !Array.isArray(c.nodes) ||
      !Array.isArray(c.members) ||
      c.nodes.length > 60 ||
      c.members.length > 120
    ) {
      errors.push("حالت بار: ساختار یا تعداد بارها معتبر نیست.");
      continue;
    }
    if (
      new Set(c.nodes.filter(obj).map((l) => l.node)).size !== c.nodes.length ||
      new Set(c.members.filter(obj).map((l) => l.member)).size !== c.members.length
    )
      errors.push("در هر حالت بار، بارهای هر گره/عضو را در یک ردیف جمع کنید.");
    for (const l of c.nodes)
      if (
        !obj(l) ||
        !keys(l, ["node", "fx", "fy", "mz"]) ||
        !nodeMap.has(String(l.node)) ||
        !num(l.fx, ...FRAME_RANGES.fx) ||
        !num(l.fy, ...FRAME_RANGES.fy) ||
        !num(l.mz, ...FRAME_RANGES.mz)
      )
        errors.push("نیروی گره‌ای نامعتبر یا گره ناموجود است.");
    for (const l of c.members)
      if (
        !obj(l) ||
        !keys(l, ["member", "qx", "qy"]) ||
        !memberIds.has(String(l.member)) ||
        !num(l.qx, ...FRAME_RANGES.qx) ||
        !num(l.qy, ...FRAME_RANGES.qy)
      )
        errors.push("بار گسترده نامعتبر یا عضو ناموجود است.");
  }
  const caseIds = new Set((cases as LoadCase[]).map((c) => c.id));
  for (const c of combos)
    if (
      !obj(c) ||
      !keys(c, ["id", "name", "source", "factors"]) ||
      !id(c.id) ||
      !text(c.name, 150) ||
      !text(c.source) ||
      !obj(c.factors) ||
      Object.entries(c.factors).some(([k, f]) => !caseIds.has(k) || !num(f, ...FRAME_RANGES.factor))
    )
      errors.push("ترکیب بار: شناسه، منبع یا ضریب معتبر نیست.");
  return errors;
}
export function fixedDofs(s: Support): boolean[] {
  return [s === "fixed" || s === "pin" || s === "rollerX", s === "fixed" || s === "pin" || s === "rollerY", s === "fixed"];
}
export function frameReadiness(m: FrameModel): string[] {
  const errors = frameInputErrors(m);
  if (errors.length) return errors;
  if (!m.confirmed) errors.push("انطباق فرض‌های مدل دوبعدی باید صریحاً توسط تهیه‌کننده بررسی شود.");
  if (!m.basis.trim()) errors.push("مبنای مدل‌سازی و منبع سختی اعضا وارد نشده است.");
  if (m.nodes.length < 2 || !m.members.length || !m.cases.length) errors.push("حداقل دو گره، یک عضو و یک حالت بار لازم است.");
  const used = new Set(m.members.flatMap((e) => [e.start, e.end]));
  if (m.nodes.some((n) => !used.has(n.id))) errors.push("گره بدون عضو وجود دارد؛ آن را متصل یا حذف کنید.");
  for (const c of [...m.cases, ...m.combinations])
    if (!c.name.trim() || !c.source.trim()) errors.push(`برای ${c.id} نام و منبع بار/ضرایب لازم است.`);
  for (const c of m.combinations) if (!Object.values(c.factors).some((f) => f !== 0)) errors.push(`ترکیب ${c.id} هیچ ضریب غیرصفری ندارد.`);
  for (const e of m.members) {
    const a = m.nodes.find((n) => n.id === e.start)!,
      b = m.nodes.find((n) => n.id === e.end)!;
    if (Math.hypot(b.x - a.x, b.y - a.y) / e.depthM < 10)
      errors.push(`عضو ${e.id}: نسبت طول به ارتفاع کمتر از ۱۰؛ خارج دامنهٔ مدل خمش بدون تغییرشکل برشی این ابزار.`);
  }
  return errors;
}
