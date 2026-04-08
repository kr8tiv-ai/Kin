# KIN Companion — Desktop Menu Bar App

A system tray menu bar app that loads the KIN web interface in a compact
frameless window. Built with [Tauri v2](https://v2.tauri.app/).

## How It Works

- The app lives in your system tray with the KIN icon
- **Left-click** the tray icon to toggle the companion window
- **Close** the window to hide it — the tray keeps running
- The window loads `http://localhost:3001` in development or the production
  URL when built for release

## Prerequisites

1. **Node.js** ≥ 18
2. **Rust** toolchain — install via [rustup](https://rustup.rs/):
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. **System dependencies** (Linux only):
   ```bash
   sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
   ```

## Getting Started

```bash
# 1. Install Node dependencies
cd desktop
npm install

# 2. Start the web dev server (in another terminal)
cd ../web
npm run dev

# 3. Run the desktop app in dev mode
cd ../desktop
npm run dev
```

The app opens in development mode pointing at `http://localhost:3001`.

## Production Build

```bash
cd desktop
npm run build
```

The bundled application is written to `desktop/src-tauri/target/release/bundle/`.

## Project Structure

```
desktop/
├── package.json              Node scripts for Tauri CLI
├── README.md                 This file
└── src-tauri/
    ├── Cargo.toml            Rust dependencies
    ├── tauri.conf.json       App config (window, tray, bundle)
    ├── build.rs              Tauri build script
    ├── icons/                App icons (copied from web/public/icons/)
    └── src/
        ├── main.rs           Entry point
        └── lib.rs            Tray setup, window toggle, plugin registration
```

## Configuration

Edit `src-tauri/tauri.conf.json` to change:

| Key | Purpose |
|-----|---------|
| `build.devUrl` | Dev server URL (default: `http://localhost:3001`) |
| `app.windows[0].width/height` | Window dimensions (default: 400 × 600) |
| `app.trayIcon.tooltip` | Tray hover text |
| `bundle.identifier` | macOS/Windows bundle ID (`com.kr8tiv.kin`) |

## Connecting to the API

The embedded webview loads the same Next.js frontend, which proxies API calls
to `http://localhost:3002` via Next.js rewrites. No additional configuration
is needed — the desktop app uses the same API as the browser.
