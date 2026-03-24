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
exports.OrkestraViewProvider = exports.OrkestraPanel = void 0;
const vscode = __importStar(require("vscode"));
class OrkestraPanel {
    constructor(context, api) {
        this.context = context;
        this.api = api;
        this._ws = null;
        this._activeRunId = null;
    }
    resolveWebviewView(webviewView, _context, _token) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtml();
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
        }
        else {
            vscode.commands.executeCommand('orkestra.mainView.focus');
        }
    }
    refresh() {
        if (this._view) {
            this._sendInitialData();
        }
    }
    triggerNewRun(selection) {
        if (this._view) {
            this._view.webview.postMessage({ type: 'triggerNewRun', selection });
        }
    }
    // ── Private ─────────────────────────────────────────────────────────────
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
    async _startRun(objective, projectId) {
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
        }, () => {
            this._post({ type: 'wsDisconnected' });
        });
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
    _post(message) {
        this._view?.webview.postMessage(message);
    }
    // ── HTML ──────────────────────────────────────────────────────────────────
    _getHtml() {
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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

<script>
  const vscode = acquireVsCodeApi();
  let state = { runs: [], me: null, selectedRunId: null, activeRunId: null, streaming: [], selection: null };

  // ── Message from extension host ─────────────────────────────────────────
  window.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'init':
        state.runs = data.runs || [];
        state.me = data.me;
        state.serverUrl = data.serverUrl;
        render();
        break;
      case 'notConfigured':
        renderNotConfigured();
        break;
      case 'triggerNewRun':
        state.selection = data.selection || null;
        render();
        setTimeout(() => document.getElementById('objective')?.focus(), 50);
        break;
      case 'runStarting':
        state.streaming = [{ cls: 'dim', text: '⟳ Starting run...' }];
        state.activeRunId = null;
        render();
        break;
      case 'runStarted':
        state.activeRunId = data.runId;
        state.selectedRunId = data.runId;
        state.streaming = [{ cls: 'ok', text: '✓ Run started: ' + data.runId.slice(0,8) + '...' }];
        render();
        break;
      case 'runError':
        state.streaming.push({ cls: 'err', text: '✗ ' + data.message });
        renderStreaming();
        break;
      case 'runCancelled':
        state.activeRunId = null;
        state.streaming.push({ cls: 'dim', text: '⊘ Cancelled' });
        renderStreaming();
        break;
      case 'wsEvent':
        handleWsEvent(data.event);
        break;
      case 'wsDisconnected':
        state.activeRunId = null;
        break;
      case 'runDetail':
        state.runDetail = data.run;
        state.runWorkspace = data.workspace;
        render();
        break;
    }
  });

  function handleWsEvent(ev) {
    const t = ev.type;
    if (t === 'token_chunk') {
      const last = state.streaming[state.streaming.length - 1];
      if (last && last.streaming) {
        last.text += ev.chunk || '';
      } else {
        state.streaming.push({ cls: 'agent', text: '[' + (ev.agent || '?') + '] ', streaming: true });
        const l = state.streaming[state.streaming.length - 1];
        l.text += ev.chunk || '';
      }
      renderStreaming();
      return;
    }
    // Clear streaming flag on node complete
    if (t === 'node_completed') {
      const last = state.streaming[state.streaming.length - 1];
      if (last && last.streaming) { last.streaming = false; state.streaming.push({ cls: 'dim', text: '' }); }
    }
    if (t === 'file_written') {
      state.streaming.push({ cls: 'file', text: '📄 ' + ev.path });
    } else if (t === 'node_started') {
      state.streaming.push({ cls: 'agent', text: '▶ ' + (ev.agent || '') + ' agent starting...' });
    } else if (t === 'run_completed') {
      state.streaming.push({ cls: 'ok', text: '🎉 Run completed!' });
      state.activeRunId = null;
    } else if (t === 'run_failed') {
      state.streaming.push({ cls: 'err', text: '✗ Run failed: ' + (ev.error || '') });
      state.activeRunId = null;
    } else if (t === 'command_output' && ev.line) {
      state.streaming.push({ cls: ev.stderr ? 'err' : 'dim', text: '$ ' + ev.line });
    }
    renderStreaming();
  }

  // ── Renders ─────────────────────────────────────────────────────────────

  function render() {
    const content = document.getElementById('content');
    const plan = state.me?.organization?.plan || 'free';
    document.getElementById('planBadge').textContent = plan;

    let html = '';

    // New Run section
    html += '<div class="section">';
    html += '<div class="section-title">New Run</div>';
    if (state.selection) {
      html += '<div class="selection-badge">📎 Selection attached <button onclick="clearSelection()">✕</button></div>';
    }
    html += '<div class="run-form">';
    html += '<textarea id="objective" class="run-input" placeholder="Describe your coding task..." rows="3" onkeydown="handleKeydown(event)"></textarea>';
    html += '<button class="run-btn" onclick="startRun()" id="runBtn">▶ Start Run</button>';
    html += '</div>';
    html += '</div>';

    // Streaming output
    if (state.streaming.length > 0) {
      html += '<hr class="divider">';
      html += renderStreamingHtml();
    }

    // Selected run detail
    if (state.selectedRunId && state.runDetail) {
      html += '<hr class="divider">';
      html += renderDetailHtml();
    }

    // Runs list
    html += '<hr class="divider">';
    html += '<div class="section">';
    html += '<div class="section-title">Recent Runs</div>';
    if (state.runs.length === 0) {
      html += '<div class="empty">No runs yet</div>';
    } else {
      state.runs.forEach(run => {
        const obj = (run.task_objective || run.objective || 'Untitled').slice(0, 48);
        const status = run.status || 'pending';
        const isSelected = run.run_id === state.selectedRunId;
        html += '<div class="run-item' + (isSelected ? ' active' : '') + '" onclick="selectRun(\'' + run.run_id + '\')">';
        html += '<div class="run-dot ' + status + '"></div>';
        html += '<span class="run-obj">' + escHtml(obj) + '</span>';
        html += '<span class="run-status">' + status + '</span>';
        html += '</div>';
      });
    }
    html += '</div>';

    content.innerHTML = html;

    // If there's a selection, fill it in objective
    if (state.selection) {
      const ta = document.getElementById('objective');
      if (ta && !ta.value) ta.value = state.selection;
    }

    // Scroll stream to bottom
    scrollStream();
  }

  function renderStreamingHtml() {
    let html = '<div class="section"><div class="section-title">Output</div>';
    html += '<div class="stream-box" id="streamBox">';
    state.streaming.slice(-80).forEach(line => {
      html += '<div class="stream-line ' + line.cls + '">' + escHtml(line.text) + '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderStreaming() {
    const box = document.getElementById('streamBox');
    if (!box) { render(); return; }
    box.innerHTML = state.streaming.slice(-80).map(line =>
      '<div class="stream-line ' + line.cls + '">' + escHtml(line.text) + '</div>'
    ).join('');
    scrollStream();
  }

  function renderDetailHtml() {
    const run = state.runDetail;
    if (!run) return '';
    const ws = state.runWorkspace;
    const files = ws?.files || [];
    const isRunning = run.status === 'running' || run.status === 'pending';

    let html = '<div class="section"><div class="section-title">Run Detail</div><div class="detail">';
    html += '<div class="detail-title">' + escHtml((run.task_objective || '').slice(0, 60)) + '</div>';

    // Agent rows
    (run.nodes || []).forEach(node => {
      const dotColor = node.status === 'completed' ? '#4ec994' : node.status === 'failed' ? '#f48771' : node.status === 'running' ? '#7c9ef8' : '#888';
      html += '<div class="agent-row">';
      html += '<div class="agent-dot" style="background:' + dotColor + '"></div>';
      html += '<span>' + escHtml(node.agent_name) + '</span>';
      html += '<span style="margin-left:auto;font-size:10px;opacity:0.6">' + node.status + '</span>';
      html += '</div>';
    });

    // Files
    if (files.length > 0) {
      html += '<div class="file-list">';
      files.slice(0, 10).forEach(f => {
        html += '<span class="file-chip">' + escHtml(f) + '</span>';
      });
      if (files.length > 10) html += '<span class="file-chip">+' + (files.length - 10) + ' more</span>';
      html += '</div>';
    }

    // Actions
    html += '<div class="detail-actions">';
    if (isRunning) {
      html += '<button class="btn-sm danger" onclick="cancelRun(\'' + run.run_id + '\')">■ Cancel</button>';
    } else {
      if (files.length > 0) {
        html += '<button class="btn-sm primary" onclick="applyFiles(\'' + run.run_id + '\')">⬇ Apply Files</button>';
      }
      html += '<button class="btn-sm" onclick="openInBrowser(\'' + run.run_id + '\')">↗ Open in Browser</button>';
    }
    html += '</div>';

    html += '</div></div>';
    return html;
  }

  function renderNotConfigured() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="setup">' +
      '<p>Set your Orkestra API key to get started.</p>' +
      '<button class="run-btn" onclick="configure()">⚙ Configure API Key</button>' +
      '</div>';
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function startRun() {
    const ta = document.getElementById('objective');
    const obj = ta.value.trim();
    if (!obj) return;
    let fullObj = obj;
    if (state.selection && !obj.includes(state.selection)) {
      fullObj = obj + '\n\nContext:\n' + state.selection;
    }
    state.streaming = [];
    ta.value = '';
    vscode.postMessage({ type: 'startRun', objective: fullObj });
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startRun(); }
  }

  function selectRun(runId) {
    state.selectedRunId = runId;
    state.runDetail = null;
    state.runWorkspace = null;
    render();
    vscode.postMessage({ type: 'selectRun', runId });
  }

  function cancelRun(runId) {
    vscode.postMessage({ type: 'cancelRun', runId });
  }

  function applyFiles(runId) {
    vscode.postMessage({ type: 'applyFiles', runId });
  }

  function openInBrowser(runId) {
    const base = state.serverUrl ? state.serverUrl.replace(':8001', ':3000') : 'http://localhost:3000';
    vscode.postMessage({ type: 'openBrowser', url: base + '/dashboard/runs/' + runId });
  }

  function clearSelection() {
    state.selection = null;
    render();
  }

  function configure() {
    vscode.postMessage({ type: 'configure' });
  }

  function scrollStream() {
    const box = document.getElementById('streamBox');
    if (box) box.scrollTop = box.scrollHeight;
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Bootstrap
  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    }
}
exports.OrkestraPanel = OrkestraPanel;
// Register as WebviewViewProvider
class OrkestraViewProvider {
    constructor(context, panel) {
        this.context = context;
        this.panel = panel;
    }
    resolveWebviewView(webviewView, context, token) {
        this.panel.resolveWebviewView(webviewView, context, token);
    }
}
exports.OrkestraViewProvider = OrkestraViewProvider;
//# sourceMappingURL=panel.js.map