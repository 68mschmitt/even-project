# Terminal Session

Even Hub app for live-rendering a bridged terminal window on Even Realities G2 glasses.

The glasses app is browser-safe by itself: it can render commands, demo output, and pasted terminal output. For a live local shell, run the included host bridge and connect to it from the app. The bridge parses shell output through a headless terminal emulator and streams viewport snapshots, so the glasses mirror the terminal screen instead of just appending output lines.

## Run From Repo Root

```bash
npm install
npm run dev:terminal
npm run sim:terminal
```

Start the optional local shell bridge in another terminal:

```bash
npm run bridge:terminal
```

The app defaults to `http://localhost:8765`. For phone testing, run the bridge on your LAN and enter the LAN URL in the app:

```bash
HOST=0.0.0.0 npm run bridge:terminal
```

The bridge defaults to a `42x9` terminal viewport to match the glasses renderer. Override it when needed:

```bash
TERM_COLS=48 TERM_ROWS=10 npm run bridge:terminal
```

Only run the bridge on trusted networks. It exposes shell input over HTTP for local development.

## Run From This Project

```bash
npm run dev
npm run sim
npm run bridge
```

## Use It

- Type `demo` in the command box to render sample terminal output.
- Type `help`, `date`, `pwd`, `whoami`, `echo hello`, or `clear` for local rendered commands.
- Paste real terminal output into the output box to mirror it on the glasses.
- Connect the host bridge, then use the command box to send commands to a live local shell.
- Click `Start Keyboard Capture` after connecting the bridge to type directly into the shell with your PC keyboard.
- Keyboard capture forwards printable keys, Enter, Backspace, Tab, Escape, arrows, Home/End, Delete, PageUp/PageDown, Ctrl key combos, and pasted text.
- While connected, the glasses render the latest terminal viewport snapshot from the bridge.
- On the glasses, tap to jump to the live tail and swipe up/down to scroll history.

## Build And Package

```bash
npm run build
npm run pack
```

`npm run pack` builds `dist/` and creates `terminal-session.ehpk` using `app.json`.
