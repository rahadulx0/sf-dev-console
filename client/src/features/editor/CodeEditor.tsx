import { useEffect, useRef } from 'react';
import { Compartment, EditorState } from '@codemirror/state';
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type KeyBinding,
} from '@codemirror/view';
import {
  copyLineDown,
  copyLineUp,
  defaultKeymap,
  deleteLine,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  indentWithTab,
  moveLineDown,
  moveLineUp,
  toggleBlockComment,
  toggleComment,
} from '@codemirror/commands';
import { bracketMatching, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from '@codemirror/search';
import { editorHighlightStyle, editorTheme } from './editorTheme';
import { languageExtension, type EditorLanguage } from './language';

/** The handful of VS Code shortcuts that aren't already covered by CodeMirror's own defaultKeymap/searchKeymap. */
const vscodeKeymap: KeyBinding[] = [
  { key: 'Mod-/', run: toggleComment, preventDefault: true },
  { key: 'Shift-Alt-a', run: toggleBlockComment, preventDefault: true },
  { key: 'Alt-ArrowUp', run: moveLineUp, preventDefault: true },
  { key: 'Alt-ArrowDown', run: moveLineDown, preventDefault: true },
  { key: 'Shift-Alt-ArrowUp', run: copyLineUp, preventDefault: true },
  { key: 'Shift-Alt-ArrowDown', run: copyLineDown, preventDefault: true },
  { key: 'Mod-Shift-k', run: deleteLine, preventDefault: true },
  { key: 'Mod-]', run: indentMore, preventDefault: true },
  { key: 'Mod-[', run: indentLess, preventDefault: true },
];

const wrapCompartment = new Compartment();
const foldCompartment = new Compartment();
const fontSizeCompartment = new Compartment();
const fontSizeTheme = (px: number) => EditorView.theme({ '&': { fontSize: `${px}px` } });

export interface CodeEditorHandle {
  find: () => void;
}

export function CodeEditor({
  value,
  language,
  readOnly,
  wordWrap,
  showFoldGutter = true,
  fontSize = 13,
  onChange,
  onSave,
  editorRef,
}: {
  value: string;
  language: EditorLanguage;
  readOnly?: boolean;
  wordWrap?: boolean;
  showFoldGutter?: boolean;
  fontSize?: number;
  onChange: (value: string) => void;
  onSave: () => void;
  editorRef?: (handle: CodeEditorHandle | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        foldCompartment.of(showFoldGutter ? foldGutter() : []),
        wrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
        history(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        highlightSelectionMatches(),
        editorTheme,
        fontSizeCompartment.of(fontSizeTheme(fontSize)),
        syntaxHighlighting(editorHighlightStyle, { fallback: true }),
        autocompletion(),
        keymap.of([
          { key: 'Mod-s', preventDefault: true, run: () => { onSaveRef.current(); return true; } },
          ...closeBracketsKeymap,
          ...vscodeKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        ...languageExtension(language),
        EditorState.readOnly.of(!!readOnly),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    editorRef?.({ find: () => openSearchPanel(view) });
    view.focus();
    return () => {
      editorRef?.(null);
      view.destroy();
      viewRef.current = null;
    };
    // Re-mounted per open file/tab via a `key` prop at the call site, so `value`/`language`
    // only need to matter once, on creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []) });
  }, [wordWrap]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: foldCompartment.reconfigure(showFoldGutter ? foldGutter() : []) });
  }, [showFoldGutter]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: fontSizeCompartment.reconfigure(fontSizeTheme(fontSize)) });
  }, [fontSize]);

  return <div className="code-editor-host" ref={hostRef} />;
}
