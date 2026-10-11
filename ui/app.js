const tauriInvoke = window.__TAURI__?.core?.invoke;
const isDesktopApp = typeof tauriInvoke === 'function';
const $ = (selector) => document.querySelector(selector);
const deviceRows = $('#device-rows');
const emptyState = $('#empty-state');
const operationStatus = $('#operation-status');
const toastContainer = $('#toast-container');
const menuLayer = $('#menu-layer');
const menuBar = $('#app-menu-bar');
const pairDialog = $('#pair-dialog');
const displayDialog = $('#display-dialog');
const aboutDialog = $('#about-dialog');
const progressDialog = $('#progress-dialog');
const retrieveDialog = $('#retrieve-dialog');
const terminalDialog = $('#terminal-dialog');
const logcatPanel = $('#logcat-panel');
let connectedDevices = [];
let toastRecentMessages = new Map();
let logcatUnlisten = null;
let logcatSerial = null;
let logcatPaused = false;
let logcatEntries = [];
let retrievingDeviceSerial = null;

let currentTools = { adbFound: false, adbVersion: null, adbBundled: false };
const MIRROR_ENGINE_READY = false;
const MIRROR_ENGINE_NOTICE = 'Le moteur de miroir Device Bridge est en développement. Aucun programme de miroir tiers ne sera lancé.';
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

const APP_PREFERENCES_KEY = 'device-bridge:app-preferences';
const DEFAULT_APP_PREFERENCES = {
  theme: 'system',
  autoRefresh: true,
  refreshSeconds: 15,
  notifyDevices: true,
  notifyCaptures: true,
  notifyConnections: true
};
let appPreferences = { ...DEFAULT_APP_PREFERENCES };
let refreshTimer = null;
let refreshInFlight = false;
let initialDeviceScanComplete = false;
let knownDeviceSerials = new Set();
try {
  const saved = JSON.parse(window.localStorage.getItem(APP_PREFERENCES_KEY) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    appPreferences = {
      ...DEFAULT_APP_PREFERENCES,
      ...saved,
      theme: ['system', 'light', 'dark'].includes(saved.theme) ? saved.theme : DEFAULT_APP_PREFERENCES.theme,
      refreshSeconds: [10, 15, 30].includes(Number(saved.refreshSeconds)) ? Number(saved.refreshSeconds) : DEFAULT_APP_PREFERENCES.refreshSeconds
    };
  }
} catch {
  appPreferences = { ...DEFAULT_APP_PREFERENCES };
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));

function showToast(message, tone = 'info') {
  const cleanMessage = String(message ?? '').trim();
  if (!cleanMessage || !toastContainer) return;
  const now = Date.now();
  const lastShown = toastRecentMessages.get(`${tone}:${cleanMessage}`) || 0;
  if (now - lastShown < 30000) return;
  toastRecentMessages.set(`${tone}:${cleanMessage}`, now);

  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.dataset.tone = tone || 'info';
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  const marker = document.createElement('span');
  marker.className = 'toast-marker';
  marker.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = cleanMessage;
  const close = document.createElement('button');
  close.className = 'toast-dismiss';
  close.type = 'button';
  close.setAttribute('aria-label', 'Fermer la notification');
  close.textContent = '×';
  close.addEventListener('click', () => dismissToast(toast));
  toast.append(marker, text, close);
  toastContainer.append(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(() => dismissToast(toast), 4800);
}

function dismissToast(toast) {
  if (!toast?.isConnected) return;
  toast.classList.remove('is-visible');
  window.setTimeout(() => toast.remove(), 180);
}

function setStatus(target, text, tone = '') {
  if (!target) return;
  const value = String(text ?? '');
  target.textContent = value;
  if (tone) target.dataset.tone = tone;
  else delete target.dataset.tone;
  if (value && (tone === 'success' || tone === 'error')) showToast(value, tone);
}

function setProgress(title, message, detail = '') {
  $('#progress-title').textContent = title;
  $('#progress-message').textContent = message;
  $('#progress-detail').textContent = detail;
  $('#progress-bar').removeAttribute('value');
  if (!progressDialog.open && typeof progressDialog.showModal === 'function') progressDialog.showModal();
  else progressDialog.setAttribute('open', '');
}

async function runWithTransferProgress(title, message, operation, successMessage) {
  const transferId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let unlisten = null;
  setProgress(title, message);
  try {
    const listen = window.__TAURI__?.event?.listen;
    if (typeof listen === 'function') {
      unlisten = await listen('transfer-progress', ({ payload }) => {
        if (!payload || payload.transferId !== transferId) return;
        if (Number.isFinite(payload.percent)) $('#progress-bar').value = Math.max(0, Math.min(100, payload.percent));
        $('#progress-detail').textContent = payload.message || (Number.isFinite(payload.percent) ? `${payload.percent} %` : 'Transfert en cours…');
      });
    }
    const result = await operation(transferId);
    closeProgress();
    showToast(typeof successMessage === 'function' ? successMessage(result) : (successMessage || `${title} terminé.`), 'success');
    return result;
  } catch (error) {
    closeProgress();
    showToast(`${title} a échoué : ${String(error)}`, 'error');
    return null;
  } finally {
    if (typeof unlisten === 'function') unlisten();
  }
}

function closeProgress() {
  if (progressDialog.open && typeof progressDialog.close === 'function') progressDialog.close();
  else progressDialog.removeAttribute('open');
}

async function runWithProgress(title, message, operation, successMessage) {
  setProgress(title, message);
  try {
    const result = await operation();
    closeProgress();
    showToast(typeof successMessage === 'function' ? successMessage(result) : (successMessage || `${title} terminé.`), 'success');
    return result;
  } catch (error) {
    closeProgress();
    showToast(`${title} a échoué : ${String(error)}`, 'error');
    return null;
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = appPreferences.theme;
}

function syncSettingsControls() {
  $('#theme-setting').value = appPreferences.theme;
  $('#auto-refresh-setting').checked = Boolean(appPreferences.autoRefresh);
  $('#refresh-interval-setting').value = String(appPreferences.refreshSeconds);
  $('#notify-device-setting').checked = Boolean(appPreferences.notifyDevices);
  $('#notify-capture-setting').checked = Boolean(appPreferences.notifyCaptures);
  $('#notify-connection-setting').checked = Boolean(appPreferences.notifyConnections);
  applyTheme();
}

function persistAppPreferences() {
  try { window.localStorage.setItem(APP_PREFERENCES_KEY, JSON.stringify(appPreferences)); } catch { /* Preferences remain active for this session. */ }
  applyTheme();
  configureAutoRefresh();
}

function configureAutoRefresh() {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
  if (isDesktopApp && appPreferences.autoRefresh) {
    refreshTimer = window.setInterval(() => { void refreshDevices(); }, appPreferences.refreshSeconds * 1000);
  }
}

function openPairDialog() {
  $('#pair-status').textContent = '';
  delete $('#pair-status').dataset.tone;
  if (typeof pairDialog.showModal === 'function') pairDialog.showModal();
  else pairDialog.setAttribute('open', '');
}

function setView(view) {
  const pages = {
    devices: { element: '#devices-view', title: 'Appareils', subtitle: 'Détectez et contrôlez vos appareils Android.' },
    settings: { element: '#settings-view', title: 'Paramètres', subtitle: 'Préférences et notifications de Device Bridge.' },
    documentation: { element: '#documentation-view', title: 'Documentation', subtitle: 'Guides de connexion et conseils de dépannage.' }
  };
  const selected = pages[view] ? view : 'devices';
  for (const [key, page] of Object.entries(pages)) $(page.element).hidden = key !== selected;
  $('#device-toolbar-actions').hidden = selected !== 'devices';
  $('#page-title').textContent = pages[selected].title;
  $('#page-subtitle').textContent = pages[selected].subtitle;
  document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
    const active = button.dataset.view === selected;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (selected === 'settings') void refreshTools();
}

const MENU_DEFINITIONS = [
  {
    id: 'file', label: 'Fichier', items: [
      { label: 'Installer un APK…', action: 'install-apk', needsDevice: true },
      { label: 'Envoyer un fichier…', action: 'send-file', needsDevice: true },
      { label: 'Récupérer un fichier…', action: 'retrieve-file', needsDevice: true },
      { type: 'separator' },
      { label: 'Quitter', action: 'quit', shortcut: 'Alt+F4' }
    ]
  },
  {
    id: 'device', label: 'Appareil', items: [
      { label: 'Actualiser', action: 'refresh', shortcut: 'Ctrl+R' },
      { label: 'Connexion USB', action: 'usb' },
      { label: 'Connexion Wi-Fi…', action: 'wifi' },
      { type: 'separator' },
      { label: 'Déconnecter', action: 'disconnect', needsDevice: true, needsWireless: true },
      { label: 'Redémarrer l’appareil', action: 'reboot', needsDevice: true }
    ]
  },
  {
    id: 'view', label: 'Affichage', items: [
      { label: 'Basculer la barre latérale', action: 'sidebar', shortcut: 'Ctrl+B' },
      { label: 'Plein écran', action: 'fullscreen', shortcut: 'F11' },
      { type: 'separator' },
      { label: 'Thème clair/sombre', action: 'theme' }
    ]
  },
  {
    id: 'tools', label: 'Outils', items: [
      { label: 'Capture d’écran', action: 'screenshot', needsDevice: true },
      { label: 'Enregistrer l’écran', action: 'record', needsDevice: true, needsMirrorEngine: true },
      { type: 'separator' },
      { label: 'Ouvrir les journaux (logcat)', action: 'logcat', needsDevice: true },
      { label: 'Terminal ADB', action: 'terminal', needsDevice: true }
    ]
  },
  {
    id: 'help', label: 'Aide', items: [
      { label: 'Documentation', action: 'documentation', shortcut: 'F1' },
      { label: 'Vérifier les mises à jour', action: 'check-updates' },
      { type: 'separator' },
      { label: 'À propos', action: 'about' }
    ]
  }
];

const MENU_ACTIONS = {
  quit: closeApplication,
  refresh: () => { void refreshDevices(); showToast('Recherche des appareils…'); },
  usb: () => { void refreshDevices(); showToast('Recherche des appareils USB…'); },
  wifi: openPairDialog,
  sidebar: toggleSidebar,
  fullscreen: () => { void toggleFullscreen(); },
  theme: toggleTheme,
  screenshot: () => { void captureActiveDevice(); },
  record: () => { void recordActiveDevice(); },
  'install-apk': () => { void chooseAndInstallApk(); },
  'send-file': () => { void chooseAndSendFile(); },
  'retrieve-file': openRetrieveDialog,
  disconnect: () => { void disconnectActiveDevice(); },
  reboot: () => { void rebootActiveDevice(); },
  logcat: () => { void openLogcatPanel(); },
  terminal: openTerminalDialog,
  'check-updates': () => { void checkForUpdates(); },
  documentation: () => setView('documentation'),
  about: openAboutDialog
};

let openMenuId = null;
function menuFor(id) { return MENU_DEFINITIONS.find((menu) => menu.id === id); }
function menuTriggerFor(id) { return menuBar.querySelector(`[data-menu-trigger="${id}"]`); }

function renderMenuBar() {
  menuBar.replaceChildren();
  for (const menu of MENU_DEFINITIONS) {
    const trigger = document.createElement('button');
    trigger.className = 'menu-trigger';
    trigger.type = 'button';
    trigger.id = `menu-trigger-${menu.id}`;
    trigger.dataset.menuTrigger = menu.id;
    trigger.setAttribute('role', 'menuitem');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-controls', `menu-popup-${menu.id}`);
    trigger.setAttribute('aria-expanded', 'false');
    trigger.tabIndex = menu.id === 'file' ? 0 : -1;
    trigger.textContent = menu.label;
    trigger.addEventListener('click', () => {
      if (openMenuId === menu.id) closeMenu(true);
      else openMenu(menu.id, true);
    });
    trigger.addEventListener('pointerenter', () => {
      if (openMenuId && openMenuId !== menu.id) openMenu(menu.id, false);
    });
    trigger.addEventListener('focus', () => {
      if (openMenuId && openMenuId !== menu.id) openMenu(menu.id, true);
    });
    trigger.addEventListener('keydown', (event) => handleMenuTriggerKeydown(event, menu.id));
    menuBar.append(trigger);
  }
}

function openMenu(id, focusFirst = false) {
  const menu = menuFor(id);
  const trigger = menuTriggerFor(id);
  if (!menu || !trigger) return;
  openMenuId = id;
  menuLayer.replaceChildren();
  menuLayer.classList.add('is-open');
  menuLayer.removeAttribute('aria-hidden');
  const popup = document.createElement('div');
  popup.className = 'menu-popup';
  popup.id = `menu-popup-${id}`;
  popup.setAttribute('role', 'menu');
  popup.setAttribute('aria-label', menu.label);
  popup.setAttribute('aria-labelledby', trigger.id);
  for (const entry of menu.items) {
    if (entry.type === 'separator') {
      const separator = document.createElement('div');
      separator.className = 'menu-separator';
      separator.setAttribute('role', 'separator');
      popup.append(separator);
      continue;
    }
    const item = document.createElement('button');
    item.className = 'menu-item';
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    const itemLabel = document.createElement('span');
    itemLabel.className = 'menu-item-label';
    itemLabel.textContent = entry.label;
    const trailing = document.createElement('span');
    trailing.className = entry.disabledReason ? 'menu-item-note' : 'menu-item-shortcut';
    trailing.textContent = entry.shortcut || entry.disabledReason || '';
    item.append(itemLabel, trailing);
    const activeDevice = getActiveDevice();
    const unavailableReason = entry.disabledReason
      || (entry.needsDevice && !activeDevice ? 'Connectez un appareil autorisé' : '')
      || (entry.needsWireless && activeDevice?.connectionType !== 'Wi-Fi' ? 'Disponible uniquement pour une connexion Wi-Fi' : '')
      || (entry.needsMirrorEngine && !MIRROR_ENGINE_READY ? MIRROR_ENGINE_NOTICE : '');
    if (unavailableReason || !entry.action || !MENU_ACTIONS[entry.action]) {
      item.disabled = true;
      item.title = unavailableReason || 'Action indisponible';
      trailing.textContent = unavailableReason || 'Indisponible';
    } else {
      item.addEventListener('click', () => {
        const action = MENU_ACTIONS[entry.action];
        closeMenu(false);
        action();
      });
    }
    popup.append(item);
  }
  popup.addEventListener('keydown', (event) => handleMenuPopupKeydown(event, id));
  menuLayer.append(popup);
  document.querySelectorAll('.menu-trigger').forEach((button) => {
    const active = button.dataset.menuTrigger === id;
    button.classList.toggle('is-open', active);
    button.setAttribute('aria-expanded', String(active));
  });
  positionMenuPopup(id);
  if (focusFirst) requestAnimationFrame(() => popup.querySelector('.menu-item:not(:disabled)')?.focus());
}

function positionMenuPopup(id = openMenuId) {
  if (!id) return;
  const trigger = menuTriggerFor(id);
  const popup = menuLayer.querySelector('.menu-popup');
  if (!trigger || !popup) return;
  const triggerRect = trigger.getBoundingClientRect();
  popup.style.visibility = 'hidden';
  const width = popup.offsetWidth;
  const height = popup.offsetHeight;
  const edge = 8;
  const left = Math.max(edge, Math.min(triggerRect.left, window.innerWidth - width - edge));
  let top = triggerRect.bottom + 4;
  if (top + height > window.innerHeight - edge) top = triggerRect.top - height - 4;
  top = Math.max(edge, Math.min(top, window.innerHeight - height - edge));
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  popup.style.visibility = 'visible';
}

function closeMenu(returnFocus = false) {
  if (!openMenuId) return;
  const previousId = openMenuId;
  openMenuId = null;
  menuLayer.replaceChildren();
  menuLayer.classList.remove('is-open');
  menuLayer.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.menu-trigger').forEach((button) => {
    button.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
  });
  if (returnFocus) menuTriggerFor(previousId)?.focus();
}

function handleMenuTriggerKeydown(event, id) {
  const currentIndex = MENU_DEFINITIONS.findIndex((menu) => menu.id === id);
  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openMenu(id, true);
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (currentIndex + delta + MENU_DEFINITIONS.length) % MENU_DEFINITIONS.length;
    const trigger = menuTriggerFor(MENU_DEFINITIONS[next].id);
    menuBar.querySelectorAll('.menu-trigger').forEach((button) => { button.tabIndex = button === trigger ? 0 : -1; });
    trigger?.focus();
  } else if (event.key === 'Escape') {
    closeMenu(false);
  }
}

function handleMenuPopupKeydown(event, id) {
  const items = Array.from(menuLayer.querySelectorAll('.menu-item:not(:disabled)'));
  const current = items.indexOf(document.activeElement);
  if (event.key === 'Escape') {
    event.preventDefault();
    closeMenu(true);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = (current + delta + items.length) % items.length;
    items[next]?.focus();
  } else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    (event.key === 'Home' ? items[0] : items[items.length - 1])?.focus();
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault();
    const index = MENU_DEFINITIONS.findIndex((menu) => menu.id === id);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + MENU_DEFINITIONS.length) % MENU_DEFINITIONS.length;
    openMenu(MENU_DEFINITIONS[next].id, true);
  } else if (event.key === 'Tab') {
    closeMenu(false);
  }
}

function setupMenus() {
  renderMenuBar();
  document.addEventListener('pointerdown', (event) => {
    if (openMenuId && !menuLayer.contains(event.target) && !menuBar.contains(event.target)) closeMenu(false);
  });
  window.addEventListener('resize', () => positionMenuPopup());
  window.addEventListener('scroll', () => positionMenuPopup(), true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && openMenuId) {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (event.altKey || event.metaKey) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (event.ctrlKey && event.key.toLowerCase() === 'r') {
      event.preventDefault();
      void refreshDevices();
    } else if (event.ctrlKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      toggleSidebar();
    } else if (event.key === 'F11') {
      event.preventDefault();
      void toggleFullscreen();
    } else if (event.key === 'F1') {
      event.preventDefault();
      setView('documentation');
    }
  });
}

function toggleSidebar() {
  $('.app-shell').classList.toggle('is-sidebar-collapsed');
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  appPreferences.theme = next;
  syncSettingsControls();
  persistAppPreferences();
  showToast(`Thème ${next === 'dark' ? 'sombre' : 'clair'} activé.`);
}

async function toggleFullscreen() {
  const nativeWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  try {
    if (nativeWindow) {
      await nativeWindow.setFullscreen(!(await nativeWindow.isFullscreen()));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch (error) {
    showToast(`Impossible de modifier le mode plein écran : ${String(error)}`, 'error');
  }
}

async function closeApplication() {
  const nativeWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  if (nativeWindow) {
    try { await nativeWindow.close(); } catch (error) { showToast(String(error), 'error'); }
  } else {
    window.close();
  }
}

function openAboutDialog() {
  if (typeof aboutDialog.showModal === 'function') aboutDialog.showModal();
  else aboutDialog.setAttribute('open', '');
}

function getActiveDevice() {
  if (selectedDevice && connectedDevices.some((device) => device.serial === selectedDevice.serial && device.state === 'device')) {
    return connectedDevices.find((device) => device.serial === selectedDevice.serial);
  }
  return connectedDevices.find((device) => device.state === 'device') || null;
}

async function captureActiveDevice() {
  const device = getActiveDevice();
  if (!device) {
    showToast('Connectez ou sélectionnez un appareil Android avant la capture.', 'error');
    return;
  }
  selectedDevice = { serial: device.serial, label: device.model || device.product || device.serial };
  await captureScreenshot();
}

async function recordActiveDevice() {
  const device = getActiveDevice();
  if (!device) {
    showToast('Connectez ou sélectionnez un appareil Android avant l’enregistrement.', 'error');
    return;
  }
  selectedDevice = { serial: device.serial, label: device.model || device.product || device.serial };
  const options = { ...getDeviceMirrorOptions(device.serial), recordVideo: true };
  await launchMirror(device.serial, options);
}

function currentDialogApi() { return window.__TAURI__?.dialog; }

async function chooseAndInstallApk() {
  const device = getActiveDevice();
  const dialogApi = currentDialogApi();
  if (!isDesktopApp || !dialogApi?.open) {
    showToast('L’installation d’APK est disponible dans l’application de bureau.', 'error');
    return;
  }
  if (!device) { showToast('Connectez un appareil Android autorisé avant l’installation.', 'error'); return; }
  const apkPath = await dialogApi.open({
    title: 'Choisir un APK Android',
    multiple: false,
    directory: false,
    filters: [{ name: 'APK Android', extensions: ['apk'] }]
  });
  if (!apkPath || Array.isArray(apkPath)) return;
  await runWithProgress('Installation de l’APK', `Installation sur ${device.model || device.serial}…`,
    () => tauriInvoke('install_apk', { serial: device.serial, apkPath }),
    (result) => `APK installée sur ${device.model || device.serial}. ${result || ''}`.trim());
}

async function chooseAndSendFile() {
  const device = getActiveDevice();
  const dialogApi = currentDialogApi();
  if (!isDesktopApp || !dialogApi?.open) { showToast('Le transfert est disponible dans l’application de bureau.', 'error'); return; }
  if (!device) { showToast('Connectez un appareil Android autorisé avant le transfert.', 'error'); return; }
  const localPath = await dialogApi.open({ title: 'Choisir un fichier à envoyer', multiple: false, directory: false });
  if (!localPath || Array.isArray(localPath)) return;
  const fileName = String(localPath).split(/[\\/]/).pop() || 'fichier';
  await runWithTransferProgress('Envoi du fichier', `${fileName} vers ${device.model || device.serial}…`,
    (transferId) => tauriInvoke('send_file_to_device', { serial: device.serial, localPath, transferId }),
    (result) => `Fichier envoyé dans Download sur Android. ${result || ''}`.trim());
}

function openRetrieveDialog() {
  const device = getActiveDevice();
  if (!device) { showToast('Connectez un appareil Android autorisé avant le transfert.', 'error'); return; }
  retrievingDeviceSerial = device.serial;
  $('#retrieve-remote-path').value = '/sdcard/Download/';
  setStatus($('#retrieve-status'), '');
  if (typeof retrieveDialog.showModal === 'function') retrieveDialog.showModal();
  else retrieveDialog.setAttribute('open', '');
}

async function retrieveFile() {
  const serial = retrievingDeviceSerial;
  const remotePath = $('#retrieve-remote-path').value.trim();
  if (!serial || !remotePath || remotePath.endsWith('/') || remotePath.split('/').pop() === '') {
    setStatus($('#retrieve-status'), 'Saisissez le chemin absolu d’un fichier Android, par exemple /sdcard/Download/fichier.pdf.', 'error');
    return;
  }
  const dialogApi = currentDialogApi();
  if (!dialogApi?.save) { setStatus($('#retrieve-status'), 'La boîte de dialogue de fichiers est indisponible.', 'error'); return; }
  const name = remotePath.split('/').filter(Boolean).pop() || 'fichier-android';
  const localPath = await dialogApi.save({ title: 'Enregistrer le fichier récupéré', defaultPath: name });
  if (!localPath) return;
  const result = await runWithTransferProgress('Récupération du fichier', `Copie de ${remotePath} vers l’ordinateur…`,
    (transferId) => tauriInvoke('retrieve_file_from_device', { serial, remotePath, localPath, transferId }),
    (value) => `Fichier récupéré : ${value || localPath}`);
  if (result) retrieveDialog.close();
}

async function disconnectActiveDevice() {
  const device = getActiveDevice();
  if (!device) { showToast('Aucun appareil connecté à déconnecter.', 'error'); return; }
  if (device.connectionType !== 'Wi-Fi') { showToast('Pour déconnecter un appareil USB, débranchez son câble.', 'info'); return; }
  try {
    const result = await tauriInvoke('disconnect_device', { serial: device.serial });
    showToast(result || `${device.model || device.serial} déconnecté.`, 'success');
    await refreshDevices(false);
  } catch (error) { showToast(`Déconnexion impossible : ${String(error)}`, 'error'); }
}

async function rebootActiveDevice() {
  const device = getActiveDevice();
  if (!device) { showToast('Aucun appareil connecté à redémarrer.', 'error'); return; }
  const dialogApi = currentDialogApi();
  const confirmed = dialogApi?.confirm
    ? await dialogApi.confirm(`Redémarrer ${device.model || device.serial} maintenant ?`, { title: 'Redémarrer l’appareil', kind: 'warning' })
    : window.confirm(`Redémarrer ${device.model || device.serial} maintenant ?`);
  if (!confirmed) return;
  await runWithProgress('Redémarrage de l’appareil', `${device.model || device.serial} redémarre…`,
    () => tauriInvoke('reboot_device', { serial: device.serial }),
    'Commande de redémarrage envoyée.');
  window.setTimeout(() => { void refreshDevices(false); }, 4000);
}

function logLevelOf(line) { return line.match(/\s([VDIWEF])\s/)?.[1] || 'V'; }
const LOG_LEVEL_ORDER = { V: 0, D: 1, I: 2, W: 3, E: 4, F: 5 };
function logEntryMatches(entry) {
  const needle = $('#logcat-filter').value.trim().toLowerCase();
  const minimum = LOG_LEVEL_ORDER[$('#logcat-level').value] ?? 0;
  return (!needle || entry.line.toLowerCase().includes(needle)) && (LOG_LEVEL_ORDER[entry.level] ?? 0) >= minimum;
}

function renderLogcatEntries() {
  const container = $('#logcat-lines');
  const fragment = document.createDocumentFragment();
  const visible = logcatEntries.filter(logEntryMatches);
  if (!visible.length) {
    const empty = document.createElement('div');
    empty.className = 'logcat-empty';
    empty.textContent = logcatPaused ? 'Journal en pause.' : 'Aucune ligne ne correspond au filtre.';
    fragment.append(empty);
  } else {
    for (const entry of visible) {
      const line = document.createElement('div');
      line.className = 'logcat-line';
      line.dataset.level = entry.level;
      line.textContent = entry.line;
      fragment.append(line);
    }
  }
  container.replaceChildren(fragment);
  container.scrollTop = container.scrollHeight;
}

function receiveLogcatLine(payload) {
  if (!payload || payload.serial !== logcatSerial || logcatPaused) return;
  const entry = { line: String(payload.line || ''), level: logLevelOf(String(payload.line || '')) };
  logcatEntries.push(entry);
  if (logcatEntries.length > 3000) logcatEntries.shift();
  if (logEntryMatches(entry)) {
    const container = $('#logcat-lines');
    const empty = container.querySelector('.logcat-empty');
    if (empty) empty.remove();
    const line = document.createElement('div');
    line.className = 'logcat-line';
    line.dataset.level = entry.level;
    line.textContent = entry.line;
    container.append(line);
    while (container.children.length > 1200) container.firstElementChild.remove();
    container.scrollTop = container.scrollHeight;
  }
}

async function openLogcatPanel() {
  const device = getActiveDevice();
  if (!device) { showToast('Connectez un appareil Android autorisé pour ouvrir logcat.', 'error'); return; }
  if (!isDesktopApp || !window.__TAURI__?.event?.listen) { showToast('Logcat nécessite l’application de bureau.', 'error'); return; }
  if (logcatSerial && logcatSerial !== device.serial) await closeLogcatPanel();
  logcatSerial = device.serial;
  logcatEntries = [];
  logcatPaused = false;
  logcatPanel.hidden = false;
  logcatPanel.classList.remove('is-collapsed');
  $('#logcat-heading').textContent = `Journaux ADB · ${device.model || device.serial}`;
  $('#logcat-state').textContent = 'Connexion au flux logcat…';
  $('#logcat-pause').textContent = 'Pause';
  renderLogcatEntries();
  try {
    logcatUnlisten = await window.__TAURI__.event.listen('logcat-line', ({ payload }) => receiveLogcatLine(payload));
    await tauriInvoke('start_logcat', { serial: device.serial });
    $('#logcat-state').textContent = 'Flux en direct · affichage limité aux 3 000 dernières lignes.';
  } catch (error) {
    $('#logcat-state').textContent = `Logcat indisponible : ${String(error)}`;
    showToast(`Impossible d’ouvrir logcat : ${String(error)}`, 'error');
  }
}

async function closeLogcatPanel() {
  const serial = logcatSerial;
  logcatSerial = null;
  if (typeof logcatUnlisten === 'function') { logcatUnlisten(); logcatUnlisten = null; }
  if (serial && isDesktopApp) {
    try { await tauriInvoke('stop_logcat', { serial }); } catch { /* Process may already have ended. */ }
  }
  logcatPanel.hidden = true;
}

async function clearLogcat() {
  if (!logcatSerial) return;
  try {
    await tauriInvoke('clear_logcat', { serial: logcatSerial });
    logcatEntries = [];
    renderLogcatEntries();
    showToast('Journal Android effacé.', 'success');
  } catch (error) { showToast(`Impossible d’effacer logcat : ${String(error)}`, 'error'); }
}

async function copyLogcat() {
  const lines = logcatEntries.filter(logEntryMatches).map((entry) => entry.line).join('\n');
  if (!lines) { showToast('Aucune ligne à copier.', 'info'); return; }
  try { await navigator.clipboard.writeText(lines); showToast('Journal copié dans le presse-papiers.', 'success'); }
  catch { showToast('Accès au presse-papiers refusé par le système.', 'error'); }
}

function openTerminalDialog() {
  const device = getActiveDevice();
  if (!device) { showToast('Connectez un appareil Android autorisé pour ouvrir le terminal.', 'error'); return; }
  selectedDevice = { serial: device.serial, label: device.model || device.serial };
  $('#terminal-device-label').textContent = `${device.model || device.serial} · ${device.connectionType}`;
  $('#terminal-command').value = '';
  $('#terminal-output').textContent = '';
  if (typeof terminalDialog.showModal === 'function') terminalDialog.showModal();
  else terminalDialog.setAttribute('open', '');
  requestAnimationFrame(() => $('#terminal-command').focus());
}

async function runTerminalCommand() {
  const device = getActiveDevice();
  const command = $('#terminal-command').value.trim();
  if (!device) { showToast('L’appareil n’est plus connecté.', 'error'); return; }
  if (!command) { $('#terminal-command').focus(); return; }
  const dialogApi = currentDialogApi();
  const confirmed = dialogApi?.confirm
    ? await dialogApi.confirm(`Exécuter cette commande sur Android ?\n\n${command}`, { title: 'Confirmer la commande ADB', kind: 'warning' })
    : window.confirm(`Exécuter cette commande sur Android ?\n\n${command}`);
  if (!confirmed) return;
  const button = $('#terminal-run');
  const output = $('#terminal-output');
  button.disabled = true;
  output.textContent += `> ${command}\n`;
  try {
    const result = await tauriInvoke('adb_shell_command', { serial: device.serial, command });
    output.textContent += `${result || '(aucune sortie)'}\n\n`;
  } catch (error) {
    output.textContent += `Erreur : ${String(error)}\n\n`;
    showToast(`Commande ADB échouée : ${String(error)}`, 'error');
  } finally {
    button.disabled = false;
    output.scrollTop = output.scrollHeight;
    $('#terminal-command').focus();
  }
}

function compareVersions(left, right) {
  const parse = (value) => String(value).replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  const a = parse(left), b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return 1;
    if ((a[index] || 0) < (b[index] || 0)) return -1;
  }
  return 0;
}

async function checkForUpdates() {
  if (!isDesktopApp) { showToast('La vérification des mises à jour se fait dans l’application de bureau.', 'error'); return; }
  setProgress('Vérification des mises à jour', 'Interrogation des versions publiées…');
  try {
    const response = await fetch('https://api.github.com/repos/MeganAe/device-bridge/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error(response.status === 404 ? 'Aucune publication stable n’est disponible pour ce dépôt.' : `GitHub a répondu HTTP ${response.status}.`);
    const release = await response.json();
    const latest = String(release.tag_name || '').replace(/^v/i, '');
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(latest)) throw new Error('La version publiée est absente ou invalide.');
    closeProgress();
    const current = document.querySelector('meta[name="app-version"]')?.content || '0.1.1';
    if (compareVersions(latest, current) > 0) {
      showToast(`Une nouvelle version (${latest}) est disponible. Version installée : ${current}.`, 'success');
      let releaseUrl = '';
      try {
        const parsedUrl = new URL(String(release.html_url || ''));
        if (parsedUrl.protocol === 'https:' && parsedUrl.hostname === 'github.com') releaseUrl = parsedUrl.href;
      } catch { /* A release without a valid GitHub page can still be reported. */ }
      if (releaseUrl) {
        const dialogApi = currentDialogApi();
        const confirmed = dialogApi?.confirm
          ? await dialogApi.confirm(`Ouvrir la page GitHub de la version v${latest} ?`, { title: 'Mise à jour disponible' })
          : window.confirm(`Ouvrir la page de téléchargement de la version ${latest} ?`);
        if (confirmed) {
          try {
            const opener = window.__TAURI__?.opener;
            if (opener?.openUrl) await opener.openUrl(releaseUrl);
            else window.open(releaseUrl, '_blank', 'noopener,noreferrer');
          } catch (error) {
            showToast(`Impossible d’ouvrir la page de publication : ${String(error)}`, 'error');
          }
        }
      }
    } else {
      showToast(`Device Bridge est à jour (${current}).`, 'success');
    }
  } catch (error) {
    closeProgress();
    showToast(`Vérification impossible : ${String(error)}`, 'error');
  }
}

function toolText(found, bundled) {
  if (!isDesktopApp) return 'Aperçu web';
  if (!found) return 'Absent';
  return bundled ? 'Intégré' : 'Installé localement';
}

function renderToolStatus(status) {
  currentTools = status;
  const adbValue = $('#adb-value');
  if (adbValue) adbValue.textContent = toolText(status.adbFound, status.adbBundled);
}

function deviceStateText(state) {
  if (state === 'device') return 'Connecté';
  if (state === 'unauthorized') return 'Autorisation requise';
  if (state === 'offline') return 'Hors ligne';
  return state || 'État inconnu';
}

function renderDevices(devices) {
  connectedDevices = Array.isArray(devices) ? devices : [];
  devices = connectedDevices;
  $('#device-count').textContent = devices.length === 1
    ? '1 appareil détecté'
    : `${devices.length} appareils détectés`;
  emptyState.hidden = devices.length > 0;
  deviceRows.replaceChildren();

  for (const device of devices) {
    const label = device.model || device.product || 'Appareil Android';
    const authorized = device.state === 'device';
    const canMirror = authorized && MIRROR_ENGINE_READY;
    const metadata = [
      device.androidVersion ? `Android ${device.androidVersion}` : '',
      device.batteryLevel != null ? `Batterie ${device.batteryLevel} %` : '',
      device.connectionType || ''
    ].filter(Boolean).join(' · ');
    const authorizationHint = device.state === 'unauthorized'
      ? '<span class="device-authorization-hint">Acceptez la demande de débogage USB sur votre téléphone.</span>'
      : '';
    const row = document.createElement('div');
    row.className = 'device-row';
    row.innerHTML = `
      <div class="device-main">
        <span class="device-row-icon"><svg aria-hidden="true"><use href="#i-device"></use></svg></span>
        <span class="device-labels">
          <span class="device-name">${escapeHtml(label)}</span>
          <span class="device-meta">${escapeHtml(metadata)}</span>
          <span class="device-serial">${escapeHtml(device.serial)}</span>
          ${authorizationHint}
        </span>
      </div>
      <span class="device-state">${escapeHtml(deviceStateText(device.state))}</span>
      <div class="device-actions">
        <button class="button button-secondary device-action" type="button" data-action="mirror" data-serial="${escapeHtml(device.serial)}" title="${escapeHtml(MIRROR_ENGINE_NOTICE)}" ${canMirror ? '' : 'disabled'}>Afficher l’écran</button>
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
    renderToolStatus({ adbFound: false, adbVersion: null, adbBundled: false });
    return;
  }
  try {
    renderToolStatus(await tauriInvoke('tool_status'));
  } catch (error) {
    setStatus(operationStatus, String(error), 'error');
  }
}

let notificationPermission = null;
async function notifyNative(title, body, preferenceKey) {
  if (!isDesktopApp || !appPreferences[preferenceKey]) return;
  const api = window.__TAURI__?.notification;
  if (!api?.isPermissionGranted || !api?.requestPermission || !api?.sendNotification) return;
  try {
    if (notificationPermission === null) {
      notificationPermission = await api.isPermissionGranted();
      if (!notificationPermission) notificationPermission = (await api.requestPermission()) === 'granted';
    }
    if (notificationPermission) api.sendNotification({ title, body });
  } catch (error) {
    console.warn('Notification système indisponible :', error);
  }
}

async function refreshDevices(notifyNewDevices = true) {
  if (!isDesktopApp) {
    renderDevices([]);
    setStatus(operationStatus, 'La détection est disponible dans l’application de bureau.');
    return;
  }
  if (refreshInFlight) return;
  refreshInFlight = true;

  try {
    const status = await tauriInvoke('tool_status');
    renderToolStatus(status);
    if (!status.adbFound) {
      renderDevices([]);
      setStatus(operationStatus, 'ADB intégré introuvable. Réparez ou réinstallez Device Bridge.', 'error');
      return;
    }
    const devices = await tauriInvoke('list_devices');
    renderDevices(devices);
    setStatus(operationStatus, '');

    const readySerials = new Set(devices.filter((device) => device.state === 'device').map((device) => device.serial));
    const disconnectedSerials = [...knownDeviceSerials].filter((serial) => !readySerials.has(serial));
    for (const serial of disconnectedSerials) {
      if (logcatSerial === serial) void closeLogcatPanel();
      else void tauriInvoke('stop_logcat', { serial }).catch(() => {});
      if (selectedDevice?.serial === serial) selectedDevice = null;
    }
    if (initialDeviceScanComplete && notifyNewDevices) {
      for (const device of devices) {
        if (device.state === 'device' && !knownDeviceSerials.has(device.serial)) {
          const label = device.model || device.product || 'Appareil Android';
          void notifyNative('Appareil connecté', `${label} est prêt à être utilisé.`, 'notifyDevices');
        }
      }
    }
    knownDeviceSerials = readySerials;
    initialDeviceScanComplete = true;
  } catch (error) {
    renderDevices([]);
    setStatus(operationStatus, `La détection a échoué : ${String(error)}`, 'error');
  } finally {
    refreshInFlight = false;
  }
}

function defaultMirrorOptions() {
  return { maxSize: 1920, maxFps: 60, bitrateMbps: 8, videoCodec: 'h264', audioEnabled: true, recordVideo: false };
}

function launchMirror() {
  const target = displayDialog.open ? $('#display-status') : operationStatus;
  setStatus(target, MIRROR_ENGINE_NOTICE);
  showToast(MIRROR_ENGINE_NOTICE, 'info');
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
    void notifyNative('Capture enregistrée', path, 'notifyCaptures');
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
    void notifyNative('Appairage réussi', 'Saisissez maintenant l’adresse de débogage Android.', 'notifyConnections');
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
    void notifyNative('Appareil connecté', 'La connexion sans fil est prête.', 'notifyConnections');
    await refreshDevices(false);
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

function setupSettings() {
  syncSettingsControls();
  const update = () => {
    appPreferences = {
      ...appPreferences,
      theme: $('#theme-setting').value,
      autoRefresh: $('#auto-refresh-setting').checked,
      refreshSeconds: Number($('#refresh-interval-setting').value),
      notifyDevices: $('#notify-device-setting').checked,
      notifyCaptures: $('#notify-capture-setting').checked,
      notifyConnections: $('#notify-connection-setting').checked
    };
    persistAppPreferences();
  };
  ['theme-setting', 'auto-refresh-setting', 'refresh-interval-setting', 'notify-device-setting', 'notify-capture-setting', 'notify-connection-setting']
    .forEach((id) => $(`#${id}`).addEventListener('change', update));
}

async function configureWindowGeometry() {
  if (!isDesktopApp) return;
  const currentWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  if (!currentWindow) return;
  try {
    const monitor = await currentWindow.currentMonitor();
    const workArea = monitor?.workArea?.size || monitor?.size;
    const scaleFactor = monitor?.scaleFactor || await currentWindow.scaleFactor();
    if (workArea?.width && workArea?.height && scaleFactor) {
      const availableWidth = workArea.width / scaleFactor;
      const availableHeight = workArea.height / scaleFactor;
      const horizontalMargin = Math.min(48, Math.max(20, Math.round(availableWidth * 0.05)));
      const verticalMargin = Math.min(50, Math.max(16, Math.floor((availableHeight - 240) / 2)));
      const width = Math.max(1, Math.min(1000, availableWidth - horizontalMargin * 2));
      const height = Math.max(1, Math.min(700, availableHeight - verticalMargin * 2));
      const minWidth = Math.min(720, width);
      const minHeight = Math.min(520, height);
      await currentWindow.setMinSize({ type: 'Logical', width: minWidth, height: minHeight });
      await currentWindow.setSize({ type: 'Logical', width, height });
    }
    // Center only after applying the size so the window remains inside the usable work area.
    await currentWindow.center();
  } catch (error) {
    console.warn('Le dimensionnement automatique de la fenêtre a échoué :', error);
  }
}

function setupWindowControls() {
  const controls = $('#window-controls');
  const currentWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  if (!isDesktopApp || !currentWindow) {
    controls.hidden = true;
    return;
  }

  const updateMaximizeButton = async () => {
    try {
      const maximized = await currentWindow.isMaximized();
      const button = $('#window-maximize');
      button.querySelector('use').setAttribute('href', maximized ? '#i-restore' : '#i-maximize');
      button.title = maximized ? 'Restaurer' : 'Agrandir';
      button.setAttribute('aria-label', button.title);
    } catch { /* The native control still works even if the visual state cannot be read. */ }
  };
  $('#window-minimize').addEventListener('click', () => { void currentWindow.minimize(); });
  $('#window-maximize').addEventListener('click', async () => {
    try {
      if (await currentWindow.isMaximized()) await currentWindow.unmaximize();
      else await currentWindow.maximize();
    } catch (error) {
      console.warn('Impossible de modifier la taille de la fenêtre :', error);
    }
    await updateMaximizeButton();
  });
  $('#window-close').addEventListener('click', () => { void currentWindow.close(); });
  $('#app-titlebar').addEventListener('dblclick', (event) => {
    if (!event.target.closest('.titlebar-drag-space, .titlebar-brand')) return;
    void currentWindow.isMaximized().then((maximized) => maximized ? currentWindow.unmaximize() : currentWindow.maximize())
      .then(updateMaximizeButton).catch(() => {});
  });
  void updateMaximizeButton();
}

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
}

function setupContextMenu() {
  document.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (target?.closest?.('input, textarea, select, [contenteditable="true"], .logcat-lines, .terminal-output')) return;
    event.preventDefault();
  });
}

setupPlatformStyle();
setupSettings();
setupWindowControls();
setupMenus();
setupNavigation();
setupContextMenu();
$('#refresh-button').addEventListener('click', () => { void refreshDevices(); });
$('#usb-search-button').addEventListener('click', () => { void refreshDevices(); });
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
$('#retrieve-submit').addEventListener('click', () => { void retrieveFile(); });
$('#retrieve-close').addEventListener('click', () => retrieveDialog.close());
$('#terminal-run').addEventListener('click', () => { void runTerminalCommand(); });
$('#terminal-command').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void runTerminalCommand(); }
});
$('#terminal-close').addEventListener('click', () => terminalDialog.close());
$('#terminal-clear').addEventListener('click', () => { $('#terminal-output').textContent = ''; });
$('#logcat-close').addEventListener('click', () => { void closeLogcatPanel(); });
$('#logcat-collapse').addEventListener('click', () => {
  const collapsed = logcatPanel.classList.toggle('is-collapsed');
  $('#logcat-collapse').textContent = collapsed ? '□' : '−';
  $('#logcat-collapse').setAttribute('aria-label', collapsed ? 'Agrandir le panneau' : 'Réduire le panneau');
});
$('#logcat-pause').addEventListener('click', () => {
  logcatPaused = !logcatPaused;
  $('#logcat-pause').textContent = logcatPaused ? 'Reprendre' : 'Pause';
  $('#logcat-state').textContent = logcatPaused ? 'Affichage en pause.' : 'Flux en direct.';
  renderLogcatEntries();
});
$('#logcat-filter').addEventListener('input', renderLogcatEntries);
$('#logcat-level').addEventListener('change', renderLogcatEntries);
$('#logcat-copy').addEventListener('click', () => { void copyLogcat(); });
$('#logcat-clear').addEventListener('click', () => { void clearLogcat(); });

if (!isDesktopApp) {
  renderToolStatus({ adbFound: false, adbVersion: null, adbBundled: false });
  renderDevices([]);
  setStatus(operationStatus, 'Aperçu web — la connexion Android fonctionne dans l’application de bureau.');
} else {
  void refreshDevices(false);
  configureAutoRefresh();
  void configureWindowGeometry();
}
