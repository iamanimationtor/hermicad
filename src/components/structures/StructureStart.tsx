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
      <fieldset disabled={busy}>
        <legend className="mb-4 text-lg font-bold">۱. خانوادهٔ سازه را انتخاب کنید</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {FAMILIES.map((f) => (
            <label key={f.id} className={`panel cursor-pointer p-4 ${family === f.id ? "border-teal-300/60 bg-teal-400/5" : ""}`}>
              <span className="flex gap-3 font-bold">
                <input type="radio" name="family" value={f.id} checked={family === f.id} onChange={() => setFamily(f.id)} />
                {f.name}
              </span>
              <span className="mt-2 block text-xs leading-6 text-slate-400">{f.scope}</span>
              {FRAME_FAMILIES.some((id) => id === f.id) && (
                <span className="mt-2 block text-xs text-teal-200">امکان ساخت مدل اختیاری قاب دوبعدی با بارها و ترکیب‌های مستقل</span>
              )}
              <span className="mt-2 block text-xs text-amber-200">
                {f.calculator === "none"
                  ? "ثبت دامنه و مدارک؛ حل‌گر اختصاصی موجود نیست"
                  : "ثبت دامنه + محاسبهٔ محدود اولیه؛ نه طراحی اجرایی"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        ۲. نام پروژه
        <input
          required
          maxLength={150}
          className="field mt-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام قابل تشخیص برای این سازه"
        />
      </label>
      <button disabled={busy || !name.trim()} className="btn btn-primary">
        {busy ? "در حال ایجاد…" : "ایجاد پروندهٔ تخصصی"}
      </button>
      {error && (
        <p role="alert" className="text-rose-200">
          {error}
        </p>
      )}
    </form>
  );
}
