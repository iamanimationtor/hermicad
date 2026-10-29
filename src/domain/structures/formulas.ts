/** روابط محدود با همان قرارداد دفتر مرکزی فرمول‌ها؛ هیچ مرجع رسمی تأییدشده‌ای ادعا نمی‌شود. */
import type { FormulaRecord } from "../engineering/registry";
import { STRUCTURAL_FIELDS } from "./catalog";
const models = {
  beam: {
    domain: "تیر منشوری دوسر ساده، رفتار خطی، بار گسترده یکنواخت؛ L/h>=10 و delta/L<=0.01 (حدود مدل نرم‌افزار، نه ضابطه).",
    keys: ["beamL", "beamDepth", "beamQ", "beamE", "beamI"],
    assumptions: ["وزن خود تیر در q منظور شده است.", "E و I مؤثر ورودی‌اند؛ خزش و ترک‌خوردگی خودکار نیست."],
    limitations: "مقاومت، کمانش، برش، ارتعاش، قاب و اتصالات محاسبه نمی‌شوند.",
  },
  wall: {
    domain: "دیوار ثقلی، خاک خشک افقی بدون چسبندگی و زلزله، a<B؛ فشار تمام‌تماس فقط abs(e)<=B/6.",
    keys: ["wallH", "gamma", "phi", "surcharge", "baseB", "weight", "lever", "mu"],
    assumptions: [
      "اصطکاک جانبی دیوار و فشار غیرفعال صفر فرض شده‌اند.",
      "Pg=0.5 Ka gamma H^2; Pq=Ka q H; P=Pg+Pq.",
      "W و a باید مستقل و مستند محاسبه شوند.",
    ],
    limitations: "پایداری کلی، نشست، مقاومت سازه، آب و زلزله محاسبه نمی‌شوند.",
  },
  hydro: {
    domain: "مایع ساکن با چگالی ثابت، سطح آزاد در فشار جو و دیواره قائم؛ هر متر عرض.",
    keys: ["liquidH", "density"],
    assumptions: ["g=9.80665 m/s2", "لنگر، لنگر بار نسبت به پای دیوار است، نه الزاماً لنگر داخلی عضو."],
    limitations: "مدل تکیه‌گاهی، خاک و گاز، هیدرودینامیک، زلزله، آب‌بندی و طراحی مقاومت محاسبه نمی‌شوند.",
  },
} as const;
const rows = [
  ["beam", "reaction", "واکنش هر تکیه‌گاه", "kN", "R = q L / 2"],
  ["beam", "moment", "لنگر بیشینه", "kN.m", "M = q L^2 / 8"],
  ["beam", "deflection", "خیز الاستیک بیشینه", "mm", "delta = 5 q L^4 / (384 E I); E[GPa]*1e6; I[cm4]*1e-8; m*1000"],
  ["wall", "ka", "ضریب فشار فعال", "-", "Ka = tan(45deg - phi/2)^2"],
  ["wall", "thrust", "نیروی افقی در هر متر", "kN/m", "P = 0.5 Ka gamma H^2 + Ka q H"],
  ["wall", "overturningMoment", "لنگر واژگون‌کننده در هر متر", "kN.m/m", "Mo = Pg H/3 + Pq H/2"],
  ["wall", "sliding", "نسبت مقاومت به لغزش", "-", "FSs = mu W / P"],
  ["wall", "overturning", "نسبت مقاومت به واژگونی", "-", "FSo = W a / Mo"],
  ["wall", "eccentricity", "خروج از مرکزیت با علامت", "m", "e = B/2 - (W a - Mo)/W"],
  ["wall", "qmax", "فشار بیشینه زیر پی", "kPa", "qmax = W/B (1+6 abs(e)/B)"],
  ["wall", "qmin", "فشار کمینه زیر پی", "kPa", "qmin = W/B (1-6 abs(e)/B)"],
  ["hydro", "pressure", "فشار در پای دیوار", "kPa", "p = rho g H / 1000; g=9.80665 m/s2"],
  ["hydro", "force", "برآیند بار در هر متر عرض", "kN/m", "F = rho g H^2 / 2000"],
  ["hydro", "loadMoment", "لنگر بار نسبت به پای دیوار", "kN.m/m", "M = rho g H^3 / 6000"],
] as const;
export const STRUCTURAL_FORMULAS: Record<string, FormulaRecord> = Object.fromEntries(
  rows.map(([model, key, label, resultUnit, expression]) => {
    const meta = models[model];
    const inputs = meta.keys.map((key) => STRUCTURAL_FIELDS.find((f) => f.key === key)!);
    const id = `STRUCT-${model}-${key}`;
    return [
      id,
      {
        id,
        label,
        expression,
        resultUnit,
        inputs: inputs.map((f) => ({ symbol: f.key, name: f.label, unit: f.unit ?? "-" })),
        classification: "screening-estimate",
        assumptions: [...meta.assumptions],
        validity: {
          domain: meta.domain,
          limits: inputs.map((f) => ({ parameter: f.key, min: f.min ?? null, max: f.max ?? null, unit: f.unit ?? "-" })),
          failureMode: "خارج دامنه: وضعیت outside-domain؛ خروجی اجرایی و پذیرش صادر نمی‌شود.",
        },
        limitations: meta.limitations,
        verification: "internally-tested",
        usedByRules: [],
      } satisfies FormulaRecord,
    ];
  }),
);
