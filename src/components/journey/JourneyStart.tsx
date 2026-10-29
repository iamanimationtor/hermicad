"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function JourneyStart() {
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("empty");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      className="panel space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await fetch("/api/designs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, template }),
          });
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          router.push(`/guide/${b.design.id}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "ساخت سند ناموفق بود.");
          setBusy(false);
        }
      }}
    >
      <h2 className="font-bold">شروع پروندهٔ جدید</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label>
          نام پروژه
          <input
            className="field mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={150}
            placeholder="مثلاً ساختمان نیلوفر"
          />
        </label>
        <label>
          از کجا شروع کنیم؟
          <select aria-label="از کجا شروع کنیم؟" className="field mt-2" value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="empty">سند خالی؛ بدون فرض هندسی</option>
            <option value="sample">نمونهٔ مسکونی ۱۲×۱۰</option>
            <option value="office">الگوی اداری ۱۸×۱۲</option>
            <option value="school">الگوی آموزشی ۱۸×۱۲</option>
            <option value="clinic">الگوی سرپایی ۱۸×۱۲</option>
          </select>
        </label>
      </div>
      <p className="text-xs leading-6 text-slate-400">
        نمونه‌ها برای آشنایی و شروع ویرایش‌اند؛ با زمین و برنامهٔ شما خودکار تطبیق نمی‌یابند. برای پروژه‌های دیگر سند خالی انتخاب کنید.
      </p>
      <button disabled={busy || !name.trim()} className="btn btn-primary">
        {busy ? "در حال ساخت…" : "شروع مسیر راهنما"}
      </button>
      {error && (
        <p role="alert" className="text-rose-200">
          {error}
        </p>
      )}
    </form>
  );
}
