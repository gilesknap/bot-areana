/**
 * CodeMirror 6 Python editor: mockup colours, bot-API autocomplete, error-line and current-line
 * (playback) highlights, wrapped long lines, read-only while a run is in progress.
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
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view';
import type { BotDesign } from '../shared/parts';
import { signature } from '../parts/api';
import { completionData } from './apiRef';
import { pyHighlighter } from './highlight';

/** A whole-line highlight with this class, moved by its effect (null clears it). */
function lineMarker(cls: string) {
  const set = StateEffect.define<number | null>();
  const field = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      for (const e of tr.effects) {
        if (e.is(set)) {
          if (e.value === null || e.value < 1 || e.value > tr.state.doc.lines) return Decoration.none;
          const line = tr.state.doc.line(e.value);
          return Decoration.set([Decoration.line({ class: cls }).range(line.from)]);
        }
      }
      // Any edit clears a stale marker.
      return tr.docChanged ? Decoration.none : deco.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
  return { set, field };
}

const errorLine = lineMarker('cm-error-line');
const currentLine = lineMarker('cm-current-line');

/**
 * Long lines wrap (starter comments are wider than the editor), and a wrapped line's
 * continuation rows line up under its first character instead of at the left edge: each indented
 * line gets a hanging indent as wide as its leading whitespace.
 */
function hangingIndents(view: EditorView): DecorationSet {
  const decos = [];
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos);
      const indent = /^[ \t]*/.exec(line.text)![0].replace(/\t/g, '    ').length;
      if (indent) {
        decos.push(Decoration.line({ attributes: { style: `padding-left: calc(${indent}ch + 6px); text-indent: -${indent}ch` } }).range(line.from));
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(decos);
}

const wrapIndented = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = hangingIndents(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = hangingIndents(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

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
    // After the current line, so an error on the current line shows red.
    '.cm-current-line': { backgroundColor: 'var(--current-line)', boxShadow: 'inset 3px 0 0 var(--cyan)' },
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
  /** Mark the line playback is on (null clears it). */
  showLine(line: number | null): void;
  setDesign(design: BotDesign): void;
  /** Insert code on the cursor's line (if blank) or a new line after it, at its indent (at the end if the cursor is at 0). False if read-only. */
  insert(code: string): boolean;
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
        errorLine.field,
        currentLine.field,
        EditorView.lineWrapping,
        wrapIndented,
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
      view.dispatch({ effects: errorLine.set.of(line) });
      if (line && line <= view.state.doc.lines) {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'center' }) });
      }
    },
    showLine(line) {
      const effects: StateEffect<unknown>[] = [currentLine.set.of(line)];
      if (line && line <= view.state.doc.lines) effects.push(EditorView.scrollIntoView(view.state.doc.line(line).from, { y: 'nearest' }));
      view.dispatch({ effects });
    },
    setDesign(design) {
      view.dispatch({ effects: completion.reconfigure(autocompletion({ override: [botCompletions(design)], icons: false })) });
    },
    insert(code) {
      const { state } = view;
      if (state.readOnly) return false;
      // Never placed the cursor (still at the very start, in the starter's comments): append at the end.
      const head = state.selection.main.head;
      const line = head === 0 ? state.doc.line(state.doc.lines) : state.doc.lineAt(head);
      const indent = /^\s*/.exec(line.text)![0];
      const blank = !line.text.trim();
      // A blank line already has its indent; continuation lines (and a new line) need it added.
      const body = code.split('\n').map((l, i) => (i === 0 && blank ? l : indent + l)).join('\n');
      const from = line.to;
      const insert = blank ? body : `\n${body}`;
      view.dispatch({ changes: { from, insert }, selection: { anchor: from + insert.length }, scrollIntoView: true });
      view.focus();
      return true;
    },
    destroy: () => view.destroy(),
  };
}
