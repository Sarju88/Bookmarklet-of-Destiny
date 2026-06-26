import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("bookmarklet is generated and self-contained", async () => {
  const value = await readFile("dist/bookmarklet.txt", "utf8");
  assert.ok(value.startsWith("javascript:"));
  assert.ok(value.length > 10000);
  const source = decodeURIComponent(value.slice("javascript:".length));
  assert.equal(/XMLHttpRequest|WebSocket|src=["']https?:|href=["']https?:/.test(source), false);
  assert.match(source, /https:\/\/api\.frankfurter\.dev\/v2\/rates\?base=USD&quotes=INR/);
  assert.equal((source.match(/api\.frankfurter\.dev/g) || []).length, 1);
  assert.equal(/document\.write|\.srcdoc|eval\(|createObjectURL|new Blob/.test(source), false);
  assert.equal(/new Function|Function\(["'`]/.test(source), false);
  assert.match(source, /DECODE ONLY/);
  assert.match(source, /SCRATCHPAD/);
  assert.match(source, /PAGE INSPECTOR/);
  assert.match(source, /AMERICAN CHECKERS/);
  assert.match(source, /Promote pawn/);
  assert.match(source, /Amber Terminal/);
  assert.match(source, /matrixBrightness/);
  assert.match(source, /favoriteModules/);
  assert.match(source, /window\.open\("",popupName,features\)/);
  assert.match(source, /popupName="bookmarkletOfDestiny"/);
  assert.match(source, /resizeTo/);
  assert.match(source, /moveTo/);
  assert.match(source, /popup=yes/);
  assert.match(source, /innerWidth/);
  assert.match(source, /screenX/);
  assert.match(source, /__bookmarkletOfDestinyPopup/);
  assert.match(source, /replaceChildren/);
});

test("install and preview pages expose expected entry points", async () => {
  const [install, preview] = await Promise.all([
    readFile("index.html", "utf8"),
    readFile("preview.html", "utf8")
  ]);
  assert.match(install, /LAUNCH DESTINY/);
  assert.match(install, /COPY BOOKMARKLET/);
  assert.match(install, /TEST LAUNCH/);
  assert.match(install, /New Tab/);
  assert.match(install, /Frankfurter/);
  assert.match(preview, /id="app"/);
  assert.match(preview, /Bookmarklet of Destiny/);
});
