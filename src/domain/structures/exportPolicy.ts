import { familyOf } from "./catalog";
/** سیاست مشترک UI و خروجی سرور؛ مانع نسبت‌دادن برگهٔ ساختمانی به خانوادهٔ دیگر. */
export function structuralExportError(familyId: unknown, format: string): string | null {
  const family = familyOf(familyId);
  if (family && !family.building && format !== "json")
    return "خروجی ساختمانی برای این خانواده فعال نیست؛ از گزارش مسیر تخصصی استفاده کنید.";
  if (family && family.id !== "concrete" && (format.startsWith("details") || format.startsWith("slab-rebar")))
    return "جزئیات بتن‌آرمه را نمی‌توان به این سیستم سازه نسبت داد؛ طراحی اختصاصی لازم است.";
  return null;
}
