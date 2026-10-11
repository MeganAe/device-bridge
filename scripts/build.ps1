$ErrorActionPreference = 'Stop'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm est requis pour construire Device Bridge.'
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    py -3 scripts/prepare_tools.py
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    python scripts/prepare_tools.py
} else {
    throw 'Python 3.9+ est requis pour préparer les outils embarqués.'
}
if ($LASTEXITCODE -ne 0) { throw 'La préparation d’ADB Platform-Tools a échoué.' }

npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci a échoué.' }
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Le build Tauri a échoué.' }

Write-Host "Build terminé. Consultez src-tauri/target/release/bundle/."
