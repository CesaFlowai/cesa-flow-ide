(function () {
  const vscode = acquireVsCodeApi();

  var state = {
    messages: [],
    activeRunId: null,
    runs: [],
    contextFile: null,
    settings: { model: 'auto' },
    serverUrl: null,
    thinking: false,
  };

  // ── Messages from extension host ──────────────────────────────────────────

  window.addEventListener('message', function (e) {
    var msg = e.data;
    switch (msg.type) {
      case 'init':
        state.serverUrl = msg.serverUrl || null;
        if (msg.currentFile) {
          state.contextFile = msg.currentFile;
        }
        vscode.postMessage({ type: 'getRuns' });
        render();
        break;
      case 'addContext':
        state.contextFile = msg.text ? msg.text.split('\n')[0] : null;
        renderSettings();
        break;
      case 'response':
        state.thinking = false;
        state.messages.push({ role: 'assistant', text: msg.text || '', code: msg.code || '', language: msg.language || '' });
        render();
        break;
      case 'thinking':
        state.thinking = msg.value;
        renderMessages();
        break;
      case 'runs':
        state.runs = msg.runs || [];
        renderSettings();
        break;
      case 'runStarted':
        state.activeRunId = msg.runId;
        state.messages.push({ role: 'system', text: '\u25B6 Agent run started: ' + msg.runId.slice(0, 8) + '...' });
        render();
        break;
      case 'wsEvent':
        handleWsEvent(msg.event);
        break;
    }
  });

  function handleWsEvent(ev) {
    var t = ev.type;
    if (t === 'token_chunk') {
      var last = state.messages[state.messages.length - 1];
      if (last && last.streaming) {
        last.text += ev.chunk || '';
      } else {
        state.messages.push({ role: 'assistant', text: (ev.chunk || ''), streaming: true });
      }
      renderMessages();
      return;
    }
    if (t === 'node_completed') {
      var last2 = state.messages[state.messages.length - 1];
      if (last2 && last2.streaming) { last2.streaming = false; }
    }
    if (t === 'file_written') {
      state.messages.push({ role: 'system', text: '\uD83D\uDCC4 ' + ev.path });
    } else if (t === 'node_started') {
      state.messages.push({ role: 'system', text: '\u25B6 ' + (ev.agent || '') + ' agent starting...' });
    } else if (t === 'run_completed') {
      state.messages.push({ role: 'system', text: '\u2713 Run completed!' });
      state.activeRunId = null;
      vscode.postMessage({ type: 'getRuns' });
    } else if (t === 'run_failed') {
      state.messages.push({ role: 'system', text: '\u2717 Run failed: ' + (ev.error || '') });
      state.activeRunId = null;
    }
    renderMessages();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    renderMessages();
    renderSettings();
  }

  function renderMessages() {
    var box = document.getElementById('messages');
    if (!box) return;
    var html = '';

    state.messages.forEach(function (m) {
      if (m.role === 'user') {
        html += '<div class="msg user"><div class="bubble user-bubble">' + escHtml(m.text) + '</div></div>';
      } else if (m.role === 'assistant') {
        html += '<div class="msg assistant"><div class="bubble asst-bubble">' + renderMarkdown(m.text) + (m.streaming ? '<span class="cursor-blink">|</span>' : '') + '</div>';
        if (m.code) {
          html += '<pre class="code-pre"><code>' + escHtml(m.code) + '</code></pre>';
          html += '<div class="code-btns">';
          html += '<button class="cbtn" onclick="insertCode(' + JSON.stringify(m.code) + ')">Insert at cursor</button>';
          html += '<button class="cbtn" onclick="copyText(' + JSON.stringify(m.code) + ')">Copy</button>';
          html += '</div>';
        }
        html += '</div>';
      } else {
        // system
        html += '<div class="msg system"><span>' + escHtml(m.text) + '</span></div>';
      }
    });

    if (state.thinking) {
      html += '<div class="thinking"><div class="dot"></div><div class="dot"></div><div class="dot"></div><span>Thinking...</span></div>';
    }

    box.innerHTML = html;
    box.scrollTop = box.scrollHeight;
  }

  function renderSettings() {
    var col = document.getElementById('settings-col');
    if (!col) return;
    var html = '';

    // Model selector
    html += '<div class="s-section">';
    html += '<div class="s-title">Model</div>';
    html += '<select id="modelSelect" onchange="changeModel(this.value)">';
    var models = [
      ['auto', 'Auto (server default)'],
      ['gpt-4o', 'GPT-4o'],
      ['gpt-4o-mini', 'GPT-4o Mini'],
      ['claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet'],
      ['claude-3-5-haiku-20241022', 'Claude 3.5 Haiku'],
      ['gemini-2.0-flash', 'Gemini 2.0 Flash'],
      ['gemini-1.5-pro', 'Gemini 1.5 Pro'],
    ];
    models.forEach(function (m) {
      var sel = state.settings.model === m[0] ? ' selected' : '';
      html += '<option value="' + m[0] + '"' + sel + '>' + m[1] + '</option>';
    });
    html += '</select>';
    html += '</div>';

    // Context file
    html += '<div class="s-section">';
    html += '<div class="s-title">Context</div>';
    if (state.contextFile) {
      var fname = state.contextFile.split(/[\\/]/).pop() || state.contextFile;
      html += '<div class="ctx-file">\uD83D\uDCC4 ' + escHtml(fname) + '</div>';
    } else {
      html += '<div class="ctx-empty">No file context</div>';
    }
    html += '</div>';

    // Active run status
    if (state.activeRunId) {
      html += '<div class="s-section">';
      html += '<div class="s-title">Active Run</div>';
      html += '<div class="run-active"><span class="run-dot running"></span> ' + state.activeRunId.slice(0, 8) + '...</div>';
      html += '<button class="s-btn danger" onclick="cancelRun()">&#9632; Cancel</button>';
      html += '</div>';
    }

    // Recent runs
    if (state.runs.length > 0) {
      html += '<div class="s-section">';
      html += '<div class="s-title">Recent Runs</div>';
      state.runs.slice(0, 8).forEach(function (r) {
        var obj = (r.task_objective || r.objective || 'Untitled').slice(0, 30);
        var statusDot = r.status === 'completed' ? 'completed' : r.status === 'running' ? 'running' : r.status === 'failed' ? 'failed' : 'pending';
        html += '<div class="run-row">';
        html += '<span class="run-dot ' + statusDot + '"></span>';
        html += '<span class="run-obj">' + escHtml(obj) + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    col.innerHTML = html;
  }

  // ── Markdown rendering (lightweight, no library) ───────────────────────────

  function renderMarkdown(text) {
    // Split by code blocks first
    var parts = text.split(/(```[\w]*\n[\s\S]*?```)/g);
    return parts.map(function (part) {
      if (part.startsWith('```')) {
        var match = part.match(/```(\w*)\n([\s\S]*?)```/);
        if (match) {
          var lang = match[1] || '';
          var code = match[2];
          return '<pre class="code-pre" data-lang="' + escHtml(lang) + '">'
            + '<div class="code-header"><span class="code-lang">' + escHtml(lang) + '</span>'
            + '<div class="code-btns-inline">'
            + '<button class="cbtn-sm" onclick="copyText(' + JSON.stringify(code) + ')">Copy</button>'
            + '<button class="cbtn-sm" onclick="insertCode(' + JSON.stringify(code) + ')">Insert</button>'
            + '</div></div>'
            + '<code>' + escHtml(code) + '</code></pre>';
        }
        return escHtml(part);
      }
      // Inline formatting
      return escHtml(part)
        .replace(/`([^`]+)`/g, '<code class="ic">$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    }).join('');
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  window.sendMessage = function () {
    var input = document.getElementById('input');
    var text = input.value.trim();
    if (!text) return;
    state.messages.push({ role: 'user', text: text });
    input.value = '';
    state.thinking = true;
    renderMessages();
    vscode.postMessage({ type: 'chat', message: text, context: state.contextFile || '', model: state.settings.model });
  };

  window.startRun = function () {
    var input = document.getElementById('input');
    var text = input.value.trim();
    if (!text) return;
    state.messages.push({ role: 'user', text: text });
    input.value = '';
    render();
    vscode.postMessage({ type: 'startRun', objective: text });
  };

  window.insertCode = function (code) {
    vscode.postMessage({ type: 'insertCode', code: code });
  };

  window.copyText = function (text) {
    // Use postMessage to host — clipboard not available in webview
    vscode.postMessage({ type: 'copyToClipboard', text: text });
  };

  window.changeModel = function (val) {
    state.settings.model = val;
  };

  window.cancelRun = function () {
    if (state.activeRunId) {
      vscode.postMessage({ type: 'cancelRun', runId: state.activeRunId });
      state.activeRunId = null;
      renderSettings();
    }
  };

  // Keydown handler on textarea
  document.addEventListener('keydown', function (e) {
    var input = document.getElementById('input');
    if (e.target !== input) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      window.sendMessage();
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Bootstrap
  vscode.postMessage({ type: 'ready' });
}());
