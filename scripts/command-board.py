#!/usr/bin/env python3
"""Publish commands for the Access-protected Eclipse commands page."""

import argparse
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

FEED_PATH = Path(os.environ.get("COMMAND_FEED_PATH", "/var/lib/eclipse-ext-commands/feed.json"))
COMMAND_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def read_feed():
    if not FEED_PATH.exists():
        return {"updated_at": None, "commands": []}
    feed = json.loads(FEED_PATH.read_text(encoding="utf-8"))
    if not isinstance(feed, dict) or not isinstance(feed.get("commands"), list):
        raise SystemExit("Die gespeicherte Befehlsliste ist ungueltig.")
    return feed


def write_feed(feed):
    if not FEED_PATH.parent.is_dir():
        raise SystemExit(f"Befehlsverzeichnis fehlt: {FEED_PATH.parent}")
    feed["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="microseconds")
    data = json.dumps(feed, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
    if len(data) > 128_000:
        raise SystemExit("Die Befehlsliste ist zu gross.")
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(dir=FEED_PATH.parent, prefix=".feed-", delete=False) as stream:
            temp_path = Path(stream.name)
            os.fchmod(stream.fileno(), 0o640)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_path, FEED_PATH)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description="Befehle ohne Pages-Deployment veroeffentlichen")
    subparsers = parser.add_subparsers(dest="action", required=True)
    put = subparsers.add_parser("put", help="Befehl hinzufuegen oder aktualisieren")
    put.add_argument("--id", required=True)
    put.add_argument("--title", required=True)
    put.add_argument("--description", default="")
    put.add_argument("--kind", choices=["powershell", "text"], default="powershell")
    put.add_argument("--body-file", type=Path, required=True)
    remove = subparsers.add_parser("remove", help="Befehl entfernen")
    remove.add_argument("id")
    subparsers.add_parser("list", help="Aktuelle Titel anzeigen")
    args = parser.parse_args()

    feed = read_feed()
    if args.action == "list":
        for command in feed["commands"]:
            print(f"{command['id']}: {command['title']}")
        return

    if args.action == "put":
        if not COMMAND_ID.fullmatch(args.id):
            raise SystemExit("ID darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten.")
        title = args.title.strip()
        description = args.description.strip()
        body = args.body_file.read_text(encoding="utf-8").strip()
        if not title or len(title) > 120 or len(description) > 500 or not body or len(body) > 20_000:
            raise SystemExit("Titel, Beschreibung oder Befehlsinhalt haben eine ungueltige Laenge.")
        command = {
            "id": args.id,
            "title": title,
            "description": description,
            "kind": args.kind,
            "body": body,
        }
        feed["commands"] = [item for item in feed["commands"] if item["id"] != args.id]
        feed["commands"].insert(0, command)
    elif args.action == "remove":
        remaining = [item for item in feed["commands"] if item["id"] != args.id]
        if len(remaining) == len(feed["commands"]):
            raise SystemExit(f"Befehl nicht gefunden: {args.id}")
        feed["commands"] = remaining

    write_feed(feed)
    print(f"Befehlsliste aktualisiert: {FEED_PATH}")
    print("Offene Seite laedt die Aenderung automatisch nach.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        print(f"Fehler: {error}", file=sys.stderr)
        raise SystemExit(1) from error
