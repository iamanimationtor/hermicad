import { assertDatabaseConfiguration, DatabaseConfigurationError } from "../../db/config";
import { AccessError, assertSameOrigin } from "../../server/accessError";
import { assert, test } from "./harness";

test("operations/database-config", "production بدون پایگاه صریح از PGlite بی‌صدا استفاده نمی‌کند", () => {
  for (const config of [
    { nodeEnv: "production" },
    { nodeEnv: "production", databaseUrl: "  " },
    { nodeEnv: "production", allowEmbeddedInProduction: "true" },
    { nodeEnv: "production", allowEmbeddedInProduction: "0" },
  ]) {
    let error: unknown;
    try { assertDatabaseConfiguration(config); } catch (caught) { error = caught; }
    assert(error instanceof DatabaseConfigurationError, "تنظیم ناقص production باید بسته بماند");
  }
  for (const config of [
    { nodeEnv: "development" },
    { nodeEnv: "test" },
    { nodeEnv: "production", databaseUrl: "postgresql://configured" },
    { nodeEnv: "production", allowEmbeddedInProduction: "1" },
  ]) assertDatabaseConfiguration(config);
});

test("operations/same-origin", "کنترل مبدأ، طرحواره و proxy را همراه نام میزبان می‌سنجد", () => {
  const request = (origin: string | undefined, forwarded?: string) => new Request("http://internal:3002/api/projects", {
    method: "POST", headers: { host: "preview.example", ...(origin && { origin }), ...(forwarded && { "x-forwarded-proto": forwarded }) },
  });
  assertSameOrigin(request("http://preview.example"));
  assertSameOrigin(request("https://preview.example", "https"));
  assertSameOrigin(request("https://preview.example", "https, http"));
  for (const [origin, forwarded] of [
    [undefined, undefined], ["null", undefined], ["https://preview.example", undefined],
    ["http://preview.example", "https"], ["https://attacker.example", "https"],
    ["https://preview.example/path", "https"], ["https://preview.example", "invalid"],
  ]) {
    let error: unknown;
    try { assertSameOrigin(request(origin, forwarded)); } catch (caught) { error = caught; }
    assert(error instanceof AccessError && error.status === 403, "مبدأ متفاوت یا ناقص باید رد شود");
  }
});
