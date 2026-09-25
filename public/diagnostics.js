const form = document.querySelector('#diagnostics-form');
const filesInput = document.querySelector('#files');
const submitButton = document.querySelector('#submit-button');
const statusBox = document.querySelector('#status');

const apiUrl = 'https://ext.oje.me/api/diagnostics';
const maxFileSize = 5 * 1024 * 1024;
const maxTotalSize = 10 * 1024 * 1024;

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusBox.className = '';

    const files = Array.from(filesInput.files);
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    if (files.length > 3) {
        showError('Bitte maximal drei Dateien auswaehlen.');
        return;
    }
    if (files.some((file) => file.size > maxFileSize) || totalSize > maxTotalSize) {
        showError('Die Dateien sind zu gross. Bitte die angegebenen Grenzen beachten.');
        return;
    }

    submitButton.disabled = true;
    statusBox.textContent = 'Upload laeuft …';

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: new FormData(form),
            credentials: 'omit',
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || `Upload fehlgeschlagen (HTTP ${response.status}).`);
        }

        form.reset();
        statusBox.className = 'success';
        statusBox.textContent = `Erfolgreich gesendet. Vorgangsnummer: ${result.id}`;
    } catch (error) {
        showError(error.message || 'Upload fehlgeschlagen.');
    } finally {
        submitButton.disabled = false;
    }
});

function showError(message) {
    statusBox.className = 'error';
    statusBox.textContent = message;
}
