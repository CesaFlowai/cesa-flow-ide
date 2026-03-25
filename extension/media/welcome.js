(function () {
  const vscode = acquireVsCodeApi();

  const PROVIDERS = [
    {
      id: 'groq',
      name: 'Groq',
      badge: 'FREE',
      badgeColor: '#22c55e',
      recommended: true,
      tagline: 'Fastest free AI — Llama 3, Mixtral',
      models: 'Llama 3.3 70B · Mixtral 8x7B · Gemma2',
      note: 'No credit card. Instant key.',
      keyUrl: 'https://console.groq.com/keys',
      placeholder: 'gsk_...',
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      badge: 'FREE',
      badgeColor: '#22c55e',
      tagline: 'Free Gemini 1.5 Flash & Pro',
      models: 'Gemini 1.5 Flash · Gemini 1.5 Pro',
      note: 'Google account required.',
      keyUrl: 'https://aistudio.google.com/app/apikey',
      placeholder: 'AIza...',
    },
    {
      id: 'cerebras',
      name: 'Cerebras',
      badge: 'FREE',
      badgeColor: '#22c55e',
      tagline: 'Ultra-fast inference, free tier',
      models: 'Llama 3.1 8B · Llama 3.3 70B',
      note: 'World\'s fastest inference.',
      keyUrl: 'https://cloud.cerebras.ai/',
      placeholder: 'csk-...',
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      badge: 'FREE MODELS',
      badgeColor: '#6366f1',
      tagline: 'Access 200+ models, some free',
      models: 'Llama 3.1 Free · Mistral Free · +200 models',
      note: 'One key, all providers.',
      keyUrl: 'https://openrouter.ai/keys',
      placeholder: 'sk-or-v1-...',
    },
    {
      id: 'mistral',
      name: 'Mistral AI',
      badge: 'FREE TIER',
      badgeColor: '#22c55e',
      tagline: 'European AI, free dev tier',
      models: 'Mistral 7B · Mixtral · Codestral',
      note: 'Great for coding tasks.',
      keyUrl: 'https://console.mistral.ai/api-keys/',
      placeholder: 'sk-...',
    },
    {
      id: 'together',
      name: 'Together AI',
      badge: '$5 FREE',
      badgeColor: '#f59e0b',
      tagline: '$5 free credit on signup',
      models: 'Llama 3 · Qwen · DeepSeek · +50',
      note: 'Best open-source selection.',
      keyUrl: 'https://api.together.ai/settings/api-keys',
      placeholder: 'sk-...',
    },
    {
      id: 'openai',
      name: 'OpenAI',
      badge: 'PAID',
      badgeColor: '#64748b',
      tagline: 'GPT-4o, GPT-4o mini',
      models: 'GPT-4o · GPT-4o mini · o1 · o3',
      note: 'Industry standard.',
      keyUrl: 'https://platform.openai.com/api-keys',
      placeholder: 'sk-proj-...',
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      badge: 'PAID',
      badgeColor: '#64748b',
      tagline: 'Claude 3.5 Sonnet & Haiku',
      models: 'Claude 3.5 Sonnet · Claude 3 Haiku · Claude 3 Opus',
      note: 'Best for complex reasoning.',
      keyUrl: 'https://console.anthropic.com/settings/keys',
      placeholder: 'sk-ant-...',
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      badge: 'ULTRA CHEAP',
      badgeColor: '#8b5cf6',
      tagline: 'GPT-4 quality at 1/30th price',
      models: 'DeepSeek V3 · DeepSeek Coder · R1',
      note: '$0.001 per 1M tokens.',
      keyUrl: 'https://platform.deepseek.com/api_keys',
      placeholder: 'sk-...',
    },
    {
      id: 'cohere',
      name: 'Cohere',
      badge: 'FREE TIER',
      badgeColor: '#22c55e',
      tagline: 'Free trial API, no card needed',
      models: 'Command R · Command R+ · Aya',
      note: 'Great for RAG & search.',
      keyUrl: 'https://dashboard.cohere.com/api-keys',
      placeholder: 'sk-...',
    },
  ];

  let selectedProvider = PROVIDERS[0];

  function render() {
    const grid = document.getElementById('providerGrid');
    grid.innerHTML = '';

    PROVIDERS.forEach(p => {
      const card = document.createElement('div');
      card.className = 'provider-card' + (p.id === selectedProvider.id ? ' selected' : '');
      if (p.recommended) card.classList.add('recommended-card');
      card.innerHTML = `
        ${p.recommended ? '<div class="rec-label">⭐ Yeni başlayanlar için önerilir</div>' : ''}
        <div class="card-top">
          <span class="provider-name">${p.name}</span>
          <span class="badge" style="background:${p.badgeColor}20;color:${p.badgeColor};border:1px solid ${p.badgeColor}40">${p.badge}</span>
        </div>
        <div class="provider-tagline">${p.tagline}</div>
        <div class="provider-models">${p.models}</div>
        <div class="provider-note">${p.note}</div>
      `;
      card.addEventListener('click', () => {
        selectedProvider = p;
        render();
        document.getElementById('apiKey').placeholder = p.placeholder;
        document.getElementById('getKeyBtn').href = p.keyUrl;
        document.getElementById('selectedName').textContent = p.name + ' API Key';
      });
      grid.appendChild(card);
    });
  }

  render();

  const keyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');

  keyInput.addEventListener('input', () => {
    saveBtn.disabled = keyInput.value.trim().length < 8;
  });
  keyInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !saveBtn.disabled) save(); });
  saveBtn.addEventListener('click', save);
  document.getElementById('settingsBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'openSettings' });
  });

  function save() {
    const key = keyInput.value.trim();
    const url = document.getElementById('serverUrl').value.trim() || 'https://api.cesaflow.ai';
    if (!key) { keyInput.focus(); return; }
    saveBtn.textContent = 'Bağlanıyor...';
    saveBtn.disabled = true;
    vscode.postMessage({ type: 'setApiKey', key, url, provider: selectedProvider.id });
  }
})();
