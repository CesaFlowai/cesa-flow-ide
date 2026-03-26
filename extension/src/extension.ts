import * as vscode from 'vscode';
import { OrkestraPanel, OrkestraViewProvider } from './panel';
import { OrkestraApi } from './api';
import { registerWelcome } from './welcome';
import { registerInlineEdit, registerTabCompletion } from './inline';

export function activate(context: vscode.ExtensionContext) {
  const api = new OrkestraApi();
  const panel = new OrkestraPanel(context, api);
  const provider = new OrkestraViewProvider(context, panel);

  // ── Sidebar panel ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('orkestra.mainView', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // ── Core commands ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('orkestra.newRun', async () => {
      const selection = getEditorSelection();
      panel.show();
      panel.triggerNewRun(selection);
    }),

    vscode.commands.registerCommand('orkestra.openPanel', () => {
      panel.show();
    }),

    vscode.commands.registerCommand('orkestra.sendSelection', async () => {
      const selection = getEditorSelection();
      if (!selection) {
        vscode.window.showWarningMessage('Orkestra: No text selected.');
        return;
      }
      panel.show();
      panel.triggerNewRun(selection);
    }),

    vscode.commands.registerCommand('orkestra.configure', async () => {
      const key = await vscode.window.showInputBox({
        prompt: 'Enter your Orkestra API key (sk_...)',
        password: true,
        placeHolder: 'sk_...',
        ignoreFocusOut: true,
      });
      if (key) {
        await vscode.workspace.getConfiguration('orkestra').update('apiKey', key, true);
        vscode.window.showInformationMessage('Orkestra: API key saved ✓');
        panel.refresh();
      }
    }),

    vscode.commands.registerCommand('orkestra.refreshRuns', () => {
      panel.refresh();
    }),

    vscode.commands.registerCommand('orkestra.cancelRun', async (runId: string) => {
      await api.cancelRun(runId);
      panel.refresh();
    }),

    vscode.commands.registerCommand('orkestra.downloadRun', async (runId: string) => {
      vscode.window.showInformationMessage(`Orkestra: Download run ${runId} from the dashboard.`);
    }),

    vscode.commands.registerCommand('orkestra.applyFiles', async (runId: string) => {
      await applyFilesToWorkspace(api, runId);
    }),
  );

  // ── Phase 2: Inline edit (Cmd+K), Tab completion ────────────────────────
  registerInlineEdit(context, api);
  registerTabCompletion(context, api);

  // ── Chat command (Cmd+L) — opens sidebar chat tab with file context ──────
  context.subscriptions.push(
    vscode.commands.registerCommand('orkestra.chat', () => {
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
    })
  );

  // ── Welcome screen (first install) ──────────────────────────────────────
  registerWelcome(context);

  // ── Status bar ───────────────────────────────────────────────────────────
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'orkestra.openPanel';
  statusBar.text = '$(sparkle) Orkestra';
  statusBar.tooltip = 'Open Orkestra AI Panel';
  statusBar.show();
  context.subscriptions.push(statusBar);
}

function getEditorSelection(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return undefined;
  const sel = editor.selection;
  if (sel.isEmpty) return undefined;
  const text = editor.document.getText(sel);
  const filename = editor.document.fileName.split(/[\\/]/).pop();
  const lang = editor.document.languageId;
  return `File: ${filename} (${lang})\n\`\`\`${lang}\n${text}\n\`\`\``;
}

async function applyFilesToWorkspace(api: OrkestraApi, runId: string) {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Orkestra: No workspace folder open.');
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'Apply all generated files to this workspace? Existing files will be overwritten.',
    { modal: true },
    'Apply'
  );
  if (confirm !== 'Apply') return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Orkestra: Applying files...', cancellable: false },
    async (progress) => {
      try {
        const workspace = await api.getWorkspace(runId);
        const files = workspace.files || [];
        progress.report({ message: `Writing ${files.length} files...` });

        for (const filePath of files) {
          const fileData = await api.getFile(runId, filePath);
          const targetUri = vscode.Uri.joinPath(workspaceFolder, filePath);
          const parentUri = vscode.Uri.joinPath(targetUri, '..');
          try { await vscode.workspace.fs.createDirectory(parentUri); } catch {}
          await vscode.workspace.fs.writeFile(
            targetUri,
            Buffer.from(fileData.content, 'utf-8')
          );
        }

        vscode.window.showInformationMessage(
          `Orkestra: ${files.length} files applied to workspace ✓`,
          'Open Explorer'
        ).then(action => {
          if (action === 'Open Explorer') {
            vscode.commands.executeCommand('workbench.view.explorer');
          }
        });
      } catch (e: any) {
        vscode.window.showErrorMessage(`Orkestra: Failed to apply files — ${e.message}`);
      }
    }
  );
}

export function deactivate() {}
