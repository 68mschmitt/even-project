# Even Starter

Minimal Vite + TypeScript starter for building an Even Hub plugin for Even Realities G2 glasses.

## Run From Repo Root

```bash
npm install
npm run dev:starter
npm run sim:starter
```

For sideloading to a phone, update the URL in `package.json` or run the CLI directly with your LAN IP:

```bash
npx evenhub qr --url "http://YOUR_LAN_IP:5173"
```

## Run From This Project

```bash
npm run dev
npm run sim
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
