const copyStatus = document.querySelector('#copy-status');
const responseForm = document.querySelector('#command-response-form');
const commandInput = document.querySelector('#executed-command');
const outputInput = document.querySelector('#command-output');
const noteInput = document.querySelector('#response-note');
const responseSubmit = document.querySelector('#response-submit');
const responseStatus = document.querySelector('#response-status');
const apiUrl = '/api/diagnostics';
const maxMessageSize = 100000;

document.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
        const command = document.querySelector(`#${button.dataset.copyTarget}`);
        const text = command.textContent.trim();

        try {
            await navigator.clipboard.writeText(text);
            copyStatus.textContent = 'Befehl wurde kopiert.';
            button.textContent = 'Kopiert!';
        } catch {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(command);
            selection.removeAllRanges();
            selection.addRange(range);
            copyStatus.textContent = 'Befehl ist markiert. Bitte mit Strg+C kopieren.';
        }
    });
});

document.querySelectorAll('[data-use-target]').forEach((button) => {
    button.addEventListener('click', () => {
        const command = document.querySelector(`#${button.dataset.useTarget}`);
        commandInput.value = command.textContent.trim();
        commandInput.focus();
        commandInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
});

responseForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    responseStatus.className = 'status';

    const command = commandInput.value.trim();
    const output = outputInput.value.trim();
    const note = noteInput.value.trim();
    const message = [
        'Quelle: Eclipse-Befehlsseite',
        '',
        'Ausgefuehrter Befehl:',
        command,
        '',
        'Ausgabe:',
        output,
        ...(note ? ['', 'Notiz:', note] : []),
    ].join('\n');

    if (new TextEncoder().encode(message).byteLength > maxMessageSize) {
        showResponseError('Die Rueckmeldung ist zu lang. Bitte die Ausgabe kuerzen oder als Logdatei ueber den Diagnosebereich senden.');
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
