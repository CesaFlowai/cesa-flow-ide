(function () {
  const vscode = acquireVsCodeApi();

  // ── Shared state ──────────────────────────────────────────────────────────
  let currentTab = 'chat';

  // ── Chat state ────────────────────────────────────────────────────────────
  let messages = [];      // [{role:'user'|'assistant', text, hasCode, code, language}]
  let thinking = false;
  let chatContext = '';

  // ── Runs state ────────────────────────────────────────────────────────────
  let runsState = {
    runs: [], me: null, selectedRunId: null, activeRunId: null,
    streaming: [], selection: null, serverUrl: null, runDetail: null, runWorkspace: null
  };

  // ── Tab switching ─────────────────────────────────────────────────────────
  window.switchTab = function(tab) {
    currentTab = tab;
    document.getElementById('panelChat').classList.toggle('active', tab === 'chat');
    document.getElementById('panelRuns').classList.toggle('active', tab === 'runs');
    document.getElementById('tabChat').classList.toggle('active', tab === 'chat');
    document.getElementById('tabRuns').classList.toggle('active', tab === 'runs');
    if (tab === 'chat') {
      setTimeout(function() { document.getElementById('chatInput')?.focus(); }, 50);
    }
  };

  // ── Messages from extension host ─────────────────────────────────────────
  window.addEventListener('message', function({ data }) {
    switch (data.type) {
      // ── Runs messages ──────────────────────────────────────────────────
      case 'init':
        runsState.runs = data.runs || [];
        runsState.me = data.me;
        runsState.serverUrl = data.serverUrl;
        var plan = runsState.me && runsState.me.organization ? runsState.me.organization.plan : 'free';
        document.getElementById('planBadge').textContent = plan;
        renderRuns();
        break;
      case 'notConfigured':
        renderNotConfigured();
        break;
      case 'triggerNewRun':
        runsState.selection = data.selection || null;
        switchTab('runs');
        renderRuns();
        setTimeout(function() { document.getElementById('objective')?.focus(); }, 50);
        break;
      case 'runStarting':
        runsState.streaming = [{ cls: 'dim', text: '\u27F3 Starting run...' }];
        runsState.activeRunId = null;
        renderRuns();
        break;
      case 'runStarted':
        runsState.activeRunId = data.runId;
        runsState.selectedRunId = data.runId;
        runsState.streaming = [{ cls: 'ok', text: '\u2713 Run started: ' + data.runId.slice(0, 8) + '...' }];
        renderRuns();
        break;
      case 'runError':
        runsState.streaming.push({ cls: 'err', text: '\u2717 ' + data.message });
        renderStreaming();
        break;
      case 'runCancelled':
        runsState.activeRunId = null;
        runsState.streaming.push({ cls: 'dim', text: '\u2298 Cancelled' });
        renderStreaming();
        break;
      case 'wsEvent':
        handleWsEvent(data.event);
        break;
      case 'wsDisconnected':
        runsState.activeRunId = null;
        break;
      case 'runDetail':
        runsState.runDetail = data.run;
        runsState.runWorkspace = data.workspace;
        renderRuns();
        break;
      // ── Chat messages ──────────────────────────────────────────────────
      case 'switchToChat':
        if (data.context) { chatContext = data.context; }
        switchTab('chat');
        break;
      case 'chatResponse':
        appendAssistantMessage(data);
        break;
      case 'thinking':
        thinking = data.value;
        var row = document.getElementById('thinkingRow');
        if (row) { row.style.display = thinking ? 'flex' : 'none'; }
        scrollMessages();
        break;
    }
  });

  // ── Chat logic ────────────────────────────────────────────────────────────

  window.sendChat = function() {
    var input = document.getElementById('chatInput');
    if (!input) { return; }
    var text = input.value.trim();
    if (!text || thinking) { return; }
    input.value = '';
    messages.push({ role: 'user', text: text });
    renderMessages();
    vscode.postMessage({ type: 'chat', message: text, context: chatContext });
    chatContext = ''; // clear after first send
  };

  window.sendAsRun = function() {
    var input = document.getElementById('chatInput');
    if (!input) { return; }
    var text = input.value.trim();
    if (!text) { return; }
    input.value = '';
    switchTab('runs');
    setTimeout(function() {
      var obj = document.getElementById('objective');
      if (obj) { obj.value = text; }
    }, 50);
  };

  function appendAssistantMessage(data) {
    messages.push({
      role: 'assistant',
      text: data.text || '',
      hasCode: data.hasCode || false,
      code: data.code || '',
      language: data.language || 'text'
    });
    renderMessages();
  }

  function renderMessages() {
    var container = document.getElementById('messages');
    if (!container) { return; }
    if (messages.length === 0) {
      container.innerHTML = '<div class="empty">Ask anything about your code...</div>';
      return;
    }
    var html = '';
    messages.forEach(function(msg, i) {
      if (msg.role === 'user') {
        html += '<div class="msg user"><div class="bubble user-bubble">' + escHtml(msg.text) + '</div></div>';
      } else {
        html += '<div class="msg assistant">';
        // Main text bubble (may contain inline code rendered simply)
        if (msg.text) {
          html += '<div class="bubble asst-bubble">' + formatText(msg.text) + '</div>';
        }
        // Code block if present
        if (msg.hasCode && msg.code) {
          var lang = msg.language || 'text';
          html += '<div class="code-pre">';
          html += '<div class="code-header">';
          html += '<span class="code-lang">' + escHtml(lang) + '</span>';
          html += '<div class="code-btns-inline">';
          html += '<button class="cbtn-sm" onclick="window.copyCode(' + i + ')">Copy</button>';
          html += '<button class="cbtn-sm" onclick="window.insertCode(' + i + ')">Insert</button>';
          html += '</div>';
          html += '</div>';
          html += '<code>' + escHtml(msg.code) + '</code>';
          html += '</div>';
        }
        html += '</div>';
      }
    });
    container.innerHTML = html;
    scrollMessages();
  }

  window.copyCode = function(i) {
    var msg = messages[i];
    if (msg && msg.code) {
      vscode.postMessage({ type: 'copyToClipboard', text: msg.code });
    }
  };

  window.insertCode = function(i) {
    var msg = messages[i];
    if (msg && msg.code) {
      vscode.postMessage({ type: 'insertCode', code: msg.code });
    }
  };

  function scrollMessages() {
    var container = document.getElementById('messages');
    if (container) { container.scrollTop = container.scrollHeight; }
  }

  function formatText(text) {
    // Escape HTML then apply minimal formatting: inline code `...`
    return escHtml(text).replace(/`([^`]+)`/g, '<code style="background:var(--vscode-textCodeBlock-background,#1e1e1e);padding:1px 4px;border-radius:3px;font-family:monospace;font-size:11px">$1</code>');
  }

  // Chat input keydown
  document.addEventListener('DOMContentLoaded', function() {
    setupChatInput();
  });

  // Also try immediately in case DOM is ready
  setTimeout(function() { setupChatInput(); }, 0);

  function setupChatInput() {
    var inp = document.getElementById('chatInput');
    if (!inp || inp._cesaSetup) { return; }
    inp._cesaSetup = true;
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        window.sendChat();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        window.sendAsRun();
      }
    });
  }

  // ── Runs logic ────────────────────────────────────────────────────────────

  function handleWsEvent(ev) {
    var t = ev.type;
    if (t === 'token_chunk') {
      var last = runsState.streaming[runsState.streaming.length - 1];
      if (last && last.streaming) {
        last.text += ev.chunk || '';
      } else {
        runsState.streaming.push({ cls: 'agent', text: '[' + (ev.agent || '?') + '] ', streaming: true });
        var l = runsState.streaming[runsState.streaming.length - 1];
        l.text += ev.chunk || '';
      }
      renderStreaming();
      return;
    }
    if (t === 'node_completed') {
      var lastLine = runsState.streaming[runsState.streaming.length - 1];
      if (lastLine && lastLine.streaming) {
        lastLine.streaming = false;
        runsState.streaming.push({ cls: 'dim', text: '' });
      }
    }
    if (t === 'file_written') {
      runsState.streaming.push({ cls: 'file', text: '\uD83D\uDCC4 ' + ev.path });
    } else if (t === 'node_started') {
      runsState.streaming.push({ cls: 'agent', text: '\u25B6 ' + (ev.agent || '') + ' agent starting...' });
    } else if (t === 'run_completed') {
      runsState.streaming.push({ cls: 'ok', text: '\uD83C\uDF89 Run completed!' });
      runsState.activeRunId = null;
    } else if (t === 'run_failed') {
      runsState.streaming.push({ cls: 'err', text: '\u2717 Run failed: ' + (ev.error || '') });
      runsState.activeRunId = null;
    } else if (t === 'command_output' && ev.line) {
      runsState.streaming.push({ cls: ev.stderr ? 'err' : 'dim', text: '$ ' + ev.line });
    }
    renderStreaming();
  }

  function renderRuns() {
    var content = document.getElementById('runsContent');
    if (!content) { return; }

    var html = '';
    html += '<div class="section">';
    html += '<div class="section-title">New Run</div>';
    if (runsState.selection) {
      html += '<div class="selection-badge">\uD83D\uDCCE Selection attached <button onclick="window.clearSelection()">\u2715</button></div>';
    }
    html += '<div class="run-form">';
    html += '<textarea id="objective" class="run-input" placeholder="Describe your coding task..." rows="3" onkeydown="window.handleRunKeydown(event)"></textarea>';
    html += '<button class="run-btn" onclick="window.startRun()" id="runBtn">\u25B6 Start Run</button>';
    html += '</div>';
    html += '</div>';

    if (runsState.streaming.length > 0) {
      html += '<hr class="divider">';
      html += renderStreamingHtml();
    }

    if (runsState.selectedRunId && runsState.runDetail) {
      html += '<hr class="divider">';
      html += renderDetailHtml();
    }

    html += '<hr class="divider">';
    html += '<div class="section">';
    html += '<div class="section-title">Recent Runs</div>';
    if (runsState.runs.length === 0) {
      html += '<div class="empty">No runs yet</div>';
    } else {
      runsState.runs.forEach(function(run) {
        var obj = (run.task_objective || run.objective || 'Untitled').slice(0, 48);
        var status = run.status || 'pending';
        var isSelected = run.run_id === runsState.selectedRunId;
        html += '<div class="run-item' + (isSelected ? ' active' : '') + '" onclick="window.selectRun(\'' + run.run_id + '\')">';
        html += '<div class="run-dot ' + status + '"></div>';
        html += '<span class="run-obj">' + escHtml(obj) + '</span>';
        html += '<span class="run-status">' + status + '</span>';
        html += '</div>';
      });
    }
    html += '</div>';

    content.innerHTML = html;

    if (runsState.selection) {
      var ta = document.getElementById('objective');
      if (ta && !ta.value) { ta.value = runsState.selection; }
    }

    scrollStream();
  }

  function renderStreamingHtml() {
    var html = '<div class="section"><div class="section-title">Output</div>';
    html += '<div class="stream-box" id="streamBox">';
    runsState.streaming.slice(-80).forEach(function(line) {
      html += '<div class="stream-line ' + line.cls + '">' + escHtml(line.text) + '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderStreaming() {
    var box = document.getElementById('streamBox');
    if (!box) { renderRuns(); return; }
    box.innerHTML = runsState.streaming.slice(-80).map(function(line) {
      return '<div class="stream-line ' + line.cls + '">' + escHtml(line.text) + '</div>';
    }).join('');
    scrollStream();
  }

  function renderDetailHtml() {
    var run = runsState.runDetail;
    if (!run) { return ''; }
    var ws = runsState.runWorkspace;
    var files = ws ? (ws.files || []) : [];
    var isRunning = run.status === 'running' || run.status === 'pending';

    var html = '<div class="section"><div class="section-title">Run Detail</div><div class="detail">';
    html += '<div class="detail-title">' + escHtml((run.task_objective || '').slice(0, 60)) + '</div>';

    (run.nodes || []).forEach(function(node) {
      var dotColor = node.status === 'completed' ? '#4ec994' : node.status === 'failed' ? '#f48771' : node.status === 'running' ? '#7c9ef8' : '#888';
      html += '<div class="agent-row">';
      html += '<div class="agent-dot" style="background:' + dotColor + '"></div>';
      html += '<span>' + escHtml(node.agent_name) + '</span>';
      html += '<span style="margin-left:auto;font-size:10px;opacity:0.6">' + node.status + '</span>';
      html += '</div>';
    });

    if (files.length > 0) {
      html += '<div class="file-list">';
      files.slice(0, 10).forEach(function(f) {
        html += '<span class="file-chip">' + escHtml(f) + '</span>';
      });
      if (files.length > 10) { html += '<span class="file-chip">+' + (files.length - 10) + ' more</span>'; }
      html += '</div>';
    }

    html += '<div class="detail-actions">';
    if (isRunning) {
      html += '<button class="btn-sm danger" onclick="window.cancelRun(\'' + run.run_id + '\')">\u25A0 Cancel</button>';
    } else {
      if (files.length > 0) {
        html += '<button class="btn-sm primary" onclick="window.applyFiles(\'' + run.run_id + '\')">\u2B07 Apply Files</button>';
      }
      html += '<button class="btn-sm" onclick="window.openInBrowser(\'' + run.run_id + '\')">\u2197 Open in Browser</button>';
    }
    html += '</div>';
    html += '</div></div>';
    return html;
  }

  function renderNotConfigured() {
    var content = document.getElementById('runsContent');
    if (!content) { return; }
    content.innerHTML = '<div class="setup">' +
      '<p>Set your CesaFlow API key to get started.</p>' +
      '<button class="run-btn" onclick="window.configure()">\u2699 Configure API Key</button>' +
      '</div>';
  }

  // ── Runs actions ──────────────────────────────────────────────────────────

  window.startRun = function() {
    var ta = document.getElementById('objective');
    if (!ta) { return; }
    var obj = ta.value.trim();
    if (!obj) { return; }
    var fullObj = obj;
    if (runsState.selection && obj.indexOf(runsState.selection) === -1) {
      fullObj = obj + '\n\nContext:\n' + runsState.selection;
    }
    runsState.streaming = [];
    ta.value = '';
    vscode.postMessage({ type: 'startRun', objective: fullObj });
  };

  window.handleRunKeydown = function(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); window.startRun(); }
  };

  window.selectRun = function(runId) {
    runsState.selectedRunId = runId;
    runsState.runDetail = null;
    runsState.runWorkspace = null;
    renderRuns();
    vscode.postMessage({ type: 'selectRun', runId: runId });
  };

  window.cancelRun = function(runId) {
    vscode.postMessage({ type: 'cancelRun', runId: runId });
  };

  window.applyFiles = function(runId) {
    vscode.postMessage({ type: 'applyFiles', runId: runId });
  };

  window.openInBrowser = function(runId) {
    var base = runsState.serverUrl ? runsState.serverUrl.replace(':8001', ':3000') : 'http://localhost:3000';
    vscode.postMessage({ type: 'openBrowser', url: base + '/dashboard/runs/' + runId });
  };

  window.clearSelection = function() {
    runsState.selection = null;
    renderRuns();
  };

  window.configure = function() {
    vscode.postMessage({ type: 'configure' });
  };

  function scrollStream() {
    var box = document.getElementById('streamBox');
    if (box) { box.scrollTop = box.scrollHeight; }
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Bootstrap
  vscode.postMessage({ type: 'ready' });
  setupChatInput();
}());
