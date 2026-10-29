/* وابستگی‌های اختیاری همان qa-studio-browser.cjs. */
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
    assert.equal(await page.getByRole("radio").count(), 11);
    assert.equal(await page.locator('input[value="cold-formed-steel"]').count(), 1);
    await page.locator('input[value="tank"]').check();
    await page.getByLabel("۲. نام پروژه").fill("مخزن آزمایشی کنترل کیفیت");
    await page.getByRole("button", { name: "ایجاد پروندهٔ تخصصی", exact: true }).click();
    await page.waitForURL(/\/structures\/tank\/[a-f0-9-]+$/);
    const id = page.url().split("/").pop();
    await page.getByRole("heading", { name: "1. مبنای طراحی", exact: true }).waitFor();
    await page.getByLabel("کارکرد و کاربری واقعی سازه", { exact: true }).fill("ذخیره آب شرب");
    await page.getByLabel("موقعیت و مرجع تأیید پروژه", { exact: true }).fill("تهران — دادهٔ آزمایشی");
    await page.getByLabel("نوع مداخله", { exact: true }).selectOption("بهسازی");
    await page.getByLabel("ارزیابی موجود و هدف عملکرد بهسازی", { exact: true }).waitFor();
    await page.getByLabel("نوع مداخله", { exact: true }).selectOption("احداث جدید");
    assert.equal(await page.getByLabel("ارزیابی موجود و هدف عملکرد بهسازی", { exact: true }).count(), 0);
    const next = async () => {
      await page.getByRole("button", { name: "ذخیره و مرحلهٔ بعد", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "ذخیره شد" }).waitFor();
    };
    await next();
    await page.getByLabel("شکل مخزن", { exact: true }).selectOption("مدور");
    await page.getByLabel("قطر داخلی مخزن", { exact: false }).fill("10");
    assert.equal(await page.getByLabel("طول و عرض داخلی و تقسیم‌بندی مخزن", { exact: true }).count(), 0);
    await next();
    await page.getByLabel("بار مرده، زنده، تجهیزات و نحوه اعمال", { exact: true }).fill("در انتظار محاسبات تخصصی");
    await next();
    await page.getByLabel("دامنه مدل مایع", { exact: true }).selectOption("مایع ساکن؛ دیوار قائم، سطح آزاد و فشار جو");
    await page.getByLabel("عمق مایع", { exact: false }).fill("۳");
    await page.getByLabel("چگالی مایع", { exact: false }).fill("۱٬۰۰۰");
    await page.getByText("29.41995 kPa", { exact: true }).waitFor();
    await next();
    fs.mkdirSync(".preview/structures-qa", { recursive: true });
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name: "دریافت گزارش مقدماتی تخصصی", exact: true }).click();
    await (await promise).saveAs(".preview/structures-qa/browser.zip");
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "5. گزارش و مدارک لازم", exact: true }).waitFor();
    const doc = (await (await page.request.get(base + "/api/designs/" + id)).json()).design;
    assert.equal(doc.brief.structural.values.liquidH, 3);
    assert.equal(doc.brief.structural.values.tankDiameter, 10);
    assert.equal(await page.getByRole("link", { name: "استودیو ترسیم", exact: true }).count(), 0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".preview/structures-qa/desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: ".preview/structures-qa/mobile.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "اسکرول افقی موبایل");
    await page.getByLabel("مرحلهٔ تخصصی", { exact: true }).selectOption("1");
    await page.getByLabel("شکل مخزن", { exact: true }).waitFor();
    const concurrent = (await (await page.request.get(base + "/api/designs/" + id)).json()).design;
    concurrent.brief.structural.step = 1;
    concurrent.brief.structural.values.tankDiameter = 12;
    assert.equal(
      (await page.request.put(base + "/api/designs/" + id, { headers: { origin: base }, data: { document: concurrent } })).status(),
      200,
    );
    await page.getByLabel("قطر داخلی مخزن", { exact: false }).fill("۱۱");
    await page.getByRole("button", { name: "ذخیرهٔ پرونده", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "نسخهٔ جدیدتری روی سرور" }).waitFor();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "بارگیری آخرین نسخه", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "آخرین نسخه بارگیری شد." }).waitFor();
    assert.equal(await page.getByLabel("قطر داخلی مخزن", { exact: false }).inputValue(), "12");
    assert.equal((await page.request.delete(base + "/api/designs/" + id, { headers: { origin: base } })).status(), 200);
    assert.deepEqual(errors, []);
    console.log("Chromium: انتخاب خانواده، فیلتر وابسته، محاسبه زنده، ذخیره، بازگشایی، دانلود ZIP و موبایل؛ خطای JS صفر.");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
