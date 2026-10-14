const copyStatus = document.querySelector('#copy-status');
const liveCommandsStatus = document.querySelector('#live-commands-status');
const liveCommandsList = document.querySelector('#live-commands-list');
const responseForm = document.querySelector('#command-response-form');
const commandInput = document.querySelector('#executed-command');
const outputInput = document.querySelector('#command-output');
const outputSize = document.querySelector('#command-output-size');
const noteInput = document.querySelector('#response-note');
const responseSubmit = document.querySelector('#response-submit');
const responseStatus = document.querySelector('#response-status');
const apiUrl = '/api/diagnostics';
const maxMessageSize = 5 * 1024 * 1024;
const textEncoder = new TextEncoder();
let displayedRevision;
let loadingCommands = false;

document.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-copy-target], button[data-use-target]');
    if (!button) return;

    if (button.dataset.copyTarget) {
        const command = document.querySelector(`#${button.dataset.copyTarget}`);
        if (!command) return;
        const text = command.textContent.trim();

        try {
            await navigator.clipboard.writeText(text);
            copyStatus.textContent = 'Text wurde kopiert.';
            button.textContent = 'Kopiert!';
        } catch {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(command);
            selection.removeAllRanges();
            selection.addRange(range);
            copyStatus.textContent = 'Text ist markiert. Bitte mit Strg+C kopieren.';
        }
    } else {
        const command = document.querySelector(`#${button.dataset.useTarget}`);
        if (!command) return;
        commandInput.value = command.textContent.trim();
        commandInput.focus();
        commandInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

async function refreshCommands() {
    if (loadingCommands || document.visibilityState === 'hidden') return;
    loadingCommands = true;
    try {
        const response = await fetch('/commands-feed', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const feed = await response.json();
        if (!Array.isArray(feed.commands)) throw new Error('Ungueltige Antwort');
        if (feed.updated_at !== displayedRevision) {
            renderCommands(feed.commands);
            displayedRevision = feed.updated_at;
        }
        liveCommandsStatus.className = 'status success';
        liveCommandsStatus.textContent = feed.commands.length
            ? 'Befehlsliste aktuell. Sie wird automatisch nachgeladen.'
            : 'Gerade kein neuer Befehl. Die Seite prueft automatisch weiter.';
    } catch {
        liveCommandsStatus.className = 'status error';
        liveCommandsStatus.textContent = 'Befehlsliste momentan nicht erreichbar. Bitte Anmeldung pruefen oder Seite neu laden.';
    } finally {
        loadingCommands = false;
    }
}

function renderCommands(commands) {
    liveCommandsList.replaceChildren();
    for (const item of commands) {
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(item.id) || typeof item.body !== 'string') continue;
        const section = document.createElement('section');
        const title = document.createElement('h3');
        title.textContent = item.title;
        section.append(title);
        if (item.description) {
            const description = document.createElement('p');
            description.textContent = item.description;
            section.append(description);
        }
        const box = document.createElement('div');
        box.className = 'command';
        const body = document.createElement('pre');
        body.id = `live-command-${item.id}`;
        body.textContent = item.body;
        const actions = document.createElement('div');
        actions.className = 'actions';
        const useButton = document.createElement('button');
        useButton.type = 'button';
        useButton.className = 'secondary';
        useButton.dataset.useTarget = body.id;
        useButton.textContent = 'Fuer Antwort uebernehmen';
        const copyButton = document.createElement('button');
        copyButton.type = 'button';
        copyButton.dataset.copyTarget = body.id;
        copyButton.textContent = item.kind === 'text' ? 'Text kopieren' : 'Befehl kopieren';
        actions.append(useButton, copyButton);
        box.append(body, actions);
        section.append(box);
        liveCommandsList.append(section);
    }
}

refreshCommands();
setInterval(refreshCommands, 15_000);
document.addEventListener('visibilitychange', refreshCommands);

function currentMessage() {
    const command = commandInput.value.trim();
    const output = outputInput.value.trim();
    const note = noteInput.value.trim();
    return {
        command,
        output,
        message: [
            'Quelle: Eclipse-Befehlsseite',
            '',
            'Aktion oder ausgefuehrter Befehl:',
            command,
            '',
            'Ausgabe:',
            output,
            ...(note ? ['', 'Notiz:', note] : []),
        ].join('\n'),
    };
}

function updateMessageSize() {
    const bytes = textEncoder.encode(currentMessage().message).byteLength;
    outputSize.textContent = `${bytes.toLocaleString('de-DE')} Byte insgesamt. Maximal 5 MiB; der Text wird nicht abgeschnitten.`;
    outputSize.className = bytes > maxMessageSize ? 'error' : '';
}

for (const field of [commandInput, outputInput, noteInput]) {
    field.addEventListener('input', updateMessageSize);
}

responseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    responseStatus.className = 'status';

    const { message } = currentMessage();

    if (textEncoder.encode(message).byteLength > maxMessageSize) {
        showResponseError('Die Rueckmeldung ist groesser als 5 MiB. Bitte nur den relevanten Logabschnitt senden. Dein eingefuegter Text bleibt erhalten.');
        return;
    }

    const body = new FormData();
    body.set('message', message);

    responseSubmit.disabled = true;
    responseStatus.textContent = 'Antwort wird gesendet …';

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            body,
            credentials: 'same-origin',
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || `Senden fehlgeschlagen (HTTP ${response.status}).`);
        }

        responseForm.reset();
        outputSize.textContent = 'Bis zu 5 MiB Text pro Rueckmeldung. Eingefuegter Text wird nicht abgeschnitten.';
        outputSize.className = '';
        responseStatus.className = 'status success';
        responseStatus.textContent = `Erfolgreich gesendet. Bitte nenne mir die Vorgangsnummer ${result.id}.`;
    } catch (error) {
        showResponseError(error.message || 'Senden fehlgeschlagen.');
    } finally {
        responseSubmit.disabled = false;
    }
});

function showResponseError(message) {
    responseStatus.className = 'status error';
    responseStatus.textContent = message;
}
