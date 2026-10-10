#!/usr/bin/env python3
"""Fetch and verify the official scrcpy release bundle for the host build target.

The upstream release archives contain both scrcpy and adb. The binaries are
kept out of the source repository and added to the Tauri package as resources.
"""
from __future__ import annotations

import hashlib
import os
import platform
import shutil
import stat
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path, PurePosixPath

SCRCPY_VERSION = os.environ.get("SCRCPY_VERSION", "5.0.1")
RELEASE_ROOT = f"https://github.com/Genymobile/scrcpy/releases/download/v{SCRCPY_VERSION}"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
TOOLS_DIR = PROJECT_ROOT / "src-tauri" / "resources" / "tools"
USER_AGENT = "DeviceBridge-build/0.1 (https://github.com/MeganAe)"


def target_asset() -> tuple[str, str, str]:
    system = platform.system().lower()
    machine = platform.machine().lower()
    if system == "windows":
        if machine in {"arm64", "aarch64"}:
            return "windows", "scrcpy-winarm64-v{version}.zip", "adb.exe"
        if machine in {"amd64", "x86_64", "x64"}:
            return "windows", "scrcpy-win64-v{version}.zip", "adb.exe"
        raise RuntimeError(f"Architecture Windows non prise en charge : {machine}")
    if system == "darwin":
        if machine in {"arm64", "aarch64"}:
            return "macos", "scrcpy-macos-aarch64-v{version}.tar.gz", "adb"
        if machine in {"amd64", "x86_64", "x64"}:
            return "macos", "scrcpy-macos-x86_64-v{version}.tar.gz", "adb"
        raise RuntimeError(f"Architecture macOS non prise en charge : {machine}")
    if system == "linux":
        if machine in {"amd64", "x86_64", "x64"}:
            return "linux", "scrcpy-linux-x86_64-v{version}.tar.gz", "adb"
        raise RuntimeError(f"Architecture Linux non prise en charge par cette version : {machine}")
    raise RuntimeError(f"Système non pris en charge : {system}")


def download(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, destination.open("wb") as output:
        shutil.copyfileobj(response, output)


def verify_sha256(asset_path: Path, asset_name: str, sums_path: Path) -> None:
    expected = None
    for line in sums_path.read_text(encoding="utf-8").splitlines():
        fields = line.strip().split()
        if len(fields) >= 2 and fields[-1].lstrip("*") == asset_name:
            expected = fields[0].lower()
            break
    if not expected or len(expected) != 64:
        raise RuntimeError(f"SHA-256 introuvable pour {asset_name} dans SHA256SUMS.txt")
    digest = hashlib.sha256()
    with asset_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    actual = digest.hexdigest()
    if actual != expected:
        raise RuntimeError(f"Vérification SHA-256 échouée pour {asset_name}")


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


def extract_tar(archive: Path, destination: Path) -> None:
    with tarfile.open(archive, mode="r:gz") as package:
        for member in package.getmembers():
            target = safe_target(destination, member.name)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            if not member.isfile():
                raise RuntimeError(f"Type de fichier non pris en charge dans l’archive : {member.name}")
            target.parent.mkdir(parents=True, exist_ok=True)
            source = package.extractfile(member)
            if source is None:
                raise RuntimeError(f"Impossible de lire {member.name}")
            with source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
            target.chmod(member.mode & 0o777)


def clear_tools_dir() -> None:
    TOOLS_DIR.mkdir(parents=True, exist_ok=True)
    for entry in TOOLS_DIR.iterdir():
        if entry.name == ".gitkeep":
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry)
        else:
            entry.unlink()


def copy_release_contents(extracted: Path, asset_name: str, destination: Path) -> None:
    folder_name = asset_name.removesuffix(".tar.gz").removesuffix(".zip")
    source_root = extracted / folder_name
    if not source_root.is_dir():
        candidates = [entry for entry in extracted.iterdir() if entry.is_dir()]
        if len(candidates) != 1:
            raise RuntimeError("Structure de l’archive scrcpy inattendue")
        source_root = candidates[0]
    for entry in source_root.iterdir():
        target = destination / entry.name
        if entry.is_dir():
            shutil.copytree(entry, target, dirs_exist_ok=True)
        else:
            shutil.copy2(entry, target)


def main() -> int:
    try:
        system, asset_pattern, adb_name = target_asset()
        asset_name = asset_pattern.format(version=SCRCPY_VERSION)
        with tempfile.TemporaryDirectory(prefix="device-bridge-tools-") as temporary:
            temporary_path = Path(temporary)
            asset_path = temporary_path / asset_name
            sums_path = temporary_path / "SHA256SUMS.txt"
            extracted = temporary_path / "extracted"
            extracted.mkdir()

            print(f"Téléchargement de scrcpy {SCRCPY_VERSION} ({system})…")
            download(f"{RELEASE_ROOT}/{asset_name}", asset_path)
            download(f"{RELEASE_ROOT}/SHA256SUMS.txt", sums_path)
            verify_sha256(asset_path, asset_name, sums_path)

            if asset_name.endswith(".zip"):
                extract_zip(asset_path, extracted)
            else:
                extract_tar(asset_path, extracted)

            clear_tools_dir()
            copy_release_contents(extracted, asset_name, TOOLS_DIR)

        scrcpy_name = "scrcpy.exe" if system == "windows" else "scrcpy"
        for required in (adb_name, scrcpy_name, "scrcpy-server"):
            if not (TOOLS_DIR / required).is_file():
                raise RuntimeError(f"Le paquet scrcpy n’inclut pas le fichier attendu : {required}")

        if system != "windows":
            for name in (adb_name, scrcpy_name):
                binary = TOOLS_DIR / name
                binary.chmod(binary.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        print("Composants prêts et vérifiés : ADB + scrcpy.")
        return 0
    except Exception as error:  # noqa: BLE001 - show a concise setup error to the build log
        print(f"Préparation des composants impossible : {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
