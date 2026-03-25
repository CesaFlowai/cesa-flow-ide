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
exports.CesaFlowPanel = void 0;
const vscode = __importStar(require("vscode"));
class CesaFlowPanel {
    constructor(context, api) {
        this.context = context;
        this.api = api;
        this._ws = null;
    }
    show() { this._open(); }
    refresh() { if (this._panel)
        this._sendData(); }
    triggerNewRun(selection) {
        this._open();
        if (selection)
            setTimeout(() => this._post({ type: 'prefill', text: selection }), 400);
    }
    _open() {
        if (this._panel) {
            this._panel.reveal(vscode.ViewColumn.One);
            this._sendData();
            return;
        }
        this._panel = vscode.window.createWebviewPanel('cesaflow.mainPanel', 'CesaFlow AI', vscode.ViewColumn.One, {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
        });
        this._panel.webview.html = this._html();
        this._panel.webview.onDidReceiveMessage(this._onMsg.bind(this));
        this._panel.onDidDispose(() => {
            this._panel = undefined;
            this._disconnectWS();
        });
        setTimeout(() => this._sendData(), 300);
    }
    async _onMsg(msg) {
        switch (msg.type) {
            case 'ready':
                await this._sendData();
                break;
            case 'startRun':
                await this._startRun(msg.objective);
                break;
            case 'cancelRun':
                await this._cancelRun(msg.runId);
                break;
            case 'applyFiles':
                await vscode.commands.executeCommand('cesaflow.applyFiles', msg.runId);
                break;
            case 'configure':
                await vscode.commands.executeCommand('cesaflow.configure');
                break;
            case 'refresh':
                await this._sendData();
                break;
        }
    }
    async _sendData() {
        if (!this.api.isConfigured) {
            // No API key → show welcome screen instead of inline form
            this._panel?.dispose();
            vscode.commands.executeCommand('cesaflow.welcome');
            return;
        }
        try {
            const runs = await this.api.listRuns(20);
            this._post({ type: 'init', runs, serverUrl: this.api.serverUrl });
        }
        catch (e) {
            this._post({ type: 'error', message: e.message });
        }
    }
    async _startRun(objective) {
        try {
            this._post({ type: 'runStarting', objective });
            const { run_id } = await this.api.startRun(objective);
            this._post({ type: 'runStarted', runId: run_id });
            this._connectWS(run_id);
            await this._sendData();
        }
        catch (e) {
            this._post({ type: 'runError', message: e.message });
        }
    }
    async _cancelRun(runId) {
        try {
            await this.api.cancelRun(runId);
            this._post({ type: 'runCancelled', runId });
            this._disconnectWS();
            await this._sendData();
        }
        catch (e) {
            this._post({ type: 'error', message: e.message });
        }
    }
    _connectWS(runId) {
        this._disconnectWS();
        this._ws = this.api.openWebSocket((ev) => {
            if (ev.run_id !== runId)
                return;
            this._post({ type: 'wsEvent', event: ev });
            if (ev.type === 'run_completed' || ev.type === 'run_failed') {
                setTimeout(() => this._sendData(), 600);
                this._disconnectWS();
            }
        }, () => this._post({ type: 'wsDisconnected' }));
    }
    _disconnectWS() {
        if (this._ws) {
            try {
                this._ws.close();
            }
            catch { }
            this._ws = null;
        }
    }
    _post(msg) { this._panel?.webview.postMessage(msg); }
    _html() {
        const webview = this._panel.webview;
        const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'panel.js'));
        const csp = [
            `default-src 'none'`,
            `style-src 'unsafe-inline'`,
            `script-src ${webview.cspSource}`,
            `img-src ${webview.cspSource} data:`,
        ].join('; ');
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>CesaFlow AI</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:13px;background:var(--vscode-editor-background);color:var(--vscode-foreground);display:flex;flex-direction:column;height:100vh;overflow:hidden}
.header{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0}
.header-logo{font-size:18px}
.header-title{font-weight:700;font-size:14px;flex:1}
.btn-small{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:none;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:inherit;white-space:nowrap}
.btn-small:hover{opacity:.8}
.btn-danger{background:#ef444420;color:#ef4444;border:1px solid #ef444440}
#mainContent{flex:1;overflow-y:auto;display:flex;flex-direction:column}
.new-run{padding:12px 16px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0}
.new-run-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--vscode-descriptionForeground);margin-bottom:6px}
.new-run-row{display:flex;gap:8px}
.new-run-input{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:8px 12px;font-size:13px;outline:none;font-family:inherit}
.new-run-input:focus{border-color:var(--vscode-focusBorder)}
.new-run-input::placeholder{color:var(--vscode-input-placeholderForeground)}
.btn-primary{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit}
.btn-primary:hover{background:var(--vscode-button-hoverBackground)}
.runs-section{flex:1;overflow-y:auto;padding:8px 0}
.section-header{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.6px;color:var(--vscode-descriptionForeground);padding:4px 16px 6px}
.run-item{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;border-left:3px solid transparent}
.run-item:hover{background:var(--vscode-list-hoverBackground)}
.run-item.active{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground);border-left-color:var(--vscode-focusBorder)}
.run-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot-running{background:#3b82f6;animation:pulse 1.5s ease-in-out infinite}
.dot-completed{background:#22c55e}
.dot-failed{background:#ef4444}
.dot-pending{background:#f59e0b}
.dot-other{background:#6b7280}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.run-text{flex:1;min-width:0}
.run-obj{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.run-meta{font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px}
.detail{flex-shrink:0;border-top:1px solid var(--vscode-panel-border);max-height:50vh;overflow-y:auto;display:none}
.detail.open{display:block}
.detail-header{display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid var(--vscode-panel-border)}
.detail-title{font-size:12px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.log-box{padding:10px 16px;font-family:var(--vscode-editor-font-family,monospace);font-size:12px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;background:var(--vscode-terminal-background,#1e1e1e);color:var(--vscode-terminal-foreground,#ccc);border-bottom:1px solid var(--vscode-panel-border)}
.agents{padding:8px 0}
.agent-row{display:flex;align-items:center;gap:8px;padding:6px 16px}
.agent-icon{font-size:14px}
.agent-name{font-size:12px;font-weight:600;flex:1}
.agent-status{font-size:11px;color:var(--vscode-descriptionForeground)}
.empty{padding:32px 16px;text-align:center;color:var(--vscode-descriptionForeground)}
.empty-icon{font-size:32px;margin-bottom:12px}
.empty-title{font-size:13px;font-weight:600;color:var(--vscode-foreground);margin-bottom:6px}
.empty-text{font-size:12px;line-height:1.5}
.setup-box{padding:20px 16px}
.setup-box h3{font-size:14px;font-weight:700;margin-bottom:8px}
.setup-box p{font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:12px;line-height:1.5}
.input-row{display:flex;gap:8px;margin-bottom:8px}
.url-input{width:160px;flex-shrink:0;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:8px 10px;font-size:12px;outline:none;font-family:inherit}
.key-input{flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:6px;padding:8px 10px;font-size:12px;outline:none;font-family:inherit}
</style>
</head>
<body>
<div class="header">
  <div class="header-logo">&#9889;</div>
  <div class="header-title">CesaFlow AI</div>
  <button class="btn-small" onclick="cesaflowRefresh()">&#8635; Refresh</button>
</div>

<div id="mainContent">
  <div class="empty">
    <div class="empty-title">Connecting...</div>
  </div>
</div>

<div class="detail" id="detailPanel">
  <div class="detail-header">
    <div class="detail-title" id="detailTitle">Run Details</div>
    <button class="btn-small btn-danger" id="cancelBtn" style="display:none" onclick="cesaflowCancel()">&#9632; Stop</button>
    <button class="btn-small" id="applyBtn" style="display:none" onclick="cesaflowApply()">&#10003; Apply Files</button>
    <button class="btn-small" onclick="cesaflowCloseDetail()">&#215;</button>
  </div>
  <div class="log-box" id="logBox"></div>
  <div class="agents" id="agentList"></div>
</div>

<script src="${jsUri}"></script>
</body>
</html>`;
    }
}
exports.CesaFlowPanel = CesaFlowPanel;
//# sourceMappingURL=panel.js.map