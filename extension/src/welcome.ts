import * as vscode from 'vscode';

/**
 * Orkestra Welcome Screen
 * Shown on first install and via "Orkestra: Welcome" command.
 */
export function showWelcome(context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'orkestra.welcome',
    'Welcome to Orkestra IDE',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: false }
  );

  panel.webview.html = getWelcomeHtml();

  panel.webview.onDidReceiveMessage(async (msg) => {
    switch (msg.type) {
      case 'setApiKey':
        await vscode.workspace.getConfiguration('orkestra').update('apiKey', msg.key, true);
        vscode.window.showInformationMessage('Orkestra: API key saved ✓');
        panel.dispose();
        vscode.commands.executeCommand('orkestra.mainView.focus');
        break;
      case 'openSettings':
        vscode.commands.executeCommand('workbench.action.openSettings', 'orkestra');
        break;
      case 'openDashboard':
        vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000/dashboard'));
        break;
    }
  }, undefined, context.subscriptions);
}

export function registerWelcome(context: vscode.ExtensionContext) {
  // Show on first install
  const hasSeenWelcome = context.globalState.get<boolean>('orkestra.welcomeSeen');
  if (!hasSeenWelcome) {
    context.globalState.update('orkestra.welcomeSeen', true);
    showWelcome(context);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('orkestra.welcome', () => showWelcome(context))
  );
}

function getWelcomeHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Orkestra IDE</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0f;
      color: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 640px; width: 100%; }
    .logo {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 32px;
    }
    .logo-icon {
      width: 52px; height: 52px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-size: 26px;
    }
    .logo-text h1 { font-size: 26px; font-weight: 700; color: #fff; }
    .logo-text p { font-size: 14px; color: #9ca3af; margin-top: 2px; }
    .tagline {
      font-size: 32px; font-weight: 800; color: #fff;
      line-height: 1.2; margin-bottom: 12px;
    }
    .tagline span { color: #818cf8; }
    .subtitle { color: #9ca3af; font-size: 16px; margin-bottom: 40px; line-height: 1.6; }
    .features {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 12px; margin-bottom: 40px;
    }
    .feature {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 16px;
    }
    .feature-icon { font-size: 20px; margin-bottom: 8px; }
    .feature h3 { font-size: 13px; font-weight: 600; color: #f3f4f6; margin-bottom: 4px; }
    .feature p { font-size: 12px; color: #6b7280; line-height: 1.5; }
    .shortcut {
      display: inline-block;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 4px;
      padding: 1px 6px;
      font-family: monospace;
      font-size: 11px;
      color: #d1d5db;
    }
    .setup { margin-bottom: 32px; }
    .setup h2 { font-size: 16px; font-weight: 600; color: #f3f4f6; margin-bottom: 16px; }
    .input-row { display: flex; gap: 8px; }
    input[type=text] {
      flex: 1;
      background: #111827;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 10px 14px;
      color: #f3f4f6;
      font-size: 14px;
      outline: none;
    }
    input[type=text]:focus { border-color: #6366f1; }
    input[type=text]::placeholder { color: #4b5563; }
    .btn {
      background: #6366f1;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn:hover { background: #4f46e5; }
    .btn-secondary {
      background: transparent;
      color: #9ca3af;
      border: 1px solid #374151;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 14px;
      cursor: pointer;
    }
    .btn-secondary:hover { color: #f3f4f6; border-color: #6b7280; }
    .actions { display: flex; gap: 10px; }
    .hint { font-size: 12px; color: #4b5563; margin-top: 8px; }
    a { color: #818cf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <div class="logo-icon">⚡</div>
      <div class="logo-text">
        <h1>Orkestra IDE</h1>
        <p>Powered by multi-agent AI</p>
      </div>
    </div>

    <div class="tagline">
      Not one agent.<br><span>Four, in parallel.</span>
    </div>
    <p class="subtitle">
      Planner → Backend + Frontend → QA — all running simultaneously.
      Bring your own API key (Groq, Mistral, OpenAI) and pay nothing for the models.
    </p>

    <div class="features">
      <div class="feature">
        <div class="feature-icon">⌘K</div>
        <h3>Inline Edit <span class="shortcut">Cmd+K</span></h3>
        <p>Select code, press Cmd+K, describe what to change. Orkestra rewrites it inline.</p>
      </div>
      <div class="feature">
        <div class="feature-icon">💬</div>
        <h3>Chat Panel <span class="shortcut">Cmd+L</span></h3>
        <p>Ask questions about your open files. Context-aware, no copy-paste needed.</p>
      </div>
      <div class="feature">
        <div class="feature-icon">✦</div>
        <h3>Tab Completion</h3>
        <p>Free completions via Groq Llama — under 100ms. Just press Tab.</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🤖</div>
        <h3>Full Agent Run <span class="shortcut">Cmd+Shift+O</span></h3>
        <p>Describe an entire feature — Orkestra writes all files end to end.</p>
      </div>
    </div>

    <div class="setup">
      <h2>Connect to Orkestra</h2>
      <div class="input-row">
        <input type="text" id="apiKey" placeholder="sk_..." />
        <button class="btn" onclick="saveKey()">Save Key</button>
      </div>
      <p class="hint">
        Get your API key at <a href="#" onclick="openDashboard()">localhost:3000/dashboard</a>
        → API Keys
      </p>
    </div>

    <div class="actions">
      <button class="btn-secondary" onclick="openSettings()">Open Settings</button>
      <button class="btn-secondary" onclick="openDashboard()">Open Dashboard</button>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    function saveKey() {
      const key = document.getElementById('apiKey').value.trim();
      if (!key) return;
      vscode.postMessage({ type: 'setApiKey', key });
    }
    function openSettings() { vscode.postMessage({ type: 'openSettings' }); }
    function openDashboard() { vscode.postMessage({ type: 'openDashboard' }); }
    document.getElementById('apiKey').addEventListener('keydown', e => {
      if (e.key === 'Enter') saveKey();
    });
  </script>
</body>
</html>`;
}
