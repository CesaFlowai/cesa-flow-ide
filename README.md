# Orkestra IDE

VS Code fork with native multi-agent AI orchestration.

**Cursor has Composer (1 agent). Orkestra IDE has Planner → Backend → Frontend → QA (parallel).**

---

## How it works

This repo does NOT contain VS Code source code. Instead:

1. GitHub Actions clones VS Code at a pinned tag (`1.87.2`)
2. Replaces `product.json` with ours (branding, Open VSX, telemetry off)
3. Copies the Orkestra built-in extension from `../vscode-extension/`
4. Builds native binaries for all platforms
5. Publishes to GitHub Releases

---

## Release a new version

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions automatically builds and releases:

| Platform | File |
|----------|------|
| macOS Apple Silicon | `orkestra-ide-0.1.0-darwin-arm64.dmg` |
| macOS Intel | `orkestra-ide-0.1.0-darwin-x64.dmg` |
| Windows 10/11 | `orkestra-ide-0.1.0-windows-x64.zip` |
| Linux | `orkestra-ide-0.1.0-linux-x64.tar.gz` + `.deb` + `.rpm` |

Build time: ~20-30 min (npm cache hits reduce this to ~10 min on repeat builds).

---

## Local build (macOS / Linux)

```bash
bash scripts/build_local.sh          # uses VS Code 1.87.2
bash scripts/build_local.sh 1.87.2 0.1.0
```

Requirements:
- Node.js 20+, Git, Python 3
- **Linux:** `sudo apt install build-essential libx11-dev libxkbfile-dev libsecret-1-dev`
- **macOS:** Xcode CLT (`xcode-select --install`)

---

## Repository layout

```
orkestra-ide/
├── product.json              ← Branding (replaces VS Code's product.json)
├── scripts/
│   ├── build_local.sh        ← Local build helper
│   └── copy_extension.sh     ← Copies ../vscode-extension/ into VS Code tree
└── .github/
    └── workflows/
        └── build.yml         ← Multi-platform CI/CD
```

The Orkestra VS Code extension lives at `../vscode-extension/` and is automatically bundled.

---

## What's different from VS Code / Cursor

| Feature | VS Code | Cursor | **Orkestra IDE** |
|---------|---------|--------|-----------------|
| Multi-file agent | ✗ | Composer (1 agent) | **Planner→Backend→FE→QA** |
| Parallel agents | ✗ | ✗ | **✓** |
| BYOM (your API key) | ✗ | ✗ | **✓** |
| Web search in agent | ✗ | ✗ | **✓** |
| Self-debug loop | ✗ | ✗ | **✓** |
| Telemetry | ✓ | ? | **✗ none** |
| Extension marketplace | MS Only | MS Only | **Open VSX** |
| Price | Free | $20/mo | **$0 (BYOM)** |

---

## Roadmap

### Phase 1 ✅ (this repo)
- [x] `product.json` branding (name, icon, Open VSX, telemetry=off)
- [x] Built-in Orkestra extension bundled
- [x] Multi-platform CI/CD (GitHub Actions)
- [x] npm dependency caching (faster repeat builds)

### Phase 2 (next)
- [ ] Custom welcome screen (Orkestra onboarding)
- [ ] Default dark theme "Orkestra Dark"
- [ ] Cmd+K inline suggestions → Orkestra run
- [ ] Cmd+L chat panel (context-aware with open files)
- [ ] Tab completion via Groq/Cerebras (free, <100ms)

### Phase 3
- [ ] Code signing (macOS notarization, Windows EV cert)
- [ ] Auto-update server
- [ ] orkestra-ide.com download page
