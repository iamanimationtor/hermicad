"use client";
import { FRAME_FAMILIES } from "@/domain/structures/frame/model";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FAMILIES, type Family } from "@/domain/structures/catalog";
export function StructureStart() {
  const [family, setFamily] = useState<Family>("concrete");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <form
      className="space-y-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const r = await fetch("/api/designs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, kind: "structure", structureFamily: family, template: "empty" }),
          });
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          router.push(`/structures/${family}/${b.design.id}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "ساخت پرونده ناموفق بود.");
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy} className="space-y-6">
        <legend className="sr-only">خانوادهٔ سازه</legend>

        <div>
          <h2 className="text-base font-bold text-white">۱. خانوادهٔ سازه را انتخاب کنید</h2>
          <p className="mt-1 text-sm leading-7 text-slate-400">
            انتخاب خانواده، دامنهٔ پرسش‌ها و ارزیابی‌های بعدی را تعیین می‌کند.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {FAMILIES.map((f) => {
            const active = family === f.id;
            const hasFrame = FRAME_FAMILIES.some((id) => id === f.id);
            return (
              <label
                key={f.id}
                className={`relative cursor-pointer rounded-2xl border p-5 transition-colors ${
                  active
                    ? "border-teal-400/55 bg-teal-400/[0.07]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                <input
                  type="radio"
                  name="family"
                  value={f.id}
                  checked={active}
                  onChange={() => setFamily(f.id)}
                  className="sr-only"
                />
                <span className="flex items-start justify-between gap-3">
                  <span className="text-sm font-bold text-white">{f.name}</span>
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                      active ? "border-teal-400 bg-teal-400 text-[#03211a]" : "border-white/25"
                    }`}
                  >
                    {active && (
                      <svg width="11" height="11" viewBox="0 0 16 16">
                        <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </span>
                <span className="mt-2 block text-sm leading-7 text-slate-400">{f.scope}</span>
                <span className="mt-3 flex flex-wrap gap-1.5">
                  <span className={`chip ${f.calculator === "none" ? "border-slate-500/25 bg-slate-500/10 text-slate-300" : "border-teal-400/25 bg-teal-400/10 text-teal-100"}`}>
                    {f.calculator === "none" ? "ثبت دامنه و مدارک، بدون حل‌گر اختصاصی" : "محاسبهٔ محدود اولیه"}
                  </span>
                  {hasFrame && <span className="chip">قاب دوبعدی اختیاری</span>}
                </span>
              </label>
            );
          })}
        </div>

        <div className="max-w-xl">
          <label className="label" htmlFor="structure-name">
            ۲. نام این پرونده
          </label>
          <input
            id="structure-name"
            required
            maxLength={150}
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="نامی که بعداً راحت پیدا شود"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !name.trim()} className="btn btn-primary btn-lg">
            {busy ? "در حال ایجاد…" : "ایجاد پروندهٔ تخصصی"}
          </button>
          <span className="text-xs text-slate-500">خروجی اجرایی تأییدشده صادر نمی‌شود.</span>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-100">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}
