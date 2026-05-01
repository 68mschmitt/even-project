# Even Realities SDK Starter

Minimal Vite + TypeScript starter for building an Even Hub plugin for Even Realities G2 glasses.

## Prerequisites

- Node.js `20.12+` LTS or `22.13+`
- npm
- Optional for hardware testing: Even Realities app and G2 glasses

## Install

```bash
npm install
```

## Run Locally

Start the web app:

```bash
npm run dev
```

In another terminal, open the simulator:

```bash
npm run sim
```

For sideloading to a phone, update the URL in `package.json` or run the CLI directly with your LAN IP:

```bash
npx evenhub qr --url "http://YOUR_LAN_IP:5173"
```

## Build And Package

```bash
npm run build
npm run pack
```

`npm run pack` builds `dist/` and creates `even-starter.ehpk` using `app.json`.

## Project Shape

- `src/main.ts` initializes the Even bridge, creates a startup text container, and handles press/swipe events.
- `app.json` is the Even Hub manifest used by `evenhub pack`.
- `vite.config.ts` serves the app on port `5173`, matching the simulator command.
