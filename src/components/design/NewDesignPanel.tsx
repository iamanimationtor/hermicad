"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const KINDS = [
  { id: "architecture", label: "معماری" },
  { id: "structure", label: "سازه" },
  { id: "mep", label: "تأسیسات" },
  { id: "site", label: "محوطه" },
] as const;

export function NewDesignPanel() {
  const router = useRouter();
  const [name, setName] = useState("سند طراحی جدید");
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("architecture");
  const [format, setFormat] = useState("A3");
  const [scale, setScale] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async (template: "empty" | "sample") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: template === "sample" ? "نمونهٔ آپارتمان سه‌خوابه" : name,
          kind,
          template,
          sheet: { format, orientation: "landscape", scale },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "ساخت سند ناموفق بود");
      router.push(`/design/${payload.design.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel p-4">
      <h2 className="text-sm font-bold text-slate-100">سند طراحی جدید</h2>
      <p className="mt-1 text-[11px] leading-5 text-slate-400">بدون ثبت‌نام. سند روی سرور ذخیره می‌شود و لینک آن قابل اشتراک است.</p>
      <label className="mt-3 block">
        <span className="label">نام سند</span>
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">نوع</span>
          <select className="field" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
            {KINDS.map((entry) => (
              <option key={entry.id} value={entry.id}>{entry.label}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">برگه</span>
          <select className="field" value={format} onChange={(event) => setFormat(event.target.value)}>
            {["A4", "A3", "A2", "A1", "A0"].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">مقیاس</span>
          <select className="field" value={scale} onChange={(event) => setScale(Number(event.target.value))}>
            {[20, 25, 50, 75, 100, 200].map((value) => (
              <option key={value} value={value}>{`1:${value}`}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" disabled={busy} onClick={() => create("empty")} className="btn w-full justify-center px-2 py-2">
            {busy ? "…" : "سند خالی"}
          </button>
        </div>
      </div>
      <button type="button" disabled={busy} onClick={() => create("sample")} className="btn btn-primary mt-2 w-full justify-center px-2 py-2">
        نمونهٔ آماده (آپارتمان ۱۲×۱۰ با مبلمان کامل)
      </button>
      {error && <p className="mt-2 text-[11px] text-rose-300">{error}</p>}
    </section>
  );
}
