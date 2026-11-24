/**
 * Rich-text handling for work item fields and comments: a strict allow-list
 * cleaner (no new dependency, uses the browser's DOMParser), plus finding and
 * rewriting image links so inline images can be re-uploaded to the target.
 */

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'del',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strike',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
  'font',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'title']),
  img: new Set(['src', 'alt', 'title', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
  font: new Set(['color']),
};

const SAFE_URL = /^(https?:|mailto:|#|\/)/i;

/** Keep formatting, drop scripts, handlers, styles and anything not on the allow-list. */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (el: Element) => {
    for (const child of [...el.children]) {
      const tag = child.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        if (
          [
            'script',
            'style',
            'iframe',
            'object',
            'embed',
            'link',
            'meta',
            'form',
            'input',
            'button',
            'svg',
            'math',
          ].includes(tag)
        ) {
          child.remove();
        } else {
          // Unknown wrapper: keep its content, drop the tag.
          walk(child);
          child.replaceWith(...child.childNodes);
        }
        continue;
      }
      for (const attr of [...child.attributes]) {
        const name = attr.name.toLowerCase();
        const allowed = ALLOWED_ATTRS[tag]?.has(name);
        if (!allowed) child.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src') && !SAFE_URL.test(attr.value.trim()))
          child.removeAttribute(attr.name);
      }
      if (tag === 'a') {
        child.setAttribute('rel', 'noreferrer');
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** Plain text (for titles built from HTML, or length checks). */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return doc.body.textContent ?? '';
}

/** Every <img src> in the HTML. */
export function imageUrls(html: string): string[] {
  if (!html || !html.includes('<img')) return [];
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  return [...doc.querySelectorAll('img[src]')].map((i) => i.getAttribute('src')!).filter(Boolean);
}

/** Swap image sources using `map`; images not in the map are left as they are. */
export function replaceImageUrls(html: string, map: Map<string, string>): string {
  if (map.size === 0 || !html.includes('<img')) return html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  for (const img of doc.querySelectorAll('img[src]')) {
    const to = map.get(img.getAttribute('src')!);
    if (to) img.setAttribute('src', to);
  }
  return doc.body.innerHTML;
}

export function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** The "Migrated from" footer: original metadata and fields with no target. */
export function migrationFooter(rows: [string, string][]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map(([k, v]) => `<tr><td><b>${escapeHtml(k)}</b></td><td>${escapeHtml(v)}</td></tr>`)
    .join('');
  return `<hr><p><i>Migrated with ToolDock</i></p><table>${body}</table>`;
}
