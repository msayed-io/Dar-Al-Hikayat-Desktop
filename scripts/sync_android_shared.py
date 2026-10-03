#!/usr/bin/env python3
"""Safely review shared Android-project changes for the Desktop repository.

The Android repository is an immutable, read-only source for this script. Only the
small allowlist below may be copied, and files containing native-platform imports
are rejected. Everything else is reported for manual porting; no Android file is
modified by this tool.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

SAFE_SHARED_PATHS = {
    "components/HomePage.tsx",
    "components/DarAlHikayatEditor.tsx",
    "components/DarAlHikayatHandwriting.tsx",
    "components/HandwritingPreview.tsx",
    "components/RemoteMouseCursor.tsx",
    "components/RemoteKeyboardModal.tsx",
    "index.css",
    "lib/handwriting-eraser.ts",
    "lib/handwriting-document.ts",
    "lib/logo-assets.ts",
    "lib/remote-mouse.ts",
    "tests/handwriting-canvas-resize.test.tsx",
    "tests/handwriting-eraser.test.ts",
    "tests/handwriting-editor-integration.test.tsx",
    "tests/handwriting-preview.test.tsx",
    "tests/handwriting-ux-lifecycle.test.tsx",
    "tests/helpers/handwriting-dom.ts",
    "tests/remote-keyboard-protocol.test.ts",
    "tests/remote-mouse-cursor.test.tsx",
    "tests/remote-mouse.test.ts",
}
SAFE_BINARY_PATHS = {
    "public/dar-al-hikayat-logo-transparent-apple_dark.png",
    "public/dar-al-hikayat-logo-transparent-night_whisper.png",
    "public/dar-al-hikayat-logo-transparent-royal_classic.png",
}
PROTECTED_PREFIXES = (
    "src-tauri/",
    ".github/",
    "android/",
    "capacitor.config.json",
    "App.tsx",
    "contexts/AppContext.tsx",
    "components/SettingsPage.tsx",
    "components/DarAlHikayatEditor.tsx",
    "components/RemoteKeyboardModal.tsx",
    "lib/",
    "package.json",
    "package-lock.json",
    "index.html",
    "vite.config.ts",
)
NATIVE_MARKERS = re.compile(
    r"@capacitor|registerPlugin|NativeBiometric|PrayerAlarm|RemoteServer|tauri|schtasks|WindowsHello",
    re.IGNORECASE,
)


def sha256(path: Path) -> str:
    if not path.is_file():
        return "missing"
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_value(path: Path, args: list[str]) -> str:
    try:
        return subprocess.check_output(["git", *args], cwd=path, text=True).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def is_protected(path: str) -> bool:
    return any(path == prefix or path.startswith(prefix) for prefix in PROTECTED_PREFIXES)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--target", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--apply-safe", action="store_true")
    args = parser.parse_args()

    source = args.source.resolve()
    target = args.target.resolve()
    if not (source / ".git").exists():
        raise SystemExit(f"Android source is not a Git checkout: {source}")
    if not (target / ".git").exists():
        raise SystemExit(f"Desktop target is not a Git checkout: {target}")

    source_sha = git_value(source, ["rev-parse", "HEAD"])
    target_sha = git_value(target, ["rev-parse", "HEAD"])
    changed: list[str] = []
    safe_changes: list[str] = []
    protected_changes: list[str] = []
    rejected_changes: list[str] = []

    candidate_files = set()
    for root in (source, target):
        for file in root.rglob("*"):
            if file.is_file() and ".git" not in file.parts and "node_modules" not in file.parts:
                candidate_files.add(file.relative_to(root).as_posix())

    for rel in sorted(candidate_files):
        if rel.startswith(("android/", "dist/", "src-tauri/target/", "node_modules/")):
            continue
        src = source / rel
        dst = target / rel
        if not src.is_file() or (dst.is_file() and sha256(src) == sha256(dst)):
            continue
        changed.append(rel)
        if rel in SAFE_BINARY_PATHS:
            safe_changes.append(rel)
            if args.apply_safe:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
        elif rel in SAFE_SHARED_PATHS:
            try:
                text = src.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                rejected_changes.append(f"{rel} (binary or non-text safe file)")
                continue
            if NATIVE_MARKERS.search(text):
                rejected_changes.append(f"{rel} (native-platform marker detected)")
                continue
            safe_changes.append(rel)
            if args.apply_safe:
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
        elif is_protected(rel):
            protected_changes.append(rel)
        else:
            rejected_changes.append(rel)

    report = {
        "android_source": str(source),
        "android_sha": source_sha,
        "desktop_sha": target_sha,
        "changed_common_files": changed,
        "safe_changes": safe_changes,
        "protected_changes_manual_port_required": protected_changes,
        "rejected_changes": rejected_changes,
        "android_repository_modified": False,
        "safe_changes_applied": bool(args.apply_safe and safe_changes),
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(report, ensure_ascii=False, indent=2))
    # A protected change is not a build failure; it is an explicit review gate.
    # The workflow will publish the report and avoid an unsafe automatic merge.
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
