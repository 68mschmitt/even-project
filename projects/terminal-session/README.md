# Terminal Session

Even Hub app for rendering a terminal-style session buffer on Even Realities G2 glasses.

The glasses app is browser-safe by itself: it can render commands, demo output, and pasted terminal output. For a live local shell, run the included host bridge and connect to it from the app.

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
- On the glasses, tap to jump to the live tail and swipe up/down to scroll history.

## Build And Package

```bash
npm run build
npm run pack
```

`npm run pack` builds `dist/` and creates `terminal-session.ehpk` using `app.json`.
