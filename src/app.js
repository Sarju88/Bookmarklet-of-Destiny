import qrcode from "qrcode-generator";

const bootstrap = globalThis.__BOD_BOOTSTRAP__ || null;
const appRoot = bootstrap?.root || document;
const appMount = bootstrap?.mount || document.body;
const appHost = bootstrap?.host || null;
const embedded = !!bootstrap;
const APP_KEY = "bookmarklet-of-destiny:v1";
const USD_INR_API = "https://api.frankfurter.dev/v2/rates?base=USD&quotes=INR";
const USD_INR_REFRESH_MS = 12 * 60 * 60 * 1000;
const USD_INR_TIMEOUT_MS = 5000;
let trustedPolicy = null;
try {
  trustedPolicy = globalThis.trustedTypes?.createPolicy(`bookmarklet-of-destiny-${Date.now()}-${Math.random().toString(36).slice(2)}`, {
    createHTML: value => value
  });
} catch {
  trustedPolicy = null;
}
const trustedHTML = value => trustedPolicy ? trustedPolicy.createHTML(String(value)) : String(value);
const setHTML = (node, value) => { node.innerHTML = trustedHTML(value); };
const insertHTML = (node, position, value) => node.insertAdjacentHTML(position, trustedHTML(value));
const PAGES = [
  ["home", "⌂", "Command Center"],
  ["calculator", "∑", "Calculator"],
  ["organizer", "✓", "Notes & Todos"],
  ["time", "◷", "Time Systems"],
  ["convert", "⇄", "Converters"],
  ["text", "¶", "Text Lab"],
  ["random", "⚄", "Random Lab"],
  ["qr", "▦", "QR Generator"],
  ["draw", "✎", "Drawing Pad"],
  ["page", "◈", "Page Controls"],
  ["games", "◆", "Arcade"],
  ["settings", "⚙", "Settings"],
  ["help", "?", "Help"]
];

const defaults = {
  version: 1,
  notes: "",
  todos: [],
  calcHistory: [],
  scores: { snake: 0, "2048": 0, mines: 0, ttt: 0, pong: 0 },
  settings: {
    rain: true, sound: false, density: 1, accent: "#39ff88",
    usdInrRate: 94.37, usdInrSourceDate: "", usdInrUpdatedAt: 0,
    usdInrLastAttemptAt: 0, usdInrManual: false
  }
};

const Store = {
  data: structuredClone(defaults),
  load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP_KEY) || "null");
      if (parsed?.version === 1) this.data = { ...structuredClone(defaults), ...parsed, settings: { ...defaults.settings, ...parsed.settings }, scores: { ...defaults.scores, ...parsed.scores } };
    } catch {}
    return this.data;
  },
  save() {
    try { localStorage.setItem(APP_KEY, JSON.stringify(this.data)); } catch {}
  },
  update(path, value) {
    const parts = path.split(".");
    let target = this.data;
    while (parts.length > 1) target = target[parts.shift()];
    target[parts[0]] = value;
    this.save();
  },
  reset() {
    this.data = structuredClone(defaults);
    this.save();
  }
};

const state = {
  page: PAGES.some(([id]) => id === new URLSearchParams(location.search).get("page")) ? new URLSearchParams(location.search).get("page") : "home",
  game: ["snake", "2048", "mines", "ttt", "pong"].includes(new URLSearchParams(location.search).get("game")) ? new URLSearchParams(location.search).get("game") : "snake",
  cleanup: [],
  appCleanup: [],
  timer: { mode: "timer", remaining: 300, running: false, initial: 300, pomodoroWork: true },
  stopwatch: { elapsed: 0, running: false },
  alarm: null,
  pageEffects: { editable: false, images: false, filter: false, dark: false }
};

const DARK_MODE_STYLE_ID = "__bod_dark_mode";
const DARK_MODE_CSS = `
  :root {
    color-scheme: dark !important;
    background-color: #101411 !important;
  }
  html, body {
    background-color: #101411 !important;
    color: #dce8df !important;
  }
  body :where(*:not(img):not(video):not(canvas):not(picture):not(source):not(iframe)) {
    border-color: #3b4b3f !important;
    color: #dce8df !important;
    text-shadow: none !important;
  }
  body :where(
    main, article, section, aside, nav, header, footer, dialog, form,
    div, ul, ol, li, table, thead, tbody, tfoot, tr, td, th,
    [role="main"], [role="navigation"], [role="banner"], [role="contentinfo"],
    [role="dialog"], [role="menu"], [role="menubar"], [role="listbox"],
    [role="list"], [role="row"], [role="grid"], [role="gridcell"]
  ) {
    background-color: #111813 !important;
  }
  body :where(a, [role="link"]) {
    color: #86cfff !important;
  }
  body :where(
    input, textarea, select, option, button, pre, code, blockquote,
    [role="button"], [role="tab"], [role="textbox"], [role="searchbox"],
    [role="combobox"], [role="option"]
  ) {
    background-color: #1a241d !important;
    color: #f1fff4 !important;
    border-color: #526557 !important;
  }
  body :where(input, textarea, select)::placeholder {
    color: #a9b7ac !important;
    opacity: 1 !important;
  }
  body :where(svg) {
    color: #dce8df !important;
    fill: currentColor !important;
  }
  body :where(img, video, canvas, picture, source, iframe) {
    filter: none !important;
  }
`;

const $ = (selector, root = appRoot) => root.querySelector(selector);
const $$ = (selector, root = appRoot) => [...root.querySelectorAll(selector)];
let currencySyncState = "idle";
let currencySyncInFlight = null;
let refreshCurrencyConverter = () => {};
let onlineRetryUsed = false;
const el = (tag, attrs = {}, html = "") => {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => key === "class" ? node.className = value : key.startsWith("on") ? node.addEventListener(key.slice(2), value) : node.setAttribute(key, value));
  if (html) setHTML(node, html);
  return node;
};
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toast = (message) => {
  const node = el("div", { class: "toast" }, escapeHtml(message));
  appMount.append(node);
  setTimeout(() => node.remove(), 1800);
};

function currencyRateStatus() {
  const settings = Store.data.settings;
  if (currencySyncState === "checking") return "CHECKING ONLINE RATE...";
  if (settings.usdInrManual) return "MANUAL RATE · NEXT SUCCESSFUL REFRESH WILL REPLACE IT";
  if (currencySyncState === "offline") return "OFFLINE · USING SAVED RATE";
  if (currencySyncState === "error") return "UPDATE FAILED · USING SAVED RATE";
  if (settings.usdInrSourceDate) {
    const date = new Date(`${settings.usdInrSourceDate}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).toUpperCase();
    return `ONLINE RATE · ${settings.usdInrRate.toLocaleString(undefined, { maximumFractionDigits: 6 })} · ${date}`;
  }
  return "SAVED FALLBACK RATE · DEFAULT DATED JUNE 20, 2026";
}

function updateCurrencySyncUI() {
  const status = $("#currencyRateStatus");
  const button = $("#refreshCurrencyRate");
  if (status) status.textContent = currencyRateStatus();
  if (button) button.disabled = currencySyncState === "checking";
}

async function syncUsdInrRate({ force = false } = {}) {
  if (currencySyncInFlight) return currencySyncInFlight;
  const now = Date.now();
  if (!force && now - Store.data.settings.usdInrLastAttemptAt < USD_INR_REFRESH_MS) {
    currencySyncState = navigator.onLine === false ? "offline" : "idle";
    updateCurrencySyncUI();
    return false;
  }
  Store.data.settings.usdInrLastAttemptAt = now;
  Store.save();
  if (navigator.onLine === false) {
    currencySyncState = "offline";
    updateCurrencySyncUI();
    return false;
  }
  currencySyncState = "checking";
  updateCurrencySyncUI();
  currencySyncInFlight = (async () => {
    const networkWindow = bootstrap?.target || window;
    const controller = new networkWindow.AbortController();
    const timeout = setTimeout(() => controller.abort(), USD_INR_TIMEOUT_MS);
    try {
      const response = await networkWindow.fetch(USD_INR_API, { signal: controller.signal, cache: "no-cache", credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const item = Array.isArray(data) ? data.find(entry => entry?.base === "USD" && entry?.quote === "INR") : null;
      const rate = Number(item?.rate), sourceDate = String(item?.date || "");
      if (!Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate) || !Number.isFinite(Date.parse(`${sourceDate}T00:00:00Z`))) throw new Error("Invalid rate response");
      Object.assign(Store.data.settings, {
        usdInrRate: rate,
        usdInrSourceDate: sourceDate,
        usdInrUpdatedAt: Date.now(),
        usdInrManual: false
      });
      Store.save();
      currencySyncState = "online";
      refreshCurrencyConverter();
      return true;
    } catch {
      currencySyncState = navigator.onLine === false ? "offline" : "error";
      return false;
    } finally {
      clearTimeout(timeout);
      currencySyncInFlight = null;
      updateCurrencySyncUI();
    }
  })();
  return currencySyncInFlight;
}

function installCurrencySync() {
  const online = () => {
    if (onlineRetryUsed) return;
    onlineRetryUsed = true;
    syncUsdInrRate({ force: true });
  };
  const offline = () => {
    onlineRetryUsed = false;
    currencySyncState = "offline";
    updateCurrencySyncUI();
  };
  addEventListener("online", online);
  addEventListener("offline", offline);
  state.appCleanup.push(() => {
    removeEventListener("online", online);
    removeEventListener("offline", offline);
  });
  syncUsdInrRate();
}
const formatTime = seconds => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const targetPage = () => bootstrap?.target || (embedded ? window : window.opener && !window.opener.closed ? window.opener : window.parent !== window ? window.parent : null);
const clearPageLifecycle = () => {
  state.cleanup.splice(0).forEach(fn => { try { fn(); } catch {} });
  window.render_game_to_text = () => JSON.stringify({ mode: "dashboard", page: state.page });
  window.advanceTime = () => {};
};

function matrixRain(canvas) {
  const ctx = canvas.getContext("2d");
  let raf = 0, last = 0, columns = [], observer;
  const resize = () => {
    const dpr = devicePixelRatio || 1;
    const width = Math.max(1, appMount.clientWidth || innerWidth);
    const height = Math.max(1, appMount.clientHeight || innerHeight);
    canvas.width = width * dpr; canvas.height = height * dpr;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    columns = Array(Math.ceil(width / 18)).fill(0).map(() => Math.random() * -50);
  };
  const draw = time => {
    raf = requestAnimationFrame(draw);
    if (!Store.data.settings.rain || time - last < 70 / Store.data.settings.density) return;
    last = time;
    const width = canvas.clientWidth, height = canvas.clientHeight;
    ctx.fillStyle = "rgba(2,7,4,.075)"; ctx.fillRect(0, 0, width, height);
    ctx.font = "bold 15px monospace";
    ctx.shadowColor = Store.data.settings.accent;
    ctx.shadowBlur = 7;
    columns.forEach((y, i) => {
      ctx.fillStyle = Math.random() > .86 ? "#dcffe7" : Store.data.settings.accent;
      ctx.fillText(String.fromCharCode(0x30A0 + Math.random() * 96), i * 18, y * 18);
      columns[i] = y * 18 > height && Math.random() > .975 ? 0 : y + 1;
    });
    ctx.shadowBlur = 0;
  };
  resize(); addEventListener("resize", resize);
  if (globalThis.ResizeObserver) { observer = new ResizeObserver(resize); observer.observe(appMount); }
  raf = requestAnimationFrame(draw);
  return () => { cancelAnimationFrame(raf); removeEventListener("resize", resize); observer?.disconnect(); };
}

function pageFrame(title, subtitle, body) {
  return `<section class="page"><header class="page-head"><div><h2>${title}</h2><p>${subtitle}</p></div><div class="terminal-tag">SYS://BOD/${state.page.toUpperCase()}</div></header>${body}</section>`;
}

function renderShell() {
  appMount.style.setProperty("--green", Store.data.settings.accent);
  setHTML(appMount, `<div class="shell">
    <aside class="sidebar"><div class="brand"><b>BOOKMARKLET<br>OF DESTINY</b><small>v1.0 // OFFLINE</small></div>
    <input class="search" id="navSearch" aria-label="Filter modules" placeholder="filter modules...">
    <nav class="nav" aria-label="Modules">${PAGES.map(([id, icon, name]) => `<button data-page="${id}" class="${id === state.page ? "active" : ""}"><span>${icon}</span>${name}</button>`).join("")}</nav>
    <div class="sidebar-foot">CTRL+K COMMAND PALETTE<br>ESC CLOSE OVERLAY</div></aside>
    <main class="main"><header class="topbar" id="dragHandle"><h1>DESTINY_OS</h1><span class="muted tiny">STATUS: ONLINE</span><div class="spacer"></div><span class="clock"></span><button class="iconbtn" id="paletteBtn" title="Command palette">⌘</button><button class="iconbtn" id="minimizeBtn" title="Minimize">—</button><button class="iconbtn" id="closeBtn" title="Close">×</button></header><div class="content" id="content"></div></main>
  </div><div class="palette hidden" id="palette"><div class="palette-box"><input id="paletteInput" placeholder="Type a command or module..." autocomplete="off"><div class="palette-results"></div></div></div><canvas class="matrix"></canvas><div class="resize-handle" id="resizeHandle" title="Resize dashboard"></div>`);
  if (state.page === "games" && new URLSearchParams(location.search).get("page") === "games") {
    $(".matrix").classList.add("hidden");
  } else {
    const stopRain = matrixRain($(".matrix"));
    state.appCleanup.push(stopRain);
  }
  $$(".nav button").forEach(button => button.onclick = () => navigate(button.dataset.page));
  $("#navSearch").oninput = e => $$(".nav button").forEach(button => button.classList.toggle("hidden", !button.textContent.toLowerCase().includes(e.target.value.toLowerCase())));
  $("#closeBtn").onclick = () => {
    clearPageLifecycle();
    state.appCleanup.splice(0).forEach(fn => { try { fn(); } catch {} });
    if (bootstrap) bootstrap.close();
    else if (window.opener) window.close();
  };
  $("#minimizeBtn").onclick = event => { event.stopPropagation(); appMount.classList.toggle("minimized"); bootstrap?.minimize(appMount.classList.contains("minimized")); };
  $("#dragHandle").addEventListener("pointerdown", event => {
    if (event.target.closest("button")) return;
    bootstrap?.startDrag(event);
  });
  if (bootstrap?.mode === "popup") $("#resizeHandle").classList.add("hidden");
  else $("#resizeHandle").addEventListener("pointerdown", event => bootstrap?.startResize(event));
  $("#paletteBtn").onclick = openPalette;
  const clock = setInterval(() => $(".clock").textContent = new Date().toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" }), 1000);
  state.appCleanup.push(() => clearInterval(clock));
  addEventListener("keydown", globalKeys);
  state.appCleanup.push(() => removeEventListener("keydown", globalKeys));
  renderPage();
}

function globalKeys(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openPalette(); }
  if (event.key === "Escape") $("#palette")?.classList.add("hidden");
}

function openPalette() {
  const modal = $("#palette"), input = $("#paletteInput"), results = $(".palette-results");
  modal.classList.remove("hidden");
  const commands = [...PAGES.map(([id,, name]) => ({ label: `Open ${name}`, run: () => navigate(id) })), { label: "Close dashboard", run: () => $("#closeBtn").click() }, { label: "Reset all saved data", run: resetAll }];
  const update = () => {
    const q = input.value.toLowerCase();
    setHTML(results, "");
    commands.filter(c => c.label.toLowerCase().includes(q)).forEach(c => {
      const button = el("button", {}, escapeHtml(c.label));
      button.onclick = () => { modal.classList.add("hidden"); c.run(); };
      results.append(button);
    });
  };
  input.value = ""; input.oninput = update; update(); setTimeout(() => input.focus(), 0);
  modal.onclick = e => { if (e.target === modal) modal.classList.add("hidden"); };
}

function navigate(page) {
  clearPageLifecycle();
  state.page = page;
  $$(".nav button").forEach(button => button.classList.toggle("active", button.dataset.page === page));
  renderPage();
}

function renderPage() {
  const content = $("#content");
  const renderers = { home: homePage, calculator: calculatorPage, organizer: organizerPage, time: timePage, convert: convertPage, text: textPage, random: randomPage, qr: qrPage, draw: drawPage, page: pageControlsPage, games: gamesPage, settings: settingsPage, help: helpPage };
  setHTML(content, "");
  renderers[state.page](content);
  content.scrollTop = 0;
}

function homePage(root) {
  const todoOpen = Store.data.todos.filter(t => !t.done).length;
  setHTML(root, pageFrame("COMMAND CENTER", "Everyday tools and arcade systems ready.", `<div class="stat-grid">
    <div class="stat"><b>13</b><span>MODULES</span></div><div class="stat"><b>5</b><span>GAMES</span></div><div class="stat"><b>${todoOpen}</b><span>OPEN TASKS</span></div><div class="stat"><b>100%</b><span>OFFLINE</span></div>
    </div><div class="grid" style="margin-top:14px"><div class="card full"><h3>Quick launch</h3><div class="row wrap">${PAGES.slice(1, 12).map(([id, icon, name]) => `<button data-quick="${id}">${icon} ${name}</button>`).join("")}</div></div>
    <div class="card"><h3>System message</h3><div class="output">Wake up, operator. The toolbox is loaded. Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to search every command.</div></div>
    <div class="card"><h3>Local high scores</h3><div class="list">${Object.entries(Store.data.scores).map(([game, score]) => `<div class="item"><span class="grow">${game.toUpperCase()}</span><b>${score}</b></div>`).join("")}</div></div></div>`));
  $$("[data-quick]", root).forEach(button => button.onclick = () => navigate(button.dataset.quick));
}

function safeCalculate(input) {
  const functions = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt,
    abs: Math.abs, log: Math.log, ln: Math.log, floor: Math.floor,
    ceil: Math.ceil, round: Math.round
  };
  const tokens = [];
  const source = input.trim();
  const matcher = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([A-Za-z]+)|([()+\-*/%^]))/gy;
  let index = 0, match;
  while (index < source.length) {
    matcher.lastIndex = index;
    match = matcher.exec(source);
    if (!match) throw new Error(`Unexpected token at ${index + 1}`);
    tokens.push(match[1] ? { type: "number", value: Number(match[1]) } : match[2] ? { type: "name", value: match[2].toLowerCase() } : { type: match[3], value: match[3] });
    index = matcher.lastIndex;
  }
  let position = 0;
  const peek = type => tokens[position]?.type === type;
  const take = type => {
    if (!peek(type)) throw new Error(`Expected ${type}`);
    return tokens[position++];
  };
  const primary = () => {
    if (peek("number")) return take("number").value;
    if (peek("(")) { take("("); const value = expression(); take(")"); return value; }
    if (peek("name")) {
      const name = take("name").value;
      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;
      if (!functions[name]) throw new Error(`Unknown function: ${name}`);
      take("("); const value = expression(); take(")"); return functions[name](value);
    }
    throw new Error("Expected a number");
  };
  const unary = () => peek("+") ? (take("+"), unary()) : peek("-") ? (take("-"), -unary()) : primary();
  const power = () => { const left = unary(); return peek("^") ? (take("^"), left ** power()) : left; };
  const product = () => {
    let value = power();
    while (peek("*") || peek("/") || peek("%")) {
      const operator = tokens[position++].type, right = power();
      value = operator === "*" ? value * right : operator === "/" ? value / right : value % right;
    }
    return value;
  };
  const expression = () => {
    let value = product();
    while (peek("+") || peek("-")) {
      const operator = tokens[position++].type, right = product();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  };
  if (!tokens.length) throw new Error("Enter an expression");
  const value = expression();
  if (position !== tokens.length) throw new Error("Unexpected input");
  return value;
}

function calculatorPage(root) {
  setHTML(root, pageFrame("SCIENTIFIC CALCULATOR", "Keyboard-ready expressions with local history.", `<div class="grid"><div class="card full"><input class="calc-display" id="calcInput" aria-label="Expression" placeholder="e.g. sin(pi / 2) + sqrt(16)">
    <div class="keys" style="margin-top:9px">${["7","8","9","/","sin(","cos(","4","5","6","*","tan(","sqrt(","1","2","3","-","log(","^","0",".","(",")","+","%","pi","e","abs(","round(","C","="].map(k => `<button data-key="${k}">${k}</button>`).join("")}</div></div>
    <div class="card"><h3>Result</h3><div class="output metric" id="calcResult">0</div></div><div class="card"><h3>History</h3><div class="history" id="calcHistory">${Store.data.calcHistory.map(h => `<div>${escapeHtml(h)}</div>`).join("") || "No calculations yet."}</div></div></div>`));
  const input = $("#calcInput"), result = $("#calcResult");
  const calculate = () => {
    try {
      const value = safeCalculate(input.value);
      if (!Number.isFinite(Number(value))) throw new Error("Result is not finite");
      result.textContent = value;
      Store.data.calcHistory.unshift(`${input.value} = ${value}`);
      Store.data.calcHistory = Store.data.calcHistory.slice(0, 25); Store.save();
      setHTML($("#calcHistory"), Store.data.calcHistory.map(h => `<div>${escapeHtml(h)}</div>`).join(""));
    } catch (error) { result.textContent = `ERR: ${error.message}`; }
  };
  $$("[data-key]", root).forEach(button => button.onclick = () => {
    const key = button.dataset.key;
    if (key === "=") calculate(); else if (key === "C") { input.value = ""; result.textContent = "0"; } else { input.value += key; input.focus(); }
  });
  input.onkeydown = e => { if (e.key === "Enter") calculate(); };
  input.focus();
}

function organizerPage(root) {
  setHTML(root, pageFrame("NOTES & TODOS", "Saved automatically in this website’s local storage.", `<div class="grid"><div class="card"><h3>Notes</h3><textarea id="notes" placeholder="Write anything...">${escapeHtml(Store.data.notes)}</textarea><div class="muted tiny" id="noteStatus">AUTO-SAVE READY</div></div>
    <div class="card"><h3>Tasks</h3><div class="row"><input id="todoInput" placeholder="Add a task"><button id="todoAdd">ADD</button></div><div class="list" id="todoList" style="margin-top:10px"></div></div></div>`));
  let saveDelay;
  $("#notes").oninput = e => {
    $("#noteStatus").textContent = "SAVING...";
    clearTimeout(saveDelay); saveDelay = setTimeout(() => { Store.update("notes", e.target.value); $("#noteStatus").textContent = "SAVED"; }, 350);
  };
  state.cleanup.push(() => clearTimeout(saveDelay));
  const paint = () => {
    setHTML($("#todoList"), "");
    Store.data.todos.forEach((todo, index) => {
      const row = el("div", { class: "item" });
      setHTML(row, `<input type="checkbox" aria-label="Complete task" ${todo.done ? "checked" : ""} style="width:auto"><span class="grow ${todo.done ? "done" : ""}">${escapeHtml(todo.text)}</span><button aria-label="Delete task">×</button>`);
      $("input", row).onchange = e => { todo.done = e.target.checked; Store.save(); paint(); };
      $("button", row).onclick = () => { Store.data.todos.splice(index, 1); Store.save(); paint(); };
      $("#todoList").append(row);
    });
  };
  const add = () => {
    const input = $("#todoInput"), text = input.value.trim();
    if (!text) return;
    Store.data.todos.push({ text, done: false }); Store.save(); input.value = ""; paint();
  };
  $("#todoAdd").onclick = add; $("#todoInput").onkeydown = e => { if (e.key === "Enter") add(); }; paint();
}

function timePage(root) {
  setHTML(root, pageFrame("TIME SYSTEMS", "Timer, stopwatch, alarms, and Pomodoro cycles.", `<div class="grid"><div class="card full"><div class="tabs"><button data-mode="timer">TIMER</button><button data-mode="stopwatch">STOPWATCH</button><button data-mode="pomodoro">POMODORO</button></div>
    <div class="timer-display" id="timeDisplay">05:00</div><div class="row" style="justify-content:center;margin-top:14px"><button id="timeStart" class="primary">START</button><button id="timeReset">RESET</button></div></div>
    <div class="card"><h3>Timer duration</h3><div class="row"><input type="number" id="timerMinutes" min="1" max="999" value="5"><span>minutes</span><button id="timerSet">SET</button></div></div>
    <div class="card"><h3>Alarm</h3><div class="row"><input type="time" id="alarmTime"><button id="alarmSet">ARM</button></div><div class="output" id="alarmStatus">No alarm armed.</div></div></div>`));
  const display = $("#timeDisplay");
  const paint = () => {
    const watch = state.timer.mode === "stopwatch";
    display.textContent = formatTime(watch ? state.stopwatch.elapsed : state.timer.remaining);
    $("#timeStart").textContent = (watch ? state.stopwatch.running : state.timer.running) ? "PAUSE" : "START";
    $$("[data-mode]").forEach(b => b.classList.toggle("active", b.dataset.mode === state.timer.mode));
  };
  $$("[data-mode]").forEach(button => button.onclick = () => {
    state.timer.mode = button.dataset.mode;
    if (state.timer.mode === "pomodoro") { state.timer.remaining = state.timer.pomodoroWork ? 1500 : 300; state.timer.initial = state.timer.remaining; state.timer.running = false; }
    paint();
  });
  $("#timeStart").onclick = () => state.timer.mode === "stopwatch" ? state.stopwatch.running = !state.stopwatch.running : state.timer.running = !state.timer.running;
  $("#timeReset").onclick = () => { state.timer.running = false; state.stopwatch.running = false; state.stopwatch.elapsed = 0; state.timer.remaining = state.timer.initial; paint(); };
  $("#timerSet").onclick = () => { const s = Math.max(60, Number($("#timerMinutes").value) * 60); state.timer.remaining = state.timer.initial = s; state.timer.mode = "timer"; state.timer.running = false; paint(); };
  $("#alarmSet").onclick = () => { state.alarm = $("#alarmTime").value; $("#alarmStatus").textContent = state.alarm ? `Alarm armed for ${state.alarm}` : "Choose a time."; };
  let last = performance.now();
  const interval = setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    if (state.stopwatch.running) state.stopwatch.elapsed += dt;
    if (state.timer.running) {
      state.timer.remaining -= dt;
      if (state.timer.remaining <= 0) {
        state.timer.running = false; state.timer.remaining = 0; toast(state.timer.mode === "pomodoro" ? "Pomodoro cycle complete" : "Timer complete");
        if (state.timer.mode === "pomodoro") { state.timer.pomodoroWork = !state.timer.pomodoroWork; state.timer.remaining = state.timer.initial = state.timer.pomodoroWork ? 1500 : 300; }
      }
    }
    if (state.alarm && new Date().toTimeString().slice(0, 5) === state.alarm) { toast(`Alarm: ${state.alarm}`); state.alarm = null; $("#alarmStatus").textContent = "Alarm completed."; }
    paint();
  }, 100);
  state.cleanup.push(() => clearInterval(interval)); paint();
}

const conversions = {
  length: { m: 1, km: 1000, cm: .01, mm: .001, mi: 1609.344, yd: .9144, ft: .3048, in: .0254 },
  mass: { kg: 1, g: .001, mg: .000001, lb: .45359237, oz: .028349523 },
  data: { B: 1, KB: 1000, MB: 1e6, GB: 1e9, KiB: 1024, MiB: 1048576, GiB: 1073741824 },
  speed: { "m/s": 1, "km/h": 1 / 3.6, mph: .44704, knot: .514444 }
};

function convertPage(root) {
  setHTML(root, pageFrame("UNIT CONVERTER", "Type into either value box to convert in both directions.", `<div class="grid"><div class="card full"><div class="select-field"><label class="select-label" for="convType">Conversion type</label><select id="convType" class="select-compact">${Object.keys(conversions).map(k => `<option>${k}</option>`).join("")}<option>temperature</option><option>currency</option></select></div><div class="split" style="margin-top:14px"><div class="stack"><input type="number" id="convInput" value="1" aria-label="First conversion value"><select id="convFrom" class="select-full" aria-label="First unit"></select></div><div class="stack"><input type="number" id="convOutput" aria-label="Second conversion value"><select id="convTo" class="select-full" aria-label="Second unit"></select></div></div><div id="currencyRate" style="margin-top:14px;display:none"><div class="row wrap"><label for="usdInrRate">1 USD equals</label><input type="number" id="usdInrRate" min="0.0001" step="0.01" value="${Store.data.settings.usdInrRate}" style="max-width:180px"><span>INR</span><button id="refreshCurrencyRate">REFRESH RATE</button></div><div id="currencyRateStatus" class="muted tiny" style="margin-top:8px"></div><div class="muted tiny" style="margin-top:5px">Daily informational reference rate from Frankfurter; transaction rates may differ.</div></div></div></div>`));
  const type = $("#convType"), from = $("#convFrom"), to = $("#convTo"), input = $("#convInput"), output = $("#convOutput"), rateInput = $("#usdInrRate"), rateRow = $("#currencyRate");
  let lastEdited = "from";
  const setup = () => {
    const units = type.value === "temperature" ? ["C", "F", "K"] : type.value === "currency" ? ["USD", "INR"] : Object.keys(conversions[type.value]);
    setHTML(from, units.map(u => `<option>${u}</option>`).join(""));
    setHTML(to, units.map((u, i) => `<option ${i === 1 ? "selected" : ""}>${u}</option>`).join(""));
    rateRow.style.display = type.value === "currency" ? "" : "none";
    input.value = "1";
    lastEdited = "from";
    calculate("from");
  };
  const temp = (v, a, b) => {
    const c = a === "C" ? v : a === "F" ? (v - 32) * 5 / 9 : v - 273.15;
    return b === "C" ? c : b === "F" ? c * 9 / 5 + 32 : c + 273.15;
  };
  const convert = (value, source, target) => {
    const rate = Number(rateInput.value);
    return type.value === "temperature" ? temp(value, source, target) : type.value === "currency" ? (!Number.isFinite(rate) || rate <= 0 ? NaN : source === target ? value : source === "USD" ? value * rate : value / rate) : value * conversions[type.value][source] / conversions[type.value][target];
  };
  const formatValue = value => Number(value.toFixed(8)).toString();
  function calculate(direction = lastEdited) {
    lastEdited = direction;
    const sourceInput = direction === "from" ? input : output;
    const targetInput = direction === "from" ? output : input;
    const sourceUnit = direction === "from" ? from.value : to.value;
    const targetUnit = direction === "from" ? to.value : from.value;
    if (sourceInput.value.trim() === "") {
      targetInput.value = "";
      return;
    }
    const result = convert(Number(sourceInput.value), sourceUnit, targetUnit);
    targetInput.value = Number.isFinite(result) ? formatValue(result) : "";
  }
  rateInput.oninput = () => {
    const rate = Number(rateInput.value);
    if (Number.isFinite(rate) && rate > 0) {
      Store.data.settings.usdInrRate = rate;
      Store.data.settings.usdInrManual = true;
      Store.save();
      currencySyncState = "idle";
    }
    updateCurrencySyncUI();
    calculate(lastEdited);
  };
  $("#refreshCurrencyRate").onclick = () => syncUsdInrRate({ force: true });
  const refresh = () => {
    rateInput.value = Store.data.settings.usdInrRate;
    updateCurrencySyncUI();
    calculate(lastEdited);
  };
  refreshCurrencyConverter = refresh;
  state.cleanup.push(() => { if (refreshCurrencyConverter === refresh) refreshCurrencyConverter = () => {}; });
  type.oninput = setup;
  from.oninput = () => calculate(lastEdited);
  to.oninput = () => calculate(lastEdited);
  input.oninput = () => calculate("from");
  output.oninput = () => calculate("to");
  setup();
  updateCurrencySyncUI();
}

function textPage(root) {
  setHTML(root, pageFrame("TEXT LAB", "Transform, inspect, encode, and format text.", `<div class="grid"><div class="card full"><textarea id="textInput" placeholder="Paste text here..."></textarea><div class="row wrap" style="margin-top:8px">
    <button data-text="upper">UPPERCASE</button><button data-text="lower">lowercase</button><button data-text="title">Title Case</button><button data-text="b64e">BASE64 ENCODE</button><button data-text="b64d">BASE64 DECODE</button><button data-text="urle">URL ENCODE</button><button data-text="urld">URL DECODE</button><button data-text="json">FORMAT JSON</button><button data-text="copy">COPY</button></div></div>
    <div class="card full"><h3>Statistics</h3><div class="stat-grid"><div class="stat"><b id="chars">0</b>CHARS</div><div class="stat"><b id="words">0</b>WORDS</div><div class="stat"><b id="lines">0</b>LINES</div><div class="stat"><b id="bytes">0</b>BYTES</div></div></div></div>`));
  const input = $("#textInput");
  const stats = () => {
    $("#chars").textContent = input.value.length; $("#words").textContent = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
    $("#lines").textContent = input.value ? input.value.split("\n").length : 0; $("#bytes").textContent = new TextEncoder().encode(input.value).length;
  };
  input.oninput = stats;
  $$("[data-text]").forEach(button => button.onclick = async () => {
    try {
      const action = button.dataset.text, value = input.value;
      if (action === "upper") input.value = value.toUpperCase();
      if (action === "lower") input.value = value.toLowerCase();
      if (action === "title") input.value = value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      if (action === "b64e") input.value = btoa(unescape(encodeURIComponent(value)));
      if (action === "b64d") input.value = decodeURIComponent(escape(atob(value)));
      if (action === "urle") input.value = encodeURIComponent(value);
      if (action === "urld") input.value = decodeURIComponent(value);
      if (action === "json") input.value = JSON.stringify(JSON.parse(value), null, 2);
      if (action === "copy") { await navigator.clipboard.writeText(value); toast("Text copied"); }
      stats();
    } catch (error) { toast(`Error: ${error.message}`); }
  }); stats();
}

function randomPage(root) {
  setHTML(root, pageFrame("RANDOM LAB", "Generate passwords, identifiers, and fair choices.", `<div class="grid">
    <div class="card"><h3>Password generator</h3><div class="row"><input type="number" id="passLength" min="4" max="128" value="20"><button id="makePass">GENERATE</button></div><label class="item"><input type="checkbox" id="symbols" checked style="width:auto"> Include symbols</label><div class="output" id="passOut"></div></div>
    <div class="card"><h3>UUID</h3><button id="makeUuid">GENERATE UUID</button><div class="output" id="uuidOut" style="margin-top:10px"></div></div>
    <div class="card third"><h3>Dice</h3><div class="metric" id="diceOut">⚄</div><button id="rollDice">ROLL D6</button></div>
    <div class="card third"><h3>Coin</h3><div class="metric" id="coinOut">?</div><button id="flipCoin">FLIP</button></div>
    <div class="card third"><h3>Random number</h3><div class="row"><input type="number" id="randMin" value="1"><input type="number" id="randMax" value="100"></div><button id="randNum" style="margin-top:8px">PICK</button><div class="metric" id="randOut"></div></div>
    <div class="card full"><h3>Random picker</h3><textarea id="pickerInput" placeholder="One choice per line"></textarea><button id="pickOne">PICK ONE</button><div class="output metric" id="pickOut" style="margin-top:8px"></div></div></div>`));
  const randomInt = max => crypto.getRandomValues(new Uint32Array(1))[0] % max;
  $("#makePass").onclick = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789" + ($("#symbols").checked ? "!@#$%^&*_-+=" : "");
    $("#passOut").textContent = Array.from({ length: Math.min(128, Math.max(4, +$("#passLength").value)) }, () => chars[randomInt(chars.length)]).join("");
  };
  $("#makeUuid").onclick = () => $("#uuidOut").textContent = crypto.randomUUID();
  $("#rollDice").onclick = () => $("#diceOut").textContent = ["⚀","⚁","⚂","⚃","⚄","⚅"][randomInt(6)];
  $("#flipCoin").onclick = () => $("#coinOut").textContent = randomInt(2) ? "HEADS" : "TAILS";
  $("#randNum").onclick = () => { const min = Math.ceil(+$("#randMin").value), max = Math.floor(+$("#randMax").value); $("#randOut").textContent = max >= min ? min + randomInt(max - min + 1) : "ERR"; };
  $("#pickOne").onclick = () => { const choices = $("#pickerInput").value.split("\n").map(s => s.trim()).filter(Boolean); $("#pickOut").textContent = choices.length ? choices[randomInt(choices.length)] : "Add choices first"; };
  $("#makePass").click(); $("#makeUuid").click();
}

function qrPage(root) {
  setHTML(root, pageFrame("QR GENERATOR", "Create a QR code entirely offline.", `<div class="grid"><div class="card"><h3>Content</h3><textarea id="qrInput" placeholder="Text or URL">Bookmarklet of Destiny</textarea><div class="row"><div class="select-field" style="flex:1"><label class="select-label" for="qrLevel">Error correction</label><select id="qrLevel" class="select-full"><option>L</option><option selected>M</option><option>Q</option><option>H</option></select></div><button id="makeQr" class="primary">GENERATE</button></div></div><div class="card"><h3>QR output</h3><div class="qr-output" id="qrOutput"></div><button id="saveQr" style="margin-top:8px">DOWNLOAD PNG</button></div></div>`));
  const make = () => {
    try {
      const qr = qrcode(0, $("#qrLevel").value); qr.addData($("#qrInput").value); qr.make();
      setHTML($("#qrOutput"), qr.createImgTag(8, 8, "Generated QR code"));
    } catch (error) { $("#qrOutput").textContent = `ERR: ${error.message}`; }
  };
  $("#makeQr").onclick = make;
  $("#saveQr").onclick = () => {
    const image = $("#qrOutput img"); if (!image) return;
    const link = el("a", { download: "destiny-qr.png", href: image.src }); link.click();
  };
  make();
}

function drawPage(root) {
  setHTML(root, pageFrame("DRAWING PAD", "A local canvas for sketches and diagrams.", `<div class="grid"><div class="card full"><div class="row wrap"><label>Color <input type="color" id="penColor" value="#122117" style="width:55px;padding:2px"></label><label>Size <input type="range" id="penSize" min="1" max="30" value="4" style="width:150px"></label><button id="drawClear">CLEAR</button><button id="drawSave">DOWNLOAD PNG</button></div><canvas class="drawing" id="drawing" width="1100" height="500"></canvas></div></div>`));
  const canvas = $("#drawing"), ctx = canvas.getContext("2d");
  ctx.fillStyle = "#f5fff8"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.lineCap = "round";
  let drawing = false;
  const point = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height]; };
  canvas.onpointerdown = e => { drawing = true; ctx.beginPath(); ctx.moveTo(...point(e)); canvas.setPointerCapture(e.pointerId); };
  canvas.onpointermove = e => { if (!drawing) return; ctx.strokeStyle = $("#penColor").value; ctx.lineWidth = $("#penSize").value; ctx.lineTo(...point(e)); ctx.stroke(); };
  canvas.onpointerup = () => drawing = false;
  $("#drawClear").onclick = () => { ctx.fillStyle = "#f5fff8"; ctx.fillRect(0, 0, canvas.width, canvas.height); };
  $("#drawSave").onclick = () => { const link = el("a", { download: "destiny-drawing.png", href: canvas.toDataURL() }); link.click(); };
}

function pageControlsPage(root) {
  const available = !!targetPage();
  setHTML(root, pageFrame("PAGE CONTROLS", "Modify the page that launched the dashboard.", `<div class="grid"><div class="card full"><h3>Target status</h3><div class="output">${available ? "OPENER CONNECTED — controls are available." : "NO OPENER — launch from the bookmarklet to use page controls."}</div></div>
    <div class="card third"><h3>Editable mode</h3><p class="muted">Click and edit text directly on the page.</p><button data-effect="editable">TOGGLE EDITING</button></div>
    <div class="card third"><h3>Image visibility</h3><p class="muted">Temporarily hide every image.</p><button data-effect="images">TOGGLE IMAGES</button></div>
    <div class="card third"><h3>Visual filter</h3><p class="muted">Invert and grayscale the page.</p><button data-effect="filter">TOGGLE FILTER</button></div>
    <div class="card third"><h3>Dark mode</h3><p class="muted">Apply a readable dark theme while keeping images and videos unchanged.</p><button data-effect="dark">TOGGLE DARK MODE</button></div>
    <div class="card"><h3>Remove overlays</h3><p class="muted">Remove likely fixed dialogs and blockers. This cannot be automatically undone.</p><button data-effect="overlays">REMOVE OVERLAYS</button></div>
    <div class="card"><h3>Reset reversible changes</h3><p class="muted">Restore editing, images, dark mode, and visual filters.</p><button data-effect="reset" class="danger">RESET PAGE</button></div></div>`));
  $$("[data-effect]").forEach(button => button.onclick = () => {
    const target = targetPage(); if (!target) return toast("No opener page connected");
    try {
      const action = button.dataset.effect, doc = target.document;
      if (action === "editable") { state.pageEffects.editable = !state.pageEffects.editable; doc.designMode = state.pageEffects.editable ? "on" : "off"; }
      if (action === "images") { state.pageEffects.images = !state.pageEffects.images; doc.querySelectorAll("img").forEach(img => { if (!img.dataset.bodDisplay) img.dataset.bodDisplay = img.style.display || " "; img.style.display = state.pageEffects.images ? "none" : img.dataset.bodDisplay.trim(); }); }
      if (action === "filter") { state.pageEffects.filter = !state.pageEffects.filter; doc.documentElement.style.filter = state.pageEffects.filter ? "invert(1) grayscale(1)" : ""; }
      if (action === "dark") {
        const existing = doc.getElementById(DARK_MODE_STYLE_ID);
        if (existing) {
          existing.remove();
          state.pageEffects.dark = false;
        } else {
          const style = doc.createElement("style");
          style.id = DARK_MODE_STYLE_ID;
          style.textContent = DARK_MODE_CSS;
          (doc.head || doc.documentElement).append(style);
          state.pageEffects.dark = true;
        }
      }
      if (action === "overlays") doc.querySelectorAll("body *").forEach(node => { const s = target.getComputedStyle(node); if ((s.position === "fixed" || s.position === "sticky") && Number(s.zIndex || 0) > 10 && node.offsetWidth > innerWidth * .3) node.remove(); });
      if (action === "reset") { doc.designMode = "off"; doc.documentElement.style.filter = ""; doc.getElementById(DARK_MODE_STYLE_ID)?.remove(); doc.querySelectorAll("img[data-bod-display]").forEach(img => img.style.display = img.dataset.bodDisplay.trim()); state.pageEffects = { editable: false, images: false, filter: false, dark: false }; }
      toast(`Page action: ${action}`);
    } catch { toast("This page blocks opener access"); }
  });
}

function gamesPage(root) {
  setHTML(root, pageFrame("DESTINY ARCADE", "Five keyboard-ready classics with local high scores.", `<div class="game-tabs">${[["snake","SNAKE"],["2048","2048"],["mines","MINESWEEPER"],["ttt","TIC-TAC-TOE"],["pong","PONG"]].map(([id, name]) => `<button data-game="${id}" class="${state.game === id ? "active" : ""}">${name}</button>`).join("")}</div><div id="gameHost"></div>`));
  $$("[data-game]").forEach(button => button.onclick = () => { clearGame(); state.game = button.dataset.game; $$("[data-game]").forEach(b => b.classList.toggle("active", b === button)); mountGame(); });
  let gameCleanup = () => {};
  const clearGame = () => { gameCleanup(); gameCleanup = () => {}; };
  const mountGame = () => { gameCleanup = ({ snake: snakeGame, "2048": game2048, mines: minesGame, ttt: tttGame, pong: pongGame })[state.game]($("#gameHost")); };
  state.cleanup.push(clearGame); mountGame();
}

function score(game, value) {
  if (value > Store.data.scores[game]) { Store.data.scores[game] = value; Store.save(); }
}

function canvasBase(host, title, controls, width = 600, height = 420) {
  setHTML(host, `<div class="game-status"><span>${title}</span><span>${controls}</span></div><div class="game-wrap"><canvas class="game-canvas" width="${width}" height="${height}" tabindex="0"></canvas></div><div class="row" style="justify-content:center;margin-top:10px"><button class="gameRestart">RESTART</button><button class="gamePause">PAUSE</button><button class="gameFull">FULLSCREEN [F]</button></div>`);
  const canvas = $("canvas", host);
  $(".gameFull", host).onclick = () => document.fullscreenElement ? document.exitFullscreen() : $(".game-wrap", host).requestFullscreen();
  return canvas;
}

function snakeGame(host) {
  const canvas = canvasBase(host, "SNAKE", "ARROWS/WASD · SPACE PAUSE"), ctx = canvas.getContext("2d");
  const size = 20, cols = 30, rows = 21;
  let snake, direction, next, food, points, mode, accumulator = 0;
  const spawn = () => { do food = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) }; while (snake.some(p => p.x === food.x && p.y === food.y)); };
  const reset = () => { snake = [{x:10,y:10},{x:9,y:10},{x:8,y:10}]; direction = next = {x:1,y:0}; points = 0; mode = "playing"; accumulator = 0; spawn(); draw(); };
  const update = dt => {
    if (mode !== "playing") return;
    accumulator += dt;
    while (accumulator >= .11) {
      accumulator -= .11; direction = next;
      const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
      if (head.x < 0 || head.x >= cols || head.y < 0 || head.y >= rows || snake.some(p => p.x === head.x && p.y === head.y)) { mode = "gameover"; score("snake", points); break; }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) { points++; spawn(); } else snake.pop();
    }
  };
  const draw = () => {
    ctx.fillStyle="#020704";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="#0b2b18";
    for(let x=0;x<canvas.width;x+=size){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke()}for(let y=0;y<canvas.height;y+=size){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()}
    ctx.fillStyle="#ff5577";ctx.fillRect(food.x*size+3,food.y*size+3,size-6,size-6);
    snake.forEach((p,i)=>{ctx.fillStyle=i?"#31c96d":"#aaffc1";ctx.fillRect(p.x*size+2,p.y*size+2,size-4,size-4)});
    ctx.fillStyle="#b7ffd1";ctx.font="16px monospace";ctx.fillText(`SCORE ${points}  BEST ${Store.data.scores.snake}`,12,22);
    if(mode==="gameover"){ctx.fillStyle="#000c";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#ff7790";ctx.font="30px monospace";ctx.textAlign="center";ctx.fillText("SIGNAL LOST",canvas.width/2,canvas.height/2);ctx.textAlign="left"}
  };
  const key = e => {
    const map={ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};
    if(map[e.key] && !(map[e.key][0]===-direction.x&&map[e.key][1]===-direction.y)){next={x:map[e.key][0],y:map[e.key][1]};e.preventDefault()}
    if(e.key===" "){mode=mode==="paused"?"playing":"paused";e.preventDefault()}if(e.key.toLowerCase()==="f")$(".gameFull",host).click();
  };
  let last=performance.now(),raf;const loop=t=>{const dt=Math.min(.05,(t-last)/1000);last=t;update(dt);draw();raf=requestAnimationFrame(loop)};
  addEventListener("keydown",key);$(".gameRestart",host).onclick=reset;$(".gamePause",host).onclick=()=>mode=mode==="paused"?"playing":"paused";
  window.render_game_to_text=()=>JSON.stringify({game:"snake",mode,coordinates:"origin top-left, +x right, +y down",snake,food,score:points});
  window.advanceTime=ms=>{for(let i=0;i<Math.ceil(ms/16.67);i++)update(1/60);draw()};reset();raf=requestAnimationFrame(loop);canvas.focus();
  return()=>{cancelAnimationFrame(raf);removeEventListener("keydown",key)};
}

function game2048(host) {
  const canvas=canvasBase(host,"2048","ARROWS/WASD",500,500),ctx=canvas.getContext("2d");let grid,points,mode;
  const empty=()=>{const a=[];grid.forEach((r,y)=>r.forEach((v,x)=>{if(!v)a.push([x,y])}));return a};
  const add=()=>{const a=empty();if(!a.length)return;const [x,y]=a[Math.floor(Math.random()*a.length)];grid[y][x]=Math.random()<.9?2:4};
  const reset=()=>{grid=Array.from({length:4},()=>Array(4).fill(0));points=0;mode="playing";add();add();draw()};
  const slide=line=>{const clean=line.filter(Boolean),out=[];for(let i=0;i<clean.length;i++){if(clean[i]===clean[i+1]){out.push(clean[i]*2);points+=clean[i]*2;i++}else out.push(clean[i])}while(out.length<4)out.push(0);return out};
  const hasMoves=()=>empty().length>0||grid.some((row,y)=>row.some((v,x)=>v&&(grid[y]?.[x+1]===v||grid[y+1]?.[x]===v)));
  const move=dir=>{if(mode!=="playing")return;const before=JSON.stringify(grid);if(dir==="left")grid=grid.map(slide);if(dir==="right")grid=grid.map(r=>slide([...r].reverse()).reverse());if(dir==="up"||dir==="down"){let next=Array.from({length:4},()=>Array(4).fill(0));for(let x=0;x<4;x++){let col=grid.map(r=>r[x]);if(dir==="down")col.reverse();col=slide(col);if(dir==="down")col.reverse();col.forEach((v,y)=>next[y][x]=v)}grid=next}if(JSON.stringify(grid)!==before)add();score("2048",points);if(!hasMoves())mode="gameover";draw()};
  const draw=()=>{ctx.fillStyle="#06110b";ctx.fillRect(0,0,500,500);const colors={0:"#0b2114",2:"#173a22",4:"#1f5230",8:"#1c8241",16:"#17aa50",32:"#39d86d",64:"#70ff9f",128:"#ffd166",256:"#ffad4d",512:"#ff764d",1024:"#ff5577",2048:"#e9a8ff"};grid.forEach((r,y)=>r.forEach((v,x)=>{ctx.fillStyle=colors[v]||"#fff";ctx.fillRect(x*120+14,y*120+14,108,108);if(v){ctx.fillStyle=v>=128?"#071008":"#d7ffe3";ctx.font=`bold ${v>=1000?27:35}px monospace`;ctx.textAlign="center";ctx.fillText(v,x*120+68,y*120+81)}}));ctx.textAlign="left";ctx.fillStyle="#b7ffd1";ctx.font="15px monospace";ctx.fillText(`SCORE ${points}  BEST ${Store.data.scores["2048"]}`,14,495);if(mode==="gameover"){ctx.fillStyle="#000c";ctx.fillRect(0,0,500,500);ctx.fillStyle="#ff7790";ctx.font="28px monospace";ctx.textAlign="center";ctx.fillText("NO MOVES",250,250)}};
  const key=e=>{const m={ArrowLeft:"left",a:"left",ArrowRight:"right",d:"right",ArrowUp:"up",w:"up",ArrowDown:"down",s:"down"};if(m[e.key]){move(m[e.key]);e.preventDefault()}if(e.key.toLowerCase()==="f")$(".gameFull",host).click()};
  addEventListener("keydown",key);$(".gameRestart",host).onclick=reset;$(".gamePause",host).disabled=true;window.render_game_to_text=()=>JSON.stringify({game:"2048",mode,grid,score:points});window.advanceTime=()=>draw();reset();canvas.focus();return()=>removeEventListener("keydown",key);
}

function minesGame(host) {
  setHTML(host, `<div class="game-status"><span>MINESWEEPER</span><span>LEFT OPEN · RIGHT FLAG</span></div><div class="game-wrap"><div class="mine-grid"></div></div><div class="row" style="justify-content:center;margin-top:10px"><div class="select-field" style="flex:1"><label class="select-label" for="mineDifficulty">Difficulty</label><select id="mineDifficulty" class="select-full"><option value="9,9,10">EASY</option><option value="16,12,30">MEDIUM</option><option value="20,14,50">HARD</option></select></div><button class="gameRestart">RESTART</button></div>`);
  let width,height,total,board,mode,opened;
  const reset=()=>{[width,height,total]=$("#mineDifficulty").value.split(",").map(Number);board=Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>({x,y,mine:false,open:false,flag:false,n:0})));let placed=0;while(placed<total){const c=board[Math.floor(Math.random()*height)][Math.floor(Math.random()*width)];if(!c.mine){c.mine=true;placed++}}board.flat().forEach(c=>c.n=neighbors(c).filter(n=>n.mine).length);mode="playing";opened=0;paint()};
  const neighbors=c=>board.slice(Math.max(0,c.y-1),c.y+2).flatMap(r=>r.slice(Math.max(0,c.x-1),c.x+2)).filter(n=>n!==c);
  const open=c=>{if(mode!=="playing"||c.flag||c.open)return;c.open=true;opened++;if(c.mine){mode="gameover";board.flat().filter(x=>x.mine).forEach(x=>x.open=true)}else if(c.n===0)neighbors(c).forEach(open);if(opened===width*height-total){mode="won";score("mines",Math.max(Store.data.scores.mines,total))}paint()};
  const paint=()=>{const grid=$(".mine-grid",host);grid.style.gridTemplateColumns=`repeat(${width},30px)`;setHTML(grid,"");board.flat().forEach(c=>{const b=el("button",{class:c.open?"open":c.flag?"flag":""},c.open?(c.mine?"✹":c.n||""):c.flag?"⚑":"");b.onclick=()=>open(c);b.oncontextmenu=e=>{e.preventDefault();if(!c.open){c.flag=!c.flag;paint()}};grid.append(b)});if(mode!=="playing")insertHTML(grid,"afterend",`<div class="metric" style="margin-top:12px;color:${mode==="won"?"var(--green)":"var(--danger)"}">${mode.toUpperCase()}</div>`)};
  $(".gameRestart",host).onclick=reset;$("#mineDifficulty").onchange=reset;window.render_game_to_text=()=>JSON.stringify({game:"minesweeper",mode,size:[width,height],mines:total,visible:board.flat().filter(c=>c.open||c.flag).map(c=>({x:c.x,y:c.y,open:c.open,flag:c.flag,value:c.open?(c.mine?"mine":c.n):null}))});window.advanceTime=()=>{};reset();return()=>{};
}

function tttGame(host) {
  setHTML(host, `<div class="game-status"><span>TIC-TAC-TOE</span><span id="tttControls">YOU: X · CPU: O</span></div><div class="game-wrap"><div class="ttt"></div><div class="metric" id="tttStatus"></div></div><div class="row" style="justify-content:center;margin-top:10px"><div class="select-field" style="flex:1"><label class="select-label" for="tttPlayers">Game mode</label><select id="tttPlayers" class="select-full" aria-label="Tic-Tac-Toe player mode"><option value="one">1 PLAYER</option><option value="two">2 PLAYERS</option></select></div><button class="gameRestart">RESTART</button></div>`);
  let cells,mode,current,playerMode="one",cpuTimer=null;
  const winner=b=>[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]].find(l=>b[l[0]]&&b[l[0]]===b[l[1]]&&b[l[1]]===b[l[2]]);
  const clearCpu=()=>{if(cpuTimer!==null){clearTimeout(cpuTimer);cpuTimer=null}};
  const finish=()=>{
    const line=winner(cells);
    if(line){
      const mark=cells[line[0]];
      mode=playerMode==="two"?(mark==="X"?"x-won":"o-won"):(mark==="X"?"won":"lost");
      if(playerMode==="one"&&mode==="won")score("ttt",Store.data.scores.ttt+1);
    }else if(cells.every(Boolean))mode="draw";
  };
  const cpu=()=>{
    cpuTimer=null;
    if(mode!=="playing"||playerMode!=="one")return;
    const free=cells.map((v,i)=>v?null:i).filter(v=>v!==null);
    const pick=free.find(i=>{const b=[...cells];b[i]="O";return winner(b)})??free.find(i=>{const b=[...cells];b[i]="X";return winner(b)})??([4,0,2,6,8].find(i=>!cells[i]))??free[Math.floor(Math.random()*free.length)];
    if(pick!==undefined)cells[pick]="O";
    finish();paint();
  };
  const click=i=>{
    if(mode!=="playing"||cells[i]||(playerMode==="one"&&current==="O"))return;
    cells[i]=current;
    finish();
    if(mode==="playing")current=current==="X"?"O":"X";
    paint();
    if(playerMode==="one"&&mode==="playing")cpuTimer=setTimeout(cpu,220);
  };
  const paint=()=>{
    const grid=$(".ttt",host);setHTML(grid,"");
    cells.forEach((v,i)=>{const b=el("button",{},v||"");b.onclick=()=>click(i);grid.append(b)});
    $("#tttControls").textContent=playerMode==="two"?"PLAYER 1: X · PLAYER 2: O":"YOU: X · CPU: O";
    const labels={won:"YOU WIN",lost:"CPU WINS",draw:"DRAW","x-won":"PLAYER 1 WINS","o-won":"PLAYER 2 WINS"};
    $("#tttStatus").textContent=mode==="playing"?(playerMode==="two"?`PLAYER ${current==="X"?1:2} (${current}) TURN`:current==="X"?"YOUR MOVE":"CPU THINKING"):labels[mode];
  };
  const reset=()=>{clearCpu();cells=Array(9).fill("");mode="playing";current="X";paint()};
  $("#tttPlayers").onchange=e=>{playerMode=e.target.value;reset()};
  $(".gameRestart",host).onclick=reset;
  window.render_game_to_text=()=>JSON.stringify({game:"tic-tac-toe",mode,playerMode,currentPlayer:current,board:cells});
  window.advanceTime=()=>{};
  reset();
  return()=>clearCpu();
}

function pongGame(host) {
  const canvas=canvasBase(host,"PONG","1P: W/S OR ARROWS · FIRST TO 7",700,420),ctx=canvas.getContext("2d");
  let left,right,ball,scores,mode,last,raf,playerMode="one";
  const held=new Set(),playerSpeed=300;
  const controls=$(".gameRestart",host).parentElement;
  const playerField=el("div",{class:"select-field",style:"flex:1"});
  const playerLabel=el("label",{class:"select-label",for:"pongPlayers"},"GAME MODE");
  const playerSelect=el("select",{id:"pongPlayers",class:"select-full","aria-label":"Pong player mode"},"<option value=\"one\">1 PLAYER</option><option value=\"two\">2 PLAYERS</option>");
  playerField.append(playerLabel,playerSelect);controls.prepend(playerField);
  const movementKey=key=>key==="ArrowUp"||key==="ArrowDown"||key.toLowerCase()==="w"||key.toLowerCase()==="s";
  const clearInput=()=>held.clear();
  const controlLabel=()=>$(".game-status span:last-child",host).textContent=playerMode==="two"?"LEFT: W/S · RIGHT: ↑/↓ · FIRST TO 7":"1P: W/S OR ARROWS · FIRST TO 7";
  const resetBall=dir=>ball={x:350,y:210,vx:dir*260,vy:(Math.random()-.5)*180,r:7};
  const reset=()=>{clearInput();left=right=170;scores=[0,0];mode="playing";resetBall(Math.random()<.5?-1:1);controlLabel();draw()};
  const update=dt=>{
    if(mode!=="playing")return;
    const leftUp=held.has("w")||(playerMode==="one"&&held.has("ArrowUp"));
    const leftDown=held.has("s")||(playerMode==="one"&&held.has("ArrowDown"));
    left=Math.max(0,Math.min(340,left+(Number(leftDown)-Number(leftUp))*playerSpeed*dt));
    if(playerMode==="two"){
      right=Math.max(0,Math.min(340,right+(Number(held.has("ArrowDown"))-Number(held.has("ArrowUp")))*playerSpeed*dt));
    }else{
      right+=Math.sign(ball.y-(right+40))*Math.min(190*dt,Math.abs(ball.y-(right+40)));
    }
    ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
    if(ball.y<ball.r||ball.y>420-ball.r)ball.vy*=-1;
    if(ball.x<35&&ball.x>20&&ball.y>left&&ball.y<left+80&&ball.vx<0){ball.vx=Math.abs(ball.vx)*1.04;ball.vy+=(ball.y-(left+40))*5}
    if(ball.x>665&&ball.x<680&&ball.y>right&&ball.y<right+80&&ball.vx>0){ball.vx=-Math.abs(ball.vx)*1.04;ball.vy+=(ball.y-(right+40))*5}
    if(ball.x<0){scores[1]++;resetBall(1)}
    if(ball.x>700){scores[0]++;if(playerMode==="one")score("pong",scores[0]);resetBall(-1)}
    if(Math.max(...scores)>=7){mode=playerMode==="one"?(scores[0]===7?"won":"lost"):(scores[0]===7?"left-won":"right-won");clearInput()}
  };
  const draw=()=>{
    ctx.fillStyle="#020704";ctx.fillRect(0,0,700,420);ctx.strokeStyle="#1c6d38";ctx.setLineDash([8,10]);ctx.beginPath();ctx.moveTo(350,0);ctx.lineTo(350,420);ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle="#39ff88";ctx.fillRect(20,left,12,80);ctx.fillRect(668,right,12,80);
    ctx.fillStyle="#d7ffe3";ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.font="32px monospace";ctx.fillText(scores[0],300,42);ctx.fillText(scores[1],380,42);
    if(mode!=="playing"){
      const label={paused:"PAUSED",won:"WON",lost:"LOST","left-won":"LEFT WINS","right-won":"RIGHT WINS"}[mode]||mode.toUpperCase();
      ctx.fillStyle="#000c";ctx.fillRect(0,0,700,420);ctx.fillStyle=["won","left-won","right-won"].includes(mode)?"#39ff88":"#ff5577";ctx.textAlign="center";ctx.fillText(label,350,210);ctx.textAlign="left";
    }
  };
  const togglePause=()=>{if(mode!=="playing"&&mode!=="paused")return;clearInput();mode=mode==="paused"?"playing":"paused"};
  const keyDown=e=>{if(movementKey(e.key)){held.add(e.key.length===1?e.key.toLowerCase():e.key);e.preventDefault()}if(e.key===" "&&!e.repeat){togglePause();e.preventDefault()}if(e.key.toLowerCase()==="f"&&!e.repeat)$(".gameFull",host).click()};
  const keyUp=e=>{if(movementKey(e.key)){held.delete(e.key.length===1?e.key.toLowerCase():e.key);e.preventDefault()}};
  const loop=t=>{const dt=Math.min(.04,(t-(last||t))/1000);last=t;update(dt);draw();raf=requestAnimationFrame(loop)};
  addEventListener("keydown",keyDown);addEventListener("keyup",keyUp);addEventListener("blur",clearInput);
  playerSelect.onchange=()=>{playerMode=playerSelect.value;reset()};
  $(".gameRestart",host).onclick=reset;$(".gamePause",host).onclick=togglePause;
  window.render_game_to_text=()=>JSON.stringify({game:"pong",mode,playerMode,coordinates:"origin top-left, +x right, +y down",leftY:left,rightY:right,ball,scores});
  window.advanceTime=ms=>{for(let i=0;i<Math.ceil(ms/16.67);i++)update(1/60);draw()};
  reset();raf=requestAnimationFrame(loop);canvas.focus();
  return()=>{clearInput();cancelAnimationFrame(raf);removeEventListener("keydown",keyDown);removeEventListener("keyup",keyUp);removeEventListener("blur",clearInput)};
}

function settingsPage(root) {
  setHTML(root, pageFrame("SETTINGS", "Customize visuals and manage local data.", `<div class="grid"><div class="card"><h3>Matrix display</h3><label class="item"><input id="rainSetting" type="checkbox" ${Store.data.settings.rain ? "checked" : ""} style="width:auto"> Digital rain enabled</label><label>Rain speed<input id="densitySetting" type="range" min=".4" max="2" step=".1" value="${Store.data.settings.density}"></label><label>Accent color<input id="accentSetting" type="color" value="${Store.data.settings.accent}" style="height:45px"></label></div>
    <div class="card"><h3>Data</h3><p class="muted">Data is stored only for this website origin. Reset permanently deletes notes, tasks, history, settings, and scores.</p><button id="resetData" class="danger">RESET ALL LOCAL DATA</button></div>
    <div class="card full"><h3>Storage identity</h3><div class="output">${escapeHtml(location.origin === "null" ? "opaque preview origin" : location.origin)}<br>KEY: ${APP_KEY}</div></div></div>`));
  $("#rainSetting").onchange = e => Store.update("settings.rain", e.target.checked);
  $("#densitySetting").oninput = e => Store.update("settings.density", Number(e.target.value));
  $("#accentSetting").oninput = e => { Store.update("settings.accent", e.target.value); appMount.style.setProperty("--green", e.target.value); };
  $("#resetData").onclick = resetAll;
}

function resetAll() {
  if (!confirm("Delete all Bookmarklet of Destiny data saved on this site?")) return;
  Store.reset(); toast("Local data reset"); navigate("home");
}

function helpPage(root) {
  setHTML(root, pageFrame("HELP & SHORTCUTS", "Operational notes for the dashboard.", `<div class="grid"><div class="card"><h3>Global controls</h3><div class="list"><div class="item"><kbd>Ctrl/⌘ K</kbd><span>Command palette</span></div><div class="item"><kbd>Esc</kbd><span>Close palette / exit fullscreen</span></div><div class="item"><kbd>F</kbd><span>Fullscreen active canvas game</span></div></div></div>
    <div class="card"><h3>Game controls</h3><div class="list"><div class="item"><kbd>WASD / Arrows</kbd><span>Snake, 2048, Pong</span></div><div class="item"><kbd>Space</kbd><span>Pause Snake or Pong</span></div><div class="item"><kbd>Right click</kbd><span>Flag Minesweeper cell</span></div></div></div>
    <div class="card full"><h3>Browser limitations</h3><p class="muted">Chrome blocks bookmarklets on protected pages including <code>chrome://</code>, the New Tab page, extension pages, and the Chrome Web Store. On ordinary sites, the dashboard opens in a separate resizable popup window.</p></div>
    <div class="card full"><h3>Privacy</h3><p class="muted">Only the optional USD/INR updater contacts the fixed Frankfurter exchange-rate endpoint. All other tools load no external assets and use no analytics or accounts. Notes, tasks, settings, history, rates, and scores stay in local storage belonging to the page where the bookmarklet launched.</p></div></div>`));
}

Store.load();
renderShell();
installCurrencySync();
bootstrap?.ready?.();
