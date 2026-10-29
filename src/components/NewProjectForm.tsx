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

type Preset = "irregular" | "rect";

const PRESETS: { id: Preset; label: string; hint: string }[] = [
  { id: "irregular", label: "شش‌ضلعی نامنظم", hint: "۸۶۸ m²" },
  { id: "rect", label: "مستطیل", hint: "۲۵×۴۰" },
];

export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [raw, setRaw] = useState(DEFAULT_REQUIREMENTS.rawText);
  const [preset, setPreset] = useState<Preset>("irregular");
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
      setError(e instanceof Error ? e.message : "ارتباط با سرور برقرار نشد.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="پروژهٔ تازه" subtitle="زمین و نیازمندی همین‌جا ثبت می‌شوند؛ تولید طرح در کارگاه انجام می‌شود.">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="project-name">
            نام پروژه <span className="text-teal-300">*</span>
          </label>
          <input
            id="project-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: مجتمع مسکونی نیلوفر"
            required
            minLength={3}
            autoComplete="off"
          />
        </div>

        <div>
          <label className="label" htmlFor="project-client">
            کارفرما <span className="font-normal text-slate-500">(اختیاری)</span>
          </label>
          <input id="project-client" className="field" value={client} onChange={(e) => setClient(e.target.value)} autoComplete="off" />
        </div>

        <div>
          <label className="label" htmlFor="project-description">
            توضیح کوتاه <span className="font-normal text-slate-500">(اختیاری)</span>
          </label>
          <textarea
            id="project-description"
            className="field"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="موقعیت، نوع بهره‌برداری، نکتهٔ مهم پروژه…"
          />
        </div>

        <fieldset>
          <legend className="label">هندسهٔ نمونهٔ زمین</legend>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="انتخاب هندسهٔ زمین">
            {PRESETS.map((item) => {
              const active = preset === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPreset(item.id)}
                  className={`rounded-xl border px-3 py-2.5 text-start transition-colors ${
                    active
                      ? "border-teal-400/60 bg-teal-400/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20 hover:text-white"
                  }`}
                >
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="mono mt-0.5 block text-xs text-slate-400">{item.hint}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-6 text-amber-200/80">
            این هندسه نمونهٔ کار است؛ ظرفیت خاک و پهنهٔ لرزه‌ای تا ثبت دادهٔ واقعی «نامشخص» می‌مانند.
          </p>
        </fieldset>

        <div>
          <label className="label" htmlFor="project-requirements">
            نیازمندی به زبان خودتان
          </label>
          <textarea
            id="project-requirements"
            className="field"
            rows={4}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <p className="mt-1.5 text-xs leading-6 text-slate-500">
            متن آزاد است؛ موتور پارامترها را استخراج می‌کند و پیش از تولید برای تأیید شما نشان می‌دهد.
          </p>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3.5 py-3 text-sm leading-6 text-rose-100">
            {error}
            {detail.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-rose-200/90">
                {detail.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={busy || name.trim().length < 3}>
          {busy ? "در حال ثبت…" : "ثبت پروژه و ورود به کارگاه"}
        </button>
      </form>
    </Panel>
  );
}
