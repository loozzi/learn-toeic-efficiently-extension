const button = document.createElement('button');
button.textContent = 'IMEN spike';
button.style.cssText =
  'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:8px 12px;';
button.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'SPIKE_OPEN_PANEL' });
  console.log('[imen spike] sidePanel.open result:', response);
  button.textContent = response?.ok ? 'spike: OK' : `spike: FAIL — ${response?.error}`;
});
document.body.appendChild(button);
