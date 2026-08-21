import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/**
 * A dark IDE palette modeled on Lightning Studio's own editor theme: near-black background,
 * pink selectors/keywords, warm tan property names and literals, cyan italic comments. Colors
 * are literal hex, independent of the app's own light/dark toggle — the code editor always
 * renders in this theme, the way a dedicated code color scheme usually isn't tied to app chrome.
 */
const palette = {
  background: '#1e1e1e',
  lineHighlight: '#2a2d2e',
  gutterBackground: '#1e1e1e',
  gutterText: '#6a6a6a',
  foreground: '#d4d4d4',
  comment: '#7ec9e8',
  keyword: '#ff6ac1',
  tan: '#d19a66',
  type: '#4ec9b0',
  func: '#8fd19e',
  selection: '#264f78',
  cursor: '#d4d4d4',
  accent: '#4fc1e9',
};

export const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: palette.background, color: palette.foreground },
    '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
    '.cm-content': { padding: 'var(--s-3) 0', caretColor: palette.cursor },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: palette.cursor },
    '.cm-gutters': { backgroundColor: palette.gutterBackground, color: palette.gutterText, border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { color: palette.gutterText },
    '.cm-activeLine': { backgroundColor: palette.lineHighlight, boxShadow: `inset 3px 0 0 ${palette.accent}` },
    '.cm-activeLineGutter': { backgroundColor: palette.lineHighlight, color: palette.foreground },
    '&.cm-focused': { outline: 'none' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: `${palette.selection} !important`,
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(79, 193, 233, 0.18)',
      outline: `1px solid ${palette.accent}`,
      color: 'inherit',
    },
    '.cm-tooltip': { backgroundColor: '#252526', border: '1px solid #3c3c3c', color: palette.foreground },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: palette.lineHighlight, color: palette.func },
    '.cm-panels': { backgroundColor: '#252526', color: palette.foreground },
    '.cm-panels input': {
      backgroundColor: palette.background,
      color: palette.foreground,
      border: '1px solid #3c3c3c',
      borderRadius: 'var(--r-sm)',
    },
    '.cm-searchMatch': { backgroundColor: 'rgba(209, 154, 102, 0.25)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(209, 154, 102, 0.5)' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: palette.comment },
    '.cm-foldGutter span': { cursor: 'pointer', color: palette.gutterText },
  },
  { dark: true },
);

export const editorHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: palette.comment, fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string)], color: palette.tan, fontStyle: 'italic' },
  { tag: t.regexp, color: palette.tan },
  { tag: [t.number, t.bool, t.null], color: palette.tan, fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword], color: palette.keyword },
  { tag: [t.definitionKeyword, t.modifier], color: palette.keyword },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: palette.func },
  { tag: t.propertyName, color: palette.tan, fontStyle: 'italic' },
  { tag: [t.typeName, t.className, t.namespace], color: palette.type },
  { tag: t.definition(t.variableName), color: palette.foreground },
  { tag: t.variableName, color: palette.foreground },
  { tag: [t.operator, t.punctuation], color: palette.foreground },
  { tag: [t.bracket, t.paren, t.squareBracket, t.brace, t.angleBracket], color: palette.foreground },
  { tag: t.tagName, color: palette.keyword },
  { tag: t.attributeName, color: palette.tan, fontStyle: 'italic' },
  { tag: t.attributeValue, color: palette.tan },
  { tag: [t.atom, t.self], color: palette.tan },
  { tag: t.meta, color: palette.comment },
  { tag: t.invalid, color: '#f14c4c', textDecoration: 'underline' },
  { tag: t.link, color: palette.type, textDecoration: 'underline' },
  { tag: t.heading, color: palette.keyword, fontWeight: 'bold' },
]);
