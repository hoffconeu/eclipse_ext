const copyButton = document.querySelector('#copy-repository');
const repositoryUrl = document.querySelector('#repository-url');
const copyStatus = document.querySelector('#copy-status');

copyButton.addEventListener('click', async () => {
    repositoryUrl.select();
    repositoryUrl.setSelectionRange(0, repositoryUrl.value.length);

    try {
        await navigator.clipboard.writeText(repositoryUrl.value);
        copyStatus.textContent = 'Adresse wurde kopiert.';
        copyButton.textContent = 'Kopiert!';
    } catch {
        copyStatus.textContent = 'Adresse ist markiert. Bitte mit Strg+C kopieren.';
    }
});
