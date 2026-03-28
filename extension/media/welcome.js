(function () {
  const vscode = acquireVsCodeApi();

  const keyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');

  keyInput.addEventListener('input', () => {
    saveBtn.disabled = keyInput.value.trim().length < 8;
  });
  keyInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !saveBtn.disabled) save();
  });
  saveBtn.addEventListener('click', save);

  document.getElementById('settingsBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'openSettings' });
  });

  function save() {
    const key = keyInput.value.trim();
    if (!key) { keyInput.focus(); return; }
    saveBtn.textContent = 'Bağlanıyor...';
    saveBtn.disabled = true;
    vscode.postMessage({ type: 'setApiKey', key, url: 'https://api.cesaflow.ai' });
  }
})();
