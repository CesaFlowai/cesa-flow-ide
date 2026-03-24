import * as vscode from 'vscode';
import { OrkestraPanel, OrkestraViewProvider } from './panel';
import { OrkestraApi } from './api';

export function activate(context: vscode.ExtensionContext) {
  const api = new OrkestraApi();
  const panel = new OrkestraPanel(context, api);
  const provider = new OrkestraViewProvider(context, panel);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('orkestra.mainView', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

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

    vscode.commands.registerCommand('orkestra.applyFiles', async (runId: string) => {
      await applyFilesToWorkspace(api, runId);
    }),
  );

  // Status bar item
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
          // Create parent dirs
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
