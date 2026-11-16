document.getElementById('form').addEventListener('submit', async event => {
  event.preventDefault();
  const result = document.getElementById('result');
  result.textContent = 'Kopplung läuft …';
  try {
    const response = await fetch('/commands-eclipse-pair-api', {
      method: 'POST', body: document.getElementById('code').value, credentials: 'same-origin',
    });
    const body = await response.text();
    result.textContent = response.ok && body === 'paired'
      ? 'Eclipse ist gekoppelt. Starte die Lesesitzung in Eclipse.'
      : `Kopplung fehlgeschlagen (${response.status}).`;
  } catch { result.textContent = 'Verbindung fehlgeschlagen.'; }
});
