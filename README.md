# Bookmarklet of Destiny

A self-contained Chrome bookmarklet that opens a centered popup dashboard with Matrix rain, productivity tools, calendar and date calculators, page controls, and ten games. The popup stays compact so the current browser tab remains visible behind it.

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
- Local two-player modes in Snake, Minesweeper, Tic-Tac-Toe, Pong, Connect Four, Tron, and Memory

## Install

```sh
npm install
npm run build
npm run dev
```

Open <http://127.0.0.1:4173>, then:

1. Drag **Launch Destiny** to Chrome’s bookmarks bar.
2. Open a normal website such as Google Search or Wikipedia.
3. Click **Launch Destiny** in the bookmarks bar.

It is designed to run on most ordinary websites. Chrome itself blocks bookmarklets on New Tab, `chrome://`, extension pages, and the Chrome Web Store; those are the expected exceptions. Use **Test Launch** on the installer to verify the resizable popup.

## Development

- `preview.html` is the complete development preview.
- `index.html` is the generated installation page and GitHub Pages entry point.
- `src/app.js` and `src/styles.css` are the editable sources.
- `npm test` rebuilds and runs artifact, Chrome, popup, persistence, utility, and game smoke tests.

Saved notes, tasks, settings, history, and scores use versioned `localStorage`. Because bookmarklets run in the current page’s origin, saved data is separate for each website.

Chrome does not permit bookmarklets on protected pages such as `chrome://`, the New Tab page, extension pages, or the Chrome Web Store.

All tools work offline. When internet access is available, the USD/INR converter checks the fixed [Frankfurter](https://frankfurter.dev/) exchange-rate endpoint at most once every 12 hours and caches the latest daily reference rate. No API key, account, analytics, or other external requests are used.
