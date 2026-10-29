import { assertDatabaseConfiguration, DatabaseConfigurationError } from "../../db/config";
import { AccessError, assertSameOrigin, isHttpsRequest, sessionCookieOptions } from "../../server/accessError";
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

test("operations/same-origin", "کنترل مبدأ میزبان را همیشه و طرح‌واره را فقط با اعلام صریح https می‌سنجد", () => {
  const request = (origin: string | undefined, forwarded?: string, extra?: Record<string, string>) =>
    new Request("http://internal:3002/api/projects", {
      method: "POST",
      headers: {
        host: "preview.example",
        ...(origin ? { origin } : {}),
        ...(forwarded ? { "x-forwarded-proto": forwarded } : {}),
        ...extra,
      },
    });
  // پذیرفته‌شده‌ها
  assertSameOrigin(request("http://preview.example"));
  assertSameOrigin(request("https://preview.example", "https"));
  assertSameOrigin(request("https://preview.example", "https, http"));
  // پراکسیِ TLS-خاتمه‌ده: Next روی اتصالِ ورودی «http» می‌گذارد در حالی که مرورگر
  // روی https است. این پروندهٔ واقعیِ پیش‌نمایش است؛ اگر رد شود همهٔ نوشتن‌ها ۴۰۳ می‌شوند.
  assertSameOrigin(request("https://preview.example", "http"));
  assertSameOrigin(request("https://preview.example"));
  assertSameOrigin(request("https://preview.example", undefined, { "x-forwarded-ssl": "on" }));
  // میزبانِ رو به کاربر از x-forwarded-host خوانده می‌شود.
  assertSameOrigin(request("https://preview.example", "https", { host: "internal:3002", "x-forwarded-host": "preview.example" }));
  assertSameOrigin(request("https://preview.example", "https", { host: "internal:3002", "x-forwarded-host": "preview.example, edge.internal" }));

  const rejected: [string | undefined, string | undefined, Record<string, string> | undefined][] = [
    [undefined, undefined, undefined],
    ["null", undefined, undefined],
    ["https://attacker.example", "https", undefined],
    ["https://attacker.example", undefined, undefined],
    ["https://attacker.example", "http", undefined],
    ["https://preview.example/path", "https", undefined],
    ["https://preview.example/", "https", undefined],
    ["https://user:pass@preview.example", "https", undefined],
    // پراکسی صریحاً https اعلام کرده؛ مبدأِ http پذیرفته نیست.
    ["http://preview.example", "https", undefined],
    ["http://preview.example", undefined, { "x-forwarded-ssl": "on" }],
  ];
  for (const [origin, forwarded, extra] of rejected) {
    let error: unknown;
    try { assertSameOrigin(request(origin, forwarded, extra)); } catch (caught) { error = caught; }
    assert(error instanceof AccessError && error.status === 403, "مبدأ متفاوت، ناقص یا ناامن باید رد شود");
  }
});

test("operations/https-detection", "پرچم Secure کوکی از سرآیند پراکسی یا مبدأ https استنباط می‌شود", () => {
  const request = (target: string, headers: Record<string, string>) => new Request(target, { headers });
  assert(isHttpsRequest(request("http://internal:3002/api", { "x-forwarded-proto": "https" })), "x-forwarded-proto=https باید https باشد");
  assert(isHttpsRequest(request("http://internal:3002/api", { "x-forwarded-ssl": "on" })), "x-forwarded-ssl=on باید https باشد");
  assert(isHttpsRequest(request("https://preview.example/api", {})), "URL با طرح‌وارهٔ https باید https باشد");
  assert(isHttpsRequest(request("http://internal:3002/api", { origin: "https://preview.example" })), "مبدأ https بدون سرآیند پراکسی باید https باشد");
  assert(!isHttpsRequest(request("http://internal:3002/api", {})), "http ساده باید غیر امن باشد");
  assert(!isHttpsRequest(request("http://internal:3002/api", { "x-forwarded-proto": "http" })), "بدون نشانهٔ https باید غیر امن باشد");
  assert(isHttpsRequest(request("http://internal:3002/api", { "x-forwarded-proto": "http", origin: "https://preview.example" })), "مبدأ https بر اعلام پراکسی مقدم است");
});

test("operations/session-cookie", "کوکی نشست روی https برای iframe قابل استفاده و روی http محافظه‌کار است", () => {
  const opts = (target: string, headers: Record<string, string>) =>
    sessionCookieOptions(new Request(target, { headers }), 60);
  const https = opts("http://internal:3002/api", { origin: "https://preview.example" });
  assert(https.secure === true, "روی https کوکی باید Secure باشد");
  assert(https.sameSite === "none", "برای کار در iframe باید SameSite=None باشد");
  assert(https.httpOnly === true, "کوکی نشست باید HttpOnly باشد");
  const http = opts("http://internal:3002/api", {});
  assert(http.secure === false, "روی http نباید Secure باشد وگرنه مرورگر کوکی را نگه نمی‌دارد");
  assert(http.sameSite === "lax", "مرورگر کوکی None بدون Secure را رد می‌کند");
});
