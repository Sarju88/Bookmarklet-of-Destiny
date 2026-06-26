import qrcode from "qrcode-generator";
import { algebraic, checkersLegalMoves, checkersMove, checkersResult, chessLegalMoves, chessMove, chessResult, chooseCheckersMove, chooseChessMove, initialCheckersState, initialChessState } from "./board-games.js";

const bootstrap = globalThis.__BOD_BOOTSTRAP__ || null;
const appRoot = bootstrap?.root || document;
const appMount = bootstrap?.mount || document.body;
const appHost = bootstrap?.host || null;
const embedded = !!bootstrap;
if (!appMount.id) appMount.id = "app";
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
  ["organizer", "✓", "Notes & Tasks"],
  ["time", "◷", "Time Systems"],
  ["calendar", "▣", "Calendar"],
  ["worldclock", "◉", "World Clock"],
  ["colors", "⬡", "Color Tools"],
  ["convert", "⇄", "Converters"],
  ["text", "¶", "Text Lab"],
  ["developer", "</>", "Developer Tools"],
  ["inspector", "⌕", "Page Inspector"],
  ["random", "⚄", "Random Lab"],
  ["qr", "▦", "QR Generator"],
  ["draw", "✎", "Drawing Pad"],
  ["page", "◈", "Page Controls"],
  ["games", "◆", "Arcade"],
  ["settings", "⚙", "Settings"],
  ["help", "?", "Help"]
];
const FAVORITE_PAGE_IDS = PAGES.map(([id]) => id).filter(id => !["home", "settings", "help"].includes(id));
const TERMINAL_THEMES = {
  matrix: { name: "Matrix Green", bg: "#020704", panel: "#06110bbd", panel2: "#091a10", line: "#174c2b", accent: "#39ff88", text: "#9affbd", muted: "#669276" },
  amber: { name: "Amber Terminal", bg: "#080500", panel: "#171005bd", panel2: "#211707", line: "#624315", accent: "#ffbd3e", text: "#ffe0a1", muted: "#a37d45" },
  cyan: { name: "Cyber Cyan", bg: "#010708", panel: "#041416bd", panel2: "#071d20", line: "#15535b", accent: "#35e7ff", text: "#a9f6ff", muted: "#57949b" },
  violet: { name: "Ultraviolet", bg: "#07030b", panel: "#13091bbd", panel2: "#1c0d27", line: "#51236a", accent: "#d66bff", text: "#edbdff", muted: "#946aa3" }
};

const defaults = {
  version: 1,
  notes: "",
  notesV2: [],
  noteTags: [],
  organizerMigrated: false,
  todos: [],
  calcHistory: [],
  scores: { snake: 0, "2048": 0, mines: 0, ttt: 0, pong: 0, breakout: 0, connect4: 0, tron: 0, invaders: 0, memory: 0, chess: 0, checkers: 0 },
  settings: {
    rain: true, sound: false, density: 1, accent: "#39ff88",
    terminalTheme: "matrix", matrixBrightness: .58, uiDensity: "comfortable", favoriteModules: [],
    usdInrRate: 94.37, usdInrSourceDate: "", usdInrUpdatedAt: 0,
    usdInrLastAttemptAt: 0, usdInrManual: false,
    worldClocks: ["America/New_York", "Europe/London", "Asia/Kolkata", "Asia/Tokyo"],
    worldClock24: null
  }
};

const Store = {
  data: structuredClone(defaults),
  load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(APP_KEY) || "null");
      if (parsed?.version === 1) this.data = { ...structuredClone(defaults), ...parsed, settings: { ...defaults.settings, ...parsed.settings }, scores: { ...defaults.scores, ...parsed.scores } };
    } catch {}
    if (!TERMINAL_THEMES[this.data.settings.terminalTheme]) this.data.settings.terminalTheme = "matrix";
    if (!["compact", "comfortable"].includes(this.data.settings.uiDensity)) this.data.settings.uiDensity = "comfortable";
    this.data.settings.matrixBrightness = Math.min(1, Math.max(.1, Number(this.data.settings.matrixBrightness) || .58));
    this.data.settings.favoriteModules = [...new Set(Array.isArray(this.data.settings.favoriteModules) ? this.data.settings.favoriteModules : [])].filter(id => FAVORITE_PAGE_IDS.includes(id));
    this.migrateOrganizer();
    return this.data;
  },
  migrateOrganizer() {
    const now = Date.now();
    if (!Array.isArray(this.data.notesV2)) this.data.notesV2 = [];
    if (!Array.isArray(this.data.noteTags)) this.data.noteTags = [];
    if (!Array.isArray(this.data.todos)) this.data.todos = [];
    let changed = !this.data.todos.every(todo => todo.id && todo.priority && "dueDate" in todo && todo.createdAt && todo.updatedAt);
    if (!this.data.organizerMigrated) {
      if (String(this.data.notes || "").trim() && !this.data.notesV2.length) {
        this.data.notesV2.push({
          id: crypto.randomUUID(), title: "Imported Note", body: String(this.data.notes),
          tagIds: [], pinned: false, archived: false, trashed: false,
          createdAt: now, updatedAt: now
        });
      }
      this.data.organizerMigrated = true;
      changed = true;
    }
    this.data.notesV2 = this.data.notesV2.map(note => ({
      id: note.id || crypto.randomUUID(), title: String(note.title || "Untitled Note").slice(0, 160),
      body: String(note.body || ""), tagIds: Array.isArray(note.tagIds) ? note.tagIds.map(String) : [],
      pinned: !!note.pinned, archived: !!note.archived, trashed: !!note.trashed,
      createdAt: Number(note.createdAt) || now, updatedAt: Number(note.updatedAt) || now
    }));
    this.data.noteTags = this.data.noteTags.map(tag => ({
      id: tag.id || crypto.randomUUID(), name: String(tag.name || "Tag").slice(0, 40),
      color: /^#[0-9a-f]{6}$/i.test(tag.color) ? tag.color : "#39ff88"
    }));
    this.data.todos = this.data.todos.map(todo => ({
      id: todo.id || crypto.randomUUID(), text: String(todo.text || "").slice(0, 500),
      done: !!todo.done, priority: ["low", "normal", "high"].includes(todo.priority) ? todo.priority : "normal",
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate || "") ? todo.dueDate : "",
      createdAt: Number(todo.createdAt) || now, updatedAt: Number(todo.updatedAt) || now
    })).filter(todo => todo.text);
    if (changed) this.save();
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

function orderedPages() {
  const favorites = Store.data.settings.favoriteModules || [];
  const home = PAGES.filter(([id]) => id === "home");
  const utilityPages = PAGES.filter(([id]) => FAVORITE_PAGE_IDS.includes(id));
  const favoritePages = favorites.map(id => utilityPages.find(([pageId]) => pageId === id)).filter(Boolean);
  const remainingPages = utilityPages.filter(([id]) => !favorites.includes(id));
  const systemPages = PAGES.filter(([id]) => ["settings", "help"].includes(id));
  return [...home, ...favoritePages, ...remainingPages, ...systemPages];
}

function applyAppearance() {
  const settings = Store.data.settings;
  const theme = TERMINAL_THEMES[settings.terminalTheme] || TERMINAL_THEMES.matrix;
  const customAccent = /^#[0-9a-f]{6}$/i.test(settings.accent) ? settings.accent : theme.accent;
  const values = {
    "--bg": theme.bg, "--panel": theme.panel, "--panel2": theme.panel2, "--line": theme.line,
    "--green": customAccent, "--green2": theme.text, "--muted": theme.muted,
    "--glow": `0 0 22px ${customAccent}30`, "--matrix-opacity": settings.matrixBrightness
  };
  Object.entries(values).forEach(([key, value]) => appMount.style.setProperty(key, value));
  appMount.dataset.density = settings.uiDensity;
  appMount.dataset.theme = settings.terminalTheme;
}

const state = {
  page: PAGES.some(([id]) => id === new URLSearchParams(location.search).get("page")) ? new URLSearchParams(location.search).get("page") : "home",
  game: ["snake", "2048", "mines", "ttt", "pong", "breakout", "connect4", "tron", "invaders", "memory", "chess", "checkers"].includes(new URLSearchParams(location.search).get("game")) ? new URLSearchParams(location.search).get("game") : "snake",
  cleanup: [],
  appCleanup: [],
  timer: { mode: "timer", remaining: 300, running: false, initial: 300, pomodoroWork: true },
  stopwatch: { elapsed: 0, running: false },
  alarm: null,
  pageEffects: { editable: false, images: false, filter: false, dark: false }
};

const DARK_MODE_STYLE_ID = "__bod_dark_mode";
const INSPECTOR_STYLE_ID = "__bod_inspector_highlights";
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
const cssIdent = value => String(value).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c.charCodeAt(0).toString(16)} `);
const toast = (message) => {
  const node = el("div", { class: "toast" }, escapeHtml(message));
  appMount.append(node);
  setTimeout(() => node.remove(), 1800);
};

function enhanceSelects(root) {
  const selects = $$("select", root).filter(select => !select.dataset.destinySelect);
  if (!selects.length) return () => {};
  let openControl = null, typeBuffer = "", typeTimer = null;
  const controls = [];
  const closeOpen = focus => {
    if (!openControl) return;
    const control = openControl;
    control.menu.classList.add("hidden");
    control.trigger.setAttribute("aria-expanded", "false");
    openControl = null;
    if (focus) control.trigger.focus();
  };
  const position = control => {
    if (control !== openControl) return;
    const rect = control.trigger.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;
    const desired = Math.min(280, Math.max(46, control.menu.scrollHeight + 10));
    const below = viewportHeight - rect.bottom - 8, above = rect.top - 8;
    const opensUp = below < Math.min(180, desired) && above > below;
    const height = Math.max(46, Math.min(desired, opensUp ? above : below));
    const width = Math.min(Math.max(rect.width, 150), viewportWidth - 16);
    const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
    control.menu.style.cssText = `left:${left}px;top:${opensUp ? Math.max(8, rect.top - height - 4) : Math.min(viewportHeight - height - 8, rect.bottom + 4)}px;width:${width}px;max-height:${height}px`;
    control.menu.dataset.position = opensUp ? "above" : "below";
  };
  const build = control => {
    const { select, menu, trigger } = control;
    const options = [...select.options];
    setHTML(menu, "");
    options.forEach((option, index) => {
      const item = el("button", {
        type: "button", class: "destiny-select-option", role: "option",
        id: `${control.id}-option-${index}`,
        "aria-selected": String(index === select.selectedIndex)
      }, escapeHtml(option.textContent));
      item.disabled = option.disabled;
      item.onmouseenter = () => setActive(control, index);
      item.onclick = () => choose(control, index);
      menu.append(item);
    });
    trigger.textContent = select.selectedOptions[0]?.textContent || "SELECT";
    trigger.disabled = select.disabled;
    control.activeIndex = Math.max(0, select.selectedIndex);
    if (control === openControl) position(control);
  };
  const sync = control => {
    control.trigger.textContent = control.select.selectedOptions[0]?.textContent || "SELECT";
    control.trigger.disabled = control.select.disabled;
    [...control.menu.children].forEach((item, index) => item.setAttribute("aria-selected", String(index === control.select.selectedIndex)));
    control.activeIndex = Math.max(0, control.select.selectedIndex);
  };
  const setActive = (control, index) => {
    const items = [...control.menu.children];
    if (!items[index] || items[index].disabled) return;
    control.activeIndex = index;
    items.forEach((item, itemIndex) => item.classList.toggle("active", itemIndex === index));
    control.trigger.setAttribute("aria-activedescendant", items[index].id);
    items[index].scrollIntoView({ block: "nearest" });
  };
  const move = (control, direction) => {
    const items = [...control.menu.children];
    let index = control.activeIndex;
    for (let count = 0; count < items.length; count++) {
      index = (index + direction + items.length) % items.length;
      if (!items[index].disabled) return setActive(control, index);
    }
  };
  const choose = (control, index) => {
    const option = control.select.options[index];
    if (!option || option.disabled) return;
    control.select.selectedIndex = index;
    control.select.dispatchEvent(new window.Event("input", { bubbles: true }));
    control.select.dispatchEvent(new window.Event("change", { bubbles: true }));
    sync(control);
    closeOpen(true);
  };
  const open = control => {
    if (control.select.disabled) return;
    if (openControl && openControl !== control) closeOpen(false);
    openControl = control;
    build(control);
    control.menu.classList.remove("hidden");
    control.trigger.setAttribute("aria-expanded", "true");
    position(control);
    setActive(control, Math.max(0, control.select.selectedIndex));
  };
  selects.forEach((select, number) => {
    select.dataset.destinySelect = "true";
    const id = `${select.id || `destiny-select-${number}`}-listbox`;
    const wrapper = el("div", { class: `destiny-select ${select.classList.contains("select-compact") ? "select-compact" : "select-full"}` });
    const trigger = el("button", {
      type: "button", class: "destiny-select-trigger", role: "combobox",
      "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": id,
      "aria-label": select.getAttribute("aria-label") || select.labels?.[0]?.textContent || select.id || "Select"
    });
    const menu = el("div", { class: "destiny-select-menu hidden", role: "listbox", id });
    select.classList.add("native-select-hidden");
    select.insertAdjacentElement("afterend", wrapper);
    wrapper.append(trigger);
    appMount.append(menu);
    const control = { select, wrapper, trigger, menu, id, activeIndex: 0, observer: null };
    controls.push(control);
    build(control);
    const labels = [...(select.labels || [])];
    const labelClick = event => { event.preventDefault(); trigger.focus(); open(control); };
    labels.forEach(label => label.addEventListener("click", labelClick));
    const syncListener = () => sync(control);
    select.addEventListener("input", syncListener);
    select.addEventListener("change", syncListener);
    trigger.onclick = () => openControl === control ? closeOpen(false) : open(control);
    trigger.onkeydown = event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (openControl !== control) open(control);
        else move(control, event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Home" || event.key === "End") {
        event.preventDefault(); if (openControl !== control) open(control);
        const items = [...menu.children], direction = event.key === "Home" ? 1 : -1;
        let index = event.key === "Home" ? 0 : items.length - 1;
        while (items[index]?.disabled) index += direction;
        setActive(control, index);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (openControl === control) choose(control, control.activeIndex); else open(control);
      } else if (event.key === "Escape") {
        if (openControl === control) { event.preventDefault(); closeOpen(true); }
      } else if (event.key === "Tab") {
        closeOpen(false);
      } else if (event.key.length === 1 && /\S/.test(event.key)) {
        typeBuffer += event.key.toLowerCase();
        clearTimeout(typeTimer); typeTimer = setTimeout(() => typeBuffer = "", 650);
        const start = openControl === control ? control.activeIndex + 1 : select.selectedIndex + 1;
        const options = [...select.options];
        const match = [...options.slice(start), ...options.slice(0, start)].findIndex(option => !option.disabled && option.textContent.trim().toLowerCase().startsWith(typeBuffer));
        if (match >= 0) {
          const index = (start + match) % options.length;
          if (openControl !== control) open(control);
          setActive(control, index);
        }
      }
    };
    control.observer = new window.MutationObserver(() => build(control));
    control.observer.observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "selected", "label"] });
    control.cleanup = () => {
      select.removeEventListener("input", syncListener);
      select.removeEventListener("change", syncListener);
      labels.forEach(label => label.removeEventListener("click", labelClick));
      control.observer.disconnect();
      menu.remove(); wrapper.remove();
      select.classList.remove("native-select-hidden");
      delete select.dataset.destinySelect;
    };
  });
  const outside = event => {
    if (openControl && !openControl.wrapper.contains(event.target) && !openControl.menu.contains(event.target)) closeOpen(false);
  };
  const reposition = () => openControl && position(openControl);
  document.addEventListener("pointerdown", outside);
  addEventListener("resize", reposition);
  $(".content")?.addEventListener("scroll", reposition, { passive: true });
  return () => {
    closeOpen(false); clearTimeout(typeTimer);
    document.removeEventListener("pointerdown", outside);
    removeEventListener("resize", reposition);
    $(".content")?.removeEventListener("scroll", reposition);
    controls.forEach(control => control.cleanup());
  };
}

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
  applyAppearance();
  const favorites = Store.data.settings.favoriteModules || [];
  setHTML(appMount, `<div class="shell">
    <aside class="sidebar"><div class="brand"><b>BOOKMARKLET<br>OF DESTINY</b><small>v1.0 // OFFLINE</small></div>
    <input class="search" id="navSearch" aria-label="Filter modules" placeholder="filter modules...">
    <nav class="nav" aria-label="Modules">${orderedPages().map(([id, icon, name]) => `<button data-page="${id}" class="${id === state.page ? "active" : ""}"><span>${icon}</span>${name}${favorites.includes(id) ? `<i aria-label="Favorite" title="Favorite module">★</i>` : ""}</button>`).join("")}</nav>
    <div class="sidebar-foot">CTRL+K COMMAND PALETTE<br>ESC CLOSE OVERLAY</div></aside>
    <main class="main"><header class="topbar" id="dragHandle"><h1>DESTINY_OS</h1><span class="muted tiny">STATUS: ONLINE</span><div class="spacer"></div><span class="clock"></span><button class="iconbtn" id="paletteBtn" title="Command palette">⌘</button><button class="iconbtn" id="minimizeBtn" title="Minimize">—</button><button class="iconbtn" id="closeBtn" title="Close">×</button></header><div class="content" id="content"></div></main>
  </div><div class="palette hidden" id="palette"><div class="palette-box"><input id="paletteInput" placeholder="Type a command or module..." autocomplete="off"><div class="palette-results"></div></div></div><canvas class="matrix"></canvas><div class="resize-handle" id="resizeHandle" title="Resize dashboard"></div>`);
  if (state.page === "games" && new URLSearchParams(location.search).get("page") === "games") {
    $(".matrix").classList.add("hidden");
  } else {
    const stopRain = matrixRain($(".matrix"));
    state.appCleanup.push(stopRain);
  }
  refreshNavigation();
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

function refreshNavigation() {
  const nav = $(".nav");
  if (!nav) return;
  const favorites = Store.data.settings.favoriteModules || [];
  setHTML(nav, orderedPages().map(([id, icon, name]) => `<button data-page="${id}" class="${id === state.page ? "active" : ""}"><span>${icon}</span>${name}${favorites.includes(id) ? `<i aria-label="Favorite" title="Favorite module">★</i>` : ""}</button>`).join(""));
  $$(".nav button").forEach(button => button.onclick = () => navigate(button.dataset.page));
  const search = $("#navSearch");
  search.oninput = event => $$(".nav button").forEach(button => button.classList.toggle("hidden", !button.textContent.toLowerCase().includes(event.target.value.toLowerCase())));
  if (search.value) search.oninput({ target: search });
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
  const renderers = { home: homePage, calculator: calculatorPage, organizer: organizerPage, time: timePage, calendar: calendarPage, worldclock: worldClockPage, colors: colorToolsPage, convert: convertPage, text: textPage, developer: developerToolsPage, inspector: inspectorPage, random: randomPage, qr: qrPage, draw: drawPage, page: pageControlsPage, games: gamesPage, settings: settingsPage, help: helpPage };
  setHTML(content, "");
  renderers[state.page](content);
  state.cleanup.push(enhanceSelects(content));
  content.scrollTop = 0;
}

function homePage(root) {
  const todoOpen = Store.data.todos.filter(t => !t.done).length;
  const quickPages = orderedPages().filter(([id]) => FAVORITE_PAGE_IDS.includes(id));
  setHTML(root, pageFrame("COMMAND CENTER", "Everyday tools and arcade systems ready.", `<div class="stat-grid">
    <div class="stat"><b>${PAGES.length}</b><span>MODULES</span></div><div class="stat"><b>12</b><span>GAMES</span></div><div class="stat"><b>${todoOpen}</b><span>OPEN TASKS</span></div><div class="stat"><b>100%</b><span>OFFLINE</span></div>
    </div><div class="grid" style="margin-top:14px"><div class="card full"><h3>Quick launch</h3><div class="row wrap">${quickPages.map(([id, icon, name]) => `<button data-quick="${id}" class="${Store.data.settings.favoriteModules.includes(id) ? "favorite-quick" : ""}">${Store.data.settings.favoriteModules.includes(id) ? "★ " : ""}${icon} ${name}</button>`).join("")}</div></div>
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
  setHTML(root, pageFrame("NOTES & TASKS", "A local Markdown workspace saved automatically for this website.", `<div class="organizer-tabs" role="tablist" aria-label="Organizer views">
    <button data-organizer-view="notes" class="active">NOTES</button><button data-organizer-view="archive">ARCHIVE</button><button data-organizer-view="trash">TRASH</button><button data-organizer-view="tasks">TASKS</button>
    </div><section id="organizerNotes"><div class="organizer-layout">
      <aside class="organizer-sidebar card"><div class="row"><button id="newNote" class="primary grow">+ NEW NOTE</button></div>
        <input id="noteSearch" placeholder="Search notes..." aria-label="Search notes">
        <div class="split compact"><div class="select-field"><label class="select-label" for="noteSort">Sort</label><select id="noteSort" class="select-full"><option value="updated">Recently updated</option><option value="created">Recently created</option><option value="title">Title</option></select></div>
        <div class="select-field"><label class="select-label" for="noteTagFilter">Tag</label><select id="noteTagFilter" class="select-full"><option value="">All tags</option></select></div></div>
        <div class="note-list" id="noteList"></div>
        <div class="tag-manager"><h3>Tags</h3><div class="row"><input id="newTagName" maxlength="40" placeholder="Tag name"><input id="newTagColor" type="color" value="#39ff88" aria-label="Tag color"><button id="addTag">ADD</button></div><div id="tagList" class="tag-list"></div></div>
      </aside>
      <div class="organizer-editor card" id="noteEditor"><div class="organizer-empty">CREATE OR SELECT A NOTE</div></div>
    </div></section>
    <section id="organizerTasks" class="hidden"><div class="grid">
      <div class="card full"><div class="task-add-grid"><input id="todoInput" placeholder="Add a task"><div class="select-field"><label class="select-label" for="todoPriority">Priority</label><select id="todoPriority" class="select-full"><option value="low">Low</option><option value="normal" selected>Normal</option><option value="high">High</option></select></div><label>Due date<input id="todoDue" type="date"></label><button id="todoAdd" class="primary">ADD TASK</button></div></div>
      <div class="card full"><div class="row wrap task-toolbar"><div class="tabs" id="taskFilters">${["all","active","completed","overdue","today","upcoming"].map((filter, index) => `<button data-task-filter="${filter}" class="${index ? "" : "active"}">${filter.toUpperCase()}</button>`).join("")}</div><button id="clearCompleted" class="danger">CLEAR COMPLETED</button></div><div id="todoList" class="task-list"></div></div>
    </div></section>
    <section class="card organizer-backup"><h3>Backup and transfer</h3><div class="row wrap"><button id="exportOrganizer">EXPORT JSON</button><input id="importOrganizerFile" type="file" accept="application/json,.json" aria-label="Organizer backup file"><button id="importMerge">IMPORT + MERGE</button><button id="importReplace" class="danger">IMPORT + REPLACE</button></div><div class="muted tiny" id="importStatus">IMPORTS CHANGE NOTES, TAGS, AND TASKS ONLY.</div></section>`));

  let view = "notes", selectedId = null, taskFilter = "all", saveDelay;
  const now = () => Date.now();
  const noteById = id => Store.data.notesV2.find(note => note.id === id);
  const currentNotes = () => Store.data.notesV2.filter(note => view === "trash" ? note.trashed : view === "archive" ? note.archived && !note.trashed : !note.archived && !note.trashed);
  const displayTime = value => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const localIsoDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const save = () => Store.save();
  const createNote = (seed = {}) => {
    const timestamp = now();
    const note = {
      id: crypto.randomUUID(), title: seed.title || "Untitled Note", body: seed.body || "",
      tagIds: [...(seed.tagIds || [])], pinned: !!seed.pinned, archived: false, trashed: false,
      createdAt: timestamp, updatedAt: timestamp
    };
    Store.data.notesV2.unshift(note); selectedId = note.id; view = "notes"; save(); paintAll();
    setTimeout(() => $("#noteTitle")?.select(), 0);
  };
  const filteredNotes = () => {
    const query = $("#noteSearch").value.trim().toLowerCase(), tag = $("#noteTagFilter").value, sort = $("#noteSort").value;
    return currentNotes().filter(note => (!query || `${note.title}\n${note.body}`.toLowerCase().includes(query)) && (!tag || note.tagIds.includes(tag))).sort((a, b) => {
      if (a.pinned !== b.pinned) return Number(b.pinned) - Number(a.pinned);
      if (sort === "title") return a.title.localeCompare(b.title);
      return sort === "created" ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt;
    });
  };
  const paintTagOptions = () => {
    const current = $("#noteTagFilter").value;
    setHTML($("#noteTagFilter"), `<option value="">All tags</option>${Store.data.noteTags.map(tag => `<option value="${escapeHtml(tag.id)}">${escapeHtml(tag.name)}</option>`).join("")}`);
    $("#noteTagFilter").value = Store.data.noteTags.some(tag => tag.id === current) ? current : "";
    setHTML($("#tagList"), Store.data.noteTags.map(tag => `<span class="tag-chip" style="--tag:${tag.color}"><i></i>${escapeHtml(tag.name)}<button data-delete-tag="${tag.id}" aria-label="Delete ${escapeHtml(tag.name)} tag">×</button></span>`).join("") || `<span class="muted tiny">NO TAGS YET</span>`);
    $$("[data-delete-tag]", root).forEach(button => button.onclick = () => {
      const id = button.dataset.deleteTag;
      Store.data.noteTags = Store.data.noteTags.filter(tag => tag.id !== id);
      Store.data.notesV2.forEach(note => note.tagIds = note.tagIds.filter(tagId => tagId !== id));
      save(); paintAll();
    });
  };
  const paintList = () => {
    const notes = filteredNotes();
    if (!notes.some(note => note.id === selectedId)) selectedId = notes[0]?.id || null;
    setHTML($("#noteList"), notes.map(note => {
      const tags = note.tagIds.map(id => Store.data.noteTags.find(tag => tag.id === id)).filter(Boolean);
      return `<button class="note-list-item ${note.id === selectedId ? "active" : ""}" data-note-id="${note.id}"><span><b>${note.pinned ? "◆ " : ""}${escapeHtml(note.title || "Untitled Note")}</b><small>${escapeHtml(note.body.replace(/\s+/g, " ").slice(0, 75) || "Empty note")}</small></span><span class="note-list-meta">${tags.map(tag => `<i style="background:${tag.color}" title="${escapeHtml(tag.name)}"></i>`).join("")}<time>${displayTime(note.updatedAt)}</time></span></button>`;
    }).join("") || `<div class="organizer-empty">NO ${view.toUpperCase()} NOTES</div>`);
    $$("[data-note-id]", root).forEach(button => button.onclick = () => { selectedId = button.dataset.noteId; paintList(); paintEditor(); });
  };
  const paintEditor = () => {
    const host = $("#noteEditor"), note = noteById(selectedId);
    if (!note) { setHTML(host, `<div class="organizer-empty">CREATE OR SELECT A NOTE</div>`); return; }
    const trashed = note.trashed, archived = note.archived && !trashed;
    setHTML(host, `<div class="note-editor-head"><input id="noteTitle" maxlength="160" value="${escapeHtml(note.title)}" aria-label="Note title"><div class="row wrap">
      ${trashed ? `<button id="restoreNote">RESTORE</button><button id="deleteNoteForever" class="danger">DELETE FOREVER</button>` : `<button id="pinNote">${note.pinned ? "UNPIN" : "PIN"}</button><button id="duplicateNote">DUPLICATE</button><button id="archiveNote">${archived ? "UNARCHIVE" : "ARCHIVE"}</button><button id="trashNote" class="danger">TRASH</button>`}
      </div></div><div class="note-tags">${Store.data.noteTags.map(tag => `<label class="tag-toggle" style="--tag:${tag.color}"><input type="checkbox" data-note-tag="${tag.id}" ${note.tagIds.includes(tag.id) ? "checked" : ""}><span>${escapeHtml(tag.name)}</span></label>`).join("") || `<span class="muted tiny">ADD TAGS FROM THE SIDEBAR</span>`}</div>
      <div class="note-editor-grid"><div><h3>Markdown</h3><textarea id="noteBody" class="note-body" placeholder="Write Markdown...">${escapeHtml(note.body)}</textarea></div><div><h3>Preview</h3><div id="notePreview" class="developer-render note-preview"></div></div></div>
      <div class="note-editor-foot"><span id="noteStatus">SAVED</span><span id="noteCounts"></span><span>CREATED ${displayTime(note.createdAt)} · UPDATED <b id="noteUpdated">${displayTime(note.updatedAt)}</b></span></div>`);
    const refreshPreview = () => {
      setHTML($("#notePreview"), renderMarkdown($("#noteBody").value) || `<p class="muted">Preview appears here.</p>`);
      const text = $("#noteBody").value, words = text.trim() ? text.trim().split(/\s+/).length : 0;
      $("#noteCounts").textContent = `${words} WORDS · ${text.length} CHARACTERS`;
    };
    const queueSave = () => {
      $("#noteStatus").textContent = "SAVING...";
      clearTimeout(saveDelay);
      saveDelay = setTimeout(() => {
        const current = noteById(selectedId); if (!current) return;
        current.title = $("#noteTitle").value.trim() || "Untitled Note";
        current.body = $("#noteBody").value; current.updatedAt = now(); save();
        $("#noteStatus").textContent = "SAVED"; $("#noteUpdated").textContent = displayTime(current.updatedAt); paintList();
      }, 350);
    };
    $("#noteTitle").oninput = queueSave;
    $("#noteBody").oninput = () => { refreshPreview(); queueSave(); };
    $$("[data-note-tag]", host).forEach(input => input.onchange = () => {
      note.tagIds = $$("[data-note-tag]:checked", host).map(item => item.dataset.noteTag); note.updatedAt = now(); save(); paintList();
    });
    if (!trashed) {
      $("#pinNote").onclick = () => { note.pinned = !note.pinned; note.updatedAt = now(); save(); paintAll(); };
      $("#duplicateNote").onclick = () => createNote({ title: `${note.title} Copy`, body: note.body, tagIds: note.tagIds });
      $("#archiveNote").onclick = () => { note.archived = !note.archived; note.pinned = false; note.updatedAt = now(); selectedId = null; save(); paintAll(); };
      $("#trashNote").onclick = () => { note.trashed = true; note.archived = false; note.pinned = false; note.updatedAt = now(); selectedId = null; save(); paintAll(); };
    } else {
      $("#restoreNote").onclick = () => { note.trashed = false; note.updatedAt = now(); selectedId = null; save(); paintAll(); };
      $("#deleteNoteForever").onclick = () => {
        if (!confirm(`Permanently delete "${note.title}"?`)) return;
        Store.data.notesV2 = Store.data.notesV2.filter(item => item.id !== note.id); selectedId = null; save(); paintAll();
      };
    }
    refreshPreview();
  };
  const taskVisible = todo => {
    const today = localIsoDate(new Date());
    if (taskFilter === "active") return !todo.done;
    if (taskFilter === "completed") return todo.done;
    if (taskFilter === "overdue") return !todo.done && todo.dueDate && todo.dueDate < today;
    if (taskFilter === "today") return todo.dueDate === today;
    if (taskFilter === "upcoming") return !todo.done && todo.dueDate > today;
    return true;
  };
  const paintTasks = () => {
    const priorityRank = { high: 0, normal: 1, low: 2 };
    const tasks = Store.data.todos.filter(taskVisible).sort((a, b) => Number(a.done) - Number(b.done) || priorityRank[a.priority] - priorityRank[b.priority] || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || b.createdAt - a.createdAt);
    setHTML($("#todoList"), tasks.map(todo => {
      const today = localIsoDate(new Date()), dueState = todo.dueDate && !todo.done ? todo.dueDate < today ? "overdue" : todo.dueDate === today ? "today" : "" : "";
      return `<div class="task-item priority-${todo.priority} ${todo.done ? "done" : ""}" data-task-id="${todo.id}"><input type="checkbox" data-task-done aria-label="Complete task" ${todo.done ? "checked" : ""}><input class="task-text" value="${escapeHtml(todo.text)}" aria-label="Task text"><button data-task-priority title="Change priority">${todo.priority.toUpperCase()}</button><input type="date" data-task-due value="${todo.dueDate}" class="${dueState}" aria-label="Due date"><button data-task-delete class="danger" aria-label="Delete task">×</button></div>`;
    }).join("") || `<div class="organizer-empty">NO ${taskFilter.toUpperCase()} TASKS</div>`);
    $$("[data-task-id]", root).forEach(row => {
      const todo = Store.data.todos.find(item => item.id === row.dataset.taskId);
      $("[data-task-done]", row).onchange = event => { todo.done = event.target.checked; todo.updatedAt = now(); save(); paintTasks(); };
      $(".task-text", row).onchange = event => { const value = event.target.value.trim(); if (value) { todo.text = value; todo.updatedAt = now(); save(); } else paintTasks(); };
      $("[data-task-priority]", row).onclick = () => { todo.priority = { low: "normal", normal: "high", high: "low" }[todo.priority]; todo.updatedAt = now(); save(); paintTasks(); };
      $("[data-task-due]", row).onchange = event => { todo.dueDate = event.target.value; todo.updatedAt = now(); save(); paintTasks(); };
      $("[data-task-delete]", row).onclick = () => { Store.data.todos = Store.data.todos.filter(item => item.id !== todo.id); save(); paintTasks(); };
    });
  };
  const paintView = () => {
    $$("[data-organizer-view]", root).forEach(button => button.classList.toggle("active", button.dataset.organizerView === view));
    $("#organizerNotes").classList.toggle("hidden", view === "tasks");
    $("#organizerTasks").classList.toggle("hidden", view !== "tasks");
    if (view === "tasks") paintTasks(); else { paintList(); paintEditor(); }
  };
  const paintAll = () => { paintTagOptions(); paintView(); };
  const addTask = () => {
    const input = $("#todoInput"), text = input.value.trim(); if (!text) return;
    const timestamp = now();
    Store.data.todos.push({ id: crypto.randomUUID(), text, done: false, priority: $("#todoPriority").value, dueDate: $("#todoDue").value, createdAt: timestamp, updatedAt: timestamp });
    input.value = ""; save(); paintTasks();
  };
  const validateImport = raw => {
    if (!raw || raw.format !== "bookmarklet-of-destiny-organizer" || raw.version !== 1) throw new Error("Unsupported organizer backup");
    if (!Array.isArray(raw.notes) || !Array.isArray(raw.tags) || !Array.isArray(raw.todos)) throw new Error("Backup arrays are missing");
    const ids = new Set(), timestamp = now();
    const notes = raw.notes.map(note => {
      if (!note || typeof note !== "object") throw new Error("Invalid note");
      const id = String(note.id || crypto.randomUUID()); if (ids.has(`n:${id}`)) throw new Error("Duplicate note ID"); ids.add(`n:${id}`);
      return { id, title: String(note.title || "Untitled Note").slice(0, 160), body: String(note.body || "").slice(0, 1000000), tagIds: Array.isArray(note.tagIds) ? note.tagIds.map(String) : [], pinned: !!note.pinned, archived: !!note.archived, trashed: !!note.trashed, createdAt: Number(note.createdAt) || timestamp, updatedAt: Number(note.updatedAt) || timestamp };
    });
    const tags = raw.tags.map(tag => {
      const id = String(tag?.id || crypto.randomUUID()); if (ids.has(`g:${id}`)) throw new Error("Duplicate tag ID"); ids.add(`g:${id}`);
      return { id, name: String(tag?.name || "Tag").slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(tag?.color) ? tag.color : "#39ff88" };
    });
    const todos = raw.todos.map(todo => {
      const id = String(todo?.id || crypto.randomUUID()); if (ids.has(`t:${id}`)) throw new Error("Duplicate task ID"); ids.add(`t:${id}`);
      const text = String(todo?.text || "").trim().slice(0, 500); if (!text) throw new Error("Task text is missing");
      return { id, text, done: !!todo.done, priority: ["low","normal","high"].includes(todo.priority) ? todo.priority : "normal", dueDate: /^\d{4}-\d{2}-\d{2}$/.test(todo.dueDate || "") ? todo.dueDate : "", createdAt: Number(todo.createdAt) || timestamp, updatedAt: Number(todo.updatedAt) || timestamp };
    });
    const validTagIds = new Set(tags.map(tag => tag.id)); notes.forEach(note => note.tagIds = note.tagIds.filter(id => validTagIds.has(id)));
    return { notes, tags, todos };
  };
  const importOrganizer = async replace => {
    const file = $("#importOrganizerFile").files[0]; if (!file) return $("#importStatus").textContent = "SELECT A JSON BACKUP FIRST.";
    try {
      if (!(file.type === "application/json" || file.name.toLowerCase().endsWith(".json"))) throw new Error("Choose a JSON backup file");
      if (file.size > 5 * 1024 * 1024) throw new Error("Backup exceeds the 5 MB limit");
      const incoming = validateImport(JSON.parse(await file.text()));
      if (replace && !confirm("Replace all current notes, tags, and tasks with this backup?")) return;
      if (replace) {
        Store.data.notesV2 = incoming.notes; Store.data.noteTags = incoming.tags; Store.data.todos = incoming.todos;
      } else {
        const tagMap = new Map();
        incoming.tags.forEach(tag => {
          const existing = Store.data.noteTags.find(item => item.name.toLowerCase() === tag.name.toLowerCase());
          if (existing) tagMap.set(tag.id, existing.id);
          else { const id = Store.data.noteTags.some(item => item.id === tag.id) ? crypto.randomUUID() : tag.id; tagMap.set(tag.id, id); Store.data.noteTags.push({ ...tag, id }); }
        });
        incoming.notes.forEach(note => Store.data.notesV2.push({ ...note, id: Store.data.notesV2.some(item => item.id === note.id) ? crypto.randomUUID() : note.id, tagIds: note.tagIds.map(id => tagMap.get(id)).filter(Boolean) }));
        incoming.todos.forEach(todo => Store.data.todos.push({ ...todo, id: Store.data.todos.some(item => item.id === todo.id) ? crypto.randomUUID() : todo.id }));
      }
      selectedId = null; save(); paintAll(); $("#importStatus").textContent = `${replace ? "REPLACED" : "MERGED"} ${incoming.notes.length} NOTES, ${incoming.tags.length} TAGS, ${incoming.todos.length} TASKS.`;
    } catch (error) { $("#importStatus").textContent = `IMPORT ERROR: ${error.message}`; }
  };

  $$("[data-organizer-view]", root).forEach(button => button.onclick = () => { view = button.dataset.organizerView; selectedId = null; paintView(); });
  $("#newNote").onclick = () => createNote();
  $("#noteSearch").oninput = () => { selectedId = null; paintList(); paintEditor(); };
  $("#noteSort").oninput = () => { selectedId = null; paintList(); paintEditor(); };
  $("#noteTagFilter").oninput = () => { selectedId = null; paintList(); paintEditor(); };
  $("#addTag").onclick = () => {
    const name = $("#newTagName").value.trim(); if (!name) return;
    if (Store.data.noteTags.some(tag => tag.name.toLowerCase() === name.toLowerCase())) return toast("Tag already exists");
    Store.data.noteTags.push({ id: crypto.randomUUID(), name, color: $("#newTagColor").value }); $("#newTagName").value = ""; save(); paintAll();
  };
  $("#todoAdd").onclick = addTask; $("#todoInput").onkeydown = event => { if (event.key === "Enter") addTask(); };
  $$("[data-task-filter]", root).forEach(button => button.onclick = () => { taskFilter = button.dataset.taskFilter; $$("[data-task-filter]", root).forEach(item => item.classList.toggle("active", item === button)); paintTasks(); });
  $("#clearCompleted").onclick = () => { Store.data.todos = Store.data.todos.filter(todo => !todo.done); save(); paintTasks(); };
  $("#exportOrganizer").onclick = () => {
    const data = JSON.stringify({ format: "bookmarklet-of-destiny-organizer", version: 1, exportedAt: new Date().toISOString(), notes: Store.data.notesV2, tags: Store.data.noteTags, todos: Store.data.todos }, null, 2);
    const link = el("a", { download: "bookmarklet-of-destiny-organizer.json", href: `data:application/json;charset=utf-8,${encodeURIComponent(data)}` }); link.click();
  };
  $("#importMerge").onclick = () => importOrganizer(false);
  $("#importReplace").onclick = () => importOrganizer(true);
  state.cleanup.push(() => clearTimeout(saveDelay));
  window.render_organizer_to_text = () => JSON.stringify({ view, selectedId, taskFilter, notes: Store.data.notesV2, tags: Store.data.noteTags, todos: Store.data.todos });
  state.cleanup.push(() => { delete window.render_organizer_to_text; });
  paintAll();
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

const DAY_MS = 86400000;
const localDateParts = date => ({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
const dateSerial = ({ year, month, day }) => Date.UTC(year, month - 1, day) / DAY_MS;
const daysInMonth = (year, month) => new Date(year, month, 0).getDate();
const validDateParts = ({ year, month, day }) => Number.isInteger(year) && year >= 1 && year <= 9999 && Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(day) && day >= 1 && day <= daysInMonth(year, month);
const parseLocalDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  return validDateParts(parts) ? parts : null;
};
const partsFromSerial = serial => {
  const date = new Date(serial * DAY_MS);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};
const formatDateParts = parts => `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
const displayDateParts = parts => new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
const compareDateParts = (a, b) => Math.sign(dateSerial(a) - dateSerial(b));
const addMonthsClamped = (parts, amount) => {
  const monthIndex = parts.year * 12 + parts.month - 1 + amount;
  const year = Math.floor(monthIndex / 12), month = monthIndex - year * 12 + 1;
  return { year, month, day: Math.min(parts.day, daysInMonth(year, month)) };
};
const addYearsClamped = (parts, years) => ({ year: parts.year + years, month: parts.month, day: Math.min(parts.day, daysInMonth(parts.year + years, parts.month)) });
const calendarToday = () => {
  const override = parseLocalDate(window.__BOD_TEST_TODAY__);
  return override || localDateParts(new Date());
};

function calendarPage(root) {
  const today = calendarToday();
  let view = { year: today.year, month: today.month };
  setHTML(root, pageFrame("CALENDAR & DATE TOOLS", "Browse months and calculate with local calendar dates.", `<div class="grid">
    <div class="card full calendar-card">
      <div class="calendar-toolbar"><button id="calendarPrev" aria-label="Previous month">← PREV</button><h3 id="calendarTitle"></h3><div class="row"><button id="calendarToday">TODAY</button><button id="calendarNext" aria-label="Next month">NEXT →</button></div></div>
      <div class="calendar-weekdays" aria-hidden="true">${["SUN","MON","TUE","WED","THU","FRI","SAT"].map(day => `<span>${day}</span>`).join("")}</div>
      <div class="calendar-grid" id="calendarGrid" role="grid" aria-label="Monthly calendar"></div>
    </div>
    <div class="card"><h3>Days between</h3><div class="stack"><label>Start date<input type="date" id="daysStart"></label><label>End date<input type="date" id="daysEnd"></label><button id="daysCalculate">CALCULATE</button><div class="output" id="daysResult">Choose two dates.</div></div></div>
    <div class="card"><h3>Add or subtract days</h3><div class="stack"><label>Starting date<input type="date" id="addDate"></label><label>Days<input type="number" id="addDays" step="1" value="30"></label><button id="addCalculate">CALCULATE</button><div class="output" id="addResult">Use a negative number to subtract.</div></div></div>
    <div class="card full"><h3>Age calculator</h3><div class="split"><label>Birth date<input type="date" id="birthDate"></label><label>Age on date<input type="date" id="ageOnDate" value="${formatDateParts(today)}"></label></div><button id="ageCalculate" style="margin-top:10px">CALCULATE AGE</button><div class="output" id="ageResult" style="margin-top:10px">Choose a birth date.</div></div>
  </div>`));
  const renderCalendar = () => {
    const first = new Date(view.year, view.month - 1, 1).getDay();
    const count = daysInMonth(view.year, view.month);
    $("#calendarTitle").textContent = new Date(view.year, view.month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase();
    const cells = Array.from({ length: 42 }, (_, index) => {
      const day = index - first + 1;
      if (day < 1 || day > count) return `<span class="calendar-day empty" role="gridcell"></span>`;
      const isToday = view.year === today.year && view.month === today.month && day === today.day;
      return `<span class="calendar-day${isToday ? " today" : ""}" role="gridcell" aria-label="${escapeHtml(displayDateParts({ year: view.year, month: view.month, day }))}"${isToday ? ' aria-current="date"' : ""}>${day}</span>`;
    });
    setHTML($("#calendarGrid"), cells.join(""));
  };
  const changeMonth = amount => {
    const next = addMonthsClamped({ year: view.year, month: view.month, day: 1 }, amount);
    view = { year: next.year, month: next.month };
    renderCalendar();
  };
  $("#calendarPrev").onclick = () => changeMonth(-1);
  $("#calendarNext").onclick = () => changeMonth(1);
  $("#calendarToday").onclick = () => { view = { year: today.year, month: today.month }; renderCalendar(); };
  $("#daysCalculate").onclick = () => {
    const start = parseLocalDate($("#daysStart").value), end = parseLocalDate($("#daysEnd").value);
    if (!start || !end) return $("#daysResult").textContent = "ERR: Choose two valid dates.";
    const signed = dateSerial(end) - dateSerial(start);
    $("#daysResult").textContent = `SIGNED: ${signed} DAY${Math.abs(signed) === 1 ? "" : "S"} · ABSOLUTE: ${Math.abs(signed)} DAY${Math.abs(signed) === 1 ? "" : "S"}`;
  };
  $("#addCalculate").onclick = () => {
    const start = parseLocalDate($("#addDate").value), amount = Number($("#addDays").value);
    if (!start) return $("#addResult").textContent = "ERR: Choose a valid starting date.";
    if (!Number.isInteger(amount)) return $("#addResult").textContent = "ERR: Days must be a whole number.";
    const result = partsFromSerial(dateSerial(start) + amount);
    $("#addResult").textContent = `${displayDateParts(result)} · ${formatDateParts(result)}`;
  };
  $("#ageCalculate").onclick = () => {
    const birth = parseLocalDate($("#birthDate").value), onDate = parseLocalDate($("#ageOnDate").value);
    if (!birth || !onDate) return $("#ageResult").textContent = "ERR: Choose valid birth and comparison dates.";
    if (compareDateParts(birth, onDate) > 0) return $("#ageResult").textContent = "ERR: Birth date cannot be after the comparison date.";
    let years = onDate.year - birth.year;
    if (compareDateParts(onDate, addYearsClamped(birth, years)) < 0) years--;
    const lastBirthday = addYearsClamped(birth, years);
    let months = 0;
    while (compareDateParts(addMonthsClamped(lastBirthday, months + 1), onDate) <= 0) months++;
    const monthStart = addMonthsClamped(lastBirthday, months);
    const days = dateSerial(onDate) - dateSerial(monthStart);
    let nextBirthday = addYearsClamped(birth, onDate.year - birth.year);
    if (compareDateParts(nextBirthday, onDate) < 0) nextBirthday = addYearsClamped(birth, onDate.year - birth.year + 1);
    const countdown = dateSerial(nextBirthday) - dateSerial(onDate);
    $("#ageResult").textContent = `${years} YEARS · ${months} MONTHS · ${days} DAYS · NEXT BIRTHDAY IN ${countdown} DAY${countdown === 1 ? "" : "S"}`;
  };
  window.render_calendar_to_text = () => JSON.stringify({ view, today, firstWeekday: new Date(view.year, view.month - 1, 1).getDay(), days: daysInMonth(view.year, view.month) });
  state.cleanup.push(() => { delete window.render_calendar_to_text; });
  renderCalendar();
}

const supportedTimeZones = (() => {
  let zones;
  try { zones = Intl.supportedValuesOf("timeZone"); }
  catch { zones = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Paris", "Asia/Kolkata", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland"]; }
  return ["UTC", ...zones.filter(zone => zone !== "UTC")];
})();
const canonicalTimeZone = zone => {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: zone }).resolvedOptions().timeZone; }
  catch { return null; }
};
const canonicalSupportedTimeZones = () => [...new Set(supportedTimeZones.map(canonicalTimeZone).filter(Boolean))];
const worldClockNow = () => {
  const override = window.__BOD_TEST_NOW__;
  const date = override === undefined ? new Date() : new Date(override);
  return Number.isFinite(date.getTime()) ? date : new Date();
};
const localTimeZone = () => canonicalTimeZone(window.__BOD_TEST_TIME_ZONE__ || Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
const zoneName = zone => ({ "America/New_York": "New York", "Europe/London": "London", "Asia/Calcutta": "Delhi", "Asia/Kolkata": "Delhi", "Asia/Tokyo": "Tokyo" }[zone] || zone.split("/").pop().replaceAll("_", " "));
const zoneParts = (instant, zone) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, calendar: "gregory", numberingSystem: "latn",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { year: +values.year, month: +values.month, day: +values.day, hour: +values.hour, minute: +values.minute, second: +values.second };
};
const zoneOffsetMinutes = (instant, zone) => {
  const parts = zoneParts(instant, zone);
  return Math.round((Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant.getTime()) / 60000);
};
const formatOffset = minutes => `${minutes < 0 ? "−" : "+"}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
const parseWallDateTime = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const parts = { year: +match[1], month: +match[2], day: +match[3], hour: +match[4], minute: +match[5] };
  return validDateParts(parts) && parts.hour >= 0 && parts.hour <= 23 && parts.minute >= 0 && parts.minute <= 59 ? parts : null;
};
const sameWallTime = (parts, target) => ["year","month","day","hour","minute"].every(key => parts[key] === target[key]);
const resolveWallTime = (wall, zone) => {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const offsets = new Set();
  for (let delta = -48; delta <= 48; delta += 6) offsets.add(zoneOffsetMinutes(new Date(guess + delta * 3600000), zone));
  return [...offsets].map(offset => new Date(guess - offset * 60000)).filter(instant => sameWallTime(zoneParts(instant, zone), wall)).sort((a, b) => a - b).filter((instant, index, all) => !index || instant.getTime() !== all[index - 1].getTime());
};

function worldClockPage(root) {
  const localZone = localTimeZone();
  if (Store.data.settings.worldClock24 === null) {
    Store.data.settings.worldClock24 = Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12 === false;
    Store.save();
  }
  Store.data.settings.worldClocks = [...new Set((Store.data.settings.worldClocks || []).map(canonicalTimeZone).filter(zone => zone && zone !== localZone))];
  const zoneOptions = canonicalSupportedTimeZones().map(zone => `<option value="${escapeHtml(zone)}">${escapeHtml(zone.replaceAll("_", " "))}</option>`).join("");
  const defaultDateTime = (() => {
    const parts = zoneParts(worldClockNow(), localZone);
    return `${formatDateParts(parts)}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  })();
  setHTML(root, pageFrame("WORLD CLOCK", "Live IANA time zones and daylight-saving-aware conversion.", `<div class="grid">
    <div class="card full"><div class="row wrap"><div class="select-field" style="flex:1"><label class="select-label" for="clockZoneAdd">Add clock</label><select id="clockZoneAdd" class="select-full">${zoneOptions}</select></div><button id="clockAdd">ADD CLOCK</button><button id="clockFormat">FORMAT: ${Store.data.settings.worldClock24 ? "24H" : "12H"}</button></div></div>
    <div class="card full"><div class="world-clock-grid" id="worldClockGrid"></div></div>
    <div class="card full"><h3>Time-zone converter</h3><div class="grid">
      <div class="card"><label>Source date and time<input type="datetime-local" id="worldConvertTime" value="${defaultDateTime}"></label><div class="select-field" style="margin-top:10px"><label class="select-label" for="worldFromZone">Source zone</label><select id="worldFromZone" class="select-full"><option value="${escapeHtml(localZone)}">LOCAL — ${escapeHtml(localZone)}</option>${zoneOptions}</select></div></div>
      <div class="card"><div class="select-field"><label class="select-label" for="worldToZone">Destination zone</label><select id="worldToZone" class="select-full">${zoneOptions}</select></div><button id="worldConvert" style="margin-top:10px">CONVERT</button><div class="output" id="worldConvertResult" style="margin-top:10px">Choose a date, time, and zones.</div></div>
    </div></div>
  </div>`));
  $("#worldToZone").value = canonicalTimeZone("Asia/Kolkata") || "Asia/Calcutta";
  const formatClock = (instant, zone) => {
    const hour12 = !Store.data.settings.worldClock24;
    const date = new Intl.DateTimeFormat(undefined, { timeZone: zone, weekday: "short", year: "numeric", month: "short", day: "numeric" }).format(instant);
    const time = new Intl.DateTimeFormat(undefined, { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12 }).format(instant);
    return { date, time, parts: zoneParts(instant, zone), offset: zoneOffsetMinutes(instant, zone) };
  };
  const paint = () => {
    const now = worldClockNow(), local = formatClock(now, localZone), zones = [localZone, ...Store.data.settings.worldClocks];
    setHTML($("#worldClockGrid"), zones.map((zone, index) => {
      const info = formatClock(now, zone), dayDelta = dateSerial(info.parts) - dateSerial(local.parts);
      return `<div class="world-clock-card${index === 0 ? " local" : ""}">
        <div class="world-clock-head"><div><b>${index === 0 ? "LOCAL TIME" : escapeHtml(zoneName(zone).toUpperCase())}</b><small>${escapeHtml(zone)}</small></div>${index ? `<div class="row"><button data-clock-up="${index}" aria-label="Move ${escapeHtml(zoneName(zone))} up" ${index === 1 ? "disabled" : ""}>↑</button><button data-clock-down="${index}" aria-label="Move ${escapeHtml(zoneName(zone))} down" ${index === zones.length - 1 ? "disabled" : ""}>↓</button><button data-clock-remove="${index}" class="danger" aria-label="Remove ${escapeHtml(zoneName(zone))}">×</button></div>` : ""}</div>
        <div class="world-clock-time">${escapeHtml(info.time)}</div><div class="world-clock-meta"><span>${escapeHtml(info.date)}</span><span>UTC${formatOffset(info.offset)}</span><span>${dayDelta === 0 ? "SAME DAY" : dayDelta > 0 ? `+${dayDelta} DAY` : `${dayDelta} DAY`}</span></div>
      </div>`;
    }).join(""));
    $$("[data-clock-remove]").forEach(button => button.onclick = () => {
      Store.data.settings.worldClocks.splice(Number(button.dataset.clockRemove) - 1, 1); Store.save(); paint();
    });
    $$("[data-clock-up]").forEach(button => button.onclick = () => {
      const index = Number(button.dataset.clockUp) - 1;
      if (index > 0) [Store.data.settings.worldClocks[index - 1], Store.data.settings.worldClocks[index]] = [Store.data.settings.worldClocks[index], Store.data.settings.worldClocks[index - 1]];
      Store.save(); paint();
    });
    $$("[data-clock-down]").forEach(button => button.onclick = () => {
      const index = Number(button.dataset.clockDown) - 1;
      if (index < Store.data.settings.worldClocks.length - 1) [Store.data.settings.worldClocks[index + 1], Store.data.settings.worldClocks[index]] = [Store.data.settings.worldClocks[index], Store.data.settings.worldClocks[index + 1]];
      Store.save(); paint();
    });
  };
  $("#clockAdd").onclick = () => {
    const zone = canonicalTimeZone($("#clockZoneAdd").value);
    if (!zone) return toast("Unsupported time zone");
    if (zone === localZone || Store.data.settings.worldClocks.includes(zone)) return toast("Clock already added");
    Store.data.settings.worldClocks.push(zone); Store.save(); paint();
  };
  $("#clockFormat").onclick = () => {
    Store.data.settings.worldClock24 = !Store.data.settings.worldClock24; Store.save();
    $("#clockFormat").textContent = `FORMAT: ${Store.data.settings.worldClock24 ? "24H" : "12H"}`; paint();
  };
  $("#worldConvert").onclick = () => {
    const wall = parseWallDateTime($("#worldConvertTime").value);
    const from = canonicalTimeZone($("#worldFromZone").value), to = canonicalTimeZone($("#worldToZone").value);
    if (!wall || !from || !to) return $("#worldConvertResult").textContent = "ERR: Choose a valid date, time, and two supported zones.";
    const instants = resolveWallTime(wall, from);
    if (!instants.length) return $("#worldConvertResult").textContent = "ERR: This local time does not exist because the clock moves forward for daylight saving time.";
    const results = instants.map(instant => {
      const info = formatClock(instant, to);
      return `${info.date} · ${info.time} · UTC${formatOffset(info.offset)}`;
    });
    $("#worldConvertResult").textContent = instants.length > 1 ? `AMBIGUOUS SOURCE TIME — TWO VALID RESULTS:\n${results.join("\n")}` : results[0];
  };
  const interval = setInterval(paint, 1000);
  window.render_world_clock_to_text = () => JSON.stringify({ localZone, zones: [localZone, ...Store.data.settings.worldClocks], hour24: Store.data.settings.worldClock24, now: worldClockNow().toISOString() });
  state.cleanup.push(() => { clearInterval(interval); delete window.render_world_clock_to_text; });
  Store.save(); paint();
}

const clampColor = value => Math.min(255, Math.max(0, Math.round(value)));
const colorHex = ({ r, g, b, a = 1 }, includeAlpha = a < 1) => `#${[r,g,b].map(value => clampColor(value).toString(16).padStart(2, "0")).join("")}${includeAlpha ? clampColor(a * 255).toString(16).padStart(2, "0") : ""}`.toUpperCase();
const parseHexColor = value => {
  let hex = String(value || "").trim().replace(/^#/, "");
  if (![3,4,6,8].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) return null;
  if (hex.length <= 4) hex = [...hex].map(char => char + char).join("");
  return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16), a: hex.length === 8 ? parseInt(hex.slice(6,8),16) / 255 : 1 };
};
const parseRgbColor = value => {
  const match = String(value || "").trim().match(/^rgba?\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)(?:\s*,\s*([+-]?\d*\.?\d+%?))?\s*\)$/i);
  if (!match) return null;
  const channels = match.slice(1,4).map(Number);
  let alpha = match[4] === undefined ? 1 : match[4].endsWith("%") ? Number(match[4].slice(0,-1)) / 100 : Number(match[4]);
  if (channels.some(value => !Number.isFinite(value) || value < 0 || value > 255) || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  return { r: clampColor(channels[0]), g: clampColor(channels[1]), b: clampColor(channels[2]), a: alpha };
};
const rgbToHsl = ({ r, g, b }) => {
  const red=r/255,green=g/255,blue=b/255,max=Math.max(red,green,blue),min=Math.min(red,green,blue),delta=max-min;
  let h=0;if(delta)h=max===red?60*(((green-blue)/delta)%6):max===green?60*((blue-red)/delta+2):60*((red-green)/delta+4);
  if(h<0)h+=360;const l=(max+min)/2,s=delta?delta/(1-Math.abs(2*l-1)):0;
  return { h, s:s*100, l:l*100 };
};
const hslToRgb = ({ h, s, l, a = 1 }) => {
  h=((h%360)+360)%360;s/=100;l/=100;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
  const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return { r:clampColor((r+m)*255),g:clampColor((g+m)*255),b:clampColor((b+m)*255),a };
};
const parseHslColor = value => {
  const match = String(value || "").trim().match(/^hsla?\(\s*([+-]?\d*\.?\d+)(?:deg)?\s*,\s*([+-]?\d*\.?\d+)%\s*,\s*([+-]?\d*\.?\d+)%(?:\s*,\s*([+-]?\d*\.?\d+%?))?\s*\)$/i);
  if (!match) return null;
  const h=Number(match[1]),s=Number(match[2]),l=Number(match[3]);
  const a=match[4]===undefined?1:match[4].endsWith("%")?Number(match[4].slice(0,-1))/100:Number(match[4]);
  if (![h,s,l,a].every(Number.isFinite)||s<0||s>100||l<0||l>100||a<0||a>1)return null;
  return hslToRgb({h,s,l,a});
};
const colorRgb = ({ r,g,b,a=1 }) => a < 1 ? `rgba(${r}, ${g}, ${b}, ${Number(a.toFixed(3))})` : `rgb(${r}, ${g}, ${b})`;
const colorHsl = color => {
  const {h,s,l}=rgbToHsl(color),a=color.a??1;
  return `${a<1?"hsla":"hsl"}(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%${a<1?`, ${Number(a.toFixed(3))}`:""})`;
};
const colorLuminance = ({r,g,b}) => {
  const transform=value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4};
  return .2126*transform(r)+.7152*transform(g)+.0722*transform(b);
};
const contrastRatio = (first,second) => { const a=colorLuminance(first),b=colorLuminance(second);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05); };
const readableColor = color => contrastRatio(color,{r:255,g:255,b:255}) >= contrastRatio(color,{r:0,g:0,b:0}) ? "#FFFFFF" : "#000000";
const mixColor = (first,second,amount) => ({r:clampColor(first.r+(second.r-first.r)*amount),g:clampColor(first.g+(second.g-first.g)*amount),b:clampColor(first.b+(second.b-first.b)*amount),a:first.a??1});
const paletteColors = (color,type) => {
  const hsl=rgbToHsl(color),at=(h,s=hsl.s,l=hsl.l)=>hslToRgb({h,s,l,a:color.a??1});
  const hues=offsets=>offsets.map(offset=>at(hsl.h+offset));
  if(type==="complementary")return hues([0,180]);
  if(type==="analogous")return hues([-60,-30,0,30,60]);
  if(type==="triadic")return hues([0,120,240]);
  if(type==="split")return hues([0,150,210]);
  if(type==="tetradic")return hues([0,60,180,240]);
  if(type==="monochromatic")return [20,35,50,65,80].map(light=>at(hsl.h,hsl.s,light));
  return [mixColor(color,{r:0,g:0,b:0},.65),mixColor(color,{r:0,g:0,b:0},.35),color,mixColor(color,{r:255,g:255,b:255},.35),mixColor(color,{r:255,g:255,b:255},.65)];
};
const simulateVision = (color,mode) => {
  const matrices={
    protanopia:[[.567,.433,0],[.558,.442,0],[0,.242,.758]],
    deuteranopia:[[.625,.375,0],[.7,.3,0],[0,.3,.7]],
    tritanopia:[[.95,.05,0],[0,.433,.567],[0,.475,.525]],
    achromatopsia:[[.299,.587,.114],[.299,.587,.114],[.299,.587,.114]]
  },matrix=matrices[mode];
  return {r:clampColor(matrix[0][0]*color.r+matrix[0][1]*color.g+matrix[0][2]*color.b),g:clampColor(matrix[1][0]*color.r+matrix[1][1]*color.g+matrix[1][2]*color.b),b:clampColor(matrix[2][0]*color.r+matrix[2][1]*color.g+matrix[2][2]*color.b),a:color.a??1};
};

function colorToolsPage(root) {
  let color=parseHexColor("#39FF88"),foreground=parseHexColor("#FFFFFF"),background=parseHexColor("#020704"),paletteType="complementary";
  setHTML(root,pageFrame("COLOR TOOLS","Convert, generate, test contrast, and preview color perception.",`<div class="grid">
    <div class="card full"><div class="color-editor"><input type="color" id="colorPicker" value="#39ff88" aria-label="Color picker"><div class="color-main-swatch" id="colorMainSwatch"></div><div class="stack"><label>HEX<input id="colorHex" value="#39FF88"></label><label>RGB<input id="colorRgb"></label><label>HSL<input id="colorHsl"></label><label>Alpha %<input id="colorAlpha" type="number" min="0" max="100" value="100"></label></div></div><div class="output" id="colorError" style="margin-top:10px">VALID COLOR</div><div class="row wrap" style="margin-top:10px"><button data-color-copy="hex">COPY HEX</button><button data-color-copy="rgb">COPY RGB</button><button data-color-copy="hsl">COPY HSL</button><button data-color-copy="css">COPY CSS VARIABLE</button></div></div>
    <div class="card full"><h3>Palette generator</h3><div class="select-field"><label class="select-label" for="paletteType">Relationship</label><select id="paletteType" class="select-compact"><option value="complementary">Complementary</option><option value="analogous">Analogous</option><option value="triadic">Triadic</option><option value="split">Split-complementary</option><option value="tetradic">Tetradic</option><option value="monochromatic">Monochromatic</option><option value="shades">Shades & tints</option></select></div><div class="color-palette" id="colorPalette"></div></div>
    <div class="card full"><h3>WCAG 2.x contrast checker</h3><div class="split"><label>Foreground<input type="color" id="contrastForeground" value="#ffffff"></label><label>Background<input type="color" id="contrastBackground" value="#020704"></label></div><button id="contrastSwap" style="margin-top:10px">SWAP COLORS</button><div class="contrast-preview" id="contrastPreview">The quick brown fox jumps over the lazy dog.</div><div class="contrast-results" id="contrastResults"></div></div>
    <div class="card full"><h3>Color-vision previews</h3><p class="muted">Approximate simulations only — not diagnostic.</p><div class="vision-grid" id="visionGrid"></div></div>
  </div>`));
  const formats=()=>({hex:colorHex(color),rgb:colorRgb(color),hsl:colorHsl(color),css:`--color: ${colorHex(color)};`});
  const copy=async value=>{try{await navigator.clipboard.writeText(value);toast("Color copied")}catch{toast("Copy failed")}};
  const update=()=>{
    const values=formats(),opaque=colorHex({...color,a:1});
    $("#colorPicker").value=opaque.toLowerCase();$("#colorHex").value=values.hex;$("#colorRgb").value=values.rgb;$("#colorHsl").value=values.hsl;$("#colorAlpha").value=Math.round((color.a??1)*100);
    $("#colorMainSwatch").style.background=values.rgb;$("#colorMainSwatch").textContent=values.hex;$("#colorMainSwatch").style.color=readableColor(color);$("#colorError").textContent="VALID COLOR";
    const generated=paletteColors(color,paletteType);
    setHTML($("#colorPalette"),generated.map((entry,index)=>`<button class="palette-swatch" data-palette-copy="${index}" style="background:${colorRgb(entry)};color:${readableColor(entry)}"><b>${colorHex(entry)}</b><span>${colorHsl(entry)}</span></button>`).join(""));
    $$("[data-palette-copy]").forEach(button=>button.onclick=()=>copy(colorHex(generated[Number(button.dataset.paletteCopy)])));
    const modes=[["protanopia","PROTANOPIA"],["deuteranopia","DEUTERANOPIA"],["tritanopia","TRITANOPIA"],["achromatopsia","ACHROMATOPSIA"]];
    setHTML($("#visionGrid"),modes.map(([mode,label])=>{const simulated=simulateVision(color,mode);return `<div class="vision-card" style="background:${colorRgb(simulated)};color:${readableColor(simulated)}"><b>${label}</b><span>${colorHex(simulated)}</span><small>SIMULATION</small></div>`}).join(""));
  };
  const parseField=(field,parser)=>{
    const parsed=parser(field.value);
    if(!parsed){$("#colorError").textContent=`ERR: INVALID ${field.id.replace("color","").toUpperCase()} COLOR`;return}
    color={...parsed,a:color.a??parsed.a??1};if(parsed.a!==undefined)color.a=parsed.a;update();
  };
  $("#colorPicker").oninput=e=>{const parsed=parseHexColor(e.target.value);if(parsed){color={...parsed,a:color.a};update()}};
  $("#colorHex").onchange=e=>parseField(e.target,parseHexColor);
  $("#colorRgb").onchange=e=>parseField(e.target,parseRgbColor);
  $("#colorHsl").onchange=e=>parseField(e.target,parseHslColor);
  $("#colorAlpha").onchange=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<0||value>100){$("#colorError").textContent="ERR: ALPHA MUST BE 0–100";return}color.a=value/100;update()};
  $$("[data-color-copy]").forEach(button=>button.onclick=()=>copy(formats()[button.dataset.colorCopy]));
  $("#paletteType").onchange=e=>{paletteType=e.target.value;update()};
  const updateContrast=()=>{
    const ratio=contrastRatio(foreground,background),normalAA=ratio>=4.5,normalAAA=ratio>=7,largeAA=ratio>=3,largeAAA=ratio>=4.5;
    $("#contrastPreview").style.cssText=`color:${colorHex(foreground)};background:${colorHex(background)}`;
    setHTML($("#contrastResults"),`<div class="metric">${ratio.toFixed(2)}:1</div><div class="contrast-badges"><span class="${normalAA?"pass":"fail"}">NORMAL AA ${normalAA?"PASS":"FAIL"}</span><span class="${normalAAA?"pass":"fail"}">NORMAL AAA ${normalAAA?"PASS":"FAIL"}</span><span class="${largeAA?"pass":"fail"}">LARGE AA ${largeAA?"PASS":"FAIL"}</span><span class="${largeAAA?"pass":"fail"}">LARGE AAA ${largeAAA?"PASS":"FAIL"}</span></div>`);
  };
  $("#contrastForeground").oninput=e=>{foreground=parseHexColor(e.target.value);updateContrast()};
  $("#contrastBackground").oninput=e=>{background=parseHexColor(e.target.value);updateContrast()};
  $("#contrastSwap").onclick=()=>{[foreground,background]=[background,foreground];$("#contrastForeground").value=colorHex(foreground).toLowerCase();$("#contrastBackground").value=colorHex(background).toLowerCase();updateContrast()};
  window.render_color_tools_to_text=()=>JSON.stringify({color:formats(),paletteType,palette:paletteColors(color,paletteType).map(entry=>colorHex(entry)),contrast:contrastRatio(foreground,background),vision:["protanopia","deuteranopia","tritanopia","achromatopsia"].map(mode=>[mode,colorHex(simulateVision(color,mode))])});
  state.cleanup.push(()=>delete window.render_color_tools_to_text);
  update();updateContrast();
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

const bytesToHex = buffer => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("");
const hashBytes = async (bytes, algorithm) => bytesToHex(await crypto.subtle.digest(algorithm, bytes));
const decodeBase64Url = value => {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(value)) throw new Error("Invalid Base64URL data");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), character => character.charCodeAt(0)));
};
const safeMarkdownUrl = value => {
  const trimmed = value.trim();
  return /^(https?:|mailto:|tel:|#|\/)/i.test(trimmed) ? trimmed : "";
};
const markdownInline = source => {
  const tokens = [];
  const token = html => `\u0000${tokens.push(html) - 1}\u0000`;
  let value = String(source)
    .replace(/`([^`\n]+)`/g, (_, code) => token(`<code>${escapeHtml(code)}</code>`))
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_, label, url) => {
      const safe = safeMarkdownUrl(url);
      return safe ? token(`<a href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`) : label;
    });
  return escapeHtml(value)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^\w])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^\w])_([^_\n]+)_/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
    .replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)] || "");
};
const renderMarkdown = source => {
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const output = [];
  let paragraph = [], list = null, code = null;
  const flushParagraph = () => { if (paragraph.length) output.push(`<p>${markdownInline(paragraph.join(" "))}</p>`); paragraph = []; };
  const flushList = () => { if (list) output.push(`<${list.type}>${list.items.map(item => `<li>${markdownInline(item)}</li>`).join("")}</${list.type}>`); list = null; };
  const flushCode = () => { if (code) output.push(`<pre><code>${escapeHtml(code.lines.join("\n"))}</code></pre>`); code = null; };
  for (const line of lines) {
    if (code) {
      if (/^```/.test(line)) flushCode();
      else code.lines.push(line);
      continue;
    }
    if (/^```/.test(line)) { flushParagraph(); flushList(); code = { lines: [] }; continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) { flushParagraph(); flushList(); output.push(`<h${heading[1].length}>${markdownInline(heading[2])}</h${heading[1].length}>`); continue; }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { flushParagraph(); flushList(); output.push(`<blockquote>${markdownInline(quote[1])}</blockquote>`); continue; }
    const unordered = line.match(/^\s*[-+*]\s+(.+)$/), ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const type = ordered ? "ol" : "ul", item = (ordered || unordered)[1];
      if (list && list.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(item);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  flushParagraph(); flushList(); flushCode();
  return output.join("");
};
const sanitizeScratchCss = source => String(source)
  .replace(/@import[\s\S]*?(?:;|$)/gi, "/* import removed */")
  .replace(/url\s*\([^)]*\)/gi, "none")
  .replace(/expression\s*\([^)]*\)/gi, "none")
  .replace(/behavior\s*:[^;}]*/gi, "");
const SCRATCH_TAGS = new Set(["A","ABBR","ARTICLE","ASIDE","B","BLOCKQUOTE","BR","BUTTON","CODE","DIV","EM","FOOTER","H1","H2","H3","H4","H5","H6","HEADER","HR","I","KBD","LABEL","LI","MAIN","MARK","NAV","OL","P","PRE","SECTION","SMALL","SPAN","STRONG","SUB","SUP","TABLE","TBODY","TD","TFOOT","TH","THEAD","TR","U","UL"]);
const sanitizeScratchHtml = source => {
  const parsed = new window.DOMParser().parseFromString(trustedHTML(`<div>${String(source)}</div>`), "text/html");
  const clean = document.createDocumentFragment();
  const copy = (node, parent) => {
    if (node.nodeType === window.Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent)); return; }
    if (node.nodeType !== window.Node.ELEMENT_NODE) return;
    if (!SCRATCH_TAGS.has(node.tagName)) { [...node.childNodes].forEach(child => copy(child, parent)); return; }
    const element = document.createElement(node.tagName.toLowerCase());
    for (const attribute of node.attributes) {
      const name = attribute.name.toLowerCase();
      if (["class", "id", "title", "aria-label"].includes(name) || name.startsWith("data-")) element.setAttribute(name, attribute.value);
      if (node.tagName === "A" && name === "href") {
        const safe = safeMarkdownUrl(attribute.value);
        if (safe) { element.setAttribute("href", safe); element.setAttribute("target", "_blank"); element.setAttribute("rel", "noopener noreferrer"); }
      }
    }
    parent.append(element);
    [...node.childNodes].forEach(child => copy(child, element));
  };
  [...parsed.body.firstElementChild.childNodes].forEach(node => copy(node, clean));
  return clean;
};

function developerToolsPage(root) {
  const tabs = [["regex", "REGEX"], ["hash", "HASH"], ["jwt", "JWT"], ["markdown", "MARKDOWN"], ["scratch", "SCRATCHPAD"]];
  setHTML(root, pageFrame("DEVELOPER TOOLS", "Inspect and transform code safely without external services.", `<div class="developer-tabs" role="tablist" aria-label="Developer tools">${tabs.map(([id, label], index) => `<button role="tab" aria-selected="${index === 0}" aria-controls="dev-${id}" data-dev-tab="${id}" class="${index === 0 ? "active" : ""}">${label}</button>`).join("")}</div>
    <div id="developerPanels">
      <section id="dev-regex" class="developer-panel" role="tabpanel"><div class="grid">
        <div class="card full"><div class="developer-regex-row"><label>Pattern<input id="regexPattern" placeholder="(\\w+)@(\\w+\\.\\w+)"></label><label>Flags<input id="regexFlags" value="gi" maxlength="7" placeholder="dgimsuvy"></label></div><label>Test text<textarea id="regexInput" maxlength="20000" placeholder="Input is capped at 20,000 characters."></textarea></label><label>Replacement<input id="regexReplacement" placeholder="$1 at $2"></label><button id="runRegex" class="primary">RUN REGEX</button><div class="muted tiny" id="regexLimit">0 / 20,000 CHARACTERS · MANUAL RUN</div></div>
        <div class="card"><h3>Matches</h3><div class="output developer-output" id="regexMatches">Run a pattern to inspect matches.</div></div><div class="card"><h3>Replacement preview</h3><div class="output developer-output" id="regexReplace">No replacement preview.</div></div>
      </div></section>
      <section id="dev-hash" class="developer-panel hidden" role="tabpanel"><div class="grid">
        <div class="card"><h3>Input</h3><label>Text<textarea id="hashText" placeholder="Text to hash"></textarea></label><div class="developer-or">OR</div><label>Local file<input id="hashFile" type="file"></label><div class="muted tiny" id="hashFileMeta">NO FILE SELECTED</div><button id="runHash" class="primary">GENERATE HASHES</button></div>
        <div class="card"><h3>Secure hashes</h3><div class="stack" id="hashResults"><div class="output">SHA-256, SHA-384, and SHA-512 results appear here.</div></div></div>
      </div></section>
      <section id="dev-jwt" class="developer-panel hidden" role="tabpanel"><div class="grid">
        <div class="card full"><label>JSON Web Token<textarea id="jwtInput" placeholder="eyJhbGciOi..."></textarea></label><button id="decodeJwt" class="primary">DECODE TOKEN</button><p class="developer-warning">DECODE ONLY — THE SIGNATURE IS NOT VERIFIED.</p></div>
        <div class="card"><h3>Header</h3><div class="output developer-output" id="jwtHeader">No token decoded.</div></div><div class="card"><h3>Payload</h3><div class="output developer-output" id="jwtPayload">No token decoded.</div></div><div class="card full"><h3>Claims & signature</h3><div class="output" id="jwtMeta">No token decoded.</div></div>
      </div></section>
      <section id="dev-markdown" class="developer-panel hidden" role="tabpanel"><div class="developer-preview-grid"><div class="card"><h3>Markdown</h3><textarea id="markdownInput" class="developer-editor" placeholder="# Heading&#10;&#10;**Safe** offline preview"></textarea></div><div class="card"><h3>Preview</h3><div class="developer-render" id="markdownPreview"></div></div></div><p class="muted tiny">Embedded HTML is displayed as text. Unsafe link protocols are removed.</p></section>
      <section id="dev-scratch" class="developer-panel hidden" role="tabpanel"><div class="grid">
        <div class="card"><h3>HTML</h3><textarea id="scratchHtml" class="developer-editor" placeholder="<h1>Hello</h1>"></textarea></div><div class="card"><h3>CSS</h3><textarea id="scratchCss" class="developer-editor" placeholder="h1 { color: #39ff88; }"></textarea></div>
        <div class="card full"><h3>JavaScript draft — not executed</h3><textarea id="scratchJs" placeholder="// Draft and copy JavaScript here. It is never executed."></textarea><div class="row wrap"><button id="copyScratchJs">COPY JAVASCRIPT</button><button id="resetScratch" class="danger">RESET SCRATCHPAD</button></div></div>
        <div class="card full"><h3>Isolated HTML/CSS preview</h3><div class="scratch-preview" id="scratchPreview"></div><p class="muted tiny">Scripts, event handlers, embedded media, forms, imports, and URL-based CSS are removed.</p></div>
      </div></section>
    </div>`));

  let activeTab = "regex";
  const developerState = { regex: null, hashes: null, jwt: null, markdown: "", scratch: { html: "", css: "", js: "" } };
  const copy = async value => {
    try { await navigator.clipboard.writeText(value); toast("Copied"); }
    catch { toast("Copy failed"); }
  };
  const switchTab = id => {
    activeTab = id;
    $$("[data-dev-tab]", root).forEach(button => {
      const selected = button.dataset.devTab === id;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
      $(`#dev-${button.dataset.devTab}`, root).classList.toggle("hidden", !selected);
    });
  };
  const tabButtons = $$("[data-dev-tab]", root);
  tabButtons.forEach((button, index) => {
    button.onclick = () => switchTab(button.dataset.devTab);
    button.onkeydown = event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? tabButtons.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabButtons.length) % tabButtons.length;
      tabButtons[next].focus(); tabButtons[next].click();
    };
  });

  $("#regexInput").oninput = event => $("#regexLimit").textContent = `${event.target.value.length.toLocaleString()} / 20,000 CHARACTERS · MANUAL RUN`;
  $("#runRegex").onclick = () => {
    const pattern = $("#regexPattern").value, flags = $("#regexFlags").value.trim(), input = $("#regexInput").value, replacement = $("#regexReplacement").value;
    try {
      if (input.length > 20000) throw new Error("Test text exceeds 20,000 characters");
      if (!/^[dgimsuvy]*$/.test(flags) || new Set(flags).size !== flags.length || (flags.includes("u") && flags.includes("v"))) throw new Error("Flags must be unique compatible JavaScript flags");
      const expression = new RegExp(pattern, flags);
      const scanFlags = flags.includes("g") || flags.includes("y") ? flags : `${flags}g`;
      const scanner = new RegExp(pattern, scanFlags);
      const matches = [];
      let match;
      while ((match = scanner.exec(input)) && matches.length < 500) {
        matches.push({ value: match[0], index: match.index, groups: match.slice(1), named: match.groups || null });
        if (match[0] === "") scanner.lastIndex++;
      }
      developerState.regex = { pattern, flags, count: matches.length, truncated: matches.length === 500 };
      setHTML($("#regexMatches"), matches.length ? matches.map((entry, index) => `<div class="developer-match"><b>#${index + 1} @ ${entry.index}</b><code>${escapeHtml(entry.value || "(empty match)")}</code>${entry.groups.length ? `<small>GROUPS: ${escapeHtml(entry.groups.map((group, groupIndex) => `${groupIndex + 1}=${group ?? "undefined"}`).join(" · "))}</small>` : ""}${entry.named ? `<small>NAMED: ${escapeHtml(JSON.stringify(entry.named))}</small>` : ""}</div>`).join("") + (matches.length === 500 ? `<p class="developer-warning">RESULTS CAPPED AT 500 MATCHES.</p>` : "") : "NO MATCHES");
      $("#regexReplace").textContent = replacement ? input.replace(expression, replacement) : "Enter a replacement expression to preview it.";
    } catch (error) {
      developerState.regex = { error: error.message };
      $("#regexMatches").textContent = `ERROR: ${error.message}`;
      $("#regexReplace").textContent = "Replacement unavailable.";
    }
  };

  $("#hashFile").onchange = () => {
    const file = $("#hashFile").files[0];
    $("#hashFileMeta").textContent = file ? `${file.name} · ${file.size.toLocaleString()} BYTES · ${file.type || "UNKNOWN TYPE"}` : "NO FILE SELECTED";
  };
  $("#runHash").onclick = async () => {
    const button = $("#runHash"), file = $("#hashFile").files[0];
    button.disabled = true; button.textContent = "HASHING...";
    try {
      const bytes = file ? new Uint8Array(await file.arrayBuffer()) : new TextEncoder().encode($("#hashText").value);
      const algorithms = ["SHA-256", "SHA-384", "SHA-512"];
      const values = await Promise.all(algorithms.map(algorithm => hashBytes(bytes, algorithm)));
      developerState.hashes = Object.fromEntries(algorithms.map((algorithm, index) => [algorithm, values[index]]));
      setHTML($("#hashResults"), algorithms.map((algorithm, index) => `<div><div class="developer-result-head"><b>${algorithm}</b><button data-copy-hash="${index}">COPY</button></div><div class="output developer-hash">${values[index]}</div></div>`).join(""));
      $$("[data-copy-hash]", root).forEach(copyButton => copyButton.onclick = () => copy(values[Number(copyButton.dataset.copyHash)]));
    } catch (error) {
      developerState.hashes = { error: error.message };
      $("#hashResults").textContent = `ERROR: ${error.message}`;
    } finally {
      button.disabled = false; button.textContent = "GENERATE HASHES";
    }
  };

  $("#decodeJwt").onclick = () => {
    try {
      const parts = $("#jwtInput").value.trim().split(".");
      if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error("A JWT must contain three dot-separated parts");
      const header = JSON.parse(decodeBase64Url(parts[0])), payload = JSON.parse(decodeBase64Url(parts[1]));
      const timestampClaims = ["iat", "nbf", "exp"].filter(name => Number.isFinite(payload[name])).map(name => `${name.toUpperCase()}: ${new Date(payload[name] * 1000).toLocaleString()}`);
      developerState.jwt = { header, payload, signaturePresent: !!parts[2] };
      $("#jwtHeader").textContent = JSON.stringify(header, null, 2);
      $("#jwtPayload").textContent = JSON.stringify(payload, null, 2);
      $("#jwtMeta").textContent = `${timestampClaims.join("\n") || "NO STANDARD TIMESTAMP CLAIMS"}\nSIGNATURE: ${parts[2] ? `${parts[2].length} CHARACTERS — NOT VERIFIED` : "EMPTY — UNSIGNED TOKEN"}\nSECURITY: DECODED DATA IS UNTRUSTED`;
    } catch (error) {
      developerState.jwt = { error: error.message };
      $("#jwtHeader").textContent = `ERROR: ${error.message}`;
      $("#jwtPayload").textContent = "Payload unavailable.";
      $("#jwtMeta").textContent = "Token was not decoded.";
    }
  };

  const updateMarkdown = () => {
    const source = $("#markdownInput").value;
    developerState.markdown = source;
    setHTML($("#markdownPreview"), renderMarkdown(source) || `<p class="muted">Preview appears here.</p>`);
  };
  $("#markdownInput").oninput = updateMarkdown; updateMarkdown();

  const previewRoot = $("#scratchPreview").attachShadow({ mode: "open" });
  const updateScratch = () => {
    const html = $("#scratchHtml").value, css = sanitizeScratchCss($("#scratchCss").value), js = $("#scratchJs").value;
    developerState.scratch = { html, css, js };
    previewRoot.replaceChildren();
    const base = document.createElement("style");
    base.textContent = `:host{display:block;min-height:180px;background:#fff;color:#111;font:16px/1.5 system-ui,sans-serif;padding:16px;overflow:auto}*{box-sizing:border-box}a{color:#075fad}`;
    const custom = document.createElement("style"); custom.textContent = css;
    previewRoot.append(base, custom, sanitizeScratchHtml(html));
  };
  ["scratchHtml", "scratchCss", "scratchJs"].forEach(id => $(`#${id}`).oninput = updateScratch);
  $("#copyScratchJs").onclick = () => copy($("#scratchJs").value);
  $("#resetScratch").onclick = () => {
    ["scratchHtml", "scratchCss", "scratchJs"].forEach(id => $(`#${id}`).value = "");
    updateScratch();
  };
  updateScratch();
  window.render_developer_tools_to_text = () => JSON.stringify({ activeTab, ...developerState });
  state.cleanup.push(() => { delete window.render_developer_tools_to_text; });
}

function inspectorPage(root) {
  let pickCleanup = null, selectedInfo = null;
  const maxList = 80;
  const readPage = () => {
    const target = targetPage();
    if (!target) return { available: false, error: "NO OPENER — launch from the bookmarklet to inspect a page." };
    try {
      const doc = target.document;
      const headings = $$("h1,h2,h3,h4,h5,h6", doc).slice(0, maxList).map(node => ({ level: node.tagName, text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 160) }));
      const links = $$("a[href]", doc).slice(0, maxList).map(node => ({ text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 120) || node.getAttribute("aria-label") || "(no text)", href: node.href }));
      const images = $$("img", doc).slice(0, maxList).map(node => ({ alt: node.alt || "(no alt)", src: node.currentSrc || node.src || node.getAttribute("src") || "", size: `${node.naturalWidth || node.width || 0}×${node.naturalHeight || node.height || 0}` }));
      const scripts = $$("script", doc).slice(0, maxList).map(node => ({ src: node.src || "(inline script)", type: node.type || "classic" }));
      const clickables = $$("a[href],button,input,select,textarea,[role='button'],[role='link'],[onclick],summary", doc);
      return {
        available: true, title: doc.title || "(untitled)", url: target.location.href, origin: target.location.origin,
        charset: doc.characterSet || "", lang: doc.documentElement.lang || "", domNodes: doc.querySelectorAll("*").length,
        headings, links, images, scripts,
        counts: { headings: doc.querySelectorAll("h1,h2,h3,h4,h5,h6").length, links: doc.querySelectorAll("a[href]").length, images: doc.images.length, scripts: doc.scripts.length, clickables: clickables.length }
      };
    } catch (error) {
      return { available: false, error: `PAGE BLOCKED INSPECTION — ${error.message || "cross-origin or browser restriction"}` };
    }
  };
  const elementInfo = node => {
    const target = targetPage(), doc = target.document, rect = node.getBoundingClientRect();
    const attrs = ["id", "class", "href", "src", "alt", "role", "aria-label", "type", "name"].map(name => [name, node.getAttribute?.(name)]).filter(([, value]) => value);
    const index = [...doc.querySelectorAll(node.tagName)].indexOf(node) + 1;
    return {
      tag: node.tagName.toLowerCase(),
      selector: node.id ? `#${cssIdent(node.id)}` : `${node.tagName.toLowerCase()}:nth-of-type(${index})`,
      text: node.textContent.trim().replace(/\s+/g, " ").slice(0, 240),
      size: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
      position: `${Math.round(rect.left + target.scrollX)}, ${Math.round(rect.top + target.scrollY)}`,
      attributes: attrs
    };
  };
  const renderList = (items, kind) => items.length ? items.map((item, index) => {
    if (kind === "headings") return `<div class="inspector-row"><b>${escapeHtml(item.level)}</b><span>${escapeHtml(item.text || "(empty heading)")}</span></div>`;
    if (kind === "links") return `<div class="inspector-row"><b>#${index + 1}</b><span>${escapeHtml(item.text)}<small>${escapeHtml(item.href)}</small></span></div>`;
    if (kind === "images") return `<div class="inspector-row"><b>${escapeHtml(item.size)}</b><span>${escapeHtml(item.alt)}<small>${escapeHtml(item.src)}</small></span></div>`;
    return `<div class="inspector-row"><b>${escapeHtml(item.type)}</b><span>${escapeHtml(item.src)}</span></div>`;
  }).join("") : `<div class="muted">NO ITEMS FOUND</div>`;
  const renderSelected = () => selectedInfo ? `<div class="stack">
    <div class="output">TAG: ${escapeHtml(selectedInfo.tag)}\nSELECTOR: ${escapeHtml(selectedInfo.selector)}\nSIZE: ${escapeHtml(selectedInfo.size)}\nPOSITION: ${escapeHtml(selectedInfo.position)}\nTEXT: ${escapeHtml(selectedInfo.text || "(no text)")}</div>
    <div class="list">${selectedInfo.attributes.map(([name, value]) => `<div class="item"><span class="grow">${escapeHtml(name)}</span><code>${escapeHtml(value)}</code></div>`).join("") || `<div class="muted">NO COMMON ATTRIBUTES</div>`}</div>
    <button id="copySelector">COPY SELECTOR</button>
  </div>` : `<div class="output">NO ELEMENT SELECTED. CLICK PICK ELEMENT, THEN CLICK AN ELEMENT ON THE PAGE.</div>`;
  const clearHighlights = () => {
    try {
      const doc = targetPage()?.document;
      doc?.getElementById(INSPECTOR_STYLE_ID)?.remove();
      doc?.querySelectorAll("[data-bod-inspector-highlight]").forEach(node => node.removeAttribute("data-bod-inspector-highlight"));
    } catch {}
  };
  const stopPicking = () => { if (pickCleanup) { pickCleanup(); pickCleanup = null; } };
  const wireSelectorCopy = () => {
    const button = $("#copySelector");
    if (button && selectedInfo) button.onclick = async () => { try { await navigator.clipboard.writeText(selectedInfo.selector); toast("Selector copied"); } catch { toast("Copy failed"); } };
  };
  const paint = () => {
    const info = readPage();
    setHTML(root, pageFrame("PAGE INSPECTOR", "Read-only metadata and element inspection for the page that launched the dashboard.", `<div class="grid">
      <div class="card full"><h3>Target status</h3><div class="output">${info.available ? `CONNECTED\nTITLE: ${escapeHtml(info.title)}\nURL: ${escapeHtml(info.url)}\nORIGIN: ${escapeHtml(info.origin)}` : escapeHtml(info.error)}</div></div>
      ${info.available ? `<div class="card third"><h3>DOM Nodes</h3><div class="metric">${info.domNodes.toLocaleString()}</div><p class="muted">${escapeHtml(info.charset)} ${info.lang ? `· ${escapeHtml(info.lang)}` : ""}</p></div>
      <div class="card third"><h3>Page Counts</h3><div class="output">HEADINGS ${info.counts.headings}\nLINKS ${info.counts.links}\nIMAGES ${info.counts.images}\nSCRIPTS ${info.counts.scripts}\nCLICKABLES ${info.counts.clickables}</div></div>
      <div class="card third"><h3>Actions</h3><div class="stack"><button id="refreshInspector">REFRESH INSPECTION</button><button id="highlightClickables">HIGHLIGHT CLICKABLES</button><button id="clearInspectorHighlights">CLEAR HIGHLIGHTS</button><button id="pickElement">PICK ELEMENT</button><button id="copyPageMeta">COPY PAGE METADATA</button><button id="downloadPageMeta">DOWNLOAD JSON</button></div></div>
      <div class="card full"><h3>Selected Element</h3><div id="selectedElement">${renderSelected()}</div></div>
      <div class="card"><h3>Headings</h3><div class="inspector-list">${renderList(info.headings, "headings")}</div></div>
      <div class="card"><h3>Links</h3><div class="inspector-list">${renderList(info.links, "links")}</div></div>
      <div class="card"><h3>Images</h3><div class="inspector-list">${renderList(info.images, "images")}</div></div>
      <div class="card"><h3>Scripts</h3><div class="inspector-list">${renderList(info.scripts, "scripts")}</div></div>` : ""}</div>`));
    if (!info.available) return;
    $("#refreshInspector").onclick = paint;
    $("#clearInspectorHighlights").onclick = () => { stopPicking(); clearHighlights(); toast("Inspector highlights cleared"); };
    $("#highlightClickables").onclick = () => {
      try {
        const doc = targetPage().document;
        let style = doc.getElementById(INSPECTOR_STYLE_ID);
        if (!style) {
          style = doc.createElement("style");
          style.id = INSPECTOR_STYLE_ID;
          style.textContent = `[data-bod-inspector-highlight]{outline:2px solid #39ff88!important;outline-offset:2px!important;box-shadow:0 0 0 4px #00ff6644!important}`;
          (doc.head || doc.documentElement).append(style);
        }
        $$("a[href],button,input,select,textarea,[role='button'],[role='link'],[onclick],summary", doc).forEach(node => node.setAttribute("data-bod-inspector-highlight", "clickable"));
        toast("Clickable elements highlighted");
      } catch { toast("Page blocks highlighting"); }
    };
    $("#pickElement").onclick = () => {
      stopPicking();
      try {
        const doc = targetPage().document;
        const over = event => { event.target?.setAttribute?.("data-bod-inspector-highlight", "pick"); };
        const out = event => { if (event.target?.getAttribute?.("data-bod-inspector-highlight") === "pick") event.target.removeAttribute("data-bod-inspector-highlight"); };
        const click = event => {
          event.preventDefault(); event.stopPropagation();
          selectedInfo = elementInfo(event.target);
          stopPicking();
          setHTML($("#selectedElement"), renderSelected());
          wireSelectorCopy();
          toast("Element selected");
        };
        doc.addEventListener("mouseover", over, true);
        doc.addEventListener("mouseout", out, true);
        doc.addEventListener("click", click, true);
        pickCleanup = () => { doc.removeEventListener("mouseover", over, true); doc.removeEventListener("mouseout", out, true); doc.removeEventListener("click", click, true); };
        toast("Click an element on the page");
      } catch { toast("Page blocks element picking"); }
    };
    $("#copyPageMeta").onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(readPage(), null, 2)); toast("Page metadata copied"); } catch { toast("Copy failed"); } };
    $("#downloadPageMeta").onclick = () => el("a", { download: "destiny-page-inspection.json", href: `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(readPage(), null, 2))}` }).click();
    wireSelectorCopy();
  };
  paint();
  state.cleanup.push(() => { stopPicking(); clearHighlights(); });
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
  const games = [["snake","SNAKE"],["2048","2048"],["mines","MINES"],["ttt","TIC-TAC-TOE"],["pong","PONG"],["breakout","BREAKOUT"],["connect4","CONNECT FOUR"],["tron","TRON"],["invaders","SPACE INVADERS"],["memory","MEMORY"],["chess","CHESS"],["checkers","CHECKERS"]];
  setHTML(root, pageFrame("DESTINY ARCADE", "Twelve offline games with local records and multiplayer modes.", `<div class="game-selector"><input id="gameSearch" placeholder="Search games..." aria-label="Search arcade games"><div class="game-tabs">${games.map(([id, name]) => `<button data-game="${id}" class="${state.game === id ? "active" : ""}">${name}</button>`).join("")}</div></div><div id="gameHost"></div>`));
  $("#gameSearch").oninput = event => $$("[data-game]").forEach(button => button.classList.toggle("hidden", !button.textContent.toLowerCase().includes(event.target.value.toLowerCase())));
  $$("[data-game]").forEach(button => button.onclick = () => { clearGame(); state.game = button.dataset.game; $$("[data-game]").forEach(b => b.classList.toggle("active", b === button)); mountGame(); });
  let gameCleanup = () => {};
  const clearGame = () => { gameCleanup(); gameCleanup = () => {}; };
  const mountGame = () => {
    const host = $("#gameHost");
    const cleanupGame = ({ snake: snakeGame, "2048": game2048, mines: minesGame, ttt: tttGame, pong: pongGame, breakout: breakoutGame, connect4: connectFourGame, tron: tronGame, invaders: invadersGame, memory: memoryGame, chess: chessGame, checkers: checkersGame })[state.game](host);
    const cleanupSelects = enhanceSelects(host);
    gameCleanup = () => { cleanupSelects(); cleanupGame(); };
  };
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
  const canvas = canvasBase(host, "SNAKE", "1P: ARROWS/WASD · 2P: P1 WASD / P2 ARROWS"), ctx = canvas.getContext("2d");
  const {modeSelect,difficultySelect}=addGameOptions(host,{mode:true,difficulty:true,modeId:"snakePlayers",difficultyId:"snakeDifficulty"});
  const size=20,cols=30,rows=21;let snakes,directions,nextDirections,food,points,mode,accumulator=0,rounds,playerMode="one",roundTimer=null;
  const occupied=()=>snakes.flat();
  const spawn=()=>{do food={x:Math.floor(Math.random()*cols),y:Math.floor(Math.random()*rows)};while(occupied().some(p=>p.x===food.x&&p.y===food.y))};
  const resetRound=()=>{snakes=playerMode==="two"?[[{x:7,y:10},{x:6,y:10},{x:5,y:10}],[{x:22,y:10},{x:23,y:10},{x:24,y:10}]]:[[{x:10,y:10},{x:9,y:10},{x:8,y:10}]];directions=playerMode==="two"?[{x:1,y:0},{x:-1,y:0}]:[{x:1,y:0}];nextDirections=directions.map(d=>({...d}));accumulator=0;mode="playing";spawn();draw()};
  const reset=()=>{if(roundTimer)clearTimeout(roundTimer);playerMode=modeSelect.value;points=0;rounds=[0,0];resetRound()};
  const setDir=(index,x,y)=>{const current=directions[index];if(current&&!(x===-current.x&&y===-current.y))nextDirections[index]={x,y}};
  const endRound=losers=>{
    if(playerMode==="one"){mode="gameover";score("snake",points);return}
    const winner=losers.length===1?1-losers[0]:-1;if(winner>=0)rounds[winner]++;
    if(Math.max(...rounds)>=5)mode=winner===0?"p1-won":"p2-won";
    else{mode=winner<0?"round-draw":winner===0?"p1-round":"p2-round";roundTimer=setTimeout(resetRound,500)}
  };
  const tick=()=>{
    directions=nextDirections.map(d=>({...d}));
    const heads=snakes.map((snake,index)=>({x:snake[0].x+directions[index].x,y:snake[0].y+directions[index].y}));
    const losers=[];heads.forEach((head,index)=>{const hitWall=head.x<0||head.x>=cols||head.y<0||head.y>=rows;const hitBody=snakes.some((snake,snakeIndex)=>snake.some((part,partIndex)=>!(snakeIndex===index&&partIndex===snake.length-1)&&part.x===head.x&&part.y===head.y));const headOn=heads.some((other,otherIndex)=>otherIndex!==index&&other.x===head.x&&other.y===head.y);if(hitWall||hitBody||headOn)losers.push(index)});
    if(losers.length)return endRound(losers);
    heads.forEach((head,index)=>{snakes[index].unshift(head);if(head.x===food.x&&head.y===food.y){if(playerMode==="one")points++;spawn()}else snakes[index].pop()});
  };
  const update=dt=>{if(mode!=="playing")return;accumulator+=dt;const interval={easy:.14,normal:.11,hard:.08}[difficultySelect.value];while(accumulator>=interval){accumulator-=interval;tick();if(mode!=="playing")break}};
  const draw = () => {
    ctx.fillStyle="#020704";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle="#0b2b18";
    for(let x=0;x<canvas.width;x+=size){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke()}for(let y=0;y<canvas.height;y+=size){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke()}
    ctx.fillStyle="#ff5577";ctx.fillRect(food.x*size+3,food.y*size+3,size-6,size-6);
    snakes.forEach((snake,index)=>snake.forEach((p,i)=>{ctx.fillStyle=index?(i?"#258bb0":"#bcefff"):(i?"#31c96d":"#aaffc1");ctx.fillRect(p.x*size+2,p.y*size+2,size-4,size-4)}));
    ctx.fillStyle="#b7ffd1";ctx.font="16px monospace";ctx.fillText(playerMode==="one"?`SCORE ${points}  BEST ${Store.data.scores.snake}`:`P1 ${rounds[0]} — ${rounds[1]} P2`,12,22);
    if(mode!=="playing"){ctx.fillStyle="#000c";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle=mode==="paused"?"#ffd166":"#ff7790";ctx.font="30px monospace";ctx.textAlign="center";ctx.fillText(({paused:"PAUSED",gameover:"SIGNAL LOST","p1-won":"PLAYER 1 WINS","p2-won":"PLAYER 2 WINS","p1-round":"P1 ROUND","p2-round":"P2 ROUND","round-draw":"ROUND DRAW"})[mode]||mode,canvas.width/2,canvas.height/2);ctx.textAlign="left"}
  };
  const key = e => {
    const k=e.key.length===1?e.key.toLowerCase():e.key;if(k==="w")setDir(0,0,-1);if(k==="s")setDir(0,0,1);if(k==="a")setDir(0,-1,0);if(k==="d")setDir(0,1,0);
    const arrowPlayer=playerMode==="two"?1:0;if(k==="ArrowUp")setDir(arrowPlayer,0,-1);if(k==="ArrowDown")setDir(arrowPlayer,0,1);if(k==="ArrowLeft")setDir(arrowPlayer,-1,0);if(k==="ArrowRight")setDir(arrowPlayer,1,0);
    if(["w","a","s","d","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(k))e.preventDefault();if(e.key===" "){mode=mode==="paused"?"playing":mode==="playing"?"paused":mode;e.preventDefault()}if(e.key.toLowerCase()==="f")$(".gameFull",host).click();
  };
  let last=performance.now(),raf;const loop=t=>{const dt=Math.min(.05,(t-last)/1000);last=t;update(dt);draw();raf=requestAnimationFrame(loop)};
  addEventListener("keydown",key);modeSelect.onchange=reset;difficultySelect.onchange=reset;$(".gameRestart",host).onclick=reset;$(".gamePause",host).onclick=()=>mode=mode==="paused"?"playing":mode==="playing"?"paused":mode;
  window.render_game_to_text=()=>JSON.stringify({game:"snake",mode,playerMode,difficulty:difficultySelect.value,coordinates:"origin top-left, +x right, +y down",snakes,food,score:points,rounds});
  window.advanceTime=ms=>{for(let i=0;i<Math.ceil(ms/16.67);i++)update(1/60);draw()};reset();raf=requestAnimationFrame(loop);canvas.focus();
  return()=>{if(roundTimer)clearTimeout(roundTimer);cancelAnimationFrame(raf);removeEventListener("keydown",key)};
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
  setHTML(host, `<div class="game-status"><span>MINESWEEPER</span><span id="mineControls">LEFT OPEN · RIGHT FLAG</span></div><div class="game-wrap"><div id="mineHost"></div></div><div class="game-control-row"><div class="select-field"><label class="select-label" for="minePlayers">Game mode</label><select id="minePlayers" class="select-full"><option value="one">1 PLAYER</option><option value="two">2 PLAYERS</option></select></div><div class="select-field"><label class="select-label" for="mineDifficulty">Difficulty</label><select id="mineDifficulty" class="select-full"><option value="easy">EASY</option><option value="normal" selected>NORMAL</option><option value="hard">HARD</option></select></div><button class="gameRestart">RESTART</button></div>`);
  let boards,mode,playerMode="one",cursors;
  const config=()=>playerMode==="two"?({easy:[6,6,6],normal:[7,7,9],hard:[8,8,13]})[$("#mineDifficulty").value]:({easy:[9,9,10],normal:[16,12,30],hard:[20,14,50]})[$("#mineDifficulty").value];
  const neighbors=(board,c)=>board.cells.slice(Math.max(0,c.y-1),c.y+2).flatMap(row=>row.slice(Math.max(0,c.x-1),c.x+2)).filter(n=>n!==c);
  const makeBoard=()=>{const [width,height,total]=config(),board={width,height,total,opened:0,state:"playing",cells:Array.from({length:height},(_,y)=>Array.from({length:width},(_,x)=>({x,y,mine:false,open:false,flag:false,n:0})))};let placed=0;while(placed<total){const c=board.cells[Math.floor(Math.random()*height)][Math.floor(Math.random()*width)];if(!c.mine){c.mine=true;placed++}}board.cells.flat().forEach(c=>c.n=neighbors(board,c).filter(n=>n.mine).length);return board};
  const reveal=(board,c)=>{if(board.state!=="playing"||c.flag||c.open)return;c.open=true;board.opened++;if(c.mine){board.state="lost";board.cells.flat().filter(x=>x.mine).forEach(x=>x.open=true)}else if(c.n===0)neighbors(board,c).forEach(n=>reveal(board,n));if(board.opened===board.width*board.height-board.total)board.state="won"};
  const checkRace=()=>{if(playerMode==="one"){if(boards[0].state==="won"){mode="won";score("mines",Math.max(Store.data.scores.mines,boards[0].total))}else if(boards[0].state==="lost")mode="gameover"}else if(boards[0].state!=="playing"||boards[1].state!=="playing"){mode=boards[0].state==="won"?"p1-won":boards[1].state==="won"?"p2-won":boards[0].state==="lost"?"p2-won":"p1-won"}};
  const openAt=(index,x,y)=>{const board=boards[index],c=board.cells[y]?.[x];if(!c)return;reveal(board,c);checkRace();paint()};
  const flagAt=(index,x,y)=>{const c=boards[index].cells[y]?.[x];if(c&&!c.open&&boards[index].state==="playing"){c.flag=!c.flag;paint()}};
  const paintGrid=(board,index)=>{const grid=el("div",{class:"mine-grid"});grid.style.gridTemplateColumns=`repeat(${board.width},30px)`;board.cells.flat().forEach(c=>{const selected=playerMode==="two"&&c.x===cursors[index].x&&c.y===cursors[index].y;const b=el("button",{class:`${c.open?"open":c.flag?"flag":""}${selected?" active":""}`},c.open?(c.mine?"✹":c.n||""):c.flag?"⚑":"");b.onclick=()=>openAt(index,c.x,c.y);b.oncontextmenu=e=>{e.preventDefault();flagAt(index,c.x,c.y)};grid.append(b)});return grid};
  const paint=()=>{const area=$("#mineHost");setHTML(area,"");if(playerMode==="two"){const race=el("div",{class:"mines-race"});boards.forEach((board,index)=>{const wrap=el("div",{class:`mine-player ${index===0?"active":""}`},`<b>PLAYER ${index+1}</b>`);wrap.append(paintGrid(board,index));race.append(wrap)});area.append(race)}else area.append(paintGrid(boards[0],0));if(mode!=="playing")area.append(el("div",{class:"metric",style:`margin-top:12px;color:${["won","p1-won","p2-won"].includes(mode)?"var(--green)":"var(--danger)"}`},({won:"WON",gameover:"GAME OVER","p1-won":"PLAYER 1 WINS","p2-won":"PLAYER 2 WINS"})[mode]));$("#mineControls").textContent=playerMode==="two"?"P1 WASD + Q/E · P2 ARROWS + ENTER/SHIFT":"LEFT OPEN · RIGHT FLAG"};
  const reset=()=>{playerMode=$("#minePlayers").value;boards=Array.from({length:playerMode==="two"?2:1},makeBoard);cursors=boards.map(()=>({x:0,y:0}));mode="playing";paint()};
  const key=e=>{if(playerMode!=="two"||mode!=="playing")return;const k=e.key.length===1?e.key.toLowerCase():e.key;const move=(i,dx,dy)=>{cursors[i].x=Math.max(0,Math.min(boards[i].width-1,cursors[i].x+dx));cursors[i].y=Math.max(0,Math.min(boards[i].height-1,cursors[i].y+dy));paint()};if(k==="w")move(0,0,-1);if(k==="s")move(0,0,1);if(k==="a")move(0,-1,0);if(k==="d")move(0,1,0);if(k==="q")openAt(0,cursors[0].x,cursors[0].y);if(k==="e")flagAt(0,cursors[0].x,cursors[0].y);if(k==="ArrowUp")move(1,0,-1);if(k==="ArrowDown")move(1,0,1);if(k==="ArrowLeft")move(1,-1,0);if(k==="ArrowRight")move(1,1,0);if(k==="Enter")openAt(1,cursors[1].x,cursors[1].y);if(k==="Shift")flagAt(1,cursors[1].x,cursors[1].y);if(["w","a","s","d","q","e","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter","Shift"].includes(k))e.preventDefault()};
  addEventListener("keydown",key);$(".gameRestart",host).onclick=reset;$("#mineDifficulty").onchange=reset;$("#minePlayers").onchange=reset;
  window.render_game_to_text=()=>JSON.stringify({game:"minesweeper",mode,playerMode,difficulty:$("#mineDifficulty").value,cursors,boards:boards.map(board=>({size:[board.width,board.height],mines:board.total,state:board.state,visible:board.cells.flat().filter(c=>c.open||c.flag).map(c=>({x:c.x,y:c.y,open:c.open,flag:c.flag,value:c.open?(c.mine?"mine":c.n):null}))}))});
  window.advanceTime=()=>{};reset();return()=>removeEventListener("keydown",key);
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

function addGameOptions(host, { mode = false, difficulty = true, modeId = "gamePlayers", difficultyId = "gameDifficulty" } = {}) {
  const controls = $(".gameRestart", host).parentElement;
  controls.classList.add("game-control-row");
  let modeSelect = null, difficultySelect = null;
  if (mode) {
    const field = el("div", { class: "select-field" }, `<label class="select-label" for="${modeId}">Game mode</label><select id="${modeId}" class="select-full"><option value="one">1 PLAYER</option><option value="two">2 PLAYERS</option></select>`);
    controls.prepend(field); modeSelect = $(`#${modeId}`, field);
  }
  if (difficulty) {
    const field = el("div", { class: "select-field" }, `<label class="select-label" for="${difficultyId}">Difficulty</label><select id="${difficultyId}" class="select-full"><option value="easy">EASY</option><option value="normal" selected>NORMAL</option><option value="hard">HARD</option></select>`);
    controls.prepend(field); difficultySelect = $(`#${difficultyId}`, field);
  }
  return { modeSelect, difficultySelect };
}

function breakoutGame(host) {
  const canvas = canvasBase(host, "BREAKOUT", "A/D OR ARROWS · SPACE PAUSE", 700, 440), ctx = canvas.getContext("2d");
  const { difficultySelect } = addGameOptions(host);
  const held = new Set();
  let paddle, ball, bricks, scoreValue, lives, level, mode, raf, last = 0;
  const settings = () => ({ easy: { rows: 4, speed: 220 }, normal: { rows: 5, speed: 270 }, hard: { rows: 6, speed: 330 } })[difficultySelect.value];
  const makeBricks = () => Array.from({ length: settings().rows }, (_, row) => Array.from({ length: 10 }, (_, col) => ({ x: 27 + col * 65, y: 45 + row * 25, w: 58, h: 17, alive: true }))).flat();
  const serve = () => ball = { x: 350, y: 350, vx: (Math.random() < .5 ? -1 : 1) * settings().speed * .65, vy: -settings().speed, r: 7 };
  const reset = () => { held.clear(); paddle = { x: 295, y: 405, w: 110, h: 12 }; scoreValue = 0; lives = 3; level = 1; mode = "playing"; bricks = makeBricks(); serve(); draw(); };
  const nextLevel = () => { level++; bricks = makeBricks(); serve(); };
  const update = dt => {
    if (mode !== "playing") return;
    const direction = Number(held.has("ArrowRight") || held.has("d")) - Number(held.has("ArrowLeft") || held.has("a"));
    paddle.x = Math.max(0, Math.min(700 - paddle.w, paddle.x + direction * 360 * dt));
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.x < ball.r || ball.x > 700 - ball.r) ball.vx *= -1;
    if (ball.y < ball.r) ball.vy = Math.abs(ball.vy);
    if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h && ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
      ball.y = paddle.y - ball.r; ball.vy = -Math.abs(ball.vy); ball.vx += (ball.x - (paddle.x + paddle.w / 2)) * 5;
    }
    for (const brick of bricks) if (brick.alive && ball.x + ball.r > brick.x && ball.x - ball.r < brick.x + brick.w && ball.y + ball.r > brick.y && ball.y - ball.r < brick.y + brick.h) {
      brick.alive = false; ball.vy *= -1; scoreValue += 10 * level; score("breakout", scoreValue); break;
    }
    if (!bricks.some(brick => brick.alive)) nextLevel();
    if (ball.y > 455) { lives--; if (lives <= 0) { mode = "gameover"; held.clear(); } else serve(); }
  };
  const draw = () => {
    ctx.fillStyle = "#020704"; ctx.fillRect(0,0,700,440);
    bricks.forEach((brick, index) => { if (!brick.alive) return; ctx.fillStyle = ["#39ff88","#5ee7ff","#ffd166","#ff5577"][Math.floor(index / 10) % 4]; ctx.fillRect(brick.x,brick.y,brick.w,brick.h); });
    ctx.fillStyle="#9affbd";ctx.fillRect(paddle.x,paddle.y,paddle.w,paddle.h);ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#b7ffd1";ctx.font="15px monospace";ctx.fillText(`SCORE ${scoreValue}  BEST ${Store.data.scores.breakout}  LIVES ${lives}  LEVEL ${level}`,15,24);
    if(mode!=="playing"){ctx.fillStyle="#000c";ctx.fillRect(0,0,700,440);ctx.fillStyle=mode==="paused"?"#ffd166":"#ff5577";ctx.font="30px monospace";ctx.textAlign="center";ctx.fillText(mode==="paused"?"PAUSED":"GAME OVER",350,230);ctx.textAlign="left"}
  };
  const movement = key => ["ArrowLeft","ArrowRight","a","d"].includes(key.length===1?key.toLowerCase():key);
  const down = event => { const key=event.key.length===1?event.key.toLowerCase():event.key;if(movement(key)){held.add(key);event.preventDefault()}if(event.key===" "&&!event.repeat){mode=mode==="paused"?"playing":mode==="playing"?"paused":mode;held.clear();event.preventDefault()}if(event.key.toLowerCase()==="f")$(".gameFull",host).click() };
  const up = event => held.delete(event.key.length===1?event.key.toLowerCase():event.key);
  const loop = time => { const dt=Math.min(.04,(time-(last||time))/1000);last=time;update(dt);draw();raf=requestAnimationFrame(loop) };
  addEventListener("keydown",down);addEventListener("keyup",up);addEventListener("blur",()=>held.clear());
  difficultySelect.onchange=reset;$(".gameRestart",host).onclick=reset;$(".gamePause",host).onclick=()=>{if(["playing","paused"].includes(mode)){mode=mode==="playing"?"paused":"playing";held.clear()}};
  window.render_game_to_text=()=>JSON.stringify({game:"breakout",mode,difficulty:difficultySelect.value,coordinateSystem:"origin top-left",paddle,ball,bricksRemaining:bricks.filter(b=>b.alive).length,score:scoreValue,lives,level});
  window.advanceTime=ms=>{for(let i=0;i<Math.ceil(ms/16.67);i++)update(1/60);draw()};reset();raf=requestAnimationFrame(loop);canvas.focus();
  return()=>{held.clear();cancelAnimationFrame(raf);removeEventListener("keydown",down);removeEventListener("keyup",up)};
}

function connectFourGame(host) {
  setHTML(host, `<div class="game-status"><span>CONNECT FOUR</span><span id="connectControls">YOU: RED · CPU: YELLOW</span></div><div class="game-wrap"><div class="connect4"></div><div class="metric" id="connectStatus"></div></div><div class="game-control-row"><div class="select-field"><label class="select-label" for="connectPlayers">Game mode</label><select id="connectPlayers" class="select-full"><option value="one">1 PLAYER</option><option value="two">2 PLAYERS</option></select></div><div class="select-field"><label class="select-label" for="connectDifficulty">Difficulty</label><select id="connectDifficulty" class="select-full"><option value="easy">EASY</option><option value="normal" selected>NORMAL</option><option value="hard">HARD</option></select></div><button class="gameRestart">RESTART</button></div>`);
  let board, current, mode, playerMode="one", cpuTimer=null, selected=3;
  const linesFrom = (b,r,c) => [[[0,1],[0,-1]],[[1,0],[-1,0]],[[1,1],[-1,-1]],[[1,-1],[-1,1]]].some(pair => 1 + pair.flatMap(([dr,dc]) => { const out=[];let rr=r+dr,cc=c+dc;while(b[rr]?.[cc]===b[r][c]){out.push(1);rr+=dr;cc+=dc}return out }).length >= 4);
  const valid = b => Array.from({length:7},(_,c)=>c).filter(c=>!b[0][c]);
  const rowFor = (b,c) => { for(let r=5;r>=0;r--)if(!b[r][c])return r;return -1 };
  const drop = (c,mark=current,b=board) => { const r=rowFor(b,c);if(r<0)return false;b[r][c]=mark;return {r,c} };
  const finish = move => { if(linesFrom(board,move.r,move.c)){mode=current==="R"?(playerMode==="one"?"won":"red-won"):(playerMode==="one"?"lost":"yellow-won");if(playerMode==="one"&&mode==="won")score("connect4",Store.data.scores.connect4+1)}else if(!valid(board).length)mode="draw" };
  const chooseCpu = () => {
    const choices=valid(board), difficulty=$("#connectDifficulty").value;
    const win=choices.find(c=>{const b=board.map(r=>[...r]),m=drop(c,"Y",b);return linesFrom(b,m.r,m.c)});
    const block=choices.find(c=>{const b=board.map(r=>[...r]),m=drop(c,"R",b);return linesFrom(b,m.r,m.c)});
    if(difficulty==="easy")return choices[Math.floor(Math.random()*choices.length)];
    if(win!==undefined)return win;if(block!==undefined&&difficulty==="hard")return block;
    return [...choices].sort((a,b)=>Math.abs(a-3)-Math.abs(b-3))[0];
  };
  const cpu = () => { cpuTimer=null;if(mode!=="playing"||playerMode!=="one")return;const move=drop(chooseCpu(),"Y");current="Y";finish(move);if(mode==="playing")current="R";paint() };
  const play = c => { if(mode!=="playing"||(playerMode==="one"&&current==="Y"))return;const move=drop(c);if(!move)return;finish(move);if(mode==="playing"){current=current==="R"?"Y":"R";if(playerMode==="one")cpuTimer=setTimeout(cpu,180)}paint() };
  const paint = () => {
    const grid=$(".connect4",host);setHTML(grid,"");board.flat().forEach((value,index)=>{const b=el("button",{class:value==="R"?"red":value==="Y"?"yellow":"", "aria-label":`Row ${Math.floor(index/7)+1} column ${index%7+1}`});b.onclick=()=>play(index%7);grid.append(b)});
    $("#connectControls").textContent=playerMode==="two"?"P1 RED · P2 YELLOW":"YOU RED · CPU YELLOW";
    $("#connectStatus").textContent=mode==="playing"?`${current==="R"?"RED":"YELLOW"} TURN`:{won:"YOU WIN",lost:"CPU WINS","red-won":"RED WINS","yellow-won":"YELLOW WINS",draw:"DRAW"}[mode];
  };
  const reset=()=>{if(cpuTimer)clearTimeout(cpuTimer);board=Array.from({length:6},()=>Array(7).fill(""));current="R";mode="playing";selected=3;paint()};
  const key=event=>{if(event.key==="ArrowLeft"){selected=Math.max(0,selected-1);event.preventDefault()}if(event.key==="ArrowRight"){selected=Math.min(6,selected+1);event.preventDefault()}if(event.key==="Enter"||event.key===" "){play(selected);event.preventDefault()}};
  addEventListener("keydown",key);$("#connectPlayers").onchange=event=>{playerMode=event.target.value;reset()};$("#connectDifficulty").onchange=reset;$(".gameRestart",host).onclick=reset;
  window.render_game_to_text=()=>JSON.stringify({game:"connect-four",mode,playerMode,difficulty:$("#connectDifficulty").value,currentPlayer:current,selectedColumn:selected,board});
  window.advanceTime=()=>{};reset();return()=>{if(cpuTimer)clearTimeout(cpuTimer);removeEventListener("keydown",key)};
}

function memoryGame(host) {
  setHTML(host, `<div class="game-status"><span>MEMORY MATCH</span><span id="memoryControls">YOU VS CPU</span></div><div class="game-wrap"><div class="memory-grid"></div><div class="metric" id="memoryStatus"></div></div><div class="game-control-row"><div class="select-field"><label class="select-label" for="memoryPlayers">Game mode</label><select id="memoryPlayers" class="select-full"><option value="one">1 PLAYER</option><option value="two">2 PLAYERS</option></select></div><div class="select-field"><label class="select-label" for="memoryDifficulty">Difficulty</label><select id="memoryDifficulty" class="select-full"><option value="easy">EASY</option><option value="normal" selected>NORMAL</option><option value="hard">HARD</option></select></div><button class="gameRestart">RESTART</button></div>`);
  const symbols=["◆","●","■","▲","★","✦","⬟","☀"];
  let cards, open, scores, current, mode, playerMode="one", timer=null, moves=0, known=new Map();
  const shuffle = values => values.map(value=>({value,sort:Math.random()})).sort((a,b)=>a.sort-b.sort).map(item=>item.value);
  const finish = () => { if(cards.every(card=>card.matched)){mode=scores[0]===scores[1]?"draw":scores[0]>scores[1]?(playerMode==="one"?"won":"p1-won"):(playerMode==="one"?"lost":"p2-won");if(playerMode==="one"&&mode==="won")score("memory",Math.max(Store.data.scores.memory,1000-moves*10))} };
  const resolve = () => {
    const [a,b]=open;if(cards[a].value===cards[b].value){cards[a].matched=cards[b].matched=true;scores[current]++;open=[];finish();paint();if(mode==="playing"&&playerMode==="one"&&current===1)timer=setTimeout(cpu,250)}
    else timer=setTimeout(()=>{open=[];current=1-current;paint();if(playerMode==="one"&&current===1)timer=setTimeout(cpu,250)},550);
  };
  const flip = index => { if(mode!=="playing"||open.length>=2||cards[index].matched||open.includes(index)||(playerMode==="one"&&current===1))return;open.push(index);known.set(index,cards[index].value);moves++;paint();if(open.length===2)resolve() };
  const cpu = () => {
    timer=null;if(mode!=="playing"||playerMode!=="one"||current!==1)return;
    const free=cards.map((card,index)=>!card.matched&&!open.includes(index)?index:null).filter(index=>index!==null);
    let choice;
    const difficulty=$("#memoryDifficulty").value, seen=[...known.entries()].filter(([index])=>free.includes(index));
    if(open.length===1&&difficulty!=="easy")choice=seen.find(([,value])=>value===cards[open[0]].value)?.[0];
    if(choice===undefined&&difficulty==="hard"){const pairs=new Map;for(const [index,value] of seen){if(pairs.has(value)){choice=pairs.get(value);break}pairs.set(value,index)}}
    if(choice===undefined)choice=free[Math.floor(Math.random()*free.length)];
    open.push(choice);known.set(choice,cards[choice].value);moves++;paint();if(open.length===2)resolve();else timer=setTimeout(cpu,350);
  };
  const paint = () => {
    const grid=$(".memory-grid",host);setHTML(grid,"");cards.forEach((card,index)=>{const visible=card.matched||open.includes(index);const b=el("button",{class:visible?"":"hidden-card","aria-label":visible?card.value:"Hidden card"},visible?card.value:"?");b.onclick=()=>flip(index);grid.append(b)});
    $("#memoryControls").textContent=playerMode==="two"?"PLAYER 1 VS PLAYER 2":"YOU VS CPU";
    $("#memoryStatus").textContent=mode==="playing"?`P${current+1} TURN · ${scores[0]} — ${scores[1]}`:{won:"YOU WIN",lost:"CPU WINS","p1-won":"PLAYER 1 WINS","p2-won":"PLAYER 2 WINS",draw:"DRAW"}[mode];
  };
  const reset=()=>{if(timer)clearTimeout(timer);cards=shuffle([...symbols,...symbols]).map(value=>({value,matched:false}));open=[];scores=[0,0];current=0;mode="playing";moves=0;known.clear();paint()};
  $("#memoryPlayers").onchange=event=>{playerMode=event.target.value;reset()};$("#memoryDifficulty").onchange=reset;$(".gameRestart",host).onclick=reset;
  window.render_game_to_text=()=>JSON.stringify({game:"memory",mode,playerMode,difficulty:$("#memoryDifficulty").value,currentPlayer:current,scores,moves,cards:cards.map((card,index)=>({index,visible:card.matched||open.includes(index),matched:card.matched,value:card.matched||open.includes(index)?card.value:null}))});
  window.advanceTime=()=>{};reset();return()=>{if(timer)clearTimeout(timer)};
}

function tronGame(host) {
  const canvas=canvasBase(host,"TRON LIGHT CYCLES","P1 WASD · P2 ARROWS · FIRST TO 5",700,420),ctx=canvas.getContext("2d");
  const {modeSelect,difficultySelect}=addGameOptions(host,{mode:true,difficulty:true,modeId:"tronPlayers",difficultyId:"tronDifficulty"});
  const held=new Set();let players,trails,rounds,mode,accumulator=0,raf,last=0,playerMode="one";
  const cell=10,cols=70,rows=42;
  const resetRound=()=>{players=[{x:12,y:21,dir:[1,0],next:[1,0],alive:true},{x:57,y:21,dir:[-1,0],next:[-1,0],alive:true}];trails=new Set(players.map(p=>`${p.x},${p.y}`));accumulator=0;mode="playing";draw()};
  const reset=()=>{held.clear();rounds=[0,0];playerMode=modeSelect.value;resetRound()};
  const setDirection=(player,dir)=>{const p=players[player];if(dir[0]!==-p.dir[0]||dir[1]!==-p.dir[1])p.next=dir};
  const cpu=()=>{
    const p=players[1], options=[[p.dir[0],p.dir[1]],[p.dir[1],-p.dir[0]],[-p.dir[1],p.dir[0]]].filter(([dx,dy])=>{const x=p.x+dx,y=p.y+dy;return x>=0&&x<cols&&y>=0&&y<rows&&!trails.has(`${x},${y}`)});
    const chance={easy:.35,normal:.7,hard:.95}[difficultySelect.value];if(options.length&&Math.random()<chance)p.next=options[Math.floor(Math.random()*options.length)];
  };
  const step=()=>{
    if(playerMode==="one")cpu();
    players.forEach(p=>p.dir=p.next);
    const next=players.map(p=>({x:p.x+p.dir[0],y:p.y+p.dir[1]}));
    players.forEach((p,index)=>{const n=next[index];if(n.x<0||n.x>=cols||n.y<0||n.y>=rows||trails.has(`${n.x},${n.y}`)||(next[1-index].x===n.x&&next[1-index].y===n.y))p.alive=false});
    players.forEach((p,index)=>{if(p.alive){p.x=next[index].x;p.y=next[index].y;trails.add(`${p.x},${p.y}`)}});
    if(!players[0].alive||!players[1].alive){
      const winner=players[0].alive&&!players[1].alive?0:players[1].alive&&!players[0].alive?1:-1;
      if(winner>=0)rounds[winner]++;
      if(Math.max(...rounds)>=5){mode=winner===0?(playerMode==="one"?"won":"p1-won"):(playerMode==="one"?"lost":"p2-won");if(playerMode==="one"&&winner===0)score("tron",Store.data.scores.tron+1);held.clear()}
      else{mode=winner<0?"round-draw":winner===0?"p1-round":"p2-round";setTimeout(()=>{if(mode.includes("round"))resetRound()},500)}
    }
  };
  const update=dt=>{if(mode!=="playing")return;accumulator+=dt;const interval={easy:.12,normal:.09,hard:.065}[difficultySelect.value];while(accumulator>=interval){accumulator-=interval;step();if(mode!=="playing")break}};
  const draw=()=>{ctx.fillStyle="#020704";ctx.fillRect(0,0,700,420);ctx.strokeStyle="#082513";for(let x=0;x<700;x+=10){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,420);ctx.stroke()}for(let y=0;y<420;y+=10){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(700,y);ctx.stroke()}for(const point of trails){const [x,y]=point.split(",").map(Number);ctx.fillStyle=x<35?"#39ff88":"#5ee7ff";ctx.fillRect(x*cell,y*cell,cell,cell)}players.forEach((p,i)=>{ctx.fillStyle=i?"#c9f8ff":"#e2ffea";ctx.fillRect(p.x*cell,p.y*cell,cell,cell)});ctx.fillStyle="#b7ffd1";ctx.font="15px monospace";ctx.fillText(`P1 ${rounds[0]}  —  ${rounds[1]} P2`,300,20);if(mode!=="playing"){ctx.fillStyle="#000b";ctx.fillRect(0,0,700,420);ctx.fillStyle="#39ff88";ctx.font="28px monospace";ctx.textAlign="center";ctx.fillText(({paused:"PAUSED",won:"YOU WIN",lost:"CPU WINS","p1-won":"PLAYER 1 WINS","p2-won":"PLAYER 2 WINS","p1-round":"P1 ROUND","p2-round":"P2 ROUND","round-draw":"ROUND DRAW"})[mode]||mode,350,220);ctx.textAlign="left"}};
  const down=e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;held.add(k);if(k==="w")setDirection(0,[0,-1]);if(k==="s")setDirection(0,[0,1]);if(k==="a")setDirection(0,[-1,0]);if(k==="d")setDirection(0,[1,0]);if(playerMode==="two"){if(k==="ArrowUp")setDirection(1,[0,-1]);if(k==="ArrowDown")setDirection(1,[0,1]);if(k==="ArrowLeft")setDirection(1,[-1,0]);if(k==="ArrowRight")setDirection(1,[1,0])}if(e.key===" "&&!e.repeat){mode=mode==="paused"?"playing":mode==="playing"?"paused":mode;held.clear()}if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key))e.preventDefault();if(e.key.toLowerCase()==="f")$(".gameFull",host).click()};
  const up=e=>held.delete(e.key.length===1?e.key.toLowerCase():e.key);const loop=t=>{const dt=Math.min(.04,(t-(last||t))/1000);last=t;update(dt);draw();raf=requestAnimationFrame(loop)};
  addEventListener("keydown",down);addEventListener("keyup",up);addEventListener("blur",()=>held.clear());modeSelect.onchange=reset;difficultySelect.onchange=reset;$(".gameRestart",host).onclick=reset;$(".gamePause",host).onclick=()=>{if(["playing","paused"].includes(mode)){mode=mode==="playing"?"paused":"playing";held.clear()}};
  window.render_game_to_text=()=>JSON.stringify({game:"tron",mode,playerMode,difficulty:difficultySelect.value,coordinateSystem:"70x42 grid origin top-left",players,rounds,trailCells:trails.size});
  window.advanceTime=ms=>{for(let i=0;i<Math.ceil(ms/16.67);i++)update(1/60);draw()};reset();raf=requestAnimationFrame(loop);canvas.focus();return()=>{held.clear();cancelAnimationFrame(raf);removeEventListener("keydown",down);removeEventListener("keyup",up)};
}

function invadersGame(host) {
  const canvas=canvasBase(host,"SPACE INVADERS","A/D OR ARROWS · SPACE SHOOT",700,440),ctx=canvas.getContext("2d");
  const {difficultySelect}=addGameOptions(host);const held=new Set();let player,invaders,shots,enemyShots,scoreValue,lives,wave,mode,raf,last=0,enemyDirection=1,enemyTimer=0;
  const setupWave=()=>{invaders=[];for(let r=0;r<4;r++)for(let c=0;c<9;c++)invaders.push({x:90+c*58,y:55+r*38,w:28,h:20,alive:true});enemyDirection=1};
  const reset=()=>{held.clear();player={x:335,y:397,w:32,h:18,cooldown:0};shots=[];enemyShots=[];scoreValue=0;lives=3;wave=1;mode="playing";enemyTimer=0;setupWave();draw()};
  const shoot=()=>{if(player.cooldown<=0&&mode==="playing"){shots.push({x:player.x+16,y:player.y,vy:-420});player.cooldown=.28}};
  const rectHit=(a,b)=>a.x<b.x+b.w&&a.x+(a.w||3)>b.x&&a.y<b.y+b.h&&a.y+(a.h||8)>b.y;
  const update=dt=>{
    if(mode!=="playing")return;const pressure={easy:.7,normal:1,hard:1.35}[difficultySelect.value];
    player.x=Math.max(0,Math.min(668,player.x+(Number(held.has("ArrowRight")||held.has("d"))-Number(held.has("ArrowLeft")||held.has("a")))*300*dt));player.cooldown-=dt;if(held.has(" "))shoot();
    shots.forEach(s=>s.y+=s.vy*dt);enemyShots.forEach(s=>s.y+=s.vy*dt);shots=shots.filter(s=>s.y>-10);enemyShots=enemyShots.filter(s=>s.y<450);
    let edge=false;invaders.filter(i=>i.alive).forEach(i=>{i.x+=enemyDirection*(28+wave*6)*pressure*dt;if(i.x<15||i.x+i.w>685)edge=true});if(edge){enemyDirection*=-1;invaders.filter(i=>i.alive).forEach(i=>i.y+=14)}
    enemyTimer-=dt;if(enemyTimer<=0){const alive=invaders.filter(i=>i.alive);if(alive.length){const source=alive[Math.floor(Math.random()*alive.length)];enemyShots.push({x:source.x+14,y:source.y+20,vy:170*pressure,w:3,h:9})}enemyTimer=(1.25/pressure)+Math.random()*.5}
    for(const shot of shots)for(const invader of invaders)if(invader.alive&&rectHit(shot,invader)){invader.alive=false;shot.y=-20;scoreValue+=10*wave;score("invaders",scoreValue);break}
    for(const shot of enemyShots)if(rectHit(shot,player)){shot.y=500;lives--;if(lives<=0){mode="gameover";held.clear()}}
    if(invaders.some(i=>i.alive&&i.y+i.h>=player.y)){mode="gameover";held.clear()}
    if(!invaders.some(i=>i.alive)){wave++;setupWave();shots=[];enemyShots=[]}
  };
  const draw=()=>{ctx.fillStyle="#020704";ctx.fillRect(0,0,700,440);ctx.fillStyle="#39ff88";ctx.fillRect(player.x,player.y,player.w,player.h);invaders.forEach((i,index)=>{if(i.alive){ctx.fillStyle=index%2?"#5ee7ff":"#9affbd";ctx.fillRect(i.x,i.y,i.w,i.h)}});ctx.fillStyle="#fff";shots.forEach(s=>ctx.fillRect(s.x,s.y,3,9));ctx.fillStyle="#ff5577";enemyShots.forEach(s=>ctx.fillRect(s.x,s.y,3,9));ctx.fillStyle="#b7ffd1";ctx.font="15px monospace";ctx.fillText(`SCORE ${scoreValue}  BEST ${Store.data.scores.invaders}  LIVES ${lives}  WAVE ${wave}`,15,24);if(mode!=="playing"){ctx.fillStyle="#000c";ctx.fillRect(0,0,700,440);ctx.fillStyle=mode==="paused"?"#ffd166":"#ff5577";ctx.font="30px monospace";ctx.textAlign="center";ctx.fillText(mode==="paused"?"PAUSED":"INVASION COMPLETE",350,220);ctx.textAlign="left"}};
  const down=e=>{const k=e.key.length===1?e.key.toLowerCase():e.key;if(["a","d","ArrowLeft","ArrowRight"," "].includes(k)){held.add(k);e.preventDefault()}if(e.key===" "&&!e.repeat)shoot();if(e.key.toLowerCase()==="p"){mode=mode==="paused"?"playing":mode==="playing"?"paused":mode;held.clear()}if(e.key.toLowerCase()==="f")$(".gameFull",host).click()};const up=e=>held.delete(e.key.length===1?e.key.toLowerCase():e.key);const loop=t=>{const dt=Math.min(.04,(t-(last||t))/1000);last=t;update(dt);draw();raf=requestAnimationFrame(loop)};
  addEventListener("keydown",down);addEventListener("keyup",up);addEventListener("blur",()=>held.clear());difficultySelect.onchange=reset;$(".gameRestart",host).onclick=reset;$(".gamePause",host).onclick=()=>{if(["playing","paused"].includes(mode)){mode=mode==="playing"?"paused":"playing";held.clear()}};
  window.render_game_to_text=()=>JSON.stringify({game:"space-invaders",mode,difficulty:difficultySelect.value,coordinateSystem:"origin top-left",player,invaders:invaders.filter(i=>i.alive),shots,enemyShots,score:scoreValue,lives,wave});
  window.advanceTime=ms=>{for(let i=0;i<Math.ceil(ms/16.67);i++)update(1/60);draw()};reset();raf=requestAnimationFrame(loop);canvas.focus();return()=>{held.clear();cancelAnimationFrame(raf);removeEventListener("keydown",down);removeEventListener("keyup",up)};
}

const CHESS_GLYPHS={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟"};
const boardResultLabel=result=>({playing:"PLAYING","white-won":"WHITE WINS","black-won":"BLACK WINS",stalemate:"STALEMATE",repetition:"DRAW · THREEFOLD REPETITION","fifty-move":"DRAW · FIFTY-MOVE RULE",insufficient:"DRAW · INSUFFICIENT MATERIAL","red-won":"RED WINS"})[result]||result.toUpperCase();

function chessGame(host) {
  setHTML(host, `<div class="game-status"><span>CHESS</span><span id="chessControls">YOU: WHITE · CPU: BLACK</span></div><div class="game-wrap board-game-wrap"><div class="board-game-layout"><div><div class="board-grid chess-board" id="chessBoard" role="grid" aria-label="Chess board"></div><div class="metric board-status" id="chessStatus"></div></div><aside class="move-history"><h3>Move history</h3><div id="chessHistory"></div></aside></div></div><div class="game-control-row"><div class="select-field"><label class="select-label" for="chessPlayers">Game mode</label><select id="chessPlayers" class="select-full"><option value="one">1 PLAYER</option><option value="two">2 PLAYERS</option></select></div><div class="select-field"><label class="select-label" for="chessDifficulty">Difficulty</label><select id="chessDifficulty" class="select-full"><option value="easy">EASY</option><option value="normal" selected>NORMAL</option><option value="hard">HARD</option></select></div><button class="gameRestart">RESTART</button></div><div id="promotionPicker" class="promotion-picker hidden" role="dialog" aria-modal="true"><div><h3>Promote pawn</h3><div class="row">${["q","r","b","n"].map(piece=>`<button data-promotion="${piece}">${CHESS_GLYPHS[piece.toUpperCase()]}</button>`).join("")}</div></div></div>`);
  let position=initialChessState(),selected=null,cursor=52,playerMode="one",cpuTimer=null,pendingPromotion=null,destroyed=false;
  const legalFrom=()=>selected===null?[]:chessLegalMoves(position,selected);
  const scheduleCpu=()=>{if(cpuTimer)clearTimeout(cpuTimer);if(!destroyed&&playerMode==="one"&&position.turn==="b"&&position.result==="playing")cpuTimer=setTimeout(()=>{cpuTimer=null;const move=chooseChessMove(position,$("#chessDifficulty").value,{easy:20,normal:90,hard:180}[$("#chessDifficulty").value]);if(move){position=chessMove(position,move);selected=null;paint()}},120)};
  const commit=move=>{const next=chessMove(position,move);if(!next)return;position=next;selected=null;pendingPromotion=null;$("#promotionPicker").classList.add("hidden");if(playerMode==="one"&&position.result==="white-won")score("chess",Store.data.scores.chess+1);paint();scheduleCpu()};
  const choose=(index)=>{
    if(position.result!=="playing"||(playerMode==="one"&&position.turn==="b"))return;
    if(selected===null){if(position.board[index]&&((position.board[index]===position.board[index].toUpperCase()?"w":"b")===position.turn)){selected=index;paint()}return}
    const candidates=legalFrom().filter(move=>move.to===index);
    if(candidates.length){
      if(candidates.some(move=>move.promotion)){pendingPromotion={from:selected,to:index};$("#promotionPicker").classList.remove("hidden")}
      else commit(candidates[0]);
    }else if(position.board[index]&&((position.board[index]===position.board[index].toUpperCase()?"w":"b")===position.turn)){selected=index;paint()}else{selected=null;paint()}
  };
  const paint=()=>{
    position.result=chessResult(position);
    const legal=new Set(legalFrom().map(move=>move.to)),board=$("#chessBoard");setHTML(board,"");
    position.board.forEach((piece,index)=>{const glyph=piece?`<span class="chess-piece ${piece===piece.toUpperCase()?"white":"black"}">${CHESS_GLYPHS[piece]}</span>`:"";const button=el("button",{class:`board-square ${(Math.floor(index/8)+index%8)%2?"dark":"light"} ${selected===index?"selected":""} ${legal.has(index)?"legal":""} ${cursor===index?"cursor":""}`,role:"gridcell","aria-label":`${algebraic(index)} ${piece||"empty"}`},glyph);button.onclick=()=>choose(index);board.append(button)});
    $("#chessControls").textContent=playerMode==="two"?"WHITE VS BLACK":`YOU: WHITE · CPU: BLACK · BEST ${Store.data.scores.chess}`;
    $("#chessStatus").textContent=position.result==="playing"?`${position.turn==="w"?"WHITE":"BLACK"} TO MOVE${selected!==null?` · ${algebraic(selected)} SELECTED`:""}`:boardResultLabel(position.result);
    setHTML($("#chessHistory"),position.history.length?position.history.map((move,index)=>`<span><b>${Math.floor(index/2)+1}${index%2?"...":"."}</b> ${escapeHtml(move)}</span>`).join(""):`<span class="muted">NO MOVES</span>`);
  };
  const reset=()=>{if(cpuTimer)clearTimeout(cpuTimer);position=initialChessState();selected=null;cursor=52;pendingPromotion=null;playerMode=$("#chessPlayers").value;$("#promotionPicker").classList.add("hidden");paint()};
  const key=event=>{if($("#promotionPicker")&&!$("#promotionPicker").classList.contains("hidden"))return;const r=Math.floor(cursor/8),f=cursor%8;if(event.key==="ArrowUp")cursor=Math.max(0,cursor-8);if(event.key==="ArrowDown")cursor=Math.min(63,cursor+8);if(event.key==="ArrowLeft")cursor=r*8+Math.max(0,f-1);if(event.key==="ArrowRight")cursor=r*8+Math.min(7,f+1);if(event.key==="Enter"||event.key===" ")choose(cursor);if(event.key==="Escape"){selected=null;paint()}if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"," "].includes(event.key)){event.preventDefault();paint()}};
  addEventListener("keydown",key);$$("[data-promotion]",host).forEach(button=>button.onclick=()=>commit({...pendingPromotion,promotion:button.dataset.promotion}));$("#chessPlayers").onchange=reset;$("#chessDifficulty").onchange=reset;$(".gameRestart",host).onclick=reset;
  window.render_game_to_text=()=>JSON.stringify({game:"chess",mode:position.result,playerMode,difficulty:$("#chessDifficulty").value,coordinateSystem:"a8 index 0 through h1 index 63",currentPlayer:position.turn,selected:selected===null?null:algebraic(selected),cursor:algebraic(cursor),legalDestinations:legalFrom().map(move=>algebraic(move.to)),pieces:position.board.map((piece,index)=>piece?{square:algebraic(index),piece}:null).filter(Boolean),castling:position.castling,enPassant:position.enPassant===null?null:algebraic(position.enPassant),halfmove:position.halfmove,fullmove:position.fullmove,history:position.history,result:position.result});
  window.__BOD_BOARD_TEST__={kind:"chess",load:value=>{position=structuredClone(value);selected=null;paint()},legal:()=>chessLegalMoves(position),move:value=>{const next=chessMove(position,value);if(next){position=next;paint()}return!!next},state:()=>structuredClone(position)};
  window.advanceTime=()=>{};reset();return()=>{destroyed=true;if(cpuTimer)clearTimeout(cpuTimer);removeEventListener("keydown",key);delete window.__BOD_BOARD_TEST__};
}

function checkersGame(host) {
  setHTML(host, `<div class="game-status"><span>AMERICAN CHECKERS</span><span id="checkersControls">YOU: RED · CPU: BLACK</span></div><div class="game-wrap board-game-wrap"><div class="board-game-layout"><div><div class="board-grid checkers-board" id="checkersBoard" role="grid" aria-label="Checkers board"></div><div class="metric board-status" id="checkersStatus"></div></div><aside class="move-history"><h3>Move history</h3><div id="checkersHistory"></div></aside></div></div><div class="game-control-row"><div class="select-field"><label class="select-label" for="checkersPlayers">Game mode</label><select id="checkersPlayers" class="select-full"><option value="one">1 PLAYER</option><option value="two">2 PLAYERS</option></select></div><div class="select-field"><label class="select-label" for="checkersDifficulty">Difficulty</label><select id="checkersDifficulty" class="select-full"><option value="easy">EASY</option><option value="normal" selected>NORMAL</option><option value="hard">HARD</option></select></div><button class="gameRestart">RESTART</button></div>`);
  let position=initialCheckersState(),selected=null,cursor=42,playerMode="one",cpuTimer=null,destroyed=false;
  const legalFrom=()=>selected===null?[]:checkersLegalMoves(position,selected);
  const scheduleCpu=()=>{if(cpuTimer)clearTimeout(cpuTimer);if(!destroyed&&playerMode==="one"&&position.turn==="b"&&position.result==="playing")cpuTimer=setTimeout(()=>{cpuTimer=null;let guard=0;do{const move=chooseCheckersMove(position,$("#checkersDifficulty").value,{easy:20,normal:70,hard:140}[$("#checkersDifficulty").value]);if(!move)break;position=checkersMove(position,move);guard++}while(position.turn==="b"&&position.forcedFrom!==null&&guard<12);selected=null;paint()},120)};
  const commit=move=>{const next=checkersMove(position,move);if(!next)return;position=next;selected=position.forcedFrom;position.result=checkersResult(position);if(playerMode==="one"&&position.result==="red-won")score("checkers",Store.data.scores.checkers+1);paint();scheduleCpu()};
  const choose=index=>{
    if(position.result!=="playing"||(playerMode==="one"&&position.turn==="b"))return;
    if(selected===null){if(position.board[index]?.toLowerCase()===position.turn){selected=index;paint()}return}
    const move=legalFrom().find(item=>item.to===index);if(move)commit(move);else if(position.forcedFrom===null&&position.board[index]?.toLowerCase()===position.turn){selected=index;paint()}else if(position.forcedFrom===null){selected=null;paint()}
  };
  const paint=()=>{
    position.result=checkersResult(position);const legal=new Set(legalFrom().map(move=>move.to)),board=$("#checkersBoard");setHTML(board,"");
    position.board.forEach((piece,index)=>{const dark=(Math.floor(index/8)+index%8)%2;const glyph=piece?`<span class="checker-piece ${piece.toLowerCase()==="r"?"red":"black"} ${piece===piece.toUpperCase()?"king":""}">${piece===piece.toUpperCase()?"★":""}</span>`:"";const button=el("button",{class:`board-square ${dark?"dark":"light"} ${selected===index?"selected":""} ${legal.has(index)?"legal":""} ${cursor===index?"cursor":""}`,role:"gridcell","aria-label":`${algebraic(index)} ${piece||"empty"}`},glyph);button.onclick=()=>choose(index);board.append(button)});
    $("#checkersControls").textContent=playerMode==="two"?"RED VS BLACK":`YOU: RED · CPU: BLACK · BEST ${Store.data.scores.checkers}`;
    $("#checkersStatus").textContent=position.result==="playing"?`${position.turn==="r"?"RED":"BLACK"} TO MOVE${position.forcedFrom!==null?" · CONTINUE JUMP":selected!==null?` · ${algebraic(selected)} SELECTED`:""}`:boardResultLabel(position.result);
    setHTML($("#checkersHistory"),position.history.length?position.history.map((move,index)=>`<span><b>${index+1}.</b> ${move}</span>`).join(""):`<span class="muted">NO MOVES</span>`);
  };
  const reset=()=>{if(cpuTimer)clearTimeout(cpuTimer);position=initialCheckersState();selected=null;cursor=42;playerMode=$("#checkersPlayers").value;paint()};
  const key=event=>{const r=Math.floor(cursor/8),f=cursor%8;if(event.key==="ArrowUp")cursor=Math.max(0,cursor-8);if(event.key==="ArrowDown")cursor=Math.min(63,cursor+8);if(event.key==="ArrowLeft")cursor=r*8+Math.max(0,f-1);if(event.key==="ArrowRight")cursor=r*8+Math.min(7,f+1);if(event.key==="Enter"||event.key===" ")choose(cursor);if(event.key==="Escape"&&position.forcedFrom===null){selected=null;paint()}if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Enter"," "].includes(event.key)){event.preventDefault();paint()}};
  addEventListener("keydown",key);$("#checkersPlayers").onchange=reset;$("#checkersDifficulty").onchange=reset;$(".gameRestart",host).onclick=reset;
  window.render_game_to_text=()=>JSON.stringify({game:"checkers",mode:position.result,playerMode,difficulty:$("#checkersDifficulty").value,coordinateSystem:"a8 index 0 through h1 index 63",currentPlayer:position.turn,selected:selected===null?null:algebraic(selected),cursor:algebraic(cursor),forcedFrom:position.forcedFrom===null?null:algebraic(position.forcedFrom),legalDestinations:legalFrom().map(move=>algebraic(move.to)),pieces:position.board.map((piece,index)=>piece?{square:algebraic(index),piece}:null).filter(Boolean),history:position.history,result:position.result});
  window.__BOD_BOARD_TEST__={kind:"checkers",load:value=>{position=structuredClone(value);selected=null;paint()},legal:()=>checkersLegalMoves(position),move:value=>{const next=checkersMove(position,value);if(next){position=next;paint()}return!!next},state:()=>structuredClone(position)};
  window.advanceTime=()=>{};reset();return()=>{destroyed=true;if(cpuTimer)clearTimeout(cpuTimer);removeEventListener("keydown",key);delete window.__BOD_BOARD_TEST__};
}

function settingsPage(root) {
  const favoriteOptions = FAVORITE_PAGE_IDS.filter(id => !Store.data.settings.favoriteModules.includes(id)).map(id => {
    const page = PAGES.find(([pageId]) => pageId === id);
    return `<option value="${id}">${page[2]}</option>`;
  }).join("");
  setHTML(root, pageFrame("SETTINGS", "Customize the terminal, Matrix display, layout, and favorite modules.", `<div class="grid">
    <div class="card"><h3>Terminal theme</h3><div class="select-field"><label class="select-label" for="themeSetting">Theme preset</label><select id="themeSetting" class="select-full">${Object.entries(TERMINAL_THEMES).map(([id, theme]) => `<option value="${id}" ${Store.data.settings.terminalTheme === id ? "selected" : ""}>${theme.name}</option>`).join("")}</select></div><label>Custom accent color<input id="accentSetting" type="color" value="${Store.data.settings.accent}" style="height:45px"></label><p class="muted tiny">Changing the preset restores that theme’s matching accent. The color picker can then override it.</p></div>
    <div class="card"><h3>Matrix display</h3><label class="item"><input id="rainSetting" type="checkbox" ${Store.data.settings.rain ? "checked" : ""} style="width:auto"> Digital rain enabled</label><label>Rain brightness <output id="brightnessValue">${Math.round(Store.data.settings.matrixBrightness * 100)}%</output><input id="brightnessSetting" type="range" min=".1" max="1" step=".05" value="${Store.data.settings.matrixBrightness}"></label><label>Rain speed <output id="rainSpeedValue">${Store.data.settings.density.toFixed(1)}×</output><input id="densitySetting" type="range" min=".4" max="2" step=".1" value="${Store.data.settings.density}"></label></div>
    <div class="card"><h3>Interface density</h3><div class="density-options" role="group" aria-label="Interface density"><button data-density="compact" class="${Store.data.settings.uiDensity === "compact" ? "active" : ""}">COMPACT</button><button data-density="comfortable" class="${Store.data.settings.uiDensity === "comfortable" ? "active" : ""}">COMFORTABLE</button></div><p class="muted">Compact mode reduces spacing and control height so more information fits inside the popup.</p></div>
    <div class="card"><h3>Data</h3><p class="muted">Data is stored only for this website origin. Reset permanently deletes notes, tasks, history, settings, favorites, and scores.</p><button id="resetData" class="danger">RESET ALL LOCAL DATA</button></div>
    <div class="card full"><h3>Favorite modules</h3><p class="muted">Favorites appear first in the sidebar and Quick Launch in the order shown here.</p><div class="row wrap"><div class="select-field favorite-picker"><label class="select-label" for="favoriteAddSelect">Module</label><select id="favoriteAddSelect" class="select-full" ${favoriteOptions ? "" : "disabled"}>${favoriteOptions || `<option>All modules added</option>`}</select></div><button id="favoriteAdd" ${favoriteOptions ? "" : "disabled"}>ADD FAVORITE</button></div><div class="favorite-list" id="favoriteList"></div></div>
    <div class="card full"><h3>Storage identity</h3><div class="output">${escapeHtml(location.origin === "null" ? "opaque preview origin" : location.origin)}<br>KEY: ${APP_KEY}</div></div></div>`));
  const paintFavorites = () => {
    const list = $("#favoriteList");
    const favorites = Store.data.settings.favoriteModules;
    setHTML(list, favorites.length ? favorites.map((id, index) => {
      const [, icon, name] = PAGES.find(([pageId]) => pageId === id);
      return `<div class="favorite-item"><span class="grow">★ ${icon} ${name}</span><button data-favorite-up="${index}" ${index === 0 ? "disabled" : ""} aria-label="Move ${name} up">↑</button><button data-favorite-down="${index}" ${index === favorites.length - 1 ? "disabled" : ""} aria-label="Move ${name} down">↓</button><button data-favorite-remove="${id}" aria-label="Remove ${name} from favorites">REMOVE</button></div>`;
    }).join("") : `<div class="organizer-empty">NO FAVORITE MODULES YET</div>`);
    $$("[data-favorite-up]", list).forEach(button => button.onclick = () => {
      const index = Number(button.dataset.favoriteUp);
      [favorites[index - 1], favorites[index]] = [favorites[index], favorites[index - 1]];
      Store.save(); paintFavorites(); refreshNavigation();
    });
    $$("[data-favorite-down]", list).forEach(button => button.onclick = () => {
      const index = Number(button.dataset.favoriteDown);
      [favorites[index + 1], favorites[index]] = [favorites[index], favorites[index + 1]];
      Store.save(); paintFavorites(); refreshNavigation();
    });
    $$("[data-favorite-remove]", list).forEach(button => button.onclick = () => {
      Store.data.settings.favoriteModules = favorites.filter(id => id !== button.dataset.favoriteRemove);
      Store.save(); navigate("settings"); refreshNavigation();
    });
  };
  paintFavorites();
  $("#rainSetting").onchange = e => Store.update("settings.rain", e.target.checked);
  $("#brightnessSetting").oninput = e => {
    Store.update("settings.matrixBrightness", Number(e.target.value));
    $("#brightnessValue").textContent = `${Math.round(Number(e.target.value) * 100)}%`;
    applyAppearance();
  };
  $("#densitySetting").oninput = e => {
    Store.update("settings.density", Number(e.target.value));
    $("#rainSpeedValue").textContent = `${Number(e.target.value).toFixed(1)}×`;
  };
  $("#themeSetting").onchange = e => {
    Store.data.settings.terminalTheme = e.target.value;
    Store.data.settings.accent = TERMINAL_THEMES[e.target.value].accent;
    Store.save(); applyAppearance();
    $("#accentSetting").value = Store.data.settings.accent;
  };
  $("#accentSetting").oninput = e => { Store.update("settings.accent", e.target.value); applyAppearance(); };
  $$("[data-density]", root).forEach(button => button.onclick = () => {
    Store.update("settings.uiDensity", button.dataset.density);
    applyAppearance();
    $$("[data-density]", root).forEach(item => item.classList.toggle("active", item === button));
  });
  $("#favoriteAdd").onclick = () => {
    const id = $("#favoriteAddSelect").value;
    if (!FAVORITE_PAGE_IDS.includes(id) || Store.data.settings.favoriteModules.includes(id)) return;
    Store.data.settings.favoriteModules.push(id); Store.save(); navigate("settings"); refreshNavigation();
  };
  $("#resetData").onclick = resetAll;
}

function resetAll() {
  if (!confirm("Delete all Bookmarklet of Destiny data saved on this site?")) return;
  Store.reset(); applyAppearance(); refreshNavigation(); toast("Local data reset"); navigate("home");
}

function helpPage(root) {
  setHTML(root, pageFrame("HELP & SHORTCUTS", "Operational notes for the dashboard.", `<div class="grid"><div class="card"><h3>Global controls</h3><div class="list"><div class="item"><kbd>Ctrl/⌘ K</kbd><span>Command palette</span></div><div class="item"><kbd>Esc</kbd><span>Close palette / exit fullscreen</span></div><div class="item"><kbd>F</kbd><span>Fullscreen active canvas game</span></div></div></div>
    <div class="card"><h3>Game controls</h3><div class="list"><div class="item"><kbd>WASD / Arrows</kbd><span>Snake, 2048, Pong, Tron, Breakout, Invaders</span></div><div class="item"><kbd>Space / P</kbd><span>Pause or shoot where shown</span></div><div class="item"><kbd>Q / E / Enter / Shift</kbd><span>Two-player Minesweeper open and flag</span></div><div class="item"><kbd>Right click</kbd><span>Flag a Minesweeper cell</span></div></div></div>
    <div class="card full"><h3>Expanded Arcade</h3><p class="muted">Twelve offline games include full-rule Chess, American Checkers, Breakout, Connect Four, Tron, Space Invaders, and Memory Match. Chess and Checkers support CPU and local two-player modes.</p></div>
    <div class="card full"><h3>Calendar tools</h3><p class="muted">Browse a Sunday-first monthly calendar, compare dates, add or subtract whole days, and calculate age using local calendar dates.</p></div>
    <div class="card full"><h3>World Clock</h3><p class="muted">Save live IANA time zones and convert a chosen local date and time with daylight-saving gap and overlap detection.</p></div>
    <div class="card full"><h3>Color Tools</h3><p class="muted">Convert HEX, RGB, and HSL; generate palettes; check WCAG contrast; and preview approximate color-vision simulations.</p></div>
    <div class="card full"><h3>Developer Tools</h3><p class="muted">Test regular expressions, generate secure hashes, inspect JWT data, preview safe Markdown, and experiment with sanitized HTML and CSS.</p></div>
    <div class="card full"><h3>Page Inspector</h3><p class="muted">Inspect the opener page title, URL, headings, links, images, scripts, DOM counts, and selected elements without modifying page content.</p></div>
    <div class="card full"><h3>Notes & Tasks</h3><p class="muted">Create searchable Markdown notes with tags, pins, archive and trash, plus prioritized tasks with local due dates and JSON backup.</p></div>
    <div class="card full"><h3>Customization</h3><p class="muted">Choose a Matrix, amber, cyan, or violet terminal theme; adjust digital-rain brightness and speed; switch between comfortable and compact layouts; and arrange favorite modules at the top of navigation and Quick Launch.</p></div>
    <div class="card full"><h3>Browser limitations</h3><p class="muted">Chrome blocks bookmarklets on protected pages including <code>chrome://</code>, the New Tab page, extension pages, and the Chrome Web Store. On ordinary sites, the dashboard opens in a separate resizable popup window.</p></div>
    <div class="card full"><h3>Privacy</h3><p class="muted">Only the optional USD/INR updater contacts the fixed Frankfurter exchange-rate endpoint. All other tools load no external assets and use no analytics or accounts. Notes, tasks, settings, history, rates, and scores stay in local storage belonging to the page where the bookmarklet launched.</p></div></div>`));
}

Store.load();
renderShell();
installCurrencySync();
bootstrap?.ready?.();
