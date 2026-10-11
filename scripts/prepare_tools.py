#!/usr/bin/env python3
"""Fetch and verify Google's Android SDK Platform-Tools for the build host.

Only Platform-Tools are bundled. Device Bridge does not download or launch a
third-party screen-mirroring program. The in-house mirror engine is a separate
work item and must not be represented as available until implemented.
"""
from __future__ import annotations

import hashlib
import os
import platform
import shutil
import stat
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

PLATFORM_TOOLS_VERSION = os.environ.get("PLATFORM_TOOLS_VERSION", "37.0.1")
DOWNLOAD_ROOT = "https://dl.google.com/android/repository"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = PROJECT_ROOT / "src-tauri" / "resources" / "tools"
USER_AGENT = "DeviceBridge-build/0.2 (Android SDK Platform-Tools)"

# SHA-1 values published in Google's Android SDK repository metadata for the
# pinned Platform-Tools release. The download is also fetched over HTTPS.
ARCHIVES = {
    "linux": ("platform-tools_r37.0.1-linux.zip", "477254aa5f903c15cf51001717bdf347fb6b53e0", "adb"),
    "macos": ("platform-tools_r37.0.1-darwin.zip", "6ae73f4de6452dc57e62ec02b68eed92a4c21661", "adb"),
    "windows": ("platform-tools_r37.0.1-win.zip", "e03e78b1d80b396f1c3358e31251cb31740e1110", "adb.exe"),
}


def target_archive() -> tuple[str, str, str]:
    system = platform.system().lower()
    if system == "darwin":
        system = "macos"
    if system not in ARCHIVES:
        raise RuntimeError(f"Système non pris en charge : {system}")
    return ARCHIVES[system]


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def verify_sha1(archive: Path, expected: str) -> None:
    digest = hashlib.sha1()
    with archive.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual.lower() != expected.lower():
        raise RuntimeError(f"Vérification SHA-1 officielle échouée : {actual}")


def safe_target(root: Path, member_name: str) -> Path:
    member = PurePosixPath(member_name.replace("\\", "/"))
    if member.is_absolute() or ".." in member.parts:
        raise RuntimeError(f"Chemin inattendu dans l’archive : {member_name}")
    target = (root / Path(*member.parts)).resolve()
    if not target.is_relative_to(root.resolve()):
        raise RuntimeError(f"Chemin inattendu dans l’archive : {member_name}")
    return target


def extract_zip(archive: Path, destination: Path) -> None:
    with zipfile.ZipFile(archive) as package:
        for info in package.infolist():
            target = safe_target(destination, info.filename)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with package.open(info) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
            mode = (info.external_attr >> 16) & 0o777
            if mode:
                target.chmod(mode)


def clear_tools_dir() -> None:
    TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    for entry in TOOLS_DIR.iterdir():
        if entry.name == ".gitkeep":
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry)
        else:
            entry.unlink()


def main() -> int:
    try:
        archive_name, expected_sha1, adb_name = target_archive()
        if PLATFORM_TOOLS_VERSION != "37.0.1":
            raise RuntimeError("Cette version du script ne vérifie que Platform-Tools 37.0.1.")
        with tempfile.TemporaryDirectory(prefix="device-bridge-platform-tools-") as temporary:
            temporary_path = Path(temporary)
            archive_path = temporary_path / archive_name
            extracted = temporary_path / "extracted"
            extracted.mkdir()
            print(f"Téléchargement des Android SDK Platform-Tools {PLATFORM_TOOLS_VERSION}…")
            download(f"{DOWNLOAD_ROOT}/{archive_name}", archive_path)
            verify_sha1(archive_path, expected_sha1)
            extract_zip(archive_path, extracted)

            source_root = extracted / "platform-tools"
            if not source_root.is_dir():
                raise RuntimeError("Structure inattendue de l’archive Android Platform-Tools.")
            source_properties = source_root / "source.properties"
            if not source_properties.is_file() or f"Pkg.Revision={PLATFORM_TOOLS_VERSION}" not in source_properties.read_text(encoding="utf-8", errors="replace"):
                raise RuntimeError("La révision extraite ne correspond pas à la version vérifiée.")

            clear_tools_dir()
            for entry in source_root.iterdir():
                if entry.is_file() and (
                    entry.name in {adb_name, "source.properties", "NOTICE.txt"}
                    or entry.suffix.lower() in {".dll", ".dylib", ".so"}
                ):
                    shutil.copy2(entry, TOOLS_DIR / entry.name)
                elif entry.is_dir() and entry.name == "lib64":
                    shutil.copytree(entry, TOOLS_DIR / entry.name, dirs_exist_ok=True)

        adb = TOOLS_DIR / adb_name
        if not adb.is_file():
            raise RuntimeError(f"ADB manque dans l’archive vérifiée : {adb_name}")
        if platform.system().lower() != "windows":
            adb.chmod(adb.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
        if platform.system().lower() == "windows":
            for dependency in ("AdbWinApi.dll", "AdbWinUsbApi.dll"):
                if not (TOOLS_DIR / dependency).is_file():
                    raise RuntimeError(f"Dépendance Windows manquante : {dependency}")

        print("ADB Platform-Tools vérifié et prêt. Aucun moteur de miroir tiers n’est empaqueté.")
        return 0
    except Exception as error:  # noqa: BLE001 - concise setup error for build logs
        print(f"Préparation d’ADB impossible : {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
