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
    await page.fill("#notes", "Saved by browser smoke test");
    await page.waitForTimeout(500);
    await page.fill("#todoInput", "Verify local task");
    await page.click("#todoAdd");
    assert.equal(await page.locator("#todoList .item").count(), 1);
    await page.reload();
    await page.click('[data-page="organizer"]');
    assert.equal(await page.inputValue("#notes"), "Saved by browser smoke test");
    assert.match(await page.locator("#todoList").textContent(), /Verify local task/);

    await page.click('[data-page="qr"]');
    assert.equal(await page.locator("#qrOutput img").count(), 1);

    await page.click('[data-page="convert"]');
    await page.locator("#convType").selectOption("currency");
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
    for (const module of ["calculator", "organizer", "time", "convert", "text", "random", "qr", "draw", "page", "games", "settings", "help", "home"]) {
      await panel.locator(`[data-page="${module}"]`).click();
      await panel.locator(".page h2").waitFor();
      assert.ok((await panel.locator(".page h2").textContent()).trim().length > 0);
    }
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
    await panel.locator('[data-game="mines"]').click();
    assert.equal(await panel.locator(".mine-grid button").count(), 81);
    await panel.locator(".mine-grid button").first().click();
    assert.match(await panel.evaluate(() => window.render_game_to_text()), /minesweeper/);
    await panel.locator('[data-game="ttt"]').click();
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

test("Minesweeper and Tic-Tac-Toe mount and respond", async () => {
  await withBrowser(async ({ page }) => {
    await page.goto(`${base}/preview.html?page=games&game=mines`);
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
