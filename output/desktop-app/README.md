Business Email — Desktop wrapper

What this is
- Minimal Electron app that provides a GUI to start/stop the existing orchestrator and run the flows (scrape → preview → send).

How to run (dev)
1. Install dependencies
```bash
cd output/desktop-app
npm install
```
2. Run in dev
```bash
npm start
```

How to build a Windows executable
- Building on Linux requires `wine` for a full Windows build. It's easier to use CI (GitHub Actions) to build Windows artifacts.

Notes
- The app expects the orchestrator script to live at `output/orchestrator/server.js` relative to the repo root. The GUI will spawn that script.
