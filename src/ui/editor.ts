/**
 * CodeMirror 6 Python editor: mockup colours, bot-API autocomplete, error-line highlight,
 * read-only while a run is in progress.
 */
import { autocompletion, completeFromList, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import type { BotDesign } from '../shared/parts';
import { signature } from '../parts/api';
import { completionData } from './apiRef';
import { pyHighlighter } from './highlight';

const setErrorLine = StateEffect.define<number | null>();

const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setErrorLine)) {
        if (e.value === null || e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none;
        const line = tr.state.doc.line(e.value);
        return Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(line.from)]);
      }
    }
    // Any edit clears the stale error marker.
    return tr.docChanged ? Decoration.none : deco.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

const theme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--void)', color: 'var(--ink)', fontSize: '14px' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '24px', paddingTop: '12px' },
    '.cm-content': { caretColor: 'var(--cyan)', paddingLeft: '8px' },
    '.cm-gutters': { backgroundColor: 'var(--void)', color: 'var(--dim)', border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { minWidth: '32px', padding: '0 12px 0 0' },
    '.cm-activeLine': { backgroundColor: 'rgba(63, 208, 224, 0.04)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--steel)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--cyan)' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: '#1D3A4A !important' },
    '.cm-error-line': { backgroundColor: 'var(--error-line)' },
    '.cm-tooltip': { backgroundColor: 'var(--panel)', border: '1px solid var(--border)', color: 'var(--ink)' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--panel-active)', color: 'var(--cyan)' },
    '.cm-completionDetail': { color: 'var(--steel)', fontStyle: 'normal', marginLeft: '8px' },
    '.cm-completionInfo': { maxWidth: '320px', fontFamily: 'var(--font-body)', fontSize: '13px', lineHeight: 1.5 },
    '&.cm-readonly .cm-content': { opacity: 0.75 },
  },
  { dark: true },
);

const PY_WORDS: Completion[] = [
  ...['if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'break', 'continue', 'and', 'or', 'not', 'True', 'False', 'None', 'try', 'except', 'class', 'pass', 'import', 'from', 'lambda', 'global']
    .map((label) => ({ label, type: 'keyword' })),
  ...['print', 'range', 'len', 'abs', 'min', 'max', 'round', 'int', 'float', 'str', 'list', 'sorted', 'enumerate', 'isinstance']
    .map((label) => ({ label, type: 'function' })),
  { label: 'bot', type: 'variable', detail: 'your robot' },
  { label: 'BotError', type: 'class' },
  { label: 'BlasterNotReady', type: 'class' },
  { label: 'OutOfEnergy', type: 'class' },
  { label: 'PartNotFitted', type: 'class' },
];

/** Completion source for `bot.` and `bot.<attr>.`, generated from the fitted parts. */
function botCompletions(design: BotDesign) {
  const { attrs, methods } = completionData(design);
  const methodOptions = (attr: string): Completion[] =>
    (methods.get(attr) ?? []).map((m) => ({
      label: m.name,
      type: 'method',
      detail: signature(m).slice(m.name.length),
      info: `${m.summary}\n\n${m.doc}`,
      apply: m.params.length ? `${m.name}(` : `${m.name}()`,
    }));
  const words = completeFromList(PY_WORDS);
  return (ctx: CompletionContext): CompletionResult | null | Promise<CompletionResult | null> => {
    const member = ctx.matchBefore(/\bbot\.(\w+\.)?\w*$/);
    if (member) {
      const m = /^bot\.(?:(\w+)\.)?(\w*)$/.exec(member.text)!;
      const from = member.to - m[2]!.length;
      if (m[1]) return { from, options: methodOptions(m[1]), validFor: /^\w*$/ };
      return {
        from,
        options: [
          ...attrs.map((a) => ({ label: a.label, type: 'property', detail: a.detail, info: a.info })),
          ...methodOptions(''),
        ],
        validFor: /^\w*$/,
      };
    }
    return words(ctx);
  };
}

export interface CodeEditor {
  view: EditorView;
  getValue(): string;
  setReadOnly(readOnly: boolean): void;
  showError(line: number | null): void;
  setDesign(design: BotDesign): void;
  destroy(): void;
}

export function createEditor(parent: HTMLElement, doc: string, design: BotDesign, onChange: (text: string) => void): CodeEditor {
  const readOnly = new Compartment();
  const completion = new Compartment();
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightSelectionMatches(),
        indentUnit.of('    '),
        python(),
        syntaxHighlighting(pyHighlighter),
        completion.of(autocompletion({ override: [botCompletions(design)], icons: false })),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        readOnly.of([]),
        errorLineField,
        theme,
        EditorView.contentAttributes.of({ 'aria-label': 'Python script editor' }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange(u.state.doc.toString());
        }),
      ],
    }),
  });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setReadOnly(ro) {
      view.dispatch({ effects: readOnly.reconfigure(ro ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []) });
      view.dom.classList.toggle('cm-readonly', ro);
    },
    showError(line) {
      view.dispatch({ effects: setErrorLine.of(line) });
      if (line && line <= view.state.doc.lines) {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'center' }) });
      }
    },
    setDesign(design) {
      view.dispatch({ effects: completion.reconfigure(autocompletion({ override: [botCompletions(design)], icons: false })) });
    },
    destroy: () => view.destroy(),
  };
}
