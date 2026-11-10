const conversation = document.querySelector('#conversation');
const status = document.querySelector('#status');
const model = document.querySelector('#model');
const prompt = document.querySelector('#prompt');
const send = document.querySelector('#send');
const messages = [];
let busy = false;

function setStatus(text) { status.textContent = text; }

function render() {
  conversation.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Schreib eine Nachricht oder füge Text ein. Noch nicht senden, wenn er vertrauliche Firmendaten enthält.';
    conversation.append(empty);
  }
  for (const message of messages) {
    const block = document.createElement('div');
    block.className = `message ${message.role}`;
    const label = document.createElement('small');
    label.textContent = message.role === 'user' ? 'Du' : 'Antwort';
    block.append(label, document.createTextNode(message.content));
    conversation.append(block);
  }
  conversation.scrollTop = conversation.scrollHeight;
}

async function connect() {
  try {
    const response = await fetch('/commands-chat-api', { credentials: 'same-origin', cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.connected) throw new Error(data.error || 'Chat nicht verbunden');
    for (const item of data.models || []) {
      const option = document.createElement('option');
      option.value = item.slug;
      option.textContent = item.name;
      model.append(option);
    }
    if (!model.options.length) throw new Error('Keine Modelle für dieses Konto verfügbar');
    model.disabled = false;
    send.disabled = false;
    setStatus('Mit ChatGPT-Plan verbunden');
  } catch (error) { setStatus(error.message); }
}

document.querySelector('#form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text || busy || !model.value) return;
  busy = true;
  send.disabled = true;
  messages.push({ role: 'user', content: text });
  prompt.value = '';
  render();
  setStatus('Antwort wird erstellt …');
  try {
    const response = await fetch('/commands-chat-api', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.value, messages }) });
    const data = await response.json();
    if (!response.ok || typeof data.text !== 'string') throw new Error(data.error || 'Keine Antwort erhalten');
    messages.push({ role: 'assistant', content: data.text });
    render();
    setStatus('Mit ChatGPT-Plan verbunden');
  } catch (error) {
    messages.pop();
    prompt.value = text;
    render();
    setStatus(error.message);
  } finally { busy = false; send.disabled = false; }
});

prompt.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); document.querySelector('#form').requestSubmit(); }
});

document.querySelector('#new-chat').addEventListener('click', () => { messages.length = 0; render(); prompt.focus(); });
connect();
