const IFC_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

/** شناسهٔ IfcGloballyUniqueId پایدار و قطعی بر اساس یک رشتهٔ معنی‌دار. */
export function ifcGuid(seed: string): string {
  let h1 = 2166136261;
  let h2 = 2246822519;
  let h3 = 3266489917;
  let h4 = 668265263;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + 7), 2246822519) >>> 0;
    h3 = Math.imul(h3 ^ (c + 13), 3266489917) >>> 0;
    h4 = Math.imul(h4 ^ (c + 23), 668265263) >>> 0;
  }
  const words = [h1, h2, h3, h4];
  const bits: number[] = [0, 0, 0, 0];
  for (const w of words) for (let b = 31; b >= 0; b--) bits.push((w >>> b) & 1);
  let out = "";
  for (let i = 0; i < 22; i++) {
    let value = 0;
    for (let b = 0; b < 6; b++) value = (value << 1) | (bits[i * 6 + b] ?? 0);
    out += IFC_CHARS[value % 64];
  }
  return out;
}

/** رشتهٔ STEP با حفظ فارسی و خنثی‌سازی نقل‌قول/بک‌اسلش. */
export function stepText(value: string): string {
  let text = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    if (char === "'") text += "''";
    else if (char === "\\") text += "\\\\";
    else if (code >= 32 && code <= 126) text += char;
    else text += `\\X4\\${code.toString(16).toUpperCase().padStart(8, "0")}\\X0\\`;
  }
  return `'${text}'`;
}
