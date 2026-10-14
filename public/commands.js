const copyStatus = document.querySelector('#copy-status');

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
