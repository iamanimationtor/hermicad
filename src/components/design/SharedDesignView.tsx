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
    <main className="p-5">
      <h1 className="text-xl font-bold">بازبینی فقط‌خواندنی نقشه</h1>
      <p className="my-3 text-sm text-amber-100">
        این نسخهٔ ثابتِ اشتراک‌گذاری‌شده است؛ تغییرات بعدی مالک در آن وارد نمی‌شود. خروجی نیازمند کنترل مهندس دارای صلاحیت است.
      </p>
      {error && (
        <p role="alert" className="text-rose-200">
          {error}
        </p>
      )}
      {url && (
        <>
          <div className="my-3 flex items-center gap-2">
            <button className="btn" onClick={download}>
              دریافت PDF بازبینی
            </button>
            <label>
              بزرگ‌نمایی{" "}
              <input
                aria-label="بزرگ‌نمایی بازبینی"
                type="range"
                min={50}
                max={200}
                step={10}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
              />
            </label>
            <span>{zoom}٪</span>
          </div>
          <div className="overflow-auto bg-white p-2" style={{ maxHeight: "80vh" }}>
            {/* SVG به‌صورت تصویرِ غیرقابل اجرای اسکریپت نمایش داده می‌شود. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="نقشهٔ اشتراک‌گذاری‌شده، فقط برای بازبینی" style={{ width: `${zoom}%`, maxWidth: "none" }} />
          </div>
        </>
      )}
    </main>
  );
}
