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

  static show(context: vscode.ExtensionContext, api: OrkestraApi, initialContext?: string) {
    if (OrkestaChatPanel._panel) {
      OrkestaChatPanel._panel.reveal(vscode.ViewColumn.Beside);
      if (initialContext) {
        OrkestaChatPanel._panel.webview.postMessage({ type: 'addContext', text: initialContext });
      }
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'orkestra.chat',
      'Orkestra Chat',
      vscode.ViewColumn.Beside,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    OrkestaChatPanel._panel = panel;
    panel.webview.html = getChatHtml();

    if (initialContext) {
      setTimeout(() => {
        panel.webview.postMessage({ type: 'addContext', text: initialContext });
      }, 300);
    }

    panel.webview.onDidReceiveMessage(
      async (msg) => {
        switch (msg.type) {
          case 'chat':
            await handleChatMessage(panel, api, msg.message, msg.context);
            break;
          case 'insertCode':
            insertCodeToEditor(msg.code);
            break;
        }
      },
      undefined,
      context.subscriptions
    );

    panel.onDidDispose(() => {
      OrkestaChatPanel._panel = undefined;
    });
  }
}

async function handleChatMessage(
  panel: vscode.WebviewPanel,
  api: OrkestraApi,
  message: string,
  codeContext: string
) {
  panel.webview.postMessage({ type: 'thinking', value: true });

  try {
    const result = await api.chat({ message, context: codeContext });
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

function getChatHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      display: flex; flex-direction: column; height: 100vh;
    }
    #header {
      padding: 10px 14px;
      border-bottom: 1px solid var(--vscode-panel-border);
      font-weight: 600; font-size: 13px;
      display: flex; align-items: center; gap: 8px;
    }
    #messages {
      flex: 1; overflow-y: auto; padding: 12px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .msg { max-width: 90%; }
    .msg.user { align-self: flex-end; }
    .msg.assistant { align-self: flex-start; }
    .bubble {
      padding: 10px 14px; border-radius: 12px;
      font-size: 13px; line-height: 1.5; white-space: pre-wrap;
    }
    .msg.user .bubble {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border-bottom-right-radius: 4px;
    }
    .msg.assistant .bubble {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border);
      border-bottom-left-radius: 4px;
    }
    pre {
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px; padding: 10px; margin: 8px 0;
      overflow-x: auto; font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .insert-btn {
      display: inline-block;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none; border-radius: 4px;
      padding: 4px 10px; font-size: 11px; cursor: pointer; margin-top: 6px;
    }
    .insert-btn:hover { opacity: 0.8; }
    .thinking {
      display: flex; align-items: center; gap: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 12px; padding: 8px;
    }
    .dot { width: 6px; height: 6px; border-radius: 50%;
      background: var(--vscode-progressBar-background);
      animation: pulse 1.4s ease-in-out infinite; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
    #context-bar {
      padding: 6px 12px;
      background: var(--vscode-input-background);
      border-top: 1px solid var(--vscode-panel-border);
      font-size: 11px; color: var(--vscode-descriptionForeground);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    #input-row {
      display: flex; gap: 8px; padding: 10px 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    textarea {
      flex: 1; resize: none; height: 60px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 6px; padding: 8px;
      font-family: var(--vscode-font-family);
      font-size: 13px; outline: none;
    }
    textarea:focus { border-color: var(--vscode-focusBorder); }
    #send {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none; border-radius: 6px;
      padding: 0 16px; cursor: pointer; font-size: 18px;
      align-self: flex-end; height: 60px; min-width: 48px;
    }
    #send:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div id="header">⚡ Orkestra Chat</div>
  <div id="messages"></div>
  <div id="context-bar" style="display:none"></div>
  <div id="input-row">
    <textarea id="input" placeholder="Ask about your code..." rows="2"></textarea>
    <button id="send" onclick="send()">↑</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let codeContext = '';

    const msgs = document.getElementById('messages');
    const input = document.getElementById('input');
    const ctxBar = document.getElementById('context-bar');

    document.getElementById('input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    function send() {
      const msg = input.value.trim();
      if (!msg) return;
      addBubble('user', msg);
      input.value = '';
      vscode.postMessage({ type: 'chat', message: msg, context: codeContext });
    }

    function addBubble(role, text, code, lang) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      let html = '<div class="bubble">' + escHtml(text) + '</div>';
      if (code) {
        html += '<pre>' + escHtml(code) + '</pre>';
        html += '<button class="insert-btn" onclick="insertCode(' + JSON.stringify(code) + ')">Insert at cursor</button>';
      }
      div.innerHTML = html;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function insertCode(code) {
      vscode.postMessage({ type: 'insertCode', code });
    }

    let thinkingEl = null;
    function setThinking(on) {
      if (on && !thinkingEl) {
        thinkingEl = document.createElement('div');
        thinkingEl.className = 'thinking';
        thinkingEl.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div><span>Thinking...</span>';
        msgs.appendChild(thinkingEl);
        msgs.scrollTop = msgs.scrollHeight;
      } else if (!on && thinkingEl) {
        thinkingEl.remove();
        thinkingEl = null;
      }
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'addContext') {
        codeContext = msg.text;
        const label = msg.text.split('\\n')[0];
        ctxBar.textContent = '📎 ' + label;
        ctxBar.style.display = 'block';
      } else if (msg.type === 'thinking') {
        setThinking(msg.value);
      } else if (msg.type === 'response') {
        addBubble('assistant', msg.text, msg.code || '', msg.language || '');
      }
    });
  </script>
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
