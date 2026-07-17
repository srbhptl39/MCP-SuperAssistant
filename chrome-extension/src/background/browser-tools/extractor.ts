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
export function extractReadableContent(mode: 'article' | 'full_text', maxChars: number): ExtractedContent {
  const stripSelectors = 'script,style,noscript,nav,header,footer,aside,svg,iframe,form,button,template';
  const clean = (root: Element): string => {
    const clone = root.cloneNode(true) as Element;
    clone.querySelectorAll(stripSelectors).forEach(n => n.remove());
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  };

  let root: Element = document.body;
  if (mode === 'article') {
    const article = document.querySelector('article');
    const main = document.querySelector('main') || document.querySelector('[role="main"]');
    if (article) {
      root = article;
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
