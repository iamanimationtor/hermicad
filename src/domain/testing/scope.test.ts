import { FAMILIES, STRUCTURAL_FIELDS, emptyStructure, fieldsFor, structuralErrors } from "../structures/catalog";
import { assessStructure } from "../structures/assessment";
import { FRAME_FAMILIES, FRAME_LIMITS, emptyFrame } from "../structures/frame/model";
import { structuralExportError } from "../structures/exportPolicy";
import { READINESS_GATES, SCOPE_ROWS, STAGES, STAGE_STATE_LABELS, scopeRegister } from "../scope/registry";
import { assert, test } from "./harness";

test("scope/contract", "دفتر پیش‌نویس است و سه دروازه بدون شاهد، احراز یا صدور نمی‌شوند", () => {
  const register = scopeRegister();
  assert(register.status === "draft" && !register.scopeApproved && !register.releaseApproved, "تأیید بدون شاهد ممنوع است");
  assert(register.regulatoryCompliance === "not-established", "انطباق مقرراتی نباید نتیجه گرفته شود");
  assert(READINESS_GATES.length === 3 && READINESS_GATES.every((gate) => gate.state === "not-assessed" && gate.needs.length >= 2), "دروازه‌ها مستقل و باز باشند");
  assert(STAGES.length === 6, "شش وضعیت لازم است");
  assert(new Set(SCOPE_ROWS.map((row) => row.id)).size === SCOPE_ROWS.length, "شناسهٔ ردیف تکراری است");
  for (const row of SCOPE_ROWS) {
    assert(!!row.system && !!row.method && !!row.use && !!row.jurisdiction, `${row.id}: دامنه ناقص`);
    assert(row.boundaries.length > 0 && row.exclusions.length > 0, `${row.id}: حد یا استثنا خالی است`);
    assert(row.availableOutputs.length > 0 && row.requiredDeliverables.length > 0 && row.acceptanceNeeds.length > 0, `${row.id}: خروجی/معیار غایب`);
    for (const [key] of STAGES) {
      const phase = row.stages[key];
      assert(!!phase && !!phase.detail && !!STAGE_STATE_LABELS[phase.state], `${row.id}: وضعیت ${key} نامعتبر است`);
    }
    assert(row.stages.release.state === "review-only", `${row.id}: صدور مصوب ادعا شد`);
    assert(row.stages.design.state === "not-implemented", `${row.id}: طراحی جامع بدون شاهد ادعا شد`);
  }
});

test("scope/contract", "خانواده و مدل قاب از کاتالوگ واقعی خوانده می‌شوند، نه فهرستی ناسازگار", () => {
  for (const family of FAMILIES) {
    assert(SCOPE_ROWS.filter((row) => row.id === `intake-${family.id}`).length === 1, `${family.id}: مسیر ثبت`);
    const frame = SCOPE_ROWS.filter((row) => row.id === `plane-frame-${family.id}`);
    assert(frame.length === (FRAME_FAMILIES.some((id) => id === family.id) ? 1 : 0), `${family.id}: مسیر قاب ناسازگار`);
  }
  for (const family of ["concrete", "steel"])
    assert(SCOPE_ROWS.some((row) => row.id === `simple-beam-${family}`), `${family}: تیر`);
  assert(SCOPE_ROWS.some((row) => row.id === "gravity-wall-retaining"), "مدل دیوار");
  assert(SCOPE_ROWS.some((row) => row.id === "hydrostatic-wall-tank"), "مدل فشار مایع");
  const planeFrame = SCOPE_ROWS.find((row) => row.id === "plane-frame-steel")!;
  assert(planeFrame.boundaries.some((text) => text.includes(String(FRAME_LIMITS.nodes))), "سقف واقعی گره‌ها");
  assert(planeFrame.softwareEvidence.includes("scripts/qa-frame-independent.py"), "شاهد عددی باید از پذیرش حرفه‌ای تفکیک شود");
});

test("scope/contract", "واحد و بازهٔ ورودی‌های فرم با کاتالوگ یکسان و ارجاع‌ها مشخص‌اند", () => {
  for (const row of SCOPE_ROWS) {
    for (const path of [...row.codeReferences, ...row.softwareEvidence])
      assert(path.startsWith("src/") || path.startsWith("scripts/"), `${row.id}: مسیر شاهد مشخص نیست: ${path}`);
    for (const input of row.inputs) {
      // قرارداد قاب مستقل است؛ کلید combinations آن با فیلد متنی فرم سازه هم‌نام است.
      if (row.id.startsWith("plane-frame-")) continue;
      const field = STRUCTURAL_FIELDS.find((item) => item.key === input.key);
      if (!field) throw new Error(`${row.id}: فیلد شناخته‌نشده ${input.key}`);
      assert(input.label === field.label && input.unit === (field.unit ?? null), `${row.id}/${input.key}: برچسب یا واحد ناسازگار`);
      assert(input.min === (field.min ?? null) && input.max === (field.max ?? null), `${row.id}/${input.key}: بازهٔ فرم ناسازگار`);
    }
  }
});

test("scope/families", "چوب و فولاد سردنوردشده مستقل‌اند و پروندهٔ قدیمی تغییر خودکار ندارد", () => {
  const timber = emptyStructure("timber");
  timber.values.timberProduct = "محصول قدیمی؛ نیازمند تشخیص نوع واقعی";
  assert(!structuralErrors(timber).length && timber.family === "timber", "پروندهٔ قدیمی معتبر می‌ماند");
  assert(assessStructure(timber).limitations.some((note) => note.includes("خودکار")), "هشدار پروندهٔ قدیمی در گزارش لازم است");
  const cold = emptyStructure("cold-formed-steel");
  cold.values.coldFormedProduct = "مقطع و ضخامت از گواهی پروژه";
  assert(!structuralErrors(cold).length, "مسیر جدید باید قابل ثبت باشد");
  assert(fieldsFor(cold).some((field) => field.key === "coldFormedProduct"), "ورودی محصول فولادی");
  assert(!fieldsFor(cold).some((field) => field.key === "timberProduct"), "فیلد چوب نباید در مسیر فولادی ظاهر شود");
  assert(!fieldsFor(timber).some((field) => field.key === "coldFormedProduct"), "فیلد فولادی نباید در مسیر چوب ظاهر شود");
  assert(structuralErrors({ ...cold, values: { timberProduct: "چوب" } }).length > 0, "اختلاط دادهٔ دو مسیر");
  assert(structuralErrors({ ...cold, frame: emptyFrame() }).length > 0, "قاب اختیاری نباید خودکار به مسیر جدید نسبت داده شود");
  const assessment = assessStructure(cold);
  assert(assessment.status === "not-implemented" && !assessment.executionReady && assessment.metrics.length === 0, "طراحی سردنوردشده نباید جعل شود");
  assert(!!structuralExportError("cold-formed-steel", "details-pdf"), "جزئیات بتنی نباید به فولاد سردنوردشده نسبت داده شود");
});
