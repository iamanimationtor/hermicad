/* آزمون رابط؛ playwright-core و @sparticuz/chromium در محیط QA نصب شوند. */
const { chromium: pw } = require("playwright-core");
const chromium = require("@sparticuz/chromium").default;
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const base = process.env.HERMICAD_QA_URL || "http://127.0.0.1:3002";
(async () => {
  const browser = await pw.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args.filter((arg) => !["--disable-web-security", "--single-process"].includes(arg)),
    headless: true,
  });
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/design", { waitUntil: "networkidle" });
    const region = page.getByRole("region", { name: "حساب و بازیابی فضای کار" });
    await region.getByLabel("نام کاربری", { exact: true }).fill("browser_" + randomBytes(6).toString("hex"));
    await region.getByLabel("گذرواژه", { exact: true }).fill(randomBytes(24).toString("base64url"));
    await region.getByRole("button", { name: "ساخت حساب", exact: true }).click();
    await region.locator("code").waitFor();
    const recovery = await region.locator("code").textContent();
    assert.match(recovery, /^hr_/);
    await page.getByLabel("الگوی کاربری", { exact: true }).selectOption("clinic");
    await page.getByRole("button", { name: "ایجاد الگوی کاربری", exact: true }).click();
    await page.waitForURL(/\/design\/[a-f0-9-]+$/);
    const path = new URL(page.url()).pathname;
    const id = path.split("/").pop();
    let doc = (await (await page.request.get(base + "/api/designs/" + id)).json()).design;
    assert.equal(doc.items.filter((i) => i.catalogId === "space-room").length, 7);
    await page.getByLabel("ارتفاع کف تا کف (متر)", { exact: true }).fill("4");
    // انتخاب از ناحیهٔ برخورد واقعی روی بوم؛ پنجرهٔ بیرونی با نماد دیگری هم‌پوشانی ندارد.
    const index = doc.items.findIndex((i) => i.catalogId === "window");
    const object = page.locator('g[style*="cursor: move"]').nth(index);
    await object.click({ force: true });
    await page.getByLabel("ارتفاع شیء (متر)", { exact: true }).fill("1.7");
    await page.getByLabel("کف‌نشیمن بازشو (متر)", { exact: true }).fill("0.5");
    await page.getByRole("button", { name: "ذخیره", exact: true }).click();
    await page.getByText(/ذخیره شد · تجدیدنظر/).waitFor();
    doc = (await (await page.request.get(base + "/api/designs/" + id)).json()).design;
    assert.equal(doc.floorHeightM, 4);
    assert.equal(doc.items[index].heightM, 1.7);
    assert.equal(doc.items[index].sillM, 0.5);
    await page.getByText("اشتراک‌گذاری فقط‌خواندنی", { exact: true }).click();
    await page.getByRole("button", { name: "ساخت لینک بازبینی", exact: true }).click();
    const input = page.getByLabel("لینک خصوصی بازبینی", { exact: true });
    await input.waitFor();
    const link = await input.inputValue();
    const outsider = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const review = await outsider.newPage();
    review.on("pageerror", (e) => errors.push(e.message));
    await review.goto(link);
    const image = review.getByRole("img", { name: "نقشهٔ اشتراک‌گذاری‌شده، فقط برای بازبینی" });
    await image.waitFor();
    await review.waitForFunction(() => {
      const img = document.querySelector("main img");
      return img && img.complete && img.naturalWidth > 0;
    });
    const downloadPromise = review.waitForEvent("download");
    await review.getByRole("button", { name: "دریافت PDF بازبینی", exact: true }).click();
    const download = await downloadPromise;
    fs.mkdirSync(".preview/browser-qa", { recursive: true });
    await download.saveAs(".preview/browser-qa/review.pdf");
    assert.equal((await outsider.request.get(base + "/api/designs/" + id)).status(), 404);
    await review.screenshot({ path: ".preview/browser-qa/clinic-review.png", fullPage: true });
    // تصویر رابط بدون نمایش لینک/کلید خصوصی.
    await page.getByText("اشتراک‌گذاری فقط‌خواندنی", { exact: true }).click();
    await page.screenshot({ path: ".preview/browser-qa/studio.png", fullPage: true });
    await page.getByText("اشتراک‌گذاری فقط‌خواندنی", { exact: true }).click();
    await page.getByRole("button", { name: "لغو لینک", exact: true }).click();
    await page.getByText("لینک لغو شد.", { exact: true }).waitFor();
    await review.reload();
    await review.getByRole("alert").filter({ hasText: "لینک معتبر نیست" }).waitFor();
    // بازیابی از مرورگر تازه و بی‌اعتبار شدن نشست قبلی.
    const recovered = await browser.newContext();
    const login = await recovered.newPage();
    login.on("pageerror", (e) => errors.push(e.message));
    await login.goto(base + "/design", { waitUntil: "networkidle" });
    const access = login.getByRole("region", { name: "حساب و بازیابی فضای کار" });
    await access.locator("select").first().selectOption("recover");
    await access.getByLabel("کلید بازیابی", { exact: true }).fill(recovery);
    await access.getByLabel("گذرواژه", { exact: true }).fill(randomBytes(24).toString("base64url"));
    await access.getByRole("button", { name: "بازیابی فضای کار", exact: true }).click();
    await access.locator("code").waitFor();
    assert.equal((await recovered.request.get(base + "/api/designs/" + id)).status(), 200);
    assert.equal((await page.request.get(base + "/api/designs/" + id)).status(), 401);
    const removed = await recovered.request.delete(base + "/api/designs/" + id, { headers: { origin: base } });
    assert.equal(removed.status(), 200);
    assert.deepEqual(errors, []);
    console.log(
      "ثبت‌نام، الگوی درمانگاه، پارامترها، ذخیره، نمایش و PDF مهمان، لغو اشتراک و بازیابی در Chromium: موفق؛ خطای جاوااسکریپت: صفر.",
    );
  } catch (error) {
    console.log("خطاهای مرورگر:", errors);
    console.log("وضعیت رابط:", await page.locator("[role=status], [role=alert]").allTextContents());
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
