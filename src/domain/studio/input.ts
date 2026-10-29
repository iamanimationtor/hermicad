import { briefErrors } from "../journey/model";
/** مرز ورودی شبکه؛ TypeScript جای اعتبارسنجی JSON نامطمئن را نمی‌گیرد. */
import { CATALOG_BY_ID } from "./catalog";
import { CLASSIFICATION_LABELS, type StudioDocument } from "./document";
import { parameterErrors } from "./parameters";
import { SlabInputError, slabConfig } from "./slabConfig";
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const number = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
export function assertStudioDocument(value: unknown): asserts value is StudioDocument {
  const fail = (message: string): never => {
    throw new SlabInputError(message);
  };
  if (!record(value)) fail("سند باید یک شیء JSON باشد.");
  const doc = value as Record<string, unknown>;
  if (doc.version !== 1 || !text(doc.id, 100) || !text(doc.name, 150) || !Array.isArray(doc.items) || doc.items.length > 5000)
    fail("نسخه، شناسه، نام یا تعداد اشیای سند معتبر نیست؛ حداکثر ۵۰۰۰ شیء.");
  if (
    !number(doc.levels, 1, 60) ||
    !Number.isInteger(doc.levels) ||
    !number(doc.currentLevel, 0, (doc.levels as number) - 1) ||
    !Number.isInteger(doc.currentLevel)
  )
    fail("طبقات سند معتبر نیستند؛ تعداد مجاز ۱ تا ۶۰.");
  if (
    !record(doc.sheet) ||
    !["A4", "A3", "A2", "A1", "A0"].includes(String(doc.sheet.format)) ||
    !["portrait", "landscape"].includes(String(doc.sheet.orientation)) ||
    !number(doc.sheet.scale, 10, 1000)
  )
    fail("برگه یا مقیاس سند معتبر نیست.");
  if (
    !record(doc.project) ||
    !["name", "code", "client", "designer", "date", "note"].every((key) => text((doc.project as Record<string, unknown>)[key], 2000))
  )
    fail("مشخصات پروژه باید متن باشد.");
  if (
    !["architecture", "structure", "mep", "site"].includes(String(doc.kind)) ||
    !CLASSIFICATION_LABELS.some((c) => c.id === doc.classification)
  )
    fail("نوع یا رشتهٔ سند معتبر نیست.");
  if (
    !number(doc.grid, 0, 100) ||
    typeof doc.gridVisible !== "boolean" ||
    !record(doc.layers) ||
    !Object.values(doc.layers).every((v) => typeof v === "boolean")
  )
    fail("شبکه یا لایه‌ها معتبر نیستند.");
  if (
    !number(doc.revision, 1, Number.MAX_SAFE_INTEGER - 1) ||
    !Number.isInteger(doc.revision) ||
    ![doc.createdAt, doc.updatedAt].every((v) => text(v, 100) && Number.isFinite(Date.parse(v)))
  )
    fail("نسخه یا تاریخ سند معتبر نیست.");
  const ids = new Set<string>();
  for (const raw of doc.items as unknown[]) {
    if (
      !record(raw) ||
      !text(raw.id, 100) ||
      !raw.id ||
      ids.has(raw.id) ||
      typeof raw.catalogId !== "string" ||
      !Object.hasOwn(CATALOG_BY_ID, raw.catalogId)
    )
      fail("شیء ناشناخته، شناسهٔ تکراری یا شیء نامعتبر در سند وجود دارد.");
    const item = raw as Record<string, unknown>;
    ids.add(item.id as string);
    if (
      !number(item.w, 0.001, 1000) ||
      !number(item.d, 0.001, 1000) ||
      !number(item.x, -100000, 100000) ||
      !number(item.y, -100000, 100000) ||
      !number(item.rotationDeg, -3600000, 3600000) ||
      !number(item.level, 0, (doc.levels as number) - 1) ||
      !Number.isInteger(item.level)
    )
      fail("ابعاد، مختصات یا طبقهٔ شیء معتبر نیست.");
    if (item.label !== undefined && !text(item.label, 500)) fail("برچسب شیء باید حداکثر ۵۰۰ نویسه باشد.");
  }
  const errors = parameterErrors(value as StudioDocument);
  if (errors.length) fail(errors[0]);
  if (doc.brief !== undefined) {
    const errors = briefErrors(doc.brief);
    if (errors.length) fail(errors[0]);
  }
  if (doc.slabRebar !== undefined) slabConfig(doc.slabRebar);
}
