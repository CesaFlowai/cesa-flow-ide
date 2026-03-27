const vscode = acquireVsCodeApi();

const PROVIDERS = [
  { id: 'groq',      name: 'Groq',      placeholder: 'gsk_...',  hint: 'Groq — en hızlı, ücretsiz tier mevcut',   url: 'https://console.groq.com/keys' },
  { id: 'openai',   name: 'OpenAI',    placeholder: 'sk-...',   hint: 'GPT-4o, GPT-4.1 — güçlü ve yaygın',      url: 'https://platform.openai.com/api-keys' },
  { id: 'anthropic',name: 'Anthropic', placeholder: 'sk-ant-...', hint: 'Claude Sonnet/Opus — en zeki modeller',  url: 'https://console.anthropic.com/keys' },
  { id: 'gemini',   name: 'Gemini',    placeholder: 'AIza...',  hint: 'Google Gemini — ücretsiz tier mevcut',    url: 'https://aistudio.google.com/apikey' },
  { id: 'openrouter',name:'OpenRouter', placeholder: 'sk-or-...', hint: 'Tüm modellere tek key ile erişim',       url: 'https://openrouter.ai/keys' },
  { id: 'custom',   name: 'Diğer',     placeholder: 'API key...', hint: 'Kendi sunucun veya başka bir provider', url: null },
];

let selectedProvider = PROVIDERS[0];

function renderPills() {
  const container = document.getElementById('providerPills');
  container.innerHTML = '';
  PROVIDERS.forEach(p => {
    const pill = document.createElement('button');
    pill.className = 'pill' + (p.id === selectedProvider.id ? ' active' : '');
    pill.textContent = p.name;
    pill.addEventListener('click', () => {
      selectedProvider = p;
      renderPills();
      updateKeySection();
    });
    container.appendChild(pill);
  });
}

function updateKeySection() {
  const p = selectedProvider;
  document.getElementById('keyLabel').textContent = p.name + ' API Key';
  document.getElementById('apiKey').placeholder = p.placeholder;
  document.getElementById('keyHint').textContent = p.hint;
  const link = document.getElementById('getKeyLink');
  if (p.url) {
    link.href = p.url;
    link.style.display = 'inline';
  } else {
    link.style.display = 'none';
  }
}

// Init
renderPills();
updateKeySection();

// If there's an existing key hint from server
const script = document.currentScript || document.querySelector('script[data-current-key]');
const existingKey = script ? script.getAttribute('data-current-key') : '';
if (existingKey) {
  document.getElementById('keyHint').textContent = 'Mevcut key: ' + existingKey;
}

// Test connection
document.getElementById('testBtn').addEventListener('click', () => {
  const url = document.getElementById('serverUrl').value.trim();
  const resultEl = document.getElementById('testResult');
  resultEl.className = 'test-result';
  resultEl.textContent = 'Test ediliyor...';
  resultEl.style.display = 'block';
  vscode.postMessage({ type: 'testConnection', serverUrl: url });
});

// Save
document.getElementById('saveBtn').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value.trim();
  const url = document.getElementById('serverUrl').value.trim();
  const autoApply = document.getElementById('autoApply').checked;
  vscode.postMessage({
    type: 'save',
    apiKey: key || undefined,
    serverUrl: url,
    autoApply,
  });
});

// Cancel
document.getElementById('cancelBtn').addEventListener('click', () => {
  vscode.postMessage({ type: 'cancel' });
  window.close();
});

// Receive messages
window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.type === 'connectionResult') {
    const resultEl = document.getElementById('testResult');
    if (msg.ok) {
      resultEl.className = 'test-result ok';
      resultEl.textContent = '✓ Sunucuya bağlantı başarılı';
    } else {
      resultEl.className = 'test-result fail';
      resultEl.textContent = '✗ Bağlantı kurulamadı — URL ve sunucuyu kontrol et';
    }
  }
});
