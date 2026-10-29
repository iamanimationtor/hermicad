import { assessFreshness, type CurrentBasis, type RunBasis } from "../provenance";
import { DEFAULT_REQUIREMENTS, DEFAULT_SITE, validateRequirements, validateSite } from "../requirements";
import { DomainError, generateSchemes } from "../layout";
import type { Requirements, SiteModel } from "../types";
import { assert, test } from "./harness";

const current: CurrentBasis = { siteRevision: 2, requirementRevision: 3, engineVersion: "engine", rulesetFingerprint: "rules" };
const run: RunBasis = { id: "run", ...current, seed: 123, variants: 5, initialWeights: { yield: 0.5, quality: 0.5 } };

test("provenance/freshness", "تطابق شناسه‌ها به معنی صحت یا انطباق نیست", () => {
  const result = assessFreshness(run, current);
  assert(result.state === "current" && result.reasons.length === 0 && result.runId === run.id, "مبنای یکسان فعلی است");
  assert(result.generatedFrom !== run, "نمای مبنا نباید مرجع شیء ذخیره‌شده باشد");
  assert(assessFreshness({ ...run, siteRevision: 1 }, current).state === "stale", "نسخهٔ زمین");
  assert(assessFreshness({ ...run, requirementRevision: 1 }, current).state === "stale", "نسخهٔ نیازمندی");
  assert(assessFreshness({ ...run, engineVersion: "old" }, current).state === "stale", "نسخهٔ موتور");
  assert(assessFreshness({ ...run, rulesetFingerprint: "old" }, current).state === "stale", "اثر انگشت فهرست قواعد");
});

test("provenance/unknown", "ورودی یا منشأ ناقص مثبت نمی‌شود", () => {
  assert(assessFreshness(null, current).state === "unknown", "اجرای غایب");
  assert(assessFreshness({ ...run, rulesetFingerprint: null }, current).state === "unknown", "اجرای قدیمی");
  assert(assessFreshness({ ...run, engineVersion: null }, current).state === "unknown", "نسخهٔ موتور غایب");
  assert(assessFreshness({ ...run, initialWeights: null }, current).state === "unknown", "وزن اولیه غایب");
  assert(assessFreshness({ ...run, seed: null }, current).state === "unknown", "seed غایب");
  for (const value of [null, 0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert(assessFreshness({ ...run, siteRevision: value }, current).state === "unknown", `نسخهٔ زمین ${value}`);
  }
  const both = assessFreshness({ ...run, siteRevision: 1, rulesetFingerprint: null }, current);
  assert(both.state === "stale" && both.reasons.length === 2, "ناسازگاری و ناشناختگی هر دو گزارش شوند");
});

test("provenance/validation", "ساختار ناقص و عدد غیرمتناهی پیش از محاسبه رد می‌شود", () => {
  const badSites = [null, {}, { ...DEFAULT_SITE, setbacks: null }, { ...DEFAULT_SITE, boundary: [null, null, null] },
    { ...DEFAULT_SITE, soilBearingKPa: null }, { ...DEFAULT_SITE, spotLevels: [{ x: 1, y: 2, z: NaN }] },
    { ...DEFAULT_SITE, noBuildZones: [[{ x: 1, y: 1 }]] }];
  for (const site of badSites) assert(!validateSite(site as SiteModel).ok, "زمین ناقص باید رد شود");
  const badRequirements = [null, {}, { ...DEFAULT_REQUIREMENTS, floorsMax: null },
    { ...DEFAULT_REQUIREMENTS, floorsMax: 1.5 }, { ...DEFAULT_REQUIREMENTS, dwellings: [null] },
    { ...DEFAULT_REQUIREMENTS, dwellings: [{ type: "toString", count: 1, targetAreaM2: 10, minAreaM2: 10 }] },
    { ...DEFAULT_REQUIREMENTS, visitorParkingRatio: NaN }, { ...DEFAULT_REQUIREMENTS, parse: null }];
  for (const item of badRequirements) assert(!validateRequirements(item as Requirements).ok, "نیازمندی ناقص باید رد شود");
  let caught = false;
  try { generateSchemes({} as SiteModel, DEFAULT_REQUIREMENTS, { seed: 1, variants: 1 }); }
  catch (error) { caught = error instanceof DomainError; }
  assert(caught, "محاسبهٔ هندسی نباید پیش از کنترل شکل داده اجرا شود");
});

test("provenance/capacity", "ابعاد بیش از سقف پردازش، خارج از دامنه رد می‌شود", () => {
  const wide = { ...DEFAULT_SITE, boundary: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }, { x: 0, y: 500 }], spotLevels: [] };
  let caught: unknown;
  try { generateSchemes(wide, DEFAULT_REQUIREMENTS, { seed: 1, variants: 1 }); } catch (error) { caught = error; }
  assert(caught instanceof DomainError && caught.detail.some((item) => item.includes("سقف فنی")), "به‌جای تخصیص نامحدود باید صریح رد شود");
});
