/**
 * HERMICAD — «فضای کار» هر بازدیدکننده (بدون ثبت‌نام)
 *
 * چرا وجود دارد: HERMICAD یک ابزار عمومی و رایگان است. اگر همهٔ اسناد در یک
 * فضای مشترک ذخیره شوند، هر بازدیدکننده اسناد دیگران را می‌بیند و می‌تواند
 * پاکشان کند. احراز هویت کامل (ثبت‌نام/رمز) برای شروع کار لازم نیست؛ یک
 * شناسهٔ تصادفی در کوکیِ HttpOnly به هر مرورگر می‌دهیم و اسناد به همان شناسه
 * بسته می‌شوند. نتیجه: هر کاربر «کارگاه شخصی» خودش را دارد، بی‌آنکه چیزی از
 * حریم خصوصی بخواهیم.
 *
 * میان‌بُر (middleware) کوکی را می‌سازد و همان مقدار را در هدر
 * `x-hermi-workspace` هم می‌گذارد؛ چون در همان اولین درخواست، کوکی هنوز روی
 * خودِ درخواست نیست و بدون این هدر، کاربر برای یک بار فهرست عمومی را می‌دید.
 */

import { cookies, headers } from "next/headers";

export const WORKSPACE_COOKIE = "hermi_workspace";
export const WORKSPACE_HEADER = "x-hermi-workspace";

/** فضای کار عمومی (نمونه‌ها و اسناد بی‌صاحب) */
export const PUBLIC_WORKSPACE = "public";

/** شناسهٔ معتبر: فقط حروف/رقم/خط تیره و بین ۸ تا ۶۴ نویسه. */
export function isValidWorkspace(value: string | undefined | null): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

/**
 * فضای کار درخواست جاری.
 *
 * ترتیب خواندن: هدر (که میان‌بُر در همان درخواست اول می‌گذارد) → کوکی →
 * فضای عمومی. هیچ‌گاه خطا نمی‌دهد تا خروجی‌های عمومی (مثل برگهٔ نمونه) هم
 * بدون کوکی کار کنند.
 */
export async function currentWorkspace(): Promise<string> {
  try {
    const header = (await headers()).get(WORKSPACE_HEADER);
    if (isValidWorkspace(header)) return header;
  } catch {
    // خارج از چرخهٔ درخواست (آزمون/اسکریپت) — ادامه با کوکی
  }
  try {
    const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
    if (isValidWorkspace(value)) return value;
  } catch {
    // بی‌کوکی
  }
  return PUBLIC_WORKSPACE;
}

/** ساخت شناسهٔ تازه برای بازدیدکنندهٔ جدید. */
export function newWorkspaceId(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `ws_${random.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}`;
}
