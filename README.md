<p align="center">
  <img src="icons/icon.png" alt="CesaFlow IDE" width="80" />
</p>

<h1 align="center">CesaFlow IDE</h1>

<p align="center">
  <strong>The AI-native code editor. 4 agents. One command. Ship in minutes.</strong>
</p>

<p align="center">
  <a href="https://cesaflow.ai">Website</a> ·
  <a href="https://github.com/CesaFlowai/cesa-flow-ide/releases">Download</a> ·
  <a href="https://docs.cesaflow.ai">Docs</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/VS%20Code-1.87.2-blue?style=flat-square" />
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" />
  <img src="https://img.shields.io/badge/Telemetry-None-green?style=flat-square" />
  <img src="https://img.shields.io/badge/License-MIT-purple?style=flat-square" />
</p>

---

## Why CesaFlow IDE?

Cursor gives you one agent. CesaFlow IDE gives you a full engineering team.

| | VS Code | Cursor | **CesaFlow IDE** |
|---|---|---|---|
| Multi-agent pipeline | ✗ | ✗ | **Planner → Backend → Frontend → QA** |
| Parallel execution | ✗ | ✗ | **✓ Backend + Frontend run simultaneously** |
| Full codebase generation | ✗ | Single file | **✓ End-to-end, all files** |
| Inline edit `Ctrl+K` | ✗ | ✓ | **✓** |
| Context-aware chat `Ctrl+L` | ✗ | ✓ | **✓** |
| Tab completion | ✗ | ✓ | **✓ via Groq / Cerebras** |
| BYOM (your own API key) | ✗ | ✗ | **✓** |
| Telemetry | ✓ | ? | **✗ Zero** |
| Extension marketplace | MS Only | MS Only | **Open VSX** |

---

## How it works

Describe a feature in plain English. CesaFlow IDE routes it through 4 specialized agents:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Planner   │────▶│   Backend   │────▶│  Frontend   │────▶│     QA      │
│ Architecture│     │  API + DB   │     │   UI + UX   │     │    Tests    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

All agents write real, runnable files directly into your workspace.

---

## Download

Get the latest release from [Releases](https://github.com/CesaFlowai/cesa-flow-ide/releases):

| Platform | File |
|----------|------|
| macOS Apple Silicon (M1/M2/M3) | `cesaflow-ide-*-darwin-arm64.dmg` |
| macOS Intel | `cesaflow-ide-*-darwin-x64.dmg` |
| Windows 10/11 x64 | `cesaflow-ide-*-windows-x64.zip` |
| Linux x64 | `cesaflow-ide-*-linux-x64.tar.gz` / `.deb` / `.rpm` |

---

## Quick Start

1. Download CesaFlow IDE for your platform
2. Open any project folder
3. Get your API key from [cesaflow.ai](https://cesaflow.ai/dashboard/api-keys)
4. `Ctrl+Shift+O` → describe what you want to build
5. Watch 4 agents write your entire feature

---

## Build from Source

This repo does **not** contain VS Code source — it clones it at build time.

### GitHub Actions (recommended)

```bash
git tag v1.0.0
git push origin v1.0.0
# Triggers multi-platform build → auto-publishes to Releases (~25 min)
```

### Local Build (macOS / Linux)

```bash
bash scripts/build_local.sh
# Requirements: Node.js 20+, Git, Python 3
# macOS: xcode-select --install
# Linux: sudo apt install build-essential libx11-dev libxkbfile-dev libsecret-1-dev
```

---

## Repository Structure

```
cesa-flow-ide/
├── product.json              ← Branding (replaces VS Code's product.json)
├── extension/                ← Built-in CesaFlow extension (bundled at build)
├── icons/                    ← App icons (all platforms)
├── scripts/
│   ├── build_local.sh        ← Local build helper
│   └── copy_extension.sh     ← Injects extension into VS Code tree
└── .github/
    └── workflows/
        └── build.yml         ← Multi-platform CI/CD (macOS + Windows + Linux)
```

---

## Roadmap

- [x] CesaFlow branding (product.json, Open VSX, telemetry off)
- [x] Built-in extension bundled
- [x] Multi-platform GitHub Actions CI/CD
- [x] Inline edit (`Ctrl+K`), Chat (`Ctrl+L`), Tab completion
- [ ] CesaFlow Dark theme (default)
- [ ] macOS code signing + notarization
- [ ] Windows EV certificate signing
- [ ] Auto-update server
- [ ] cesaflow.ai/download landing page

---

<p align="center">
  Built with ⚡ by <a href="https://cesaflow.ai">CesaFlow AI</a>
</p>
