/** آزمون واقعی حساب، نشست، بازیابی، اشتراک و تعارض نسخه؛ هیچ کلیدی چاپ نمی‌شود. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
const base = process.env.HERMICAD_QA_URL ?? "http://127.0.0.1:3002";
class Client {
  cookie = "";
  async request(path: string, method = "GET", body?: unknown, origin = base) {
    const r = await fetch(base + path, {
      method,
      headers: {
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(origin ? { origin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const cookies = r.headers.getSetCookie();
    for (const c of cookies) if (c.startsWith("hermi_workspace=")) this.cookie = c.split(";")[0];
    return r;
  }
  async json(path: string, method = "GET", body?: unknown, status = 200) {
    const r = await this.request(path, method, body);
    assert.equal(r.status, status, `${method} ${path}: ${r.status}`);
    return r.json();
  }
}
async function main() {
  const a = new Client(),
    b = new Client(),
    other = new Client();
  await a.json("/api/designs");
  await b.json("/api/designs");
  await other.json("/api/designs");
  const legacy = a.cookie;
  const { design } = await a.json("/api/designs", "POST", { template: "sample", name: "آزمون محرمانگی" }, 201);
  const id = design.id;
  const { project } = await a.json("/api/projects", "POST", { name: "پروژهٔ خصوصی آزمون" }, 201);
  try {
    await other.json(`/api/designs/${id}`, "GET", undefined, 404);
    await other.json(`/api/projects/${project.id}`, "GET", undefined, 404);
    await other.json(`/api/projects/${project.id}`, "PATCH", { name: "نفوذ" }, 404);
    await other.json(`/api/projects/${project.id}`, "DELETE", undefined, 404);
    await other.json(`/api/projects/${project.id}/weights`, "POST", { weights: {} }, 404);
    for (const [path, method, body] of [
      [`/api/designs/${id}`, "PUT", { document: design }],
      [`/api/designs/${id}`, "DELETE", undefined],
      [`/api/projects/${project.id}`, "PATCH", { name: "تغییر نام غیرمجاز" }],
    ] as const) {
      assert.equal((await a.request(path, method, body, "https://attacker.invalid")).status, 403);
    }
    // همان میزبان با طرح‌وارهٔ https در حالی که اتصالِ ورودی http است:
    // پشت پراکسیِ TLS-خاتمه‌ده این حالت کاملاً طبیعی است (مرورگر https، اتصال
    // داخلی http) و برنامه نمی‌تواند طرح‌وارهٔ عمومی را اثبات کند. پس ملاکِ
    // امنیتی «برابری میزبان» و «نشانهٔ مرورگر» است، نه طرح‌واره؛ وگرنه همهٔ
    // درخواست‌های نوشتن روی استقرار https با ۴۰۳ شکست می‌خورند.
    const httpsOrigin = base.replace(/^http:/, "https:");
    const sameHostOtherScheme = await a.request(`/api/projects/${project.id}`, "PATCH", { name: "هم‌میزبان با طرح‌وارهٔ دیگر" }, httpsOrigin);
    assert.equal(sameHostOtherScheme.status, 200);
    await sameHostOtherScheme.arrayBuffer();
    // اما نشانهٔ مرورگر مبنی بر آمدنِ درخواست از سایت دیگر باید رد شود.
    const crossSite = await fetch(base + `/api/projects/${project.id}`, { method: "PATCH",
      headers: { cookie: a.cookie, origin: base, "sec-fetch-site": "cross-site", "content-type": "application/json" },
      body: JSON.stringify({ name: "درخواست بین‌سایتی" }) });
    assert.equal(crossSite.status, 403);
    await crossSite.arrayBuffer();
    const behindProxy = await fetch(base + `/api/projects/${project.id}`, { method: "PATCH",
      headers: { cookie: a.cookie, origin: base, "x-forwarded-proto": "https", "content-type": "application/json" },
      body: JSON.stringify({ name: "مبدأ نامعتبر" }) });
    assert.equal(behindProxy.status, 403);
    const proxiedOrigin = await fetch(base + `/api/projects/${project.id}`, { method: "PATCH",
      headers: { cookie: a.cookie, origin: httpsOrigin, "x-forwarded-proto": "https", "content-type": "application/json" },
      body: JSON.stringify({ name: "آزمون proxy معتبر" }) });
    assert.equal(proxiedOrigin.status, 200);
    await proxiedOrigin.arrayBuffer();
    await a.json(`/api/designs/${id}`, "PUT", { document: { ...design, items: [null] } }, 422);
    await a.json(`/api/designs/${id}`, "PUT", { document: { ...design, items: [{ ...design.items[0], heightM: 0 }] } }, 422);
    await a.json("/api/designs", "POST", { template: "unknown" }, 422);
    for (const template of ["office", "school", "clinic"]) {
      const created = await a.json("/api/designs", "POST", { template }, 201);
      assert.ok(created.design.items.length > 50);
      await a.json(`/api/designs/${created.design.id}`, "DELETE");
    }
    const parallel = await Promise.all([
      a.request(`/api/designs/${id}`, "PUT", { document: design }),
      a.request(`/api/designs/${id}`, "PUT", { document: design }),
    ]);
    assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 409], "ذخیرهٔ هم‌زمان باید یک برنده داشته باشد");
    const csrf = await a.request(`/api/designs/${id}/shares`, "POST", { days: 7 }, "https://attacker.invalid");
    assert.equal(csrf.status, 403);
    const share = await a.json(`/api/designs/${id}/shares`, "POST", { days: 7 }, 201);
    const token = share.path.split("#")[1];
    const before = await (await b.request("/api/shares/view", "POST", { token })).text();
    assert.ok(before.includes("<svg"));
    const { design: saved } = await a.json(`/api/designs/${id}`);
    await a.json(`/api/designs/${id}`, "PUT", { document: { ...saved, project: { ...saved.project, name: "نسخهٔ جدید خصوصی" } } });
    const after = await (await b.request("/api/shares/view", "POST", { token })).text();
    assert.equal(before, after, "اشتراک نباید تغییرات بعدی را افشا کند");
    await other.json(`/api/designs/${id}/shares`, "DELETE", { shareId: share.id }, 404);
    const username = "qa_" + randomBytes(8).toString("hex"),
      password = randomBytes(24).toString("base64url"),
      nextPassword = randomBytes(24).toString("base64url");
    const register = await a.json("/api/workspace", "POST", { action: "register", username, password });
    await other.json("/api/workspace", "POST", { action: "register", username, password }, 409);
    assert.ok(register.recovery);
    assert.ok(a.cookie.startsWith("hermi_workspace=hs_"));
    const replay = new Client();
    replay.cookie = legacy;
    await replay.json(`/api/designs/${id}`, "GET", undefined, 401);
    await b.json("/api/workspace", "POST", { action: "login", username, password: "wrong-password-long" }, 401);
    await b.json("/api/workspace", "POST", { action: "login", username, password });
    await b.json(`/api/designs/${id}`);
    const rotation = await a.json("/api/workspace", "POST", { action: "recovery-key" });
    await other.json("/api/workspace", "POST", { action: "recover", code: register.recovery, password: nextPassword }, 401);
    const recovered = await other.json("/api/workspace", "POST", { action: "recover", code: rotation.recovery, password: nextPassword });
    assert.ok(recovered.recovery);
    await a.json(`/api/designs/${id}`, "GET", undefined, 401);
    await b.json(`/api/designs/${id}`, "GET", undefined, 401);
    await b.json("/api/workspace", "POST", { action: "recover", code: rotation.recovery, password: nextPassword }, 401);
    await b.json("/api/workspace", "POST", { action: "login", username, password }, 401);
    await b.json("/api/workspace", "POST", { action: "login", username, password: nextPassword });
    await b.json(`/api/designs/${id}/shares`, "DELETE", { shareId: share.id });
    await a.json("/api/shares/view", "POST", { token }, 404);
    await other.json(`/api/designs/${id}`, "DELETE");
    await other.json(`/api/projects/${project.id}`, "DELETE");
    const oldSession = b.cookie;
    await b.json("/api/workspace", "POST", { action: "logout" });
    replay.cookie = oldSession;
    await replay.json("/api/workspace", "GET", undefined, 401);
    // بازیابی مهمان نیز کوکی قدیمی را از اعتبار می‌اندازد.
    const guest = new Client();
    await guest.json("/api/designs");
    const oldGuest = guest.cookie;
    const guestKey = await guest.json("/api/workspace", "POST", { action: "recovery-key" });
    replay.cookie = oldGuest;
    await replay.json("/api/designs", "GET", undefined, 401);
    const guestRestore = new Client();
    const race = await Promise.all([
      guestRestore.request("/api/workspace", "POST", { action: "recover", code: guestKey.recovery }),
      new Client().request("/api/workspace", "POST", { action: "recover", code: guestKey.recovery }),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 401], "کلید بازیابی در رقابت فقط یک‌بار مصرف می‌شود");
    if (race[0].status !== 200) {
      const cookie = race[1].headers.getSetCookie().find((c) => c.startsWith("hermi_workspace="));
      assert.ok(cookie);
      guestRestore.cookie = cookie.split(";")[0];
    }

    assert.equal((await guestRestore.json("/api/workspace")).username, null);
    const attack = new Client();
    const target = "qa_missing_" + randomBytes(4).toString("hex");
    for (let i = 0; i < 11; i++)
      await attack.json(
        "/api/workspace",
        "POST",
        { action: "login", username: target, password: "wrong-password-long" },
        i === 10 ? 429 : 401,
      );
    console.log("حساب، بازیابی یک‌بارمصرف، لغو نشست، محدودیت تلاش، جداسازی پروژه‌ها، لینک ثابت/لغوشدنی و تعارض نسخه: موفق.");
  } catch (error) {
    console.error("آزمون متوقف شد؛ هیچ کلید یا گذرواژه‌ای چاپ نشده است.");
    throw error;
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
