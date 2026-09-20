/*!
 * QuizFlow embed widget.
 * Usage (quick):
 *   <script src="https://YOUR_DOMAIN/embed.js" data-quiz="SLUG" data-trigger="button|delay|exit" data-delay="5"></script>
 *
 * Usage (advanced):
 *   <script src="https://YOUR_DOMAIN/embed.js"></script>
 *   <script>
 *     QuizFlow.init({
 *       quiz: "SLUG",
 *       trigger: "delay",   // "button" | "delay" | "exit" | "inline" | "fullpage"
 *       delay: 5,           // seconds, used when trigger === "delay"
 *       buttonSelector: "#my-cta",   // optional: bind to an existing button instead of the floating bubble
 *       container: "#quiz-container", // required when trigger === "inline"
 *       color: "#10b981"    // bubble / accent color
 *     });
 *   </script>
 */
(function () {
  "use strict";

  var CURRENT_SCRIPT = document.currentScript;
  var BASE_URL = (function () {
    try {
      return new URL(CURRENT_SCRIPT.src).origin;
    } catch (e) {
      return "";
    }
  })();

  var STYLE_ID = "qf-embed-style";
  var OPENED_KEY_PREFIX = "qf-opened-";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".qf-bubble{position:fixed;bottom:20px;inset-inline-end:20px;width:60px;height:60px;border-radius:999px;background:var(--qf-color,#10b981);box-shadow:0 8px 24px rgba(0,0,0,.25);border:none;cursor:pointer;z-index:2147483000;display:flex;align-items:center;justify-content:center;transition:transform .15s ease}" +
      ".qf-bubble:hover{transform:scale(1.06)}" +
      ".qf-bubble svg{width:26px;height:26px;fill:#fff}" +
      ".qf-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:2147483001;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;pointer-events:none;transition:opacity .2s ease}" +
      ".qf-overlay.qf-open{opacity:1;pointer-events:auto}" +
      ".qf-modal{position:relative;width:100%;max-width:420px;height:min(720px,92vh);background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35);transform:translateY(12px);transition:transform .2s ease}" +
      ".qf-overlay.qf-open .qf-modal{transform:translateY(0)}" +
      ".qf-modal iframe{width:100%;height:100%;border:0;display:block}" +
      ".qf-close{position:absolute;top:10px;inset-inline-end:10px;width:32px;height:32px;border-radius:999px;background:rgba(15,23,42,.55);color:#fff;border:none;cursor:pointer;font-size:18px;line-height:1;z-index:1}" +
      ".qf-inline-frame{width:100%;height:100%;min-height:640px;border:0;display:block;border-radius:16px}" +
      ".qf-fullpage-frame{position:fixed;inset:0;width:100%;height:100%;border:0;display:block;z-index:2147483000}";
    document.head.appendChild(style);
  }

  function quizUrl(slug) {
    return BASE_URL + "/q/" + encodeURIComponent(slug);
  }

  function buildOverlay(slug) {
    var overlay = document.createElement("div");
    overlay.className = "qf-overlay";
    var modal = document.createElement("div");
    modal.className = "qf-modal";
    var closeBtn = document.createElement("button");
    closeBtn.className = "qf-close";
    closeBtn.setAttribute("aria-label", "close");
    closeBtn.innerHTML = "&times;";
    var iframe = document.createElement("iframe");
    iframe.src = quizUrl(slug);
    iframe.title = "QuizFlow";
    modal.appendChild(closeBtn);
    modal.appendChild(iframe);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() {
      overlay.classList.remove("qf-open");
    }
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    return {
      open: function () {
        overlay.classList.add("qf-open");
      },
      close: close,
    };
  }

  function buildBubble(color) {
    var btn = document.createElement("button");
    btn.className = "qf-bubble";
    if (color) btn.style.setProperty("--qf-color", color);
    btn.setAttribute("aria-label", "פתח שאלון");
    btn.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 15h-2v-2h2Zm1.6-6.2c-.6.5-.9 1-.9 1.7v.5h-2v-.6c0-1.1.5-1.9 1.3-2.6.6-.5.9-.9.9-1.5a1.9 1.9 0 0 0-2-1.8 2 2 0 0 0-2.1 1.9H7.8A3.9 3.9 0 0 1 12 5.5a3.7 3.7 0 0 1 3.9 3.6c0 1-.4 1.8-1.3 2.7Z"/></svg>';
    document.body.appendChild(btn);
    return btn;
  }

  function markOpened(key) {
    try {
      sessionStorage.setItem(OPENED_KEY_PREFIX + key, "1");
    } catch (e) {
      /* ignore */
    }
  }
  function wasOpened(key) {
    try {
      return sessionStorage.getItem(OPENED_KEY_PREFIX + key) === "1";
    } catch (e) {
      return false;
    }
  }

  function init(options) {
    options = options || {};
    var slug = options.quiz;
    if (!slug) {
      console.error("QuizFlow.init: missing required `quiz` option (slug)");
      return;
    }
    var trigger = options.trigger || "button";

    if (trigger === "inline") {
      var container =
        typeof options.container === "string"
          ? document.querySelector(options.container)
          : options.container;
      if (!container) {
        console.error("QuizFlow.init: `container` selector not found for inline trigger");
        return;
      }
      injectStyles();
      var iframe = document.createElement("iframe");
      iframe.className = "qf-inline-frame";
      iframe.src = quizUrl(slug);
      iframe.title = "QuizFlow";
      container.appendChild(iframe);
      return;
    }

    if (trigger === "fullpage") {
      injectStyles();
      document.documentElement.style.margin = "0";
      document.body.style.margin = "0";
      var fullFrame = document.createElement("iframe");
      fullFrame.className = "qf-fullpage-frame";
      fullFrame.src = quizUrl(slug);
      fullFrame.title = "QuizFlow";
      document.body.appendChild(fullFrame);
      return;
    }

    injectStyles();
    var overlayCtl = buildOverlay(slug);
    var sessionKey = slug + ":" + trigger;

    if (trigger === "button") {
      if (options.buttonSelector) {
        var el = document.querySelector(options.buttonSelector);
        if (el) el.addEventListener("click", overlayCtl.open);
        else console.error("QuizFlow.init: buttonSelector not found: " + options.buttonSelector);
      } else {
        buildBubble(options.color).addEventListener("click", overlayCtl.open);
      }
    } else if (trigger === "delay") {
      if (!wasOpened(sessionKey)) {
        setTimeout(function () {
          overlayCtl.open();
          markOpened(sessionKey);
        }, (Number(options.delay) || 5) * 1000);
      }
    } else if (trigger === "exit") {
      var fired = false;
      document.addEventListener("mouseleave", function (e) {
        if (fired || wasOpened(sessionKey)) return;
        if (e.clientY <= 0) {
          fired = true;
          overlayCtl.open();
          markOpened(sessionKey);
        }
      });
    }
  }

  window.QuizFlow = { init: init };

  // Auto-init from data-attributes on the loading <script> tag, for the quick one-liner usage.
  if (CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute("data-quiz")) {
    init({
      quiz: CURRENT_SCRIPT.getAttribute("data-quiz"),
      trigger: CURRENT_SCRIPT.getAttribute("data-trigger") || "button",
      delay: CURRENT_SCRIPT.getAttribute("data-delay"),
      buttonSelector: CURRENT_SCRIPT.getAttribute("data-button-selector"),
      container: CURRENT_SCRIPT.getAttribute("data-container"),
      color: CURRENT_SCRIPT.getAttribute("data-color"),
    });
  }
})();
