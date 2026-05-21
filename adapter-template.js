// adapter-template.js
// ─────────────────────────────────────────────────────────────────────────────
// Blank SiteAdapter template.  Copy → rename → fill in every TODO.
// ─────────────────────────────────────────────────────────────────────────────

const MySiteAdapter = (() => {

    const SEL = {
        VIDEO_ELEMENT:     "video",                 // TODO
        TITLE:             ".video-title",           // TODO
        LIKE_BUTTON:       null,                     // TODO (null = none)
        DISLIKE_BUTTON:    null,                     // TODO (null = none)
        VIDEO_OVERLAY:     null,                     // TODO (null = disabled)
        VIDEO_LINK_ATTR:   "[href*='/watch']",        // TODO: fragment on video <a> tags

        // ── Blacklist / Block button (omit section if not needed) ─────────
        CARD_ROOT:         ".video-card",            // TODO: outermost card element
        CARD_TITLE_LINK:   ".card-title a",          // TODO: title anchor in card
        CARD_CHANNEL_LINK: ".card-channel a",        // TODO: channel anchor in card
        CARD_THUMB:        ".card-thumb",            // TODO: Block button injection target
    };

    // WeakSet prevents duplicate Block-button injection across poll cycles
    const _processed = new WeakSet();

    // ── URL / ID helpers ──────────────────────────────────────────────────

    function isVideoPage() {
        return location.href.includes("/watch");    // TODO
    }

    function getVideoId()             { return _extractVideoId(location.href); }
    function getVideoIdFromUrl(url)   { return _extractVideoId(url); }

    function _extractVideoId(url) {
        // TODO: e.g. new URLSearchParams(new URL(url).search).get("v")
        const m = url.match(/\/watch\/([^/?#]+)/);
        return m ? m[1] : null;
    }

    function _extractChannelId(href) {
        if (!href) return null;
        // TODO: parse the channel slug / id from the channel URL
        const m = href.match(/\/([^/?#]+)\/?$/);
        return m ? m[1] : null;
    }

    // ── Video-page helpers ────────────────────────────────────────────────

    function getTitleElement() {
        return document.querySelector(SEL.TITLE);
    }

    function waitForVideoElement(cb) {
        const t = setInterval(() => {
            const v = document.querySelector(SEL.VIDEO_ELEMENT);
            if (v) { clearInterval(t); cb(v); }
        }, 500);
    }

    function onLikeClick(fn) {
        document.querySelector(SEL.LIKE_BUTTON)?.addEventListener("click", fn);
    }

    function onDislikeClick(fn) {
        document.querySelector(SEL.DISLIKE_BUTTON)?.addEventListener("click", fn);
    }

    function getVideoOverlayElement() {
        return SEL.VIDEO_OVERLAY ? document.querySelector(SEL.VIDEO_OVERLAY) : null;
    }

    // ── Gallery helpers ───────────────────────────────────────────────────

    function getRecommendedLinks() {
        const results = [];

        document.querySelectorAll(SEL.CARD_ROOT).forEach(card => {
            const titleLink   = card.querySelector(SEL.CARD_TITLE_LINK);
            const channelLink = card.querySelector(SEL.CARD_CHANNEL_LINK);
            if (!titleLink) return;

            results.push({
                url:       new URL(titleLink.href, location.origin).href,
                titleEl:   titleLink,
                cardEl:    card,
                channelId: _extractChannelId(channelLink?.href),
            });
        });

        return results;
    }

    /**
     * Return cards that need a Block button injected.
     * Omit this function (or return []) to disable Block buttons on this site.
     */
    function getChannelCards() {
        const results = [];

        document.querySelectorAll(SEL.CARD_ROOT).forEach(card => {
            if (_processed.has(card)) return;
            _processed.add(card);

            const channelLink = card.querySelector(SEL.CARD_CHANNEL_LINK);
            const thumb       = card.querySelector(SEL.CARD_THUMB);
            if (!channelLink || !thumb) return;

            const channelId = _extractChannelId(channelLink.href);
            if (!channelId) return;

            if (getComputedStyle(thumb).position === "static") {
                thumb.style.position = "relative";
            }

            results.push({ channelId, cardEl: card, blockBtnTarget: thumb });
        });

        return results;
    }

    // ── Public ─────────────────────────────────────────────────────────────

    return {
        isVideoPage,
        getVideoId,
        getVideoIdFromUrl,
        getTitleElement,
        waitForVideoElement,
        onLikeClick,
        onDislikeClick,
        getVideoOverlayElement,
        getRecommendedLinks,
        getChannelCards,        // remove if not needed
    };

})();