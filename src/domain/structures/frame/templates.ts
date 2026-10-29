import { emptyFrame, type FrameModel } from "./model";
/** فقط نمونهٔ آموزشی؛ تأیید دامنه عمداً false است و کاربر باید همهٔ داده‌ها را بازبینی کند. */
export function frameTemplate(kind: "cantilever" | "beam" | "portal" | "pitched"): FrameModel {
  const m = emptyFrame();
  m.basis = "نمونهٔ آموزشی با سختی فرضی؛ پیش از استفاده با مدارک واقعی جایگزین شود.";
  const member = (id: string, start: string, end: string) => ({ id, start, end, eGPa: 200, areaCm2: 100, iCm4: 8000, depthM: 0.3 });
  if (kind === "cantilever") {
    m.nodes = [
      { id: "N1", x: 0, y: 0, support: "fixed" },
      { id: "N2", x: 4, y: 0, support: "free" },
    ];
    m.members = [member("M1", "N1", "N2")];
    m.cases = [
      {
        id: "LC1",
        name: "بار نوک طره",
        source: "نمونه آموزشی؛ نیروی فرضی ده کیلونیوتن",
        nodes: [{ node: "N2", fx: 0, fy: -10, mz: 0 }],
        members: [],
      },
    ];
  } else if (kind === "beam") {
    m.nodes = [
      { id: "N1", x: 0, y: 0, support: "pin" },
      { id: "N2", x: 6, y: 0, support: "rollerY" },
    ];
    m.members = [member("M1", "N1", "N2")];
    m.cases = [
      {
        id: "LC1",
        name: "بار گسترده تیر ساده",
        source: "نمونه آموزشی؛ ده کیلونیوتن بر متر در جهت منفی y محلی",
        nodes: [],
        members: [{ member: "M1", qx: 0, qy: -10 }],
      },
    ];
  } else {
    m.nodes = [
      { id: "N1", x: 0, y: 0, support: "fixed" },
      { id: "N2", x: 0, y: 4, support: "free" },
      { id: "N3", x: 6, y: 4, support: "free" },
      { id: "N4", x: 6, y: 0, support: "fixed" },
    ];
    m.members = [member("M1", "N1", "N2"), member("M2", "N2", "N3"), member("M3", "N4", "N3")];
    if (kind === "pitched") {
      m.nodes.push({ id: "N5", x: 3, y: 5, support: "free" });
      m.members = [member("M1", "N1", "N2"), member("M2", "N2", "N5"), member("M3", "N5", "N3"), member("M4", "N4", "N3")];
    }
    m.cases = [
      {
        id: "LC1",
        name: "بار قائم نمونه",
        source: "نمونه آموزشی؛ بارهای گره‌ای فرضی",
        nodes: [
          { node: "N2", fx: 0, fy: -20, mz: 0 },
          { node: "N3", fx: 0, fy: -20, mz: 0 },
        ],
        members: [],
      },
      {
        id: "LC2",
        name: "بار جانبی نمونه",
        source: "نمونه آموزشی؛ نه بار باد یا زلزله آیین‌نامه‌ای",
        nodes: [{ node: "N2", fx: 10, fy: 0, mz: 0 }],
        members: [],
      },
    ];
    m.combinations = [{ id: "CB1", name: "برهم‌نهی آموزشی", source: "صرفاً جمع دو حالت؛ نه ترکیب بار مصوب", factors: { LC1: 1, LC2: 1 } }];
  }
  return m;
}
