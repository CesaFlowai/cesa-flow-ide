import * as vscode from 'vscode';
import { OrkestraApi } from './api';

// ── Diff Content Provider ──────────────────────────────────────────────────
// Serves virtual document content for the diff view without creating temp files.

class DiffContentProvider implements vscode.TextDocumentContentProvider {
  private _store = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this._store.get(uri.toString()) ?? '';
  }

  set(uri: vscode.Uri, content: string) {
    this._store.set(uri.toString(), content);
  }

  delete(uri: vscode.Uri) {
    this._store.delete(uri.toString());
  }
}

// ── Cmd+K Inline Edit ──────────────────────────────────────────────────────

export function registerInlineEdit(context: vscode.ExtensionContext, api: OrkestraApi) {
  const diffProvider = new DiffContentProvider();
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider('cesaflow-diff', diffProvider)
  );

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('orkestra.inlineEdit', async (editor) => {
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

      if (!instruction) return;

      let newCode: string | undefined;
      let summary: string | undefined;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `CesaFlow: ${instruction}`,
          cancellable: false,
        },
        async () => {
          try {
            const result = await api.inlineEdit({
              code: codeContext,
              instruction,
              language: lang,
              filename,
            });
            newCode = result?.edited_code;
            summary = result?.summary;
          } catch (e: any) {
            vscode.window.showErrorMessage(`CesaFlow: ${e.message}`);
          }
        }
      );

      if (!newCode) {
        vscode.window.showWarningMessage('CesaFlow: No changes produced.');
        return;
      }

      // ── Show diff view immediately ──────────────────────────────────────
      const key = Date.now().toString();
      const originalUri = vscode.Uri.parse(
        `cesaflow-diff:original/${key}/${encodeURIComponent(filename)}`
      );
      const modifiedUri = vscode.Uri.parse(
        `cesaflow-diff:modified/${key}/${encodeURIComponent(filename)}`
      );

      diffProvider.set(originalUri, codeContext);
      diffProvider.set(modifiedUri, newCode);

      // Open diff — user sees changes before accepting
      await vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        modifiedUri,
        `CesaFlow ✦ ${summary || instruction}`
      );

      const action = await vscode.window.showInformationMessage(
        summary ? `✦ ${summary}` : `✦ Changes ready — accept or reject?`,
        { modal: false },
        'Accept',
        'Reject'
      );

      // Close the diff editor
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      diffProvider.delete(originalUri);
      diffProvider.delete(modifiedUri);

      if (action === 'Accept') {
        await editor.edit((eb) => {
          if (isFullFile) {
            const fullRange = new vscode.Range(
              editor.document.positionAt(0),
              editor.document.positionAt(editor.document.getText().length)
            );
            eb.replace(fullRange, newCode!);
          } else {
            eb.replace(sel, newCode!);
          }
        });
        vscode.window.setStatusBarMessage('CesaFlow: Changes applied ✓', 3000);
      }
      // 'Reject' or dismiss → do nothing
    })
  );
}

// ── Tab Completion ─────────────────────────────────────────────────────────

export function registerTabCompletion(context: vscode.ExtensionContext, api: OrkestraApi) {
  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, _ctx, token) {
      if (!api.isConfigured) return [];

      const offset = document.offsetAt(position);
      const text = document.getText();
      const prefix = text.slice(Math.max(0, offset - 1500), offset);
      const suffix = text.slice(offset, Math.min(text.length, offset + 200));

      const currentLine = document.lineAt(position).text.trimEnd();
      if (currentLine.length < 2) return [];

      try {
        const result = await api.complete({
          prefix,
          suffix,
          language: document.languageId,
          filename: document.fileName.split(/[\\/]/).pop() || '',
        });

        if (!result?.completion || token.isCancellationRequested) return [];

        return [
          new vscode.InlineCompletionItem(
            result.completion,
            new vscode.Range(position, position)
          ),
        ];
      } catch {
        return [];
      }
    },
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, provider)
  );
}
