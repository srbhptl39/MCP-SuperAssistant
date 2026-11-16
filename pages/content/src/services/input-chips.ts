import type { AdapterPlugin, ChipAnchors } from '../plugins/plugin-types';
import { createLogger } from '@extension/shared/lib/logger';
import { useToolStore } from '../stores/tool.store';
import { generateBrowserPrimer } from '../components/sidebar/Instructions/instructionGeneratorCompact';
import { telemetry } from '../utils/telemetry';

const logger = createLogger('InputChips');

// Set true the first time an 'instructions' chip is flushed this page session. Once the model has
// the full instructions, the browser primer is redundant, so we suppress it for the rest of the session.
let instructionsFlushedThisSession = false;

// Per-host refinements over the sampled theme (font/radius only — same idea as render_prescript's
// HOST_OVERRIDES). Sampling is the base; these beat the sampled defaults where a host clashes.
const CHIP_HOST_OVERRIDES: Record<string, { font?: string; radius?: string }> = {
  'gemini.google.com': { font: "'Google Sans', Roboto, sans-serif", radius: '14px' },
  'aistudio.google.com': { font: "'Google Sans', Roboto, sans-serif", radius: '12px' },
  'www.perplexity.ai': { font: "'FK Grotesk Neue', ui-sans-serif, sans-serif", radius: '10px' },
  'perplexity.ai': { font: "'FK Grotesk Neue', ui-sans-serif, sans-serif", radius: '10px' },
  'openrouter.ai': { radius: '8px' },
};

// --- host color sampling (native theming) -------------------------------
// ponytail: naive rgb(a) parser — getComputedStyle always returns rgb()/rgba(), never hex/hsl.
function parseColor(c: string): [number, number, number, number] | null {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map(s => parseFloat(s.trim()));
  if (parts.length < 3 || parts.some(n => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

/** Walk up from el until a non-transparent background is found; returns an rgb() string. */
function resolveBackground(el: HTMLElement | null): string | null {
  let node: HTMLElement | null = el;
  for (let i = 0; node && i < 12; i++) {
    const parsed = parseColor(getComputedStyle(node).backgroundColor);
    if (parsed && parsed[3] > 0.05) return `rgb(${parsed[0]}, ${parsed[1]}, ${parsed[2]})`;
    node = node.parentElement;
  }
  return null;
}

function isDarkColor([r, g, b]: [number, number, number, number]): boolean {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/** Nudge a color toward white (percent > 0) or black (percent < 0). */
function shift(rgb: [number, number, number, number], percent: number): string {
  const f = (c: number) => (percent >= 0 ? c + (255 - c) * (percent / 100) : c * (1 + percent / 100));
  return `rgb(${Math.round(f(rgb[0]))}, ${Math.round(f(rgb[1]))}, ${Math.round(f(rgb[2]))})`;
}

export type ChipSource = 'instructions' | 'tool-result' | 'capture' | 'tab-content' | 'unknown';

interface Chip {
  id: string;
  label: string;
  text: string;
  source: ChipSource;
}

interface CaptureOptions {
  targetElement?: HTMLElement;
  source?: ChipSource;
  label?: string;
}

/** Derive a human label for a chip from its source hint, falling back to text heuristics. */
function labelFor(source: ChipSource | undefined, text: string): string {
  switch (source) {
    case 'instructions':
      return 'MCP Instructions';
    case 'tool-result': {
      const m = text.match(/<function_result call_id="(\d+)"/);
      return m ? `Tool result #${m[1]}` : 'Tool result';
    }
    case 'capture': {
      const m = text.match(/^Page: (.+)$/m);
      return m ? m[1].slice(0, 40) : 'Captured page';
    }
    case 'tab-content':
      return 'Browser tabs';
    case 'unknown':
    default: {
      // Heuristic chain (sidebar + render_prescript callers can't pass a source).
      const lower = text.toLowerCase();
      if (lower.includes('[start fresh session from here]') || lower.includes('<system>')) return 'MCP Instructions';
      const fr = text.match(/<function_result call_id="(\d+)"/);
      if (fr) return `Tool result #${fr[1]}`;
      const tabs = text.match(/^Attached (\d+) browser tabs?/);
      if (tabs) return `${tabs[1]} browser tab${tabs[1] === '1' ? '' : 's'}`;
      return 'Injected text';
    }
  }
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

const ICONS: Record<ChipSource, string> = {
  instructions:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="18" r="2" fill="currentColor" stroke="none"/></svg>',
  'tool-result':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 8 9 12 5 16"/><line x1="12" y1="16" x2="18" y2="16"/></svg>',
  'tab-content':
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/></svg>',
  capture:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3"/></svg>',
  unknown:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.5l-9.2 9.2a4 4 0 0 1-5.7-5.7L15 3.2a2.5 2.5 0 0 1 3.5 3.5L9.4 15.8a1 1 0 0 1-1.4-1.4l8-8"/></svg>',
};

const EYE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';

// rgb triples so CSS can tint them: rgb(var(--accent) / <alpha>).
const ACCENTS: Record<ChipSource, string> = {
  instructions: '99 102 241', // indigo
  'tool-result': '16 185 129', // emerald
  'tab-content': '14 165 233', // sky
  capture: '245 158 11', // amber
  unknown: '100 116 139', // slate
};

// Defaults are neutral light-theme values; the sampled host tokens (--host-*, --chip-*) set on the
// shadow host at mount override them so chips read as the site's own attachment pills. The per-kind
// accent survives only in the roundel + a 2px inset left hint.
const CHIP_STYLES = `
  :host {
    --host-font: system-ui, -apple-system, sans-serif;
    --host-font-size: 13px;
    --host-fg: #1f1f1f;
    --host-radius: 10px;
    --chip-bg: #f1f3f4;
    --chip-bg-hover: #e8eaed;
    --chip-border: rgba(0, 0, 0, 0.14);
    --chip-muted: rgba(0, 0, 0, 0.55);
  }
  .bar { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 0; position: relative; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px; max-width: 260px;
    font-family: var(--host-font);
    border-radius: var(--host-radius); padding: 3px 6px 3px 5px; cursor: pointer;
    border: 1px solid var(--chip-border);
    background: var(--chip-bg); color: var(--host-fg);
    box-shadow: inset 2px 0 0 rgb(var(--accent) / 0.55);
    transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
  }
  .chip:hover {
    background: var(--chip-bg-hover);
    box-shadow: inset 2px 0 0 rgb(var(--accent) / 0.85), 0 1px 4px rgba(0, 0, 0, 0.12);
  }
  .chip-roundel {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; flex-shrink: 0; border-radius: 999px;
    background: rgb(var(--accent) / 0.16); color: rgb(var(--accent));
  }
  .chip-roundel svg { width: 14px; height: 14px; display: block; }
  .chip-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.2; }
  .chip-label {
    font-size: min(var(--host-font-size), 12px); font-weight: 500; color: var(--host-fg);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .chip-detail { font-size: 10px; color: var(--chip-muted); }
  .chip-eye, .chip-x {
    display: inline-flex; align-items: center; justify-content: center;
    width: 18px; height: 18px; flex-shrink: 0; border-radius: 999px;
    color: var(--chip-muted); cursor: pointer;
    transition: opacity 150ms ease, background 150ms ease, color 150ms ease;
  }
  .chip-eye { opacity: 0; }
  .chip:hover .chip-eye { opacity: 1; }
  .chip-eye svg { width: 14px; height: 14px; display: block; }
  .chip-eye:hover, .chip-x:hover { background: rgb(var(--accent) / 0.18); color: rgb(var(--accent)); }
  .chip-x { font-size: 15px; font-weight: 700; line-height: 1; opacity: 0.55; }
  .chip:hover .chip-x { opacity: 1; }
`;

// The preview lives in a SEPARATE host appended to document.body (position:fixed relative to
// the viewport) — the chip bar host is prepended into the site's input container, which on
// Gemini clips overflow, so a popover rendered there never paints.
const OVERLAY_STYLES = `
  :host {
    --host-font: system-ui, -apple-system, sans-serif;
    --host-fg: #1f1f1f;
    --host-radius: 10px;
    --chip-bg: #f1f3f4;
    --chip-border: rgba(0, 0, 0, 0.14);
    --chip-muted: rgba(0, 0, 0, 0.55);
    --popover-bg: #ffffff;
  }
  .preview {
    position: fixed; z-index: 2147483646; max-width: 440px;
    border-radius: max(var(--host-radius), 10px); overflow: hidden;
    border: 1px solid var(--chip-border);
    background: var(--popover-bg); color: var(--host-fg);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
    font-family: var(--host-font);
  }
  .preview-header {
    display: flex; align-items: center; gap: 8px; padding: 8px 10px;
    border-bottom: 1px solid var(--chip-border);
    background: var(--chip-bg);
  }
  .preview-roundel {
    display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; flex-shrink: 0; border-radius: 999px;
    background: rgb(var(--accent) / 0.16); color: rgb(var(--accent));
  }
  .preview-roundel svg { width: 14px; height: 14px; display: block; }
  .preview-title { font-size: 12px; font-weight: 600; color: var(--host-fg); }
  .preview-count { font-size: 11px; color: var(--chip-muted); }
  .preview-close {
    margin-left: auto; display: inline-flex; align-items: center; justify-content: center;
    width: 20px; height: 20px; border-radius: 999px;
    font-size: 15px; font-weight: 700; line-height: 1;
    color: var(--chip-muted); cursor: pointer; transition: background 150ms ease, color 150ms ease;
  }
  .preview-close:hover { background: rgb(var(--accent) / 0.18); color: rgb(var(--accent)); }
  .preview-body {
    max-height: 240px; overflow: auto; white-space: pre-wrap;
    font: 12px monospace; padding: 10px; color: var(--host-fg);
  }
`;

class InputChipManager {
  private chips: Chip[] = [];
  private adapter: AdapterPlugin | null = null;
  private flushing = false;
  private host: HTMLElement | null = null;
  private shadow: ShadowRoot | null = null;
  private bar: HTMLElement | null = null;
  private overlayHost: HTMLElement | null = null;
  private overlayShadow: ShadowRoot | null = null;
  private watchdog: number | null = null;
  private listenersAttached = false;
  private openPreviewChipId: string | null = null;
  private themeVars: Record<string, string> = {};

  /** Called from pilot insertText. Returns true if the payload was captured as a chip (→ caller returns early). */
  tryCapture(adapter: AdapterPlugin, text: string, options?: CaptureOptions): boolean {
    if (this.flushing) return false;
    const anchors = adapter.getChipAnchors?.();
    if (!anchors) return false;
    // Defensive: an explicit non-input target means a caller wants a specific element — leave it raw.
    if (options?.targetElement && options.targetElement !== anchors.input && !anchors.input.contains(options.targetElement)) {
      return false;
    }
    this.chips.push({
      id: crypto.randomUUID(),
      label: options?.label ?? labelFor(options?.source, text),
      text,
      source: options?.source ?? 'unknown',
    });
    this.adapter = adapter;
    this.ensureUI(anchors);
    this.ensureListeners();
    this.ensureWatchdog();
    telemetry('chip');
    return true;
  }

  /** Called from pilot submitForm (first line). Merges chips into the input via raw insertText, clears them, settles 300ms. */
  async flushBeforeSubmit(adapter: AdapterPlugin): Promise<void> {
    if (!this.chips.length || adapter !== this.adapter) return;

    const flushed = this.chips;
    const payload = this.composePayload(flushed);
    this.chips = [];
    this.renderBar(); // bar empties immediately

    this.flushing = true;
    try {
      const ok = await adapter.insertText?.(payload);
      if (ok === false) {
        // Don't silently lose the payload — restore the chips so the user can retry.
        logger.error('Chip flush insertText returned false; restoring chips');
        this.chips = flushed;
        this.renderBar();
        return;
      }
      // Mark instructions as delivered for the session only after a successful insert, so the
      // browser primer stops appearing once the model has the real instructions.
      if (flushed.some(c => c.source === 'instructions')) instructionsFlushedThisSession = true;
      await new Promise(r => setTimeout(r, 300));
    } finally {
      this.flushing = false;
    }

    if (!this.chips.length) {
      this.removeListeners();
      this.stopWatchdog();
      this.removeUI();
    }
  }

  /**
   * Compose the appended payload with a fixed, deterministic section order regardless of chip
   * insertion order. The user's typed text physically stays FIRST in the input (Lexical/Perplexity
   * can't be reliably cleared), so this is prefixed with a divider and appended after it via insertText.
   * Section order: 1) instructions, 2) browser primer (conditional), 3) context (tab-content then
   * capture), 4) tool-results. Within a section: insertion order.
   */
  private composePayload(flushed: Chip[]): string {
    const bySource = (s: ChipSource): Chip[] => flushed.filter(c => c.source === s);
    const sections: string[] = [];

    const instructions = bySource('instructions');
    if (instructions.length) sections.push(instructions.map(c => c.text).join('\n\n'));

    // Part 3: browser primer — only when the model got page/tab content but no instructions (this
    // flush and none earlier this session), so it knows the browser tools exist.
    const hasContext = flushed.some(c => c.source === 'tab-content' || c.source === 'capture');
    if (hasContext && !instructions.length && !instructionsFlushedThisSession) {
      const state = useToolStore.getState();
      const enabled = state.availableTools.filter(t => state.isToolEnabled(t.name));
      const primer = generateBrowserPrimer(enabled);
      if (primer) sections.push(primer);
    }

    const context = [...bySource('tab-content'), ...bySource('capture')];
    if (context.length) sections.push(context.map(c => `[Attached: ${c.label}]\n${c.text}`).join('\n\n'));

    const toolResults = bySource('tool-result');
    if (toolResults.length) sections.push(toolResults.map(c => c.text).join('\n\n'));

    // ponytail: 'unknown'-source chips aren't in the spec's 4 sections but must not be dropped —
    // append them last in insertion order.
    const other = bySource('unknown');
    if (other.length) sections.push(other.map(c => c.text).join('\n\n'));

    const body = sections.join('\n\n');
    // Single neutral divider so the model can tell the typed query from the appended context.
    return body ? `\n\n---\n${body}` : '';
  }

  /** Called from pilot deactivate()/cleanup(): clears chips, removes UI + listeners + watchdog. */
  teardown(): void {
    this.chips = [];
    this.openPreviewChipId = null;
    this.removeUI();
    this.removeListeners();
    this.stopWatchdog();
    this.adapter = null;
    this.flushing = false;
  }

  // --- UI ---------------------------------------------------------------

  private ensureUI(anchors: ChipAnchors): void {
    if (!this.host) {
      const host = document.createElement('div');
      host.id = 'mcp-input-chips-host';
      const shadow = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = CHIP_STYLES;
      shadow.appendChild(style);
      const bar = document.createElement('div');
      bar.className = 'bar';
      shadow.appendChild(bar);
      this.host = host;
      this.shadow = shadow;
      this.bar = bar;
    }
    if (this.host.parentElement !== anchors.container) {
      anchors.container.prepend(this.host);
    }
    this.applyHostTheme(anchors);
    this.renderBar();
  }

  /**
   * Sample the host site's look from the input + its container and expose it as CSS custom props on
   * the chip host (which inherit into the shadow DOM). Runs only at mount / watchdog re-mount — no
   * polling. Theme (dark/light) comes from the sampled background luminance, NOT prefers-color-scheme,
   * because hosts force their own theme independent of the OS.
   */
  private applyHostTheme(anchors: ChipAnchors): void {
    if (!this.host) return;
    const csInput = getComputedStyle(anchors.input);
    const csContainer = getComputedStyle(anchors.container);

    const surfaceStr = resolveBackground(anchors.container) ?? resolveBackground(anchors.input) ?? 'rgb(255, 255, 255)';
    const surface = parseColor(surfaceStr) ?? [255, 255, 255, 1];
    const dark = isDarkColor(surface);
    const fgStr = csInput.color || csContainer.color || (dark ? 'rgb(227, 227, 227)' : 'rgb(31, 31, 31)');
    const fg = parseColor(fgStr) ?? (dark ? [227, 227, 227, 1] : [31, 31, 31, 1]);

    let font = csInput.fontFamily || csContainer.fontFamily || 'system-ui, -apple-system, sans-serif';
    const fontSize = csInput.fontSize && csInput.fontSize !== '0px' ? csInput.fontSize : '13px';
    // Containers are often full pills (9999px); clamp so chips read as rounded rects, not lozenges.
    const rawRadius = parseFloat(csContainer.borderRadius) || 0;
    let radius = `${Math.min(Math.max(rawRadius, 6), 14)}px`;

    const override = CHIP_HOST_OVERRIDES[location.hostname];
    if (override?.font) font = override.font;
    if (override?.radius) radius = override.radius;

    this.themeVars = {
      '--host-font': font,
      '--host-font-size': fontSize,
      '--host-fg': fgStr,
      '--host-surface': surfaceStr,
      '--host-radius': radius,
      '--chip-bg': shift(surface, dark ? 6 : -6),
      '--chip-bg-hover': shift(surface, dark ? 12 : -11),
      '--chip-border': `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, 0.14)`,
      '--chip-muted': `rgba(${fg[0]}, ${fg[1]}, ${fg[2]}, 0.62)`,
      '--popover-bg': shift(surface, dark ? 8 : 0),
    };
    this.applyThemeVars(this.host);
    if (this.overlayHost) this.applyThemeVars(this.overlayHost);
  }

  private applyThemeVars(el: HTMLElement): void {
    for (const [k, v] of Object.entries(this.themeVars)) el.style.setProperty(k, v);
  }

  private renderBar(): void {
    if (!this.bar) return;
    if (this.openPreviewChipId && !this.chips.some(c => c.id === this.openPreviewChipId)) {
      this.openPreviewChipId = null;
      this.removeOutsideClose();
    }
    this.bar.textContent = '';
    for (const chip of this.chips) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'chip';
      pill.dataset.chipId = chip.id;
      pill.style.setProperty('--accent', ACCENTS[chip.source]);
      pill.setAttribute('aria-haspopup', 'dialog');
      pill.setAttribute('aria-expanded', String(this.openPreviewChipId === chip.id));

      const roundel = document.createElement('span');
      roundel.className = 'chip-roundel';
      roundel.innerHTML = ICONS[chip.source];
      pill.appendChild(roundel);

      const text = document.createElement('span');
      text.className = 'chip-text';
      const label = document.createElement('span');
      label.className = 'chip-label';
      label.textContent = chip.label;
      const detail = document.createElement('span');
      detail.className = 'chip-detail';
      detail.textContent = `${formatCount(chip.text.length)} chars`;
      text.appendChild(label);
      text.appendChild(detail);
      pill.appendChild(text);

      // Eye affordance: fades in on hover, opens the same preview as clicking the pill.
      const eye = document.createElement('span');
      eye.className = 'chip-eye';
      eye.setAttribute('role', 'button');
      eye.setAttribute('aria-label', 'Preview contents');
      eye.innerHTML = EYE_ICON;
      eye.addEventListener('click', e => {
        e.stopPropagation();
        this.togglePreview(chip.id);
      });
      pill.appendChild(eye);

      // span[role=button] rather than a nested <button> (invalid HTML) — same accessible action.
      const x = document.createElement('span');
      x.className = 'chip-x';
      x.setAttribute('role', 'button');
      x.setAttribute('aria-label', `Remove ${chip.label}`);
      x.textContent = '×';
      x.addEventListener('click', e => {
        e.stopPropagation();
        this.removeChip(chip.id);
      });
      pill.appendChild(x);

      pill.addEventListener('click', e => {
        e.stopPropagation();
        this.togglePreview(chip.id);
      });
      this.bar.appendChild(pill);
    }
    this.renderPreview();
  }

  private renderPreview(): void {
    this.overlayShadow?.querySelector('.preview')?.remove();
    if (!this.openPreviewChipId) {
      this.removeOverlay();
      return;
    }
    const chip = this.chips.find(c => c.id === this.openPreviewChipId);
    const pill = this.bar?.querySelector<HTMLElement>(`[data-chip-id="${this.openPreviewChipId}"]`);
    if (!chip || !pill) return;
    this.ensureOverlay();
    const dialog = document.createElement('div');
    dialog.className = 'preview';
    dialog.setAttribute('role', 'dialog');
    dialog.style.setProperty('--accent', ACCENTS[chip.source]);

    const header = document.createElement('div');
    header.className = 'preview-header';
    const roundel = document.createElement('span');
    roundel.className = 'preview-roundel';
    roundel.innerHTML = ICONS[chip.source];
    const title = document.createElement('span');
    title.className = 'preview-title';
    title.textContent = chip.label;
    const count = document.createElement('span');
    count.className = 'preview-count';
    count.textContent = `${formatCount(chip.text.length)} chars`;
    const close = document.createElement('span');
    close.className = 'preview-close';
    close.setAttribute('role', 'button');
    close.setAttribute('aria-label', 'Close preview');
    close.textContent = '×';
    close.addEventListener('click', e => {
      e.stopPropagation();
      this.togglePreview(chip.id);
    });
    header.append(roundel, title, count, close);

    const body = document.createElement('div');
    body.className = 'preview-body';
    body.textContent = chip.text;

    dialog.append(header, body);
    this.overlayShadow!.appendChild(dialog);
    this.positionPreview(dialog, pill.getBoundingClientRect());
  }

  /** Place the fixed-positioned popover above the chip if it fits, else below; clamp to viewport. */
  private positionPreview(dialog: HTMLElement, anchor: DOMRect): void {
    const margin = 8;
    const gap = 4;
    const { width, height } = dialog.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = Math.min(anchor.left, vw - width - margin);
    left = Math.max(margin, left);

    const spaceAbove = anchor.top;
    const spaceBelow = vh - anchor.bottom;
    let top =
      spaceAbove >= height + gap || spaceAbove >= spaceBelow
        ? anchor.top - height - gap
        : anchor.bottom + gap;
    top = Math.max(margin, Math.min(top, vh - height - margin));

    dialog.style.left = `${left}px`;
    dialog.style.top = `${top}px`;
  }

  private ensureOverlay(): void {
    if (this.overlayHost) return;
    const host = document.createElement('div');
    host.id = 'mcp-input-chips-overlay';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = OVERLAY_STYLES;
    shadow.appendChild(style);
    document.body.appendChild(host);
    this.overlayHost = host;
    this.overlayShadow = shadow;
    this.applyThemeVars(host); // inherit the same sampled tokens as the chip bar
  }

  private removeOverlay(): void {
    this.overlayHost?.remove();
    this.overlayHost = null;
    this.overlayShadow = null;
  }

  private togglePreview(chipId: string): void {
    this.openPreviewChipId = this.openPreviewChipId === chipId ? null : chipId;
    if (this.openPreviewChipId) this.ensureOutsideClose();
    else this.removeOutsideClose();
    this.renderBar();
  }

  private removeChip(chipId: string): void {
    this.chips = this.chips.filter(c => c.id !== chipId);
    if (this.openPreviewChipId === chipId) {
      this.openPreviewChipId = null;
      this.removeOutsideClose();
    }
    if (!this.chips.length) {
      this.teardown();
      return;
    }
    this.renderBar();
  }

  private removeUI(): void {
    this.removeOutsideClose();
    this.removeOverlay();
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.bar = null;
  }

  // --- outside-click close for preview ----------------------------------

  private outsideClose = (e: Event): void => {
    if (!this.openPreviewChipId) return;
    const path = e.composedPath();
    // The popover now lives in a separate overlay host — a click inside it (scroll/select) is not "outside".
    const inside = (this.host && path.includes(this.host)) || (this.overlayHost && path.includes(this.overlayHost));
    if (!inside) {
      this.openPreviewChipId = null;
      this.removeOutsideClose();
      this.renderBar();
    }
  };

  // Document-level capture Escape: focus rarely lands in the chip host after a mouse click, so
  // a host-scoped listener never fires. Only swallow the key while a popover is actually open.
  private onEscKeydown = (e: KeyboardEvent): void => {
    if (!this.openPreviewChipId || e.key !== 'Escape') return;
    e.stopPropagation();
    this.openPreviewChipId = null;
    this.removeOutsideClose();
    this.renderBar();
  };

  private ensureOutsideClose(): void {
    document.addEventListener('click', this.outsideClose, true);
    document.addEventListener('keydown', this.onEscKeydown, true);
  }

  private removeOutsideClose(): void {
    document.removeEventListener('click', this.outsideClose, true);
    document.removeEventListener('keydown', this.onEscKeydown, true);
  }

  // --- submit interception (user-initiated) -----------------------------

  private onKeydown = (e: KeyboardEvent): void => {
    if (!e.isTrusted || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    if (!this.chips.length || this.flushing || !this.adapter) return;
    const anchors = this.adapter.getChipAnchors?.();
    if (!anchors) return;
    const target = e.target as Node | null;
    if (!target || !anchors.input.contains(target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void this.adapter.submitForm?.();
  };

  private onClick = (e: MouseEvent): void => {
    if (!e.isTrusted) return;
    if (!this.chips.length || this.flushing || !this.adapter) return;
    const anchors = this.adapter.getChipAnchors?.();
    if (!anchors) return;
    const target = e.target as Element | null;
    if (!target?.closest?.(anchors.submitButtonSelector)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void this.adapter.submitForm?.();
  };

  private ensureListeners(): void {
    if (this.listenersAttached) return;
    document.addEventListener('keydown', this.onKeydown, true);
    document.addEventListener('click', this.onClick, true);
    this.listenersAttached = true;
  }

  private removeListeners(): void {
    if (!this.listenersAttached) return;
    document.removeEventListener('keydown', this.onKeydown, true);
    document.removeEventListener('click', this.onClick, true);
    this.listenersAttached = false;
  }

  // --- watchdog: re-anchor the bar across editor re-renders / SPA nav ----

  private ensureWatchdog(): void {
    if (this.watchdog != null) return;
    this.watchdog = window.setInterval(() => {
      if (!this.chips.length) return;
      const anchors = this.adapter?.getChipAnchors?.();
      if (!anchors) {
        // Input not on page right now — drop the UI but keep chips for its return.
        this.removeUI();
        return;
      }
      if (!this.host?.isConnected || this.host.parentElement !== anchors.container) {
        this.ensureUI(anchors);
      }
    }, 800);
  }

  private stopWatchdog(): void {
    if (this.watchdog != null) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }
}

export const inputChips = new InputChipManager();
