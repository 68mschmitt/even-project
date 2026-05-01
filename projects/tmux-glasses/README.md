# tmux Glasses

Minimal Even Hub app that mirrors a local tmux pane into the Even Realities G2 viewport.

The basic approach is deliberately small: a host bridge polls `tmux capture-pane`, crops the output to `57x10`, streams it over Server-Sent Events, and the Even app writes those rows into one full-screen text container. The glasses get only terminal text, no UI chrome, so the viewport stays readable.

## Run From Repo Root

```bash
npm install
npm run dev:tmux
npm run bridge:tmux
npm run sim:tmux
```

The app defaults to `http://localhost:8766` for the local bridge.

For phone or hardware testing, expose the bridge on your LAN and enter the LAN URL in the app:

```bash
HOST=0.0.0.0 npm run bridge:tmux
```

## tmux Target

By default the bridge creates or reuses a dedicated `even-glasses` tmux session at `57x10`:

```bash
npm run bridge:tmux
tmux attach -t even-glasses
```

When the bridge creates that dedicated session, it launches the shell with a per-session prompt of `$ `. This does not edit your host shell config or change prompts outside the tmux session.

If `even-glasses` already exists, it keeps the prompt it started with. Recreate that tmux session, or use a different `TMUX_SESSION`, to pick up the dedicated prompt.

Override the dedicated session prompt if needed:

```bash
TMUX_PROMPT='> ' npm run bridge:tmux
```

To mirror an existing session or pane without resizing it, pass a target:

```bash
TMUX_TARGET=my-session:0.1 npm run bridge:tmux
```

Override the viewport if needed, but `57x10` is the intended readable default for the 576x288 glasses text area:

```bash
TMUX_COLS=48 TMUX_ROWS=9 npm run bridge:tmux
```

## Text Test Card

Send a held ASCII test card into the captured tmux session to confirm the text bounds:

```bash
npm run pattern:tmux
```

The card fills the configured tmux viewport and stays on screen until you press `Ctrl-C` in that tmux pane. To target a different pane:

```bash
TMUX_TARGET=my-session:0.1 npm run pattern:tmux
```

## Run From This Project

```bash
npm run dev
npm run bridge
npm run sim
```

## Build And Package

```bash
npm run build
npm run pack
```

`npm run pack` builds `dist/` and creates `tmux-glasses.ehpk` using `app.json`.
