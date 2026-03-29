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
exports.OrkestraPanel = void 0;
const vscode = __importStar(require("vscode"));
class OrkestraPanel {
    constructor(context, api) {
        this.context = context;
        this.api = api;
        this._ws = null;
        this._activeRunId = null;
    }
    // Called by VS Code when the sidebar view becomes visible for the first time
    resolveWebviewView(webviewView, _context, _token) {
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
                case 'chat':
                    await this._handleChat(msg.message, msg.context, msg.model);
                    break;
                case 'startRun':
                    await this._startRun(msg.objective);
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
                    await vscode.commands.executeCommand('orkestra.settings');
                    break;
                case 'openSettings':
                    await vscode.commands.executeCommand('orkestra.settings');
                    break;
                case 'refresh':
                    await this._sendInitialData();
                    break;
                case 'openBrowser':
                    vscode.env.openExternal(vscode.Uri.parse(msg.url));
                    break;
                case 'copyToClipboard':
                    vscode.env.clipboard.writeText(msg.text);
                    break;
                case 'insertCode':
                    this._insertCodeToEditor(msg.code);
                    break;
            }
        });
        webviewView.onDidDispose(() => {
            if (this._ws) {
                try {
                    this._ws.close();
                }
                catch { }
                this._ws = null;
            }
            this._view = undefined;
        });
        // Load data immediately when view resolves
        this._sendInitialData();
    }
    show() {
        vscode.commands.executeCommand('workbench.view.extension.cesaflow');
    }
    switchToChat(context) {
        this.show();
        setTimeout(() => {
            this._post({ type: 'switchToChat', context });
        }, 400);
    }
    triggerNewRun(selection) {
        this.show();
        setTimeout(() => {
            this._post({ type: 'triggerNewRun', selection });
        }, 400);
    }
    refresh() {
        this._sendInitialData();
    }
    // ── Private ──
    async _sendInitialData() {
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
        }
        catch (e) {
            this._post({ type: 'error', message: e.message });
        }
    }
    async _handleChat(message, context, model) {
        this._post({ type: 'thinking', value: true });
        try {
            const result = await this.api.chat({ message, context, model });
            this._post({
                type: 'chatResponse',
                text: result?.reply || 'No response.',
                hasCode: result?.has_code || false,
                code: result?.code || '',
                language: result?.language || 'text',
            });
        }
        catch (e) {
            this._post({ type: 'chatResponse', text: `Error: ${e.message}`, hasCode: false });
        }
        finally {
            this._post({ type: 'thinking', value: false });
        }
    }
    async _startRun(objective) {
        if (!this.api.isConfigured) {
            this._post({ type: 'notConfigured' });
            return;
        }
        try {
            this._post({ type: 'runStarting', objective });
            const { run_id } = await this.api.startRun(objective);
            this._activeRunId = run_id;
            this._post({ type: 'runStarted', runId: run_id, objective });
            this._connectWebSocket(run_id);
            await this._loadRunDetail(run_id);
        }
        catch (e) {
            this._post({ type: 'runError', message: e.message });
        }
    }
    async _cancelRun(runId) {
        try {
            await this.api.cancelRun(runId);
            this._post({ type: 'runCancelled', runId });
            this._disconnectWebSocket();
        }
        catch (e) {
            vscode.window.showErrorMessage(`Cancel failed: ${e.message}`);
        }
    }
    async _loadRunDetail(runId) {
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
        }
        catch { }
    }
    _connectWebSocket(runId) {
        this._disconnectWebSocket();
        this._ws = this.api.openWebSocket((ev) => {
            if (ev.run_id !== runId)
                return;
            this._post({ type: 'wsEvent', event: ev });
            if (ev.type === 'run_completed' || ev.type === 'run_failed') {
                setTimeout(() => this._loadRunDetail(runId), 800);
                setTimeout(() => this._sendInitialData(), 1000);
                this._disconnectWebSocket();
            }
        }, () => { this._post({ type: 'wsDisconnected' }); });
    }
    _disconnectWebSocket() {
        if (this._ws) {
            try {
                this._ws.close();
            }
            catch { }
            this._ws = null;
        }
    }
    _insertCodeToEditor(code) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('CesaFlow: Open a file to insert code.');
            return;
        }
        editor.edit((eb) => eb.replace(editor.selection, code));
    }
    _post(message) {
        this._view?.webview.postMessage(message);
    }
    _getHtml(webview) {
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'panel.js'));
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
  <title>CesaFlow AI</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      height: 100vh; display: flex; flex-direction: column; overflow: hidden;
    }
    .header {
      padding: 10px 16px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      display: flex; align-items: center; gap: 8px; flex-shrink: 0;
    }
    .header-title { font-weight: 700; font-size: 14px; flex: 1; }
    .header-plan {
      font-size: 10px; padding: 2px 7px; border-radius: 10px;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .tabs {
      display: flex; border-bottom: 1px solid var(--vscode-panel-border, #333);
      flex-shrink: 0; background: var(--vscode-editorGroupHeader-tabsBackground);
    }
    .tab {
      flex: 1; padding: 8px 12px; background: none; border: none;
      color: var(--vscode-foreground); cursor: pointer; font-size: 12px;
      opacity: 0.55; border-bottom: 2px solid transparent; transition: all 0.15s;
      font-family: var(--vscode-font-family);
    }
    .tab:hover { opacity: 0.85; }
    .tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder, #007acc); font-weight: 600; }
    .tab-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .tab-panel.hidden { display: none; }
    /* ── Chat ── */
    #messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;
    }
    .msg { display: flex; flex-direction: column; }
    .msg.user { align-items: flex-end; }
    .msg.assistant { align-items: flex-start; }
    .bubble {
      padding: 10px 14px; border-radius: 12px;
      font-size: 13px; line-height: 1.55; word-break: break-word; max-width: 88%;
    }
    .user-bubble {
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border-bottom-right-radius: 4px;
    }
    .asst-bubble {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, #444);
      border-bottom-left-radius: 4px;
    }
    .code-block {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px; margin: 6px 0; overflow: hidden;
      font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; max-width: 95%;
    }
    .code-header {
      display: flex; align-items: center; justify-content: space-between; padding: 5px 12px;
      background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    .code-lang { font-size: 10px; opacity: 0.6; }
    .code-actions { display: flex; gap: 4px; }
    .cbtn {
      font-size: 10px; padding: 2px 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none; border-radius: 3px; cursor: pointer;
    }
    .cbtn:hover { opacity: 0.8; }
    code { display: block; padding: 10px 12px; overflow-x: auto; white-space: pre; }
    .thinking {
      display: flex; align-items: center; gap: 5px;
      color: var(--vscode-descriptionForeground); font-size: 12px; padding: 4px 0;
    }
    .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; animation: blink 1.4s ease-in-out infinite; }
    .dot:nth-child(2) { animation-delay: .2s; }
    .dot:nth-child(3) { animation-delay: .4s; }
    @keyframes blink { 0%,80%,100%{opacity:.2} 40%{opacity:1} }
    .input-area {
      padding: 12px 14px; border-top: 1px solid var(--vscode-panel-border, #333); flex-shrink: 0;
    }
    #chatInput {
      width: 100%; resize: none;
      background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 6px; padding: 9px 12px;
      font-family: var(--vscode-font-family); font-size: 13px; outline: none; min-height: 60px;
    }
    #chatInput:focus { border-color: var(--vscode-focusBorder); }
    .input-btns { display: flex; gap: 6px; margin-top: 8px; }
    .input-btn {
      flex: 1; padding: 7px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .input-btn:hover { opacity: 0.9; }
    .input-btn.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    .empty { padding: 24px 16px; text-align: center; font-size: 13px; opacity: 0.45; line-height: 1.6; }
    /* ── Runs ── */
    .runs-content { flex: 1; overflow-y: auto; padding: 8px 0; }
    .section-title {
      font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;
      color: var(--vscode-sideBarSectionHeader-foreground);
      padding: 6px 16px 3px; opacity: 0.7;
    }
    .run-form { padding: 8px 16px; }
    .run-input {
      width: 100%; background: var(--vscode-input-background); color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555); border-radius: 5px;
      padding: 8px 10px; font-size: 13px; resize: vertical; min-height: 56px;
      font-family: var(--vscode-font-family); outline: none;
    }
    .run-input:focus { border-color: var(--vscode-focusBorder); }
    .run-btn {
      margin-top: 7px; width: 100%; padding: 7px;
      background: var(--vscode-button-background); color: var(--vscode-button-foreground);
      border: none; border-radius: 5px; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .run-btn:hover { opacity: 0.9; }
    .run-item {
      display: flex; align-items: center; gap: 8px; padding: 6px 16px; cursor: pointer;
    }
    .run-item:hover { background: var(--vscode-list-hoverBackground); }
    .run-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
    .run-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .run-dot.running { background: #4ec994; animation: blink 1.2s infinite; }
    .run-dot.completed { background: #4ec994; }
    .run-dot.failed { background: #f48771; }
    .run-dot.pending { background: #888; }
    .run-obj { flex: 1; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .run-status { font-size: 10px; opacity: 0.6; flex-shrink: 0; }
    .stream-box {
      margin: 0 16px 8px;
      background: var(--vscode-terminal-background, #1e1e1e);
      border-radius: 5px; padding: 8px 10px;
      font-family: var(--vscode-editor-font-family, monospace); font-size: 11px;
      max-height: 160px; overflow-y: auto;
      color: var(--vscode-terminal-foreground, #ccc);
    }
    .stream-line { margin-bottom: 2px; line-height: 1.4; }
    .stream-line.agent { color: #7c9ef8; font-weight: 600; }
    .stream-line.file { color: #5bb3d0; }
    .stream-line.ok { color: #4ec994; }
    .stream-line.err { color: #f48771; }
    .stream-line.dim { opacity: 0.5; }
    .detail { padding: 6px 16px; }
    .agent-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 12px; }
    .agent-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .file-chip {
      display: inline-block; padding: 2px 6px;
      background: var(--vscode-badge-background); color: var(--vscode-badge-foreground);
      border-radius: 3px; font-size: 10px; font-family: monospace; margin: 2px 2px 0 0;
    }
    .detail-actions { display: flex; gap: 6px; margin-top: 10px; }
    .btn-sm {
      padding: 4px 12px; font-size: 12px;
      border: 1px solid var(--vscode-button-secondaryBorder, #555); border-radius: 4px; cursor: pointer;
      background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
    }
    .btn-sm:hover { opacity: 0.8; }
    .btn-sm.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
    .btn-sm.danger { border-color: #f48771; color: #f48771; background: transparent; }
    .setup { padding: 30px 16px; text-align: center; }
    .setup p { font-size: 13px; opacity: 0.7; margin-bottom: 16px; line-height: 1.6; }
    .divider { border: none; border-top: 1px solid var(--vscode-panel-border, #333); margin: 4px 0; }
    .spinner { display: inline-block; width: 10px; height: 10px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
<div class="header">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
  </svg>
  <span class="header-title">CesaFlow AI</span>
  <span class="header-plan" id="planBadge">free</span>
  <button style="background:none;border:none;cursor:pointer;opacity:0.6;padding:2px 4px;color:inherit;font-size:14px" title="CesaFlow Settings" data-action="openSettings">&#9881;</button>
</div>
<div class="tabs">
  <button class="tab active" id="tab-chat" data-action="switchTab" data-tab="chat">&#128172; Chat</button>
  <button class="tab" id="tab-runs" data-action="switchTab" data-tab="runs">&#9889; Runs</button>
</div>

<div class="tab-panel" id="chat-panel">
  <div id="messages">
    <div class="empty">Ask anything about your code...<br><span style="font-size:11px;opacity:0.6">Enter to send &#8226; Shift+Enter for newline<br>&#9889; "Run as Agent" to start a multi-agent task</span></div>
  </div>
  <div class="input-area">
    <textarea id="chatInput" placeholder="Ask a question or describe a task..." rows="3"></textarea>
    <div class="input-btns">
      <button class="input-btn secondary" data-action="sendChat">&#9658; Chat</button>
      <button class="input-btn" data-action="sendAsRun">&#9889; Run as Agent</button>
    </div>
  </div>
</div>

<div class="tab-panel hidden" id="runs-panel">
  <div class="runs-content" id="runs-content">
    <div class="empty"><span class="spinner"></span> Loading...</div>
  </div>
</div>

<script src="${jsUri}"></script>
</body>
</html>`;
    }
}
exports.OrkestraPanel = OrkestraPanel;
OrkestraPanel.viewType = 'cesaflow.sidebar';
//# sourceMappingURL=panel.js.map