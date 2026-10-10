const tauriInvoke = window.__TAURI__?.core?.invoke;
const isDesktopApp = typeof tauriInvoke === 'function';
const $ = (selector) => document.querySelector(selector);
const deviceRows = $('#device-rows');
const emptyState = $('#empty-state');
const operationStatus = $('#operation-status');
const runtimeStatus = $('#runtime-status-text');
const pairDialog = $('#pair-dialog');
const displayDialog = $('#display-dialog');

let currentTools = { adbFound: false, adbVersion: null, adbBundled: false, scrcpyFound: false, scrcpyVersion: null, scrcpyBundled: false };
let selectedDevice = null;
const DEVICE_PREFERENCES_KEY = 'device-bridge:device-preferences';
let devicePreferences = Object.create(null);
try {
  const savedPreferences = JSON.parse(window.localStorage.getItem(DEVICE_PREFERENCES_KEY) || '{}');
  if (savedPreferences && typeof savedPreferences === 'object' && !Array.isArray(savedPreferences)) {
    for (const [serial, preferences] of Object.entries(savedPreferences)) {
      devicePreferences[serial] = preferences;
    }
  }
} catch {
  devicePreferences = Object.create(null);
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function setStatus(target, text, tone = '') {
  target.textContent = text;
  if (tone) target.dataset.tone = tone;
  else delete target.dataset.tone;
}

function setRuntime(text) {
  runtimeStatus.textContent = text;
}

function openPairDialog() {
  $('#pair-status').textContent = '';
  delete $('#pair-status').dataset.tone;
  if (typeof pairDialog.showModal === 'function') pairDialog.showModal();
  else pairDialog.setAttribute('open', '');
}

function setView(view) {
  const isDevices = view === 'devices';
  $('#devices-view').hidden = !isDevices;
  $('#preferences-view').hidden = isDevices;
  $('#device-toolbar-actions').hidden = !isDevices;
  $('#page-title').textContent = isDevices ? 'Appareils' : 'Outils intégrés';
  $('#page-subtitle').textContent = isDevices
    ? 'Détectez et contrôlez vos appareils Android.'
    : 'ADB · scrcpy';
  document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (!isDevices) refreshTools();
}

function toolText(found, bundled) {
  if (!isDesktopApp) return 'Aperçu web';
  if (!found) return 'Absent';
  return bundled ? 'Intégré' : 'Installé localement';
}

function renderToolStatus(status) {
  currentTools = status;
  $('#adb-value').textContent = toolText(status.adbFound, status.adbBundled);
  $('#scrcpy-value').textContent = toolText(status.scrcpyFound, status.scrcpyBundled);
}

function deviceStateText(state) {
  if (state === 'device') return 'Connecté';
  if (state === 'unauthorized') return 'Autorisation requise';
  if (state === 'offline') return 'Hors ligne';
  return state || 'État inconnu';
}

function renderDevices(devices) {
  $('#device-count').textContent = devices.length === 1
    ? '1 appareil détecté'
    : `${devices.length} appareils détectés`;
  emptyState.hidden = devices.length > 0;
  deviceRows.replaceChildren();

  for (const device of devices) {
    const label = device.model || device.product || 'Appareil Android';
    const authorized = device.state === 'device';
    const canMirror = authorized && currentTools.scrcpyFound;
    const row = document.createElement('div');
    row.className = 'device-row';
    row.innerHTML = `
      <div class="device-main">
        <span class="device-row-icon"><svg aria-hidden="true"><use href="#i-device"></use></svg></span>
        <span class="device-labels">
          <span class="device-name">${escapeHtml(label)}</span>
          <span class="device-serial">${escapeHtml(device.serial)}</span>
        </span>
      </div>
      <span class="device-state">${escapeHtml(deviceStateText(device.state))}</span>
      <div class="device-actions">
        <button class="button button-secondary device-action" type="button" data-action="mirror" data-serial="${escapeHtml(device.serial)}" ${canMirror ? '' : 'disabled'}>Afficher l’écran</button>
        <button class="device-settings-button" type="button" data-action="settings" data-serial="${escapeHtml(device.serial)}" data-label="${escapeHtml(label)}" ${authorized ? '' : 'disabled'} aria-label="Réglages de l’appareil" title="Réglages">
          <svg aria-hidden="true"><use href="#i-settings"></use></svg>
        </button>
      </div>
    `;
    deviceRows.append(row);
  }

  deviceRows.querySelectorAll('[data-action="mirror"]').forEach((button) => {
    button.addEventListener('click', () => launchMirror(button.dataset.serial, getDeviceMirrorOptions(button.dataset.serial)));
  });
  deviceRows.querySelectorAll('[data-action="settings"]').forEach((button) => {
    button.addEventListener('click', () => openDisplayDialog(button.dataset.serial, button.dataset.label));
  });
}

async function refreshTools() {
  if (!isDesktopApp) {
    renderToolStatus({ adbFound: false, adbBundled: false, scrcpyFound: false, scrcpyBundled: false });
    return;
  }
  try {
    renderToolStatus(await tauriInvoke('tool_status'));
  } catch (error) {
    setStatus(operationStatus, String(error), 'error');
  }
}

async function refreshDevices() {
  if (!isDesktopApp) {
    renderDevices([]);
    setRuntime('Aperçu web — connexion indisponible.');
    return;
  }

  setRuntime('Recherche…');
  try {
    const status = await tauriInvoke('tool_status');
    renderToolStatus(status);
    if (!status.adbFound) {
      renderDevices([]);
      setRuntime('ADB absent.');
      return;
    }
    const devices = await tauriInvoke('list_devices');
    renderDevices(devices);
    setRuntime(devices.length ? `${devices.length} appareil(s) détecté(s).` : 'Aucun appareil détecté.');
  } catch (error) {
    renderDevices([]);
    setRuntime('La détection a échoué.');
    setStatus(operationStatus, String(error), 'error');
  }
}

function defaultMirrorOptions() {
  return { maxSize: 1920, maxFps: 60, bitrateMbps: 8, videoCodec: 'h264', audioEnabled: true, recordVideo: false };
}

async function launchMirror(serial, options = defaultMirrorOptions(), closeSettings = false) {
  if (!isDesktopApp) {
    setStatus(operationStatus, 'Contrôle disponible dans l’application de bureau.', '');
    return;
  }
  if (!currentTools.scrcpyFound) {
    setStatus(operationStatus, 'scrcpy absent.', 'error');
    return;
  }
  try {
    const result = await tauriInvoke('launch_mirror', { serial, options });
    const message = result.recordingFile
      ? `Enregistrement : ${result.recordingFile} · fermez scrcpy pour terminer.`
      : 'Fenêtre scrcpy ouverte.';
    setStatus(operationStatus, message, 'success');
    if (closeSettings && displayDialog.open) displayDialog.close();
  } catch (error) {
    const target = displayDialog.open ? $('#display-status') : operationStatus;
    setStatus(target, String(error), 'error');
  }
}

function updateBrightnessLabel() {
  const value = Number($('#brightness-slider').value);
  $('#brightness-value').textContent = `${Math.round((value / 255) * 100)} %`;
}

async function openDisplayDialog(serial, label) {
  selectedDevice = { serial, label };
  applyDeviceMirrorPreferences(serial);
  $('#display-device-name').textContent = label || serial;
  setStatus($('#display-status'), '');
  const slider = $('#brightness-slider');
  const autoBrightness = $('#auto-brightness');
  const sliderLabel = $('#brightness-value');
  slider.value = '128';
  autoBrightness.checked = false;
  slider.disabled = true;
  autoBrightness.disabled = true;
  sliderLabel.textContent = '…';
  if (typeof displayDialog.showModal === 'function') displayDialog.showModal();
  else displayDialog.setAttribute('open', '');

  if (!isDesktopApp) {
    setStatus($('#display-status'), 'Réglages disponibles dans l’application de bureau.');
    return;
  }
  try {
    const settings = await tauriInvoke('get_display_settings', { serial });
    slider.value = String(settings.brightness);
    autoBrightness.checked = settings.automatic;
    autoBrightness.disabled = false;
    slider.disabled = settings.automatic;
    updateBrightnessLabel();
  } catch (error) {
    slider.disabled = false;
    autoBrightness.disabled = false;
    updateBrightnessLabel();
    setStatus($('#display-status'), String(error), 'error');
  }
}

async function applyBrightness() {
  if (!selectedDevice || !isDesktopApp || $('#auto-brightness').checked) return;
  const brightness = Number($('#brightness-slider').value);
  try {
    await tauriInvoke('set_brightness', { serial: selectedDevice.serial, brightness });
    setStatus($('#display-status'), `Luminosité : ${Math.round((brightness / 255) * 100)} %.`, 'success');
  } catch (error) {
    setStatus($('#display-status'), String(error), 'error');
  }
}

async function changeBrightnessMode() {
  if (!selectedDevice || !isDesktopApp) return;
  const automatic = $('#auto-brightness').checked;
  $('#brightness-slider').disabled = automatic;
  try {
    await tauriInvoke('set_brightness_mode', { serial: selectedDevice.serial, automatic });
    setStatus($('#display-status'), automatic ? 'Luminosité automatique activée.' : 'Réglage manuel activé.', 'success');
  } catch (error) {
    $('#auto-brightness').checked = !automatic;
    $('#brightness-slider').disabled = !automatic;
    setStatus($('#display-status'), String(error), 'error');
  }
}

function readMirrorOptions() {
  const maxSize = $('#max-size').value;
  const maxFps = $('#max-fps').value;
  return {
    maxSize: maxSize ? Number(maxSize) : null,
    maxFps: maxFps ? Number(maxFps) : null,
    bitrateMbps: Number($('#bitrate-mbps').value),
    videoCodec: $('#video-codec').value,
    audioEnabled: $('#audio-enabled').checked,
    recordVideo: $('#record-video').checked,
  };
}

function getDeviceMirrorOptions(serial) {
  const saved = devicePreferences[serial];
  return { ...defaultMirrorOptions(), ...(saved && typeof saved === 'object' ? saved : {}) };
}

function applyDeviceMirrorPreferences(serial) {
  const options = getDeviceMirrorOptions(serial);
  const setSelect = (selector, value, fallback) => {
    const control = $(selector);
    const requested = value == null ? '' : String(value);
    control.value = Array.from(control.options).some((option) => option.value === requested) ? requested : fallback;
  };
  setSelect('#max-size', options.maxSize, '1920');
  setSelect('#max-fps', options.maxFps, '60');
  setSelect('#bitrate-mbps', options.bitrateMbps, '8');
  setSelect('#video-codec', options.videoCodec, 'h264');
  $('#audio-enabled').checked = options.audioEnabled !== false;
  $('#record-video').checked = options.recordVideo === true;
}

function saveDeviceMirrorPreferences() {
  if (!selectedDevice) return;
  devicePreferences[selectedDevice.serial] = readMirrorOptions();
  try {
    window.localStorage.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(devicePreferences));
  } catch {
    // Device options still apply for this session if local storage is unavailable.
  }
}

async function startConfiguredMirror() {
  if (!selectedDevice) return;
  saveDeviceMirrorPreferences();
  await launchMirror(selectedDevice.serial, readMirrorOptions(), true);
}

async function captureScreenshot() {
  if (!selectedDevice || !isDesktopApp) {
    setStatus($('#display-status'), 'Capture disponible dans l’application de bureau.');
    return;
  }
  try {
    const path = await tauriInvoke('capture_screenshot', { serial: selectedDevice.serial });
    setStatus($('#display-status'), `Capture enregistrée : ${path}`, 'success');
  } catch (error) {
    setStatus($('#display-status'), String(error), 'error');
  }
}

async function pairWireless() {
  const endpoint = $('#pair-endpoint').value.trim();
  const pairingCode = $('#pair-code').value.trim();
  const status = $('#pair-status');
  if (!endpoint || pairingCode.length !== 6) {
    setStatus(status, 'Saisissez l’adresse et le code à 6 chiffres affichés sur Android.', 'error');
    return;
  }
  if (!isDesktopApp) {
    setStatus(status, 'Appairage disponible dans l’application de bureau.');
    return;
  }
  setStatus(status, 'Appairage…');
  try {
    const result = await tauriInvoke('adb_pair', { endpoint, pairingCode });
    setStatus(status, result || 'Appairage réussi. Entrez l’adresse de débogage.', 'success');
  } catch (error) {
    setStatus(status, String(error), 'error');
  }
}

async function connectWireless() {
  const endpoint = $('#connect-endpoint').value.trim();
  const status = $('#pair-status');
  if (!endpoint) {
    setStatus(status, 'Saisissez l’adresse de débogage affichée sur Android.', 'error');
    return;
  }
  if (!isDesktopApp) {
    setStatus(status, 'Connexion disponible dans l’application de bureau.');
    return;
  }
  setStatus(status, 'Connexion…');
  try {
    const result = await tauriInvoke('adb_connect', { endpoint });
    setStatus(status, result || 'Appareil connecté.', 'success');
    await refreshDevices();
  } catch (error) {
    setStatus(status, String(error), 'error');
  }
}

function setupPlatformStyle() {
  if (isDesktopApp) {
    tauriInvoke('host_platform').then((platform) => {
      document.documentElement.dataset.platform = platform;
    }).catch(() => {});
    return;
  }
  // The browser preview shows the Windows layout; the native build reports its real host OS above.
  document.documentElement.dataset.platform = 'windows';
}

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
}

setupPlatformStyle();
setupNavigation();
$('#refresh-button').addEventListener('click', refreshDevices);
$('#usb-search-button').addEventListener('click', refreshDevices);
$('#wifi-open-button').addEventListener('click', openPairDialog);
$('#wifi-method-button').addEventListener('click', openPairDialog);
$('#pair-submit').addEventListener('click', pairWireless);
$('#connect-submit').addEventListener('click', connectWireless);
$('#brightness-slider').addEventListener('input', updateBrightnessLabel);
$('#brightness-slider').addEventListener('change', applyBrightness);
$('#auto-brightness').addEventListener('change', changeBrightnessMode);
['max-size', 'max-fps', 'bitrate-mbps', 'video-codec', 'audio-enabled', 'record-video'].forEach((id) => {
  $(`#${id}`).addEventListener('change', saveDeviceMirrorPreferences);
});
$('#mirror-start-button').addEventListener('click', startConfiguredMirror);
$('#screenshot-button').addEventListener('click', captureScreenshot);

if (!isDesktopApp) {
  renderToolStatus({ adbFound: false, adbBundled: false, scrcpyFound: false, scrcpyBundled: false });
  renderDevices([]);
  setRuntime('Aperçu web — connexion indisponible.');
} else {
  refreshDevices();
  window.setInterval(refreshDevices, 8000);
}
