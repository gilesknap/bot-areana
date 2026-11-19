/**
 * One Python highlighter for the editor and for static snippets (briefing, API reference),
 * using CSS classes (tok-*) coloured in styles.css from the Arena.dc.html code pane.
 */
import { highlightCode, tagHighlighter, tags as t } from '@lezer/highlight';
import { parser as pythonParser } from '@lezer/python';

export const pyHighlighter = tagHighlighter([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword, t.operatorKeyword, t.self], class: 'tok-kw' },
  { tag: [t.bool, t.null, t.number], class: 'tok-num' },
  { tag: [t.string, t.special(t.string)], class: 'tok-str' },
  { tag: t.comment, class: 'tok-com' },
  { tag: [t.function(t.variableName), t.function(t.definition(t.variableName))], class: 'tok-fn' },
  { tag: t.definition(t.className), class: 'tok-fn' },
]);

/** Highlighted <code> markup for a Python snippet. */
export function highlightPython(code: string): HTMLElement {
  const out = document.createElement('code');
  out.className = 'py';
  const tree = pythonParser.parse(code);
  highlightCode(
    code,
    tree,
    pyHighlighter,
    (text, classes) => {
      if (!classes) return out.append(text);
      const span = document.createElement('span');
      span.className = classes;
      span.textContent = text;
      out.append(span);
    },
    () => out.append('\n'),
  );
  return out;
}
