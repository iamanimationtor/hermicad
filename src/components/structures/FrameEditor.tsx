"use client";
import { useId, useMemo, useState } from "react";
import {
  emptyFrame,
  frameInputErrors,
  SUPPORTS,
  FRAME_LIMITS,
  FRAME_RANGES,
  type FrameModel,
  type FrameNode,
  type FrameMember,
  type LoadCase,
} from "@/domain/structures/frame/model";
import { FRAME_ASSUMPTIONS, type FrameResult } from "@/domain/structures/frame/solver";
import { frameTemplate } from "@/domain/structures/frame/templates";
import { frameSvg, type FrameView } from "@/domain/structures/frame/drawing";
import { structuralNumber } from "@/domain/structures/numbers";
const uid = (prefix: string, rows: { id: string }[]) => {
  let n = 1;
  while (rows.some((r) => r.id === prefix + n)) n++;
  return prefix + n;
};
const fmt = (v: number) => (Math.abs(v) < 1e-10 ? "0" : Number(v.toPrecision(7)).toString());
export function FrameEditor({
  model,
  onChange,
  result,
  readOnly = false,
}: {
  model?: FrameModel;
  onChange: (m: FrameModel | undefined) => void;
  result: FrameResult | null;
  readOnly?: boolean;
}) {
  const [tab, setTab] = useState("nodes"),
    [loadId, setLoadId] = useState(""),
    [templateKey, setTemplateKey] = useState(0);
  if (!model)
    return readOnly ? null : (
      <section className="rounded-xl border border-teal-300/30 p-4">
        <h3 className="font-bold">مدل مشترک تحلیل قاب دوبعدی</h3>
        <p className="my-3 text-xs leading-7">
          برای مدل‌های قابل نمایش با اعضای خطی صفحه‌ای: تعریف گره، عضو، تکیه‌گاه، بار و ترکیب بار. این ابزار جای مدل تخصصی کل سازه، تحلیل
          سه‌بعدی یا طراحی مقاومت را نمی‌گیرد.
        </p>
        <button className="btn" onClick={() => onChange(emptyFrame())} type="button">
          ایجاد مدل تحلیل دوبعدی
        </button>
      </section>
    );
  const patch = (v: Partial<FrameModel>) => onChange({ ...model, ...v, confirmed: v.confirmed ?? false });
  const errors = frameInputErrors(model);
  const updateNode = (id: string, v: Partial<FrameNode>) => patch({ nodes: model.nodes.map((n) => (n.id === id ? { ...n, ...v } : n)) });
  const updateMember = (id: string, v: Partial<FrameMember>) =>
    patch({ members: model.members.map((n) => (n.id === id ? { ...n, ...v } : n)) });
  const removeMember = (id: string) => ({
    ...model,
    confirmed: false,
    members: model.members.filter((m) => m.id !== id),
    cases: model.cases.map((c) => ({ ...c, members: c.members.filter((l) => l.member !== id) })),
  });
  const loadCase = model.cases.find((c) => c.id === loadId) ?? model.cases[0];
  const updateCase = (v: Partial<LoadCase>) => patch({ cases: model.cases.map((c) => (c.id === loadCase.id ? { ...c, ...v } : c)) });
  return (
    <section className="min-w-0 space-y-4 rounded-xl border border-teal-400/30 p-4">
      <h3 className="text-lg font-bold">مدل مشترک قاب دوبعدی</h3>
      <details className="text-xs leading-7">
        <summary className="cursor-pointer font-bold text-amber-100">دامنه، واحدها و قرارداد علامت — پیش از مدل‌سازی بخوانید</summary>
        <ul className="mt-3 list-inside list-disc">
          {FRAME_ASSUMPTIONS.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p>
          تکیه‌گاه مفصلی یعنی دو انتقال بسته و دوران آزاد؛ این انتخاب، مفصل داخلی بین اعضا ایجاد نمی‌کند. بار گستردهٔ منفی qy روی عضو افقیِ
          چپ به راست، رو به پایین است.
        </p>
      </details>
      {!readOnly && (
        <>
          <label className="block text-sm">
            نمونهٔ آغاز مدل
            <select
              aria-label="نمونهٔ آغاز مدل"
              value=""
              className="field mt-2"
              onChange={(e) => {
                const kind = e.target.value as Parameters<typeof frameTemplate>[0];
                if (!kind) return;
                if (model.nodes.length && !confirm("مدل فعلی با نمونهٔ آموزشی جایگزین می‌شود. ادامه؟")) return;
                onChange(frameTemplate(kind));
                setTemplateKey((k) => k + 1);
                setLoadId("");
              }}
            >
              <option value="">انتخاب اختیاری؛ داده‌های نمونه، دادهٔ پروژه نیستند</option>
              <option value="cantilever">طره با بار انتهایی</option>
              <option value="beam">تیر ساده با بار گسترده</option>
              <option value="portal">قاب تک‌دهانه با دو حالت بار</option>
              <option value="pitched">قاب شیبدار آموزشی</option>
            </select>
          </label>
          <label className="block text-sm">
            مبنای مدل و منبع سختی اعضا
            <textarea
              aria-label="مبنای مدل و منبع سختی اعضا"
              className="field mt-2"
              maxLength={2000}
              value={model.basis}
              onChange={(e) => patch({ basis: e.target.value })}
            />
          </label>
          <p className="text-xs leading-6 text-slate-400">
            تغییر داده‌های مدل، بررسی فرض‌ها را بازنشانی می‌کند؛ پس از تکمیل و بازبینی داده‌ها، گزینهٔ زیر را انتخاب کنید.
          </p>
          <label className="flex items-start gap-2 text-xs leading-7">
            <input type="checkbox" className="mt-2" checked={model.confirmed} onChange={(e) => patch({ confirmed: e.target.checked })} />
            فرض‌های مدل صفحه‌ای، صلب‌بودن اتصال‌ها و سختی مؤثر را برای این مدل بررسی کرده‌ام؛ این تأیید، تأیید ایمنی یا ضوابط نیست.
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="بخش‌های مدل تحلیلی">
            {[
              ["nodes", "گره‌ها و تکیه‌گاه‌ها"],
              ["members", "اعضا و سختی"],
              ["loads", "حالت‌های بار"],
              ["combos", "ترکیب‌های بار"],
              ["results", "نتایج تحلیل"],
            ].map(([id, label]) => (
              <button key={id} aria-pressed={tab === id} className={`btn ${tab === id ? "btn-primary" : ""}`} onClick={() => setTab(id)} type="button">
                {label}
              </button>
            ))}
          </div>
          <div key={templateKey} className="space-y-3">
            {tab === "nodes" && (
              <>
                <p className="text-xs leading-6">مختصات برحسب متر؛ گره‌های هم‌مکان با شناسه متفاوت به هم متصل نیستند.</p>
                {model.nodes.map((n) => (
                  <div className="rounded-lg border border-white/10 p-3" key={n.id}>
                    <strong dir="ltr">{n.id}</strong>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Numeric range={FRAME_RANGES.x} label={`${n.id} — X (m)`} value={n.x} change={(x) => updateNode(n.id, { x })} />
                      <Numeric range={FRAME_RANGES.y} label={`${n.id} — Y (m)`} value={n.y} change={(y) => updateNode(n.id, { y })} />
                      <label className="text-xs">
                        تکیه‌گاه {n.id}
                        <select
                          className="field mt-1"
                          value={n.support}
                          onChange={(e) => updateNode(n.id, { support: e.target.value as FrameNode["support"] })}
                        >
                          {Object.entries(SUPPORTS).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      className="mt-2 text-xs text-rose-200"
                      onClick={() => {
                        const removed = new Set(model.members.filter((m) => m.start === n.id || m.end === n.id).map((m) => m.id));
                        patch({
                          nodes: model.nodes.filter((x) => x.id !== n.id),
                          members: model.members.filter((m) => !removed.has(m.id)),
                          cases: model.cases.map((c) => ({
                            ...c,
                            nodes: c.nodes.filter((l) => l.node !== n.id),
                            members: c.members.filter((l) => !removed.has(l.member)),
                          })),
                        });
                      }}
                      type="button"
                    >
                      حذف گره و اعضا/بارهای وابسته
                    </button>
                  </div>
                ))}
                <button
                  className="btn"
                  disabled={model.nodes.length >= FRAME_LIMITS.nodes}
                  onClick={() =>
                    patch({
                      nodes: [
                        ...model.nodes,
                        {
                          id: uid("N", model.nodes),
                          x: model.nodes.length ? Math.max(...model.nodes.map((n) => n.x)) + 2 : 0,
                          y: 0,
                          support: "free",
                        },
                      ],
                    })
                  }
                  type="button"
                >
                  افزودن گره
                </button>
              </>
            )}
            {tab === "members" && (
              <>
                <p className="text-xs leading-6">
                  ابتدا و انتهای عضو جهت محور محلی x را تعیین می‌کنند. E، A و I باید سختی مؤثر مستند باشند؛ ابزار مقطع طراحی نمی‌کند.
                </p>
                {model.members.map((m) => (
                  <div key={m.id} className="rounded-lg border border-white/10 p-3">
                    <strong dir="ltr">{m.id}</strong>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {(["start", "end"] as const).map((k) => (
                        <label key={k} className="text-xs">
                          {k === "start" ? "ابتدای" : "انتهای"} {m.id}
                          <select className="field mt-1" value={m[k]} onChange={(e) => updateMember(m.id, { [k]: e.target.value })}>
                            {model.nodes.map((n) => (
                              <option key={n.id}>{n.id}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                      {(
                        [
                          ["eGPa", "E (GPa)"],
                          ["areaCm2", "A (cm²)"],
                          ["iCm4", "I (cm⁴)"],
                          ["depthM", "ارتفاع مقطع (m)"],
                        ] as const
                      ).map(([k, label]) => (
                        <Numeric
                          key={k}
                          range={FRAME_RANGES[k]}
                          label={`${m.id} — ${label}`}
                          value={m[k]}
                          change={(v) => updateMember(m.id, { [k]: v })}
                        />
                      ))}
                    </div>
                    <button className="mt-2 text-xs text-rose-200" onClick={() => onChange(removeMember(m.id))} type="button">
                      حذف عضو و بارهای آن
                    </button>
                  </div>
                ))}
                <button
                  className="btn"
                  disabled={model.nodes.length < 2 || model.members.length >= FRAME_LIMITS.members}
                  onClick={() =>
                    patch({
                      members: [
                        ...model.members,
                        {
                          id: uid("M", model.members),
                          start: model.nodes[0].id,
                          end: model.nodes[1].id,
                          eGPa: 0,
                          areaCm2: 0,
                          iCm4: 0,
                          depthM: 0,
                        },
                      ],
                    })
                  }
                  type="button"
                >
                  افزودن عضو
                </button>
              </>
            )}
            {tab === "loads" && (
              <>
                <div className="flex flex-wrap gap-2">
                  <select
                    aria-label="حالت بار فعال"
                    className="field"
                    value={loadCase?.id ?? ""}
                    onChange={(e) => setLoadId(e.target.value)}
                  >
                    {model.cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id} — {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    disabled={model.cases.length >= FRAME_LIMITS.cases}
                    onClick={() => {
                      const id = uid("LC", model.cases);
                      patch({ cases: [...model.cases, { id, name: "", source: "", nodes: [], members: [] }] });
                      setLoadId(id);
                    }}
                    type="button"
                  >
                    افزودن حالت بار
                  </button>
                </div>
                {loadCase && (
                  <div key={loadCase.id} className="space-y-3">
                    <label className="block text-xs">
                      نام حالت بار
                      <input
                        className="field mt-1"
                        maxLength={150}
                        value={loadCase.name}
                        onChange={(e) => updateCase({ name: e.target.value })}
                      />
                    </label>
                    <label className="block text-xs">
                      منبع و نحوه محاسبه بار
                      <textarea
                        className="field mt-1"
                        maxLength={2000}
                        value={loadCase.source}
                        onChange={(e) => updateCase({ source: e.target.value })}
                      />
                    </label>
                    <h4 className="font-bold">بار گره‌ای در محور سراسری</h4>
                    {loadCase.nodes.map((l, i) => (
                      <div key={l.node} className="rounded-lg border border-white/10 p-3">
                        <label className="text-xs">
                          گره بار
                          <select
                            className="field mt-1"
                            value={l.node}
                            onChange={(e) =>
                              updateCase({ nodes: loadCase.nodes.map((r, j) => (j === i ? { ...r, node: e.target.value } : r)) })
                            }
                          >
                            {model.nodes.map((n) => (
                              <option key={n.id}>{n.id}</option>
                            ))}
                          </select>
                        </label>
                        <div className="grid gap-2 sm:grid-cols-3">
                          {(["fx", "fy", "mz"] as const).map((k) => (
                            <Numeric
                              key={k}
                              range={FRAME_RANGES[k]}
                              label={`${l.node} ${k} (${k === "mz" ? "kN.m" : "kN"})`}
                              value={l[k]}
                              change={(v) => updateCase({ nodes: loadCase.nodes.map((r, j) => (i === j ? { ...r, [k]: v } : r)) })}
                            />
                          ))}
                        </div>
                        <button
                          className="mt-2 text-xs text-rose-200"
                          onClick={() => updateCase({ nodes: loadCase.nodes.filter((_, j) => i !== j) })}
                          type="button"
                        >
                          حذف بار گره‌ای
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn"
                      disabled={loadCase.nodes.length >= model.nodes.length}
                      onClick={() => {
                        const n = model.nodes.find((n) => !loadCase.nodes.some((l) => l.node === n.id));
                        if (n) updateCase({ nodes: [...loadCase.nodes, { node: n.id, fx: 0, fy: 0, mz: 0 }] });
                      }}
                      type="button"
                    >
                      افزودن بار گره‌ای
                    </button>
                    <h4 className="font-bold">بار گسترده در محور محلی عضو</h4>
                    {loadCase.members.map((l, i) => (
                      <div key={l.member} className="rounded-lg border border-white/10 p-3">
                        <label className="text-xs">
                          عضو بارگذاری‌شده
                          <select
                            className="field mt-1"
                            value={l.member}
                            onChange={(e) =>
                              updateCase({ members: loadCase.members.map((r, j) => (j === i ? { ...r, member: e.target.value } : r)) })
                            }
                          >
                            {model.members.map((m) => (
                              <option key={m.id}>{m.id}</option>
                            ))}
                          </select>
                        </label>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {(["qx", "qy"] as const).map((k) => (
                            <Numeric
                              key={k}
                              range={FRAME_RANGES[k]}
                              label={`${l.member} ${k} (kN/m)`}
                              value={l[k]}
                              change={(v) => updateCase({ members: loadCase.members.map((r, j) => (i === j ? { ...r, [k]: v } : r)) })}
                            />
                          ))}
                        </div>
                        <button
                          className="mt-2 text-xs text-rose-200"
                          onClick={() => updateCase({ members: loadCase.members.filter((_, j) => i !== j) })}
                          type="button"
                        >
                          حذف بار گسترده
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn"
                      disabled={loadCase.members.length >= model.members.length}
                      onClick={() => {
                        const m = model.members.find((m) => !loadCase.members.some((l) => l.member === m.id));
                        if (m) updateCase({ members: [...loadCase.members, { member: m.id, qx: 0, qy: 0 }] });
                      }}
                      type="button"
                    >
                      افزودن بار گسترده
                    </button>
                    <button
                      className="btn text-rose-200"
                      onClick={() => {
                        patch({
                          cases: model.cases.filter((c) => c.id !== loadCase.id),
                          combinations: model.combinations.map((c) => ({
                            ...c,
                            factors: Object.fromEntries(Object.entries(c.factors).filter(([id]) => id !== loadCase.id)),
                          })),
                        });
                        setLoadId("");
                      }}
                      type="button"
                    >
                      حذف حالت و ضرایب وابسته
                    </button>
                  </div>
                )}
              </>
            )}
            {tab === "combos" && (
              <>
                <p className="text-xs leading-7 text-amber-100">
                  هیچ ترکیب آیین‌نامه‌ای به‌طور پیش‌فرض انتخاب نمی‌شود. نام، منبع و ضرایب هر ترکیب را وارد کنید؛ منبع اظهاری تأیید رسمی
                  نمی‌شود.
                </p>
                {model.combinations.map((c) => (
                  <div key={c.id} className="space-y-3 rounded-lg border border-white/10 p-3">
                    <strong>{c.id}</strong>
                    <label className="block text-xs">
                      نام ترکیب
                      <input
                        className="field mt-1"
                        maxLength={150}
                        value={c.name}
                        onChange={(e) =>
                          patch({ combinations: model.combinations.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)) })
                        }
                      />
                    </label>
                    <label className="block text-xs">
                      منبع ضرایب
                      <textarea
                        className="field mt-1"
                        maxLength={2000}
                        value={c.source}
                        onChange={(e) =>
                          patch({ combinations: model.combinations.map((x) => (x.id === c.id ? { ...x, source: e.target.value } : x)) })
                        }
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {model.cases.map((l) => (
                        <Numeric
                          key={l.id}
                          range={FRAME_RANGES.factor}
                          label={`${c.id} — ضریب ${l.id}`}
                          value={Object.hasOwn(c.factors, l.id) ? c.factors[l.id] : 0}
                          change={(v) =>
                            patch({
                              combinations: model.combinations.map((x) =>
                                x.id === c.id ? { ...x, factors: { ...x.factors, [l.id]: v } } : x,
                              ),
                            })
                          }
                        />
                      ))}
                    </div>
                    <button
                      className="text-xs text-rose-200"
                      onClick={() => patch({ combinations: model.combinations.filter((x) => x.id !== c.id) })}
                      type="button"
                    >
                      حذف ترکیب
                    </button>
                  </div>
                ))}
                <button
                  className="btn"
                  disabled={!model.cases.length || model.combinations.length >= FRAME_LIMITS.combinations}
                  onClick={() =>
                    patch({
                      combinations: [...model.combinations, { id: uid("CB", model.combinations), name: "", source: "", factors: {} }],
                    })
                  }
                  type="button"
                >
                  افزودن ترکیب بار
                </button>
              </>
            )}
          </div>
        </>
      )}
      {errors.length > 0 ? (
        <p role="alert" className="text-xs leading-7 text-rose-200">
          {errors.join(" ")}
        </p>
      ) : readOnly || tab === "results" ? (
        <FrameResults model={model} result={result} />
      ) : (
        <FramePlot model={model} />
      )}
    </section>
  );
}
function Numeric({
  label,
  value,
  change,
  range,
}: {
  label: string;
  value: number;
  change: (v: number) => void;
  range: readonly [number, number];
}) {
  const inputId = useId();
  const [raw, setRaw] = useState(Number.isFinite(value) ? String(value) : "");
  return (
    <label className="block text-xs">
      {label}
      <input
        className="field mt-1"
        aria-label={label}
        aria-describedby={inputId}
        aria-invalid={!Number.isFinite(value) || value < range[0] || value > range[1]}
        inputMode="decimal"
        maxLength={60}
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          const n = structuralNumber(e.target.value);
          change(typeof n === "number" ? n : NaN);
        }}
      />
      <span id={inputId} className="mt-1 block text-[10px] leading-5 text-slate-400">
        بازهٔ نرم‌افزار: {range[0].toLocaleString("fa-IR")} تا {range[1].toLocaleString("fa-IR")}
      </span>
    </label>
  );
}
function FramePlot({ model, result, view = "model" }: { model: FrameModel; result?: FrameResult["results"][number]; view?: FrameView }) {
  const svg = useMemo(() => frameSvg(model, result, view), [model, result, view]);
  const [zoom, setZoom] = useState(1);
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn" aria-label="بزرگنمایی مدل" disabled={zoom >= 4} onClick={() => setZoom((z) => Math.min(4, z + 0.5))} type="button">
          +
        </button>
        <button className="btn" aria-label="کوچک‌نمایی مدل" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} type="button">
          −
        </button>
        <span className="text-xs">بزرگنمایی نمایش: {zoom}×؛ برای جابه‌جایی، داخل نما پیمایش کنید.</span>
      </div>
      <div className="max-h-[460px] overflow-auto rounded-lg bg-white" tabIndex={0} aria-label="نمای قابل پیمایش مدل">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="نمای مدل تحلیلی قاب دوبعدی"
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
          src={"data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg)}
        />
      </div>
    </div>
  );
}

function FrameResults({ model, result }: { model: FrameModel; result: FrameResult | null }) {
  const [index, setIndex] = useState(0),
    [view, setView] = useState<FrameView>("model");
  const selected = result?.results[index] ?? result?.results[0];
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm font-bold text-amber-100">
        {!result
          ? "مدل برای حل آماده نیست."
          : result.status === "blocked"
            ? "حل متوقف شد؛ نتیجه معتبر صادر نمی‌شود."
            : result.status === "outside-domain"
              ? "حل انجام شد؛ حداقل یک حالت خارج دامنهٔ تغییرشکل کوچک است."
              : "حل خطی انجام شد؛ این وضعیت تأیید طراحی نیست."}
      </p>
      {result?.issues.map((t, i) => (
        <p key={i} className="text-xs leading-7 text-rose-200">
          {t}
        </p>
      ))}
      {selected && (
        <>
          <label className="block text-xs">
            حالت نمایش نتیجه
            <select
              aria-label="حالت نمایش نتیجه"
              className="field mt-1"
              value={result!.results.indexOf(selected)}
              onChange={(e) => setIndex(Number(e.target.value))}
            >
              {result!.results.map((r, i) => (
                <option key={r.kind + ":" + r.id} value={i}>
                  {r.kind === "case" ? "حالت" : "ترکیب"} {r.id} — {r.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["model", "هندسه مدل"],
                ["deformed", "شکل تغییر‌یافته"],
                ["moment", "نمودار لنگر"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} className={`btn ${view === id ? "btn-primary" : ""}`} onClick={() => setView(id)} type="button">
                {label}
              </button>
            ))}
          </div>
          <FramePlot model={model} result={selected} view={view} />
          <p className="text-xs leading-7">
            باقیماندهٔ نسبی دستگاه: {selected.residual.toExponential(2)} · خطای نسبی تعادل: {selected.equilibrium.relative.toExponential(2)}
            . صفر بودن این خطاها، کنترل مقاومت نیست.
          </p>
          {selected.warnings.map((w) => (
            <p key={w} className="text-xs leading-7 text-rose-200">
              {w}
            </p>
          ))}
          <h4 className="font-bold">جابه‌جایی و واکنش گره‌ها</h4>
          <p className="text-xs leading-6 text-slate-400">
            برای ستون‌های بیشتر، جدول را افقی پیمایش کنید. اعداد نمایش گرد شده‌اند؛ دادهٔ کامل در JSON و CSV است.
          </p>
          <div className="overflow-x-auto" dir="ltr">
            <table className="w-full whitespace-nowrap text-left text-xs" dir="ltr">
              <thead>
                <tr>
                  {["گره", "Ux (mm)", "Uy (mm)", "Rz (rad)", "Rx (kN)", "Ry (kN)", "M (kN.m)"].map((t) => (
                    <th key={t} className="p-2">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selected.nodes.map((n) => (
                  <tr key={n.node}>
                    <td className="p-2">{n.node}</td>
                    {[n.ux * 1000, n.uy * 1000, n.rz, n.rx, n.ry, n.rm].map((v, i) => (
                      <td className="p-2" key={i}>
                        {fmt(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4 className="font-bold">پوش نیرو — همهٔ حالت‌ها و ترکیب‌های تعریف‌شده</h4>
          <p className="text-xs leading-6">
            مقادیر کمینه و بیشینه ممکن است هم‌زمان رخ ندهند؛ برای طراحی اندرکنشی باید نتایج هر حالت جدا بررسی شود. شناسهٔ حالت حاکم در
            JSON/CSV گزارش درج می‌شود.
          </p>
          <div className="overflow-x-auto" dir="ltr">
            <table className="w-full whitespace-nowrap text-left text-xs" dir="ltr">
              <thead>
                <tr>
                  {["عضو", "Nmin (kN)", "Nmax", "Vmin (kN)", "Vmax", "Mmin (kN.m)", "Mmax"].map((t) => (
                    <th key={t} className="p-2">
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result!.envelopes.map((e) => (
                  <tr key={e.member}>
                    <td className="p-2">{e.member}</td>
                    {[e.nMin, e.nMax, e.vMin, e.vMax, e.mMin, e.mMax].map((v, i) => (
                      <td key={i} className="p-2">
                        {fmt(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {!selected && <FramePlot model={model} />}
    </div>
  );
}
