import fs from 'node:fs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Usage: npm run set-version -- 0.2.0');
  process.exit(1);
}

const packagePath = 'package.json';
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
packageJson.version = version;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

if (fs.existsSync('package-lock.json')) {
  const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  fs.writeFileSync('package-lock.json', `${JSON.stringify(lock, null, 2)}\n`);
}

const cargoPath = 'src-tauri/Cargo.toml';
const cargo = fs.readFileSync(cargoPath, 'utf8');
const updatedCargo = cargo.replace(/(^version\s*=\s*")[^"]+(")/m, `$1${version}$2`);
fs.writeFileSync(cargoPath, updatedCargo);

const configPath = 'src-tauri/tauri.conf.json';
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.version = version;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const htmlPath = 'ui/index.html';
const html = fs.readFileSync(htmlPath, 'utf8');
const updatedHtml = html.replace(/(<span id="sidebar-version">)[^<]+(<\/span>)/, `$1${version}$2`);
fs.writeFileSync(htmlPath, updatedHtml);

console.log(`Version définie sur ${version} dans les métadonnées et l’interface.`);
