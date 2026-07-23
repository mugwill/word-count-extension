/*
 * Auto Word Count for Google Docs
 * -------------------------------
 * Google Docs has a native live word counter (Tools -> Word count ->
 * "Display word count while typing") but no global default: every new doc
 * starts with it hidden. This content script flips that native setting on
 * automatically, on every document.
 *
 * Why drive the native menu instead of counting ourselves: since ~2021 the
 * Google Docs document body is painted to a <canvas>, so the text is not in
 * the DOM and cannot be reliably scraped. The menu bar and dialogs, however,
 * are still ordinary DOM -- so we let Google do the counting and just make
 * sure the toggle is on.
 *
 * Strategy: when the editor is ready, check whether the live word-count badge
 * is already showing. If not, open Tools -> Word count, tick the checkbox, and
 * dismiss the dialog. All selectors prefer text / role / aria-label matching
 * over Google's obfuscated CSS class names, which change without notice.
 */

(() => {
  'use strict';

  const CHECKBOX_LABEL = 'Display word count while typing';
  const WORD_COUNT_ITEM = 'Word count';
  const TOOLS_MENU = 'Tools';

  // Text a live word-count badge shows, e.g. "1,234 words" or "0 words".
  const WORD_BADGE_RE = /\b[\d.,]+\s+words?\b/i;

  // --- Safety limits so a wrong selector can never spin the UI ---------------
  const MAX_ATTEMPTS_PER_DOC = 4; // give up after this many tries on one doc
  const STEP_TIMEOUT_MS = 6000; // per async wait (menu/dialog appearing)
  const MENUBAR_TIMEOUT_MS = 20000; // editor chrome can take a while to mount

  let running = false; // an enable pass is in flight
  let currentDocKey = ''; // identifies the doc we're acting on
  let attempts = 0; // attempts against currentDocKey

  // --------------------------------------------------------------------------
  // Small DOM helpers
  // --------------------------------------------------------------------------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

  // Poll until predicate returns truthy or timeout elapses.
  async function waitFor(predicate, timeout = STEP_TIMEOUT_MS, interval = 120) {
    const start = Date.now();
    for (;;) {
      let val;
      try {
        val = predicate();
      } catch (_) {
        val = null;
      }
      if (val) return val;
      if (Date.now() - start >= timeout) return null;
      await sleep(interval);
    }
  }

  // Dispatch a full, trusted-looking activation sequence. Google Docs menus
  // open on mousedown; a plain .click() alone is often ignored.
  function activate(el) {
    if (!el) return;
    const opts = { bubbles: true, cancelable: true, view: window };
    for (const type of ['mouseover', 'mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, opts));
    }
  }

  // --------------------------------------------------------------------------
  // Detection: is the live word-count badge already visible?
  // --------------------------------------------------------------------------
  function isBadgeVisible() {
    // The badge lives near the bottom-left of the editor. Match on its text
    // pattern rather than a class name. Scope to plausible small containers to
    // keep the scan cheap.
    const scopes = document.querySelectorAll(
      '.kix-appview-editor, .docs-material, #docs-editor, body'
    );
    const scope = scopes[0] || document.body;
    const nodes = scope.querySelectorAll('span, div');
    let scanned = 0;
    for (const el of nodes) {
      if (++scanned > 4000) break; // hard cap on work per check
      // Skip large containers: a badge is a small leaf-ish element.
      if (el.childElementCount > 3) continue;
      const text = norm(el.textContent);
      if (text.length > 40) continue;
      if (WORD_BADGE_RE.test(text) && isVisible(el)) return true;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Menu / dialog element finders (text-based, class-agnostic)
  // --------------------------------------------------------------------------

  function findTopMenuButton(label) {
    const items = document.querySelectorAll(
      '#docs-menubar [role="menuitem"], .menu-button, [role="menubar"] [role="menuitem"]'
    );
    for (const el of items) {
      const text = norm(el.getAttribute('aria-label') || el.textContent);
      if (text === label || text.startsWith(label)) return el;
    }
    return null;
  }

  function findOpenMenuItem(label) {
    // Only consider items inside a currently-visible menu popup.
    const items = document.querySelectorAll('[role="menuitem"]');
    for (const el of items) {
      if (!isVisible(el)) continue;
      const text = norm(el.textContent || el.getAttribute('aria-label'));
      if (text === label || text.startsWith(label)) return el;
    }
    return null;
  }

  function findWordCountDialog() {
    const dialogs = document.querySelectorAll(
      '[role="dialog"], .modal-dialog, .docs-dialog'
    );
    for (const d of dialogs) {
      if (!isVisible(d)) continue;
      if (norm(d.textContent).includes(CHECKBOX_LABEL)) return d;
    }
    return null;
  }

  // Locate the "Display word count while typing" checkbox inside the dialog.
  function findCheckbox(dialog) {
    // Native <input type=checkbox> path.
    const input = dialog.querySelector('input[type="checkbox"]');
    if (input) return input;

    // Google's custom checkbox: an element with role="checkbox" whose row
    // carries the label text.
    const roleBoxes = dialog.querySelectorAll('[role="checkbox"]');
    for (const box of roleBoxes) {
      const aria = norm(box.getAttribute('aria-label'));
      if (aria.includes(CHECKBOX_LABEL)) return box;
      const row = box.closest('label, tr, div');
      if (row && norm(row.textContent).includes(CHECKBOX_LABEL)) return box;
    }

    // Fallback: find the label element, walk to a nearby checkbox-like control.
    const all = dialog.querySelectorAll('*');
    for (const el of all) {
      if (norm(el.textContent) !== CHECKBOX_LABEL) continue;
      const container = el.closest('label, tr, div') || el.parentElement;
      const found =
        container &&
        container.querySelector('input[type="checkbox"], [role="checkbox"]');
      if (found) return found;
    }
    return null;
  }

  function isChecked(box) {
    if (!box) return false;
    if (box.tagName === 'INPUT') return box.checked;
    return box.getAttribute('aria-checked') === 'true';
  }

  function findDialogButton(dialog, labels) {
    const btns = dialog.querySelectorAll(
      'button, [role="button"], .jfk-button, .goog-buttonset-default'
    );
    for (const b of btns) {
      if (!isVisible(b)) continue;
      const text = norm(b.textContent || b.getAttribute('aria-label'));
      if (labels.some((l) => text === l)) return b;
    }
    return null;
  }

  function dismissDialog(dialog) {
    // Prefer OK/Apply so the setting sticks; Google applies it live on tick,
    // but closing cleanly avoids leaving a modal open.
    const ok = findDialogButton(dialog, ['OK', 'Apply', 'Done']);
    if (ok) {
      activate(ok);
      return;
    }
    const cancel = findDialogButton(dialog, ['Cancel', 'Close']);
    if (cancel) {
      activate(cancel);
      return;
    }
    // Last resort: Escape.
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
  }

  // --------------------------------------------------------------------------
  // The enable flow
  // --------------------------------------------------------------------------
  async function enableWordCount() {
    if (running) return;
    running = true;
    try {
      const tools = await waitFor(
        () => findTopMenuButton(TOOLS_MENU),
        MENUBAR_TIMEOUT_MS
      );
      if (!tools) return;

      activate(tools);
      const item = await waitFor(() => findOpenMenuItem(WORD_COUNT_ITEM));
      if (!item) {
        // Close the menu we opened.
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
        );
        return;
      }

      activate(item);
      const dialog = await waitFor(() => findWordCountDialog());
      if (!dialog) return;

      const box = findCheckbox(dialog);
      if (box && !isChecked(box)) activate(box);

      // Give Docs a beat to register the tick before we close.
      await sleep(150);
      dismissDialog(dialog);
    } catch (err) {
      // Never let an exception escape into the page.
      console.debug('[auto-word-count] enable failed:', err);
    } finally {
      running = false;
    }
  }

  // --------------------------------------------------------------------------
  // Orchestration: run on load + re-run on SPA navigation between docs
  // --------------------------------------------------------------------------

  function docKey() {
    // /document/d/<id>/... -> use the id so navigating docs resets attempts.
    const m = location.pathname.match(/\/document\/d\/([^/]+)/);
    return m ? m[1] : location.pathname;
  }

  function isEditor() {
    return /\/document\/d\//.test(location.pathname);
  }

  async function maybeEnable() {
    if (!isEditor() || running) return;

    const key = docKey();
    if (key !== currentDocKey) {
      currentDocKey = key;
      attempts = 0;
    }
    if (attempts >= MAX_ATTEMPTS_PER_DOC) return;
    if (isBadgeVisible()) return; // already on -> no-op

    attempts++;
    await enableWordCount();
  }

  // Debounced trigger shared by the observer and the poll.
  let debounceTimer = null;
  function scheduleCheck(delay = 400) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(maybeEnable, delay);
  }

  // 1) React to DOM churn (editor mounting, dialogs, doc switches).
  const observer = new MutationObserver(() => scheduleCheck());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // 2) Catch SPA URL changes that don't reload the page.
  let lastHref = location.href;
  setInterval(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      scheduleCheck(600);
    }
  }, 1000);

  // 3) Initial kick once the editor has had a moment to settle.
  scheduleCheck(1200);
})();
