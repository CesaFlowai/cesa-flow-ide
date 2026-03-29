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
exports.showWelcome = showWelcome;
exports.registerWelcome = registerWelcome;
const vscode = __importStar(require("vscode"));
function showWelcome(context) {
    const panel = vscode.window.createWebviewPanel('cesaflow.welcome', 'Welcome to CesaFlow', vscode.ViewColumn.One, {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    });
    panel.webview.html = getWelcomeHtml(panel.webview, context);
    panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {
            case 'setApiKey':
                await vscode.workspace.getConfiguration('orkestra').update('apiKey', msg.key, true);
                if (msg.url) {
                    await vscode.workspace.getConfiguration('orkestra').update('serverUrl', msg.url, true);
                }
                vscode.window.showInformationMessage('CesaFlow IDE: Connected successfully!');
                panel.dispose();
                vscode.commands.executeCommand('orkestra.openPanel');
                break;
            case 'openSettings':
                vscode.commands.executeCommand('workbench.action.openSettings', 'orkestra');
                break;
            case 'openDashboard':
                vscode.env.openExternal(vscode.Uri.parse(vscode.workspace.getConfiguration('orkestra').get('serverUrl', 'http://localhost:8001').replace('8001', '3000') + '/dashboard'));
                break;
        }
    }, undefined, context.subscriptions);
}
function registerWelcome(context) {
    const version = context.extension.packageJSON.version;
    const WELCOME_KEY = `cesaflow.welcomeSeen.${version}`;
    const hasSeenWelcome = context.globalState.get(WELCOME_KEY);
    if (!hasSeenWelcome) {
        context.globalState.update(WELCOME_KEY, true);
        setTimeout(() => showWelcome(context), 500);
    }
    context.subscriptions.push(vscode.commands.registerCommand('orkestra.welcome', () => showWelcome(context)));
}
function getWelcomeHtml(webview, context) {
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'welcome.js'));
    const csp = [
        `default-src 'none'`,
        `style-src 'unsafe-inline'`,
        `script-src ${webview.cspSource}`,
        `img-src ${webview.cspSource} data: https:`,
        `form-action 'none'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Welcome to CesaFlow IDE</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080b14;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 20px}
.wrap{max-width:480px;width:100%}
.header{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:24px}
.logo{width:42px;height:42px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}
.logo-text{font-size:24px;font-weight:800;color:#fff;letter-spacing:-.5px}
.logo-text span{color:#818cf8}
.tagline{font-size:26px;font-weight:900;text-align:center;margin-bottom:8px;background:linear-gradient(135deg,#fff 40%,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;line-height:1.2}
.sub{text-align:center;font-size:13px;color:#64748b;margin-bottom:28px;line-height:1.6}
.card{background:#0f172a;border:1px solid #1e293b;border-radius:18px;padding:24px;margin-bottom:16px}
.label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}
.input-row{display:flex;gap:8px;margin-bottom:10px}
.key-input{flex:1;background:#080b14;border:1.5px solid #1e293b;border-radius:10px;padding:12px 14px;color:#f1f5f9;font-size:13px;outline:none;transition:.2s;font-family:monospace}
.key-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px #6366f115}
.key-input::placeholder{color:#334155;font-family:-apple-system,sans-serif}
.btn-get{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:0 14px;color:#818cf8;font-size:12px;font-weight:700;cursor:pointer;transition:.15s;white-space:nowrap;text-decoration:none;display:flex;align-items:center}
.btn-get:hover{background:#334155;color:#a5b4fc}
.hint{font-size:11px;color:#334155;line-height:1.5;margin-bottom:14px}
.hint a{color:#6366f1;text-decoration:none}
.hint a:hover{color:#818cf8;text-decoration:underline}
.btn-connect{width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:11px;padding:13px;font-size:15px;font-weight:700;cursor:pointer;transition:.2s;letter-spacing:.2px}
.btn-connect:hover{opacity:.9;transform:translateY(-1px);box-shadow:0 8px 30px #6366f135}
.btn-connect:disabled{opacity:.4;cursor:not-allowed;transform:none}
.steps{display:flex;gap:0;margin-bottom:24px;background:#0f172a;border:1px solid #1e293b;border-radius:12px;overflow:hidden}
.step{flex:1;padding:10px 12px;display:flex;align-items:center;gap:8px;font-size:12px;color:#475569}
.step.active{background:#6366f110;color:#818cf8;font-weight:600}
.step.done{color:#22c55e}
.step-num{width:20px;height:20px;border-radius:50%;background:#1e293b;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;flex-shrink:0}
.step.active .step-num{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
.step.done .step-num{background:#22c55e20;color:#22c55e;border:1px solid #22c55e}
.step-sep{width:1px;background:#1e293b}
.bottom{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:8px}
.btn-ghost{background:transparent;color:#334155;border:none;font-size:12px;cursor:pointer;transition:.15s;padding:6px}
.btn-ghost:hover{color:#64748b}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="logo">&#9889;</div>
    <div class="logo-text">Cesa<span>Flow</span> IDE</div>
  </div>

  <div class="tagline">AI Ajanlarla Kod Yaz</div>
  <p class="sub">CesaFlow hesabından API key'ini gir ve hemen başla.<br>AI model seçimini daha sonra sağ panelden yapabilirsin.</p>

  <div class="steps">
    <div class="step active"><div class="step-num">1</div><span>API Key Gir</span></div>
    <div class="step-sep"></div>
    <div class="step"><div class="step-num">2</div><span>AI Model Ekle</span></div>
    <div class="step-sep"></div>
    <div class="step"><div class="step-num">3</div><span>Run Başlat</span></div>
  </div>

  <div class="card">
    <div class="label">CesaFlow API Key</div>
    <div class="input-row">
      <input type="password" class="key-input" id="apiKey" placeholder="sk_cf_..." autocomplete="off" />
      <a class="btn-get" href="https://cesaflow.ai/dashboard/settings" target="_blank">Key Al &#8599;</a>
    </div>
    <div class="hint">
      <a href="https://cesaflow.ai" target="_blank">cesaflow.ai</a> hesabından Settings → API Keys bölümünden key oluşturabilirsin.<br>
      AI model (GPT-4, Claude, Gemini...) eklemeyi kurulumdan sonra sağ panelden yapabilirsin.
    </div>
    <button class="btn-connect" id="saveBtn" disabled>CesaFlow&#8217;a Bağlan &#8594;</button>
  </div>

  <div class="bottom">
    <button class="btn-ghost" id="settingsBtn">&#9881; Gelişmiş Ayarlar</button>
  </div>
</div>
<script src="${jsUri}"></script>
</body>
</html>`;
}
//# sourceMappingURL=welcome.js.map