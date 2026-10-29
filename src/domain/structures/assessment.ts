import { solveFrame } from "./frame/solver";
import { FRAME_FORMULAS } from "./frame/formulas";
import { STRUCTURAL_FORMULAS } from "./formulas";
import { familyOf, fieldsFor, referenceList, structuralErrors, type StructuralProfile } from "./catalog";
export interface Metric {
  id: string;
  label: string;
  value: number;
  unit: string;
  expression: string;
  formulaId: string;
  classification: "screening-estimate";
  verification: "internally-tested";
}
export interface Comparison {
  label: string;
  observed: number;
  criterion: number;
  withinUserCriterion: boolean;
}
export function assessStructure(p: StructuralProfile, options: { includeFrame?: boolean } = {}) {
  const errors = structuralErrors(p);
  if (errors.length) throw new Error(errors.join(" "));
  const family = familyOf(p.family)!;
  const fields = fieldsFor(p);
  const empty = (key: string) => p.values[key] === null || p.values[key] === undefined || String(p.values[key]).trim() === "";
  const missing = fields.filter((f) => empty(f.key)).map((f) => ({ key: f.key, label: f.label, group: f.group }));
  const metrics: Metric[] = [];
  const comparisons: Comparison[] = [];
  const limitations: string[] = [
    "محاسبه فقط از ورودی‌های بخش ارزیابی استفاده می‌کند؛ از مدل ترسیمی یا شرح بارگذاری پروژه استخراج نشده و تحلیل کل سازه نیست.",
  ];
  if (p.family === "timber")
    limitations.push(
      "شناسهٔ این مسیر پیش‌تر «چوبی و سبک» را با هم نام‌گذاری می‌کرد. نوع واقعی پرونده‌های قدیمی باید دستی تشخیص داده شود؛ سامانه آن‌ها را به فولاد سردنوردشده خودکار تبدیل نکرده است.",
    );
  const n = (key: string) => p.values[key] as number;
  const add = (id: string, value: number) => {
    if (!Number.isFinite(value)) throw new Error("نتیجهٔ محاسبه متناهی نیست.");
    const formulaId = `STRUCT-${family.calculator}-${id}`;
    const record = STRUCTURAL_FORMULAS[formulaId];
    if (!record) throw new Error("رابطهٔ محاسبه ثبت نشده است.");
    metrics.push({
      id,
      value,
      formulaId,
      label: record.label,
      unit: record.resultUnit,
      expression: record.expression,
      classification: "screening-estimate",
      verification: "internally-tested",
    });
  };
  let status: "not-implemented" | "missing-input" | "outside-domain" | "limited-result" =
    family.calculator === "none" ? "not-implemented" : "missing-input";
  const analysisFields = fields.filter((f) => f.group === "assessment");
  const ready = analysisFields.length > 0 && analysisFields.every((f) => !empty(f.key));
  const criteriaDocumented = !empty("criteria");
  if (family.calculator === "beam") {
    limitations.push(
      "فقط تیر منشوری دوسر ساده با بار گسترده یکنواخت، تغییرشکل کوچک و رفتار خطی؛ تحلیل قاب نیست.",
      "سختی مؤثر E و I ورودی کاربر است؛ ترک‌خوردگی، خزش، کمانش، ارتعاش، مقاومت و اتصالات کنترل نمی‌شوند.",
    );
    if (p.values.beamModel === "شرایط دیگر") status = "outside-domain";
    else if (ready) {
      const L = n("beamL"),
        h = n("beamDepth"),
        q = n("beamQ"),
        E = n("beamE") * 1e6,
        I = n("beamI") * 1e-8;
      if (L / h < 10) {
        status = "outside-domain";
        limitations.push(
          "نسبت طول به ارتفاع کمتر از ۱۰ است؛ تقریب خمش بدون تغییرشکل برشی در این ابزار اعمال نمی‌شود. این حد، محدودیت مدل است نه حکم آیین‌نامه.",
        );
      } else {
        status = "limited-result";
        const delta = ((5 * q * L ** 4) / (384 * E * I)) * 1000;
        add("reaction", (q * L) / 2);
        add("moment", (q * L ** 2) / 8);
        add("deflection", delta);
        if (delta > L * 1000 * 0.01) {
          status = "outside-domain";
          limitations.push(
            "خیز محاسبه‌شده بیش از یک درصد طول است؛ فرض تغییرشکل کوچک در دامنهٔ محافظه‌کارانهٔ این ابزار تأیید نمی‌شود. این حد نرم‌افزاری است، نه ضابطهٔ مجاز خیز.",
          );
        }
        if (criteriaDocumented && status === "limited-result")
          comparisons.push({
            label: "خیز در برابر حد اعلامی کاربر؛ نه تأیید ضابطه",
            observed: delta,
            criterion: n("beamLimit"),
            withinUserCriterion: delta <= n("beamLimit"),
          });
      }
    }
  } else if (family.calculator === "wall") {
    limitations.push(
      "Rankine: خاک بدون چسبندگی، سطح افقی، دیوار با اصطکاک جانبی صفر، خاک خشک، بدون آب و زلزله.",
      "پایداری کلی، نشست، مقاومت دیوار، اثر گود، فشار غیرفعال و کلید برشی محاسبه نمی‌شوند.",
      "نیرو و بازوی پایدارکننده باید از هندسه و بارگذاری واقعی ارائه شوند؛ ابزار آن‌ها را از انتخاب نوع دیوار حدس نمی‌زند.",
    );
    if (p.values.wallModel === "شرایط دیگر") status = "outside-domain";
    else if (ready) {
      const H = n("wallH"),
        B = n("baseB"),
        W = n("weight"),
        a = n("lever");
      if (a >= B) {
        status = "outside-domain";
        limitations.push("برآیند نیروی قائم باید داخل عرض پی قرار بگیرد؛ بازوی واردشده معتبر نیست.");
      } else {
        const Ka = Math.tan(Math.PI / 4 - (n("phi") * Math.PI) / 360) ** 2,
          Pg = 0.5 * Ka * n("gamma") * H ** 2,
          Pq = Ka * n("surcharge") * H,
          P = Pg + Pq,
          Mo = (Pg * H) / 3 + (Pq * H) / 2,
          Mr = W * a,
          e = B / 2 - (Mr - Mo) / W;
        status = "limited-result";
        add("ka", Ka);
        add("thrust", P);
        add("overturningMoment", Mo);
        const slide = (n("mu") * W) / P,
          overturn = Mr / Mo;
        add("sliding", slide);
        add("overturning", overturn);
        add("eccentricity", e);
        if (Math.abs(e) > B / 6 + 1e-10) {
          status = "outside-domain";
          limitations.push("برآیند خارج هستهٔ میانی است؛ فشار خطی تمام‌تماس معتبر نیست و فشار زیر پی گزارش نمی‌شود.");
        } else {
          const qmax = (W / B) * (1 + (6 * Math.abs(e)) / B),
            qmin = (W / B) * (1 - (6 * Math.abs(e)) / B);
          add("qmax", qmax);
          add("qmin", Math.max(0, qmin));
          if (criteriaDocumented)
            comparisons.push({
              label: "فشار در برابر مقدار مجاز اعلامی",
              observed: qmax,
              criterion: n("bearing"),
              withinUserCriterion: qmax <= n("bearing"),
            });
        }
        if (criteriaDocumented && status === "limited-result")
          comparisons.push(
            {
              label: "لغزش در برابر معیار اعلامی",
              observed: slide,
              criterion: n("slideCriterion"),
              withinUserCriterion: slide >= n("slideCriterion"),
            },
            {
              label: "واژگونی در برابر معیار اعلامی",
              observed: overturn,
              criterion: n("overturnCriterion"),
              withinUserCriterion: overturn >= n("overturnCriterion"),
            },
          );
      }
    }
  } else if (family.calculator === "hydro") {
    limitations.push(
      "مایع ساکن با چگالی ثابت، سطح آزاد در فشار جو، فشار روی دیوار قائم به ازای هر متر عرض.",
      "مقدار لنگر، لنگر بار نسبت به پای دیوار است؛ تعیین لنگر طراحی عضو نیازمند مدل تکیه‌گاهی است.",
      "فشار خاک/گاز، ضربه قوچ، تلاطم و پاسخ لرزه‌ای، ترک و آب‌بندی کنترل نمی‌شوند.",
    );
    if (p.values.hydroModel === "شرایط دیگر") status = "outside-domain";
    else if (ready) {
      status = "limited-result";
      const H = n("liquidH"),
        g = 9.80665,
        rho = n("density");
      add("pressure", (rho * g * H) / 1000);
      add("force", (rho * g * H ** 2) / 2000);
      add("loadMoment", (rho * g * H ** 3) / 6000);
    }
  } else limitations.push("حل‌گر اختصاصی این خانواده پیاده نشده است؛ این خروجی فقط پروندهٔ نیازها و شکاف طراحی است، نه محاسبات یا نقشه.");
  if (!criteriaDocumented) limitations.push("منبع معیارهای پذیرش وارد نشده است؛ نتیجهٔ پذیرش بر اساس آستانه‌ها صادر نمی‌شود.");
  const references = referenceList(p.family).map((r) => ({ ...r, submitted: p.references[r.id] ?? null, verified: false }));
  const requiredDeliverables = family.deliverables.map((label) => ({ label, status: "not-designed" as const }));
  return {
    engine: "structural-screening/1.1",
    frame: p.frame && options.includeFrame !== false ? { ...solveFrame(p.frame), formulaRecords: Object.values(FRAME_FORMULAS) } : null,
    family: family.id,
    label: family.name,
    status,
    executionReady: false as const,
    information: { completed: fields.length - missing.length, total: fields.length },
    missing,
    metrics,
    formulaRecords: metrics.map((m) => STRUCTURAL_FORMULAS[m.formulaId]),
    comparisons,
    limitations,
    references,
    requiredDeliverables,
  };
}
