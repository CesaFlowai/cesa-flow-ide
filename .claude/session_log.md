## 2026-03-26 — Windows crash fix (urlProtocol)

### Yapılanlar
- `product.json`: `urlProtocol: "cesaflow"`, `serverApplicationName`, `serverDataFolderName` eklendi
- **Root cause:** `app.setAsDefaultProtocolClient(undefined)` — main.js:33825 analiz edilerek bulundu
- v0.1.9 tag push edildi → GitHub Actions build başlatıldı

### Geçmiş Fix Tablosu
| v | Sorun | Fix |
|---|-------|-----|
| v0.1.0 | builtInExtensions Open VSX 404 | `[]` yap |
| v0.1.4 | licenseFileName undefined gulp crash | product.json'a ekle |
| v0.1.6 | win32TunnelMutex eksik | product.json'a ekle |
| v0.1.7 | Inno Setup tools/ dir yok | build öncesi mkdir |
| v0.1.9 | urlProtocol eksik Windows crash | product.json'a ekle |

### Yarım Kalanlar
- v0.1.9 build sonucu test edilmedi (Windows ZIP/EXE)
