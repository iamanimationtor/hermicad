/** پارامترهای ارتفاعی؛ منبع مشترک نما، جدول و IFC. واحد: متر. */
import { CATALOG_BY_ID } from "./catalog";
import type { StudioDocument, StudioItem } from "./document";
export const DEFAULT_FLOOR_HEIGHT = 3.2;
export const OPENING_HEIGHTS: Record<string, { sill: number; height: number }> = {
  "door-single": { sill: 0, height: 2.1 },
  "door-double": { sill: 0, height: 2.1 },
  "door-garage": { sill: 0, height: 2.4 },
  window: { sill: 0.9, height: 1.3 },
};
export const floorHeight = (doc: StudioDocument): number => doc.floorHeightM ?? DEFAULT_FLOOR_HEIGHT;
export function isOpening(item: StudioItem): boolean {
  return ["IfcDoor", "IfcWindow"].includes(CATALOG_BY_ID[item.catalogId]?.ifcClass);
}
export function itemVertical(item: StudioItem, doc?: StudioDocument): { height: number; sill: number } {
  const definition = CATALOG_BY_ID[item.catalogId];
  const opening = isOpening(item);
  const spec = OPENING_HEIGHTS[item.catalogId];
  const inherited =
    !opening && (definition?.layer === "walls" || item.catalogId.startsWith("column") || definition?.ifcClass === "IfcSpace")
      ? doc?.floorHeightM
      : undefined;
  return {
    height: item.heightM ?? spec?.height ?? inherited ?? definition?.defaultSize.h ?? 0.1,
    sill: opening ? (item.sillM ?? spec?.sill ?? (definition?.ifcClass === "IfcWindow" ? 0.9 : 0)) : 0,
  };
}
export function parameterErrors(doc: StudioDocument): string[] {
  const errors: string[] = [];
  if (doc.floorHeightM !== undefined && (!Number.isFinite(doc.floorHeightM) || doc.floorHeightM < 2 || doc.floorHeightM > 12))
    errors.push("ارتفاع طبقه باید بین ۲ و ۱۲ متر باشد.");
  for (const item of doc.items) {
    if (item.heightM !== undefined && (!Number.isFinite(item.heightM) || item.heightM < 0.05 || item.heightM > 30))
      errors.push(`ارتفاع شیء ${item.id} باید بین ۰٫۰۵ و ۳۰ متر باشد.`);
    if (item.sillM !== undefined && (!Number.isFinite(item.sillM) || item.sillM < 0 || item.sillM > 12 || !isOpening(item)))
      errors.push(`کف‌نشیمن ${item.id} معتبر نیست؛ فقط برای بازشو بین صفر و ۱۲ متر.`);
    if (isOpening(item)) {
      const v = itemVertical(item, doc);
      if (v.sill + v.height > floorHeight(doc) + 0.001) errors.push(`تاج بازشوی ${item.id} از ارتفاع طبقه بالاتر است.`);
    }
  }
  return errors;
}
