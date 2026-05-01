# Even Realities Projects

Central workspace for Even Realities experiments, apps, shared code, and project notes.

## Repository Shape

```text
.
├── docs/                  # Cross-project notes, decisions, and references
├── projects/              # One folder per Even Realities project
│   ├── even-starter/      # Current SDK starter app
│   ├── terminal-session/  # Live terminal window renderer for G2 glasses
│   └── tmux-glasses/      # Minimal tmux pane mirror for G2 glasses
├── shared/                # Reusable code, assets, or config used by multiple projects
├── package.json           # npm workspace entrypoint and root scripts
└── package-lock.json      # Single lockfile for the workspace
```

## Prerequisites

- Node.js `20.12+` LTS or `22.13+`
- npm
- Optional for hardware testing: Even Realities app and G2 glasses

## Install

```bash
npm install
```

## Work On The Starter

Start the starter web app from the repo root:

```bash
npm run dev:starter
```

In another terminal, open the simulator:

```bash
npm run sim:starter
```

Create a QR code for sideloading:

```bash
npm run qr:starter
```

Build and package the starter:

```bash
npm run pack:starter
```

## Work On The Terminal Renderer

Start the terminal renderer web app from the repo root:

```bash
npm run dev:terminal
```

Start the host bridge for a live local shell window:

```bash
npm run bridge:terminal
```

After connecting the bridge in the browser, click `Start Keyboard Capture` to use your PC keyboard as live terminal input.

In another terminal, open the simulator:

```bash
npm run sim:terminal
```

Build and package the terminal renderer:

```bash
npm run pack:terminal
```

## Work On The tmux Renderer

Start the tmux glasses web app from the repo root:

```bash
npm run dev:tmux
```

Start the local tmux capture bridge in another terminal:

```bash
npm run bridge:tmux
```

The bridge creates or reuses a dedicated `even-glasses` tmux session at the default `42x9` viewport. Open the simulator in another terminal:

```bash
npm run sim:tmux
```

Build and package the tmux renderer:

```bash
npm run pack:tmux
```

## Work On Every Project

Run each workspace build:

```bash
npm run build
```

Package every project that defines a `pack` script:

```bash
npm run pack
```

## Add A Project

1. Create `projects/<project-name>/`.
2. Add a project-level `package.json`, `app.json`, and source files.
3. Use a unique `name` in `package.json` and a unique `package_id` in `app.json`.
4. Add root convenience scripts only for projects you run often.
5. Put reusable code in `shared/` once at least two projects need it.
