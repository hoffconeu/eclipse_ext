#!/usr/bin/env bash
set -euo pipefail

repository_dir=${1:-releng/com.oje.eclipse.hello.repository/target/repository}
content_jar="$repository_dir/content.jar"
artifacts_jar="$repository_dir/artifacts.jar"

if [[ ! -f "$content_jar" || ! -f "$artifacts_jar" ]]; then
    printf 'P2 audit failed: repository metadata is missing in %s\n' "$repository_dir" >&2
    exit 1
fi

content_xml=$(unzip -p "$content_jar" content.xml)
artifacts_xml=$(unzip -p "$artifacts_jar" artifacts.xml)

if grep -q 'org\.objectweb\.asm' <<<"$content_xml$artifacts_xml"; then
    printf 'P2 audit failed: ASM must not be shipped by the OJE repository.\n' >&2
    exit 1
fi

mapfile -t artifact_ids < <(
    sed -n "s/.*<artifact classifier='[^']*' id='\([^']*\)'.*/\1/p" <<<"$artifacts_xml" |
        sort -u
)

expected_ids=(
    com.oje.eclipse.hello
    com.oje.eclipse.hello.feature
)

if [[ "${artifact_ids[*]}" != "${expected_ids[*]}" ]]; then
    printf 'P2 audit failed: unexpected artifact IDs: %s\n' "${artifact_ids[*]:-(none)}" >&2
    exit 1
fi

if ! grep -q "<unit id='com.oje.eclipse.hello'" <<<"$content_xml"; then
    printf 'P2 audit failed: plug-in installable unit is missing.\n' >&2
    exit 1
fi

if ! grep -q "<unit id='com.oje.eclipse.hello.feature.feature.group'" <<<"$content_xml"; then
    printf 'P2 audit failed: feature installable unit is missing.\n' >&2
    exit 1
fi

printf 'P2 repository audit passed: only OJE plug-in and feature artifacts are present.\n'
