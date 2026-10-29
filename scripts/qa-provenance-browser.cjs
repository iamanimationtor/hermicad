/* آزمون اختیاری Chromium در برابر پایگاه موقت QA؛ به playwright-core و @sparticuz/chromium نیاز دارد. */
const { chromium: pw } = require("playwright-core");
const chromium = require("@sparticuz/chromium").default;
const assert = require("node:assert/strict");
const fs = require("node:fs");
const base = process.env.HERMICAD_QA_URL || "http://127.0.0.1:3002";

(async () => {
  const browser = await pw.launch({ executablePath: await chromium.executablePath(),
    args: chromium.args.filter((arg) => !["--disable-web-security", "--single-process"].includes(arg)), headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [], ids = [];
  context.on("page", (tab) => tab.on("pageerror", (error) => errors.push(error.message)));
  page.on("pageerror", (error) => errors.push(error.message));
  const freshness = (tab) => tab.locator('section[aria-label="وضعیت تازگی طرح"]');
  try {
    await page.goto(base + "/", { waitUntil: "networkidle" });
    const created = await page.request.post(base + "/api/projects", { headers: { origin: base }, data: { name: "آزمون مرورگر نسخه و منشأ" } });
    assert.equal(created.status(), 201);
    const { project } = await created.json();
    ids.push(project.id);
    await page.goto(base + `/projects/${project.id}`, { waitUntil: "networkidle" });
    const boundary = page.getByLabel("رئوس مرز زمین (x, y)"), original = await boundary.inputValue();
    const saveSite = page.getByRole("button", { name: "ذخیره زمین و نسخه جدید" });
    await boundary.fill("0, 0\n30, 0\nداده نامعتبر");
    assert.equal(await saveSite.isDisabled(), true, "متن ناقص نباید هندسهٔ قدیمی را بی‌صدا ذخیره کند");
    assert.ok(await page.getByText("دقیقاً 2 عدد متناهی", { exact: false }).isVisible());
    await boundary.fill(original);
    await page.getByLabel("ظرفیت باربری خاک").fill("201");
    await saveSite.click();
    await page.getByText("زمین ذخیره شد", { exact: false }).waitFor();
    await page.getByRole("button", { name: /نیازمندی‌ها/ }).click();
    await page.getByLabel("تعداد استودیو").fill("1");
    const text = page.getByLabel("متن نیازمندی");
    await text.fill((await text.inputValue()) + " و یک یادداشت دستی");
    assert.ok(await page.getByText("متن تغییر کرده و هنوز استخراج مجدد نشده", { exact: false }).isVisible());
    await page.getByRole("button", { name: "ذخیره نیازمندی", exact: true }).click();
    await page.getByText("نیازمندی ذخیره شد", { exact: false }).waitFor();
    const inputs = await (await page.request.get(base + `/api/projects/${project.id}`)).json();
    assert.equal(inputs.project.siteRevision, 2);
    assert.equal(inputs.project.requirementRevision, 2);
    assert.equal(inputs.project.requirements.dwellings.find((item) => item.type === "studio").count, 1);
    assert.equal(inputs.project.requirements.parse.confidence, 0);
    assert.equal(inputs.project.requirements.parse.matched.length, 0);

    await page.getByRole("button", { name: "تولید طرح‌ها", exact: true }).first().click();
    await freshness(page).getByText("در آخرین بازخوانی، مبنای طرح با ورودی هم‌خوان بود").waitFor({ timeout: 40000 });
    assert.ok(await freshness(page).getByText("صحت مهندسی", { exact: false }).isVisible());
    assert.equal(await page.getByRole("link", { name: "دانلود PDF", exact: true }).count(), 1);
    const second = await context.newPage();
    await second.goto(base + `/projects/${project.id}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /زمین و محدودیت‌ها/ }).click();
    await second.getByRole("button", { name: /زمین و محدودیت‌ها/ }).click();
    await page.getByLabel("ظرفیت باربری خاک").fill("210");
    await saveSite.click();
    await freshness(page).getByText("این طرح نسبت به پروژه قدیمی است").waitFor();
    assert.equal(await page.getByRole("link", { name: "دانلود PDF", exact: true }).count(), 0);
    await page.getByRole("button", { name: /اعتبارسنجی و اصلاح/ }).click();
    assert.equal(await page.getByRole("button", { name: "اجرای حلقه اصلاح" }).isDisabled(), true);
    await page.getByRole("button", { name: /خروجی و ردیابی/ }).click();
    assert.ok(await page.getByText("خروجی این نسخه تا تولید مجدد یا رفع روش خارج از دامنه قابل دریافت نیست.").isVisible());
    await second.getByLabel("ظرفیت باربری خاک").fill("211");
    await second.getByRole("button", { name: "ذخیره زمین و نسخه جدید" }).click();
    await second.getByRole("alert").getByText("نسخهٔ زمین تغییر کرده است", { exact: false }).waitFor();
    assert.equal(await second.getByLabel("ظرفیت باربری خاک").inputValue(), "211", "پیش‌نویس در تعارض حفظ شود");
    second.once("dialog", (dialog) => dialog.accept());
    await second.getByRole("button", { name: "بازخوانی پروژه" }).click();
    await freshness(second).getByText("این طرح نسبت به پروژه قدیمی است").waitFor();
    assert.equal(await second.getByLabel("ظرفیت باربری خاک").inputValue(), "210");

    await page.getByRole("button", { name: "تولید مجدد پنج طرح", exact: true }).click();
    await freshness(page).getByText("در آخرین بازخوانی، مبنای طرح با ورودی هم‌خوان بود").waitFor({ timeout: 40000 });
    await page.getByText("سابقهٔ اجراها و بازیابی برای بازبینی").click();
    const links = page.getByRole("link", { name: "مشاهدهٔ آرشیو JSON" });
    assert.ok(await links.count() >= 2);
    const archive = await page.request.get(base + await links.last().getAttribute("href"));
    assert.equal(archive.status(), 200);
    assert.equal((await archive.json()).historicalOnly, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    fs.mkdirSync(".preview/provenance-qa", { recursive: true });
    await page.screenshot({ path: ".preview/provenance-qa/mobile.png", fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "کارگاه در موبایل نباید سرریز افقی صفحه داشته باشد");

    const intake = await context.newPage();
    await intake.goto(base + "/new", { waitUntil: "networkidle" });
    await intake.locator("#project-name").fill("آزمون مسیر هدایت‌شده");
    await intake.getByRole("button", { name: "4. بازبینی" }).click();
    await intake.getByRole("button", { name: "ساخت پروژه و تولید ۵ طرح" }).click();
    await intake.waitForURL(/\/projects\/[a-f0-9-]+$/, { timeout: 60000 });
    const intakeId = intake.url().split("/").pop(); ids.push(intakeId);
    await freshness(intake).getByText("در آخرین بازخوانی، مبنای طرح با ورودی هم‌خوان بود").waitFor();
    const intakeData = await (await intake.request.get(base + `/api/projects/${intakeId}`)).json();
    assert.equal(intakeData.project.siteRevision, 1);
    assert.equal(intakeData.project.requirementRevision, 1);
    assert.equal(intakeData.schemes.length, 5);
    assert.equal(intakeData.project.site.seismicZone, null);
    assert.ok(intakeData.schemes.every((item) => item.model.structural.seismicBaseShearKN === null && item.report.evaluations.find((rule) => rule.ruleId === "STRUCT-02-SEISMIC").status === "insufficient"));
    assert.ok(intakeData.ranking.every((item) => item.comparisonComplete === false && item.pareto === null));
    assert.ok(await intake.getByText("مقایسه ناقص است", { exact: true }).isVisible());
    await intake.getByRole("button", { name: /تحلیل مهندسی/ }).click();
    assert.ok(await intake.getByText("محاسبه نشد — اطلاعات ناکافی", { exact: true }).isVisible());
    assert.ok(await intake.getByText("محاسبه نشد — پهنه نامشخص", { exact: true }).isVisible());
    await intake.getByRole("button", { name: /طرح‌ها و مقایسه/ }).click();
    assert.ok(await intake.getByText("امتیاز جزئی — مقایسه ناقص", { exact: true }).isVisible());
    await intake.getByRole("button", { name: /زمین و محدودیت‌ها/ }).click();
    assert.equal(await intake.getByLabel("پهنه لرزه‌ای").inputValue(), "");
    await intake.getByLabel("پهنه لرزه‌ای").selectOption("high");
    await intake.getByRole("button", { name: "ذخیره زمین و نسخه جدید" }).click();
    await freshness(intake).getByText("این طرح نسبت به پروژه قدیمی است").waitFor();
    await intake.getByRole("button", { name: "تولید مجدد پنج طرح", exact: true }).click();
    await freshness(intake).getByText("در آخرین بازخوانی، مبنای طرح با ورودی هم‌خوان بود").waitFor({ timeout: 40000 });
    const knownData = await (await intake.request.get(base + `/api/projects/${intakeId}`)).json();
    assert.equal(knownData.project.site.seismicZone, "high");
    assert.ok(knownData.schemes.every((item) => item.model.structural.seismicCoefficient === 0.1));
    assert.ok(knownData.ranking.every((item) => item.comparisonComplete));

    const outsideReq = { ...knownData.project.requirements, floorsMax: 30, farMax: 12,
      dwellings: [{ type: "twoBed", count: 90, targetAreaM2: 80, minAreaM2: 70 }] };
    const outsideCreate = await intake.request.post(base + "/api/projects", { headers: { origin: base },
      data: { name: "آزمون نمای خارج دامنه", site: knownData.project.site, requirements: outsideReq } });
    assert.equal(outsideCreate.status(), 201);
    const outsideProject = (await outsideCreate.json()).project; ids.push(outsideProject.id);
    const outsideGenerate = await intake.request.post(base + `/api/projects/${outsideProject.id}/generate`, { headers: { origin: base },
      data: { variants: 1, seed: 1, expectedSiteRevision: 1, expectedRequirementRevision: 1 }, timeout: 60000 });
    assert.equal(outsideGenerate.status(), 200);
    await intake.goto(base + `/projects/${outsideProject.id}`, { waitUntil: "networkidle" });
    assert.ok(await intake.getByLabel("روش خارج از دامنه").isVisible());
    assert.ok(await intake.getByText("روش خارج از دامنه است؛ اعداد مربوط غیرقابل استفاده‌اند و صدور فایل مسدود است.", { exact: true }).isVisible());
    assert.equal(await intake.getByRole("link", { name: "دانلود PDF", exact: true }).count(), 0);
    await intake.getByRole("button", { name: /خروجی و ردیابی/ }).click();
    assert.ok(await intake.getByText("خروجی این نسخه تا تولید مجدد یا رفع روش خارج از دامنه قابل دریافت نیست.").isVisible());

    const failed = await context.newPage();
    await failed.goto(base + "/new", { waitUntil: "networkidle" });
    await failed.locator("#project-name").fill("آزمون شکست پس از ایجاد");
    await failed.getByRole("button", { name: "4. بازبینی" }).click();
    await failed.route("**/api/projects/*/generate", (route) => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "تولید آزمونی ناموفق", detail: [] }) }));
    await failed.getByRole("button", { name: "ساخت پروژه و تولید ۵ طرح" }).click();
    const recover = failed.getByRole("link", { name: "باز کردن پروژهٔ ثبت‌شده" });
    await recover.waitFor({ timeout: 30000 });
    const failedId = (await recover.getAttribute("href")).split("/").pop(); ids.push(failedId);
    assert.equal(await failed.getByRole("button", { name: "ساخت پروژه و تولید ۵ طرح" }).count(), 0);
    assert.equal((await failed.request.get(base + `/api/projects/${failedId}`)).status(), 200);
    assert.deepEqual(errors, []);
    console.log("Chromium منشأ: فرم‌های نسخه‌دار، رد متن ناقص، تعارض دو برگه، قفل خروجی، بازیابی، موبایل و مسیر هدایت‌شده بررسی شد؛ صفر خطای JS.");
  } finally {
    for (const id of ids) {
      const result = await page.request.delete(base + `/api/projects/${id}`, { headers: { origin: base } });
      assert.equal(result.status(), 200);
    }
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
