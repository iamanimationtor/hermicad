const { chromium: pw } = require("playwright-core");
const chromium = require("@sparticuz/chromium").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.HERMICAD_QA_URL || "http://127.0.0.1:3002";
(async () => {
  const browser = await pw.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args.filter((a) => !["--disable-web-security", "--single-process"].includes(a)),
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(base + "/structures", { waitUntil: "networkidle" });
    await page.locator('input[value="steel"]').check();
    await page.getByLabel("۲. نام پروژه").fill("آزمون قاب دوبعدی یکپارچه");
    await page.getByRole("button", { name: "ایجاد پروندهٔ تخصصی", exact: true }).click();
    await page.waitForURL(/\/structures\/steel\/[a-f0-9-]+$/);
    const id = page.url().split("/").pop();
    await page.getByRole("button", { name: "4. ارزیابی محدود", exact: true }).click();
    await page.getByRole("button", { name: "ایجاد مدل تحلیل دوبعدی", exact: true }).click();
    await page.getByLabel("نمونهٔ آغاز مدل", { exact: true }).selectOption("portal");
    const confirm = page.getByRole("checkbox", { name: /فرض‌های مدل صفحه‌ای/ });
    await confirm.check();
    await page.getByRole("button", { name: "نتایج تحلیل", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "حل خطی انجام شد" }).waitFor();
    await page.getByRole("button", { name: "شکل تغییر‌یافته", exact: true }).click();
    await page.getByRole("button", { name: "بزرگنمایی مدل", exact: true }).click();
    await page.getByRole("button", { name: "کوچک‌نمایی مدل", exact: true }).click();
    assert.equal(await page.getByRole("img", { name: "نمای مدل تحلیلی قاب دوبعدی" }).count(), 1);
    await page.getByLabel("حالت نمایش نتیجه", { exact: true }).selectOption("2");
    await page.getByRole("button", { name: "نمودار لنگر", exact: true }).click();
    await page.getByRole("button", { name: "حالت‌های بار", exact: true }).click();
    await page.getByLabel("حالت بار فعال", { exact: true }).selectOption("LC2");
    await page.getByLabel("N2 fx (kN)", { exact: true }).fill("۱۲٫۵");
    assert.equal(await confirm.isChecked(), false);
    await confirm.check();
    await page.getByRole("button", { name: "نتایج تحلیل", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "حل خطی انجام شد" }).waitFor();
    await page.getByRole("button", { name: "ذخیرهٔ پرونده", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "ذخیره شد" }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "نتایج تحلیل", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "حل خطی انجام شد" }).waitFor();
    const doc = (await (await page.request.get(base + "/api/designs/" + id)).json()).design;
    assert.equal(doc.brief.structural.frame.cases[1].nodes[0].fx, 12.5);
    await page.getByRole("button", { name: "ذخیره و مرحلهٔ بعد", exact: true }).click();
    await page.getByRole("heading", { name: "5. گزارش و مدارک لازم", exact: true }).waitFor();
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name: "دریافت گزارش مقدماتی تخصصی", exact: true }).click();
    fs.mkdirSync(".preview/frame-qa", { recursive: true });
    await (await promise).saveAs(".preview/frame-qa/browser-report.zip");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".preview/frame-qa/desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".preview/frame-qa/mobile.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "سرریز موبایل");
    assert.equal((await page.request.delete(base + "/api/designs/" + id, { headers: { origin: base } })).status(), 200);
    assert.deepEqual(errors, []);
    console.log("Chromium قاب: نمونه، بار فارسی، بازنشانی بررسی فرض‌ها، تحلیل، نمودار، ذخیره/بازخوانی، گزارش و موبایل؛ صفر خطای JS.");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
