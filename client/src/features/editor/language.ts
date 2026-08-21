import { StreamLanguage } from '@codemirror/language';
import { clike } from '@codemirror/legacy-modes/mode/clike';
import { javascript } from '@codemirror/lang-javascript';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { xml } from '@codemirror/lang-xml';
import { json } from '@codemirror/lang-json';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

/** Not a real Apex language server — just enough Monarch-style keywords/types for readable highlighting. */
const APEX_KEYWORDS = [
  'abstract', 'and', 'as', 'asc', 'break', 'by', 'case', 'catch', 'class', 'continue', 'default', 'delete',
  'desc', 'do', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'from', 'global', 'group',
  'having', 'if', 'implements', 'import', 'in', 'insert', 'instanceof', 'interface', 'limit', 'like', 'new',
  'not', 'null', 'nulls', 'on', 'or', 'order', 'override', 'private', 'protected', 'public', 'return',
  'select', 'set', 'static', 'super', 'switch', 'testmethod', 'this', 'throw', 'transient', 'trigger', 'true',
  'try', 'undelete', 'update', 'upsert', 'using', 'virtual', 'void', 'webservice', 'when', 'where', 'while',
  'with', 'without sharing', 'with sharing',
];
const APEX_TYPES = [
  'Boolean', 'Integer', 'Long', 'Double', 'Decimal', 'String', 'Id', 'Date', 'Datetime', 'Time', 'Blob',
  'Object', 'List', 'Set', 'Map', 'SObject', 'Exception', 'PageReference', 'void',
];

const apexKeywordSet = Object.fromEntries(APEX_KEYWORDS.map((k) => [k, true]));
const apexTypeSet = Object.fromEntries(APEX_TYPES.map((t) => [t, true]));

const apexLanguage = StreamLanguage.define(
  clike({
    name: 'apex',
    keywords: apexKeywordSet,
    types: apexTypeSet,
    blockKeywords: { class: true, trigger: true, interface: true, enum: true, try: true, catch: true, finally: true, else: true, do: true },
    atoms: { true: true, false: true, null: true, this: true, super: true },
  }),
);

function apexCompletions(context: CompletionContext) {
  const word = context.matchBefore(/[\w.]*/);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  const options = [
    ...APEX_KEYWORDS,
    ...APEX_TYPES,
    'System.debug()', 'System.assert()', 'System.assertEquals()', 'Trigger.new', 'Trigger.old', 'Trigger.isInsert',
    'Trigger.isUpdate', 'Trigger.isDelete', 'Database.insert()', 'Database.update()', 'Database.query()',
  ].map((label) => ({ label, type: /^[A-Z]/.test(label) ? 'class' : 'keyword' }));
  return { from: word.from, options };
}

export type EditorLanguage = 'apex' | 'javascript' | 'html' | 'css' | 'xml' | 'json' | 'text';

export function languageForFile(file: string): EditorLanguage {
  const lower = file.toLowerCase();
  if (lower.endsWith('.cls') || lower.endsWith('.trigger')) return 'apex';
  if (lower.endsWith('-meta.xml') || lower.endsWith('.xml') || lower.endsWith('.design') || lower.endsWith('.auradoc')) return 'xml';
  if (lower.endsWith('.js')) return 'javascript';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.svg')) return 'xml';
  // Visualforce (.page/.component) and Aura (.cmp/.app) markup is close enough to HTML to highlight well.
  if (/\.(html|page|component|cmp|app|evt|intf)$/.test(lower)) return 'html';
  return 'text';
}

/** Legacy stream-mode languages don't register comment tokens on their own, so Mod-/ needs this to work. */
const apexCommentData = apexLanguage.data.of({ commentTokens: { line: '//', block: { open: '/*', close: '*/' } } });

export function languageExtension(language: EditorLanguage): Extension[] {
  switch (language) {
    case 'apex':
      return [apexLanguage, apexCommentData, autocompletion({ override: [apexCompletions] })];
    case 'javascript':
      return [javascript()];
    case 'html':
      return [html()];
    case 'css':
      return [css()];
    case 'xml':
      return [xml()];
    case 'json':
      return [json()];
    default:
      return [];
  }
}
