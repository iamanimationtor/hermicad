/* وابستگی‌های اختیاری همان qa-studio-browser.cjs است. */
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
    await page.goto(base + "/guide", { waitUntil: "networkidle" });
    await page.getByLabel("نام پروژه", { exact: true }).fill("دفتر طراحی نیلوفر");
    await page.getByLabel("از کجا شروع کنیم؟", { exact: true }).selectOption("office");
    await page.getByRole("button", { name: "شروع مسیر راهنما", exact: true }).click();
    await page.waitForURL(/\/guide\/[a-f0-9-]+$/);
    const id = page.url().split("/").pop();
    await page.getByRole("heading", { name: "1. پروژه و هدف", exact: true }).waitFor();
    assert.equal(await page.getByLabel("کاربری اصلی").inputValue(), "office");
    await page.getByLabel("کاربری اصلی").selectOption("school");
    await page.getByLabel("هدف نهایی شما").selectOption("execution");
    const next = async () => {
      await page.getByRole("button", { name: "ذخیره و مرحلهٔ بعد", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "ذخیره شد" }).waitFor();
    };
    await next();
    await page.getByLabel("شهر و مرجع صدور پروانه", { exact: true }).fill("تهران، منطقهٔ پروژه");
    await page.getByLabel("عرض زمین", { exact: false }).fill("24");
    await page.getByLabel("عمق زمین", { exact: false }).fill("20");
    await next();
    await page.getByLabel("تعداد کلاس", { exact: true }).fill("3");
    assert.equal(await page.getByLabel("تعداد واحد مسکونی", { exact: true }).count(), 0);
    await page.getByLabel("ارتفاع کف تا کف", { exact: false }).fill("3.2");
    await page.getByLabel("تعداد طبقات موردنیاز", { exact: true }).fill("1");
    await next();
    await page.getByRole("checkbox", { name: "سازه", exact: true }).check();
    await page.getByLabel("ظرفیت مجاز باربری خاک", { exact: false }).waitFor();
    await page.getByRole("checkbox", { name: "سازه", exact: true }).uncheck();
    assert.equal(await page.getByLabel("ظرفیت مجاز باربری خاک", { exact: false }).count(), 0);
    await next();
    await page.getByText("تحویل اجرایی/پروانه: تأیید نشده", { exact: true }).waitFor();
    fs.mkdirSync(".preview/journey-qa", { recursive: true });
    await page.screenshot({ path: ".preview/journey-qa/review.png", fullPage: true });
    await next();
    await page.getByRole("heading", { name: "6. بستهٔ تحویل", exact: true }).waitFor();
    // دانلود پس از ذخیرهٔ همان snapshot؛ goal اجرایی نباید فایل تأییدشده ایجاد کند.
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "دریافت بستهٔ بازبینی (ZIP)", exact: true }).click();
    const download = await downloadPromise;
    await download.saveAs(".preview/journey-qa/browser-delivery.zip");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "6. بستهٔ تحویل", exact: true }).waitFor();
    const stored = (await (await page.request.get(base + "/api/designs/" + id)).json()).design;
    assert.equal(stored.brief.use, "school");
    assert.equal(stored.brief.values.classrooms, 3);
    assert.equal(stored.brief.goal, "execution");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".preview/journey-qa/delivery.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".preview/journey-qa/mobile.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "اسکرول افقی در موبایل");
    assert.equal((await page.request.delete(base + "/api/designs/" + id, { headers: { origin: base } })).status(), 200);
    assert.deepEqual(errors, []);
    console.log("مسیر شش‌مرحله‌ای، فیلتر کاربری/رشته، ذخیره و بازگشایی، دانلود واقعی و عرض موبایل در Chromium: موفق؛ خطای JS صفر.");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
