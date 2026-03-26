(function () {
  const vscode = acquireVsCodeApi();
  let state = {
    tab: 'chat',
    messages: [],
    thinking: false,
    chatContext: null,
    runs: [], me: null, selectedRunId: null, activeRunId: null,
    streaming: [], serverUrl: null, runDetail: null, runWorkspace: null,
    configured: true,
  };

  window.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'init':
        state.runs = data.runs || [];
        state.me = data.me;
        state.serverUrl = data.serverUrl;
        state.configured = true;
        renderRuns();
        updatePlanBadge();
        break;
      case 'notConfigured':
        state.configured = false;
        renderRuns();
        break;
      case 'switchToChat':
        switchTab('chat');
        if (data.context) { state.chatContext = data.context; }
        break;
      case 'thinking':
        state.thinking = data.value;
        renderMessages();
        break;
      case 'chatResponse':
        state.thinking = false;
        state.messages.push({ role: 'assistant', text: data.text, hasCode: data.hasCode, code: data.code, lang: data.language });
        renderMessages();
        break;
      case 'triggerNewRun':
        switchTab('runs');
        setTimeout(() => { const el = document.getElementById('objective'); if (el) { if (data.selection) el.value = data.selection; el.focus(); } }, 100);
        break;
      case 'runStarting':
        state.streaming = [{ cls: 'dim', text: '\u27F3 Starting run...' }];
        state.activeRunId = null;
        renderRuns();
        break;
      case 'runStarted':
        state.activeRunId = data.runId;
        state.selectedRunId = data.runId;
        state.streaming = [{ cls: 'ok', text: '\u2713 Run started: ' + data.runId.slice(0,8) + '...' }];
        renderRuns();
        break;
      case 'runError':
        state.streaming.push({ cls: 'err', text: '\u2717 ' + data.message });
        renderStreaming();
        break;
      case 'runCancelled':
        state.activeRunId = null;
        state.streaming.push({ cls: 'dim', text: '\u2298 Cancelled' });
        renderStreaming();
        break;
      case 'wsEvent':
        handleWsEvent(data.event);
        break;
      case 'wsDisconnected':
        state.activeRunId = null;
        break;
      case 'runDetail':
        state.runDetail = data.run;
        state.runWorkspace = data.workspace;
        renderRuns();
        break;
    }
  });

  function switchTab(tab) {
    state.tab = tab;
    document.getElementById('chat-panel').classList.toggle('hidden', tab !== 'chat');
    document.getElementById('runs-panel').classList.toggle('hidden', tab !== 'runs');
    document.getElementById('tab-chat').classList.toggle('active', tab === 'chat');
    document.getElementById('tab-runs').classList.toggle('active', tab === 'runs');
  }
  window.switchTab = switchTab;

  function sendChat() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg || state.thinking) return;
    state.messages.push({ role: 'user', text: msg });
    renderMessages();
    input.value = '';
    vscode.postMessage({ type: 'chat', message: msg, context: state.chatContext || '' });
    state.chatContext = null;
  }
  window.sendChat = sendChat;

  function sendAsRun() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    switchTab('runs');
    setTimeout(() => {
      const obj = document.getElementById('objective');
      if (obj) { obj.value = msg; startRun(); }
    }, 100);
  }
  window.sendAsRun = sendAsRun;

  function renderMessages() {
    const el = document.getElementById('messages');
    if (!el) return;
    if (state.messages.length === 0 && !state.thinking) {
      el.innerHTML = '<div class="empty">Ask anything about your code...<br><span style="font-size:11px;opacity:0.6">Enter to send \u2022 Shift+Enter for newline<br>\u26A1 "Run as Agent" to start a multi-agent task</span></div>';
      return;
    }
    let html = state.messages.map((m, i) => {
      if (m.role === 'user') {
        return '<div class="msg user"><div class="bubble user-bubble">' + escHtml(m.text) + '</div></div>';
      }
      let h = '<div class="msg assistant"><div class="bubble asst-bubble">' + escHtml(m.text) + '</div>';
      if (m.hasCode && m.code) {
        h += '<div class="code-block"><div class="code-header"><span class="code-lang">' + escHtml(m.lang || 'code') + '</span>';
        h += '<div class="code-actions"><button class="cbtn" onclick="copyCode(' + i + ')">Copy</button><button class="cbtn" onclick="insertCode(' + i + ')">Insert</button></div></div>';
        h += '<code>' + escHtml(m.code) + '</code></div>';
      }
      h += '</div>';
      return h;
    }).join('');
    if (state.thinking) {
      html += '<div class="msg assistant"><div class="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div>';
    }
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  function copyCode(i) {
    const m = state.messages[i];
    if (m && m.code) vscode.postMessage({ type: 'copyToClipboard', text: m.code });
  }
  window.copyCode = copyCode;

  function insertCode(i) {
    const m = state.messages[i];
    if (m && m.code) vscode.postMessage({ type: 'insertCode', code: m.code });
  }
  window.insertCode = insertCode;

  document.getElementById('chatInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });

  function renderRuns() {
    const el = document.getElementById('runs-content');
    if (!el) return;
    updatePlanBadge();
    if (!state.configured) {
      el.innerHTML = '<div class="setup"><p>Connect your CesaFlow account to start running AI agents.</p><button class="run-btn" onclick="configure()">\u2699 Configure API Key</button></div>';
      return;
    }
    let html = '<div class="section-title">New Run</div><div class="run-form">';
    html += '<textarea id="objective" class="run-input" placeholder="Describe your coding task..." rows="3" onkeydown="handleRunKeydown(event)"></textarea>';
    html += '<button class="run-btn" onclick="startRun()">\u25B6 Start Run</button></div>';
    if (state.streaming.length > 0) {
      html += '<hr class="divider"><div class="section-title">Output</div><div class="stream-box" id="streamBox">';
      state.streaming.slice(-80).forEach(function(l) { html += '<div class="stream-line ' + l.cls + '">' + escHtml(l.text) + '</div>'; });
      html += '</div>';
    }
    if (state.selectedRunId && state.runDetail) { html += '<hr class="divider">' + renderDetailHtml(); }
    html += '<hr class="divider"><div class="section-title">Recent Runs</div>';
    if (state.runs.length === 0) { html += '<div class="empty">No runs yet</div>'; }
    else {
      state.runs.forEach(function(run) {
        const obj = (run.task_objective || run.objective || 'Untitled').slice(0, 52);
        const status = run.status || 'pending';
        const sel = run.run_id === state.selectedRunId;
        html += '<div class="run-item' + (sel ? ' active' : '') + '" onclick="selectRun(\'' + run.run_id + '\')">';
        html += '<div class="run-dot ' + status + '"></div><span class="run-obj">' + escHtml(obj) + '</span><span class="run-status">' + status + '</span></div>';
      });
    }
    el.innerHTML = html;
    scrollStream();
  }

  function renderDetailHtml() {
    const run = state.runDetail; if (!run) return '';
    const files = (state.runWorkspace || {}).files || [];
    const isRunning = run.status === 'running' || run.status === 'pending';
    let h = '<div class="section-title">Run Detail</div><div class="detail">';
    h += '<div style="font-size:13px;font-weight:600;margin-bottom:8px">' + escHtml((run.task_objective || '').slice(0, 60)) + '</div>';
    (run.nodes || []).forEach(function(n) {
      const c = n.status === 'completed' ? '#4ec994' : n.status === 'failed' ? '#f48771' : n.status === 'running' ? '#7c9ef8' : '#888';
      h += '<div class="agent-row"><div class="agent-dot" style="background:' + c + '"></div><span>' + escHtml(n.agent_name) + '</span><span style="margin-left:auto;font-size:10px;opacity:0.6">' + n.status + '</span></div>';
    });
    if (files.length > 0) {
      h += '<div style="margin-top:6px">';
      files.slice(0, 8).forEach(function(f) { h += '<span class="file-chip">' + escHtml(f) + '</span>'; });
      if (files.length > 8) h += '<span class="file-chip">+' + (files.length - 8) + ' more</span>';
      h += '</div>';
    }
    h += '<div class="detail-actions">';
    if (isRunning) { h += '<button class="btn-sm danger" onclick="cancelRun(\'' + run.run_id + '\')">\u25A0 Cancel</button>'; }
    else {
      if (files.length > 0) h += '<button class="btn-sm primary" onclick="applyFiles(\'' + run.run_id + '\')">\u2B07 Apply Files</button>';
      h += '<button class="btn-sm" onclick="openInBrowser(\'' + run.run_id + '\')">\u2197 Open</button>';
    }
    h += '</div></div>';
    return h;
  }

  function handleWsEvent(ev) {
    const t = ev.type;
    if (t === 'token_chunk') {
      const last = state.streaming[state.streaming.length - 1];
      if (last && last.streaming) { last.text += ev.chunk || ''; }
      else { state.streaming.push({ cls: 'agent', text: '[' + (ev.agent || '?') + '] ', streaming: true }); state.streaming[state.streaming.length-1].text += ev.chunk || ''; }
      renderStreaming(); return;
    }
    if (t === 'node_completed') { const l = state.streaming[state.streaming.length-1]; if (l && l.streaming) { l.streaming = false; state.streaming.push({ cls: 'dim', text: '' }); } }
    if (t === 'file_written') state.streaming.push({ cls: 'file', text: '\uD83D\uDCC4 ' + ev.path });
    else if (t === 'node_started') state.streaming.push({ cls: 'agent', text: '\u25B6 ' + (ev.agent || '') + ' agent starting...' });
    else if (t === 'run_completed') { state.streaming.push({ cls: 'ok', text: '\uD83C\uDF89 Run completed!' }); state.activeRunId = null; }
    else if (t === 'run_failed') { state.streaming.push({ cls: 'err', text: '\u2717 Run failed: ' + (ev.error || '') }); state.activeRunId = null; }
    else if (t === 'command_output' && ev.line) state.streaming.push({ cls: ev.stderr ? 'err' : 'dim', text: '$ ' + ev.line });
    renderStreaming();
  }

  function renderStreaming() { const b = document.getElementById('streamBox'); if (!b) { renderRuns(); return; } b.innerHTML = state.streaming.slice(-80).map(function(l) { return '<div class="stream-line ' + l.cls + '">' + escHtml(l.text) + '</div>'; }).join(''); scrollStream(); }
  function updatePlanBadge() { const b = document.getElementById('planBadge'); if (!b) return; b.textContent = (state.me && state.me.organization) ? state.me.organization.plan : 'free'; }
  function startRun() { const ta = document.getElementById('objective'); if (!ta) return; const obj = ta.value.trim(); if (!obj) return; state.streaming = []; ta.value = ''; vscode.postMessage({ type: 'startRun', objective: obj }); }
  function handleRunKeydown(e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startRun(); } }
  function selectRun(id) { state.selectedRunId = id; state.runDetail = null; state.runWorkspace = null; renderRuns(); vscode.postMessage({ type: 'selectRun', runId: id }); }
  function cancelRun(id) { vscode.postMessage({ type: 'cancelRun', runId: id }); }
  function applyFiles(id) { vscode.postMessage({ type: 'applyFiles', runId: id }); }
  function openInBrowser(id) { const base = state.serverUrl ? state.serverUrl.replace(':8001', ':3000') : 'http://localhost:3000'; vscode.postMessage({ type: 'openBrowser', url: base + '/dashboard/runs/' + id }); }
  function configure() { vscode.postMessage({ type: 'configure' }); }
  function scrollStream() { const b = document.getElementById('streamBox'); if (b) b.scrollTop = b.scrollHeight; }
  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  window.startRun = startRun;
  window.handleRunKeydown = handleRunKeydown;
  window.selectRun = selectRun;
  window.cancelRun = cancelRun;
  window.applyFiles = applyFiles;
  window.openInBrowser = openInBrowser;
  window.configure = configure;

  vscode.postMessage({ type: 'ready' });
}());
