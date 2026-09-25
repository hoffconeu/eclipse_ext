#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "Public audit failed: tracked working tree changes are not committed." >&2
    exit 1
fi

blocked_path_pattern='(^|/)(\.env($|\.)|[^/]*\.(pem|key|p12|pfx|jks|keystore)$|id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$|credentials?$|secrets?($|[./_-]))'
sensitive_content_pattern='BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,}|Authorization:[[:space:]]*(Bearer|Basic)[[:space:]]+[A-Za-z0-9+/_.=-]{8,}|(password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token)[[:space:]]*[:=][[:space:]]*[^[:space:]]{8,}'

failed=0

if git rev-list --objects --all | awk '{$1=""; sub(/^ /, ""); print}' | grep -Eiq "$blocked_path_pattern"; then
    echo "Public audit failed: Git history contains a credential-like filename." >&2
    failed=1
fi

while IFS= read -r revision; do
    matches="$(git grep -I -l -E -e "$sensitive_content_pattern" "$revision" -- . 2>/dev/null || true)"
    if [[ -n "$matches" ]]; then
        echo "Public audit failed: sensitive-looking content in revision $revision:" >&2
        printf '%s\n' "$matches" >&2
        failed=1
    fi
done < <(git rev-list --all)

if [[ "$failed" -ne 0 ]]; then
    exit 1
fi

echo "Public audit passed: no blocked paths or sensitive patterns found."
