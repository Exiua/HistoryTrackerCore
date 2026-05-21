// tracker-core.js
// ─────────────────────────────────────────────────────────────────────────────
// Site-agnostic video watch tracker.
//
// Usage:
//   @require this file, then call:  TrackerCore.init(adapter, storage);
//
// ── SiteAdapter interface ────────────────────────────────────────────────────
//
//   REQUIRED
//   --------
//   isVideoPage()                      → boolean
//   getVideoId()                       → string | null
//   getVideoIdFromUrl(url)             → string | null
//   waitForVideoElement(cb)            calls cb(videoEl)
//   getTitleElement()                  → Element | null
//   getRecommendedLinks()              → Array<{ url, titleEl, cardEl }>
//     cardEl – the outermost card element to hide when a channel is blocked.
//              May be null; the card will simply not be hidden.
//
//   OPTIONAL
//   --------
//   onLikeClick(fn)                    wire fn to the site's Like button
//   onDislikeClick(fn)                 wire fn to the site's Dislike button
//   getVideoOverlayElement()           → Element | null  (cursor auto-hide)
//
//   OPTIONAL – blacklist
//   --------------------
//   getChannelCards()   → Array<{ channelId: string, cardEl: Element, blockBtnTarget: Element }>
//     Return every channel card currently in the DOM that hasn't had a Block
//     button injected yet.  The core will inject a button into `blockBtnTarget`
//     and call Blacklist.add(channelId) + cardEl.remove() on click.
//     Omit (or return []) to disable Block-button injection on this site.
//
// ── StorageBackend interface ─────────────────────────────────────────────────
//
//   get(key)        → string | null
//   set(key, value) → void
//
// ─────────────────────────────────────────────────────────────────────────────

const TrackerCore = (() => {

    // ── Constants ──────────────────────────────────────────────────────────
    const WATCH_THRESHOLD  = 0.85;   // fraction of duration = auto-like
    const POLL_MS          = 2500;   // gallery re-scan interval (ms)
    const CURSOR_HIDE_MS   = 2500;   // idle ms before cursor vanishes
    const BLACKLIST_KEY    = "__blacklist__";

    const STATUS = {
        QUEUED:   "queued",
        LIKED:    "liked",
        DISLIKED: "disliked",
    };

    const COLOR = {
        [STATUS.QUEUED]:   "#68B0AB",
        [STATUS.LIKED]:    "green",
        [STATUS.DISLIKED]: "red",
    };

    // ── Module-level state ─────────────────────────────────────────────────
    let _storage   = null;
    let _adapter   = null;
    let _started   = false;
    let _autoLiked = false;
    let _watchedSeconds = 0;
    let _lastTime  = 0;

    // ══════════════════════════════════════════════════════════════════════
    // Blacklist sub-module
    // ══════════════════════════════════════════════════════════════════════
    const Blacklist = (() => {

        let _list = null;   // Set<string>  (lazy-loaded)

        function _load() {
            if (_list) return;
            try {
                const raw = _storage.get(BLACKLIST_KEY);
                _list = new Set(raw ? JSON.parse(raw) : []);
            } catch {
                _list = new Set();
            }
        }

        function _save() {
            _storage.set(BLACKLIST_KEY, JSON.stringify([..._list]));
        }

        /** Add a channel id to the blacklist and persist. */
        function add(channelId) {
            _load();
            _list.add(channelId);
            _save();
            console.log("[blacklist] blocked:", channelId);
        }

        /** Remove a channel id from the blacklist and persist. */
        function remove(channelId) {
            _load();
            _list.delete(channelId);
            _save();
            console.log("[blacklist] unblocked:", channelId);
        }

        /** Return true if channelId is currently blocked. */
        function isBlocked(channelId) {
            _load();
            return _list.has(channelId);
        }

        /** Return a copy of all blocked channel ids. */
        function getAll() {
            _load();
            return [..._list];
        }

        return { add, remove, isBlocked, getAll };
    })();

    // ── Storage helpers (video status) ─────────────────────────────────────

    function _setStatus(videoId, status) {
        const obj = { status, watchedSeconds: _watchedSeconds, ts: Date.now() };
        _storage.set(videoId, JSON.stringify(obj));
        console.log("[tracker] id=%s status=%s", videoId, status);
    }

    function _getStatus(videoId) {
        const raw = _storage.get(videoId);
        if (!raw) return null;
        try   { return JSON.parse(raw); }
        catch { return null; }
    }

    // ── Video-page logic ────────────────────────────────────────────────────

    function _initVideoPage() {
        const id    = _adapter.getVideoId();
        if (!id) return;

        const title = _adapter.getTitleElement();
        const data  = _getStatus(id);
        let notSeen = true;

        if (data) {
            if (data.status === STATUS.LIKED)    { _autoLiked = true; notSeen = false; }
            if (data.status === STATUS.DISLIKED) { notSeen = false; }
            if (title && COLOR[data.status]) title.style.color = COLOR[data.status];
        }

        _adapter.onLikeClick?.(() => {
            _autoLiked = true;
            _setStatus(id, STATUS.LIKED);
            if (title) title.style.color = COLOR[STATUS.LIKED];
        });

        _adapter.onDislikeClick?.(() => {
            _setStatus(id, STATUS.DISLIKED);
            if (title) title.style.color = COLOR[STATUS.DISLIKED];
        });

        const overlay = _adapter.getVideoOverlayElement?.();
        if (overlay) _autohideCursor(overlay, CURSOR_HIDE_MS);

        _adapter.waitForVideoElement(video => {
            if (notSeen) _setStatus(id, STATUS.QUEUED);

            video.addEventListener("play", () => {
                if (!_started) { console.log("[tracker] playing"); _started = true; }
            });

            video.addEventListener("timeupdate", () => {
                _trackWatch(video, id, title);
            });

            window.addEventListener("pagehide", () => {
                if (_started && !_autoLiked) {
                    _setStatus(id, STATUS.DISLIKED);
                }
            });
        });
    }

    function _trackWatch(video, id, title) {
        if (!video.duration) return;
        if (video.currentTime > _lastTime) {
            _watchedSeconds += video.currentTime - _lastTime;
        }
        _lastTime = video.currentTime;

        if (_watchedSeconds / video.duration >= WATCH_THRESHOLD && !_autoLiked) {
            _autoLiked = true;
            _setStatus(id, STATUS.LIKED);
            if (title) title.style.color = COLOR[STATUS.LIKED];
        }
    }

    // ── Gallery / recommendation logic ─────────────────────────────────────

    function _scanGallery() {
        // 1. Colour video-link titles by watch status
        _adapter.getRecommendedLinks().forEach(({ url, titleEl, cardEl }) => {
            const videoId = _adapter.getVideoIdFromUrl(url);
            if (!videoId) return;

            const data = _getStatus(videoId);
            if (data && titleEl && COLOR[data.status]) {
                titleEl.style.color = COLOR[data.status];
            }
        });

        // 2. Hide cards belonging to blacklisted channels
        _adapter.getRecommendedLinks().forEach(({ cardEl, channelId }) => {
            if (cardEl && channelId && Blacklist.isBlocked(channelId)) {
                cardEl.remove();
            }
        });

        // 3. Inject "Block" buttons on new cards (adapter-optional)
        _adapter.getChannelCards?.().forEach(({ channelId, cardEl, blockBtnTarget }) => {
            if (!channelId || !blockBtnTarget) return;

            // Skip if already blocked (card will be removed above on next tick)
            if (Blacklist.isBlocked(channelId)) { cardEl?.remove(); return; }

            const btn = _createBlockButton(() => {
                Blacklist.add(channelId);
                cardEl?.remove();
            });

            blockBtnTarget.appendChild(btn);
        });
    }

    // ── UI helpers ──────────────────────────────────────────────────────────

    function _createBlockButton(onClick) {
        const btn = document.createElement("button");
        btn.textContent = "Block";
        btn.title = "Hide all videos from this channel";

        // Minimal, unobtrusive style — adapters can override via CSS
        Object.assign(btn.style, {
            position:     "absolute",
            bottom:       "4px",
            right:        "4px",
            zIndex:       "9999",
            padding:      "2px 6px",
            fontSize:     "11px",
            cursor:       "pointer",
            background:   "rgba(0,0,0,0.65)",
            color:        "#fff",
            border:       "none",
            borderRadius: "3px",
            lineHeight:   "1.4",
        });

        btn.addEventListener("click", e => {
            e.preventDefault();
            e.stopPropagation();
            onClick();
        });

        return btn;
    }

    function _autohideCursor(element, delayMs) {
        let timer = null;
        const show = () => {
            element.style.cursor = "default";
            clearTimeout(timer);
            timer = setTimeout(() => { element.style.cursor = "none"; }, delayMs);
        };
        element.addEventListener("mousemove",  show);
        element.addEventListener("mouseenter", show);
        element.addEventListener("mouseleave", () => {
            element.style.cursor = "default";
            clearTimeout(timer);
        });
    }

    // ── Public API ──────────────────────────────────────────────────────────

    function init(adapter, storage) {
        _adapter = adapter;
        _storage = storage;

        if (_adapter.isVideoPage()) _initVideoPage();

        _scanGallery();
        setInterval(_scanGallery, POLL_MS);
    }

    return { init, STATUS, COLOR, Blacklist };

})();