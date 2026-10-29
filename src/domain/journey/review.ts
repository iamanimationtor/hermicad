import { CATALOG_BY_ID } from "../studio/catalog";
import { floorHeight } from "../studio/parameters";
import { renderableItems, type StudioDocument } from "../studio/document";
import type { Trade } from "./model";
import { activeFields, activeReferences, availableOutputs, briefErrors, emptyBrief, type Brief } from "./model";
/** اقلام واقعیِ قابل صدور؛ لایهٔ مخفی و نشانهٔ مشترک، مدل یک رشته محسوب نمی‌شوند. */
export function outputItems(doc: StudioDocument, trade: Trade | null, id: string) {
  const source = id === "bim" ? doc.items : renderableItems({ ...doc, classification: trade ?? "all" });
  return source.filter((item) => {
    const def = CATALOG_BY_ID[item.catalogId];
    if (!def) return false;
    if (id === "bim") return def.ifcClass === "IfcSpace" || !["annotation", "grid", "dimension"].includes(def.layer);
    if (id === "vertical") return def.layer === "walls";
    if (id === "tables") return def.layer === "walls" || def.ifcClass === "IfcSpace";
    return def.discipline === trade && (def.ifcClass === "IfcSpace" || !["annotation", "grid", "dimension"].includes(def.layer));
  });
}
export interface Finding {
  id: string;
  step: number;
  kind: "missing" | "conflict" | "review";
  message: string;
  action: string;
}
export function reviewJourney(doc: StudioDocument) {
  const brief: Brief = doc.brief ?? emptyBrief();
  const findings: Finding[] = [];
  const add = (id: string, step: number, kind: Finding["kind"], message: string, action: string) =>
    findings.push({ id, step, kind, message, action });
  const malformed = briefErrors(brief);
  if (malformed.length) throw new Error(malformed.join(" "));
  for (const field of activeFields(brief))
    if (brief.values[field.key] === undefined || brief.values[field.key] === null || String(brief.values[field.key]).trim() === "")
      add(field.key, field.step, "missing", `${field.label} مشخص نیست.`, field.help);
  const n = (key: string) => (typeof brief.values[key] === "number" ? (brief.values[key] as number) : null);
  const w = n("width"),
    d = n("depth"),
    pw = n("plotWidth"),
    pd = n("plotDepth"),
    floors = n("floors");
  const north = n("north"),
    south = n("south"),
    east = n("east"),
    west = n("west"),
    coverage = n("coverage"),
    far = n("far"),
    allowed = n("allowedFloors");
  if (w !== null && pw !== null && east !== null && west !== null && w > pw - east - west)
    add(
      "envelope-x",
      1,
      "conflict",
      "عرض ساختمان از محدودهٔ باقیمانده پس از عقب‌نشینی بیشتر است.",
      "عرض یا جانمایی را اصلاح کنید؛ مقدار مصوب عقب‌نشینی را برای رفع خطا تغییر ندهید.",
    );
  if (d !== null && pd !== null && north !== null && south !== null && d > pd - north - south)
    add(
      "envelope-y",
      1,
      "conflict",
      "عمق ساختمان در محدودهٔ قابل ساخت جا نمی‌شود.",
      "عمق و جانمایی را با نقشهٔ برداشت و دستور نقشه تطبیق دهید.",
    );
  if (w && d && pw && pd && coverage !== null && (100 * w * d) / (pw * pd) > coverage + 0.001)
    add(
      "coverage",
      1,
      "conflict",
      "سطح اشغال پیشنهادی از درصد واردشده بیشتر است.",
      "مساحت پیشنهادی را کاهش دهید یا مغایرت مدارک را با مرجع صدور مجوز حل کنید.",
    );
  if (w && d && pw && pd && floors && far !== null && (100 * w * d * floors) / (pw * pd) > far + 0.001)
    add(
      "far",
      1,
      "conflict",
      "زیربنای ساده‌شده از تراکم واردشده بیشتر است.",
      "نحوهٔ احتساب طبقات و استثناهای تراکم را بررسی کنید؛ این محاسبه مستطیلی و اولیه است.",
    );
  if (floors && allowed && floors > allowed)
    add("floors-limit", 2, "conflict", "تعداد طبقات پیشنهادی بیشتر از مجاز واردشده است.", "تعداد طبقات یا مجوز پروژه باید اصلاح شود.");
  for (const source of activeReferences(brief)) {
    const evidence = brief.sources[source.id];
    const supplied = evidence && [evidence.reference, evidence.edition, evidence.date].every((v) => v.trim());
    add(
      `reference-${source.id}`,
      3,
      supplied ? "review" : "missing",
      `${source.label}: ${supplied ? "ثبت شده؛ اصالت و لازم‌الاجرا بودن تأیید نشده" : "شماره، نسخه و تاریخ بررسی ثبت نشده"}.`,
      source.help,
    );
  }
  const starter = [
    ["office", "اداری"],
    ["school", "آموزشی"],
    ["clinic", "سرپایی"],
  ] as const;
  const basedOn = starter.find(([id]) => doc.project.code.toLowerCase().includes(`t-${id}`));
  if (basedOn && basedOn[0] !== brief.use)
    add(
      "starter-use",
      4,
      "review",
      `سند از الگوی ${basedOn[1]} شروع شده ولی کاربری پرونده متفاوت است.`,
      "تغییر گزینهٔ کاربری، نقشه و برنامهٔ فیزیکی را بازطراحی نمی‌کند؛ مدل باید برای کاربری جدید بازبینی شود.",
    );
  const physical = doc.items.filter((i) => {
    const def = CATALOG_BY_ID[i.catalogId];
    return def && (def.ifcClass === "IfcSpace" || !["annotation", "grid", "dimension"].includes(def.layer));
  });
  if (!physical.length)
    add("model", 4, "missing", "هنوز مدل طراحی ندارید.", "سند را در استودیو تکمیل کنید یا آگاهانه از یک الگوی مقدماتی شروع کنید.");
  if (floors && doc.levels !== floors)
    add(
      "model-levels",
      4,
      "conflict",
      "تعداد طبقات مدل با نیاز ثبت‌شده متفاوت است.",
      "طبقات و اشیای هر طبقه را در استودیو اصلاح و ذخیره کنید؛ فرم نقشه را خودکار تغییر نمی‌دهد.",
    );
  if (floors)
    for (let level = 0; level < floors; level++)
      if (!physical.some((i) => i.level === level))
        add(
          `empty-level-${level}`,
          4,
          "missing",
          `طبقهٔ ${level + 1} مدل طراحی ندارد.`,
          "برای هر طبقه مدل مستقل لازم است؛ یک پلان به معنی طراحی همهٔ طبقات نیست.",
        );
  if (n("height") !== null && Math.abs(floorHeight(doc) - n("height")!) > 0.001)
    add("model-height", 4, "conflict", "ارتفاع طبقه در فرم و مدل یکسان نیست.", "ارتفاع کف تا کف مدل را در استودیو اصلاح کنید.");
  const walls = doc.items.filter(
    (i) => CATALOG_BY_ID[i.catalogId]?.layer === "walls" && !["IfcDoor", "IfcWindow"].includes(CATALOG_BY_ID[i.catalogId]?.ifcClass),
  );
  if (walls.length && w && d) {
    const corners = walls.flatMap((i) => {
      const t = (-i.rotationDeg * Math.PI) / 180;
      return [-1, 1].flatMap((a) =>
        [-1, 1].map((b) => ({
          x: i.x + ((a * i.w) / 2) * Math.cos(t) - ((b * i.d) / 2) * Math.sin(t),
          y: i.y + ((a * i.w) / 2) * Math.sin(t) + ((b * i.d) / 2) * Math.cos(t),
        })),
      );
    });
    const width = Math.max(...corners.map((p) => p.x)) - Math.min(...corners.map((p) => p.x)),
      depth = Math.max(...corners.map((p) => p.y)) - Math.min(...corners.map((p) => p.y));
    if (Math.abs(width - w) > 0.5 || Math.abs(depth - d) > 0.5)
      add(
        "model-envelope",
        4,
        "conflict",
        "ابعاد محدودهٔ دیوارهای مدل با ابعاد پیشنهادی فرم متفاوت است.",
        "ابعاد واقعی نقشه را تطبیق دهید؛ این کنترل AABB با تلرانس نیم متر و نه کنترل هندسی پروانه است.",
      );
  }
  const outputs = availableOutputs(brief)
    .filter((o) => brief.outputs.includes(o.id))
    .map((o) => ({
      ...o,
      ready: outputItems(doc, o.trade, o.id).length > 0,
      levels: [...new Set(outputItems(doc, o.trade, o.id).map((i) => i.level))].sort((a, b) => a - b),
    }));
  for (const output of outputs.filter((o) => o.formats.some((f) => f === "pdf" || f === "dxf")))
    for (let level = 0; level < doc.levels; level++)
      if (!output.levels.includes(level))
        add(
          `omitted-${output.id}-${level}`,
          4,
          "missing",
          `${output.label} در طبقهٔ ${level + 1} مدلِ قابل نمایش ندارد و فایل این طبقه در بسته نخواهد بود.`,
          "اشیای همین رشته و وضعیت لایه‌ها را کنترل کنید؛ خروجی سایر طبقات به معنی کامل‌بودن این طبقه نیست.",
        );
  for (const output of outputs)
    if (!output.ready)
      add(
        `output-${output.id}`,
        4,
        "missing",
        `${output.label}: مدل مرتبط موجود نیست.`,
        "رشتهٔ مربوط را طراحی کنید؛ فایل خالی به عنوان خروجی کامل تحویل نمی‌شود.",
      );
  add(
    "engineering",
    4,
    "review",
    "محاسبات اجرایی، هماهنگی رشته‌ها و انطباق جامع ضوابط تأیید نشده‌اند.",
    "کنترل صلاحیت‌دار و موتور محاسبات اجرایی برای پروژه لازم است؛ پرکردن فرم یا ثبت نام مرجع این مانع را رفع نمی‌کند.",
  );
  const fields = activeFields(brief),
    completed = fields.filter(
      (f) => brief.values[f.key] !== null && brief.values[f.key] !== undefined && String(brief.values[f.key]).trim() !== "",
    ).length;
  return {
    findings,
    outputs,
    information: { completed, total: fields.length },
    executionReady: false as const,
    permitReady: false as const,
    canDownloadReview: outputs.length > 0 && outputs.every((o) => o.ready),
    basis: "کنترل سازگاری اولیه بر پایهٔ دادهٔ کاربر؛ نه تأیید آیین‌نامه‌ای",
  };
}
