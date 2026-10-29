import { frameCsv } from "../structures/frame/exports";
import { frameSvg } from "../structures/frame/drawing";
import { structuralErrors, emptyStructure } from "../structures/catalog";
import { test, assert, approx } from "./harness";
import { frameTemplate } from "../structures/frame/templates";
import { frameInputErrors, emptyFrame } from "../structures/frame/model";
import { solveFrame } from "../structures/frame/solver";
const fixture = (kind: Parameters<typeof frameTemplate>[0]) => ({ ...frameTemplate(kind), confirmed: true });
test("frame/beam", "طره: خیز، دوران، برش و لنگر با حل بسته", () => {
  const r = solveFrame(fixture("cantilever"));
  assert(r.status === "solved", r.issues.join(" "));
  const c = r.results[0],
    end = c.nodes[1],
    support = c.nodes[0];
  approx(end.uy, (-10 * 4 ** 3) / (3 * 16000), 1e-12, "PL3/3EI");
  approx(end.rz, (-10 * 4 ** 2) / (2 * 16000), 1e-12, "PL2/2EI");
  approx(support.ry, 10, 1e-10, "Ry");
  approx(support.rm, 40, 1e-10, "M");
  approx(c.members[0].sections[0].m, -40, 1e-9, "M0");
  approx(c.equilibrium.relative, 0, 1e-12, "تعادل");
});
test("frame/beam", "تیر ساده: بردار بار سازگار و خیز میانی با حل خاص", () => {
  const r = solveFrame(fixture("beam"));
  assert(r.status === "solved", "حل");
  const c = r.results[0],
    m = c.members[0],
    mid = m.sections.find((s) => Math.abs(s.x - 3) < 1e-10)!;
  approx(c.nodes[0].ry, 30, 1e-10, "Ry");
  approx(c.nodes[1].ry, 30, 1e-10, "Ry");
  approx(mid.m, 45, 1e-10, "Mmid");
  approx(mid.w, -0.010546875, 1e-10, "خیز دقیق با بار گسترده");
  approx(m.maxTranslation, 0.010546875, 1e-10, "بیشینه");
});
test("frame/beam", "تیر دوسرگیردار بدون درجه آزادی آزاد", () => {
  const m = fixture("beam");
  m.nodes.forEach((n) => (n.support = "fixed"));
  const r = solveFrame(m);
  assert(r.status === "solved", "همه درجات مقید");
  const c = r.results[0],
    mid = c.members[0].sections.find((s) => s.x === 3)!;
  approx(c.nodes[0].rm, 30, 1e-10, "لنگر تکیه‌گاهی");
  approx(c.nodes[1].rm, -30, 1e-10, "لنگر انتها");
  approx(mid.w, (-10 * 6 ** 4) / (384 * 16000), 1e-12, "خیز");
});
test("frame/beam", "کشش محوری و عضو قائم: تبدیل مختصات", () => {
  const m = fixture("cantilever");
  m.nodes[1].x = 0;
  m.nodes[1].y = 4;
  m.cases[0].nodes[0] = { node: "N2", fx: 10, fy: 5, mz: 0 };
  const c = solveFrame(m).results[0];
  approx(c.nodes[1].ux, (10 * 4 ** 3) / (3 * 16000), 1e-12, "انتقال افقی");
  approx(c.nodes[1].uy, (5 * 4) / (200e6 * 0.01), 1e-12, "PL/EA");
  approx(c.nodes[0].rm, 40, 1e-9, "لنگر");
});
test("frame/beam", "بار گسترده محوری با دو انتهای بسته", () => {
  const m = fixture("beam");
  m.nodes.forEach((n) => (n.support = "fixed"));
  m.cases[0].members[0] = { member: "M1", qx: 10, qy: 0 };
  const c = solveFrame(m).results[0];
  approx(c.nodes[0].rx, -30, 1e-9, "محوری");
  approx(c.members[0].sections.find((s) => s.x === 3)!.u, (10 * 3 * 3) / (2 * 2e6), 1e-12, "تغییرطول میانی");
});
test("frame/beam", "شبکه‌بندی تیر همان جواب دقیق را نگه می‌دارد", () => {
  const m = fixture("beam"),
    ref = solveFrame(m).results[0];
  m.nodes.splice(1, 0, { id: "Nm", x: 3, y: 0, support: "free" });
  m.members = [
    { ...m.members[0], end: "Nm" },
    { ...m.members[0], id: "M2", start: "Nm" },
  ];
  m.cases[0].members.push({ member: "M2", qx: 0, qy: -10 });
  const c = solveFrame(m).results[0];
  approx(c.nodes[1].uy, ref.members[0].sections.find((s) => s.x === 3)!.w, 1e-11, "تقسیم عضو");
  approx(c.nodes[0].ry, 30, 1e-9, "واکنش");
});
test("frame/portal", "جمع خطی و ضریب منفی؛ ترکیب‌ها معیار پذیرش نیستند", () => {
  const m = fixture("portal");
  m.combinations[0].factors = { LC1: 1.2, LC2: -1.5 };
  const r = solveFrame(m);
  assert(r.status === "solved", "پورتال");
  for (let i = 0; i < m.nodes.length; i++)
    for (const key of ["ux", "uy", "rz", "rx", "ry", "rm"] as const)
      approx(r.results[2].nodes[i][key], 1.2 * r.results[0].nodes[i][key] - 1.5 * r.results[1].nodes[i][key], 1e-9, "برهم‌نهی");
  assert(
    r.envelopes.every((e) => e.mMin <= e.mMax && e.governing.mMin.length > 0),
    "پوش",
  );
  assert(!r.executionReady, "تأیید جعلی");
});
test("frame/portal", "قاب شیبدار، بارهای محور محلی و تعادل لنگر", () => {
  const m = fixture("pitched");
  m.cases[0].members = [
    { member: "M2", qx: 2, qy: -3 },
    { member: "M3", qx: 2, qy: -3 },
  ];
  const r = solveFrame(m);
  assert(r.status === "solved", r.issues.join(" "));
  for (const c of r.results) assert(c.equilibrium.relative < 1e-10 && c.residual < 1e-10, "تعادل/باقیمانده");
});
test("frame/gates", "مدل آزاد، غلتک ناپایدار و گره یتیم خروجی ندارند", () => {
  for (const support of ["free", "rollerY"] as const) {
    const m = fixture("beam");
    m.nodes.forEach((n) => (n.support = support));
    const r = solveFrame(m);
    assert(r.status === "blocked" && !r.results.length, "ناپایداری");
  }
  const m = fixture("beam");
  m.nodes.push({ id: "orphan", x: 10, y: 10, support: "fixed" });
  assert(solveFrame(m).status === "blocked", "گره یتیم");
});
test("frame/gates", "ورودی خراب و اتصال گم‌شده با API قرارداد یکسان دارند", () => {
  const m = fixture("beam");
  assert(frameInputErrors({ ...m, approved: true }).length > 0, "ویژگی جعلی");
  m.members[0].iCm4 = NaN;
  assert(frameInputErrors(m).length > 0, "NaN");
  m.members[0].iCm4 = 8000;
  m.members[0].start = "unknown";
  assert(frameInputErrors(m).length > 0, "شناسه گم شده");
  assert(solveFrame(emptyFrame()).status === "blocked", "پیش‌نویس");
});
test("frame/gates", "تیر عمیق، تغییرشکل بزرگ و مدل تأییدنشده", () => {
  const m = fixture("cantilever");
  m.members[0].depthM = 1;
  assert(solveFrame(m).status === "blocked", "عمیق");
  m.members[0].depthM = 0.3;
  m.cases[0].nodes[0].fy = -1000;
  assert(solveFrame(m).status === "outside-domain", "تغییرشکل بزرگ");
  assert(solveFrame(frameTemplate("beam")).status === "blocked", "نمونه بدون تأیید دامنه");
});
test("frame/gates", "شناسه‌های هم‌نام خواص جاوااسکریپت بار اضافه تولید نمی‌کنند", () => {
  const m = fixture("portal");
  m.cases[1].id = "toString";
  m.combinations = [];
  const r = solveFrame(m);
  assert(r.status === "solved", "شناسه مجاز");
  approx(r.results[0].nodes[0].rx, -r.results[0].nodes[3].rx, 1e-9, "حالت قائم");
});
test("frame/invariance", "جابجایی مبدا و تغییر ترتیب گره‌ها جواب نیرو را عوض نمی‌کند", () => {
  const m = fixture("pitched"),
    base = solveFrame(m);
  m.nodes = m.nodes.reverse().map((n) => ({ ...n, x: n.x + 100, y: n.y - 40 }));
  const r = solveFrame(m);
  assert(r.status === "solved", "انتقال مبدا");
  for (let j = 0; j < r.results.length; j++)
    for (const n of r.results[j].nodes) {
      const ref = base.results[j].nodes.find((x) => x.node === n.node)!;
      for (const k of ["ux", "uy", "rz", "rx", "ry", "rm"] as const) approx(n[k], ref[k], 1e-8, "ناوردایی");
    }
});

test("frame/beam", "نقطه بحرانی لنگر بین ایستگاه‌های نمونه‌برداری جا نمی‌افتد", () => {
  const m = fixture("beam");
  m.nodes.forEach((n) => (n.support = "fixed"));
  m.nodes[1].support = "rollerY";
  const r = solveFrame(m),
    e = r.results[0].members[0];
  const critical = -e.endForces[1] / -10;
  assert(
    e.sections.some((p) => Math.abs(p.x - critical) < 1e-10),
    "ریشه برش",
  );
  approx(r.envelopes[0].mMax, Math.max(...e.sections.map((p) => p.m)), 1e-10, "پوش");
});

test("frame/beam", "بیشینه خیز خارج شبکه ۲۰ قسمتی با ریشه تحلیلی پیدا می‌شود", () => {
  const m = fixture("beam");
  m.nodes[0].support = "fixed";
  const r = solveFrame(m),
    member = r.results[0].members[0];
  const L = 6,
    x = ((15 - Math.sqrt(33)) * L) / 16;
  const expected = (-10 / (48 * 16000)) * (2 * x ** 4 - 5 * L * x ** 3 + 3 * L ** 2 * x * x);
  assert(
    member.sections.some((s) => Math.abs(s.x - x) < 1e-9),
    "ریشه شیب",
  );
  approx(member.maxTranslation, Math.abs(expected), 1e-11, "بیشینه خیز");
});

test("frame/integration", "داده قاب در خانواده نامرتبط و تأیید جعلی رد می‌شود", () => {
  const m = fixture("beam");
  assert(!structuralErrors({ ...emptyStructure("bridge"), frame: m }).length, "قاب در مسیر پل");
  assert(structuralErrors({ ...emptyStructure("masonry"), frame: m }).length > 0, "مدل جایگزین بنایی نیست");
  assert(frameInputErrors({ ...m, executionReady: true }).length > 0, "کلید تأیید");
});
test("frame/export", "متن اظهاری CSV/SVG به فرمول یا کد تبدیل نمی‌شود", () => {
  const m = fixture("portal");
  m.cases[0].name = '=HYPERLINK("x")';
  const r = solveFrame(m);
  assert(frameCsv(r)["frame-nodes.csv"].includes("'="), "CSV خنثی‌سازی");
  r.results[0].name = "<script>alert(1)</script>";
  const svg = frameSvg(m, r.results[0], "moment");
  assert(!svg.includes("<script>") && svg.includes("&lt;script&gt;"), "SVG متن امن");
});
