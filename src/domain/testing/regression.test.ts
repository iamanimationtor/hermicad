import { ENGINE_VERSION, CODE_SET } from "../constants";
import { polygonArea } from "../geometry";
import { exportScheme } from "../exporters/reports";
import { FIXTURES } from "./fixtures";
import { assert, approx, test } from "./harness";

/**
 * Regression baselines.
 *
 * The fingerprint below is a deliberate hard pin: if the generative engine,
 * the analysis chain or the rounding changes, the suite fails and the change
 * has to be reviewed instead of silently drifting.
 *
 * 2026-03 re-pin (stage B-2), single reason: the open-plan kitchen no longer
 * occupies the facade when the access corridor is on the north, so the number
 * of daylight-compliant rooms per flat rose from 35 to 50 (see the final
 * `daylight.compliantRooms` field). Geometry, GFA, units and structure are
 * unchanged.
 */
const BASELINE_FINGERPRINT =
  "shallow:5:15:311.0:1555.2:400:600:9300:17:50|dual:5:15:384.0:1920.0:350:500:9300:17:50|compact-north:5:15:353.9:1769.5:350:500:9300:17:50|dual-north:5:15:368.8:1844.0:350:500:9300:17:50|compact:5:15:384.0:1920.0:350:500:9300:17:50";

export function fixtureFingerprint(): string {
  return FIXTURES.schemes
    .map((s) =>
      [
        s.strategy,
        s.floors,
        s.unitsTotal,
        s.footprintAreaM2.toFixed(1),
        s.grossFloorAreaM2.toFixed(1),
        s.structural.columnSizeMm,
        s.structural.beamDepthMm,
        s.mep.waterTankLiters,
        s.parking.requiredStalls,
        s.daylight.compliantRooms,
      ].join(":"),
    )
    .join("|");
}

test("regression", "مساحت زمین نمونه مستقل از موتور بازمحاسبه می‌شود (۸۶۸ m²)", () => {
  approx(polygonArea(FIXTURES.site.boundary), 868, 5e-9, "shoelace of demo parcel");
  approx(FIXTURES.schemes.length, 5, 0, "strategy count");
  return "۸۶۸ m² — مستقل از کد موتور";
});

test("regression", "نسخه موتور و وضعیت اعتبار سند ضوابط تثبیت شده است", () => {
  assert(ENGINE_VERSION === "hermicad-engine/1.1.0", `نسخه موتور تغییر کرده: ${ENGINE_VERSION}`);
  assert(CODE_SET.edition === "2026.02-internal", `نسخه سند تغییر کرده: ${CODE_SET.edition}`);
  assert(CODE_SET.verification === "unverified", "وضعیت اعتبار نباید بی‌سروصدا به تأییدشده تغییر کند");
  return `${ENGINE_VERSION} · ${CODE_SET.code}@${CODE_SET.edition}`;
});

test("regression", "اثر انگشت طرح‌های نمونه تغییر نکرده است", () => {
  assert(fixtureFingerprint() === BASELINE_FINGERPRINT, `طرح‌های نمونه تغییر کرده‌اند:\nactual=${fixtureFingerprint()}`);
  return "اثر انگشت ۵ طرح با خط مبنا یکسان است";
});

test("regression", "حجم خروجی‌ها در بازه معقول و متناسب با محتواست", () => {
  const scheme = FIXTURES.cleanScheme;
  const report = FIXTURES.cleanReport;
  const pdf = exportScheme(scheme, report, "pdf").data.length;
  const dxf = exportScheme(scheme, report, "dxf").data.length;
  const xlsx = exportScheme(scheme, report, "xlsx").data.length;
  const json = exportScheme(scheme, report, "json").data.length;
  assert(pdf > 20_000 && pdf < 400_000, `PDF ${pdf} بایت در بازه انتظار نیست`);
  assert(dxf > 3_000 && dxf < 2_000_000, `DXF ${dxf} بایت در بازه انتظار نیست`);
  assert(xlsx > 10_000 && xlsx < 2_000_000, `XLSX ${xlsx} بایت در بازه انتظار نیست`);
  assert(json > 20_000, `JSON ${json} بایت برای CEM کامل کم است`);
  return `PDF ${(pdf / 1024).toFixed(0)}K · DXF ${(dxf / 1024).toFixed(0)}K · XLSX ${(xlsx / 1024).toFixed(0)}K · JSON ${(json / 1024).toFixed(0)}K`;
});
