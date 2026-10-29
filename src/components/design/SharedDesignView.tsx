"use client";
import { useEffect, useState } from "react";
export function SharedDesignView() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  useEffect(() => {
    const controller = new AbortController();
    let url = "";
    fetch("/api/shares/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: window.location.hash.slice(1) }),
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error);
        const blob = await r.blob();
        if (!controller.signal.aborted) {
          url = URL.createObjectURL(blob);
          setUrl(url);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message ?? "نمایش نقشه ناموفق بود.");
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, []);
  const download = async () => {
    try {
      const r = await fetch("/api/shares/view", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: window.location.hash.slice(1), format: "pdf" }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      const href = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = "hermicad-review.pdf";
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "دریافت ناموفق بود.");
    }
  };
  return (
    <main className="shell py-8 sm:py-12">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-6">
        <div>
          <span className="eyebrow">نسخهٔ ثابت · فقط‌خواندنی</span>
          <h1 className="mt-3 text-[clamp(1.4rem,3vw,2rem)] font-extrabold leading-snug text-white">
            بازبینی نقشه
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">
            این نسخه همان لحظهٔ اشتراک‌گذاری است؛ تغییرات بعدی مالک در آن وارد نمی‌شود.
          </p>
        </div>
        {url && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2">
              <label htmlFor="share-zoom" className="text-xs text-slate-400">
                بزرگ‌نمایی
              </label>
              <input
                id="share-zoom"
                type="range"
                min={50}
                max={200}
                step={10}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-28"
              />
              <span className="mono w-10 text-xs text-slate-300">{zoom}٪</span>
            </div>
            <button type="button" className="btn btn-primary" onClick={download}>
              دریافت PDF بازبینی
            </button>
          </div>
        )}
      </header>

      <div role="note" className="callout callout-warn mt-6">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mt-1 shrink-0">
          <path d="M8 2.5 14 13H2L8 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M8 6.5v3M8 11.4v.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        <span>خروجی نیازمند کنترل مهندس دارای صلاحیت است و به‌تنهایی مجوز اجرا نیست.</span>
      </div>

      {error && (
        <div role="alert" className="callout callout-danger mt-4">
          <span>{error}</span>
        </div>
      )}

      {!url && !error && (
        <div className="mt-6">
          <div className="skeleton h-[60vh] w-full" aria-hidden="true" />
          <p className="mt-3 text-center text-sm text-slate-400" role="status">
            در حال دریافت نقشه از سرور…
          </p>
        </div>
      )}

      {url && (
        <div className="mt-6 overflow-auto rounded-2xl border border-white/10 bg-white p-2 shadow-2xl shadow-black/50" style={{ maxHeight: "78vh" }}>
          {/* SVG به‌صورت تصویرِ غیرقابل اجرای اسکریپت نمایش داده می‌شود. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="نقشهٔ اشتراک‌گذاری‌شده، فقط برای بازبینی"
            className="mx-auto block"
            style={{ width: `${zoom}%`, maxWidth: "none" }}
          />
        </div>
      )}
    </main>
  );
}
