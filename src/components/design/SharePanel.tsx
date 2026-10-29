"use client";
import { useState } from "react";
type Share = { id: string; expiresAt: string; createdAt: string };
export function SharePanel({ designId }: { designId: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [link, setLink] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = async () => {
    const r = await fetch(`/api/designs/${designId}/shares`);
    const body = await r.json();
    if (!r.ok) throw new Error(body.error);
    setShares(body.shares);
  };
  const act = async (action: "create" | "load" | "revoke", id?: string) => {
    setBusy(true);
    setMessage("");
    try {
      if (action !== "load") {
        const r = await fetch(`/api/designs/${designId}/shares`, {
          method: action === "create" ? "POST" : "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action === "create" ? { days } : { shareId: id }),
        });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error);
        if (action === "create") {
          setLink(window.location.origin + body.path);
          setMessage(`لینک نسخهٔ ذخیره‌شدهٔ ${body.revision} ساخته شد؛ فقط اکنون قابل کپی است.`);
        } else {
          setLink("");
          setMessage("لینک لغو شد.");
        }
      }
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "خطای ارتباط");
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="mt-4 text-xs">
      <summary className="cursor-pointer font-bold text-teal-200">اشتراک‌گذاری فقط‌خواندنی</summary>
      <p className="my-2 leading-6 text-amber-100">
        لینک، نمای پلانِ آخرین نسخهٔ ذخیره‌شده را نشان می‌دهد، نه تغییرات ذخیره‌نشده. دارندهٔ لینک می‌تواند نقشه و PDF را ببیند و نگه دارد؛
        ویرایش ممکن نیست. لغو لینک، فایل قبلاً دریافت‌شده را پاک نمی‌کند.
      </p>
      <label>
        اعتبار لینک
        <select aria-label="اعتبار لینک" className="field" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[1, 7, 30].map((d) => (
            <option key={d} value={d}>
              {d} روز
            </option>
          ))}
        </select>
      </label>
      <div className="my-2 flex gap-2">
        <button className="btn" disabled={busy} onClick={() => act("create")}>
          ساخت لینک بازبینی
        </button>
        <button className="btn" disabled={busy} onClick={() => act("load")}>
          فهرست لینک‌ها
        </button>
      </div>
      {link && (
        <label>
          لینک خصوصی بازبینی
          <input
            aria-label="لینک خصوصی بازبینی"
            className="field"
            dir="ltr"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
      {shares.map((s) => (
        <div key={s.id} className="my-2 flex justify-between gap-1">
          <span>تا {new Date(s.expiresAt).toLocaleDateString("fa-IR")}</span>
          <button className="btn" disabled={busy} onClick={() => act("revoke", s.id)}>
            لغو لینک
          </button>
        </div>
      ))}
      {message && (
        <p role="status" className="leading-6 text-amber-200">
          {message}
        </p>
      )}
    </details>
  );
}
