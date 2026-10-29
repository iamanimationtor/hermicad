import { rectArea, round } from "./geometry";
import { recomputeDerived } from "./layout";
import { validateScheme } from "./codes";
import { UNIT_NET_FACTOR } from "./constants";
import type { CanonicalScheme, Issue, RepairAction, RepairResult, Room, ValidationReport } from "./types";

interface RepairCandidate {
  ruleId: string;
  action: string;
  reason: string;
  apply: (scheme: CanonicalScheme, issues: Issue[]) => { scheme: CanonicalScheme; detail: string } | null;
}

const repairs: RepairCandidate[] = [
  {
    ruleId: "CODE-04-FAR",
    action: "کاهش تعداد طبقات تا سقف تراکم",
    reason: "تراکم محاسبه‌شده از سقف مجاز بیشتر است.",
    apply: (scheme, issues) => {
      const issue = issues.find((i) => i.ruleId === "CODE-04-FAR");
      if (!issue) return null;
      const maxFloors = Math.floor((scheme.requirements.farMax * scheme.plotAreaM2) / Math.max(1, scheme.footprintAreaM2));
      const target = Math.max(1, Math.min(maxFloors, scheme.floors - 1));
      if (target >= scheme.floors) return null;
      const updated = recomputeDerived({ ...scheme, floors: target });
      return { scheme: updated, detail: `طبقات از ${scheme.floors} به ${updated.floors} کاهش یافت؛ تراکم جدید ${(updated.grossFloorAreaM2 / updated.plotAreaM2).toFixed(2)}.` };
    },
  },
  {
    ruleId: "CODE-04-ROOM-MIN",
    action: "ادغام فضای کوچک با فضای مجاور هم‌واحد",
    reason: "یک یا چند فضا کوچک‌تر از حداقل مساحت ضابطه‌ای هستند.",
    apply: (scheme) => {
      const levels = scheme.levels.map((l) => ({ ...l, rooms: [...l.rooms] }));
      let merged = 0;
      const details: string[] = [];
      for (const level of levels) {
        const rooms = level.rooms;
        for (let i = 0; i < rooms.length && merged < 3; i++) {
          const room = rooms[i];
          if (room.unitIndex < 0 || room.minAreaM2 <= 0) continue;
          if (room.areaM2 * UNIT_NET_FACTOR + 0.05 >= room.minAreaM2) continue;
          if (room.kind === "bath" || room.kind === "wc" || room.kind === "entry") continue;
          const neighbourIndex = rooms.findIndex(
            (r, idx) =>
              idx !== i &&
              r.unitIndex === room.unitIndex &&
              (r.kind === "storage" || r.kind === "balcony" || r.kind === "hall") &&
              shareFullEdge(r, room),
          );
          if (neighbourIndex < 0) continue;
          const neighbour = rooms[neighbourIndex];
          const union = rectUnion(room, neighbour);
          if (!union) continue;
          const polygon = [
            { x: union.x, y: union.y },
            { x: union.x + union.w, y: union.y },
            { x: union.x + union.w, y: union.y + union.h },
            { x: union.x, y: union.y + union.h },
          ];
          const updatedRoom: Room = {
            ...room,
            polygon,
            areaM2: round(rectArea(union), 2),
            facadeM: round(room.facadeM + neighbour.facadeM, 2),
            daylightFactorProxy: round(Math.min(0.6, (0.9 * (room.facadeM + neighbour.facadeM)) / Math.max(1, rectArea(union))), 3),
            label: `${room.label} (ادغام‌شده)`,
          };
          rooms[i] = updatedRoom;
          rooms.splice(neighbourIndex, 1);
          merged += 1;
          details.push(`${room.label}: ${room.areaM2} → ${updatedRoom.areaM2} m² با ادغام ${neighbour.label}`);
        }
        level.netAreaM2 = round(rooms.filter((r) => r.unitIndex >= 0).reduce((s, r) => s + r.areaM2, 0), 2);
      }
      if (merged === 0) return null;
      const units = scheme.units.map((u) => ({
        ...u,
        roomIds: levels[0].rooms.filter((r) => r.unitIndex === u.index).map((r) => r.id),
      }));
      const updated = recomputeDerived({ ...scheme, levels, units });
      return { scheme: updated, detail: `${merged} ادغام انجام شد: ${details.join(" | ")}` };
    },
  },
  {
    ruleId: "NBR-21-PARKING",
    action: "تخصیص پارکینگ زیرزمینی بیشتر",
    reason: "تعداد جایگاه پارکینگ کمتر از نیاز ضابطه‌ای است.",
    apply: (scheme) => {
      if (!scheme.requirements.includeBasementParking) {
        const updated = recomputeDerived({
          ...scheme,
          requirements: { ...scheme.requirements, includeBasementParking: true },
        });
        if (updated.parking.providedStalls > scheme.parking.providedStalls) {
          return { scheme: updated, detail: "پارکینگ زیرزمینی فعال شد؛ " + updated.parking.note };
        }
      }
      return null;
    },
  },
  {
    ruleId: "CODE-04-UNIT-SUPPLY",
    action: "بازتوزیع واحدها در ارتفاع",
    reason: "ظرفیت طبقات برای برنامه واحدها کافی نیست.",
    apply: (scheme) => {
      const maxFloors = scheme.requirements.floorsMax;
      if (scheme.floors >= maxFloors) return null;
      const demanded = scheme.requirements.dwellings.reduce((s, d) => s + d.count, 0);
      const needed = Math.ceil(demanded / Math.max(1, scheme.unitsPerFloor));
      const target = Math.min(maxFloors, Math.max(scheme.floors + 1, needed));
      const levels = [...scheme.levels];
      while (levels.length < target) {
        const base = scheme.levels[levels.length % scheme.levels.length];
        levels.push({
          ...base,
          index: levels.length,
          name: `طبقه ${levels.length + 1}`,
          rooms: base.rooms.map((r) => ({ ...r, id: `${levels.length}-${r.id}`, level: levels.length })),
        });
      }
      const updated = recomputeDerived({ ...scheme, levels, floors: target });
      return { scheme: updated, detail: `طبقات به ${target} افزایش یافت تا برنامه واحدها تأمین شود.` };
    },
  },
  {
    ruleId: "STRUCT-02-FOUNDATION",
    action: "بازبینی تخصصی پی و دادهٔ خاک",
    reason: "عرض برآوردی از آستانهٔ داخلی بیشتر است؛ این مقایسه طراحی پی نیست.",
    // دست‌کاری عرضِ «مورد نیاز» ابعاد واقعی پی را اصلاح نمی‌کند و نباید رفع مشکل وانمود شود.
    apply: () => null,
  },
  {
    ruleId: "SITE-GEOM-01",
    action: "اصلاح محدوده هندسی (خارج از توان اصلاح پارامتری)",
    reason: "بلوک/فضا بیرون از محدوده ساخت‌پذیر یا مرز زمین قرار گرفته است.",
    // Containment is a property of the generated geometry: no parameter tweak
    // can move a block back inside. Recording it as non-applicable is the
    // honest outcome instead of silently dropping the issue.
    apply: () => null,
  },
  {
    ruleId: "FIRE-03-EXITS",
    action: "افزودن هسته فرار دوم (نیازمند بازتولید پلان)",
    reason: "تعداد خروج‌های امن کمتر از حد لازم است.",
    apply: () => null,
  },
  {
    ruleId: "NBR-15-DAYLIGHT",
    action: "بازآرایی فضاها برای نورگیری (نیازمند بازتولید)",
    reason: "برخی فضاهای قابل سکونت نورگیر مستقیم ندارند.",
    apply: () => null,
  },
];

export function repairScheme(scheme: CanonicalScheme, maxIterations = 3): RepairResult {
  let current: CanonicalScheme = cloneScheme(scheme);
  const before = validateScheme(current, 0);
  const actions: RepairAction[] = [];
  let iteration = 0;
  let report: ValidationReport = before;

  for (iteration = 1; iteration <= maxIterations; iteration++) {
    const failingRuleIds = new Set(
      report.evaluations.filter((e) => e.status === "fail" || e.status === "warn").map((e) => e.ruleId),
    );
    if (failingRuleIds.size === 0) break;
    let changed = false;
    for (const repair of repairs) {
      if (!failingRuleIds.has(repair.ruleId)) continue;
      if (actions.some((a) => a.ruleId === repair.ruleId && a.applied)) continue;
      const issue = report.issues.find((i) => i.ruleId === repair.ruleId);
      const outcome = repair.apply(current, report.issues);
      if (outcome) {
        current = outcome.scheme;
        actions.push({
          action: repair.action,
          reason: issue?.message ?? repair.reason,
          ruleId: repair.ruleId,
          applied: true,
          detail: outcome.detail,
        });
        changed = true;
      } else {
        actions.push({
          action: repair.action,
          reason: issue?.message ?? repair.reason,
          ruleId: repair.ruleId,
          applied: false,
          detail:
            repair.ruleId === "FIRE-03-EXITS"
              ? "این نقص با تغییر پارامترها قابل رفع نیست؛ پلان باید با راهبرد دیگری (دو هسته) بازتولید شود."
              : repair.ruleId === "NBR-15-DAYLIGHT"
                ? "نورگیری به هندسه پلان وابسته است؛ بازتولید با بلوک کم‌عمق یا چاه نور لازم است."
                : "شرایط اصلاح فراهم نشد؛ ورودی‌های طراحی باید بازبینی شوند.",
        });
      }
    }
    report = validateScheme(current, iteration);
    if (!changed) break;
  }

  const after = validateScheme(current, iteration);
  return {
    scheme: { ...current, id: current.id, code: current.code },
    actions: dedupeActions(actions),
    before,
    after,
    iterations: iteration - 1,
  };
}

function dedupeActions(actions: RepairAction[]): RepairAction[] {
  const seen = new Set<string>();
  return actions.filter((a) => {
    const key = `${a.ruleId}-${a.applied}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shareFullEdge(a: Room, b: Room): boolean {
  const ra = bounds(a);
  const rb = bounds(b);
  const eps = 0.05;
  const sameY = Math.abs(ra.y - rb.y) < eps && Math.abs(ra.h - rb.h) < eps;
  const sameX = Math.abs(ra.x - rb.x) < eps && Math.abs(ra.w - rb.w) < eps;
  const touchX = Math.abs(ra.x + ra.w - rb.x) < eps || Math.abs(rb.x + rb.w - ra.x) < eps;
  const touchY = Math.abs(ra.y + ra.h - rb.y) < eps || Math.abs(rb.y + rb.h - ra.y) < eps;
  return (sameY && touchX) || (sameX && touchY);
}

function bounds(room: Room): { x: number; y: number; w: number; h: number } {
  const xs = room.polygon.map((p) => p.x);
  const ys = room.polygon.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function rectUnion(a: Room, b: Room): { x: number; y: number; w: number; h: number } | null {
  const ra = bounds(a);
  const rb = bounds(b);
  const x = Math.min(ra.x, rb.x);
  const y = Math.min(ra.y, rb.y);
  const x2 = Math.max(ra.x + ra.w, rb.x + rb.w);
  const y2 = Math.max(ra.y + ra.h, rb.y + rb.h);
  const area = (x2 - x) * (y2 - y);
  if (area > ra.w * ra.h + rb.w * rb.h + 0.05) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

function cloneScheme(scheme: CanonicalScheme): CanonicalScheme {
  return JSON.parse(JSON.stringify(scheme)) as CanonicalScheme;
}
