import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const base = "http://127.0.0.1:4173";
const shots = "output/ui";
let server;

before(async () => {
  server = spawn(process.execPath, ["scripts/serve.mjs"], { stdio: "ignore" });
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const response = await fetch(`${base}/index.html`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Local preview server did not start");
});

after(() => server?.kill());

async function capture(page, path) {
  await page.waitForTimeout(100);
  try {
    await page.screenshot({ path });
  } catch {
    await page.waitForTimeout(250);
    await page.screenshot({ path });
  }
}

async function withBrowser(run, { rateHandler } = {}) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1365, height: 850 } });
    await context.route("https://api.frankfurter.dev/**", route => rateHandler ? rateHandler(route) : route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ date: "2026-06-20", base: "USD", quote: "INR", rate: 94.37 }])
    }));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await run({ context, page });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

test("install page, dashboard utilities, and local persistence work", async () => {
  await mkdir(shots, { recursive: true });
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/index.html`);
    await capture(page, `${shots}/install.png`);
    const installedHref = await page.locator("#install").getAttribute("href");
    assert.equal(installedHref.startsWith("javascript:"), true);
    assert.equal(installedHref, await readFile("dist/bookmarklet.txt", "utf8"));
    assert.match(await page.locator(".warning").textContent(), /New Tab/);
    const popupPromise = page.context().waitForEvent("page");
    await page.locator("#testLaunch").click();
    const popup = await popupPromise;
    await popup.locator(".shell").waitFor();
    await popup.waitForFunction(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1") || "{}").settings?.usdInrSourceDate);
    assert.equal(page.context().pages().length, 2);
    await popup.close();

    await page.goto(`${base}/preview.html`);
    await capture(page, `${shots}/dashboard.png`);
    await page.click('[data-page="text"]');
    await page.keyboard.press("Control+K");
    assert.equal(await page.locator("#palette").evaluate(node => !node.classList.contains("hidden")), true);
    await page.keyboard.press("Escape");
    await page.click('[data-page="calculator"]');
    await page.fill("#calcInput", "sin(pi / 2) + sqrt(16)");
    await page.press("#calcInput", "Enter");
    assert.equal(await page.locator("#calcResult").textContent(), "5");

    await page.click('[data-page="organizer"]');
    await page.click("#newNote");
    await page.fill("#noteTitle", "Smoke Test Note");
    await page.fill("#noteBody", "# Saved by browser smoke test");
    await page.waitForTimeout(500);
    await page.click('[data-organizer-view="tasks"]');
    await page.fill("#todoInput", "Verify local task");
    await page.click("#todoAdd");
    assert.equal(await page.locator("#todoList .task-item").count(), 1);
    await page.reload();
    await page.click('[data-page="organizer"]');
    assert.equal(await page.inputValue("#noteTitle"), "Smoke Test Note");
    assert.equal(await page.inputValue("#noteBody"), "# Saved by browser smoke test");
    await page.click('[data-organizer-view="tasks"]');
    assert.equal(await page.locator(".task-text").inputValue(), "Verify local task");

    await page.click('[data-page="qr"]');
    assert.equal(await page.locator("#qrOutput img").count(), 1);

    await page.click('[data-page="convert"]');
    assert.equal(await page.locator("#convType").evaluate(node => getComputedStyle(node).appearance), "none");
    assert.match(await page.locator("label[for=convType]").textContent(), /Conversion type/i);
    const convTypeTrigger = page.locator("#convType + .destiny-select .destiny-select-trigger");
    assert.equal(await page.locator("#convType").evaluate(node => node.classList.contains("native-select-hidden")), true);
    assert.notEqual(await convTypeTrigger.evaluate(node => getComputedStyle(node).backgroundColor), "rgb(255, 255, 255)");
    await page.locator("label[for=convType]").click();
    assert.equal(await convTypeTrigger.getAttribute("aria-expanded"), "true");
    const convTypeMenu = page.locator(`#${await convTypeTrigger.getAttribute("aria-controls")}`);
    assert.equal(await convTypeMenu.getAttribute("role"), "listbox");
    assert.equal(await convTypeMenu.evaluate(node => !node.classList.contains("hidden")), true);
    await convTypeMenu.getByRole("option", { name: "currency", exact: true }).click();
    assert.equal(await page.locator("#convType").inputValue(), "currency");
    await page.waitForFunction(() => [...document.querySelectorAll("#convFrom option")].map(option => option.value).join(",") === "USD,INR");
    assert.match(await page.locator("#convFrom + .destiny-select .destiny-select-trigger").textContent(), /USD/);
    await page.locator("#convFrom + .destiny-select .destiny-select-trigger").click();
    await page.locator("#convTo + .destiny-select .destiny-select-trigger").click();
    assert.equal(await page.locator("#convFrom + .destiny-select .destiny-select-trigger").getAttribute("aria-expanded"), "false");
    await page.locator(".page-head h2").click();
    assert.equal(await page.locator("#convTo + .destiny-select .destiny-select-trigger").getAttribute("aria-expanded"), "false");
    await page.waitForFunction(() => document.querySelector("#currencyRateStatus")?.textContent.includes("ONLINE RATE"));
    await page.locator("#convInput").fill("10");
    assert.equal(await page.locator("#convOutput").inputValue(), "943.7");
    await page.locator("#convOutput").fill("1887.4");
    assert.equal(await page.locator("#convInput").inputValue(), "20");
    await page.locator("#convFrom").selectOption("INR");
    await page.locator("#convTo").selectOption("USD");
    await page.locator("#convInput").fill("943.7");
    assert.equal(await page.locator("#convOutput").inputValue(), "10");
    await page.locator("#usdInrRate").fill("100");
    await page.locator("#convInput").fill("500");
    assert.equal(await page.locator("#convOutput").inputValue(), "5");
    await page.locator("#convType").selectOption("length");
    await page.waitForFunction(() => document.querySelector("#convType + .destiny-select .destiny-select-trigger")?.textContent.includes("length"));
    await page.locator("#convInput").fill("1000");
    assert.equal(await page.locator("#convOutput").inputValue(), "1");
    await page.locator("#convOutput").fill("2.5");
    assert.equal(await page.locator("#convInput").inputValue(), "2500");
    await page.reload();
    await page.click('[data-page="convert"]');
    await page.locator("#convType").selectOption("currency");
    assert.equal(await page.locator("#usdInrRate").inputValue(), "100");
  });
});

test("customization themes, Matrix brightness, density, and favorite ordering persist", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=settings`);
    await page.locator("#themeSetting").selectOption("amber");
    assert.equal(await page.locator("#app").getAttribute("data-theme"), "amber");
    assert.equal(await page.locator("#app").evaluate(node => getComputedStyle(node).getPropertyValue("--bg").trim()), "#080500");
    assert.equal(await page.locator("#accentSetting").inputValue(), "#ffbd3e");

    await page.locator("#brightnessSetting").fill("0.85");
    assert.equal(await page.locator("#brightnessValue").textContent(), "85%");
    assert.equal(await page.locator(".matrix").evaluate(node => getComputedStyle(node).opacity), "0.85");

    await page.locator('[data-density="compact"]').click();
    assert.equal(await page.locator("#app").getAttribute("data-density"), "compact");
    assert.equal(await page.locator(".content").evaluate(node => getComputedStyle(node).paddingTop), "12px");

    await page.locator("#favoriteAddSelect").selectOption("calculator");
    await page.locator("#favoriteAdd").click();
    await page.locator("#favoriteAddSelect").selectOption("games");
    await page.locator("#favoriteAdd").click();
    await page.locator('[data-favorite-up="1"]').click();
    assert.deepEqual(await page.locator(".favorite-item .grow").allTextContents(), ["★ ◆ Arcade", "★ ∑ Calculator"]);
    assert.deepEqual((await page.locator(".nav [data-page]").evaluateAll(nodes => nodes.slice(0, 3).map(node => node.dataset.page))), ["home", "games", "calculator"]);
    await capture(page, `${shots}/customization.png`);

    await page.locator('[data-page="home"]').click();
    assert.deepEqual(await page.locator("[data-quick]").evaluateAll(nodes => nodes.slice(0, 2).map(node => node.dataset.quick)), ["games", "calculator"]);
    assert.equal(await page.locator('[data-quick="games"]').evaluate(node => node.classList.contains("favorite-quick")), true);

    await page.reload();
    assert.equal(await page.locator("#app").getAttribute("data-theme"), "amber");
    assert.equal(await page.locator("#app").getAttribute("data-density"), "compact");
    assert.equal(await page.locator(".matrix").evaluate(node => getComputedStyle(node).opacity), "0.85");
    assert.deepEqual((await page.locator(".nav [data-page]").evaluateAll(nodes => nodes.slice(0, 3).map(node => node.dataset.page))), ["home", "games", "calculator"]);
  });
});

test("enhanced organizer migrates, manages notes and tasks, and imports backups", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html`);
    await page.evaluate(() => localStorage.setItem("bookmarklet-of-destiny:v1", JSON.stringify({
      version: 1,
      notes: "# Legacy note\n<script>window.__noteRan=1</script>",
      todos: [{ text: "Legacy task", done: false }],
      settings: {},
      scores: {}
    })));
    await page.reload();
    await page.click('[data-page="organizer"]');
    const organizerState = () => page.evaluate(() => JSON.parse(window.render_organizer_to_text()));
    let state = await organizerState();
    assert.equal(state.notes.length, 1);
    assert.equal(state.notes[0].title, "Imported Note");
    assert.equal(state.todos[0].priority, "normal");
    assert.ok(state.todos[0].id);
    assert.equal(await page.evaluate(() => window.__noteRan), undefined);
    assert.match(await page.locator("#notePreview").textContent(), /<script>window.__noteRan=1<\/script>/);
    await page.reload();
    await page.click('[data-page="organizer"]');
    assert.equal((await organizerState()).notes.length, 1);

    await page.fill("#newTagName", "Important");
    await page.fill("#newTagColor", "#ff5577");
    await page.click("#addTag");
    await page.click("#newNote");
    await page.fill("#noteTitle", "Project Plan");
    await page.fill("#noteBody", "## Tasks\n\n- Build\n- Test");
    await page.locator(".tag-toggle span").click();
    await page.waitForTimeout(450);
    await page.click("#pinNote");
    state = await organizerState();
    assert.equal(state.notes.length, 2);
    assert.equal(state.notes.find(note => note.title === "Project Plan").pinned, true);
    assert.equal(state.tags.length, 1);
    assert.equal(await page.locator("#notePreview h2").textContent(), "Tasks");
    await capture(page, `${shots}/enhanced-notes.png`);
    await page.click("#duplicateNote");
    assert.match(await page.inputValue("#noteTitle"), /Copy$/);
    await page.click("#archiveNote");
    assert.equal((await organizerState()).notes.find(note => note.title === "Project Plan Copy").archived, true);
    await page.click('[data-organizer-view="archive"]');
    assert.equal(await page.inputValue("#noteTitle"), "Project Plan Copy");
    await page.click("#archiveNote");
    await page.click('[data-organizer-view="notes"]');
    await page.fill("#noteSearch", "Project Plan Copy");
    assert.equal(await page.locator(".note-list-item").count(), 1);
    await page.click("#trashNote");
    await page.fill("#noteSearch", "");
    await page.click('[data-organizer-view="trash"]');
    assert.match(await page.locator("#noteList").textContent(), /Project Plan Copy/);
    await page.click("#restoreNote");

    await page.click('[data-organizer-view="tasks"]');
    await page.fill("#todoInput", "High priority today");
    await page.selectOption("#todoPriority", "high");
    const today = await page.evaluate(() => {
      const date = new Date();
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    });
    await page.fill("#todoDue", today);
    await page.click("#todoAdd");
    await page.click('[data-task-filter="today"]');
    const addedTask = page.locator(".task-item").first();
    assert.equal(await addedTask.locator(".task-text").inputValue(), "High priority today");
    assert.match(await addedTask.getAttribute("class"), /priority-high/);
    await capture(page, `${shots}/enhanced-tasks.png`);
    await addedTask.locator("[data-task-done]").check();
    await page.click('[data-task-filter="completed"]');
    assert.equal(await page.locator(".task-text").first().inputValue(), "High priority today");
    await page.click("#clearCompleted");
    assert.equal(await page.locator(".task-text").count(), 0);

    const downloadPromise = page.waitForEvent("download");
    await page.click("#exportOrganizer");
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), "bookmarklet-of-destiny-organizer.json");

    const backup = {
      format: "bookmarklet-of-destiny-organizer", version: 1,
      notes: [{ id: "import-note", title: "Imported Backup", body: "[unsafe](javascript:alert(1))", tagIds: ["import-tag"], pinned: false, archived: false, trashed: false, createdAt: 1, updatedAt: 2 }],
      tags: [{ id: "import-tag", name: "Backup", color: "#39ff88" }],
      todos: [{ id: "import-task", text: "Imported task", done: false, priority: "low", dueDate: "", createdAt: 1, updatedAt: 2 }]
    };
    await page.setInputFiles("#importOrganizerFile", { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    await page.click("#importMerge");
    await page.waitForFunction(() => document.querySelector("#importStatus")?.textContent.startsWith("MERGED"));
    assert.match(await page.locator("#importStatus").textContent(), /MERGED 1 NOTES, 1 TAGS, 1 TASKS/);
    await page.click('[data-organizer-view="notes"]');
    await page.fill("#noteSearch", "Imported Backup");
    assert.equal(await page.locator(".note-list-item").count(), 1);
    await page.locator(".note-list-item").click();
    assert.equal(await page.locator('#notePreview a[href^="javascript:"]').count(), 0);

    await page.setInputFiles("#importOrganizerFile", { name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":9}') });
    await page.click("#importMerge");
    await page.waitForFunction(() => document.querySelector("#importStatus")?.textContent.startsWith("IMPORT ERROR"));
    assert.match(await page.locator("#importStatus").textContent(), /IMPORT ERROR/);

    const replacement = {
      format: "bookmarklet-of-destiny-organizer", version: 1,
      notes: [{ id: "only-note", title: "Replacement Note", body: "Clean", tagIds: [], pinned: false, archived: false, trashed: false, createdAt: 1, updatedAt: 2 }],
      tags: [], todos: []
    };
    await page.setInputFiles("#importOrganizerFile", { name: "replace.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(replacement)) });
    page.once("dialog", dialog => dialog.accept());
    await page.click("#importReplace");
    await page.waitForFunction(() => document.querySelector("#importStatus")?.textContent.startsWith("REPLACED"));
    state = await organizerState();
    assert.equal(state.notes.length, 1);
    assert.equal(state.notes[0].title, "Replacement Note");
    assert.equal(state.todos.length, 0);

    await page.click('[data-organizer-view="notes"]');
    await page.fill("#noteSearch", "");
    await page.click("#trashNote");
    await page.click('[data-organizer-view="trash"]');
    page.once("dialog", dialog => dialog.accept());
    await page.click("#deleteNoteForever");
    assert.equal((await organizerState()).notes.length, 0);
    await page.click('[data-page="home"]');
    assert.equal(await page.evaluate(() => typeof window.render_organizer_to_text), "undefined");
  });
});

test("currency rates refresh, throttle, persist, and survive failures", async () => {
  let requests = 0;
  let mode = "valid";
  let rate = 95.25;
  await withBrowser(async ({ context, page }) => {
    await page.goto(`${base}/preview.html?page=convert`);
    await page.locator("#convType").selectOption("currency");
    await page.waitForFunction(() => document.querySelector("#currencyRateStatus")?.textContent.includes("ONLINE RATE"));
    assert.equal(requests, 1);
    assert.equal(await page.locator("#usdInrRate").inputValue(), "95.25");
    assert.equal(await page.locator("#convOutput").inputValue(), "95.25");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).settings);
    assert.equal(saved.usdInrSourceDate, "2026-06-21");
    assert.ok(saved.usdInrUpdatedAt > 0);
    assert.ok(saved.usdInrLastAttemptAt > 0);

    await page.reload();
    await page.locator("#convType").selectOption("currency");
    await page.waitForTimeout(100);
    assert.equal(requests, 1);

    await page.locator("#usdInrRate").fill("100");
    assert.match(await page.locator("#currencyRateStatus").textContent(), /MANUAL RATE/);
    rate = 96.5;
    await page.locator("#refreshCurrencyRate").click();
    await page.waitForFunction(() => document.querySelector("#usdInrRate")?.value === "96.5");
    assert.equal(requests, 2);
    assert.match(await page.locator("#currencyRateStatus").textContent(), /ONLINE RATE/);

    mode = "invalid";
    await page.locator("#refreshCurrencyRate").click();
    await page.waitForFunction(() => document.querySelector("#currencyRateStatus")?.textContent.includes("UPDATE FAILED"));
    assert.equal(await page.locator("#usdInrRate").inputValue(), "96.5");

    await context.setOffline(true);
    await page.locator("#refreshCurrencyRate").click();
    await page.waitForFunction(() => document.querySelector("#currencyRateStatus")?.textContent.includes("OFFLINE"));
    assert.equal(await page.locator("#usdInrRate").inputValue(), "96.5");
    mode = "valid";
    rate = 97;
    await context.setOffline(false);
    await page.waitForFunction(() => document.querySelector("#usdInrRate")?.value === "97");
    assert.match(await page.locator("#currencyRateStatus").textContent(), /ONLINE RATE/);
  }, {
    rateHandler: route => {
      requests++;
      if (mode === "invalid") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ date: "bad", base: "USD", quote: "INR", rate: -1 }]) });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ date: "2026-06-21", base: "USD", quote: "INR", rate }]) });
    }
  });
});

test("calendar navigation and local date calculations handle boundaries", async () => {
  await withBrowser(async ({ page }) => {
    await page.addInitScript(() => { window.__BOD_TEST_TODAY__ = "2024-03-01"; });
    await page.goto(`${base}/preview.html?page=calendar`);
    const calendarState = () => page.evaluate(() => JSON.parse(window.render_calendar_to_text()));
    assert.match(await page.locator("#calendarTitle").textContent(), /MARCH 2024/);
    assert.equal(await page.locator('.calendar-day[aria-current="date"]').textContent(), "1");
    assert.equal((await calendarState()).firstWeekday, 5);
    assert.equal((await calendarState()).days, 31);

    await page.locator("#calendarPrev").click();
    assert.match(await page.locator("#calendarTitle").textContent(), /FEBRUARY 2024/);
    assert.equal((await calendarState()).days, 29);
    assert.equal((await calendarState()).firstWeekday, 4);
    await page.locator("#calendarPrev").click();
    assert.match(await page.locator("#calendarTitle").textContent(), /JANUARY 2024/);
    await page.locator("#calendarPrev").click();
    assert.match(await page.locator("#calendarTitle").textContent(), /DECEMBER 2023/);
    await page.locator("#calendarToday").click();
    assert.match(await page.locator("#calendarTitle").textContent(), /MARCH 2024/);

    await page.locator("#daysStart").fill("2024-02-28");
    await page.locator("#daysEnd").fill("2024-03-01");
    await page.locator("#daysCalculate").click();
    assert.match(await page.locator("#daysResult").textContent(), /SIGNED: 2 DAYS.*ABSOLUTE: 2 DAYS/);
    await page.locator("#daysStart").fill("2024-03-01");
    await page.locator("#daysEnd").fill("2024-02-28");
    await page.locator("#daysCalculate").click();
    assert.match(await page.locator("#daysResult").textContent(), /SIGNED: -2 DAYS.*ABSOLUTE: 2 DAYS/);
    await page.locator("#daysEnd").fill("2024-03-01");
    await page.locator("#daysCalculate").click();
    assert.match(await page.locator("#daysResult").textContent(), /SIGNED: 0 DAYS.*ABSOLUTE: 0 DAYS/);

    await page.locator("#addDate").fill("2024-02-28");
    await page.locator("#addDays").fill("1");
    await page.locator("#addCalculate").click();
    assert.match(await page.locator("#addResult").textContent(), /2024-02-29/);
    await page.locator("#addDate").fill("2024-01-01");
    await page.locator("#addDays").fill("-1");
    await page.locator("#addCalculate").click();
    assert.match(await page.locator("#addResult").textContent(), /2023-12-31/);
    await page.locator("#addDays").fill("1.5");
    await page.locator("#addCalculate").click();
    assert.match(await page.locator("#addResult").textContent(), /whole number/i);

    await page.locator("#birthDate").fill("2000-03-01");
    await page.locator("#ageOnDate").fill("2024-03-01");
    await page.locator("#ageCalculate").click();
    assert.match(await page.locator("#ageResult").textContent(), /24 YEARS · 0 MONTHS · 0 DAYS · NEXT BIRTHDAY IN 0 DAYS/);
    await page.locator("#birthDate").fill("2000-03-02");
    await page.locator("#ageCalculate").click();
    assert.match(await page.locator("#ageResult").textContent(), /23 YEARS · 11 MONTHS · 28 DAYS · NEXT BIRTHDAY IN 1 DAY/);
    await page.locator("#birthDate").fill("2000-02-29");
    await page.locator("#ageOnDate").fill("2023-02-28");
    await page.locator("#ageCalculate").click();
    assert.match(await page.locator("#ageResult").textContent(), /23 YEARS · 0 MONTHS · 0 DAYS · NEXT BIRTHDAY IN 0 DAYS/);
    await page.locator("#birthDate").fill("2025-01-01");
    await page.locator("#ageCalculate").click();
    assert.match(await page.locator("#ageResult").textContent(), /cannot be after/i);
    await page.locator("#daysStart").fill("");
    await page.locator("#daysCalculate").click();
    assert.match(await page.locator("#daysResult").textContent(), /valid dates/i);
  });
});

test("world clock persists clocks and handles DST and fractional offsets", async () => {
  await withBrowser(async ({ page }) => {
    await page.addInitScript(() => {
      window.__BOD_TEST_NOW__ = "2024-01-15T12:00:00Z";
      window.__BOD_TEST_TIME_ZONE__ = "UTC";
    });
    await page.goto(`${base}/preview.html?page=worldclock`);
    const worldState = () => page.evaluate(() => JSON.parse(window.render_world_clock_to_text()));
    assert.equal((await worldState()).localZone, "UTC");
    assert.equal((await worldState()).zones.length, 5);
    assert.equal(await page.locator(".world-clock-card").count(), 5);
    assert.match(await page.locator(".world-clock-card").first().textContent(), /LOCAL TIME.*UTC.*SAME DAY/s);
    assert.match(await page.locator(".world-clock-grid").textContent(), /NEW YORK|LONDON|DELHI|TOKYO/);
    assert.ok(await page.locator("#clockZoneAdd option").count() > 300);

    const beforeFormat = (await worldState()).hour24;
    await page.locator("#clockFormat").click();
    assert.equal((await worldState()).hour24, !beforeFormat);
    await page.reload();
    assert.equal((await worldState()).hour24, !beforeFormat);

    const chatham = await page.locator("#clockZoneAdd option").evaluateAll(options => options.find(option => /Pacific\/Chatham/.test(option.value))?.value);
    assert.ok(chatham);
    await page.locator("#clockZoneAdd").selectOption(chatham);
    await page.locator("#clockAdd").click();
    assert.equal(await page.locator(".world-clock-card").count(), 6);
    await page.locator("#clockAdd").click();
    assert.equal(await page.locator(".world-clock-card").count(), 6);
    const zonesBeforeMove = (await worldState()).zones;
    await page.locator("[data-clock-down='1']").click();
    const zonesAfterMove = (await worldState()).zones;
    assert.equal(zonesAfterMove[2], zonesBeforeMove[1]);
    await page.reload();
    assert.deepEqual((await worldState()).zones, zonesAfterMove);
    const chathamIndex = (await worldState()).zones.indexOf(canonicalForTest(chatham));
    await page.locator(`[data-clock-remove='${chathamIndex}']`).click();
    assert.equal((await worldState()).zones.some(zone => /Chatham/.test(zone)), false);

    await page.locator("#clockFormat").click();
    if (!(await worldState()).hour24) await page.locator("#clockFormat").click();
    await page.locator("#worldFromZone").selectOption("America/New_York");
    await page.locator("#worldToZone").selectOption("Europe/London");
    await page.locator("#worldConvertTime").fill("2024-03-10T02:30");
    await page.locator("#worldConvert").click();
    assert.match(await page.locator("#worldConvertResult").textContent(), /does not exist/i);
    await page.locator("#worldConvertTime").fill("2024-11-03T01:30");
    await page.locator("#worldConvert").click();
    const overlap = await page.locator("#worldConvertResult").textContent();
    assert.match(overlap, /TWO VALID RESULTS/i);
    assert.match(overlap, /05:30/);
    assert.match(overlap, /06:30/);

    await page.locator("#worldFromZone").selectOption(canonicalForTest("Asia/Kathmandu"));
    await page.locator("#worldToZone").selectOption("UTC");
    await page.locator("#worldConvertTime").fill("2024-01-01T00:00");
    await page.locator("#worldConvert").click();
    assert.match(await page.locator("#worldConvertResult").textContent(), /Dec 31, 2023.*18:15/s);
    await page.locator("#worldFromZone").selectOption(chatham);
    await page.locator("#worldConvertTime").fill("2024-01-01T00:00");
    await page.locator("#worldConvert").click();
    assert.match(await page.locator("#worldConvertResult").textContent(), /Dec 31, 2023.*10:15/s);
    await page.locator("#worldConvertTime").fill("");
    await page.locator("#worldConvert").click();
    assert.match(await page.locator("#worldConvertResult").textContent(), /valid date/i);
  });
});

function canonicalForTest(zone) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone;
}

test("color tools convert, generate palettes, and evaluate contrast", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=colors`);
    const colorState = () => page.evaluate(() => JSON.parse(window.render_color_tools_to_text()));
    assert.equal((await colorState()).color.hex, "#39FF88");
    assert.match((await colorState()).color.rgb, /rgb\(57, 255, 136\)/);
    assert.match((await colorState()).color.hsl, /hsl\(144, 100%, 61%\)/);
    assert.equal(await page.locator(".vision-card").count(), 4);
    assert.match(await page.locator("#visionGrid").textContent(), /PROTANOPIA.*DEUTERANOPIA.*TRITANOPIA.*ACHROMATOPSIA/s);

    await page.locator("#colorHex").fill("#0F8");
    await page.locator("#colorHex").press("Tab");
    assert.equal((await colorState()).color.hex, "#00FF88");
    await page.locator("#colorHex").fill("#33669980");
    await page.locator("#colorHex").press("Tab");
    assert.equal((await colorState()).color.hex, "#33669980");
    assert.equal(await page.locator("#colorAlpha").inputValue(), "50");
    await page.locator("#colorRgb").fill("rgba(255, 0, 128, 0.25)");
    await page.locator("#colorRgb").press("Tab");
    assert.equal((await colorState()).color.hex, "#FF008040");
    await page.locator("#colorHsl").fill("hsl(120, 100%, 50%)");
    await page.locator("#colorHsl").press("Tab");
    assert.equal((await colorState()).color.hex, "#00FF00");
    const validColor = (await colorState()).color.hex;
    await page.locator("#colorRgb").fill("rgb(999, 0, 0)");
    await page.locator("#colorRgb").press("Tab");
    assert.equal((await colorState()).color.hex, validColor);
    assert.match(await page.locator("#colorError").textContent(), /INVALID RGB/);
    await page.locator("#colorAlpha").fill("101");
    await page.locator("#colorAlpha").press("Tab");
    assert.equal((await colorState()).color.hex, validColor);
    assert.match(await page.locator("#colorError").textContent(), /0–100/);

    const expectedCounts = { complementary: 2, analogous: 5, triadic: 3, split: 3, tetradic: 4, monochromatic: 5, shades: 5 };
    for (const [mode, count] of Object.entries(expectedCounts)) {
      await page.locator("#paletteType").selectOption(mode);
      assert.equal((await colorState()).palette.length, count);
      assert.equal(await page.locator(".palette-swatch").count(), count);
    }
    await page.locator("#paletteType").selectOption("triadic");
    assert.deepEqual((await colorState()).palette, ["#00FF00", "#0000FF", "#FF0000"]);

    await page.locator("#contrastForeground").fill("#000000");
    await page.locator("#contrastBackground").fill("#ffffff");
    assert.equal((await colorState()).contrast, 21);
    assert.match(await page.locator("#contrastResults").textContent(), /21\.00:1.*NORMAL AA PASS.*NORMAL AAA PASS.*LARGE AA PASS.*LARGE AAA PASS/s);
    await page.locator("#contrastSwap").click();
    assert.equal(await page.locator("#contrastForeground").inputValue(), "#ffffff");
    assert.equal(await page.locator("#contrastBackground").inputValue(), "#000000");
    await page.locator("#contrastForeground").fill("#777777");
    await page.locator("#contrastBackground").fill("#ffffff");
    assert.match(await page.locator("#contrastResults").textContent(), /NORMAL AA FAIL.*LARGE AA PASS/s);

    await page.locator('[data-color-copy="hex"]').click();
    await page.waitForTimeout(50);
    assert.match(await page.locator(".toast").textContent(), /copied|failed/i);
    await page.locator(".palette-swatch").first().click();
    await page.waitForTimeout(50);
    assert.ok(await page.locator(".toast").count() >= 1);
  });
});

test("developer tools safely inspect regex, hashes, JWT, Markdown, and scratch code", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=developer`);
    const developerState = () => page.evaluate(() => JSON.parse(window.render_developer_tools_to_text()));
    assert.equal((await developerState()).activeTab, "regex");
    assert.equal(await page.locator('[data-dev-tab]').count(), 5);

    await page.locator("#regexPattern").fill("(\\w+)@(\\w+\\.\\w+)");
    await page.locator("#regexFlags").fill("gi");
    await page.locator("#regexInput").fill("One@site.com and Two@test.org");
    await page.locator("#regexReplacement").fill("$1 at $2");
    await page.locator("#runRegex").click();
    assert.equal((await developerState()).regex.count, 2);
    assert.match(await page.locator("#regexMatches").textContent(), /GROUPS: 1=One · 2=site.com/);
    assert.equal(await page.locator("#regexReplace").textContent(), "One at site.com and Two at test.org");
    await page.locator("#regexPattern").fill("[");
    await page.locator("#runRegex").click();
    assert.match(await page.locator("#regexMatches").textContent(), /ERROR:/);

    await page.locator('[data-dev-tab="hash"]').click();
    await page.locator("#hashText").fill("abc");
    await page.locator("#runHash").click();
    await page.waitForFunction(() => JSON.parse(window.render_developer_tools_to_text()).hashes?.["SHA-512"]);
    const hashes = (await developerState()).hashes;
    assert.equal(hashes["SHA-256"], "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    assert.equal(hashes["SHA-384"], "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7");
    assert.equal(hashes["SHA-512"], "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f");
    await page.locator("#hashFile").setInputFiles({ name: "sample.txt", mimeType: "text/plain", buffer: Buffer.from("abc") });
    assert.match(await page.locator("#hashFileMeta").textContent(), /sample.txt · 3 BYTES/);
    await page.locator("#runHash").click();
    await page.waitForFunction(() => document.querySelector("#runHash")?.textContent === "GENERATE HASHES");
    assert.equal((await developerState()).hashes["SHA-256"], hashes["SHA-256"]);

    const toBase64Url = value => Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${toBase64Url({ alg: "none", typ: "JWT" })}.${toBase64Url({ sub: "user", name: "नमस्ते", iat: 1704067200, exp: 1704153600 })}.`;
    await page.locator('[data-dev-tab="jwt"]').click();
    await page.locator("#jwtInput").fill(token);
    await page.locator("#decodeJwt").click();
    assert.equal((await developerState()).jwt.payload.name, "नमस्ते");
    assert.match(await page.locator("#jwtMeta").textContent(), /IAT:.*EXP:.*UNSIGNED TOKEN.*UNTRUSTED/s);
    await page.locator("#jwtInput").fill("not.a.token.with.too.many.parts");
    await page.locator("#decodeJwt").click();
    assert.match(await page.locator("#jwtHeader").textContent(), /ERROR:/);

    await page.locator('[data-dev-tab="markdown"]').click();
    await page.locator("#markdownInput").fill("# Safe\n\n**bold** and [good](https://example.com) [bad](javascript:alert(1))\n\n<script>window.__markdownRan=1</script>\n\n```js\nconst x = 1;\n```");
    assert.equal(await page.locator("#markdownPreview h1").textContent(), "Safe");
    assert.equal(await page.locator("#markdownPreview strong").textContent(), "bold");
    assert.equal(await page.locator('#markdownPreview a[href="https://example.com"]').count(), 1);
    assert.equal(await page.locator('#markdownPreview a[href^="javascript:"]').count(), 0);
    assert.match(await page.locator("#markdownPreview").textContent(), /<script>window.__markdownRan=1<\/script>/);
    assert.equal(await page.evaluate(() => window.__markdownRan), undefined);

    await page.locator('[data-dev-tab="scratch"]').click();
    await page.locator("#scratchHtml").fill('<h1 onclick="window.__scratchRan=1">Hello</h1><script>window.__scratchRan=2</script><img src="https://example.com/a.png"><a href="javascript:alert(1)">bad</a>');
    await page.locator("#scratchCss").fill('@import "https://example.com/a.css"; h1 { color: rgb(1, 2, 3); background:url(https://example.com/a.png) }');
    await page.locator("#scratchJs").fill("window.__scratchRan=3");
    const scratch = await page.locator("#scratchPreview").evaluate(node => ({
      text: node.shadowRoot.textContent,
      scripts: node.shadowRoot.querySelectorAll("script").length,
      images: node.shadowRoot.querySelectorAll("img").length,
      clickHandler: node.shadowRoot.querySelector("h1")?.getAttribute("onclick"),
      href: node.shadowRoot.querySelector("a")?.getAttribute("href"),
      color: getComputedStyle(node.shadowRoot.querySelector("h1")).color,
      styles: [...node.shadowRoot.querySelectorAll("style")].map(style => style.textContent).join("\n")
    }));
    assert.match(scratch.text, /Hello/);
    assert.equal(scratch.scripts, 0);
    assert.equal(scratch.images, 0);
    assert.equal(scratch.clickHandler, null);
    assert.equal(scratch.href, null);
    assert.equal(scratch.color, "rgb(1, 2, 3)");
    assert.doesNotMatch(scratch.styles, /https:\/\/example.com/);
    assert.equal(await page.evaluate(() => window.__scratchRan), undefined);
    await capture(page, `${shots}/developer-scratchpad.png`);
    await page.locator("#resetScratch").click();
    assert.equal(await page.locator("#scratchHtml").inputValue(), "");

    await page.locator('[data-dev-tab="regex"]').click();
    await page.keyboard.press("ArrowRight");
    assert.equal((await developerState()).activeTab, "hash");
    await page.click('[data-page="home"]');
    assert.equal(await page.evaluate(() => typeof window.render_developer_tools_to_text), "undefined");
  });
});

test("file tools inspect and transform local files offline", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=files`);
    const fileState = () => page.evaluate(() => JSON.parse(window.render_file_tools_to_text()));
    assert.equal((await fileState()).activeTab, "image");
    assert.equal(await page.locator("[data-file-tab]").count(), 5);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64");
    await page.locator("#imageFile").setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: png });
    await page.waitForFunction(() => JSON.parse(window.render_file_tools_to_text()).image?.original);
    await page.locator("#imageWidth").fill("2");
    await page.locator("#imageHeight").fill("3");
    await page.locator("#imageFormat").selectOption("image/jpeg");
    await page.locator("#imageQuality").fill("80");
    await page.locator("#convertImage").click();
    await page.waitForFunction(() => JSON.parse(window.render_file_tools_to_text()).image?.output === "2×3");
    assert.equal((await fileState()).image.format, "image/jpeg");
    const imageDownload = page.waitForEvent("download");
    await page.locator("#downloadImage").click();
    assert.equal((await imageDownload).suggestedFilename(), "destiny-image.jpg");

    await page.locator('[data-file-tab="text"]').click();
    await page.locator("#textFile").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("one two\nthree") });
    await page.waitForFunction(() => JSON.parse(window.render_file_tools_to_text()).text?.words === 3);
    assert.equal((await fileState()).text.lines, 2);
    await page.locator("#fileTextContent").fill("edited text\nfour words");
    assert.equal((await fileState()).text.words, 4);
    const textDownload = page.waitForEvent("download");
    await page.locator("#downloadTextFile").click();
    assert.equal((await textDownload).suggestedFilename(), "destiny-text.txt");

    await page.locator('[data-file-tab="csv"]').click();
    await page.locator("#csvInput").fill('name,score\n"Ada, A",10\nLinus,9,extra');
    await page.locator("#parseCsv").click();
    assert.equal((await fileState()).csv.rows, 2);
    assert.equal((await fileState()).csv.columns, 2);
    assert.match((await fileState()).csv.warnings.join(" "), /Row 1.*expected 3/);
    assert.match(await page.locator("#csvTable").textContent(), /Ada, A/);
    await page.locator("#csvInput").fill("");
    await page.locator("#parseCsv").click();
    assert.equal((await fileState()).csv.rows, 0);

    await page.locator('[data-file-tab="structured"]').click();
    await page.locator("#structuredInput").fill('{"b":2,"a":[1,true]}');
    await page.locator("#formatJson").click();
    assert.equal((await fileState()).structured.valid, true);
    assert.match(await page.locator("#structuredOutput").textContent(), /"a":/);
    await page.locator("#structuredInput").fill("{bad");
    await page.locator("#formatJson").click();
    assert.equal((await fileState()).structured.valid, false);
    await page.locator("#structuredInput").fill("title: Test\nitems:\n  - one");
    await page.locator("#previewYaml").click();
    assert.equal((await fileState()).structured.mode, "yaml-preview");
    assert.match(await page.locator("#structuredOutput").textContent(), /title/);

    await page.locator('[data-file-tab="checksum"]').click();
    await page.locator("#checksumFile").setInputFiles({ name: "abc.txt", mimeType: "text/plain", buffer: Buffer.from("abc") });
    await page.locator("#runFileChecksums").click();
    await page.waitForFunction(() => JSON.parse(window.render_file_tools_to_text()).checksums?.["SHA-512"]);
    assert.equal((await fileState()).checksums["SHA-256"], "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    await capture(page, `${shots}/file-tools.png`);
    await page.click('[data-page="home"]');
    assert.equal(await page.evaluate(() => typeof window.render_file_tools_to_text), "undefined");
  });
});

test("study tools manage flashcards, quizzes, references, and math helpers", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=study`);
    const studyState = () => page.evaluate(() => JSON.parse(window.render_study_tools_to_text()));
    assert.equal((await studyState()).activeTab, "flash");
    assert.equal(await page.locator("[data-study-tab]").count(), 6);

    await page.locator("#cardFront").fill("Capital of France?");
    await page.locator("#cardBack").fill("Paris");
    await page.locator("#saveCard").click();
    assert.equal((await studyState()).flashcards.count, 1);
    assert.match(await page.locator("#reviewCard").textContent(), /Capital/);
    await page.locator("#flipCard").click();
    assert.match(await page.locator("#reviewCard").textContent(), /Paris/);
    await page.locator("[data-edit-card]").click();
    await page.locator("#cardBack").fill("Paris, France");
    await page.locator("#saveCard").click();
    await page.locator("#flipCard").click();
    assert.match(await page.locator("#reviewCard").textContent(), /Paris, France/);
    await page.locator("#cardFront").fill("2 + 2?");
    await page.locator("#cardBack").fill("4");
    await page.locator("#saveCard").click();
    await page.locator("#shuffleCards").click();
    assert.equal((await studyState()).flashcards.count, 2);
    await page.reload();
    await page.locator('[data-page="study"]').click();
    assert.equal((await studyState()).flashcards.count, 2);
    await page.locator("[data-delete-card]").first().click();
    assert.equal((await studyState()).flashcards.count, 1);

    await page.locator('[data-study-tab="quiz"]').click();
    await page.locator("#quizNotes").fill("# Cells\n- Nucleus stores DNA\nMitochondria: powerhouse of the cell\nDiffusion");
    await page.locator("#generateQuiz").click();
    assert.equal((await studyState()).quizCount, 4);
    assert.match(await page.locator("#quizOutput").textContent(), /What is Mitochondria/);

    await page.locator('[data-study-tab="formulas"]').click();
    await page.locator("#formulaSearch").fill("force");
    assert.equal((await studyState()).formulaCount, 1);
    assert.match(await page.locator("#formulaList").textContent(), /F = ma/);
    await page.locator("#formulaSearch").fill("zzzz");
    assert.equal((await studyState()).formulaCount, 0);
    assert.match(await page.locator("#formulaList").textContent(), /NO FORMULAS/);

    await page.locator('[data-study-tab="periodic"]').click();
    await page.locator("#elementSearch").fill("oxygen");
    assert.equal((await studyState()).elementCount, 1);
    assert.match(await page.locator("#elementTable").textContent(), /Oxygen/);
    await page.locator("#elementSearch").fill("79");
    assert.match(await page.locator("#elementTable").textContent(), /Gold/);

    await page.locator('[data-study-tab="circle"]').click();
    await page.locator("#angleSelect").selectOption("45°");
    assert.equal((await studyState()).angle, "45°");
    assert.match(await page.locator("#angleOutput").textContent(), /√2\/2/);

    await page.locator('[data-study-tab="math"]').click();
    await page.locator("#fracNum").fill("12");
    await page.locator("#fracDen").fill("18");
    await page.locator("#simplifyFraction").click();
    assert.equal((await studyState()).math.fraction, "2/3");
    await page.locator("#x1").fill("0");
    await page.locator("#y1").fill("0");
    await page.locator("#x2").fill("2");
    await page.locator("#y2").fill("4");
    await page.locator("#calcSlope").click();
    assert.equal((await studyState()).math.slope, "2");
    await page.locator("#quadA").fill("1");
    await page.locator("#quadB").fill("-3");
    await page.locator("#quadC").fill("2");
    await page.locator("#solveQuadratic").click();
    assert.match((await studyState()).math.quadratic, /TWO REAL ROOTS/);
    await page.locator("#quadB").fill("2");
    await page.locator("#quadC").fill("1");
    await page.locator("#solveQuadratic").click();
    assert.match((await studyState()).math.quadratic, /ONE REAL ROOT/);
    await page.locator("#quadB").fill("0");
    await page.locator("#quadC").fill("1");
    await page.locator("#solveQuadratic").click();
    assert.match((await studyState()).math.quadratic, /NO REAL ROOTS/);
    await capture(page, `${shots}/study-tools.png`);
    await page.click('[data-page="home"]');
    assert.equal(await page.evaluate(() => typeof window.render_study_tools_to_text), "undefined");
  });
});

test("productivity tools manage snippets, checklist, focus, links, habits, and reset", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=productivity`);
    const productivityState = () => page.evaluate(() => JSON.parse(window.render_productivity_to_text()));
    assert.equal((await productivityState()).activeTab, "dashboard");
    assert.equal(await page.locator("[data-productivity-tab]").count(), 6);

    await page.locator('[data-productivity-tab="clip"]').click();
    await page.locator("#snippetTitle").fill("Quote");
    await page.locator("#snippetText").fill("Stay focused");
    await page.locator("#saveSnippet").click();
    assert.equal((await productivityState()).snippets, 1);
    await page.locator("[data-pin-snippet]").click();
    assert.match(await page.locator("#snippetList").textContent(), /★ Quote/);
    await page.locator("[data-copy-snippet]").click();
    await page.locator("[data-delete-snippet]").click();
    assert.equal((await productivityState()).snippets, 0);
    await page.locator("#snippetTitle").fill("Plan");
    await page.locator("#snippetText").fill("One more saved item");
    await page.locator("#saveSnippet").click();
    await page.locator("#clearSnippets").click();
    assert.equal((await productivityState()).snippets, 0);

    await page.locator('[data-productivity-tab="checklist"]').click();
    await page.locator("#checkText").fill("Finish math homework");
    await page.locator("#addCheck").click();
    assert.equal((await productivityState()).checklist.open, 1);
    await page.locator("[data-check-edit]").fill("Finish science homework");
    await page.locator("[data-check-edit]").dispatchEvent("change");
    assert.match(await page.locator("[data-check-edit]").inputValue(), /science/);
    await page.locator("[data-check-done]").check();
    assert.equal((await productivityState()).checklist.open, 0);
    await page.locator("#clearDoneChecks").click();
    assert.equal((await productivityState()).checklist.total, 0);
    await page.locator("#checkText").fill("Pack backpack");
    await page.locator("#addCheck").click();

    await page.locator('[data-productivity-tab="links"]').click();
    await page.locator("#linkTitle").fill("Bad link");
    await page.locator("#linkUrl").fill("javascript:alert(1)");
    await page.locator("#saveLink").click();
    assert.equal((await productivityState()).links, 0);
    assert.match(await page.locator("#linkError").textContent(), /ERROR/);
    await page.locator("#linkTitle").fill("Example");
    await page.locator("#linkUrl").fill("https://example.com/path");
    await page.locator("#saveLink").click();
    assert.equal((await productivityState()).links, 1);
    await page.locator("[data-copy-link]").click();
    await page.locator("[data-edit-link]").click();
    await page.locator("#linkTitle").fill("Example Edited");
    await page.locator("#saveLink").click();
    assert.match(await page.locator("#linkList").textContent(), /Example Edited/);

    await page.locator('[data-productivity-tab="habits"]').click();
    await page.locator("#habitName").fill("Read");
    await page.locator("#addHabit").click();
    assert.equal((await productivityState()).habits.length, 1);
    await page.locator("[data-toggle-habit]").click();
    assert.equal((await productivityState()).habits[0].streak, 1);
    assert.match(await page.locator("#habitList").textContent(), /●/);
    await page.locator("[data-toggle-habit]").click();
    assert.equal((await productivityState()).habits[0].streak, 0);

    await page.locator('[data-productivity-tab="focus"]').click();
    await page.locator("#focusMinutes").fill("0.02");
    await page.locator("#startFocus").click();
    assert.equal((await productivityState()).focus.running, true);
    await page.locator("#pauseFocus").click();
    assert.equal((await productivityState()).focus.running, false);
    await page.locator("#resetFocus").click();
    await page.locator("#startFocus").click();
    await page.waitForFunction(() => JSON.parse(window.render_productivity_to_text()).focus.completed >= 1, null, { timeout: 3000 });
    assert.match(await page.locator("#focusStatus").textContent(), /COMPLETE/);

    await page.locator('[data-productivity-tab="dashboard"]').click();
    const summary = await productivityState();
    assert.equal(summary.dashboard.openChecks, 1);
    assert.equal(summary.dashboard.dueHabits, 1);
    assert.equal(summary.dashboard.links, 1);
    await capture(page, `${shots}/productivity.png`);

    await page.reload();
    await page.locator('[data-page="productivity"]').click();
    assert.equal((await productivityState()).links, 1);
    assert.equal((await productivityState()).checklist.open, 1);
    await page.locator('[data-page="home"]').click();
    assert.equal(await page.evaluate(() => typeof window.render_productivity_to_text), "undefined");

    page.once("dialog", dialog => dialog.accept());
    await page.locator('[data-page="settings"]').click();
    await page.locator("#resetData").click();
    await page.locator('[data-page="productivity"]').click();
    assert.equal((await productivityState()).links, 0);
    assert.equal((await productivityState()).checklist.total, 0);
  });
});

test("bookmarklet opens a reusable self-contained popup on strict CSP pages", async () => {
  await withBrowser(async ({ context, page }) => {
    const raw = await readFile("dist/bookmarklet.txt", "utf8");
    const source = decodeURIComponent(raw.slice("javascript:".length));
    await page.goto(`${base}/tests/fixtures/youtube-like.html`);
    const cdp = await context.newCDPSession(page);
    const launch = () => cdp.send("Runtime.evaluate", {
      expression: source,
      userGesture: true,
      awaitPromise: false
    });
    const popupPromise = context.waitForEvent("page");
    await launch();
    const panel = await popupPromise;
    const popupErrors = [];
    panel.on("pageerror", error => popupErrors.push(String(error)));
    await panel.locator(".shell").waitFor({ timeout: 10000 });
    assert.equal(context.pages().length, 2);
    assert.equal(await panel.locator("html").getAttribute("data-ready"), "1");
    assert.equal(panel.url(), "about:blank");
    for (const module of ["calculator", "organizer", "time", "calendar", "worldclock", "colors", "convert", "text", "developer", "inspector", "files", "study", "productivity", "random", "qr", "draw", "page", "games", "settings", "help", "home"]) {
      await panel.locator(`[data-page="${module}"]`).click();
      await panel.locator(".page h2").waitFor();
      assert.ok((await panel.locator(".page h2").textContent()).trim().length > 0);
    }
    await panel.locator('[data-page="settings"]').click();
    await panel.locator("#themeSetting").selectOption("violet");
    await panel.locator("#brightnessSetting").fill("0.7");
    await panel.locator('[data-density="compact"]').click();
    assert.equal(await panel.locator("#app").getAttribute("data-theme"), "violet");
    assert.equal(await panel.locator("#app").getAttribute("data-density"), "compact");
    assert.equal(await panel.locator(".matrix").evaluate(node => getComputedStyle(node).opacity), "0.7");
    await panel.locator('[data-page="developer"]').click();
    await panel.locator("#regexPattern").fill("\\d+");
    await panel.locator("#regexInput").fill("Version 4 has 12 tools");
    await panel.locator("#runRegex").click();
    assert.equal(await panel.locator(".developer-match").count(), 2);
    await capture(panel, `${shots}/developer-popup.png`);
    await panel.locator('[data-page="inspector"]').click();
    assert.match(await panel.locator(".page h2").textContent(), /PAGE INSPECTOR/);
    assert.match(await panel.locator(".output").first().textContent(), /YouTube-like Trusted Types fixture/);
    assert.match(await panel.locator(".inspector-list").first().textContent(), /Trusted Types test page/);
    await panel.locator("#highlightClickables").click();
    assert.equal(await page.locator("[data-bod-inspector-highlight]").count(), 2);
    await panel.locator("#clearInspectorHighlights").click();
    assert.equal(await page.locator("[data-bod-inspector-highlight]").count(), 0);
    await panel.locator("#pickElement").click();
    await page.locator("#dark-button").click();
    assert.match(await panel.locator("#selectedElement").textContent(), /SELECTOR: #dark-button/);
    assert.match(await panel.locator("#selectedElement").textContent(), /Application button/);
    await capture(panel, `${shots}/inspector-popup.png`);
    await panel.locator('[data-page="files"]').click();
    assert.match(await panel.locator(".page h2").textContent(), /FILE TOOLS/);
    assert.equal(await panel.evaluate(() => JSON.parse(window.render_file_tools_to_text()).activeTab), "image");
    await capture(panel, `${shots}/file-tools-popup.png`);
    await panel.locator('[data-page="study"]').click();
    assert.match(await panel.locator(".page h2").textContent(), /STUDY TOOLS/);
    assert.equal(await panel.evaluate(() => JSON.parse(window.render_study_tools_to_text()).activeTab), "flash");
    await capture(panel, `${shots}/study-tools-popup.png`);
    await panel.locator('[data-page="productivity"]').click();
    assert.match(await panel.locator(".page h2").textContent(), /PRODUCTIVITY/);
    assert.equal(await panel.evaluate(() => JSON.parse(window.render_productivity_to_text()).activeTab), "dashboard");
    await capture(panel, `${shots}/productivity-popup.png`);
    await panel.locator('[data-page="organizer"]').click();
    await panel.locator("#newNote").click();
    await panel.locator("#noteTitle").fill("Popup note");
    await panel.locator("#noteBody").fill("# Compact preview");
    await capture(panel, `${shots}/organizer-popup.png`);
    await panel.locator('[data-page="calculator"]').click();
    await panel.locator("#calcInput").fill("6 * 7");
    await panel.locator("#calcInput").press("Enter");
    assert.equal(await panel.locator("#calcResult").textContent(), "42");
    await panel.locator('[data-page="qr"]').click();
    assert.equal(await panel.locator("#qrOutput img").count(), 1);
    await panel.locator('[data-page="games"]').click();
    assert.match(await panel.evaluate(() => window.render_game_to_text()), /"game":"snake"/);
    await panel.locator('[data-game="2048"]').click();
    await panel.keyboard.press("ArrowLeft");
    assert.match(await panel.evaluate(() => window.render_game_to_text()), /"game":"2048"/);
    for (const [id, expected] of [["breakout","breakout"],["connect4","connect-four"],["tron","tron"],["invaders","space-invaders"],["memory","memory"],["chess","chess"],["checkers","checkers"]]) {
      await panel.locator(`[data-game="${id}"]`).click();
      assert.equal(JSON.parse(await panel.evaluate(() => window.render_game_to_text())).game, expected);
    }
    await panel.locator('[data-game="mines"]').click();
    assert.match(await panel.locator("label[for=mineDifficulty]").textContent(), /Difficulty/i);
    const mineTrigger = panel.locator("#mineDifficulty + .destiny-select .destiny-select-trigger");
    await mineTrigger.focus();
    await mineTrigger.press("End");
    await mineTrigger.press("Enter");
    assert.equal(await panel.locator("#mineDifficulty").inputValue(), "hard");
    assert.equal(await panel.locator(".mine-grid button").count(), 280);
    await panel.locator("#mineDifficulty").selectOption("easy");
    assert.equal(await panel.locator(".mine-grid button").count(), 81);
    await panel.locator(".mine-grid button").first().click();
    assert.match(await panel.evaluate(() => window.render_game_to_text()), /minesweeper/);
    await panel.locator('[data-game="ttt"]').click();
    assert.match(await panel.locator("label[for=tttPlayers]").textContent(), /Game mode/i);
    const tttTrigger = panel.locator("#tttPlayers + .destiny-select .destiny-select-trigger");
    await tttTrigger.click();
    const tttMenu = panel.locator(`#${await tttTrigger.getAttribute("aria-controls")}`);
    assert.equal(await tttMenu.getAttribute("data-position"), "above");
    await tttTrigger.press("Escape");
    assert.equal(await tttTrigger.getAttribute("aria-expanded"), "false");
    await panel.locator(".ttt button").first().click();
    await page.waitForTimeout(250);
    const tttState = () => panel.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal((await tttState()).playerMode, "one");
    await panel.locator("#tttPlayers").selectOption("two");
    assert.deepEqual((await tttState()).board, Array(9).fill(""));
    await panel.locator(".ttt button").nth(0).click();
    assert.equal((await tttState()).currentPlayer, "O");
    await panel.locator(".ttt button").nth(3).click();
    await panel.locator(".ttt button").nth(1).click();
    await panel.locator(".ttt button").nth(4).click();
    await panel.locator(".ttt button").nth(2).click();
    assert.equal((await tttState()).mode, "x-won");
    assert.match(await panel.locator("#tttStatus").textContent(), /PLAYER 1 WINS/);
    const tttScore = await panel.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).scores.ttt);
    await panel.locator(".gameRestart").click();
    await panel.locator(".ttt button").nth(0).click();
    await panel.locator(".ttt button").nth(3).click();
    await panel.locator(".ttt button").nth(1).click();
    await panel.locator(".ttt button").nth(4).click();
    await panel.locator(".ttt button").nth(8).click();
    await panel.locator(".ttt button").nth(5).click();
    assert.equal((await tttState()).mode, "o-won");
    assert.equal(await panel.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).scores.ttt), tttScore);
    await panel.locator('[data-game="pong"]').click();
    assert.match(await panel.locator("label[for=pongPlayers]").textContent(), /Game mode/i);
    const pongState = () => panel.evaluate(() => JSON.parse(window.render_game_to_text()));
    const pongStart = await pongState();
    assert.equal(pongStart.playerMode, "one");
    await panel.keyboard.down("ArrowUp");
    await panel.evaluate(() => window.advanceTime(100));
    const pongMoving = await pongState();
    assert.ok(pongMoving.leftY < pongStart.leftY - 20);
    assert.ok(pongMoving.leftY > pongStart.leftY - 40);
    await panel.keyboard.up("ArrowUp");
    const pongReleased = (await pongState()).leftY;
    await panel.evaluate(() => window.advanceTime(100));
    assert.equal((await pongState()).leftY, pongReleased);
    await panel.keyboard.down("ArrowUp");
    await panel.keyboard.down("ArrowDown");
    const pongOpposed = (await pongState()).leftY;
    await panel.evaluate(() => window.advanceTime(100));
    assert.equal((await pongState()).leftY, pongOpposed);
    await panel.keyboard.up("ArrowDown");
    await panel.evaluate(() => window.advanceTime(1000));
    assert.equal((await pongState()).leftY, 0);
    await panel.keyboard.up("ArrowUp");
    await panel.keyboard.down("s");
    await panel.evaluate(() => window.dispatchEvent(new Event("blur")));
    const pongBlurred = (await pongState()).leftY;
    await panel.evaluate(() => window.advanceTime(100));
    assert.equal((await pongState()).leftY, pongBlurred);
    await panel.keyboard.up("s");
    await panel.locator("#pongPlayers").selectOption("two");
    const twoStart = await pongState();
    assert.equal(twoStart.playerMode, "two");
    assert.equal(twoStart.leftY, 170);
    assert.equal(twoStart.rightY, 170);
    assert.match(await panel.locator(".game-status").textContent(), /LEFT: W\/S.*RIGHT:/);
    await panel.keyboard.down("w");
    await panel.keyboard.down("ArrowDown");
    await panel.evaluate(() => window.advanceTime(100));
    const twoMoving = await pongState();
    assert.ok(twoMoving.leftY < 150);
    assert.ok(twoMoving.rightY > 190);
    await panel.keyboard.up("w");
    await panel.keyboard.up("ArrowDown");
    const twoReleased = await pongState();
    await panel.evaluate(() => window.advanceTime(100));
    const twoStill = await pongState();
    assert.equal(twoStill.leftY, twoReleased.leftY);
    assert.equal(twoStill.rightY, twoReleased.rightY);
    await panel.keyboard.down("ArrowUp");
    await panel.keyboard.down("ArrowDown");
    const rightOpposed = (await pongState()).rightY;
    await panel.evaluate(() => window.advanceTime(100));
    assert.equal((await pongState()).rightY, rightOpposed);
    await panel.keyboard.up("ArrowUp");
    await panel.keyboard.up("ArrowDown");
    const savedPongScore = await panel.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).scores.pong);
    await panel.evaluate(() => window.advanceTime(120000));
    assert.match((await pongState()).mode, /left-won|right-won/);
    assert.equal(await panel.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).scores.pong), savedPongScore);
    await panel.locator("#pongPlayers").selectOption("one");
    assert.deepEqual((await pongState()).scores, [0, 0]);
    await panel.locator('[data-page="qr"]').click();
    assert.match(await panel.locator("label[for=qrLevel]").textContent(), /Error correction/i);
    assert.equal(await panel.locator("#qrLevel").evaluate(node => getComputedStyle(node).appearance), "none");
    const qrTrigger = panel.locator("#qrLevel + .destiny-select .destiny-select-trigger");
    await qrTrigger.focus();
    await qrTrigger.press("q");
    await qrTrigger.press("Enter");
    assert.equal(await panel.locator("#qrLevel").inputValue(), "Q");
    await panel.locator("#qrLevel").evaluate(node => node.disabled = true);
    await panel.waitForFunction(() => document.querySelector("#qrLevel + .destiny-select .destiny-select-trigger")?.disabled);
    assert.equal(await qrTrigger.isDisabled(), true);
    await panel.locator('[data-page="page"]').click();
    await panel.locator('[data-effect="dark"]').click();
    assert.equal(await page.locator("#__bod_dark_mode").count(), 1);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), "rgb(16, 20, 17)");
    assert.equal(await page.locator("#dark-fixture").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(17, 24, 19)");
    assert.equal(await page.locator("#dark-text").evaluate(node => getComputedStyle(node).color), "rgb(220, 232, 223)");
    assert.equal(await page.locator("#dark-button").evaluate(node => getComputedStyle(node).color), "rgb(241, 255, 244)");
    assert.equal(await page.locator("#dark-button").evaluate(node => getComputedStyle(node).backgroundColor), "rgb(26, 36, 29)");
    assert.equal(await page.locator("#dark-link").evaluate(node => getComputedStyle(node).color), "rgb(134, 207, 255)");
    await panel.locator('[data-effect="dark"]').click();
    assert.equal(await page.locator("#__bod_dark_mode").count(), 0);
    await panel.locator('[data-effect="dark"]').click();
    await panel.locator('[data-effect="reset"]').click();
    assert.equal(await page.locator("#__bod_dark_mode").count(), 0);

    await panel.locator("#minimizeBtn").click();
    await launch();
    assert.equal(context.pages().length, 2);

    const closePromise = panel.waitForEvent("close");
    await panel.locator("#closeBtn").click();
    await closePromise;
    assert.equal(context.pages().length, 1);
    const secondPopupPromise = context.waitForEvent("page");
    await launch();
    const secondPopup = await secondPopupPromise;
    await secondPopup.locator(".shell").waitFor();
    assert.equal(context.pages().length, 2);
    assert.deepEqual(popupErrors, []);
  });
});

test("bookmarklet opens its popup from local file pages", async () => {
  await withBrowser(async ({ context, page }) => {
    const raw = await readFile("dist/bookmarklet.txt", "utf8");
    await page.goto(pathToFileURL(resolve("tests/fixtures/youtube-like.html")).href);
    const cdp = await context.newCDPSession(page);
    const popupPromise = context.waitForEvent("page");
    await cdp.send("Runtime.evaluate", {
      expression: decodeURIComponent(raw.slice("javascript:".length)),
      userGesture: true
    });
    const popup = await popupPromise;
    await popup.locator(".shell").waitFor();
    assert.equal(context.pages().length, 2);
    await popup.close();
  });
});

test("expanded arcade mounts twelve games and exercises multiplayer controls", async () => {
  await withBrowser(async ({ page }) => {
    await mkdir(shots, { recursive: true });
    await page.goto(`${base}/preview.html?page=games&game=breakout`);
    assert.equal(await page.locator("[data-game]").count(), 12);
    const gameState = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));

    let state = await gameState();
    assert.equal(state.game, "breakout");
    const paddleStart = state.paddle.x;
    await page.keyboard.down("ArrowRight");
    await page.evaluate(() => window.advanceTime(300));
    await page.keyboard.up("ArrowRight");
    assert.ok((await gameState()).paddle.x > paddleStart);
    await page.locator(".gamePause").click();
    assert.equal((await gameState()).mode, "paused");
    await page.locator("#gameDifficulty").selectOption("hard");
    assert.equal((await gameState()).difficulty, "hard");
    await capture(page, `${shots}/breakout.png`);

    await page.locator('[data-game="connect4"]').click();
    assert.equal((await gameState()).game, "connect-four");
    await page.locator("#connectPlayers").selectOption("two");
    for (const column of [0,1,0,1,0,1,0]) await page.locator(".connect4 button").nth(column).click();
    state = await gameState();
    assert.equal(state.mode, "red-won");
    assert.equal(state.playerMode, "two");
    await capture(page, `${shots}/connect-four.png`);

    await page.locator('[data-game="tron"]').click();
    await page.locator("#tronPlayers").selectOption("two");
    await page.keyboard.press("w");
    await page.keyboard.press("ArrowDown");
    await page.evaluate(() => window.advanceTime(500));
    state = await gameState();
    assert.equal(state.game, "tron");
    assert.equal(state.playerMode, "two");
    assert.ok(state.trailCells > 2);
    await page.dispatchEvent("body", "blur");
    await capture(page, `${shots}/tron.png`);

    await page.locator('[data-game="invaders"]').click();
    const invaderStart = (await gameState()).player.x;
    await page.keyboard.down("ArrowLeft");
    await page.evaluate(() => window.advanceTime(200));
    await page.keyboard.up("ArrowLeft");
    await page.keyboard.press("Space");
    await page.evaluate(() => window.advanceTime(50));
    state = await gameState();
    assert.equal(state.game, "space-invaders");
    assert.ok(state.player.x < invaderStart);
    assert.ok(state.shots.length >= 1);
    await capture(page, `${shots}/space-invaders.png`);

    await page.locator('[data-game="memory"]').click();
    await page.locator("#memoryPlayers").selectOption("two");
    await page.locator(".memory-grid button").nth(0).click();
    await page.locator(".memory-grid button").nth(1).click();
    state = await gameState();
    assert.equal(state.game, "memory");
    assert.equal(state.playerMode, "two");
    assert.equal(state.cards.filter(card => card.visible).length, 2);
    await capture(page, `${shots}/memory.png`);

    await page.locator('[data-game="snake"]').click();
    await page.locator("#snakePlayers").selectOption("two");
    await page.keyboard.press("w");
    await page.keyboard.press("ArrowDown");
    await page.evaluate(() => window.advanceTime(250));
    state = await gameState();
    assert.equal(state.playerMode, "two");
    assert.equal(state.snakes.length, 2);
    assert.deepEqual(state.rounds, [0,0]);
    await capture(page, `${shots}/snake-battle.png`);

    await page.locator('[data-game="mines"]').click();
    await page.locator("#minePlayers").selectOption("two");
    assert.equal(await page.locator(".mine-player").count(), 2);
    await page.keyboard.press("d");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("e");
    await page.keyboard.press("Shift");
    state = await gameState();
    assert.equal(state.playerMode, "two");
    assert.equal(state.cursors[0].x, 1);
    assert.equal(state.cursors[1].x, 1);
    assert.equal(state.boards[0].visible.some(cell => cell.flag), true);
    assert.equal(state.boards[1].visible.some(cell => cell.flag), true);
    await capture(page, `${shots}/minesweeper-race.png`);

    await page.fill("#gameSearch", "pong");
    assert.equal(await page.locator("[data-game]:not(.hidden)").count(), 1);
    assert.match(await page.locator("[data-game]:not(.hidden)").textContent(), /PONG/);
  });
});

test("Chess and Checkers support CPU, two-player, keyboard, and special UI states", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=games&game=chess`);
    const state = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
    assert.equal((await state()).game, "chess");
    assert.equal(await page.locator(".chess-board .board-square").count(), 64);
    await page.locator(".chess-board .board-square").nth(52).click();
    assert.deepEqual((await state()).legalDestinations.sort(), ["e3","e4"]);
    await page.locator(".chess-board .board-square").nth(36).click();
    await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).history.length >= 2);
    assert.match((await state()).history[0], /^e4/);
    assert.equal((await state()).currentPlayer, "w");
    await page.locator("#chessPlayers").selectOption("two");
    const chessScore = await page.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).scores.chess);
    await page.keyboard.press("ArrowUp");
    assert.equal((await state()).cursor, "e3");
    await page.keyboard.press("Escape");

    const promotion = {
      board:Array(64).fill(""),turn:"w",castling:"",enPassant:null,halfmove:0,fullmove:1,history:[],repetition:{},result:"playing"
    };
    promotion.board[60]="K"; promotion.board[4]="k"; promotion.board[8]="P";
    await page.evaluate(value => window.__BOD_BOARD_TEST__.load(value), promotion);
    await page.locator(".chess-board .board-square").nth(8).click();
    await page.locator(".chess-board .board-square").nth(0).click();
    assert.equal(await page.locator("#promotionPicker").evaluate(node => !node.classList.contains("hidden")), true);
    await page.locator('[data-promotion="n"]').click();
    assert.equal((await state()).pieces.find(piece => piece.square === "a8").piece, "N");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).scores.chess), chessScore);
    await capture(page, `${shots}/chess.png`);

    await page.locator('[data-game="checkers"]').click();
    assert.equal((await state()).game, "checkers");
    assert.equal(await page.locator(".checkers-board .board-square").count(), 64);
    await page.locator("#checkersPlayers").selectOption("two");
    const checkersScore = await page.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).scores.checkers);
    const forced = { board:Array(64).fill(""),turn:"r",forcedFrom:null,history:[],result:"playing" };
    forced.board[42]="r"; forced.board[35]="b"; forced.board[21]="b";
    await page.evaluate(value => window.__BOD_BOARD_TEST__.load(value), forced);
    await page.locator(".checkers-board .board-square").nth(42).click();
    assert.deepEqual((await state()).legalDestinations, ["e5"]);
    await page.locator(".checkers-board .board-square").nth(28).click();
    assert.equal((await state()).forcedFrom, "e5");
    assert.match(await page.locator("#checkersStatus").textContent(), /CONTINUE JUMP/);
    await page.locator(".checkers-board .board-square").nth(14).click();
    assert.equal((await state()).currentPlayer, "b");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("bookmarklet-of-destiny:v1")).scores.checkers), checkersScore);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await page.setViewportSize({ width: 700, height: 520 });
    assert.equal(await page.locator(".board-grid").isVisible(), true);
    assert.equal(await page.locator(".content").evaluate(node => node.scrollHeight > node.clientHeight), true);
    await capture(page, `${shots}/checkers.png`);
  });
});

test("compact dashboard scrolls while chrome and sidebar remain fixed", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 700, height: 520 } });
    await page.goto(`${base}/preview.html?page=games&game=mines`);
    const before = await page.evaluate(() => ({
      content: document.querySelector(".content").scrollTop,
      topbar: document.querySelector(".topbar").getBoundingClientRect().top,
      sidebar: document.querySelector(".sidebar").getBoundingClientRect().top,
      canScroll: document.querySelector(".content").scrollHeight > document.querySelector(".content").clientHeight
    }));
    assert.equal(before.canScroll, true);
    await page.locator(".content").evaluate(node => node.scrollTo(0, node.scrollHeight));
    const after = await page.evaluate(() => ({
      content: document.querySelector(".content").scrollTop,
      topbar: document.querySelector(".topbar").getBoundingClientRect().top,
      sidebar: document.querySelector(".sidebar").getBoundingClientRect().top,
      restartVisible: document.querySelector(".gameRestart").getBoundingClientRect().bottom <= innerHeight
    }));
    assert.ok(after.content > 0);
    assert.equal(after.topbar, before.topbar);
    assert.equal(after.sidebar, before.sidebar);
    assert.equal(after.restartVisible, true);
  } finally {
    await browser.close();
  }
});

test("legacy Minesweeper and Tic-Tac-Toe workflows still respond", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=games&game=mines`);
    assert.equal(await page.locator(".mine-grid button").count(), 192);
    await page.locator("#mineDifficulty").selectOption("easy");
    assert.equal(await page.locator(".mine-grid button").count(), 81);
    await page.locator(".mine-grid button").first().click();
    assert.match(await page.evaluate(() => window.render_game_to_text()), /minesweeper/);
    await capture(page, `${shots}/minesweeper.png`);

    await page.goto(`${base}/preview.html?page=games&game=ttt`);
    await page.locator(".ttt button").first().click();
    await page.waitForTimeout(300);
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    assert.equal(state.board.filter(Boolean).length, 2);
    await capture(page, `${shots}/tic-tac-toe.png`);
  });
});
