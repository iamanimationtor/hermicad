/* وابستگی‌های اختیاری مانند qa-structures-browser.cjs؛ فقط روی سرور QA. */
const { chromium: pw } = require("playwright-core");
const chromium = require("@sparticuz/chromium").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.HERMICAD_QA_URL || "http://127.0.0.1:3002";

(async () => {
  const browser = await pw.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args.filter((arg) => !["--disable-web-security", "--single-process"].includes(arg)),
    headless: true,
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let id;
  try {
    await page.goto(base + "/scope", { waitUntil: "networkidle" });
    assert.equal(await page.getByRole("heading", { name: "دامنه، محدودیت و شواهد" }).count(), 1);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.evaluate(() => Array.from(document.fonts).some((face) => face.family === "Vazirmatn" && face.status === "loaded")), "قلم فارسی محلی بارگیری شود");
    assert.equal(await page.getByText("ارزیابی نشده", { exact: true }).count(), 3);
    await page.getByRole("radio", { name: "مدل‌های محاسبه" }).check();
    await page.getByRole("searchbox", { name: "جست‌وجو در ردیف‌ها" }).fill("هیدرواستاتیک");
    const row = page.locator("details").filter({ hasText: "فشار هیدرواستاتیک دیوار قائم" });
    assert.equal(await row.count(), 1);
    assert.match(await page.locator('[aria-live="polite"]').innerText(), /نمایش 1 از/);
    await row.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await row.evaluate((element) => element.open), true, "بازشدن جزئیات با صفحه‌کلید");
    assert.ok(await row.getByText("شش وضعیت مستقل").isVisible());
    assert.ok(await row.getByText("این ردیف ادعای انطباق قانونی ندارد.", { exact: false }).isVisible());
    fs.mkdirSync(".preview/scope-qa", { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".preview/scope-qa/desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".preview/scope-qa/mobile.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "صفحهٔ دامنه در موبایل سرریز نکند");
    await page.getByRole("searchbox", { name: "جست‌وجو در ردیف‌ها" }).fill("عبارتی که در دفتر نیست");
    assert.ok(await page.getByText("ردیفی با این جست‌وجو پیدا نشد", { exact: false }).isVisible());

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/structures", { waitUntil: "networkidle" });
    await page.locator('input[value="cold-formed-steel"]').check();
    await page.getByLabel("۲. نام پروژه").fill("آزمون تفکیک فولاد سردنوردشده");
    await page.getByRole("button", { name: "ایجاد پروندهٔ تخصصی", exact: true }).click();
    await page.waitForURL(/\/structures\/cold-formed-steel\/[a-f0-9-]+$/);
    id = page.url().split("/").pop();
    await page.getByRole("button", { name: "2. هندسه و مصالح", exact: true }).click();
    const product = page.getByLabel("محصول، شکل مقطع، ضخامت با واحد، پوشش و گواهی فنی", { exact: true });
    await product.fill("مقطع آزمایشی؛ ضخامت ۱ میلی‌متر");
    assert.equal(await page.getByLabel("گونه/محصول، رده مقاومت، رطوبت و گواهی فنی", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "ذخیرهٔ پرونده", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "ذخیره شد" }).waitFor();
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await product.inputValue(), "مقطع آزمایشی؛ ضخامت ۱ میلی‌متر");
    await page.getByRole("button", { name: "4. ارزیابی محدود", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "ایجاد مدل تحلیل دوبعدی" }).count(), 0);
    await page.getByText("حل‌گر اختصاصی این خانواده هنوز موجود نیست.", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log("Chromium دفتر: جست‌وجو، فیلتر، صفحه‌کلید و موبایل؛ فولاد سردنوردشده: ثبت، ذخیره/بازخوانی و عدم ادعای حل‌گر؛ صفر خطای JS.");
  } finally {
    if (id) assert.equal((await page.request.delete(base + "/api/designs/" + id, { headers: { origin: base } })).status(), 200);
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
