import * as vscode from 'vscode';
import { OrkestraApi, Run } from './api';

export class OrkestraPanel {
  private _view?: vscode.WebviewView;
  private _ws: any = null;
  private _activeRunId: string | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly api: OrkestraApi,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type) {
        case 'ready':
          await this._sendInitialData();
          break;
        case 'startRun':
          await this._startRun(msg.objective, msg.projectId);
          break;
        case 'cancelRun':
          await this._cancelRun(msg.runId);
          break;
        case 'selectRun':
          await this._loadRunDetail(msg.runId);
          break;
        case 'applyFiles':
          await vscode.commands.executeCommand('orkestra.applyFiles', msg.runId);
          break;
        case 'configure':
          await vscode.commands.executeCommand('orkestra.configure');
          break;
        case 'refresh':
          await this._sendInitialData();
          break;
        case 'openBrowser':
          vscode.env.openExternal(vscode.Uri.parse(msg.url));
          break;
      }
    });
  }

  show() {
    if (this._view) {
      this._view.show(true);
    } else {
      vscode.commands.executeCommand('orkestra.mainView.focus');
    }
  }

  refresh() {
    if (this._view) {
      this._sendInitialData();
    }
  }

  triggerNewRun(selection?: string) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'triggerNewRun', selection });
    }
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private async _sendInitialData() {
    if (!this.api.isConfigured) {
      this._post({ type: 'notConfigured' });
      return;
    }

    try {
      const [runs, me] = await Promise.allSettled([
        this.api.listRuns(15),
        this.api.getMe(),
      ]);

      this._post({
        type: 'init',
        runs: runs.status === 'fulfilled' ? runs.value : [],
        me: me.status === 'fulfilled' ? me.value : null,
        serverUrl: this.api.serverUrl,
      });
    } catch (e: any) {
      this._post({ type: 'error', message: e.message });
    }
  }

  private async _startRun(objective: string, projectId?: string) {
    if (!this.api.isConfigured) {
      this._post({ type: 'notConfigured' });
      return;
    }

    try {
      this._post({ type: 'runStarting', objective });
      const { run_id } = await this.api.startRun(objective, projectId);
      this._activeRunId = run_id;
      this._post({ type: 'runStarted', runId: run_id, objective });
      this._connectWebSocket(run_id);
      await this._loadRunDetail(run_id);
    } catch (e: any) {
      this._post({ type: 'runError', message: e.message });
    }
  }

  private async _cancelRun(runId: string) {
    try {
      await this.api.cancelRun(runId);
      this._post({ type: 'runCancelled', runId });
      this._disconnectWebSocket();
    } catch (e: any) {
      vscode.window.showErrorMessage(`Cancel failed: ${e.message}`);
    }
  }

  private async _loadRunDetail(runId: string) {
    try {
      const [run, workspace] = await Promise.allSettled([
        this.api.getRun(runId),
        this.api.getWorkspace(runId),
      ]);
      this._post({
        type: 'runDetail',
        run: run.status === 'fulfilled' ? run.value : null,
        workspace: workspace.status === 'fulfilled' ? workspace.value : null,
      });
    } catch {}
  }

  private _connectWebSocket(runId: string) {
    this._disconnectWebSocket();
    this._ws = this.api.openWebSocket(
      (ev) => {
        if (ev.run_id !== runId) return;
        this._post({ type: 'wsEvent', event: ev });

        if (ev.type === 'run_completed' || ev.type === 'run_failed') {
          setTimeout(() => this._loadRunDetail(runId), 800);
          setTimeout(() => this._sendInitialData(), 1000);
          this._disconnectWebSocket();
        }
      },
      () => {
        this._post({ type: 'wsDisconnected' });
      }
    );
  }

  private _disconnectWebSocket() {
    if (this._ws) {
      try { this._ws.close(); } catch {}
      this._ws = null;
    }
  }

  private _post(message: object) {
    this._view?.webview.postMessage(message);
  }

  // ── HTML ──────────────────────────────────────────────────────────────────

  private _getHtml(webview: vscode.Webview): string {
    const jsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'panel.js')
    );
    const csp = [
      `default-src 'none'`,
      `style-src 'unsafe-inline'`,
      `script-src ${webview.cspSource}`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Orkestra AI</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    /* ── Header ── */
    .header {
      padding: 10px 12px 8px;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, #333);
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .header-title { font-weight: 700; font-size: 13px; flex: 1; }
    .header-plan {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    /* ── Sections ── */
    .content { flex: 1; overflow-y: auto; padding: 8px 0; }
    .section { margin-bottom: 4px; }
    .section-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--vscode-sideBarSectionHeader-foreground);
      padding: 4px 12px 2px;
      opacity: 0.7;
    }
    /* ── New Run form ── */
    .run-form { padding: 8px 12px; }
    .run-input {
      width: 100%;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 4px;
      padding: 6px 8px;
      font-size: 12px;
      resize: vertical;
      min-height: 56px;
      font-family: var(--vscode-font-family);
      outline: none;
    }
    .run-input:focus { border-color: var(--vscode-focusBorder); }
    .run-input::placeholder { opacity: 0.5; }
    .run-btn {
      margin-top: 6px;
      width: 100%;
      padding: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .run-btn:hover { background: var(--vscode-button-hoverBackground); }
    .run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    /* ── Selection badge ── */
    .selection-badge {
      margin: 0 12px 6px;
      padding: 4px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 4px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .selection-badge button {
      margin-left: auto;
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      opacity: 0.7;
      font-size: 13px;
      line-height: 1;
    }
    /* ── Streaming output ── */
    .stream-box {
      margin: 0 12px 8px;
      background: var(--vscode-terminal-background, #1e1e1e);
      border-radius: 4px;
      padding: 8px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px;
      max-height: 160px;
      overflow-y: auto;
      color: var(--vscode-terminal-foreground, #ccc);
    }
    .stream-line { margin-bottom: 2px; line-height: 1.4; }
    .stream-line.agent { color: #7c9ef8; font-weight: 600; margin-top: 6px; }
    .stream-line.file { color: #5bb3d0; }
    .stream-line.ok { color: #4ec994; }
    .stream-line.err { color: #f48771; }
    .stream-line.dim { opacity: 0.5; }
    /* ── Run list ── */
    .run-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 12px;
      cursor: pointer;
      border-radius: 0;
      transition: background 0.1s;
    }
    .run-item:hover { background: var(--vscode-list-hoverBackground); }
    .run-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .run-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .run-dot.running  { background: #4ec994; animation: pulse 1.2s infinite; }
    .run-dot.completed { background: #4ec994; }
    .run-dot.failed   { background: #f48771; }
    .run-dot.pending  { background: #888; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .run-obj { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .run-status { font-size: 10px; opacity: 0.6; flex-shrink: 0; }
    /* ── Run detail ── */
    .detail { padding: 8px 12px; }
    .detail-title { font-size: 12px; font-weight: 600; margin-bottom: 8px; }
    .agent-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      font-size: 11px;
    }
    .agent-dot {
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
    }
    .file-list { margin-top: 6px; }
    .file-chip {
      display: inline-block;
      padding: 2px 6px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 3px;
      font-size: 10px;
      font-family: monospace;
      margin: 2px 2px 0 0;
    }
    .detail-actions { display: flex; gap: 6px; margin-top: 10px; }
    .btn-sm {
      padding: 4px 10px;
      font-size: 11px;
      border: 1px solid var(--vscode-button-secondaryBorder, #555);
      border-radius: 3px;
      cursor: pointer;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      display: flex; align-items: center; gap: 4px;
    }
    .btn-sm:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-sm.primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-color: transparent;
    }
    .btn-sm.danger { border-color: #f48771; color: #f48771; }
    /* ── Not configured ── */
    .setup {
      padding: 20px 12px;
      text-align: center;
    }
    .setup p { font-size: 12px; opacity: 0.7; margin-bottom: 12px; line-height: 1.5; }
    /* ── Misc ── */
    .spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .empty { padding: 16px 12px; text-align: center; font-size: 12px; opacity: 0.5; }
    .divider { border: none; border-top: 1px solid var(--vscode-sideBarSectionHeader-border, #333); margin: 4px 0; }
  </style>
</head>
<body>
<div class="header">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  </svg>
  <span class="header-title">Orkestra AI</span>
  <span class="header-plan" id="planBadge">free</span>
</div>

<div class="content" id="content">
  <div class="empty"><span class="spinner"></span> Loading...</div>
</div>

<script src="${jsUri}"></script>

</body>
</html>`;
  }
}

// Register as WebviewViewProvider
export class OrkestraViewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly panel: OrkestraPanel,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken,
  ) {
    this.panel.resolveWebviewView(webviewView, context, token);
  }
}
