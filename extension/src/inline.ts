import * as vscode from 'vscode';
import { OrkestraApi } from './api';

// ── Cmd+K Inline Edit ──────────────────────────────────────────────────────

export function registerInlineEdit(context: vscode.ExtensionContext, api: OrkestraApi) {
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('orkestra.inlineEdit', async (editor) => {
      const sel = editor.selection;
      const selectedText = editor.document.getText(sel.isEmpty ? undefined : sel);
      const lang = editor.document.languageId;
      const filename = editor.document.fileName.split(/[\\/]/).pop() || 'file';

      // If nothing selected, use the whole file (up to 8000 chars)
      const codeContext = selectedText || editor.document.getText().slice(0, 8000);
      const isFullFile = !selectedText;

      const instruction = await vscode.window.showInputBox({
        prompt: isFullFile
          ? `What should Orkestra do with ${filename}?`
          : `What should Orkestra do with the selected ${lang} code?`,
        placeHolder: 'e.g. "Add error handling", "Convert to async", "Add TypeScript types"',
        ignoreFocusOut: true,
      });

      if (!instruction) return;

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Orkestra: ${instruction}`,
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

            if (!result?.edited_code) {
              vscode.window.showWarningMessage('Orkestra: No changes produced.');
              return;
            }

            const newCode = result.edited_code;

            // Show diff and ask to apply
            const action = await vscode.window.showInformationMessage(
              `Orkestra finished: ${result.summary || instruction}`,
              'Apply',
              'Show Diff',
              'Dismiss'
            );

            if (action === 'Apply') {
              await editor.edit((editBuilder) => {
                if (sel.isEmpty) {
                  const fullRange = new vscode.Range(
                    editor.document.positionAt(0),
                    editor.document.positionAt(editor.document.getText().length)
                  );
                  editBuilder.replace(fullRange, newCode);
                } else {
                  editBuilder.replace(sel, newCode);
                }
              });
            } else if (action === 'Show Diff') {
              await showDiff(editor.document, newCode, sel.isEmpty ? undefined : sel, context);
            }
          } catch (e: any) {
            vscode.window.showErrorMessage(`Orkestra: ${e.message}`);
          }
        }
      );
    })
  );
}

async function showDiff(
  doc: vscode.TextDocument,
  newContent: string,
  sel: vscode.Selection | undefined,
  context: vscode.ExtensionContext
) {
  const original = sel ? doc.getText(sel) : doc.getText();
  const originalUri = vscode.Uri.parse(`untitled:original_${doc.fileName.split(/[\\/]/).pop()}`);
  const modifiedUri = vscode.Uri.parse(`untitled:modified_${doc.fileName.split(/[\\/]/).pop()}`);

  // Write to temp docs
  const wsEdit = new vscode.WorkspaceEdit();
  wsEdit.createFile(originalUri, { overwrite: true });
  wsEdit.createFile(modifiedUri, { overwrite: true });
  wsEdit.insert(originalUri, new vscode.Position(0, 0), original);
  wsEdit.insert(modifiedUri, new vscode.Position(0, 0), newContent);
  await vscode.workspace.applyEdit(wsEdit);

  vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, 'Orkestra: Before ↔ After');
}


// ── Cmd+L Chat Panel ──────────────────────────────────────────────────────

export class OrkestaChatPanel {
  private static _panel: vscode.WebviewPanel | undefined;
  private static _ws: any = null;

  static show(context: vscode.ExtensionContext, api: OrkestraApi, initialContext?: string) {
    if (OrkestaChatPanel._panel) {
      OrkestaChatPanel._panel.reveal(vscode.ViewColumn.Two);
      if (initialContext) {
        OrkestaChatPanel._panel.webview.postMessage({ type: 'addContext', text: initialContext });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'orkestra.chat',
      'Orkestra Chat',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );

    OrkestaChatPanel._panel = panel;
    panel.webview.html = getChatHtml(panel.webview, context);

    panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case 'ready': {
            const editor = vscode.window.activeTextEditor;
            panel.webview.postMessage({
              type: 'init',
              serverUrl: api.serverUrl,
              currentFile: editor?.document.fileName || null,
            });
            break;
          }
          case 'chat':
            await handleChatMessage(panel, api, msg.message, msg.context, msg.model);
            break;
          case 'startRun': {
            try {
              const { run_id } = await api.startRun(msg.objective);
              panel.webview.postMessage({ type: 'runStarted', runId: run_id });
              OrkestaChatPanel._ws = api.openWebSocket(
                (ev) => { panel.webview.postMessage({ type: 'wsEvent', event: ev }); },
                () => {}
              );
            } catch (e: any) {
              panel.webview.postMessage({ type: 'response', text: 'Run failed: ' + e.message });
            }
            break;
          }
          case 'cancelRun':
            try { await api.cancelRun(msg.runId); } catch {}
            if (OrkestaChatPanel._ws) {
              try { OrkestaChatPanel._ws.close(); } catch {}
              OrkestaChatPanel._ws = null;
            }
            break;
          case 'getRuns': {
            try {
              const runs = await api.listRuns(10);
              panel.webview.postMessage({ type: 'runs', runs });
            } catch {}
            break;
          }
          case 'insertCode':
            insertCodeToEditor(msg.code);
            break;
          case 'copyToClipboard':
            vscode.env.clipboard.writeText(msg.text);
            break;
        }
      },
      undefined,
      context.subscriptions
    );

    panel.onDidDispose(() => {
      if (OrkestaChatPanel._ws) {
        try { OrkestaChatPanel._ws.close(); } catch {}
        OrkestaChatPanel._ws = null;
      }
      OrkestaChatPanel._panel = undefined;
    });

    if (initialContext) {
      setTimeout(() => {
        panel.webview.postMessage({ type: 'addContext', text: initialContext });
      }, 300);
    }
  }
}

async function handleChatMessage(
  panel: vscode.WebviewPanel,
  api: OrkestraApi,
  message: string,
  codeContext: string,
  model?: string,
) {
  panel.webview.postMessage({ type: 'thinking', value: true });

  try {
    const result = await api.chat({ message, context: codeContext, model });
    panel.webview.postMessage({
      type: 'response',
      text: result?.reply || 'No response.',
      hasCode: result?.has_code || false,
      code: result?.code || '',
      language: result?.language || 'text',
    });
  } catch (e: any) {
    panel.webview.postMessage({
      type: 'response',
      text: `Error: ${e.message}`,
      hasCode: false,
    });
  } finally {
    panel.webview.postMessage({ type: 'thinking', value: false });
  }
}

function insertCodeToEditor(code: string) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Orkestra: Open a file to insert code.');
    return;
  }
  editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, code);
  });
}

export function registerChatPanel(context: vscode.ExtensionContext, api: OrkestraApi) {
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
      OrkestaChatPanel.show(context, api, ctx);
    })
  );
}

function getChatHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'chat.js')
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
  <title>Orkestra Chat</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      height: 100vh; overflow: hidden;
      display: flex; flex-direction: column;
    }
    /* ── Header ── */
    .chat-header {
      padding: 8px 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 700; font-size: 13px;
      display: flex; align-items: center; gap: 8px;
      flex-shrink: 0;
    }
    /* ── Two-column layout ── */
    .layout {
      display: flex; flex: 1; overflow: hidden;
    }
    .chat-col {
      flex: 1; display: flex; flex-direction: column; overflow: hidden;
      border-right: 1px solid var(--vscode-panel-border);
    }
    .settings-col {
      width: 220px; flex-shrink: 0;
      overflow-y: auto; padding: 10px 10px;
      background: var(--vscode-sideBar-background);
    }
    /* ── Messages ── */
    #messages {
      flex: 1; overflow-y: auto;
      padding: 14px 14px 8px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .msg { max-width: 100%; display: flex; flex-direction: column; }
    .msg.user { align-items: flex-end; }
    .msg.assistant { align-items: flex-start; }
    .msg.system { align-items: flex-start; opacity: 0.55; font-size: 11px; padding: 2px 0; }
    .bubble {
      padding: 9px 13px; border-radius: 12px;
      font-size: 13px; line-height: 1.55; word-break: break-word;
      max-width: 90%;
    }
    .user-bubble {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-bottom-right-radius: 4px;
    }
    .asst-bubble {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, #444);
      border-bottom-left-radius: 4px;
    }
    /* ── Code blocks ── */
    .code-pre {
      background: var(--vscode-textCodeBlock-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #333);
      border-radius: 6px; overflow: hidden;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px; margin: 4px 0; max-width: 90%;
    }
    .code-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 4px 10px;
      background: var(--vscode-editorGroupHeader-tabsBackground, #252526);
      border-bottom: 1px solid var(--vscode-panel-border, #333);
    }
    .code-lang { font-size: 10px; opacity: 0.6; font-family: monospace; }
    .code-btns-inline { display: flex; gap: 4px; }
    .cbtn-sm {
      font-size: 10px; padding: 2px 8px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none; border-radius: 3px; cursor: pointer;
    }
    .cbtn-sm:hover { opacity: 0.8; }
    .code-pre code { display: block; padding: 10px; overflow-x: auto; white-space: pre; }
    .ic { background: var(--vscode-textCodeBlock-background, #1e1e1e); padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 12px; }
    .code-btns { display: flex; gap: 6px; margin: 4px 0; }
    .cbtn {
      font-size: 11px; padding: 3px 10px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none; border-radius: 4px; cursor: pointer;
    }
    .cbtn:hover { opacity: 0.8; }
    /* ── Thinking dots ── */
    .thinking {
      display: flex; align-items: center; gap: 6px;
      color: var(--vscode-descriptionForeground); font-size: 12px; padding: 6px 0;
    }
    .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--vscode-progressBar-background); animation: blink 1.4s ease-in-out infinite; }
    .dot:nth-child(2) { animation-delay: .2s; }
    .dot:nth-child(3) { animation-delay: .4s; }
    @keyframes blink { 0%,80%,100%{opacity:.25} 40%{opacity:1} }
    .cursor-blink { animation: blink 1s steps(1) infinite; }
    /* ── Input bar ── */
    .input-bar {
      padding: 10px 12px;
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    #input {
      width: 100%; resize: none;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, #555);
      border-radius: 6px; padding: 8px 10px;
      font-family: var(--vscode-font-family);
      font-size: 13px; outline: none; min-height: 60px;
    }
    #input:focus { border-color: var(--vscode-focusBorder); }
    .input-btns { display: flex; gap: 6px; margin-top: 6px; }
    .input-btn {
      flex: 1; padding: 6px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 5px;
      font-size: 12px; font-weight: 600; cursor: pointer;
    }
    .input-btn:hover { opacity: 0.9; }
    .input-btn.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    /* ── Settings column ── */
    .s-section { margin-bottom: 14px; }
    .s-title {
      font-size: 10px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .7px; opacity: .6; margin-bottom: 6px;
    }
    select {
      width: 100%;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border, #555);
      border-radius: 4px; padding: 5px 7px; font-size: 12px; outline: none;
    }
    .ctx-file { font-size: 11px; opacity: .8; word-break: break-all; }
    .ctx-empty { font-size: 11px; opacity: .4; }
    .run-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11px; }
    .run-active { font-size: 11px; display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
    .run-obj { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: .8; }
    .run-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
    .run-dot.running  { background: #4ec994; animation: blink 1.2s infinite; }
    .run-dot.completed { background: #4ec994; }
    .run-dot.failed   { background: #f48771; }
    .run-dot.pending  { background: #888; }
    .s-btn {
      width: 100%; padding: 5px; margin-top: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none; border-radius: 4px; font-size: 11px; cursor: pointer;
    }
    .s-btn.danger { border: 1px solid #f48771; color: #f48771; background: transparent; }
  </style>
</head>
<body>
  <div class="chat-header">&#9889; Orkestra Chat</div>
  <div class="layout">
    <div class="chat-col">
      <div id="messages"></div>
      <div class="input-bar">
        <textarea id="input" placeholder="Ask anything about your code... (Enter to send, Shift+Enter for newline)" rows="3"></textarea>
        <div class="input-btns">
          <button class="input-btn secondary" onclick="sendMessage()">&#9658; Chat</button>
          <button class="input-btn" onclick="startRun()">&#9889; Run as Agent</button>
        </div>
      </div>
    </div>
    <div class="settings-col" id="settings-col">
      <div class="s-section">
        <div class="s-title">Loading...</div>
      </div>
    </div>
  </div>
  <script src="${jsUri}"></script>
</body>
</html>`;
}


// ── Tab Completion ─────────────────────────────────────────────────────────

export function registerTabCompletion(context: vscode.ExtensionContext, api: OrkestraApi) {
  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(document, position, _ctx, token) {
      // Only trigger if API is configured
      if (!api.isConfigured) return [];

      // Grab prefix (last 1500 chars) + suffix (next 200 chars)
      const offset = document.offsetAt(position);
      const text = document.getText();
      const prefix = text.slice(Math.max(0, offset - 1500), offset);
      const suffix = text.slice(offset, Math.min(text.length, offset + 200));

      // Don't complete on empty lines or very short prefix
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
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: '**' }, // all files
      provider
    )
  );
}
