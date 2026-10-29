import type { FormulaRecord } from "../../engineering/registry";
import { FRAME_ASSUMPTIONS } from "./solver";
const rows = [
  ["stiffness", "روش سختی مستقیم قاب دوبعدی", "K = sum(T^t k_local T); K_ff d_f = F_f; R = K d - F", "kN, m, rad"],
  ["load", "بار سازگار عضو منشوری", "f_local = [qx L/2, qy L/2, qy L^2/12, qx L/2, qy L/2, -qy L^2/12]", "kN, kN.m"],
  ["section", "نیروهای درون عضو از تعادل", "N(x)=-fiX-qx*x; V(x)=fiY+qy*x; M(x)=-fiM+fiY*x+qy*x^2/2", "kN, kN.m"],
  [
    "deflection",
    "درونیابی تغییرشکل با حل خاص بار یکنواخت",
    "v = Hermite(d) + qy*x^2*(L-x)^2/(24EI); u = linear(d) + qx*x*(L-x)/(2EA)",
    "m",
  ],
] as const;
export const FRAME_FORMULAS: Record<string, FormulaRecord> = Object.fromEntries(
  rows.map(([key, label, expression, resultUnit]) => {
    const id = `FRAME-${key}`;
    return [
      id,
      {
        id,
        label,
        expression,
        resultUnit,
        inputs: [
          { symbol: "E", name: "مدول مؤثر: GPa × 1e6", unit: "kN/m2" },
          { symbol: "A", name: "مساحت: cm2 × 1e-4", unit: "m2" },
          { symbol: "I", name: "ممان سطح: cm4 × 1e-8", unit: "m4" },
          { symbol: "L", name: "طول عضو", unit: "m" },
        ],
        classification: "screening-estimate",
        assumptions: [...FRAME_ASSUMPTIONS],
        validity: {
          domain: "قاب خطی صفحه‌ای، اتصالات صلب، تغییرشکل کوچک و L/h>=10؛ رهاسازی و تحلیل غیرخطی موجود نیست.",
          limits: [{ parameter: "L", min: 0.05, max: 1000, unit: "m" }],
          failureMode: "داده نامعتبر، مکانیزم، دستگاه بدشرط یا عدم تعادل: بدون نتیجه؛ تغییرشکل بزرگ: خارج دامنه.",
        },
        limitations: "تحلیل عددی محدود است، نه طراحی یا تأیید مقاومت/ضوابط.",
        verification: "internally-tested",
        usedByRules: [],
      } satisfies FormulaRecord,
    ];
  }),
);
