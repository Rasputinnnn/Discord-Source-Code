"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getMainWindowId = getMainWindowId;
exports.webContentsSend = webContentsSend;
exports.init = init;
exports.handleOpenUrl = handleOpenUrl;
exports.setMainWindowVisible = setMainWindowVisible;

var _electron = require("electron");

var _fs = _interopRequireDefault(require("fs"));

var _path = _interopRequireDefault(require("path"));

var _url = _interopRequireDefault(require("url"));

var _Backoff = _interopRequireDefault(require("../common/Backoff"));

var _securityUtils = require("../common/securityUtils");

var appBadge = _interopRequireWildcard(require("./appBadge"));

var appConfig = _interopRequireWildcard(require("./appConfig"));

var _appSettings = require("./appSettings");

var _buildInfo = _interopRequireDefault(require("./buildInfo"));

var _processUtils = require("./discord_native/browser/processUtils");

var _ipcMain = _interopRequireDefault(require("./ipcMain"));

var legacyModuleUpdater = _interopRequireWildcard(require("./moduleUpdater"));

var notificationScreen = _interopRequireWildcard(require("./notificationScreen"));

var paths = _interopRequireWildcard(require("./paths"));

var popoutWindows = _interopRequireWildcard(require("./popoutWindows"));

var splashScreen = _interopRequireWildcard(require("./splashScreen"));

var systemTray = _interopRequireWildcard(require("./systemTray"));

var thumbarButtons = _interopRequireWildcard(require("./thumbarButtons"));

var _updater = _interopRequireDefault(require("./updater"));

var _Constants = require("./Constants");

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const settings = (0, _appSettings.getSettings)();
const connectionBackoff = new _Backoff.default(1000, 20000);
const DISCORD_NAMESPACE = 'DISCORD_';
const envVariables = {
  disableRestart: process.env.DISCORD_DISABLE_RESTART,
  webappEndpoint: process.env.DISCORD_WEBAPP_ENDPOINT
};

function checkCanMigrate() {
  return _fs.default.existsSync(_path.default.join(paths.getUserData(), 'userDataCache.json'));
}

function checkAlreadyMigrated() {
  return _fs.default.existsSync(_path.default.join(paths.getUserData(), 'domainMigrated'));
}

const getWebappEndpoint = () => {
  if (envVariables.webappEndpoint) {
    console.log(`Using DISCORD_WEBAPP_ENDPOINT override: ${envVariables.webappEndpoint}`);
    return envVariables.webappEndpoint;
  }

  let endpoint = settings.get('WEBAPP_ENDPOINT');

  if (!endpoint) {
    if (_buildInfo.default.releaseChannel === 'stable') {
      const canMigrate = checkCanMigrate();
      const alreadyMigrated = checkAlreadyMigrated();

      if (canMigrate || alreadyMigrated) {
        endpoint = 'https://discord.com';
      } else {
        endpoint = 'https://discordapp.com';
      }
    } else if (_buildInfo.default.releaseChannel === 'development') {
      endpoint = 'https://canary.discord.com';
    } else {
      endpoint = `https://${_buildInfo.default.releaseChannel}.discord.com`;
    }
  }

  return endpoint;
};

const WEBAPP_ENDPOINT = getWebappEndpoint();

function getSanitizedPath(path) {
  // using the whatwg URL api, get a sanitized pathname from given path
  // this is because url.parse's `path` may not always have a slash
  // in front of it
  return new _url.default.URL(path, WEBAPP_ENDPOINT).pathname;
}

function getSanitizedProtocolPath(url_) {
  try {
    const parsedURL = _url.default.parse(url_);

    if (parsedURL.protocol === 'discord:') {
      return getSanitizedPath(parsedURL.path);
    }
  } catch (_) {} // protect against URIError: URI malformed


  return null;
} // TODO: These should probably be thrown in constants.


const WEBAPP_PATH = settings.get('WEBAPP_PATH', `/app?_=${Date.now()}`);
const URL_TO_LOAD = `${WEBAPP_ENDPOINT}${WEBAPP_PATH}`;
const MIN_WIDTH = settings.get('MIN_WIDTH', 940);
const MIN_HEIGHT = settings.get('MIN_HEIGHT', 500);
const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 720; // TODO: document this var's purpose

const MIN_VISIBLE_ON_SCREEN = 32;
let mainWindow = null;
let mainWindowId = _Constants.DEFAULT_MAIN_WINDOW_ID;
let mainWindowInitialPath = null;
let mainWindowDidFinishLoad = false;
let mainWindowIsVisible = false; // whether we are in an intermediate auth process outside of our normal login screen (for e.g. internal builds)

let insideAuthFlow = false; // last time the main app renderer has crashed ('crashed' event)

let lastCrashed = 0; // whether we failed to load a page outside of the intermediate auth flow
// used to reload the page after a delay

let lastPageLoadFailed = false; // if an update fails, keep track of what modules we want to retry without delta
// updates.

/* eslint-disable camelcase */

const retryUpdateOptions = {
  skip_host_delta: false,
  skip_module_delta: {}
};
/* eslint-enable camelcase */

function getMainWindowId() {
  return mainWindowId;
}

function webContentsSend(...args) {
  if (mainWindow != null && mainWindow.webContents != null) {
    const [event, ...options] = args;
    mainWindow.webContents.send(`${DISCORD_NAMESPACE}${event}`, ...options);
  }
}

function saveWindowConfig(browserWindow) {
  try {
    if (!browserWindow) {
      return;
    }

    settings.set('IS_MAXIMIZED', browserWindow.isMaximized());
    settings.set('IS_MINIMIZED', browserWindow.isMinimized());

    if (!settings.get('IS_MAXIMIZED') && !settings.get('IS_MINIMIZED')) {
      settings.set('WINDOW_BOUNDS', browserWindow.getBounds());
    }

    settings.save();
  } catch (e) {
    console.error(e);
  }
}

function setWindowVisible(isVisible, andUnminimize) {
  if (mainWindow == null) {
    return;
  }

  if (isVisible) {
    if (andUnminimize || !mainWindow.isMinimized()) {
      mainWindow.show();
      webContentsSend('MAIN_WINDOW_FOCUS');
    }
  } else {
    webContentsSend('MAIN_WINDOW_BLUR');
    mainWindow.hide();

    if (systemTray.hasInit) {
      systemTray.displayHowToCloseHint();
    }
  }

  mainWindow.setSkipTaskbar(!isVisible);
  mainWindowIsVisible = isVisible;
}

function doAABBsOverlap(a, b) {
  const ax1 = a.x + a.width;
  const bx1 = b.x + b.width;
  const ay1 = a.y + a.height;
  const by1 = b.y + b.height; // clamp a to b, see if it is non-empty

  const cx0 = a.x < b.x ? b.x : a.x;
  const cx1 = ax1 < bx1 ? ax1 : bx1;

  if (cx1 - cx0 > 0) {
    const cy0 = a.y < b.y ? b.y : a.y;
    const cy1 = ay1 < by1 ? ay1 : by1;

    if (cy1 - cy0 > 0) {
      return true;
    }
  }

  return false;
}

function getSavedWindowBounds() {
  if (!settings.get('WINDOW_BOUNDS')) {
    return null;
  }

  const bounds = settings.get('WINDOW_BOUNDS');
  bounds.width = Math.max(MIN_WIDTH, bounds.width);
  bounds.height = Math.max(MIN_HEIGHT, bounds.height);

  const displays = _electron.screen.getAllDisplays();

  const display = displays.find(display => {
    const displayBound = display.workArea;
    displayBound.x += MIN_VISIBLE_ON_SCREEN;
    displayBound.y += MIN_VISIBLE_ON_SCREEN;
    displayBound.width -= 2 * MIN_VISIBLE_ON_SCREEN;
    displayBound.height -= 2 * MIN_VISIBLE_ON_SCREEN;
    return doAABBsOverlap(bounds, displayBound);
  });
  return display != null ? bounds : null;
}

function applyWindowBoundsToConfig(mainWindowOptions) {
  const bounds = getSavedWindowBounds();

  if (bounds == null) {
    mainWindowOptions.center = true;
    return;
  }

  mainWindowOptions.width = bounds.width;
  mainWindowOptions.height = bounds.height;
  mainWindowOptions.x = bounds.x;
  mainWindowOptions.y = bounds.y;
}

function restoreMainWindowBounds(mainWindow) {
  const savedWindowBounds = getSavedWindowBounds();
  const currentBounds = mainWindow.getBounds();

  if (savedWindowBounds != null && (currentBounds.height !== savedWindowBounds.height || currentBounds.width !== savedWindowBounds.width)) {
    mainWindow.setBounds(savedWindowBounds);
  }
} // this can be called multiple times (due to recreating the main app window),
// so we only want to update existing if we already initialized it


function setupNotificationScreen(mainWindow) {
  if (!notificationScreen.hasInit) {
    notificationScreen.init({
      mainWindow,
      title: 'Discord Notifications',
      maxVisible: 5,
      screenPosition: 'bottom'
    });
    notificationScreen.events.on(notificationScreen.NOTIFICATION_CLICK, () => {
      setWindowVisible(true, true);
    });
  } else {
    notificationScreen.setMainWindow(mainWindow);
  }
} // this can be called multiple times (due to recreating the main app window),
// so we only want to update existing if we already initialized it


function setupSystemTray() {
  if (!systemTray.hasInit) {
    systemTray.init({
      onCheckForUpdates: () => {
        const updater = _updater.default === null || _updater.default === void 0 ? void 0 : _updater.default.getUpdater();

        if (updater != null) {
          checkForUpdatesWithUpdater(updater);
        } else {
          legacyModuleUpdater.checkForUpdates();
        }
      },
      onTrayClicked: () => setWindowVisible(true, true),
      onOpenVoiceSettings: openVoiceSettings,
      onToggleMute: toggleMute,
      onToggleDeafen: toggleDeafen,
      onLaunchApplication: launchApplication
    });
  }
} // this can be called multiple times (due to recreating the main app window),
// so we only want to update existing if we already initialized it


function setupAppBadge() {
  if (!appBadge.hasInit) {
    appBadge.init();
  }
} // this can be called multiple times (due to recreating the main app window),
// so we only want to update existing if we already initialized it


function setupAppConfig() {
  if (!appConfig.hasInit) {
    appConfig.init();
  }
} // this can be called multiple times (due to recreating the main app window),
// so we only want to update existing if we already initialized it


function setupPopouts() {
  if (!popoutWindows.hasInit) {
    popoutWindows.init();
  }
}

function openVoiceSettings() {
  setWindowVisible(true, true);
  webContentsSend('SYSTEM_TRAY_OPEN_VOICE_SETTINGS');
}

function toggleMute() {
  webContentsSend('SYSTEM_TRAY_TOGGLE_MUTE');
}

function toggleDeafen() {
  webContentsSend('SYSTEM_TRAY_TOGGLE_DEAFEN');
}

function launchApplication(applicationId) {
  webContentsSend('LAUNCH_APPLICATION', applicationId);
}

const loadMainPage = () => {
  lastPageLoadFailed = false;
  mainWindow.loadURL(URL_TO_LOAD);
};

const DEFAULT_BACKGROUND_COLOR = '#2f3136';
const BACKGROUND_COLOR_KEY = 'BACKGROUND_COLOR';

function getBackgroundColor() {
  return settings.get(BACKGROUND_COLOR_KEY, DEFAULT_BACKGROUND_COLOR);
}

function setBackgroundColor(color) {
  settings.set(BACKGROUND_COLOR_KEY, color);
  mainWindow.setBackgroundColor(color);
  settings.save();
} // launch main app window; could be called multiple times for various reasons


function launchMainAppWindow(isVisible) {
  if (mainWindow) {
    // TODO: message here?
    mainWindow.destroy();
  }

  const mainWindowOptions = {
    title: 'Discord',
    backgroundColor: getBackgroundColor(),
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    transparent: false,
    frame: false,
    resizable: true,
    show: isVisible,
    webPreferences: {
      blinkFeatures: 'EnumerateDevices,AudioOutputDevices',
      nodeIntegration: false,
      preload: _path.default.join(__dirname, 'mainScreenPreload.js'),
      nativeWindowOpen: true,
      enableRemoteModule: false,
      spellcheck: true,
      contextIsolation: true,
      // NB: this is required in order to give popouts (or any child window opened via window.open w/ nativeWindowOpen)
      // a chance at a node environment (i.e. they run the preload, have an isolated context, etc.) when
      // `app.allowRendererProcessReuse === false` (default in Electron 7).
      additionalArguments: ['--enable-node-leakage-in-renderers']
    }
  };

  if (process.platform === 'linux') {
    mainWindowOptions.icon = _path.default.join(_path.default.dirname(_electron.app.getPath('exe')), 'discord.png');
    mainWindowOptions.frame = true;
  }

  applyWindowBoundsToConfig(mainWindowOptions);
  mainWindow = new _electron.BrowserWindow(mainWindowOptions);
  mainWindowId = mainWindow.id;
  global.mainWindowId = mainWindowId; // Electron has a bug where it clamps the window size to the primary display's size
  // causing the window to be too small on a larger secondary display

  restoreMainWindowBounds(mainWindow); // Deny all permissions except for the ones used by Discord.
  // This handler handles permissions that can be granted or denied
  // asynchronously.

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    switch (permission) {
      // TODO: determine whether the 'accessibility-events' permission is
      // actually needed, or if it can be removed without affecting a11y.
      case 'accessibility-events':
        callback(true);
        return;

      case 'notifications':
      case 'fullscreen':
        callback((0, _securityUtils.checkUrlOriginMatches)(details.requestingUrl, WEBAPP_ENDPOINT));
        return;
    }

    callback(false);
  }); // This handler handles permissions that must be granted or denied
  // synchronously.

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    switch (permission) {
      case 'notifications':
      case 'fullscreen':
        return (0, _securityUtils.checkUrlOriginMatches)(requestingOrigin, WEBAPP_ENDPOINT);
    }

    return false;
  });
  mainWindow.setMenuBarVisibility(false);

  if (settings.get('IS_MAXIMIZED')) {
    mainWindow.maximize();
  }

  if (settings.get('IS_MINIMIZED')) {
    mainWindow.minimize();
  }

  mainWindow.webContents.on('new-window', (e, windowURL, frameName, disposition, options) => {
    e.preventDefault();

    if (frameName.startsWith(DISCORD_NAMESPACE) && (0, _securityUtils.checkUrlOriginMatches)(windowURL, WEBAPP_ENDPOINT) && getSanitizedPath(windowURL) === '/popout') {
      popoutWindows.openOrFocusWindow(e, windowURL, frameName, options, WEBAPP_ENDPOINT);
      return;
    }

    (0, _securityUtils.saferShellOpenExternal)(windowURL).catch(_err => {
      console.error('Failed to open external URL', windowURL);
    });
  });
  mainWindow.webContents.on('did-fail-load', (e, errCode, errDesc, validatedUrl) => {
    if (insideAuthFlow) {
      return;
    }

    if (validatedUrl !== URL_TO_LOAD) {
      return;
    } // -3 (ABORTED) means we are reloading the page before it has finished loading
    // 0 (???) seems to also mean the same thing


    if (errCode === -3 || errCode === 0) return;
    lastPageLoadFailed = true;
    console.error('[WebContents] did-fail-load', errCode, errDesc, `retry in ${connectionBackoff.current} ms`);
    connectionBackoff.fail(() => {
      console.log('[WebContents] retrying load', URL_TO_LOAD);
      loadMainPage();
    });
  });
  mainWindow.webContents.on('did-finish-load', () => {
    if (insideAuthFlow && mainWindow.webContents && (0, _securityUtils.checkUrlOriginMatches)(mainWindow.webContents.getURL(), WEBAPP_ENDPOINT)) {
      insideAuthFlow = false;
    }

    mainWindowDidFinishLoad = true; // if this is a first open and there's an initial path, direct user to that path

    if (mainWindowInitialPath != null) {
      webContentsSend('MAIN_WINDOW_PATH', mainWindowInitialPath);
      mainWindowInitialPath = null;
    }

    webContentsSend(mainWindow != null && mainWindow.isFocused() ? 'MAIN_WINDOW_FOCUS' : 'MAIN_WINDOW_BLUR');

    if (!lastPageLoadFailed) {
      connectionBackoff.succeed();
      splashScreen.pageReady();
    }
  });
  mainWindow.webContents.on('render-process-gone', (e, details) => {
    const reason = (details === null || details === void 0 ? void 0 : details.reason) || 'Unknown';
    const killed = reason === 'killed';
    _processUtils.processUtilsSettings.rendererCrashReason = reason;

    if (killed) {
      _electron.app.quit();

      return;
    } // if we just crashed under 5 seconds ago, we are probably in a loop, so just die.


    const crashTime = Date.now();

    if (crashTime - lastCrashed < 5 * 1000) {
      console.error(`[WebContents] double crashed (${reason})... RIP =(`);

      _electron.app.quit();

      return;
    }

    lastCrashed = crashTime;
    console.error(`[WebContents] crashed (${reason})... reloading`); // Optionally avoid automatic restarts which can make debugging crashes more difficult.

    if (envVariables.disableRestart) {
      _electron.app.quit();

      return;
    }

    launchMainAppWindow(true);
  }); // Prevent navigation when links or files are dropping into the app, turning it into a browser.
  // https://github.com/discord/discord/pull/278

  mainWindow.webContents.on('will-navigate', (evt, url) => {
    if (!insideAuthFlow && !(0, _securityUtils.checkUrlOriginMatches)(url, WEBAPP_ENDPOINT)) {
      evt.preventDefault();
    }
  }); // track intermediate auth flow

  mainWindow.webContents.on('did-get-redirect-request', (event, oldUrl, newUrl) => {
    if ((0, _securityUtils.checkUrlOriginMatches)(oldUrl, WEBAPP_ENDPOINT) && (0, _securityUtils.checkUrlOriginMatches)(newUrl, 'https://accounts.google.com/')) {
      insideAuthFlow = true;
    }
  });
  mainWindow.webContents.on('context-menu', (_, params) => {
    webContentsSend('SPELLCHECK_RESULT', params.misspelledWord, params.dictionarySuggestions);
  });
  mainWindow.webContents.on('devtools-opened', () => {
    webContentsSend('WINDOW_DEVTOOLS_OPENED');
  });
  mainWindow.webContents.on('devtools-closed', () => {
    webContentsSend('WINDOW_DEVTOOLS_CLOSED');
  });
  mainWindow.on('focus', () => {
    webContentsSend('MAIN_WINDOW_FOCUS');
  });
  mainWindow.on('blur', () => {
    webContentsSend('MAIN_WINDOW_BLUR');
  });
  mainWindow.on('page-title-updated', (e, title) => {
    if (mainWindow === null) {
      return;
    }

    e.preventDefault();
    setMainWindowTitle(title);
  });
  mainWindow.on('leave-html-full-screen', () => {
    // fixes a bug wherein embedded videos returning from full screen cause our menu to be visible.
    mainWindow.setMenuBarVisibility(false);
  });
  mainWindow.webContents.on('did-navigate-in-page', (_, eventUrl) => {
    let parsedUrl;

    try {
      parsedUrl = _url.default.parse(eventUrl);
    } catch (_) {
      return;
    } // Prevent back navigation from revisting the login page after logging in,
    // or being able to navigate back after signing out.


    if (parsedUrl && parsedUrl.pathname === '/login') {
      mainWindow.webContents.clearHistory();
    } // Hackfix for https://github.com/electron/electron/issues/21584
    // When this event fires, because of a mouse button nav, `page-title-update` does not
    // get called. So we re-check and update the main window's title here.


    setMainWindowTitle(mainWindow.webContents.getTitle());
  }); // 'swipe' only works if the classic 3 finger swipe style is enabled in
  // 'System Preferences > Trackpad > More Gestures.' The more modern 2 finger
  // gesture should be added when Electron adds support.

  mainWindow.on('swipe', (_, direction) => {
    switch (direction) {
      case 'left':
        webContentsSend('NAVIGATE_BACK', 'SWIPE');
        break;

      case 'right':
        webContentsSend('NAVIGATE_FORWARD', 'SWIPE');
        break;
    }
  }); // Windows/Linux media keys and 4th/5th mouse buttons.

  mainWindow.on('app-command', (_, cmd) => {
    switch (cmd) {
      case 'browser-backward':
        webContentsSend('NAVIGATE_BACK', 'BROWSER');
        break;

      case 'browser-forward':
        webContentsSend('NAVIGATE_FORWARD', 'BROWSER');
        break;
    }
  });

  if (process.platform === 'win32') {
    setupNotificationScreen(mainWindow);
  }

  setupSystemTray();
  setupAppBadge();
  setupAppConfig();
  setupPopouts();
  thumbarButtons.init();

  if (process.platform === 'linux' || process.platform === 'win32') {
    systemTray.show();
    mainWindow.on('close', e => {
      if (mainWindow === null) {
        // this means we're quitting
        popoutWindows.closePopouts();
        return;
      }

      webContentsSend('MAIN_WINDOW_BLUR'); // Save our app settings

      saveWindowConfig(mainWindow); // Quit app if that's the setting

      if (!settings.get('MINIMIZE_TO_TRAY', true)) {
        _electron.app.quit();

        return;
      } // Else, minimize to tray


      setWindowVisible(false);
      e.preventDefault();
    });
  }

  loadMainPage();
}

let updaterState = _Constants.UpdaterEvents.UPDATE_NOT_AVAILABLE;

function handleModuleUpdateCheckFinished(succeeded, updateCount, manualRequired) {
  if (!succeeded) {
    updaterState = _Constants.UpdaterEvents.UPDATE_NOT_AVAILABLE;
    webContentsSend(_Constants.UpdaterEvents.UPDATE_ERROR);
    return;
  }

  if (updateCount === 0) {
    updaterState = _Constants.UpdaterEvents.UPDATE_NOT_AVAILABLE;
  } else if (manualRequired) {
    updaterState = _Constants.UpdaterEvents.UPDATE_MANUALLY;
  } else {
    updaterState = _Constants.UpdaterEvents.UPDATE_AVAILABLE;
  }

  webContentsSend(updaterState);
}

function handleModuleUpdateDownloadProgress(name, progress) {
  if (mainWindow) {
    mainWindow.setProgressBar(progress);
  }

  webContentsSend(_Constants.UpdaterEvents.MODULE_INSTALL_PROGRESS, name, progress);
}

function handleModuleUpdateDownloadsFinished(succeeded, failed) {
  if (mainWindow) {
    mainWindow.setProgressBar(-1);
  }

  if (updaterState === _Constants.UpdaterEvents.UPDATE_AVAILABLE) {
    if (failed > 0) {
      updaterState = _Constants.UpdaterEvents.UPDATE_NOT_AVAILABLE;
      webContentsSend(_Constants.UpdaterEvents.UPDATE_ERROR);
    } else {
      updaterState = _Constants.UpdaterEvents.UPDATE_DOWNLOADED;
      webContentsSend(updaterState);
    }
  }
}

function handleModuleUpdateInstalledModule(name, current, total, succeeded) {
  if (mainWindow) {
    mainWindow.setProgressBar(-1);
  }

  webContentsSend(_Constants.UpdaterEvents.MODULE_INSTALLED, name, succeeded);
}

function setUpdaterState(newUpdaterState) {
  updaterState = newUpdaterState;
  webContentsSend(updaterState);
}

function setMainWindowTitle(title) {
  if (!title.endsWith('Discord')) {
    title += ' - Discord';
  }

  if (mainWindow) {
    mainWindow.setTitle(title);
  }
}
/* eslint-disable camelcase */


async function checkForUpdatesWithUpdater(updater) {
  if (updaterState === _Constants.UpdaterEvents.UPDATE_NOT_AVAILABLE) {
    setUpdaterState(_Constants.UpdaterEvents.CHECKING_FOR_UPDATES);

    try {
      let installedAnything = false;

      const progressCallback = progress => {
        const task = progress.task.HostInstall || progress.task.ModuleInstall;

        if (task != null && progress.state === 'Complete') {
          if (!installedAnything) {
            installedAnything = true;
            setUpdaterState(_Constants.UpdaterEvents.UPDATE_AVAILABLE);
          }
        }

        if (task != null && progress.state.Failed != null) {
          if (progress.task.HostInstall != null) {
            retryUpdateOptions.skip_host_delta = true;
          } else if (progress.task.ModuleInstall != null) {
            retryUpdateOptions.skip_module_delta[task.version.module.name] = true;
          }
        }
      };

      if (updater.updateToLatestWithOptions) {
        await updater.updateToLatestWithOptions(retryUpdateOptions, progressCallback);
      } else {
        await updater.updateToLatest(progressCallback);
      }

      setUpdaterState(installedAnything ? _Constants.UpdaterEvents.UPDATE_DOWNLOADED : _Constants.UpdaterEvents.UPDATE_NOT_AVAILABLE);
    } catch (e) {
      console.error('Update to latest failed: ', e);
      updaterState = _Constants.UpdaterEvents.UPDATE_NOT_AVAILABLE;
      webContentsSend(_Constants.UpdaterEvents.UPDATE_ERROR);
    }
  } else {
    webContentsSend(updaterState);
  }
}
/* eslint-enable camelcase */
// Setup handling of events related to updates using the new updater.


function setupUpdaterEventsWithUpdater(updater) {
  _electron.app.on(_Constants.MenuEvents.CHECK_FOR_UPDATES, () => checkForUpdatesWithUpdater());

  _ipcMain.default.on(_Constants.UpdaterEvents.CHECK_FOR_UPDATES, () => {
    return checkForUpdatesWithUpdater(updater);
  });

  _ipcMain.default.on(_Constants.UpdaterEvents.QUIT_AND_INSTALL, () => {
    saveWindowConfig(mainWindow);
    mainWindow = null; // TODO(eiz): This is a workaround for old Linux host versions whose host
    // updater did not have a quitAndInstall() method, which causes the module
    // updater to crash if a host update is available and we try to restart to
    // install modules. Remove when all hosts are updated.

    try {
      legacyModuleUpdater.quitAndInstallUpdates();
    } catch (e) {
      _electron.app.relaunch();

      _electron.app.quit();
    }
  });

  _ipcMain.default.on(_Constants.UpdaterEvents.UPDATER_HISTORY_QUERY_AND_TRUNCATE, () => {
    if (updater.queryAndTruncateHistory != null) {
      webContentsSend(_Constants.UpdaterEvents.UPDATER_HISTORY_RESPONSE, updater.queryAndTruncateHistory());
    } else {
      webContentsSend(_Constants.UpdaterEvents.UPDATER_HISTORY_RESPONSE, []);
    }
  });
} // Setup events related to updates using the old module updater.
//
// sets up event listeners between the browser window and the app to send
// and listen to update-related events


function setupLegacyUpdaterEvents() {
  _electron.app.on(_Constants.MenuEvents.CHECK_FOR_UPDATES, () => legacyModuleUpdater.checkForUpdates());

  legacyModuleUpdater.events.on(legacyModuleUpdater.CHECKING_FOR_UPDATES, () => {
    updaterState = _Constants.UpdaterEvents.CHECKING_FOR_UPDATES;
    webContentsSend(updaterState);
  }); // TODO(eiz): We currently still need to handle the old style non-object-based
  // updater events to allow discord_desktop_core to be newer than the host asar,
  // which contains the updater itself.
  //
  // Once all clients have updated to a sufficiently new host, we can delete this.

  if (legacyModuleUpdater.supportsEventObjects) {
    legacyModuleUpdater.events.on(legacyModuleUpdater.UPDATE_CHECK_FINISHED, ({
      succeeded,
      updateCount,
      manualRequired
    }) => {
      handleModuleUpdateCheckFinished(succeeded, updateCount, manualRequired);
    });
    legacyModuleUpdater.events.on(legacyModuleUpdater.DOWNLOADING_MODULE_PROGRESS, ({
      name,
      progress
    }) => {
      handleModuleUpdateDownloadProgress(name, progress);
    });
    legacyModuleUpdater.events.on(legacyModuleUpdater.DOWNLOADING_MODULES_FINISHED, ({
      succeeded,
      failed
    }) => {
      handleModuleUpdateDownloadsFinished(succeeded, failed);
    });
    legacyModuleUpdater.events.on(legacyModuleUpdater.INSTALLED_MODULE, ({
      name,
      current,
      total,
      succeeded
    }) => {
      handleModuleUpdateInstalledModule(name, current, total, succeeded);
    });
  } else {
    legacyModuleUpdater.events.on(legacyModuleUpdater.UPDATE_CHECK_FINISHED, (succeeded, updateCount, manualRequired) => {
      handleModuleUpdateCheckFinished(succeeded, updateCount, manualRequired);
    });
    legacyModuleUpdater.events.on(legacyModuleUpdater.DOWNLOADING_MODULE_PROGRESS, (name, progress) => {
      handleModuleUpdateDownloadProgress(name, progress);
    });
    legacyModuleUpdater.events.on(legacyModuleUpdater.DOWNLOADING_MODULES_FINISHED, (succeeded, failed) => {
      handleModuleUpdateDownloadsFinished(succeeded, failed);
    });
    legacyModuleUpdater.events.on(legacyModuleUpdater.INSTALLED_MODULE, (name, current, total, succeeded) => {
      handleModuleUpdateInstalledModule(name, current, total, succeeded);
    });
  }

  _ipcMain.default.on(_Constants.UpdaterEvents.CHECK_FOR_UPDATES, () => {
    if (updaterState === _Constants.UpdaterEvents.UPDATE_NOT_AVAILABLE) {
      legacyModuleUpdater.checkForUpdates();
    } else {
      webContentsSend(updaterState);
    }
  });

  _ipcMain.default.on(_Constants.UpdaterEvents.QUIT_AND_INSTALL, () => {
    saveWindowConfig(mainWindow);
    mainWindow = null; // TODO(eiz): This is a workaround for old Linux host versions whose host
    // updater did not have a quitAndInstall() method, which causes the module
    // updater to crash if a host update is available and we try to restart to
    // install modules. Remove when all hosts are updated.

    try {
      legacyModuleUpdater.quitAndInstallUpdates();
    } catch (e) {
      _electron.app.relaunch();

      _electron.app.quit();
    }
  });

  _ipcMain.default.on(_Constants.UpdaterEvents.MODULE_INSTALL, (_event, name) => {
    // NOTE: do NOT allow options to be passed in, as this enables a client to downgrade its modules to potentially
    // insecure versions.
    legacyModuleUpdater.install(name, false);
  });

  _ipcMain.default.on(_Constants.UpdaterEvents.MODULE_QUERY, (_event, name) => {
    webContentsSend(_Constants.UpdaterEvents.MODULE_INSTALLED, name, legacyModuleUpdater.isInstalled(name));
  });

  _ipcMain.default.on(_Constants.UpdaterEvents.UPDATER_HISTORY_QUERY_AND_TRUNCATE, () => {
    webContentsSend(_Constants.UpdaterEvents.UPDATER_HISTORY_RESPONSE, legacyModuleUpdater.events.history);
    legacyModuleUpdater.events.history = [];
  });
}

function handleDisplayChange() {
  if (mainWindow == null) {
    return;
  } // TODO[adill]: if there are display changes while a maximized window is hidden electron will end up showing a
  // phantom non-interactive version of that window. i believe the root cause to be exactly this upstream issue:
  //  https://github.com/electron/electron/issues/27429
  // we can probably remove these once the upstream issue is fixed.


  if (process.platform === 'win32' && !mainWindowIsVisible) {
    setWindowVisible(mainWindowIsVisible, false);
  }
}

function init() {
  _electron.screen.on('display-added', handleDisplayChange);

  _electron.screen.on('display-removed', handleDisplayChange);

  _electron.screen.on('display-metrics-changed', handleDisplayChange); // electron default behavior is to app.quit here, so long as there are no other listeners. we handle quitting
  // or minimizing to system tray ourselves via mainWindow.on('closed') so this is simply to disable the electron
  // default behavior.


  _electron.app.on('window-all-closed', () => {});

  _electron.app.on('before-quit', () => {
    saveWindowConfig(mainWindow);
    mainWindow = null;
    notificationScreen.close();
  }); // TODO: move this to main startup


  _electron.app.on('gpu-process-crashed', (e, killed) => {
    if (killed) {
      _electron.app.quit();
    }
  });

  _electron.app.on('accessibility-support-changed', (_event, accessibilitySupportEnabled) => webContentsSend('ACCESSIBILITY_SUPPORT_CHANGED', accessibilitySupportEnabled));

  _electron.app.on(_Constants.MenuEvents.OPEN_HELP, () => webContentsSend('HELP_OPEN'));

  _electron.app.on(_Constants.MenuEvents.OPEN_SETTINGS, () => webContentsSend('USER_SETTINGS_OPEN')); // TODO: this hotpatches an issue with focusing the app from background.
  //       delete this after next stable electron release.


  _electron.app.on('second-instance', (_event, args) => {
    // if the second instance is the uninstaller, the bootstrap listener will quit the running app
    if (args != null && args.indexOf('--squirrel-uninstall') > -1) {
      return;
    } // if the current instance is multi instance, we want to leave the window alone


    if (process.argv != null && process.argv.slice(1).includes('--multi-instance')) {
      return;
    }

    if (mainWindow == null) {
      return;
    }

    setWindowVisible(true, false);
    mainWindow.focus();
  });

  _ipcMain.default.on('SETTINGS_UPDATE_BACKGROUND_COLOR', (_event, backgroundColor) => {
    if (getBackgroundColor() !== backgroundColor) {
      setBackgroundColor(backgroundColor);
    }
  });

  const updater = _updater.default === null || _updater.default === void 0 ? void 0 : _updater.default.getUpdater();

  if (updater != null) {
    setupUpdaterEventsWithUpdater(updater);
  } else {
    setupLegacyUpdaterEvents();
  }

  launchMainAppWindow(false);
}

function handleOpenUrl(url) {
  const path = getSanitizedProtocolPath(url);

  if (path != null) {
    if (!mainWindowDidFinishLoad) {
      mainWindowInitialPath = path;
    }

    webContentsSend('MAIN_WINDOW_PATH', path);
  }

  if (mainWindow == null) {
    return;
  }

  setWindowVisible(true, false);
  mainWindow.focus();
}

function setMainWindowVisible(visible) {
  setWindowVisible(visible, false);
}