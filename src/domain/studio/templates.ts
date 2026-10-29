/** الگوهای شروعِ قابل ویرایش؛ نه نقشهٔ اجرایی یا گواهی انطباق کاربری. */
import { addItem, createStudioDocument, type StudioDocument, type StudioItem } from "./document";
export const DESIGN_TEMPLATES = [
  { id: "office", label: "دفتر اداری", description: "۱۸×۱۲ متر؛ فضای کار، جلسه، مدیریت، بایگانی و سرویس" },
  { id: "school", label: "آموزشی کوچک", description: "۱۸×۱۲ متر؛ سه کلاس، مدیریت، آزمایشگاه و سرویس" },
  { id: "clinic", label: "درمانگاه سرپایی", description: "۱۸×۱۲ متر؛ معاینه، انتظار، پذیرش، کارکنان و سرویس" },
] as const;
export type DesignTemplateId = (typeof DESIGN_TEMPLATES)[number]["id"];
export function isDesignTemplate(value: unknown): value is DesignTemplateId {
  return DESIGN_TEMPLATES.some((t) => t.id === value);
}

export function createDesignTemplate(template: DesignTemplateId): StudioDocument {
  const definition = DESIGN_TEMPLATES.find((t) => t.id === template);
  if (!definition) throw new Error("الگوی طراحی معتبر نیست.");
  let doc = createStudioDocument({
    name: `الگوی ${definition.label}`,
    grid: 0.05,
    project: {
      name: `الگوی ${definition.label}`,
      code: `HMC-T-${template.toUpperCase()}`,
      client: "",
      designer: "",
      date: "",
      note: "الگوی شروع؛ ابعاد، دسترس‌پذیری، خروج، سازه و تأسیسات باید برای پروژه طراحی و کنترل شوند.",
    },
  });
  const place = (id: string, x: number, y: number, patch: Partial<StudioItem> = {}) => {
    doc = addItem(doc, id, { x, y }, patch);
  };
  const wall = (x0: number, y0: number, x1: number, y1: number, external = false) => {
    const length = Math.hypot(x1 - x0, y1 - y0);
    if (length < 0.01) return;
    place(external ? "wall-exterior" : "wall-partition", (x0 + x1) / 2, (y0 + y1) / 2, {
      w: length,
      d: external ? 0.25 : 0.12,
      rotationDeg: (-Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI,
    });
  };
  // دیوار و بازشو از بازه‌های جدا ساخته می‌شوند؛ هیچ پنجره/دری پشت دیوار توپر نیست.
  for (const y of [0, 12]) {
    let from = 0;
    for (const x of [3, 9, 15]) {
      wall(from, y, x - 0.9, y, true);
      place("window", x, y, { w: 1.8, d: 0.25 });
      from = x + 0.9;
    }
    wall(from, y, 18, y, true);
  }
  wall(0, 0, 0, 5.3, true);
  wall(0, 6.7, 0, 12, true);
  place("door-double", 0, 6, { w: 1.4, d: 0.25, rotationDeg: 90, label: "ورودی اصلی" });
  wall(18, 0, 18, 5.4, true);
  wall(18, 6.6, 18, 12, true);
  place("door-double", 18, 6, { w: 1.2, d: 0.25, rotationDeg: -90, label: "خروج دوم؛ نیازمند کنترل" });
  for (const y of [4.8, 7.2]) {
    let from = 0;
    for (const x of [3, 9, 15]) {
      wall(from, y, x - 0.55, y);
      place("door-single", x, y, { w: 1.1, d: 0.12, rotationDeg: y < 6 ? 0 : 180 });
      from = x + 0.55;
    }
    wall(from, y, 18, y);
  }
  for (const x of [6, 12]) {
    wall(x, 0, x, 4.8);
    wall(x, 7.2, x, 12);
  }
  place("space-room", 9, 6, { w: 17.5, d: 2.2, label: "راهروی ارتباطی" });
  const names =
    template === "office"
      ? ["کار گروهی", "جلسه", "مدیریت", "کارشناسان", "بایگانی و استراحت", "سرویس و دسترس‌پذیری"]
      : template === "school"
        ? ["کلاس یک", "کلاس دو", "کلاس سه", "مدیریت", "آزمایشگاه آموزشی", "سرویس و دسترس‌پذیری"]
        : ["معاینه یک", "معاینه دو", "معاینه سه", "انتظار و پذیرش", "کارکنان و دارو", "سرویس و دسترس‌پذیری"];
  for (let index = 0; index < 6; index++) {
    const x = 3 + (index % 3) * 6,
      y = index < 3 ? 2.4 : 9.6;
    place("space-room", x, y, { w: 5.7, d: 4.5, label: names[index] });
    place("light-fixture", x, y, { label: "روشنایی؛ جانمایی اولیه" });
    place("socket", x + 2.7, y, { rotationDeg: 90 });
    if (index === 5) {
      place("accessible-wc", x - 1.6, y + 1.1);
      place("lavatory", x + 1.7, y + 1.2);
      continue;
    }
    if (template === "school" && index < 3) {
      for (const dx of [-1.6, 0, 1.6]) for (const dy of [-0.65, 0.8]) place("student-desk", x + dx, y + dy, { w: 1.1, d: 0.65 });
      place("whiteboard", x, y - 1.85, { w: 3, d: 0.1 });
    } else if (template === "clinic" && index < 3) {
      place("exam-table", x + 1.5, y, { rotationDeg: 90 });
      place("desk-straight", x - 1.5, y + 1);
      place("medical-cabinet", x - 1.7, y - 1.5);
      place("lavatory", x + 1.7, y - 1.5);
    } else if (template === "office" && index === 1) {
      place("meeting-8", x, y);
    } else if (template === "office" && index === 4) {
      place("filing", x - 2, y);
      place("filing", x + 2, y);
      place("printer", x, y + 1.4);
    } else if (template === "clinic" && index === 3) {
      place("reception", x + 1, y + 1);
      for (const dy of [-0.7, 0, 0.7]) place("chair", x - 2, y + dy, { rotationDeg: 90 });
      place("wheelchair-space", x + 1.4, y - 1);
    } else if (template === "school" && index === 4) {
      place("lab-bench", x - 1.5, y, { rotationDeg: 90 });
      place("lab-bench", x + 1.5, y, { rotationDeg: 90 });
    } else {
      place("desk-straight", x - 1.3, y + 0.8);
      place("desk-straight", x + 1.3, y - 0.8);
      place(template === "clinic" ? "medical-cabinet" : "filing", x + 2, y + 1.5);
    }
  }
  place("fire-extinguisher", 0.45, 4.4, { label: "جانمایی اولیه؛ کنترل پوشش لازم است" });
  place("panel", 17.5, 7.6, { label: "تابلو؛ بدون طراحی مدار" });
  // طبقه‌بندی‌ها و همهٔ اشیا همان مدل استاندارد استودیو را مصرف می‌کنند.
  return doc;
}
