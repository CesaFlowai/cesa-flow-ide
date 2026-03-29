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
exports.registerInlineEdit = registerInlineEdit;
exports.registerTabCompletion = registerTabCompletion;
const vscode = __importStar(require("vscode"));
// ── Diff Content Provider ──────────────────────────────────────────────────
// Serves virtual document content for the diff view without creating temp files.
class DiffContentProvider {
    constructor() {
        this._store = new Map();
    }
    provideTextDocumentContent(uri) {
        return this._store.get(uri.toString()) ?? '';
    }
    set(uri, content) {
        this._store.set(uri.toString(), content);
    }
    delete(uri) {
        this._store.delete(uri.toString());
    }
}
// ── Cmd+K Inline Edit ──────────────────────────────────────────────────────
function registerInlineEdit(context, api) {
    const diffProvider = new DiffContentProvider();
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('cesaflow-diff', diffProvider));
    context.subscriptions.push(vscode.commands.registerTextEditorCommand('orkestra.inlineEdit', async (editor) => {
        const sel = editor.selection;
        const isFullFile = sel.isEmpty;
        const selectedText = editor.document.getText(isFullFile ? undefined : sel);
        const lang = editor.document.languageId;
        const filename = editor.document.fileName.split(/[\\/]/).pop() || 'file';
        const codeContext = selectedText || editor.document.getText().slice(0, 8000);
        const instruction = await vscode.window.showInputBox({
            prompt: isFullFile
                ? `What should CesaFlow do with ${filename}?`
                : `What should CesaFlow do with the selected ${lang} code?`,
            placeHolder: 'e.g. "Add error handling", "Convert to async", "Add TypeScript types"',
            ignoreFocusOut: true,
        });
        if (!instruction)
            return;
        let newCode;
        let summary;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `CesaFlow: ${instruction}`,
            cancellable: false,
        }, async () => {
            try {
                const result = await api.inlineEdit({
                    code: codeContext,
                    instruction,
                    language: lang,
                    filename,
                });
                newCode = result?.edited_code;
                summary = result?.summary;
            }
            catch (e) {
                vscode.window.showErrorMessage(`CesaFlow: ${e.message}`);
            }
        });
        if (!newCode) {
            vscode.window.showWarningMessage('CesaFlow: No changes produced.');
            return;
        }
        // ── Show diff view immediately ──────────────────────────────────────
        const key = Date.now().toString();
        const originalUri = vscode.Uri.parse(`cesaflow-diff:original/${key}/${encodeURIComponent(filename)}`);
        const modifiedUri = vscode.Uri.parse(`cesaflow-diff:modified/${key}/${encodeURIComponent(filename)}`);
        diffProvider.set(originalUri, codeContext);
        diffProvider.set(modifiedUri, newCode);
        // Open diff — user sees changes before accepting
        await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, `CesaFlow ✦ ${summary || instruction}`);
        const action = await vscode.window.showInformationMessage(summary ? `✦ ${summary}` : `✦ Changes ready — accept or reject?`, { modal: false }, 'Accept', 'Reject');
        // Close the diff editor
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        diffProvider.delete(originalUri);
        diffProvider.delete(modifiedUri);
        if (action === 'Accept') {
            await editor.edit((eb) => {
                if (isFullFile) {
                    const fullRange = new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length));
                    eb.replace(fullRange, newCode);
                }
                else {
                    eb.replace(sel, newCode);
                }
            });
            vscode.window.setStatusBarMessage('CesaFlow: Changes applied ✓', 3000);
        }
        // 'Reject' or dismiss → do nothing
    }));
}
// ── Tab Completion ─────────────────────────────────────────────────────────
function registerTabCompletion(context, api) {
    const provider = {
        async provideInlineCompletionItems(document, position, _ctx, token) {
            if (!api.isConfigured)
                return [];
            const offset = document.offsetAt(position);
            const text = document.getText();
            const prefix = text.slice(Math.max(0, offset - 1500), offset);
            const suffix = text.slice(offset, Math.min(text.length, offset + 200));
            const currentLine = document.lineAt(position).text.trimEnd();
            if (currentLine.length < 2)
                return [];
            try {
                const result = await api.complete({
                    prefix,
                    suffix,
                    language: document.languageId,
                    filename: document.fileName.split(/[\\/]/).pop() || '',
                });
                if (!result?.completion || token.isCancellationRequested)
                    return [];
                return [
                    new vscode.InlineCompletionItem(result.completion, new vscode.Range(position, position)),
                ];
            }
            catch {
                return [];
            }
        },
    };
    context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider));
}
//# sourceMappingURL=inline.js.map