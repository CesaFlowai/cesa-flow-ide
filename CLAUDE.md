# CesaFlow IDE — Claude Kuralları

## Proje Özeti
VS Code 1.96.4 fork'u. CesaFlow AI ajanlarını doğrudan IDE içine entegre eder.

**Repo:** https://github.com/CesaFlowai/cesa-flow-ide
**Build:** GitHub Actions (.github/workflows/build.yml)
**Güncel versiyon:** v0.1.9

## Dizin Yapısı
```
orkestra-ide/
├── product.json         ← Branding, GUID'ler, URL'ler — KRİTİK
├── extension/           ← Built-in CesaFlow extension (TypeScript)
│   ├── src/
│   ├── package.json
│   └── tsconfig.json
├── scripts/
│   └── copy_extension.sh
├── LICENSE.txt
└── .github/workflows/build.yml
```

## Build & Release
```bash
# Yeni release için tag at
git add -A && git commit -m "fix: ..." && git push origin main
git tag v0.x.x && git push origin v0.x.x
# → GitHub Actions otomatik build başlar (macOS + Linux + Windows)
# → Release oluşturulur, asset'ler eklenir
```

## Kritik Kurallar
- **product.json değişince** mutlaka yeni tag at, aksi halde build çalışmaz
- **product.json zorunlu alanlar:** nameShort, applicationName, dataFolderName, urlProtocol, tunnelApplicationName, serverApplicationName, serverDataFolderName, licenseFileName, tüm win32*AppId'ler
- **Extension:** native WebSocket kullan (`ws` npm paketi değil) — gulp glob hatası yapar
- **Extension TypeScript:** build.yml'de `npm install && npm run compile` adımı OLMALI
- **Windows crash geçmişi:** urlProtocol eksikse `app.setAsDefaultProtocolClient(undefined)` crash yapar

## Bilinen Sorunlar / Geçmiş Fixler
| Versiyon | Sorun | Fix |
|----------|-------|-----|
| v0.1.0 | builtInExtensions Open VSX 404 | `"builtInExtensions": []` |
| v0.1.1 | ripgrep GitHub API 403 | GITHUB_TOKEN env ekle |
| v0.1.3 | Invalid glob (ws node_modules) | native WebSocket kullan |
| v0.1.4 | licenseFileName undefined → gulp crash | product.json'a ekle |
| v0.1.6 | win32TunnelMutex eksik | product.json'a ekle |
| v0.1.7 | Inno Setup tools/ dir yok | build öncesi mkdir |
| v0.1.9 | urlProtocol eksik → Windows crash | product.json'a ekle |

## Session Log
→ `.claude/sessions/YYYY-MM-DD.md` dosyalarında tutulur
