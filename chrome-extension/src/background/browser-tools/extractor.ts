/**
 * Self-contained page extractors injected into target tabs via
 * `chrome.scripting.executeScript({ func })`. Chrome serializes these functions
 * and runs them in the page context, so they MUST NOT reference any import,
 * module-scope variable, or closure — everything they need is passed as args.
 */

export interface ExtractedContent {
  title: string;
  url: string;
  content: string;
  truncated: boolean;
}

export interface ExtractedSelection {
  title: string;
  url: string;
  selection: string;
}

/** Readability-style main-content extraction. Runs in the page. */
export function extractReadableContent(
  mode: 'article' | 'full_text',
  maxChars: number,
  includeLinks = true,
): ExtractedContent {
  const stripSelectors = 'script,style,noscript,nav,header,footer,aside,svg,iframe,form,button,template';
  const clean = (root: Element): string => {
    const clone = root.cloneNode(true) as Element;
    clone.querySelectorAll(stripSelectors).forEach(n => n.remove());
    if (includeLinks) {
      // Inline surviving anchors as markdown [text](absolute-url). stripSelectors
      // omits `a`, so nav/footer/aside menu links are already gone above.
      const MAX_LINKS = 100;
      const pageBase = location.href.split('#')[0];
      const seen = new Set<string>();
      let n = 0;
      clone.querySelectorAll('a[href]').forEach(a => {
        if (n >= MAX_LINKS) return;
        const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) return; // image-only / empty
        const raw = a.getAttribute('href') || '';
        let abs: string;
        try {
          abs = new URL(raw, location.href).href;
        } catch {
          return;
        }
        if (!/^https?:/i.test(abs)) return; // skip javascript:/mailto:/tel:
        if (abs.split('#')[0] === pageBase) return; // skip in-page anchors
        if (text === abs) return; // text already is the url
        if (seen.has(abs)) return; // dedupe hrefs (keep first)
        seen.add(abs);
        n++;
        a.replaceWith(document.createTextNode(` [${text}](${abs}) `));
      });
    }
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  };

  let root: Element = document.body;
  if (mode === 'article') {
    const articles = document.querySelectorAll('article');
    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    if (articles.length === 1) {
      root = articles[0];
    } else if (articles.length > 1) {
      // Feed pages (X/Threads/Mastodon) wrap every post AND reply in its own
      // <article>; the first one is just the head post. Use the shared
      // container so replies are included, in DOM order.
      root = main || document.body;
    } else if (main) {
      root = main;
    } else {
      // ponytail: paragraph-density heuristic for the largest coherent text block.
      // Upgrade to a real readability port only if extraction quality complaints show up.
      let best: Element | null = null;
      let bestScore = 0;
      document.querySelectorAll('div,section,article,main').forEach(el => {
        let score = 0;
        el.querySelectorAll(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > ul, :scope > ol').forEach(
          p => {
            score += (p.textContent || '').length;
          },
        );
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      });
      if (best && bestScore > 200) root = best;
    }
  }

  const full = clean(root);
  const truncated = full.length > maxChars;
  return {
    title: document.title,
    url: location.href,
    content: truncated ? full.slice(0, maxChars) : full,
    truncated,
  };
}

/** Current selection text. Runs in the page. */
export function extractSelection(): ExtractedSelection {
  const sel = window.getSelection();
  return {
    title: document.title,
    url: location.href,
    selection: sel ? sel.toString().replace(/\s+/g, ' ').trim() : '',
  };
}

export interface SnapshotRow {
  index: number;
  tag: string;
  type: string;
  label: string;
}

export interface InteractiveSnapshot {
  title: string;
  url: string;
  elements: SnapshotRow[];
}

/**
 * Tag visible interactive elements with data-mcp-idx and return a compact list.
 * Attributes persist in the page so a later doInteract() can target by index
 * across executeScript round trips. Runs in the page — self-contained.
 */
export function snapshotInteractive(maxElements: number, query: string, scope: string): InteractiveSnapshot {
  // Clear stale indices from any previous snapshot before re-tagging.
  document.querySelectorAll('[data-mcp-idx]').forEach(el => el.removeAttribute('data-mcp-idx'));
  let root: Document | Element = document;
  if (scope) {
    try {
      root = document.querySelector(scope) || document;
    } catch (e) {
      root = document;
    }
  }
  const sel =
    'a[href],button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[contenteditable="true"]';
  const isVisible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  // Role-aware type: prefer explicit ARIA role, else map the tag/input to an implicit role.
  const typeOf = (el: Element): string => {
    const role = el.getAttribute('role');
    if (role) return role;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.hasAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'input') return el.getAttribute('type') || 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (el.getAttribute('contenteditable') === 'true') return 'textbox';
    return el.getAttribute('type') || '';
  };
  const q = (query || '').toLowerCase();
  const rows: SnapshotRow[] = [];
  let i = 0;
  root.querySelectorAll(sel).forEach(el => {
    if (i >= maxElements || !isVisible(el)) return;
    const label = (
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      (el as HTMLInputElement).value ||
      el.textContent ||
      el.getAttribute('name') ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    if (q && label.toLowerCase().indexOf(q) < 0) return;
    el.setAttribute('data-mcp-idx', String(i));
    rows.push({ index: i, tag: el.tagName.toLowerCase(), type: typeOf(el), label });
    i++;
  });
  return { title: document.title, url: location.href, elements: rows };
}

export interface InteractResult {
  ok: boolean;
  note: string;
  url: string;
  title: string;
  urlChanged?: boolean;
  value?: string;
}

/**
 * Perform one interaction on an element targeted by data-mcp-idx or CSS selector.
 * Runs in the page — self-contained, no imports/closures.
 */
export function doInteract(
  action: string,
  index: number | string | null,
  selector: string | null,
  value: string | null,
  modifiers: string[] | null,
  getKind: string | null,
  attrName: string | null,
): InteractResult {
  const before = location.href;
  let el: Element | null = null;
  if (index != null && index !== '') el = document.querySelector('[data-mcp-idx="' + index + '"]');
  if (!el && selector) {
    try {
      el = document.querySelector(selector);
    } catch (e) {
      /* invalid selector */
    }
  }
  // Elements NOT required for: scroll, press (falls back to activeElement/body), get:exists.
  const need = !(action === 'scroll' || action === 'press' || action === 'press_enter' || (action === 'get' && getKind === 'exists'));
  if (need && !el) {
    return {
      ok: false,
      note: 'No element matched index/selector. Run browser_snapshot_tab first.',
      url: before,
      title: document.title,
    };
  }
  const fire = (n: EventTarget, t: string) => n.dispatchEvent(new Event(t, { bubbles: true }));
  try {
    if (action === 'click') {
      (el as HTMLElement).scrollIntoView({ block: 'center' });
      (el as HTMLElement).click();
    } else if (action === 'fill') {
      (el as HTMLElement).focus();
      if ('value' in (el as HTMLElement)) {
        (el as HTMLInputElement).value = value ?? '';
        fire(el as EventTarget, 'input');
        fire(el as EventTarget, 'change');
      } else {
        (el as HTMLElement).textContent = value ?? '';
        fire(el as EventTarget, 'input');
      }
    } else if (action === 'select') {
      const v = value ?? '';
      const select = el as HTMLSelectElement;
      const opt = Array.from(select.options || []).find(o => o.value === v || o.textContent!.trim() === v);
      if (opt) {
        select.value = opt.value;
        fire(select, 'change');
      } else {
        return { ok: false, note: 'No matching option "' + v + '".', url: before, title: document.title };
      }
    } else if (action === 'scroll') {
      const to =
        value === 'top' ? 0 : value === 'bottom' ? document.body.scrollHeight : parseInt(value ?? '', 10) || 600;
      window.scrollTo({
        top: value === 'top' || value === 'bottom' ? to : window.scrollY + to,
        behavior: 'instant' as ScrollBehavior,
      });
    } else if (action === 'hover') {
      (el as HTMLElement).scrollIntoView({ block: 'center' });
      ['pointerover', 'mouseover', 'pointerenter', 'mouseenter', 'mousemove'].forEach(t =>
        el!.dispatchEvent(new MouseEvent(t, { bubbles: true })),
      );
    } else if (action === 'check' || action === 'uncheck') {
      const want = action === 'check';
      if ('checked' in (el as HTMLElement)) {
        if ((el as HTMLInputElement).checked !== want) {
          (el as HTMLInputElement).checked = want;
          fire(el as EventTarget, 'input');
          fire(el as EventTarget, 'change');
        }
      } else {
        return { ok: false, note: 'Element is not checkable.', url: before, title: document.title };
      }
    } else if (action === 'get') {
      let v = '';
      if (getKind === 'exists') v = String(!!el);
      else if (!el) return { ok: false, note: 'No element matched.', url: before, title: document.title };
      else if (getKind === 'value') v = ('value' in (el as HTMLElement) ? (el as HTMLInputElement).value : el.textContent || '').trim();
      else if (getKind === 'attr') v = el.getAttribute(attrName || '') || '';
      else v = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
      return { ok: true, note: 'get:' + getKind, value: v, url: before, title: document.title };
    } else if (action === 'press' || action === 'press_enter') {
      const key = action === 'press_enter' ? 'Enter' : value || 'Enter';
      const tgt = (el as HTMLElement) || (document.activeElement as HTMLElement) || document.body;
      const mods = modifiers || [];
      const opts: KeyboardEventInit = {
        key,
        code: key.length === 1 ? 'Key' + key.toUpperCase() : key,
        keyCode: key === 'Enter' ? 13 : key === 'Tab' ? 9 : key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0,
        bubbles: true,
        ctrlKey: mods.indexOf('ctrl') >= 0,
        shiftKey: mods.indexOf('shift') >= 0,
        altKey: mods.indexOf('alt') >= 0,
        metaKey: mods.indexOf('meta') >= 0,
      };
      if (tgt.focus) tgt.focus();
      ['keydown', 'keypress', 'keyup'].forEach(t => tgt.dispatchEvent(new KeyboardEvent(t, opts)));
      if (key === 'Enter') {
        const form = (tgt as HTMLInputElement).form;
        if (form && typeof form.requestSubmit === 'function') {
          try {
            form.requestSubmit();
          } catch (e) {
            /* form submission blocked */
          }
        }
      }
    }
  } catch (e) {
    return {
      ok: false,
      note: 'Interaction error: ' + (e && (e as Error).message),
      url: location.href,
      title: document.title,
    };
  }
  const label = el
    ? (el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 60)
    : '';
  return {
    ok: true,
    note: action + (el ? ' on [' + (index ?? selector) + '] ' + label : ''),
    url: location.href,
    urlChanged: location.href !== before,
    title: document.title,
  };
}

/**
 * Poll the page for a selector/text/url_substring match up to a deadline.
 * Runs in the page — self-contained, no imports/closures. ms/load waits are
 * handled service-worker-side and never reach this func.
 */
export async function waitInPage(
  kind: string,
  arg: string,
  timeoutMs: number,
): Promise<{ ok: boolean; matched: boolean; note: string; url: string; title: string }> {
  const deadline = Date.now() + Math.min(Math.max(timeoutMs || 6000, 100), 20000);
  const test = (): boolean => {
    try {
      if (kind === 'selector') return !!document.querySelector(arg);
      if (kind === 'text') return (document.body.innerText || '').toLowerCase().indexOf((arg || '').toLowerCase()) >= 0;
      if (kind === 'url_substring') return location.href.indexOf(arg || '') >= 0;
    } catch (e) {
      return false;
    }
    return false;
  };
  while (Date.now() < deadline) {
    if (test()) return { ok: true, matched: true, note: 'matched ' + kind, url: location.href, title: document.title };
    await new Promise(r => setTimeout(r, 150));
  }
  return {
    ok: false,
    matched: false,
    note: 'timeout waiting for ' + kind + ' "' + arg + '"',
    url: location.href,
    title: document.title,
  };
}
