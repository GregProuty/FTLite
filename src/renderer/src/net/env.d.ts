declare const __GAMEPLAY_CONTENT_DIGEST__: string;
declare const __FTLITE_BUILD__: { version: string; rev: string; sim: number };

/** The web build baked page online config (web build spec 5.1); null in Electron, whose preload hands the page its config. */
declare const __FTLITE_WEB_CONFIG__: import("../../../shared/onlineConfig").PageOnlineConfig | null;
