"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSettings = registerSettings;
exports.showSettings = showSettings;
const vscode = __importStar(require("vscode"));
function registerSettings(context) {
    context.subscriptions.push(vscode.commands.registerCommand('orkestra.settings', () => showSettings(context)));
}
function showSettings(context) {
    const panel = vscode.window.createWebviewPanel('cesaflow.settings', 'CesaFlow Settings', vscode.ViewColumn.One, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    });
    const cfg = vscode.workspace.getConfiguration('orkestra');
    const currentKey = cfg.get('apiKey', '');
    const currentUrl = cfg.get('serverUrl', 'http://localhost:8001');
    const autoApply = cfg.get('autoApplyFiles', false);
    panel.webview.html = getSettingsHtml(panel.webview, context, currentKey, currentUrl, autoApply);
    panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
            case 'save': {
                const c = vscode.workspace.getConfiguration('orkestra');
                if (msg.apiKey !== undefined)
                    await c.update('apiKey', msg.apiKey, true);
                if (msg.serverUrl !== undefined)
                    await c.update('serverUrl', msg.serverUrl, true);
                if (msg.autoApply !== undefined)
                    await c.update('autoApplyFiles', msg.autoApply, true);
                vscode.window.showInformationMessage('CesaFlow: Settings saved ✓');
                panel.dispose();
                break;
            }
            case 'testConnection': {
                const url = msg.serverUrl || currentUrl;
                try {
                    const http = await Promise.resolve().then(() => __importStar(require('http')));
                    const req = http.get(url + '/health', (res) => {
                        panel.webview.postMessage({ type: 'connectionResult', ok: res.statusCode === 200 });
                    });
                    req.on('error', () => {
                        panel.webview.postMessage({ type: 'connectionResult', ok: false });
                    });
                    req.setTimeout(3000, () => {
                        req.destroy();
                        panel.webview.postMessage({ type: 'connectionResult', ok: false });
                    });
                }
                catch {
                    panel.webview.postMessage({ type: 'connectionResult', ok: false });
                }
                break;
            }
        }
    }, undefined, context.subscriptions);
}
function getSettingsHtml(webview, context, currentKey, currentUrl, autoApply) {
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'settings.js'));
    const csp = [
        `default-src 'none'`,
        `style-src 'unsafe-inline'`,
        `script-src ${webview.cspSource}`,
        `img-src ${webview.cspSource} data: https:`,
        `form-action 'none'`,
    ].join('; ');
    const maskedKey = currentKey ? currentKey.slice(0, 6) + '••••••••••••' : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>CesaFlow Settings</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080b14;color:#e2e8f0;min-height:100vh;padding:32px 20px 48px}
.wrap{max-width:680px;margin:0 auto}
.header{display:flex;align-items:center;gap:10px;margin-bottom:32px}
.logo{width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px}
.title{font-size:20px;font-weight:800;color:#fff}
.title span{color:#818cf8}

.section{background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:22px;margin-bottom:16px}
.section-title{font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.8px;margin-bottom:16px;display:flex;align-items:center;gap:7px}
.section-title::before{content:'';width:3px;height:14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:2px;display:inline-block}

.field{margin-bottom:14px}
.field:last-child{margin-bottom:0}
.label{font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center}
.label a{font-size:11px;color:#6366f1;text-decoration:none;font-weight:500}
.label a:hover{color:#818cf8}

.input{width:100%;background:#080b14;border:1.5px solid #1e293b;border-radius:10px;padding:10px 14px;color:#f1f5f9;font-size:13px;outline:none;transition:.2s}
.input:focus{border-color:#6366f1;box-shadow:0 0 0 3px #6366f115}
.input::placeholder{color:#334155}
.input.mono{font-family:monospace}

.input-row{display:flex;gap:8px}
.input-row .input{flex:1}

.btn-test{background:#1e293b;border:1px solid #334155;border-radius:9px;padding:0 14px;color:#818cf8;font-size:12px;font-weight:700;cursor:pointer;transition:.15s;white-space:nowrap}
.btn-test:hover{background:#334155}
.test-result{font-size:11px;margin-top:6px;padding:4px 10px;border-radius:6px;display:none}
.test-result.ok{background:#22c55e15;color:#22c55e;border:1px solid #22c55e30;display:block}
.test-result.fail{background:#ef444415;color:#ef4444;border:1px solid #ef444430;display:block}

.toggle-row{display:flex;align-items:center;justify-content:space-between;padding:4px 0}
.toggle-label{font-size:13px;color:#e2e8f0;font-weight:500}
.toggle-sub{font-size:11px;color:#475569;margin-top:2px}
.toggle{position:relative;display:inline-block;width:42px;height:24px}
.toggle input{opacity:0;width:0;height:0}
.slider{position:absolute;inset:0;background:#1e293b;border-radius:12px;cursor:pointer;transition:.2s;border:1px solid #334155}
.slider::before{content:'';position:absolute;height:18px;width:18px;left:2px;bottom:2px;background:#475569;border-radius:50%;transition:.2s}
input:checked+.slider{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:transparent}
input:checked+.slider::before{transform:translateX(18px);background:#fff}

.provider-pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.pill{background:#080b14;border:1.5px solid #1e293b;border-radius:20px;padding:5px 14px;font-size:12px;font-weight:600;color:#64748b;cursor:pointer;transition:.15s}
.pill:hover{border-color:#334155;color:#94a3b8}
.pill.active{border-color:#6366f1;color:#818cf8;background:#6366f110}

.actions{display:flex;gap:10px;margin-top:24px}
.btn-save{flex:1;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:11px;padding:12px;font-size:14px;font-weight:700;cursor:pointer;transition:.2s}
.btn-save:hover{opacity:.9;transform:translateY(-1px)}
.btn-cancel{background:transparent;border:1px solid #1e293b;border-radius:11px;padding:12px 20px;color:#475569;font-size:14px;cursor:pointer;transition:.15s}
.btn-cancel:hover{border-color:#334155;color:#64748b}

.version-note{text-align:center;font-size:11px;color:#1e293b;margin-top:12px}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">&#9889;</div>
    <div class="title">Cesa<span>Flow</span> <span style="color:#475569;font-weight:400">Settings</span></div>
  </div>

  <div class="section">
    <div class="section-title">AI Provider &amp; API Key</div>
    <div class="provider-pills" id="providerPills"></div>
    <div class="field">
      <div class="label">
        <span id="keyLabel">API Key</span>
        <a id="getKeyLink" href="#" target="_blank">Ücretsiz key al &#8599;</a>
      </div>
      <input type="password" class="input mono" id="apiKey" placeholder="${maskedKey || 'sk_... veya gsk_...'}" autocomplete="off" />
      <div style="font-size:11px;color:#334155;margin-top:5px" id="keyHint"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Sunucu</div>
    <div class="field">
      <div class="label">Backend URL <span style="font-size:10px;color:#334155">(kendi sunucun için)</span></div>
      <div class="input-row">
        <input type="text" class="input" id="serverUrl" value="${currentUrl}" />
        <button class="btn-test" id="testBtn">Test</button>
      </div>
      <div class="test-result" id="testResult"></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Tercihler</div>
    <div class="toggle-row">
      <div>
        <div class="toggle-label">Dosyaları otomatik uygula</div>
        <div class="toggle-sub">Run tamamlandığında dosyaları workspace'e otomatik yaz</div>
      </div>
      <label class="toggle">
        <input type="checkbox" id="autoApply" ${autoApply ? 'checked' : ''} />
        <span class="slider"></span>
      </label>
    </div>
  </div>

  <div class="actions">
    <button class="btn-cancel" id="cancelBtn">İptal</button>
    <button class="btn-save" id="saveBtn">Kaydet</button>
  </div>
  <div class="version-note" id="versionNote"></div>
</div>
<script src="${jsUri}" data-current-key="${maskedKey}"></script>
</body>
</html>`;
}
//# sourceMappingURL=settings.js.map