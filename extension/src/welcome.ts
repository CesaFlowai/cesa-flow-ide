import * as vscode from 'vscode';

export function showWelcome(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'cesaflow.welcome',
    'Welcome to CesaFlow',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    }
  );

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
        vscode.env.openExternal(vscode.Uri.parse(
          vscode.workspace.getConfiguration('orkestra').get('serverUrl', 'http://localhost:8001').replace('8001', '3000') + '/dashboard'
        ));
        break;
    }
  }, undefined, context.subscriptions);
}

export function registerWelcome(context: vscode.ExtensionContext) {
  const WELCOME_KEY = 'orkestra.welcomeSeen.v1';
  const hasSeenWelcome = context.globalState.get<boolean>(WELCOME_KEY);
  if (!hasSeenWelcome) {
    context.globalState.update(WELCOME_KEY, true);
    showWelcome(context);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('orkestra.welcome', () => showWelcome(context))
  );
}

function getWelcomeHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'welcome.js')
  );
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
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  background:#080b14;color:#e2e8f0;min-height:100vh;
  padding:32px 20px 48px;
}
.wrap{max-width:760px;margin:0 auto}

/* Header */
.header{display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:28px}
.logo-icon{width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:20px}
.logo-text{font-size:22px;font-weight:800;color:#fff;letter-spacing:-.5px}
.logo-text span{color:#818cf8}
.tagline{font-size:28px;font-weight:900;text-align:center;margin-bottom:8px;background:linear-gradient(135deg,#fff 40%,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.sub{text-align:center;font-size:14px;color:#64748b;margin-bottom:32px;line-height:1.6}

/* Steps */
.steps{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:32px}
.step{display:flex;flex-direction:column;align-items:center;gap:5px}
.step-num{width:28px;height:28px;border-radius:50%;background:#1e293b;border:1px solid #334155;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#64748b}
.step-num.active{background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff}
.step-num.done{background:#22c55e20;border-color:#22c55e;color:#22c55e}
.step-label{font-size:10px;color:#475569;font-weight:600;letter-spacing:.4px;text-transform:uppercase}
.step-label.active{color:#818cf8}
.step-line{width:48px;height:1px;background:#1e293b;margin-bottom:20px}

/* Section title */
.section-label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px}
.free-note{display:inline-flex;align-items:center;gap:6px;background:#22c55e15;border:1px solid #22c55e30;border-radius:20px;padding:4px 12px;font-size:12px;color:#22c55e;font-weight:600;margin-bottom:16px}

/* Provider grid */
.provider-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:24px}
@media(min-width:600px){.provider-grid{grid-template-columns:repeat(3,1fr)}}

.provider-card{
  background:#0f172a;border:1.5px solid #1e293b;border-radius:14px;
  padding:14px;cursor:pointer;transition:.15s;position:relative;
}
.provider-card:hover{border-color:#334155;transform:translateY(-1px)}
.provider-card.selected{border-color:#6366f1;background:#6366f110}
.provider-card.recommended-card{border-color:#22c55e40}
.provider-card.recommended-card.selected{border-color:#6366f1}

.rec-label{position:absolute;top:-9px;left:12px;background:#22c55e;color:#fff;font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:.4px}
.card-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.provider-name{font-size:13px;font-weight:700;color:#f1f5f9}
.badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;letter-spacing:.3px}
.provider-tagline{font-size:11px;color:#94a3b8;margin-bottom:4px;font-weight:500}
.provider-models{font-size:10px;color:#475569;margin-bottom:4px}
.provider-note{font-size:10px;color:#334155}

/* Key section */
.key-section{background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:22px;margin-bottom:16px}
.key-row{display:flex;gap:8px;align-items:stretch;margin-bottom:10px}
.key-input{flex:1;background:#080b14;border:1.5px solid #1e293b;border-radius:10px;padding:11px 14px;color:#f1f5f9;font-size:13px;outline:none;transition:.2s;font-family:monospace}
.key-input:focus{border-color:#6366f1;box-shadow:0 0 0 3px #6366f115}
.key-input::placeholder{color:#334155;font-family:-apple-system,sans-serif}
.btn-get-key{background:#1e293b;border:1px solid #334155;border-radius:10px;padding:0 16px;color:#818cf8;font-size:12px;font-weight:700;cursor:pointer;transition:.15s;white-space:nowrap;text-decoration:none;display:flex;align-items:center;gap:5px}
.btn-get-key:hover{background:#334155;color:#a5b4fc}

.selected-label{font-size:11px;color:#64748b;margin-bottom:10px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}

.btn-connect{
  width:100%;background:linear-gradient(135deg,#6366f1,#8b5cf6);
  color:#fff;border:none;border-radius:11px;padding:13px;
  font-size:15px;font-weight:700;cursor:pointer;transition:.2s;letter-spacing:.2px;
}
.btn-connect:hover{opacity:.9;transform:translateY(-1px);box-shadow:0 8px 30px #6366f135}
.btn-connect:disabled{opacity:.4;cursor:not-allowed;transform:none}

.or-divider{display:flex;align-items:center;gap:10px;margin:12px 0;color:#1e293b;font-size:11px}
.or-divider::before,.or-divider::after{content:'';flex:1;height:1px;background:#1e293b}

.server-row{display:flex;gap:8px;align-items:center}
.server-input{flex:1;background:#080b14;border:1px solid #1e293b;border-radius:9px;padding:9px 12px;color:#64748b;font-size:12px;outline:none;transition:.2s}
.server-input:focus{border-color:#334155;color:#94a3b8}

.bottom-row{display:flex;justify-content:center;gap:12px;margin-top:12px}
.btn-ghost{background:transparent;color:#334155;border:1px solid #1e293b;border-radius:8px;padding:7px 16px;font-size:12px;cursor:pointer;transition:.15s}
.btn-ghost:hover{color:#64748b;border-color:#334155}

/* Pro upsell */
.pro-box{background:#0a0f1e;border:1px solid #2d1f6e;border-radius:16px;padding:18px 20px;margin-top:16px;margin-bottom:4px}
.pro-header{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.pro-badge{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:.5px}
.pro-title{font-size:13px;font-weight:700;color:#c4b5fd}
.pro-note{font-size:11px;color:#475569;margin-bottom:12px;line-height:1.5}
.pro-features{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.pro-feat{font-size:11px;color:#94a3b8;font-weight:500}
.pro-dim{color:#334155;font-weight:400}
.btn-pro{display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;font-size:12px;font-weight:700;padding:8px 18px;border-radius:9px;text-decoration:none;transition:.15s;letter-spacing:.2px}
.btn-pro:hover{opacity:.9}
</style>
</head>
<body>
<div class="wrap">

  <div class="header">
    <div class="logo-icon">&#9889;</div>
    <div class="logo-text">Cesa<span>Flow</span> IDE</div>
  </div>

  <div class="tagline">Start building with AI — for free</div>
  <p class="sub">Choose your AI provider below. Most have a free tier — no credit card needed.<br>You can always switch later.</p>

  <div style="text-align:center;margin-bottom:20px">
    <span class="free-note">&#127381; Ücretsiz başla, istediğin zaman yükselt</span>
  </div>

  <div class="section-label">AI Sağlayıcı Seç</div>
  <div class="provider-grid" id="providerGrid"></div>

  <div class="key-section">
    <div class="selected-label" id="selectedName">Groq API Key</div>
    <div class="key-row">
      <input type="password" class="key-input" id="apiKey" placeholder="gsk_..." autocomplete="off" />
      <a class="btn-get-key" id="getKeyBtn" href="https://console.groq.com/keys" target="_blank">
        &#128274; Ücretsiz Key Al &#8599;
      </a>
    </div>
    <button class="btn-connect" id="saveBtn" disabled>CesaFlow&#8217;a Bağlan &#8594;</button>
  </div>

  <div class="or-divider">veya kendi sunucun</div>
  <div class="server-row">
    <input type="text" class="server-input" id="serverUrl" placeholder="http://localhost:8001 (kendi sunucun)" />
  </div>

  <div class="pro-box">
    <div class="pro-header">
      <span class="pro-badge">PRO</span>
      <span class="pro-title">Daha fazla güç için yükselt</span>
    </div>
    <div class="pro-note">CesaFlow token almaz — kendi API key'ini bağlarsın, maliyet sana ait.</div>
    <div class="pro-features">
      <div class="pro-feat">&#10003; Aylık 1.000 run <span class="pro-dim">(Ücretsiz: 20)</span></div>
      <div class="pro-feat">&#10003; Kendi Claude / GPT-4o / Gemini key'ini bağla</div>
      <div class="pro-feat">&#10003; Proje hafızası — session'lar arası</div>
      <div class="pro-feat">&#10003; 4 agent gerçek paralelde çalışır</div>
      <div class="pro-feat">&#10003; Private workspace + Git entegrasyonu</div>
    </div>
    <a class="btn-pro" href="https://cesaflow.ai/#pricing" target="_blank">Pro&apos;ya Geç &#8599;</a>
  </div>

  <div class="bottom-row">
    <button class="btn-ghost" id="settingsBtn">&#9881; Ayarlar</button>
  </div>

</div>
<script src="${jsUri}"></script>
</body>
</html>`;
}
