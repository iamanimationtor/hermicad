"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_REQUIREMENTS } from "@/domain/requirements";
import { Panel } from "@/components/ui";

const RECT_SITE = {
  boundary: [
    { x: 0, y: 0 },
    { x: 25, y: 0 },
    { x: 25, y: 40 },
    { x: 0, y: 40 },
  ],
};

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [raw, setRaw] = useState(DEFAULT_REQUIREMENTS.rawText);
  const [preset, setPreset] = useState<"irregular" | "rect">("irregular");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string[]>([]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDetail([]);
    try {
      const body: Record<string, unknown> = {
        name,
        client: client || null,
        description: description || null,
        rawRequirements: raw,
      };
      if (preset === "rect") {
        body.site = {
          boundary: RECT_SITE.boundary,
          northAngleDeg: 0,
          geoAnchor: null,
          spotLevels: [],
          setbacks: { north: 4, east: 3, south: 3, west: 3 },
          noBuildZones: [],
          soilBearingKPa: 0,
          seismicZone: null,
          climate: "moderate",
          notes: ["زمین مستطیل نمونه ۲۵×۴۰ متر؛ داده‌های خاک و لرزه‌ای باید برای پروژه وارد و بررسی شوند."],
        };
      }
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { project?: { id: string }; error?: string; detail?: string[] };
      if (!response.ok || !payload.project) {
        setError(payload.error ?? "ایجاد پروژه ناموفق بود.");
        setDetail(payload.detail ?? []);
        return;
      }
      router.push(`/projects/${payload.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای شبکه");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="پروژه جدید" subtitle="زمین و نیازمندی در نسخه اول ثبت می‌شوند؛ تولید طرح در کارگاه انجام می‌شود.">
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="project-name">نام پروژه *</label>
          <input id="project-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: مجتمع مسکونی نیلوفر" required minLength={3} />
        </div>
        <div>
          <label className="label" htmlFor="project-client">کارفرما</label>
          <input id="project-client" className="field" value={client} onChange={(e) => setClient(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="project-description">توضیح</label>
          <textarea id="project-description" className="field h-16 resize-none" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <span className="label">هندسهٔ نمونهٔ زمین (نیازمند اصلاح)</span>
          <p className="mb-2 text-[10px] leading-5 text-amber-200">این هندسه و سایر جزئیات نمونه‌اند؛ ظرفیت خاک و پهنهٔ لرزه‌ای تا ثبت دادهٔ واقعی نامشخص می‌مانند.</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPreset("irregular")} className={`btn flex-1 text-[11px] ${preset === "irregular" ? "border-teal-400/60 text-teal-200" : ""}`}>
              نامنظم شش‌ضلعی (۸۶۸ m²)
            </button>
            <button type="button" onClick={() => setPreset("rect")} className={`btn flex-1 text-[11px] ${preset === "rect" ? "border-teal-400/60 text-teal-200" : ""}`}>
              مستطیل ۲۵×۴۰
            </button>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="project-requirements">نیازمندی (متن آزاد — پارس قطعی می‌شود)</label>
          <textarea id="project-requirements" className="field h-24 resize-none text-[11px]" value={raw} onChange={(e) => setRaw(e.target.value)} />
        </div>
        {error && (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
            {error}
            {detail.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-[10px]">
                {detail.map((d) => <li key={d}>{d}</li>)}
              </ul>
            )}
          </div>
        )}
        <button type="submit" className="btn btn-primary w-full" disabled={busy || name.trim().length < 3}>
          {busy ? "در حال ثبت…" : "ثبت پروژه و ورود به کارگاه"}
        </button>
      </form>
    </Panel>
  );
}
