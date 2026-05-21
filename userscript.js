// ==UserScript==
// @name         Video Watch Tracker
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Tracks watched/liked/disliked videos and colours gallery links accordingly.
// @match        https://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @require      https://raw.githubusercontent.com/Exiua/HistoryTrackerCore/refs/heads/master/tracker-core.js
// ==/UserScript==

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
//
// To support a *new* site:
//   1. Copy adapter-template.js -> adapter-mysite.js or copy into this file
//   2. Update every selector / URL pattern inside the new adapter.
//   3. Change @match and @require to point at the new file.
//   4. Replace `TemplateAdapter` below with your new adapter's name.
//
// tracker-core.js never needs to be modified.
// ─────────────────────────────────────────────────────────────────────────────

(function () {
    'use strict';

    // ── GM storage backend ───────────────────────────────────────────────
    // Wraps Greasemonkey/Tampermonkey storage so tracker-core.js stays
    // independent of any particular userscript runtime.

    const GMStorage = {
        get:  (key)        => GM_getValue(key, null),
        set:  (key, value) => GM_setValue(key, value),
    };

    // ── Boot ─────────────────────────────────────────────────────────────
    window.addEventListener("load", () => {
        TrackerCore.init(TemplateAdapter, GMStorage);
    });

})();
