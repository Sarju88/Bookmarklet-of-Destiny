# Bookmarklet of Destiny

A self-contained Chrome bookmarklet that opens a centered popup dashboard with Matrix rain, productivity tools, calendar and date calculators, page controls, and twelve games. The popup stays compact so the current browser tab remains visible behind it.

## Included Tools

- Scientific calculator, multi-note Markdown workspace, enhanced tasks, timers, alarms, and Pomodoro
- Searchable notes with tags, pins, archive/trash, safe preview, and JSON backup/import
- Prioritized tasks with optional due dates and status filters
- Sunday-first monthly calendar
- Days-between, add/subtract days, and age calculators
- Saved world clocks and daylight-saving-aware time-zone conversion
- HEX/RGB/HSL conversion, palettes, WCAG contrast, and color-vision previews
- Regex testing, secure text/file hashes, JWT inspection, safe Markdown, and an isolated HTML/CSS scratchpad
- Unit and USD/INR conversion
- Text, random, QR, drawing, and page-control tools
- Snake Battle, 2048, Minesweeper Race, Tic-Tac-Toe, Pong, Breakout, Connect Four, Tron, Space Invaders, and Memory Match
- Full-rule Chess and American Checkers with offline CPU and local two-player play
- Local two-player modes in Snake, Minesweeper, Tic-Tac-Toe, Pong, Connect Four, Tron, and Memory
- Four terminal themes, adjustable Matrix brightness and speed, compact/comfortable layouts, and reorderable favorite modules

## Install

Open the [Bookmarklet of Destiny installation page](https://sarju88.github.io/Bookmarklet-of-Destiny/), then:

1. Drag **Launch Destiny** to Chrome’s bookmarks bar.
2. Open a normal website such as Google Search or Wikipedia.
3. Click **Launch Destiny** in the bookmarks bar.

That is all—nothing needs to be downloaded or installed. It works on most ordinary websites. Chrome blocks bookmarklets on New Tab, `chrome://`, extension pages, and the Chrome Web Store; those are the expected exceptions. Use **Test Launch** on the installation page to verify the popup.

Note: Bookmarklet of Destiny has only been tested on macOS.

## If It Opens as a Tab Instead of a Popup

If **Launch Destiny** opens in a new tab instead of a small popup window, use this checklist:

- Confirm you installed the latest **Launch Destiny** bookmarklet from the [installation page](https://sarju88.github.io/Bookmarklet-of-Destiny/).
- Delete the old bookmarklet from your bookmarks bar, then drag or copy the newest one again.
- Test from a normal website such as Google Search, Wikipedia, or YouTube. It will not run from New Tab, `chrome://`, extension pages, or the Chrome Web Store.
- Exit Chrome full screen with `Control + Command + F`.
- On macOS, open System Settings → Desktop & Dock → Windows, then set “Prefer tabs when opening documents” to `Never` or `Manually`, not `Always`.
- Fully quit Chrome with `Command + Q`, reopen it, and test again.
- To check whether Chrome itself is forcing popups into tabs, create a temporary bookmark with this URL:

  ```js
  javascript:window.open('https://example.com','popup_test','popup=yes,width=420,height=260,left=100,top=100,toolbar=no,location=no,menubar=no,status=no,resizable=yes,scrollbars=yes')
  ```

If that tiny popup test also opens as a tab, the issue is Chrome or macOS behavior, not Bookmarklet of Destiny.

## Development

- `preview.html` is the complete development preview.
- `index.html` is the generated installation page and GitHub Pages entry point.
- `src/app.js` and `src/styles.css` are the editable sources.

Saved notes, tasks, settings, history, and scores use versioned `localStorage`. Because bookmarklets run in the current page’s origin, saved data is separate for each website.

Chrome does not permit bookmarklets on protected pages such as `chrome://`, the New Tab page, extension pages, or the Chrome Web Store.

All tools work offline. When internet access is available, the USD/INR converter checks the fixed [Frankfurter](https://frankfurter.dev/) exchange-rate endpoint at most once every 12 hours and caches the latest daily reference rate. No API key, account, analytics, or other external requests are used.
