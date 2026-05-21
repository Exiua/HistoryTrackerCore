// adapter-template.js
// ─────────────────────────────────────────────────────────────────────────────
// Blank SiteAdapter template.
//
// Copy this file, rename it (e.g. adapter-mysite.js), fill in every TODO, then
// @require it from userscript.js in place of adapter-template.js or copy the whole adapter into userscript.js.
// ─────────────────────────────────────────────────────────────────────────────

const MySiteAdapter = (() => {

    // ── Selectors ─────────────────────────────────────────────────────────
    const SEL = {
        // TODO: CSS selector that matches the <video> element
        VIDEO_ELEMENT: "video",

        // TODO: title element shown on the video page
        TITLE: ".video-title",

        // TODO: Like / Dislike buttons (set to null if the site has none)
        LIKE_BUTTON:    null,
        DISLIKE_BUTTON: null,

        // TODO: overlay element for cursor auto-hide (null = disabled)
        VIDEO_OVERLAY: null,

        // TODO: attribute fragment shared by all gallery video links, e.g. "[href*='/watch?v=']"
        VIDEO_LINK_ATTR: "[href*='/watch']",
    };

    // ── isVideoPage ────────────────────────────────────────────────────────
    // Return true only on single-video pages.
    function isVideoPage() {
        // TODO: adjust the test string
        return location.href.includes("/watch");
    }

    // ── getVideoId / getVideoIdFromUrl ────────────────────────────────────
    // Extract a stable unique id (string) from a URL.
    function getVideoId() {
        return _extractId(location.href);
    }

    function getVideoIdFromUrl(url) {
        return _extractId(url);
    }

    function _extractId(url) {
        // TODO: parse the id out of the URL, e.g.:
        //   YouTube: new URLSearchParams(new URL(url).search).get("v")
        //   Path segment: url.match(/\/videos\/([^/?#]+)/)?.[1]
        const m = url.match(/\/watch\/([^/?#]+)/);
        return m ? m[1] : null;
    }

    // ── getTitleElement ────────────────────────────────────────────────────
    function getTitleElement() {
        return document.querySelector(SEL.TITLE);
    }

    // ── waitForVideoElement ────────────────────────────────────────────────
    // Call cb(videoEl) once the player <video> is in the DOM.
    function waitForVideoElement(cb) {
        const t = setInterval(() => {
            const v = document.querySelector(SEL.VIDEO_ELEMENT);
            if (v) { clearInterval(t); cb(v); }
        }, 500);
    }

    // ── onLikeClick / onDislikeClick ──────────────────────────────────────
    // Wire `fn` to the site's native like/dislike buttons.
    // These are optional – omit or leave as no-ops if the site has no buttons.
    function onLikeClick(fn) {
        document.querySelector(SEL.LIKE_BUTTON)?.addEventListener("click", fn);
    }

    function onDislikeClick(fn) {
        document.querySelector(SEL.DISLIKE_BUTTON)?.addEventListener("click", fn);
    }

    // ── getVideoOverlayElement ────────────────────────────────────────────
    function getVideoOverlayElement() {
        if (!SEL.VIDEO_OVERLAY) return null;
        return document.querySelector(SEL.VIDEO_OVERLAY);
    }

    // ── getRecommendedLinks ───────────────────────────────────────────────
    // Return { url, titleEl } for every gallery / recommended video visible now.
    function getRecommendedLinks() {
        const results = [];
        document.querySelectorAll(`a${SEL.VIDEO_LINK_ATTR}`).forEach(link => {
            const url = new URL(link.href, location.origin).href;

            // TODO: find the per-card title element.
            // Simple default – colour the anchor text itself:
            const titleEl = link;

            // Richer example (colour a child heading instead):
            // const titleEl = link.closest(".video-card")?.querySelector("h3") ?? link;

            results.push({ url, titleEl });
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
    };

})();
