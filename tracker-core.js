// tracker-core.js
// ─────────────────────────────────────────────────────────────────────────────
// Site-agnostic video watch tracker.
//
// Usage:
//   import / @require this file, then call:
//
//     TrackerCore.init(adapter, storage);
//
// `adapter`  – an object satisfying the SiteAdapter interface (see below).
// `storage`  – an object satisfying the StorageBackend interface (see below).
//
// ── SiteAdapter interface ────────────────────────────────────────────────────
//
//   isVideoPage()            → boolean
//     Return true when the current page is a single-video page.
//
//   getVideoId()             → string | null
//     Return a stable, unique string for the current video
//     (e.g. the id segment from the URL).
//
//   waitForVideoElement(cb)
//     Call cb(videoEl) once the <video> element is in the DOM.
//
//   getTitleElement()        → Element | null
//     Return the element whose color should reflect watch status.
//     Called on the video page only.
//
//   getRecommendedLinks()    → Array<{ url: string, titleEl: Element }>
//     Return all "recommended / gallery" video links visible right now.
//     Called repeatedly by the gallery poller.
//
//   getVideoIdFromUrl(url)   → string | null
//     Extract the video-id from an arbitrary href on the gallery page.
//
//   // Optional ───────────────────────────────────────────────────────────────
//
//   getVideoOverlayElement() → Element | null   (for cursor auto-hide)
//     Return the element that overlays the video (receives mouse events).
//     Return null / omit to disable cursor-hiding.
//
// ── StorageBackend interface ─────────────────────────────────────────────────
//
//   get(key)          → any
//   set(key, value)   → void
//
// ─────────────────────────────────────────────────────────────────────────────

const TrackerCore = (() => {

    // ── Constants ──────────────────────────────────────────────────────────
    const WATCH_THRESHOLD = 0.85;   // fraction of duration = auto-like
    const POLL_MS         = 2500;   // gallery re-scan interval (ms)
    const CURSOR_HIDE_MS  = 2500;   // idle ms before cursor vanishes

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

    // ── State (reset per page) ──────────────────────────────────────────────
    let _storage  = null;
    let _adapter  = null;
    let _started  = false;
    let _autoLiked = false;         // true once threshold reached
    let _watchedSeconds = 0;
    let _lastTime = 0;

    // ── Storage helpers ─────────────────────────────────────────────────────

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

        // Restore previous color
        if (data) {
            if (data.status === STATUS.LIKED)    { _autoLiked = true; notSeen = false; }
            if (data.status === STATUS.DISLIKED) { notSeen = false; }
            if (title && COLOR[data.status]) title.style.color = COLOR[data.status];
        }

        // Wire like / dislike buttons (adapter-provided selectors via events)
        _adapter.onLikeClick?.(() => {
            console.log("[tracker] manual like");
            _autoLiked = true;
            _setStatus(id, STATUS.LIKED);
            if (title) title.style.color = COLOR[STATUS.LIKED];
        });

        _adapter.onDislikeClick?.(() => {
            console.log("[tracker] manual dislike");
            _setStatus(id, STATUS.DISLIKED);
            if (title) title.style.color = COLOR[STATUS.DISLIKED];
        });

        // Cursor auto-hide
        const overlay = _adapter.getVideoOverlayElement?.();
        if (overlay) _autohideCursor(overlay, CURSOR_HIDE_MS);

        // Wait for <video>, then begin tracking
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

        const pct = _watchedSeconds / video.duration;
        if (pct >= WATCH_THRESHOLD && !_autoLiked) {
            _autoLiked = true;
            _setStatus(id, STATUS.LIKED);
            if (title) title.style.color = COLOR[STATUS.LIKED];
        }
    }

    // ── Gallery-page logic ──────────────────────────────────────────────────

    function _scanGallery() {
        const links = _adapter.getRecommendedLinks();

        links.forEach(({ url, titleEl }) => {
            const id   = _adapter.getVideoIdFromUrl(url);
            if (!id) return;
            const data = _getStatus(id);
            if (data && titleEl && COLOR[data.status]) {
                titleEl.style.color = COLOR[data.status];
            }
        });
    }

    // ── Cursor auto-hide ────────────────────────────────────────────────────

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

    /**
     * Initialise the tracker.
     *
     * @param {SiteAdapter}    adapter
     * @param {StorageBackend} storage
     */
    function init(adapter, storage) {
        _adapter = adapter;
        _storage = storage;

        if (_adapter.isVideoPage()) {
            _initVideoPage();
        }

        // Always run the gallery scanner so status colours appear on any page
        // that contains recommendation links (including the video page sidebar).
        _scanGallery();
        setInterval(_scanGallery, POLL_MS);
    }

    return { init, STATUS, COLOR };

})();
