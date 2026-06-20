# Bookmarklet-of-Destiny
# Bookmarklet of Destiny

Bookmarklet of Destiny is a self-contained Chrome bookmarklet that opens a compact Matrix-themed utility dashboard over almost any website. It requires no extension, account, installation, external server, or permissions.

The dashboard opens in a separate resizable popup, allowing the original browser tab to remain visible.

## Features

### Productivity Tools

- Scientific calculator with history
- Notes and todo list
- Timer, stopwatch, alarms, and Pomodoro mode
- Unit converters
- Text counters and case conversion
- Base64 and URL encoding
- JSON formatter
- Password and UUID generators
- Dice, coin flip, and random picker
- QR-code generator
- Drawing pad with image download

### Page Controls

Modify the website from which the dashboard was opened:

- Dark mode
- Editable page mode
- Hide images
- Invert and grayscale filters
- Remove overlays
- Reset reversible changes

### Games

- Snake
- 2048
- Minesweeper
- Tic-Tac-Toe
- Pong

Games include keyboard controls, restarting, pausing where applicable, and locally saved high scores.

## Installation

1. Open the Bookmarklet of Destiny installation page.
2. Drag **Launch Destiny** to Chrome’s bookmarks bar.
3. Open an ordinary website such as Google, Wikipedia, Gmail, or YouTube.
4. Click **Launch Destiny** in the bookmarks bar.

The installer also provides **Copy Bookmarklet** and **Test Launch** controls.

## Browser Limitations

Chrome does not allow bookmarklets to run on protected pages, including:

- New Tab
- `chrome://` pages
- Chrome Web Store
- Extension pages

Open a normal `http://` or `https://` website before launching it.

## Privacy and Offline Operation

Bookmarklet of Destiny:

- Makes no network requests
- Uses no analytics
- Requires no account
- Loads no external assets
- Requests no browser permissions
- Stores data locally in the browser

Notes, todos, settings, histories, and scores use versioned `localStorage`. Because bookmarklets run under the current website’s origin, saved data may be separate for each website.

## Development

```sh
npm install
npm run build
npm run dev
