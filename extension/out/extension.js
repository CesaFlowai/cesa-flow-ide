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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const panel_1 = require("./panel");
const api_1 = require("./api");
const welcome_1 = require("./welcome");
const settings_1 = require("./settings");
const inline_1 = require("./inline");
function activate(context) {
    const api = new api_1.OrkestraApi();
    const panel = new panel_1.OrkestraPanel(context, api);
    // Register as native sidebar panel (Activity Bar)
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(panel_1.OrkestraPanel.viewType, panel, { webviewOptions: { retainContextWhenHidden: true } }));
    // Auto-open sidebar on first launch of each new version
    const version = context.extension.packageJSON.version;
    const sidebarOpenKey = `cesaflow.sidebarOpened.${version}`;
    if (!context.globalState.get(sidebarOpenKey)) {
        context.globalState.update(sidebarOpenKey, true);
        setTimeout(() => {
            vscode.commands.executeCommand('workbench.view.extension.cesaflow');
        }, 800);
    }
    // ── Core commands ────────────────────────────────────────────────────────
    context.subscriptions.push(vscode.commands.registerCommand('orkestra.newRun', async () => {
        const selection = getEditorSelection();
        panel.triggerNewRun(selection);
    }), vscode.commands.registerCommand('orkestra.openPanel', () => {
        panel.show();
    }), vscode.commands.registerCommand('orkestra.sendSelection', async () => {
        const selection = getEditorSelection();
        if (!selection) {
            vscode.window.showWarningMessage('CesaFlow: No text selected.');
            return;
        }
        panel.switchToChat(selection);
    }), vscode.commands.registerCommand('orkestra.configure', async () => {
        const key = await vscode.window.showInputBox({
            prompt: 'Enter your CesaFlow API key (sk_...)',
            password: true,
            placeHolder: 'sk_...',
            ignoreFocusOut: true,
        });
        if (key) {
            await vscode.workspace.getConfiguration('orkestra').update('apiKey', key, true);
            vscode.window.showInformationMessage('CesaFlow: API key saved ✓');
            panel.refresh();
        }
    }), vscode.commands.registerCommand('orkestra.refreshRuns', () => {
        panel.refresh();
    }), vscode.commands.registerCommand('orkestra.cancelRun', async (runId) => {
        await api.cancelRun(runId);
        panel.refresh();
    }), vscode.commands.registerCommand('orkestra.downloadRun', async (runId) => {
        vscode.window.showInformationMessage(`CesaFlow: Download run ${runId} from the dashboard.`);
    }), vscode.commands.registerCommand('orkestra.applyFiles', async (runId) => {
        await applyFilesToWorkspace(api, runId);
    }), vscode.commands.registerCommand('orkestra.chat', () => {
        const editor = vscode.window.activeTextEditor;
        let ctx = '';
        if (editor) {
            const sel = editor.selection;
            const text = sel.isEmpty
                ? editor.document.getText().slice(0, 6000)
                : editor.document.getText(sel);
            const filename = editor.document.fileName.split(/[\\/]/).pop();
            const lang = editor.document.languageId;
            ctx = `File: ${filename} (${lang})\n\`\`\`${lang}\n${text}\n\`\`\``;
        }
        panel.switchToChat(ctx);
    }));
    // ── Phase 2: Inline edit, Tab completion ────────────────────────────────
    (0, inline_1.registerInlineEdit)(context, api);
    (0, inline_1.registerTabCompletion)(context, api);
    // ── Welcome screen ───────────────────────────────────────────────────────
    (0, welcome_1.registerWelcome)(context);
    // ── Settings panel ───────────────────────────────────────────────────────
    (0, settings_1.registerSettings)(context);
    // ── Status bar ───────────────────────────────────────────────────────────
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'workbench.view.extension.cesaflow';
    statusBar.tooltip = 'Open CesaFlow AI Panel';
    statusBar.show();
    context.subscriptions.push(statusBar);
    function updateStatusBar() {
        if (api.isConfigured) {
            statusBar.text = '$(sparkle) CesaFlow';
            statusBar.color = undefined;
        }
        else {
            statusBar.text = '$(warning) CesaFlow: setup required';
            statusBar.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        }
    }
    updateStatusBar();
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('orkestra')) {
            updateStatusBar();
        }
    }));
    const settingsBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    settingsBar.command = 'orkestra.settings';
    settingsBar.text = '$(settings-gear)';
    settingsBar.tooltip = 'CesaFlow Settings';
    settingsBar.show();
    context.subscriptions.push(settingsBar);
}
function getEditorSelection() {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
        return undefined;
    const sel = editor.selection;
    if (sel.isEmpty)
        return undefined;
    const text = editor.document.getText(sel);
    const filename = editor.document.fileName.split(/[\\/]/).pop();
    const lang = editor.document.languageId;
    return `File: ${filename} (${lang})\n\`\`\`${lang}\n${text}\n\`\`\``;
}
async function applyFilesToWorkspace(api, runId) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('CesaFlow: No workspace folder open.');
        return;
    }
    const confirm = await vscode.window.showWarningMessage('Apply all generated files to this workspace? Existing files will be overwritten.', { modal: true }, 'Apply');
    if (confirm !== 'Apply')
        return;
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'CesaFlow: Applying files...', cancellable: false }, async (progress) => {
        try {
            const workspace = await api.getWorkspace(runId);
            const files = workspace.files || [];
            progress.report({ message: `Writing ${files.length} files...` });
            for (const filePath of files) {
                const fileData = await api.getFile(runId, filePath);
                const targetUri = vscode.Uri.joinPath(workspaceFolder, filePath);
                const parentUri = vscode.Uri.joinPath(targetUri, '..');
                try {
                    await vscode.workspace.fs.createDirectory(parentUri);
                }
                catch { }
                await vscode.workspace.fs.writeFile(targetUri, Buffer.from(fileData.content, 'utf-8'));
            }
            vscode.window.showInformationMessage(`CesaFlow: ${files.length} files applied to workspace ✓`, 'Open Explorer').then(action => {
                if (action === 'Open Explorer') {
                    vscode.commands.executeCommand('workbench.view.explorer');
                }
            });
        }
        catch (e) {
            vscode.window.showErrorMessage(`CesaFlow: Failed to apply files — ${e.message}`);
        }
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map