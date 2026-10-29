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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white">پروندهٔ تازه</h2>
          <p className="mt-1 text-sm leading-7 text-slate-400">
            یک نام بدهید و بگویید از کجا شروع می‌کنیم. بقیهٔ گام‌ها را سیستم یکی‌یکی می‌پرسد.
          </p>
        </div>
        <span className="chip border-teal-400/30 bg-teal-400/10 text-teal-100">گام ۱ از چند گام</span>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="journey-name">
            نام پروژه
          </label>
          <input
            id="journey-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={150}
            placeholder="مثلاً ساختمان نیلوفر"
            autoComplete="off"
          />
        </div>
        <div>
          <label className="label" htmlFor="journey-template">
            نقطهٔ شروع
          </label>
          <select
            id="journey-template"
            className="field"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="empty">سند خالی، بدون فرض هندسی</option>
            <option value="sample">نمونهٔ مسکونی ۱۲×۱۰</option>
            <option value="office">الگوی اداری ۱۸×۱۲</option>
            <option value="school">الگوی آموزشی ۱۸×۱۲</option>
            <option value="clinic">الگوی سرپایی ۱۸×۱۲</option>
          </select>
        </div>
      </div>

      <p className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs leading-6 text-slate-400">
        نمونه‌ها برای آشنایی و شروع ویرایش‌اند و خودکار با زمین و برنامهٔ شما تطبیق نمی‌یابند. برای پروژهٔ واقعی،
        «سند خالی» را انتخاب کنید.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary btn-lg">
          {busy ? "در حال ساخت…" : "شروع مسیر"}
        </button>
        <span className="text-xs text-slate-500">رایگان · بدون ثبت‌نام · ذخیره روی فضای کار شما</span>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-100">
          {error}
        </p>
      )}
    </form>
  );
}
