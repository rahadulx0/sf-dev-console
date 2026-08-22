import type { EditorView, Panel, ViewUpdate } from '@codemirror/view';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  selectMatches,
  setSearchQuery,
} from '@codemirror/search';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function createVsCodeSearchPanel(view: EditorView): Panel {
  let query = getSearchQuery(view.state);
  let replaceExpanded = false;

  const dom = element('div', 'cm-search vscode-find-widget');
  const findRow = element('div', 'vscode-find-row');
  const replaceRow = element('div', 'vscode-find-row vscode-replace-row');

  const toggleReplace = iconButton('toggleReplace', 'Toggle Replace', 'chevron');
  toggleReplace.classList.add('vscode-replace-toggle');
  toggleReplace.setAttribute('aria-expanded', 'false');

  const findInput = textInput('search', 'Find', query.search, true);
  const replaceInput = textInput('replace', 'Replace', query.replace);
  const findBox = element('div', 'vscode-find-input');
  const replaceBox = element('div', 'vscode-find-input');
  const findOptions = element('div', 'vscode-find-options');
  const replaceOptions = element('div', 'vscode-find-options');

  const caseButton = textButton('case', 'Match Case', 'Aa');
  const wordButton = textButton('word', 'Match Whole Word', 'ab');
  wordButton.classList.add('is-word');
  const regexpButton = textButton('regexp', 'Use Regular Expression', '.*');
  const preserveCaseButton = textButton('preserveCase', 'Preserve Case', 'AB');
  preserveCaseButton.disabled = true;
  preserveCaseButton.title = 'Preserve Case is not supported by the current editor engine';

  findOptions.append(caseButton, wordButton, regexpButton);
  replaceOptions.append(preserveCaseButton);
  findBox.append(findInput, findOptions);
  replaceBox.append(replaceInput, replaceOptions);

  const resultCount = element('span', 'vscode-find-count');
  resultCount.setAttribute('aria-live', 'polite');
  const previousButton = iconButton('previous', 'Previous Match', 'arrow-up');
  const nextButton = iconButton('next', 'Next Match', 'arrow-down');
  const selectButton = iconButton('select', 'Select All Matches', 'selection');
  const closeButton = iconButton('close', 'Close', 'close');
  const replaceButton = iconButton('replace', 'Replace', 'replace');
  const replaceAllButton = iconButton('replaceAll', 'Replace All', 'replace-all');

  findRow.append(toggleReplace, findBox, resultCount, previousButton, nextButton, selectButton, closeButton);
  replaceRow.append(element('span', 'vscode-find-spacer'), replaceBox, element('span', 'vscode-find-spacer'), replaceButton, replaceAllButton);
  dom.append(findRow, replaceRow);

  const setPressed = (button: HTMLButtonElement, pressed: boolean) => button.setAttribute('aria-pressed', String(pressed));
  const pressed = (button: HTMLButtonElement) => button.getAttribute('aria-pressed') === 'true';

  function syncControls(nextQuery: SearchQuery) {
    query = nextQuery;
    if (findInput.value !== query.search) findInput.value = query.search;
    if (replaceInput.value !== query.replace) replaceInput.value = query.replace;
    setPressed(caseButton, query.caseSensitive);
    setPressed(wordButton, query.wholeWord);
    setPressed(regexpButton, query.regexp);
    updateResultCount();
  }

  function commit() {
    const nextQuery = new SearchQuery({
      search: findInput.value,
      replace: replaceInput.value,
      caseSensitive: pressed(caseButton),
      wholeWord: pressed(wordButton),
      regexp: pressed(regexpButton),
    });
    if (!nextQuery.eq(query)) {
      query = nextQuery;
      view.dispatch({ effects: setSearchQuery.of(nextQuery) });
    }
    updateResultCount();
  }

  function updateResultCount() {
    if (!query.search || !query.valid) {
      resultCount.textContent = 'No results';
      return;
    }

    const selection = view.state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = query.getCursor(view.state);
    for (let next = cursor.next(); !next.done; next = cursor.next()) {
      total += 1;
      if (next.value.from === selection.from && next.value.to === selection.to) current = total;
      if (total >= 9999) break;
    }
    resultCount.textContent = total ? `${current || 1} of ${total >= 9999 ? '9999+' : total}` : 'No results';
  }

  function toggleOption(button: HTMLButtonElement) {
    setPressed(button, !pressed(button));
    commit();
    findInput.focus();
  }

  toggleReplace.addEventListener('click', () => {
    replaceExpanded = !replaceExpanded;
    dom.classList.toggle('is-replace-open', replaceExpanded);
    toggleReplace.setAttribute('aria-expanded', String(replaceExpanded));
    if (replaceExpanded) replaceInput.focus();
  });
  findInput.addEventListener('input', commit);
  replaceInput.addEventListener('input', commit);
  caseButton.addEventListener('click', () => toggleOption(caseButton));
  wordButton.addEventListener('click', () => toggleOption(wordButton));
  regexpButton.addEventListener('click', () => toggleOption(regexpButton));
  previousButton.addEventListener('click', () => findPrevious(view));
  nextButton.addEventListener('click', () => findNext(view));
  selectButton.addEventListener('click', () => selectMatches(view));
  replaceButton.addEventListener('click', () => replaceNext(view));
  replaceAllButton.addEventListener('click', () => replaceAll(view));
  closeButton.addEventListener('click', () => closeSearchPanel(view));

  dom.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSearchPanel(view);
    } else if (event.key === 'Enter' && event.target === findInput) {
      event.preventDefault();
      (event.shiftKey ? findPrevious : findNext)(view);
    } else if (event.key === 'Enter' && event.target === replaceInput) {
      event.preventDefault();
      replaceNext(view);
    }
  });

  syncControls(query);

  return {
    dom,
    top: true,
    mount() {
      findInput.select();
    },
    update(update: ViewUpdate) {
      const nextQuery = getSearchQuery(update.state);
      if (!nextQuery.eq(query)) syncControls(nextQuery);
      else if (update.docChanged || update.selectionSet) updateResultCount();
    },
  };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function textInput(name: string, placeholder: string, value: string, main = false) {
  const input = document.createElement('input');
  input.className = 'cm-textfield vscode-find-textfield';
  input.name = name;
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', placeholder);
  if (main) input.setAttribute('main-field', 'true');
  return input;
}

function textButton(name: string, label: string, text: string) {
  const button = document.createElement('button');
  button.className = 'vscode-find-option';
  button.name = name;
  button.type = 'button';
  button.textContent = text;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('aria-pressed', 'false');
  return button;
}

function iconButton(name: string, label: string, icon: IconName) {
  const button = document.createElement('button');
  button.className = 'vscode-find-icon';
  button.name = name;
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.append(svgIcon(icon));
  return button;
}

type IconName = 'chevron' | 'arrow-up' | 'arrow-down' | 'selection' | 'close' | 'replace' | 'replace-all';

const ICON_PATHS: Record<IconName, string[]> = {
  chevron: ['m6 9 6 6 6-6'],
  'arrow-up': ['m12 19V5', 'm6 11 6-6 6 6'],
  'arrow-down': ['m12 5v14', 'm18 13-6 6-6-6'],
  selection: ['M5 7h14', 'M5 12h10', 'M5 17h14'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  replace: ['M5 7h11', 'm13 4 4-4-4-4', 'M8 17h11'],
  'replace-all': ['M4 6h12', 'm13 4 4-4-4-4', 'M8 13h12', 'm-3 4 3-4-3-4', 'M8 20h12'],
};

function svgIcon(name: IconName) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  for (const pathData of ICON_PATHS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.6');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
  }
  return svg;
}
