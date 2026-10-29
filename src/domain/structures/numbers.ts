/** عدد فارسی/عربی به عدد متناهی؛ ورودی ناقص/بدگروه‌بندی‌شده را بی‌صدا تغییر نمی‌دهیم. */
export function structuralNumber(raw: string): number | string | null {
  if (!raw.trim()) return null;
  let normalized = raw
    .trim()
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/٫/g, ".")
    .replace(/−/g, "-");
  if (normalized.includes("٬")) {
    if (!/^[+-]?\d{1,3}(٬\d{3})+(\.\d*)?$/.test(normalized)) return raw;
    normalized = normalized.replace(/٬/g, "");
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) return raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : raw;
}
