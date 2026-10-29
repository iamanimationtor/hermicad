import { RULE_CATALOG, RULE_COUNT } from "@/domain/codes";
import { RULE_DOC_LIST, SOURCE_AUDIT, rulesetFingerprint } from "@/domain/rules/docs";
import { CODE_SET, ENGINE_VERSION } from "@/domain/constants";
import { SEISMIC_PARAMS } from "@/domain/constants";
import { ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return ok({
    codeSet: CODE_SET,
    engineVersion: ENGINE_VERSION,
    ruleCount: RULE_COUNT,
    rules: RULE_CATALOG,
    documentation: RULE_DOC_LIST,
    rulesetFingerprint: rulesetFingerprint(),
    sourceAudit: SOURCE_AUDIT,
    seismic: SEISMIC_PARAMS,
    provenanceNotice:
      "شناسه قواعد، شماره بند قانونی نیست. آستانه‌ها داخلی و تأییدنشده‌اند و باید با مجموعه ضوابط تأییدشده پروژه جایگزین شوند.",
  });
}
