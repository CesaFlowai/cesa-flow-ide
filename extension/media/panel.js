(function () {
  const vscode = acquireVsCodeApi();
  let state = { runs: [], me: null, selectedRunId: null, activeRunId: null, streaming: [], selection: null, serverUrl: null, runDetail: null, runWorkspace: null };

  // ── Message from extension host ─────────────────────────────────────────
  window.addEventListener('message', ({ data }) => {
    switch (data.type) {
      case 'init':
        state.runs = data.runs || [];
        state.me = data.me;
        state.serverUrl = data.serverUrl;
        render();
        break;
      case 'notConfigured':
        renderNotConfigured();
        break;
      case 'triggerNewRun':
        state.selection = data.selection || null;
        render();
        setTimeout(() => document.getElementById('objective')?.focus(), 50);
        break;
      case 'runStarting':
        state.streaming = [{ cls: 'dim', text: '\u27F3 Starting run...' }];
        state.activeRunId = null;
        render();
        break;
      case 'runStarted':
        state.activeRunId = data.runId;
        state.selectedRunId = data.runId;
        state.streaming = [{ cls: 'ok', text: '\u2713 Run started: ' + data.runId.slice(0,8) + '...' }];
        render();
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
        render();
        break;
    }
  });

  function handleWsEvent(ev) {
    const t = ev.type;
    if (t === 'token_chunk') {
      const last = state.streaming[state.streaming.length - 1];
      if (last && last.streaming) {
        last.text += ev.chunk || '';
      } else {
        state.streaming.push({ cls: 'agent', text: '[' + (ev.agent || '?') + '] ', streaming: true });
        const l = state.streaming[state.streaming.length - 1];
        l.text += ev.chunk || '';
      }
      renderStreaming();
      return;
    }
    if (t === 'node_completed') {
      const last = state.streaming[state.streaming.length - 1];
      if (last && last.streaming) { last.streaming = false; state.streaming.push({ cls: 'dim', text: '' }); }
    }
    if (t === 'file_written') {
      state.streaming.push({ cls: 'file', text: '\uD83D\uDCC4 ' + ev.path });
    } else if (t === 'node_started') {
      state.streaming.push({ cls: 'agent', text: '\u25B6 ' + (ev.agent || '') + ' agent starting...' });
    } else if (t === 'run_completed') {
      state.streaming.push({ cls: 'ok', text: '\uD83C\uDF89 Run completed!' });
      state.activeRunId = null;
    } else if (t === 'run_failed') {
      state.streaming.push({ cls: 'err', text: '\u2717 Run failed: ' + (ev.error || '') });
      state.activeRunId = null;
    } else if (t === 'command_output' && ev.line) {
      state.streaming.push({ cls: ev.stderr ? 'err' : 'dim', text: '$ ' + ev.line });
    }
    renderStreaming();
  }

  // ── Renders ─────────────────────────────────────────────────────────────

  function render() {
    const content = document.getElementById('content');
    const plan = state.me && state.me.organization ? state.me.organization.plan : 'free';
    document.getElementById('planBadge').textContent = plan;

    let html = '';

    html += '<div class="section">';
    html += '<div class="section-title">New Run</div>';
    if (state.selection) {
      html += '<div class="selection-badge">\uD83D\uDCCE Selection attached <button onclick="clearSelection()">\u2715</button></div>';
    }
    html += '<div class="run-form">';
    html += '<textarea id="objective" class="run-input" placeholder="Describe your coding task..." rows="3" onkeydown="handleKeydown(event)"></textarea>';
    html += '<button class="run-btn" onclick="startRun()" id="runBtn">\u25B6 Start Run</button>';
    html += '</div>';
    html += '</div>';

    if (state.streaming.length > 0) {
      html += '<hr class="divider">';
      html += renderStreamingHtml();
    }

    if (state.selectedRunId && state.runDetail) {
      html += '<hr class="divider">';
      html += renderDetailHtml();
    }

    html += '<hr class="divider">';
    html += '<div class="section">';
    html += '<div class="section-title">Recent Runs</div>';
    if (state.runs.length === 0) {
      html += '<div class="empty">No runs yet</div>';
    } else {
      state.runs.forEach(function(run) {
        const obj = (run.task_objective || run.objective || 'Untitled').slice(0, 48);
        const status = run.status || 'pending';
        const isSelected = run.run_id === state.selectedRunId;
        html += '<div class="run-item' + (isSelected ? ' active' : '') + '" onclick="selectRun(\'' + run.run_id + '\')">';
        html += '<div class="run-dot ' + status + '"></div>';
        html += '<span class="run-obj">' + escHtml(obj) + '</span>';
        html += '<span class="run-status">' + status + '</span>';
        html += '</div>';
      });
    }
    html += '</div>';

    content.innerHTML = html;

    if (state.selection) {
      const ta = document.getElementById('objective');
      if (ta && !ta.value) { ta.value = state.selection; }
    }

    scrollStream();
  }

  function renderStreamingHtml() {
    let html = '<div class="section"><div class="section-title">Output</div>';
    html += '<div class="stream-box" id="streamBox">';
    state.streaming.slice(-80).forEach(function(line) {
      html += '<div class="stream-line ' + line.cls + '">' + escHtml(line.text) + '</div>';
    });
    html += '</div></div>';
    return html;
  }

  function renderStreaming() {
    const box = document.getElementById('streamBox');
    if (!box) { render(); return; }
    box.innerHTML = state.streaming.slice(-80).map(function(line) {
      return '<div class="stream-line ' + line.cls + '">' + escHtml(line.text) + '</div>';
    }).join('');
    scrollStream();
  }

  function renderDetailHtml() {
    const run = state.runDetail;
    if (!run) { return ''; }
    const ws = state.runWorkspace;
    const files = ws ? (ws.files || []) : [];
    const isRunning = run.status === 'running' || run.status === 'pending';

    let html = '<div class="section"><div class="section-title">Run Detail</div><div class="detail">';
    html += '<div class="detail-title">' + escHtml((run.task_objective || '').slice(0, 60)) + '</div>';

    (run.nodes || []).forEach(function(node) {
      const dotColor = node.status === 'completed' ? '#4ec994' : node.status === 'failed' ? '#f48771' : node.status === 'running' ? '#7c9ef8' : '#888';
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
      html += '<button class="btn-sm danger" onclick="cancelRun(\'' + run.run_id + '\')">\u25A0 Cancel</button>';
    } else {
      if (files.length > 0) {
        html += '<button class="btn-sm primary" onclick="applyFiles(\'' + run.run_id + '\')">\u2B07 Apply Files</button>';
      }
      html += '<button class="btn-sm" onclick="openInBrowser(\'' + run.run_id + '\')">\u2197 Open in Browser</button>';
    }
    html += '</div>';
    html += '</div></div>';
    return html;
  }

  function renderNotConfigured() {
    const content = document.getElementById('content');
    content.innerHTML = '<div class="setup">' +
      '<p>Set your Orkestra API key to get started.</p>' +
      '<button class="run-btn" onclick="configure()">\u2699 Configure API Key</button>' +
      '</div>';
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  function startRun() {
    const ta = document.getElementById('objective');
    const obj = ta.value.trim();
    if (!obj) { return; }
    let fullObj = obj;
    if (state.selection && obj.indexOf(state.selection) === -1) {
      fullObj = obj + '\n\nContext:\n' + state.selection;
    }
    state.streaming = [];
    ta.value = '';
    vscode.postMessage({ type: 'startRun', objective: fullObj });
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); startRun(); }
  }

  function selectRun(runId) {
    state.selectedRunId = runId;
    state.runDetail = null;
    state.runWorkspace = null;
    render();
    vscode.postMessage({ type: 'selectRun', runId });
  }

  function cancelRun(runId) {
    vscode.postMessage({ type: 'cancelRun', runId });
  }

  function applyFiles(runId) {
    vscode.postMessage({ type: 'applyFiles', runId });
  }

  function openInBrowser(runId) {
    const base = state.serverUrl ? state.serverUrl.replace(':8001', ':3000') : 'http://localhost:3000';
    vscode.postMessage({ type: 'openBrowser', url: base + '/dashboard/runs/' + runId });
  }

  function clearSelection() {
    state.selection = null;
    render();
  }

  function configure() {
    vscode.postMessage({ type: 'configure' });
  }

  function scrollStream() {
    const box = document.getElementById('streamBox');
    if (box) { box.scrollTop = box.scrollHeight; }
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Bootstrap
  vscode.postMessage({ type: 'ready' });
}());
