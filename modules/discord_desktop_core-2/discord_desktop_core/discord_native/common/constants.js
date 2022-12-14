"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getDiscordIPCEvent = getDiscordIPCEvent;
exports.IPCEvents = void 0;

function sanitizeIPCEvents(events) {
  for (const key of Object.keys(events)) {
    events[key] = getDiscordIPCEvent(key);
  }

  return events;
}

const discordPrefixRegex = /^DISCORD_/;

function getDiscordIPCEvent(ev) {
  return discordPrefixRegex.test(ev) ? ev : `DISCORD_${ev}`;
}

const IPCEvents = sanitizeIPCEvents({
  ACCESSIBILITY_GET_ENABLED: null,
  APP_BADGE_SET: null,
  APP_GET_RELEASE_CHANNEL_SYNC: null,
  APP_GET_HOST_VERSION_SYNC: null,
  APP_GET_MODULE_VERSIONS: null,
  APP_GET_PATH: null,
  APP_SET_BADGE_COUNT: null,
  APP_DOCK_SET_BADGE: null,
  APP_DOCK_BOUNCE: null,
  APP_DOCK_CANCEL_BOUNCE: null,
  APP_RELAUNCH: null,
  APP_GET_DEFAULT_DOUBLE_CLICK_ACTION: null,
  CLIPBOARD_COPY: null,
  CLIPBOARD_CUT: null,
  CLIPBOARD_PASTE: null,
  CHECK_FOR_UPDATES: null,
  CONSTANTS_GET: null,
  CRASH_REPORTER_UPDATE_METADATA: null,
  FEATURES_GET_BROWSER_FEATURES: null,
  FILE_MANAGER_GET_MODULE_PATH: null,
  FILE_MANAGER_GET_MODULE_DATA_PATH_SYNC: null,
  FILE_MANAGER_SHOW_SAVE_DIALOG: null,
  FILE_MANAGER_SHOW_OPEN_DIALOG: null,
  FILE_MANAGER_SHOW_ITEM_IN_FOLDER: null,
  GPU_SETTINGS_SET_ENABLE_HWACCEL: null,
  GPU_SETTINGS_GET_ENABLE_HWACCEL_SYNC: null,
  NATIVE_MODULES_GET_PATHS: null,
  NATIVE_MODULES_INSTALL: null,
  NATIVE_MODULES_FINISH_UPDATER_BOOTSTRAP: null,
  NATIVE_MODULES_GET_HAS_NEW_UPDATER: null,
  NOTIFICATION_CLOSE: null,
  NOTIFICATION_SHOW: null,
  NOTIFICATIONS_CLEAR: null,
  OPEN_EXTERNAL_URL: null,
  POWER_MONITOR_RESUME: null,
  POWER_MONITOR_SUSPEND: null,
  POWER_MONITOR_LOCK_SCREEN: null,
  POWER_MONITOR_UNLOCK_SCREEN: null,
  POWER_MONITOR_GET_SYSTEM_IDLE_TIME: null,
  POWER_SAVE_BLOCKER_BLOCK_DISPLAY_SLEEP: null,
  POWER_SAVE_BLOCKER_UNBLOCK_DISPLAY_SLEEP: null,
  POWER_SAVE_BLOCKER_CLEANUP_DISPLAY_SLEEP: null,
  PROCESS_UTILS_GET_CPU_USAGE: null,
  PROCESS_UTILS_GET_MEMORY_INFO: null,
  PROCESS_UTILS_FLUSH_DNS_CACHE: null,
  PROCESS_UTILS_FLUSH_COOKIES: null,
  PROCESS_UTILS_FLUSH_STORAGE_DATA: null,
  PROCESS_UTILS_GET_MAIN_ARGV_SYNC: null,
  PROCESS_UTILS_GET_LAST_CRASH: null,
  QUIT_AND_INSTALL: null,
  SETTINGS_GET: null,
  SETTINGS_SET: null,
  SETTINGS_GET_SYNC: null,
  SETTINGS_UPDATE_BACKGROUND_COLOR: null,
  SPELLCHECK_RESULT: null,
  SPELLCHECK_REPLACE_MISSPELLING: null,
  SPELLCHECK_GET_AVAILABLE_DICTIONARIES: null,
  SPELLCHECK_SET_LOCALE: null,
  SPELLCHECK_SET_LEARNED_WORDS: null,
  SYSTEM_TRAY_SET_ICON: null,
  SYSTEM_TRAY_SET_APPLICATIONS: null,
  THUMBAR_BUTTONS_UPDATE: null,
  THUMBAR_BUTTONS_CLICKED: null,
  TOGGLE_MINIMIZE_TO_TRAY: null,
  TOGGLE_OPEN_ON_STARTUP: null,
  TOGGLE_START_MINIMIZED: null,
  UPDATE_OPEN_ON_STARTUP: null,
  UPDATER_HISTORY_QUERY_AND_TRUNCATE: null,
  UPDATED_QUOTES: null,
  USER_DATA_CACHE_DELETE: null,
  USER_DATA_CACHE_GET: null,
  USER_DATA_CACHE_SAVE: null,
  WINDOW_BLUR: null,
  WINDOW_CLOSE: null,
  WINDOW_FOCUS: null,
  WINDOW_MAXIMIZE: null,
  WINDOW_MINIMIZE: null,
  WINDOW_RESTORE: null,
  WINDOW_FLASH_FRAME: null,
  WINDOW_TOGGLE_FULLSCREEN: null,
  WINDOW_SET_BACKGROUND_THROTTLING: null,
  WINDOW_SET_PROGRESS_BAR: null,
  WINDOW_IS_ALWAYS_ON_TOP: null,
  WINDOW_SET_ALWAYS_ON_TOP: null,
  WINDOW_DEVTOOLS_OPENED: null,
  WINDOW_DEVTOOLS_CLOSED: null
});
exports.IPCEvents = IPCEvents;