import { build } from "esbuild";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["chrome120"],
  outfile: "dist/app.bundle.js"
});

const [script, css] = await Promise.all([
  readFile("dist/app.bundle.js", "utf8"),
  readFile("src/styles.css", "utf8")
]);

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bookmarklet of Destiny</title><style>${css}</style></head><body><div id="app"></div><script>${script.replaceAll("</script", "<\\/script")}</script></body></html>`;
const launcher = `(function(){var key="__bookmarkletOfDestinyPopup",storeKey="bookmarklet-of-destiny:v1";function clamp(n,min,max){return Math.min(max,Math.max(min,Number(n)||0))}function defaults(){var w=Math.min(820,Math.max(620,screen.availWidth*.68)),h=Math.min(660,Math.max(500,screen.availHeight*.72));return{width:Math.round(w),height:Math.round(h),left:Math.max(0,Math.round((screen.availWidth-w)/2)),top:Math.max(0,Math.round((screen.availHeight-h)/2))}}function readLayout(){var d=defaults();try{var data=JSON.parse(localStorage.getItem(storeKey)||"{}"),l=data&&data.settings&&data.settings.popupLayout;if(l){d.width=Math.round(clamp(l.width,620,Math.min(1200,screen.availWidth)));d.height=Math.round(clamp(l.height,500,Math.min(900,screen.availHeight)));d.left=Math.round(clamp(l.left,0,Math.max(0,screen.availWidth-d.width)));d.top=Math.round(clamp(l.top,0,Math.max(0,screen.availHeight-d.height)))}}catch(e){}return d}function saveLayout(win){try{var data=JSON.parse(localStorage.getItem(storeKey)||"{\\"version\\":1,\\"settings\\":{}}");data.version=1;data.settings=data.settings||{};data.settings.popupLayout={width:Math.round(clamp(win.outerWidth||win.innerWidth,620,Math.min(1200,screen.availWidth))),height:Math.round(clamp(win.outerHeight||win.innerHeight,500,Math.min(900,screen.availHeight))),left:Math.round(clamp(win.screenX||0,0,Math.max(0,screen.availWidth-(win.outerWidth||win.innerWidth||620)))),top:Math.round(clamp(win.screenY||0,0,Math.max(0,screen.availHeight-(win.outerHeight||win.innerHeight||500))))};localStorage.setItem(storeKey,JSON.stringify(data))}catch(e){}}var live=window[key],layout=readLayout();if(live&&!live.closed){live.focus();try{live.resizeTo(layout.width,layout.height);live.moveTo(layout.left,layout.top)}catch(e){}return}var pw=layout.width,ph=layout.height,px=layout.left,py=layout.top,features=["popup=yes","width="+Math.round(pw),"height="+Math.round(ph),"innerWidth="+Math.round(pw),"innerHeight="+Math.round(ph),"left="+px,"top="+py,"screenX="+px,"screenY="+py,"resizable=yes","scrollbars=yes","toolbar=no","location=no","menubar=no","status=no","directories=no"].join(","),popupName="bookmarkletOfDestiny",w=window.open("",popupName,features);if(!w)return;try{w.resizeTo(Math.round(pw),Math.round(ph));w.moveTo(px,py)}catch(e){}window[key]=w;try{var d=w.document;d.head.replaceChildren();d.body.replaceChildren();d.documentElement.style.cssText="width:100%;height:100%;margin:0;overflow:hidden;background:#020704";d.body.style.cssText="width:100%;height:100%;margin:0;overflow:hidden";d.title="Bookmarklet of Destiny";var meta=d.createElement("meta");meta.name="viewport";meta.content="width=device-width,initial-scale=1";d.head.append(meta);var style=d.createElement("style");style.textContent=${JSON.stringify(css)};d.head.append(style);var mount=d.createElement("div");mount.id="app";d.body.append(mount);var normal=null,layoutTimer=0,saveDebounce=0;function queueSave(){clearTimeout(saveDebounce);saveDebounce=setTimeout(function(){saveLayout(w)},250)}var controls={mode:"popup",target:window,host:w,mount:mount,root:d,restore:function(){w.focus();if(normal){try{w.resizeTo(normal.width,normal.height)}catch(e){}normal=null;queueSave()}},minimize:function(on){try{if(on){normal={width:w.outerWidth,height:w.outerHeight};w.resizeTo(430,120)}else if(normal){w.resizeTo(normal.width,normal.height);normal=null;queueSave()}}catch(e){}},startDrag:function(){},startResize:function(){},resetLayout:function(){try{var data=JSON.parse(localStorage.getItem(storeKey)||"{}");if(data.settings)delete data.settings.popupLayout;localStorage.setItem(storeKey,JSON.stringify(data))}catch(e){}},close:function(){try{saveLayout(w);clearInterval(layoutTimer);w.close()}finally{delete window[key]}},ready:function(){d.documentElement.dataset.ready="1";queueSave();layoutTimer=setInterval(function(){if(w.closed){clearInterval(layoutTimer);delete window[key]}else saveLayout(w)},1500)}};w.addEventListener("resize",queueSave);w.addEventListener("beforeunload",function(){saveLayout(w);clearInterval(layoutTimer)});window.__BOD_BOOTSTRAP__=controls;try{(function(window,document,localStorage,location,navigator,crypto,TextEncoder,performance,devicePixelRatio,innerWidth,innerHeight,requestAnimationFrame,cancelAnimationFrame,addEventListener,removeEventListener,getComputedStyle,confirm,parent,ResizeObserver){${script}})(w,d,w.localStorage,w.location,w.navigator,w.crypto,w.TextEncoder,w.performance,w.devicePixelRatio,w.innerWidth,w.innerHeight,w.requestAnimationFrame.bind(w),w.cancelAnimationFrame.bind(w),w.addEventListener.bind(w),w.removeEventListener.bind(w),w.getComputedStyle.bind(w),w.confirm.bind(w),w.parent,w.ResizeObserver)}finally{delete window.__BOD_BOOTSTRAP__}w.focus()}catch(error){try{w.close()}catch(e){}delete window[key];console.error(error)}})()`;
const bookmarkletSource = launcher
  .replaceAll("%", "%25")
  .replaceAll("#", "%23")
  .replaceAll("\n", "%0A")
  .replaceAll("\r", "%0D");
const bookmarklet = `javascript:${bookmarkletSource}`;

await writeFile("dist/bookmarklet.txt", bookmarklet);
await writeFile("preview.html", html);

const escaped = JSON.stringify(bookmarklet);
const install = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install Bookmarklet of Destiny</title><style>
:root{color-scheme:dark;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#020704;color:#b7ffd1}
*{box-sizing:border-box}body{margin:0;width:100vw;min-height:100vh;overflow:hidden;display:grid;place-items:center;background:radial-gradient(circle at 50% 0,#0b2e1b,#020704 52%);padding:24px}
main{width:min(820px,100%);min-width:0;border:1px solid #1cff70;background:#04100ad9;box-shadow:0 0 60px #00ff6630;padding:clamp(24px,5vw,56px)}
.eyebrow{color:#56ff94;letter-spacing:.22em;text-transform:uppercase}h1{font-size:clamp(36px,7vw,72px);line-height:.95;margin:18px 0;text-shadow:0 0 18px #00ff66}
p{line-height:1.65;color:#91cda5}.steps{display:grid;gap:8px;margin:22px 0;padding:18px 18px 18px 42px;border:1px solid #174e2b;background:#020805}.steps li{padding-left:6px;color:#b7ffd1}.warning{border:1px solid #b6812b;background:#211604;color:#ffd98a;padding:14px;line-height:1.5}.actions{display:flex;gap:14px;flex-wrap:wrap;margin:24px 0}
a,button{appearance:none;border:1px solid #22ff79;background:#071c10;color:#caffd9;padding:14px 20px;font:inherit;cursor:pointer;text-decoration:none;box-shadow:inset 0 0 20px #00ff6612}
a:hover,button:hover{background:#0e3a20}.status{min-height:24px;color:#66ff9d}.small{font-size:13px;color:#588a68}
code{display:block;width:100%;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:14px;border:1px solid #174e2b;background:#010402;color:#4ba66b}
</style></head><body><main><div class="eyebrow">self-contained system utility</div><h1>BOOKMARKLET<br>OF DESTINY</h1>
<ol class="steps"><li>Drag <b>Launch Destiny</b> to Chrome’s bookmarks bar.</li><li>Open a normal website such as Google Search, Wikipedia, or YouTube.</li><li>Click <b>Launch Destiny</b> to open its separate popup window.</li></ol>
<div class="warning"><b>Important:</b> Chrome blocks bookmarklets on New Tab, <code style="display:inline;width:auto;padding:2px 5px">chrome://</code>, extension pages, and the Chrome Web Store.</div>
<div class="actions"><a id="install" draggable="true">⚡ LAUNCH DESTINY</a><button id="copy">COPY BOOKMARKLET</button><a id="testLaunch">TEST LAUNCH</a><a href="preview.html">OPEN PREVIEW</a></div>
<p class="small">All tools work offline. When connected, only the USD/INR converter contacts Frankfurter for a daily reference rate, at most once every 12 hours.</p>
<div class="status" id="status"></div><code id="value"></code>
<script>const value=${escaped};install.href=value;testLaunch.href=value;document.querySelector("#value").textContent=value;copy.onclick=async()=>{try{await navigator.clipboard.writeText(value);status.textContent="COPIED — PASTE IT INTO A BOOKMARK URL"}catch{status.textContent="COPY FAILED — create a bookmark and paste manually"}};</script>
</main></body></html>`;
await writeFile("index.html", install);
await rm("install.html", { force: true });

console.log(`Built ${script.length.toLocaleString()} byte app bundle`);
console.log(`Built ${bookmarklet.length.toLocaleString()} character bookmarklet`);
