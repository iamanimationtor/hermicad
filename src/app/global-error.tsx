"use client";

/**
 * مرز خطای ریشه.
 *
 * چرا لازم است: error.tsx خطاهای زیرمجموعه را می‌گیرد، ولی اگر خودِ RootLayout
 * (یا خواندن CSS/فونت آن) بشکند، Next به این مرز می‌رسد. این فایل باید مستقل
 * باشد و <html>/<body> خودش را بسازد؛ به همین دلیل استایل‌ها با کلاس‌های حداقلی
 * و رنگ‌های درون‌خطی نوشته شده‌اند تا به globals.css وابسته نباشد.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fa" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#05080f",
          color: "#e2e8f0",
          fontFamily: "Vazirmatn, Tahoma, system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "560px", width: "100%" }}>
          <div
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "14px",
              padding: "28px",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                fontSize: "11px",
                padding: "3px 10px",
                borderRadius: "999px",
                border: "1px solid rgba(251,113,133,0.4)",
                background: "rgba(244,63,94,0.12)",
                color: "#fecdd3",
              }}
            >
              خطای بارگذاری
            </span>

            <h1 style={{ margin: "16px 0 0", fontSize: "20px", fontWeight: 800 }}>سامانه بارگذاری نشد</h1>
            <p style={{ margin: "12px 0 0", fontSize: "13px", lineHeight: 2, color: "#cbd5e1" }}>
              خطایی در آماده‌سازی صفحهٔ اصلی رخ داد. داده‌های ذخیره‌شده در پایگاه تغییری نکرده‌اند. یک‌بار دیگر تلاش
              کنید؛ اگر خطا ادامه داشت مرجع پیگیری را به پشتیبانی بدهید.
            </p>

            {error.digest && (
              <p
                style={{
                  margin: "14px 0 0",
                  fontSize: "11px",
                  fontFamily: "monospace",
                  color: "#94a3b8",
                  direction: "ltr",
                  textAlign: "left",
                }}
              >
                ref: {error.digest.slice(0, 16)}
              </p>
            )}

            <div style={{ marginTop: "20px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={reset}
                style={{
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 700,
                  padding: "9px 18px",
                  borderRadius: "10px",
                  border: "1px solid rgba(45,212,191,0.5)",
                  background: "rgba(45,212,191,0.18)",
                  color: "#99f6e4",
                  fontFamily: "inherit",
                }}
              >
                تلاش دوباره
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                  عمداً <a> و نه <Link>: این مرز وقتی فعال می‌شود که ریشهٔ درخت
                  (layout) شکسته است؛ در چنین حالتی بارگذاری کامل صفحه از سرور
                  مطمئن‌تر از ناوبری سمت کلاینت است. */}
              <a
                href="/"
                style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  padding: "9px 18px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#e2e8f0",
                  textDecoration: "none",
                }}
              >
                صفحهٔ اصلی
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
