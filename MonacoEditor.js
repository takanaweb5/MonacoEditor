let editor;
let diffEditor;
let lastFocused = null;  // 最後にフォーカスされたエディタを保持する変数
let currentFileName = null;
let originalContent = '';
let isDiffMode = false;  // 差分表示モードのフラグを復活
let bookmarkLines = new Set(); // ブックマークが設定された行を管理
const editorDecorations = new WeakMap(); // WeakMapを追加
const editorContainer = document.getElementById('editor-container');

require.config({ paths: { 'vs': MONACO_URL } });
require(['vs/editor/editor.main'], onEditorLoad);

/**
 * Monaco Editorの初期化処理
 *
 * Monaco EditorのCoreモジュールをロードして、エディタのインスタンスを作成。
 * PL/Iのシンタックスハイライトルールを定義し、PL/Iもどきの言語設定を適用。
 * エディタの内容変更イベントをリッスンして、ブックマークの位置を更新。
 * エディタの内容が変更されたときや、言語が変更されたときの処理を定義。
 */
function onEditorLoad() {
  const EDITOR_GUIDE_OPTIONS = {
    bracketPairs: true,          // 常に垂直ガイドラインを表示
    bracketPairsHorizontal: true,// 常に水平ガイドラインを表示
    highlightActiveBracketPair: true, // アクティブな括弧をハイライト
    indentation: false            // インデントガイドを表示
  };

  const COMMON_EDITOR_OPTIONS = {
    automaticLayout: true, // エディタの自動レイアウト
    glyphMargin: true, // 行番号横のアイコン表示
    multiCursorModifier: 'ctrlCmd', // マルチカーソルの修飾キー
    folding: true, // コードの折りたたみ
    guides: EDITOR_GUIDE_OPTIONS // ガイドラインの設定
  };

  // 通常のエディタを作成
  editor = monaco.editor.create(document.getElementById('editor'), {
    ...COMMON_EDITOR_OPTIONS,
    value: '',
    language: 'plaintext',
    tabSize: 2,
    lineNumbers: 'on',
    fontFamily: "UDEV Gothic NFJ, Fira Mono, monospace",
    // renderWhitespace: 'all', // 常に空白文字を表示
  });

  // 差分エディタを作成
  diffEditor = monaco.editor.createDiffEditor(document.getElementById('diffeditor-container'), {
    ...COMMON_EDITOR_OPTIONS,
    enableSplitViewResizing: true, // 分割ビューのリサイズを有効化
    renderSideBySide: true, // サイドバイサイドで表示
    originalEditable: true, // 元のコンテンツを編集可能にする
  });

  // 元のコンテンツと現在のコンテンツを設定（同じ言語を適用）
  const originalModel = monaco.editor.createModel('', 'plaintext');
  const modifiedModel = editor.getModel();
  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel
  });
  const originalEditor = diffEditor.getOriginalEditor();
  const modifiedEditor = diffEditor.getModifiedEditor();

  // 差分画面を非表示する
  editorContainer.style.gridTemplateColumns = '100% 0 0 0';

  // PL/I言語の定義
  monaco.languages.register({ id: 'pli' });

  // PL/Iのシンタックスハイライトルールを定義
  monaco.languages.setMonarchTokensProvider('pli', {
    defaultToken: '',
    ignoreCase: true,

    // キーワード定義
    keywords: [
      'PROC', 'DECLARE', 'BEGIN', 'END', 'DO', 'TO', 'BY', 'WHILE', 'UNTIL', 'END', 'LEAVE',
      'IF', 'THEN', 'ELSE', 'ENDIF', 'SELECT', 'WHEN', 'OTHER', 'GO', 'TO', 'CALL', 'RETURN',
      'PUT', 'GET', 'SKIP', 'EDIT', 'PAGE', 'LIST', 'DATA', 'FLOW', 'BINARY', 'BIT',
      'CHARACTER', 'DECIMAL', 'FLOAT', 'FIXED', 'INITIAL', 'STATIC',
      'AUTOMATIC',
    ],

    tokenizer: {
      root: [
        // コメント
        [/\*.*$/, 'comment'],           // * で始まる行末までをコメントとして扱う
        [/「/, 'comment', '@comment'],   // 「でコメント開始

        // 文字列
        [/"([^"\\]|\\.)*$/, 'string.invalid'],  // 閉じていない文字列
        [/'([^'\\]|\\.)*$/, 'string.invalid'],  // 閉じていない文字列
        [/"/, 'string', '@string_double'],      // "で始まる文字列
        [/'/, 'string', '@string_single'],      // 'で始まる文字列

        // 数値
        [/[0-9]+/, 'number'],          // 整数
        [/[0-9]+\.[0-9]+/, 'number'],  // 小数

        // 識別子とキーワード
        [/[a-zA-Z_$][\w$]*/, {
          cases: {
            '@keywords': 'keyword',     // キーワードリストに含まれる場合
            '@default': 'identifier'    // それ以外は識別子として扱う
          }
        }]
      ],

      // コメントの状態
      comment: [
        [/」|\n/, 'comment', '@pop'],     // 」でコメント終了
        [/[^」]+/, 'comment'],         // 」以外の文字列
        [/./, 'comment']               // その他の文字
      ],

      // 文字列の状態（ダブルクォート）
      string_double: [
        [/[^\\"]+/, 'string'],         // 文字列の内容
        [/"/, 'string', '@pop'],       // "で文字列終了
        [/./, 'string']                // その他の文字
      ],

      // 文字列の状態（シングルクォート）
      string_single: [
        [/[^\\']+/, 'string'],         // 文字列の内容
        [/'/, 'string', '@pop'],       // 'で文字列終了
        [/./, 'string']                // その他の文字
      ]
    }
  });

  // PL/Iもどきの言語設定
  monaco.languages.setLanguageConfiguration('pli', {
    comments: {
      lineComment: '*',
      blockComment: ['「', '」']
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '\'', close: '\'' },
      { open: '「', close: '」' }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: '\'', close: '\'' },
      { open: '「', close: '」' }
    ],
    folding: {
      markers: {
        start: new RegExp(/^\s*[\w$]+:\s*proc;/i),
        end: new RegExp(/^\s*end\s+proc/i)
      }
    }
  });

  // エディタの内容変更イベントをリッスン
  editor.getModel().onDidChangeContent((e) => {
    // 変更された行の情報を取得して、ブックマークの位置を更新
    for (const change of e.changes) {
      const startLineNumber = change.range.startLineNumber;
      const endLineNumber = change.range.endLineNumber;
      const lineCount = change.text.split('\n').length - 1;
      updateBookmarkPositions(startLineNumber, endLineNumber, lineCount);
    }
  });

  // エディタの内容が変更されたときの処理
  editor.onDidChangeModelContent(() => updateEditorUI(editor));
  originalEditor.onDidChangeModelContent(() => updateEditorUI(originalEditor));
  modifiedEditor.onDidChangeModelContent(() => updateEditorUI(modifiedEditor));
  // エディタの言語が変更されたときの処理
  editor.onDidChangeModelLanguage(() => updateEditorUI(editor));
  originalEditor.onDidChangeModelLanguage(() => updateEditorUI(originalEditor));
  modifiedEditor.onDidChangeModelLanguage(() => updateEditorUI(modifiedEditor));
  function updateEditorUI(target) {
    // 関数区切り線を更新
    updateFunctionDecorations(target);
    // プレビューを更新
    updatePreview();
    // エディタのレイアウトを更新
    layoutEditor();
  }

  // 'pli'もどき用シンボル情報提供用のCallback関数を登録
  monaco.languages.registerDocumentSymbolProvider('vb', { provideDocumentSymbols });
  function provideDocumentSymbols(model, token) {
    const symbols = [];
    const lines = model.getLinesContent();
    let endLine = 0;
    let match = null;

    // 終了行を先に取得するため後方からLOOPする
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineNum = i + 1;
      const line = lines[i];
      match = line.trim().match(/^end +(?:function|sub|property)\b/i);
      if (match) {
        endLine = lineNum;
        continue;
      }

      match = line.trim().match(/^(?:private|public)? *(?:function|sub|property) +(\w+)/i);
      // matchが有効な場合（開始行）
      if (match) {
        symbols.push({
          name: match[1],
          kind: monaco.languages.SymbolKind.Function,
          range: {
            startLineNumber: lineNum,
            startColumn: 1,
            endLineNumber: endLine || lineNum,
            endColumn: 1
          },
          selectionRange: {
            startLineNumber: lineNum,
            startColumn: 1,
            endLineNumber: lineNum,
            endColumn: 1
          },
          // detail: '詳細情報（オプション）',
        });
        endLine = 0;
      }
    };
    return symbols;
  }

  // 'pli'もどき用の定義提供用のCallback関数を登録
  monaco.languages.registerDefinitionProvider("vb", { provideDefinition });
  function provideDefinition(model, position, token) {
    // カーソル位置の行を取得
    const lineContent = model.getLineContent(position.lineNumber);
    // 行が 'call' で始まるか確認し、関数名を抽出
    const match = lineContent.trim().match(/^call\s+(\w+)/i);
    if (!match) return;
    const functionName = match[1];

    // 関数名に該当する行を検索
    const lines = model.getLinesContent();
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(new RegExp(`(?:function|sub)\\s+${functionName}`, 'i'))) {
        return {
          uri: model.uri,
          // 該当行の全体を range に設定
          range: new monaco.Range(i + 1, 1, i + 1, lines[i].length + 1),
        };
      }
    }
  }

  // 'pli'もどき用の参照提供用のCallback関数を登録
  monaco.languages.registerReferenceProvider("vb", { provideReferences });
  function provideReferences(model, position, context, token) {
    // カーソル位置の行を取得
    const lineContent = model.getLineContent(position.lineNumber);
    let match;
    // 行が関数の開始行か確認し、関数名を抽出
    match = lineContent.trim().match(/^(?:private|public)? *(?:function|sub|property) +(\w+).*/i);
    if (!match) {
      // 行が 'call' で始まるか確認し、関数名を抽出
      match = lineContent.trim().match(/^call\s+(\w+)/i);
    }
    if (!match) return;
    const functionName = match[1];

    // 関数名が呼び出されている行と定義されている行をすべて検索
    const lines = model.getLinesContent();
    const references = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(new RegExp(`call\\s+${functionName}`, 'i')) ||
        lines[i].match(new RegExp(`(?:function|sub)\\s+${functionName}`, 'i'))) {
        references.push({
          uri: model.uri,
          range: new monaco.Range(i + 1, 1, i + 1, lines[i].length + 1),
        });
      }
    }
    return references;
  }

  // キー割り当てを変更する
  monaco.editor.addKeybindingRules([{
    // Ctrl+'[' に editor.action.jumpToBracket を割り当て
    keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketLeft,
    command: 'editor.action.jumpToBracket'
  }, {
    // Ctrl+']' に editor.action.jumpToBracket を割り当て
    keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.BracketRight,
    command: 'editor.action.jumpToBracket'
  }, {
    // Ctrl+Shift+\ に editor.action.selectToBracket を割り当て
    keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Backslash,
    command: 'editor.action.selectToBracket'
  }]);

  // フォーカスイベントの設定
  originalEditor.onDidFocusEditorText(() => { lastFocused = originalEditor; });
  modifiedEditor.onDidFocusEditorText(() => { lastFocused = modifiedEditor; });
  editor.onDidFocusEditorText(() => { lastFocused = editor; });
}

const dropOverlay = document.getElementById('drop-overlay');
let dragCounter = 0;
/**
 * ドラッグエンターイベントを処理します。デフォルトの動作を防止し、
 * dragCounterをインクリメントし、アイテムがターゲットエリアに最初にドラッグされたときに
 * ドロップオーバーレイをアクティブにします。
 *
 * @param {Event} e - ドラッグエンターイベントオブジェクト
 */
function handleDragEnter(e) {
  e.preventDefault();
  dragCounter++;
  if (dragCounter === 1) {
    dropOverlay.classList.add('active');
  }
}
/**
 * ドラッグエンターイベントを処理します。デフォルトの動作を防止し、
 * dragCounterをデクリメントし、アイテムがターゲットエリアから最後にドラッグされたときに
 * ドロップオーバーレイを非アクティブにします。
 *
 * @param {Event} e - ドラッグエンターイベントオブジェクト
 */
function handleDragLeave(e) {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0) {
    dropOverlay.classList.remove('active');
  }
}
/**
 * ファイルを開く。
 * ドラッグ&ドロップのドロップ領域を示す要素。
 * ドラッグ&ドロップのドロップ領域にドロップされたら、ドロップされたファイルを開く。
 * @param {Event} e - ドラッグ&ドロップのドロップイベントオブジェクト
 */
async function openFile(e) {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.classList.remove('active');

  const file = e.dataTransfer.files[0];
  if (file) {
    currentFileName = file.name;
    document.title = file.name;

    // 文字コードを自動判別
    const detectedEncoding = await detectEncoding(file);
    // ファイルを読み込む
    document.getElementById('encodingSelector').value = detectedEncoding;
    const content = await readFileContent(file, detectedEncoding);

    // ファイル拡張子に基づいて言語を設定
    const extension = file.name.split('.').pop().toLowerCase();

    if (extension === 'diff') {
      const showDiff = await new Promise(resolve => {
        if (confirm('差分モードで開きますか？')) {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      // 差分モードで開く
      if (showDiff) {
        openInDiffMode(content);
        return;
      }
    }

    const languageMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'html': 'html',
      'svg': 'html',
      'css': 'css',
      'vb': 'vb',
      'bas': 'vb',
      'cls': 'vb',
      'vbs': 'vb',
      'csv': 'csv',
      'txt': 'plaintext',
      'sql': 'sql',
      'md': 'markdown',
      'ipo': 'pli',
      'pas': 'pascal',
      'dpr': 'pascal',
      'cs': 'csharp',
      'py': 'python',
      'jl': 'julia',
      'go': 'go'
    };

    const currentLanguage = languageMap[extension] || 'plaintext';
    document.getElementById('languageSelector').value = currentLanguage;
    monaco.editor.setModelLanguage(editor.getModel(), currentLanguage);
    updateEditorLanguage(currentLanguage, diffEditor.getOriginalEditor());

    if (!isDiffMode) {
      originalContent = content;
      diffEditor.getOriginalEditor().setValue(content);
    }
    editor.setValue(content);
  }

  // ブックマークをクリア
  clearAllBookmarks();
  // マークダウン画面を必要に応じて更新
  updatePreview();
  // タブサイズを更新
  changeTabSize();
  // エディタのレイアウトを更新
  layoutEditor();

  if (isDiffMode) {
    diffEditor.getModifiedEditor().focus();
  } else {
    editor.focus();
  }
}

/**
 * エディタのレイアウトを更新
 */
function layoutEditor() {
  if (editor) editor.layout();
  if (diffEditor) {
    diffEditor.layout();
    if (diffEditor.getModifiedEditor()) diffEditor.getModifiedEditor().layout();
    if (diffEditor.getOriginalEditor()) diffEditor.getOriginalEditor().layout();
  }
}

/**
 * 関数区切り線を追加
 * @param {monaco.editor.IStandaloneCodeEditor} targetEditor - 対象のエディタ
 */
function updateFunctionDecorations(targetEditor) {
  if (!targetEditor || !targetEditor.getModel()) {
    return;
  }
  // 言語ごとの関数区切りパターン
  const functionPatterns = {
    'vb': /^\s*(private\s+|public\s+|protected\s+|friend\s+)?(function|sub|property)\s+/i,
    'sql': /^\s*(create\s+)?(procedure|function|trigger|view)\s+/i,
    'javascript': /^\s*(async\s+)?(function\s+[\w$]+|\w+\s*=\s*(async\s+)?function\s*|class\s+[\w$]+)/i,
    'typescript': /^\s*(async\s+)?(function\s+[\w$]+|\w+\s*=\s*(async\s+)?function\s*|class\s+[\w$]+)/i,
    'html': /^\s*(async\s+)?(function\s+[\w$]+|\w+\s*=\s*(async\s+)?function\s*|class\s+[\w$]+)/i,
    'pli': /^\s*[\w$]+:\s*proc;/i
  };
  const languageId = targetEditor.getModel().getLanguageId();
  const pattern = functionPatterns[languageId];

  // 現在のエディタの装飾情報を取得（なければ空配列）
  const currentDecorations = editorDecorations.get(targetEditor) || [];

  if (!pattern) {
    targetEditor.deltaDecorations(currentDecorations, []);
    editorDecorations.set(targetEditor, []);
    return;
  }
  const text = targetEditor.getValue();
  const lines = text.split('\n');
  const newDecorations = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(pattern)) {
      newDecorations.push({
        range: new monaco.Range(i + 1, 1, i + 1, 1),
        options: {
          isWholeLine: true,
          className: 'function-separator',
        }
      });
    }
  }

  // 新しい装飾情報を保存
  const decorationIds = targetEditor.deltaDecorations(currentDecorations, newDecorations);
  editorDecorations.set(targetEditor, decorationIds);
}

/**
 * バイト配列がUTF-8かどうかを判定する
 * @param {Uint8Array} bytes - 判定対象のバイト配列
 * @returns {boolean} UTF-8かどうか
 */
function isUtf8(bytes) {
  // UTF-8のBOMチェック
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return true;
  }

  let i = 0;
  while (i < bytes.length) {
    if (bytes[i] === 0x00) return false; // nullバイトがあればSJISの可能性が高い

    if ((bytes[i] & 0x80) === 0) { // ASCII
      i++;
    } else if ((bytes[i] & 0xE0) === 0xC0) { // 2バイト文字
      if (i + 1 >= bytes.length) return false;
      if ((bytes[i + 1] & 0xC0) !== 0x80) return false;
      i += 2;
    } else if ((bytes[i] & 0xF0) === 0xE0) { // 3バイト文字
      if (i + 2 >= bytes.length) return false;
      if ((bytes[i + 1] & 0xC0) !== 0x80) return false;
      if ((bytes[i + 2] & 0xC0) !== 0x80) return false;
      i += 3;
    } else if ((bytes[i] & 0xF8) === 0xF0) { // 4バイト文字
      if (i + 3 >= bytes.length) return false;
      if ((bytes[i + 1] & 0xC0) !== 0x80) return false;
      if ((bytes[i + 2] & 0xC0) !== 0x80) return false;
      if ((bytes[i + 3] & 0xC0) !== 0x80) return false;
      i += 4;
    } else {
      return false;
    }
  }
  return true;
}

/**
 * プレビューを更新する
 */
function updatePreview() {
  const language = document.getElementById('languageSelector').value;
  if (isDiffMode) {
    editorContainer.style.gridTemplateColumns = '0 0 0 100%';
    return;
  }
  switch (language) {
    case 'markdown':
      previewMarkdown();
      break;
    case 'html':
      previewHtml();
      break;
  }

  if (['markdown', 'html'].includes(language)) {
    // 現在の言語を編集中の時は、幅を変更させない
    if (parseInt(editorContainer.style.gridTemplateColumns.split(' ')[1]) === 0) {
      editorContainer.style.gridTemplateColumns = '60% 4px 1fr 0';
    }
  } else {
    editorContainer.style.gridTemplateColumns = '100% 0 0 0';
  }
}

/**
 * マークダウンをプレビューに表示する
 */
function previewMarkdown() {
  // marked.jsの設定
  marked.setOptions({
    breaks: true,  // 改行を有効に
    gfm: true     // GitHub Flavored Markdownを有効に
  });
  const content = editor.getValue();
  preview.innerHTML = marked.parse(content || '');
  // コードブロックにシンタックスハイライトを適用
  document.querySelectorAll('#preview pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
}

/**
 * HTMLをプレビューに表示する
 */
function previewHtml() {
  const content = editor.getValue();
  const iframe = document.createElement('iframe');
  iframe.id = 'preview-iframe';  // IDを設定
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = 'none';

  // 既存のプレビュー内容をクリア
  preview.replaceChildren(iframe);

  // iframeにhtmlの内容を表示
  iframe.srcdoc = content;
}

/**
 * 言語が変更されたときの処理
 */
function changeLanguage() {
  const language = document.getElementById('languageSelector').value;
  updateEditorLanguage(language, editor);
  updateEditorLanguage(language, diffEditor.getOriginalEditor());
  getTargetEditor().focus();
}
function updateEditorLanguage(language, targetEditor) {
  monaco.editor.setModelLanguage(targetEditor.getModel(), language);
}

/**
 * ファイルの文字コードを自動判別する
 * @param {File} file - 判別対象のファイル
 * @returns {Promise<string>} 判別された文字コード
 */
async function detectEncoding(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return isUtf8(bytes) ? 'utf8' : 'sjis';
}

// 概要: ファイルの内容を指定された文字コードで読み込む
async function readFileContent(file, encoding) {
  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder(encoding === 'utf8' ? 'utf-8' : 'shift-jis');
  return decoder.decode(buffer);
}

/**
 * ウィンドウのリサイズイベントを監視し、エディタを再描画する
 */
window.addEventListener('resize', resize);
function resize() {
  const newHeight = `calc(100vh - 40px)`;
  editorContainer.style.height = newHeight;
  document.getElementById('editor').style.height = newHeight;
  document.getElementById('diffeditor-container').style.height = newHeight;
  layoutEditor();
}

/**
 * 差分モードでファイルを開く
 * @param {string} content - ファイルの内容
 */
function openInDiffMode(content) {
  // 言語判定
  const languageMatch = content.match(/```(\w+)/);
  const language = languageMatch ? languageMatch[1] : '';

  // 行ごとに処理
  const lines = content.split('\n');
  let blockCnt = 0; // 1:original処理中 3:modified処理中
  const originalLines = [];
  const modifiedLines = [];

  for (const line of lines) {
    if (line.startsWith('```')) {
      blockCnt++;
      // ```行はスキップ
      continue;
    }

    if (blockCnt === 1) {
      originalLines.push(line.substring(1));
    } else if (blockCnt === 3) {
      modifiedLines.push(line.substring(1));
    }
  }

  originalContent = originalLines.join('\n');
  editor.setValue(modifiedLines.join('\n'));

  // editorの文字コードを設定
  document.getElementById('encodingSelector').value = 'utf8';

  // 差分エディタを表示
  isDiffMode = false;
  toggleDiffEditor();

  // 言語を設定
  const languageSelector = document.getElementById('languageSelector');
  if (languageSelector && language) {
    languageSelector.value = language;
    updateEditorLanguage(language, diffEditor.getOriginalEditor());
    updateEditorLanguage(language, diffEditor.getModifiedEditor());
  }

  changeTabSize();
}

/**
 * 差分表示モードの切り替えを行う
 */
function toggleDiffEditor() {
  isDiffMode = !isDiffMode;

  if (isDiffMode) {
    diffEditor.getOriginalEditor().setValue(originalContent);
    // Modified Editorにブックマークの装飾を適用
    updateBookmarkDecorations(diffEditor.getModifiedEditor());

    // エディタのタブサイズを更新
    const tabSize = parseInt(document.getElementById('tabSizeSelector').value, 10);
    diffEditor.getOriginalEditor().updateOptions({ tabSize: tabSize });
    diffEditor.getModifiedEditor().updateOptions({ tabSize: tabSize });
    diffEditor.focus();
    editor.focus();
  } else {
    originalContent = diffEditor.getOriginalEditor().getModel().getValue();
    // 通常エディタのブックマークを更新
    updateBookmarkDecorations(editor);
    editor.focus();
  }
  const diffButton = document.getElementById('diffButton');
  if (isDiffMode) {
    diffButton.classList.add('active');
  } else {
    diffButton.classList.remove('active');
  }

  // 差分モード用のボタンを表示/非表示を切り替え
  document.querySelectorAll('.diff-only').forEach(button => {
    if (isDiffMode) {
      button.style.display = 'inline-flex';
    } else {
      button.style.display = 'none';
    }
  });

  // エディタのレイアウトを更新
  layoutEditor();

  // マークダウン画面を必要に応じて更新
  updatePreview();
}


/**
 * 差分エディタの左右を入れ替える関数
 */
function swapDiffSides() {
  if (!diffEditor) return;

  const originalModel = diffEditor.getOriginalEditor().getModel();
  const modifiedModel = diffEditor.getModifiedEditor().getModel();

  // モデルの内容を取得
  originalContent = modifiedModel.getValue();
  const modifiedContent = originalModel.getValue();

  // ブックマークをクリア
  clearAllBookmarks();

  // 内容を入れ替え
  originalModel.setValue(originalContent);
  modifiedModel.setValue(modifiedContent);

  // 関数区切り線を両方のエディタに追加
  updateFunctionDecorations(diffEditor.getOriginalEditor());
  updateFunctionDecorations(diffEditor.getModifiedEditor());

  // マークダウン画面を必要に応じて更新
  updatePreview();
  // エディタのレイアウトを更新
  layoutEditor();
  diffEditor.focus();
  editor.focus();
}

/**
 * タブサイズを変更する
 */
function changeTabSize() {
  const tabSize = parseInt(document.getElementById('tabSizeSelector').value, 10);
  editor.getModel().updateOptions({ tabSize: tabSize });
  diffEditor.getModel().original.updateOptions({ tabSize: tabSize });
  layoutEditor();
  getTargetEditor().focus();
}

/**
 * フォントを変更する
 */
function changeFont() {
  const fontFamily = document.getElementById('fontSelector').value;
  editor.updateOptions({ fontFamily: fontFamily });

  // 差分エディタの両方のエディタにも適用
  diffEditor.getOriginalEditor().updateOptions({ fontFamily: fontFamily });
  diffEditor.getModifiedEditor().updateOptions({ fontFamily: fontFamily });
  layoutEditor();
  getTargetEditor().focus();
}

/**
 * 現在のエディタの内容をファイルとして保存する
 */
async function saveFile() {
  let finalArray, fileName;
  [finalArray, fileName] = isDiffMode ? createDiffFileData() : createFileData();
  fileName = prompt('ファイル名を入力してください', fileName);
  if (!fileName) return;

  try {
    // Blobを作成して保存
    const blob = new Blob([finalArray], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch (error) {
    console.error('ファイル保存エラー:', error);
    alert('ファイルの保存中にエラーが発生しました。');
  }
}

/**
 * 差分ファイルのデータを生成する
 */
function createDiffFileData() {
  const currentLanguage = editor.getModel().getLanguageId();
  const originalText = diffEditor.getOriginalEditor().getValue()
    .split('\n').map(line => ' ' + line).join('\n');
  const modifiedText = diffEditor.getModifiedEditor().getValue()
    .split('\n').map(line => ' ' + line).join('\n');
  const content = `
\`\`\`${currentLanguage}
${originalText}
\`\`\`

\`\`\`${currentLanguage}
${modifiedText}
\`\`\`
`;

  const finalArray = new TextEncoder().encode(content);
  let fileName;
  if (currentFileName) {
    // 現在のファイル名から拡張子を除去
    const baseFileName = currentFileName.replace(/\.[^/.]+$/, '');
    fileName = baseFileName + '.diff';
  } else {
    fileName = '差分.diff';
  }
  return [finalArray, fileName];
}

/**
 * ファイルのデータを生成する
 */
function createFileData() {
  const content = editor.getValue();
  const encoding = document.getElementById('encodingSelector').value;
  let finalArray;
  if (encoding === 'sjis') {
    const shiftJisArray = Encoding.convert(Encoding.stringToCode(content), 'SJIS');
    finalArray = new Uint8Array(shiftJisArray);
  } else {
    finalArray = new TextEncoder().encode(content);
  }
  const languageMap = {
    'javascript': '.js',
    'typescript': '.ts',
    'html': '.html',
    'css': '.css',
    'vb': '.vb',
    'csv': '.csv',
    'plaintext': '.txt',
    'sql': '.sql',
    'markdown': '.md',
    'pli': '.ipo'
  };
  const currentLanguage = editor.getModel().getLanguageId();
  const extension = languageMap[currentLanguage] || '.txt';
  const fileName = currentFileName || `untitled${extension}`;
  return [finalArray, fileName];
}

/** 
 * エディタの内容をクリアし、初期状態に戻す
 */
function clearEditor() {
  if (confirm('エディタの内容をクリアしますか？\nクリアすればundoは出来ません')) {
    location.reload();
  }
}

/** 
 * ブックマークの設定/解除を切り替える
 */
function toggleBookmark() {
  const targetEditor = getTargetEditor();
  // オリジナルエディタの時return
  if (isDiffMode && targetEditor === diffEditor.getOriginalEditor()) return;

  const position = targetEditor.getPosition();
  const lineNumber = position.lineNumber;
  const column = position.column;

  if (bookmarkLines.has(lineNumber)) {
    bookmarkLines.delete(lineNumber);
  } else {
    bookmarkLines.add(lineNumber);
  }
  updateBookmarkDecorations(targetEditor);

  targetEditor.setPosition({ lineNumber, column });
  targetEditor.focus();
}

/**
 * 指定された方向の次のブックマークにジャンプ
 * @param {number} direction - ジャンプする方向(正:次のブックマーク、負:前のブックマーク)
 */
function goToBookmark(direction) {
  const targetEditor = getTargetEditor();
  // オリジナルエディタの時return
  if (isDiffMode && targetEditor === diffEditor.getOriginalEditor()) return;

  const currentLine = targetEditor.getPosition().lineNumber;
  const bookmarkArray = Array.from(bookmarkLines).sort((a, b) => direction * (a - b));

  // 現在の行から指定された方向にあるブックマークを探す
  const nextBookmark = bookmarkArray.find(line => direction * (line - currentLine) > 0) || bookmarkArray[0]
  targetEditor.setPosition({ lineNumber: nextBookmark, column: 1 });
  targetEditor.revealLineInCenter(nextBookmark);

  // エディタにフォーカスを戻す
  if (isDiffMode) { diffEditor.focus(); }
  else { editor.focus(); }
}

/**
 * すべてのブックマークを解除
 */
function clearAllBookmarks() {
  bookmarkLines.clear();
  updateBookmarkDecorations(editor);
  if (isDiffMode) diffEditor.focus();
  editor.focus(); // エディタにフォーカスを戻す
}

/**
 * ブックマークの装飾を更新
 * @param {monaco.editor.IEditor} targetEditor - 更新対象のエディタ
 */
function updateBookmarkDecorations(targetEditor) {
  const decorations = Array.from(bookmarkLines).map(line => ({
    range: new monaco.Range(line, 1, line, 1),
    options: {
      glyphMarginClassName: 'bookmark-glyph'
    }
  }));

  // 既存の装飾をすべて削除して新しい装飾を設定
  const oldDecorations = targetEditor.getModel().getAllDecorations()
    .filter(d => d.options.glyphMarginClassName === 'bookmark-glyph')
    .map(d => d.id);

  targetEditor.deltaDecorations(oldDecorations, decorations);
}

/**
 * 行の追加/削除に応じてブックマークの位置を更新
 * @param {number} startLine - 変更された行の開始行
 * @param {number} endLine - 変更された行の終了行
 * @param {number} lineCount - 変更された行数
 */
function updateBookmarkPositions(startLine, endLine, lineCount) {
  const oldBookmarks = Array.from(bookmarkLines);
  bookmarkLines.clear();

  for (const line of oldBookmarks) {
    if (line < startLine) {
      // 変更された範囲より前の行は変更なし
      bookmarkLines.add(line);
    } else {
      // 変更された範囲以降の行は、追加/削除された行数分ずらす
      const newLine = line + lineCount - (endLine - startLine);
      if (newLine > 0) {
        bookmarkLines.add(newLine);
      }
    }
  }
}

/**
 * 文字種変換メニューを表示/非表示を切り替える
 */
function toggleCaseMenu() {
  const menu = document.getElementById('caseMenu');
  menu.classList.toggle('show');

  // メニュー以外をクリックしたときにメニューを閉じる
  document.addEventListener('click', function closeMenu(e) {
    if (!e.target.closest('.dropdown')) {
      menu.classList.remove('show');
      document.removeEventListener('click', closeMenu);
    }
  });
}

/**
 * エディタで選択されたテキストを指定された形式に変換します。
 * 大文字、小文字、タイトルケース、全角、半角への変換に対応しています。
 * @param {string} type - 変換タイプ（'upper'：大文字、'lower'：小文字、'title'：タイトルケース、'fullWidth'：全角、'halfWidth'：半角）
 * 'fullWidth'または'halfWidth'が選択された場合、ASCII文字と全角文字の間で変換を行います。
 */
function convertCase(type) {
  const targetEditor = getTargetEditor();
  const model = targetEditor.getModel();
  if (!model) return;
  const selections = targetEditor.getSelections();
  if (!selections) return;

  switch (type) {
    case 'upper':
      targetEditor.trigger('', 'editor.action.transformToUppercase');
      break;
    case 'lower':
      targetEditor.trigger('', 'editor.action.transformToLowercase');
      break;
    case 'title':
      targetEditor.trigger('', 'editor.action.transformToTitlecase');
      break;
    case 'fullWidth':
    case 'halfWidth':
      const ZEN_HAN_DIFF = 'Ａ'.charCodeAt(0) - 'A'.charCodeAt(0); // 差分を計算
      const edits = selections.map(selection => {
        const text = model.getValueInRange(selection);
        const convertedText = (type === 'fullWidth')
          ? text.replace(/[!-}]/g, s => String.fromCharCode(s.charCodeAt(0) + ZEN_HAN_DIFF))
          : text.replace(/[！-｝]/g, s => String.fromCharCode(s.charCodeAt(0) - ZEN_HAN_DIFF));
        return {
          range: selection,
          text: convertedText
        };
      });

      targetEditor.executeEdits('', edits);
      break;
  }

  // メニューを閉じる
  document.getElementById('caseMenu').classList.remove('show');
  if (isDiffMode) diffEditor.focus();
  targetEditor.focus();
}

/**
 * 現在のターゲットエディタを取得する
 * @returns {monaco.editor.IEditor} - ターゲットエディタ
 */
function getTargetEditor() {
  if (!isDiffMode) {
    return editor;
  }
  // 差分モードの場合は、lastFocusedがあればそれを、なければ右側のエディタを返す
  return lastFocused || diffEditor.getModifiedEditor();
}

let isDragging = false;
window.addEventListener('mousemove', mousemove);
function mousemove(e) {
  if (isDragging) {
    let newWidth = e.clientX - editorContainer.getBoundingClientRect().left;
    const maxWidth = editorContainer.offsetWidth - 50;
    newWidth = newWidth < 50 ? 50 : (newWidth > maxWidth ? maxWidth : newWidth);
    editorContainer.style.gridTemplateColumns = `${newWidth}px 4px 1fr 0`;

    // iframeのポインターイベントを無効化
    const previewIframe = document.getElementById('preview-iframe');
    if (previewIframe) previewIframe.style.pointerEvents = 'none';
  }
}
window.addEventListener('mouseup', mouseup);
function mouseup() {
  if (isDragging) {

    isDragging = false;
    // iframeのポインターイベントを再有効化
    const previewIframe = document.getElementById('preview-iframe');
    if (previewIframe) previewIframe.style.pointerEvents = 'auto';
  }
}
