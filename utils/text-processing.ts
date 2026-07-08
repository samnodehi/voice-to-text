import { halfSpace, toPersianChars, digitsEnToFa, digitsEnToAr } from '@persian-tools/persian-tools';

/**
 * Post-processing applied to FINAL recognition results before they're shown/inserted.
 * Interim results are left raw so the live preview doesn't flicker as words change.
 *
 * Two things happen here, both keyed off the RECOGNITION language:
 *  1. Spoken-punctuation commands ("period" → ".", "نقطه" → ".") — many languages.
 *  2. Language-appropriate output: Persian/Arabic get their own punctuation marks and
 *     digit glyphs automatically (no user toggle — smart by language).
 */

interface PunctuationRule {
  phrases: string[];
  insert: string;
  kind: 'attach' | 'newline' | 'space';
}

/**
 * Compact per-language punctuation spec. `symbols` lets RTL languages override the marks
 * (Persian/Arabic use ، ؛ ؟). Missing languages simply get no commands (raw transcription),
 * which is safer than guessing wrong command words.
 */
interface LangPunctuation {
  period?: string[];
  comma?: string[];
  question?: string[];
  exclamation?: string[];
  colon?: string[];
  semicolon?: string[];
  newline?: string[];
  paragraph?: string[];
  space?: string[];
}

// Punctuation glyphs per language family (Latin default; Arabic-script overrides).
const MARKS_LATIN = { period: '.', comma: ',', question: '?', exclamation: '!', colon: ':', semicolon: ';' };
const MARKS_ARABIC = { period: '.', comma: '،', question: '؟', exclamation: '!', colon: ':', semicolon: '؛' };
const MARKS_CJK = { period: '。', comma: '、', question: '？', exclamation: '！', colon: '：', semicolon: '；' };

const COMMANDS: Record<string, { marks: typeof MARKS_LATIN; words: LangPunctuation }> = {
  en: {
    marks: MARKS_LATIN,
    words: {
      period: ['period', 'full stop'],
      comma: ['comma'],
      question: ['question mark'],
      exclamation: ['exclamation mark', 'exclamation point'],
      colon: ['colon'],
      semicolon: ['semicolon'],
      newline: ['new line', 'newline'],
      paragraph: ['new paragraph'],
    },
  },
  fa: {
    marks: MARKS_ARABIC,
    words: {
      period: ['نقطه'],
      comma: ['ویرگول', 'کاما'],
      question: ['علامت سوال', 'علامت سؤال', 'علامت پرسش'],
      exclamation: ['علامت تعجب', 'علامت تعجّب'],
      colon: ['دو نقطه'],
      semicolon: ['نقطه ویرگول'],
      newline: ['خط جدید', 'خط بعد', 'خط بعدی', 'اینتر', 'سطر جدید'],
      paragraph: ['پاراگراف جدید', 'پاراگراف بعدی'],
      space: ['فاصله'],
    },
  },
  ar: {
    marks: MARKS_ARABIC,
    words: {
      period: ['نقطة'],
      comma: ['فاصلة', 'فاصله'],
      question: ['علامة استفهام', 'علامة سؤال'],
      exclamation: ['علامة تعجب'],
      colon: ['نقطتان'],
      semicolon: ['فاصلة منقوطة'],
      newline: ['سطر جديد', 'خط جديد'],
      paragraph: ['فقرة جديدة'],
    },
  },
  de: {
    marks: MARKS_LATIN,
    words: {
      period: ['punkt'],
      comma: ['komma'],
      question: ['fragezeichen'],
      exclamation: ['ausrufezeichen'],
      colon: ['doppelpunkt'],
      semicolon: ['semikolon', 'strichpunkt'],
      newline: ['neue zeile'],
      paragraph: ['neuer absatz'],
    },
  },
  fr: {
    marks: MARKS_LATIN,
    words: {
      period: ['point'],
      comma: ['virgule'],
      question: ["point d'interrogation"],
      exclamation: ["point d'exclamation"],
      colon: ['deux points'],
      semicolon: ['point virgule'],
      newline: ['nouvelle ligne', 'à la ligne'],
      paragraph: ['nouveau paragraphe'],
    },
  },
  es: {
    marks: MARKS_LATIN,
    words: {
      period: ['punto'],
      comma: ['coma'],
      question: ['signo de interrogación'],
      exclamation: ['signo de exclamación'],
      colon: ['dos puntos'],
      semicolon: ['punto y coma'],
      newline: ['nueva línea'],
      paragraph: ['nuevo párrafo'],
    },
  },
  it: {
    marks: MARKS_LATIN,
    words: {
      period: ['punto'],
      comma: ['virgola'],
      question: ['punto interrogativo', 'punto di domanda'],
      exclamation: ['punto esclamativo'],
      colon: ['due punti'],
      semicolon: ['punto e virgola'],
      newline: ['nuova riga', 'a capo'],
      paragraph: ['nuovo paragrafo'],
    },
  },
  pt: {
    marks: MARKS_LATIN,
    words: {
      period: ['ponto', 'ponto final'],
      comma: ['vírgula'],
      question: ['ponto de interrogação'],
      exclamation: ['ponto de exclamação'],
      colon: ['dois pontos'],
      semicolon: ['ponto e vírgula'],
      newline: ['nova linha'],
      paragraph: ['novo parágrafo'],
    },
  },
  ru: {
    marks: MARKS_LATIN,
    words: {
      period: ['точка'],
      comma: ['запятая'],
      question: ['вопросительный знак'],
      exclamation: ['восклицательный знак'],
      colon: ['двоеточие'],
      semicolon: ['точка с запятой'],
      newline: ['новая строка', 'с новой строки'],
      paragraph: ['новый абзац'],
    },
  },
  tr: {
    marks: MARKS_LATIN,
    words: {
      period: ['nokta'],
      comma: ['virgül'],
      question: ['soru işareti'],
      exclamation: ['ünlem işareti'],
      colon: ['iki nokta'],
      semicolon: ['noktalı virgül'],
      newline: ['yeni satır'],
      paragraph: ['yeni paragraf'],
    },
  },
  nl: {
    marks: MARKS_LATIN,
    words: {
      period: ['punt'],
      comma: ['komma'],
      question: ['vraagteken'],
      exclamation: ['uitroepteken'],
      colon: ['dubbele punt'],
      semicolon: ['puntkomma'],
      newline: ['nieuwe regel'],
      paragraph: ['nieuwe alinea'],
    },
  },
  pl: {
    marks: MARKS_LATIN,
    words: {
      period: ['kropka'],
      comma: ['przecinek'],
      question: ['znak zapytania', 'pytajnik'],
      exclamation: ['wykrzyknik'],
      colon: ['dwukropek'],
      semicolon: ['średnik'],
      newline: ['nowa linia', 'nowy wiersz'],
      paragraph: ['nowy akapit'],
    },
  },
  sv: {
    marks: MARKS_LATIN,
    words: {
      period: ['punkt'],
      comma: ['kommatecken', 'komma'],
      question: ['frågetecken'],
      exclamation: ['utropstecken'],
      colon: ['kolon'],
      semicolon: ['semikolon'],
      newline: ['ny rad'],
      paragraph: ['nytt stycke'],
    },
  },
  uk: {
    marks: MARKS_LATIN,
    words: {
      period: ['крапка'],
      comma: ['кома'],
      question: ['знак питання'],
      exclamation: ['знак оклику'],
      colon: ['двокрапка'],
      semicolon: ['крапка з комою'],
      newline: ['новий рядок'],
      paragraph: ['новий абзац'],
    },
  },
  id: {
    marks: MARKS_LATIN,
    words: {
      period: ['titik'],
      comma: ['koma'],
      question: ['tanda tanya'],
      exclamation: ['tanda seru'],
      colon: ['titik dua'],
      semicolon: ['titik koma'],
      newline: ['baris baru'],
      paragraph: ['paragraf baru'],
    },
  },
  hi: {
    marks: { ...MARKS_LATIN, period: '।' }, // Devanagari danda
    words: {
      period: ['पूर्ण विराम', 'फुल स्टॉप'],
      comma: ['अल्पविराम', 'कॉमा'],
      question: ['प्रश्नवाचक चिह्न'],
      exclamation: ['विस्मयादिबोधक चिह्न'],
      newline: ['नई लाइन', 'नई पंक्ति'],
      paragraph: ['नया पैराग्राफ'],
    },
  },
  ja: {
    marks: MARKS_CJK,
    words: {
      period: ['句点', 'まる'],
      comma: ['読点', 'てん'],
      question: ['疑問符', 'はてな'],
      exclamation: ['感嘆符', 'びっくりマーク'],
      newline: ['改行'],
      paragraph: ['新しい段落'],
    },
  },
  zh: {
    marks: MARKS_CJK,
    words: {
      period: ['句号'],
      comma: ['逗号'],
      question: ['问号'],
      exclamation: ['感叹号'],
      colon: ['冒号'],
      semicolon: ['分号'],
      newline: ['换行'],
      paragraph: ['新段落'],
    },
  },
  ko: {
    marks: MARKS_LATIN,
    words: {
      period: ['마침표'],
      comma: ['쉼표'],
      question: ['물음표'],
      exclamation: ['느낌표'],
      colon: ['콜론'],
      semicolon: ['세미콜론'],
      newline: ['새 줄', '줄 바꿈'],
      paragraph: ['새 단락'],
    },
  },
};

interface CompiledRule {
  tokens: string[];
  insert: string;
  kind: PunctuationRule['kind'];
}

function buildRules(base: string): CompiledRule[] {
  const spec = COMMANDS[base];
  if (!spec) return [];
  const { marks, words } = spec;
  const rules: PunctuationRule[] = [];
  const add = (phrases: string[] | undefined, insert: string, kind: PunctuationRule['kind']) => {
    if (phrases?.length) rules.push({ phrases, insert, kind });
  };
  // Order longer phrases first (semicolon "point virgule" before "point") via the sort below.
  add(words.semicolon, marks.semicolon, 'attach');
  add(words.question, marks.question, 'attach');
  add(words.exclamation, marks.exclamation, 'attach');
  add(words.colon, marks.colon, 'attach');
  add(words.paragraph, '\n\n', 'newline');
  add(words.newline, '\n', 'newline');
  add(words.period, marks.period, 'attach');
  add(words.comma, marks.comma, 'attach');
  add(words.space, ' ', 'space');

  const compiled: CompiledRule[] = [];
  for (const rule of rules) {
    for (const phrase of rule.phrases) {
      compiled.push({ tokens: phrase.split(/\s+/), insert: rule.insert, kind: rule.kind });
    }
  }
  return compiled.sort((a, b) => b.tokens.length - a.tokens.length);
}

const RULE_CACHE = new Map<string, CompiledRule[]>();
function rulesForLang(lang: string): CompiledRule[] {
  const base = lang.toLowerCase().split('-')[0];
  let cached = RULE_CACHE.get(base);
  if (!cached) {
    cached = buildRules(base);
    RULE_CACHE.set(base, cached);
  }
  return cached;
}

/**
 * Rebuild a transcript with spoken punctuation commands turned into real punctuation.
 * Works token-by-token so spacing stays correct: attach-punctuation glues to the previous
 * word, newlines break the line, and everything else is space-joined.
 */
export function applyPunctuationCommands(text: string, lang: string): string {
  const rules = rulesForLang(lang);
  if (rules.length === 0) return text;

  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return text;

  let out = '';
  let needsSpace = false;

  const appendWord = (word: string) => {
    if (needsSpace && out.length > 0 && !out.endsWith('\n')) out += ' ';
    out += word;
    needsSpace = true;
  };

  for (let i = 0; i < tokens.length; ) {
    const matched = rules.find((rule) =>
      rule.tokens.every((t, k) => tokens[i + k]?.toLowerCase() === t.toLowerCase()),
    );

    if (matched) {
      i += matched.tokens.length;
      if (matched.kind === 'attach') {
        out += matched.insert;
        needsSpace = true;
      } else if (matched.kind === 'newline') {
        out = out.replace(/[ \t]+$/, '') + matched.insert;
        needsSpace = false;
      } else {
        if (!out.endsWith(' ') && !out.endsWith('\n')) out += ' ';
        needsSpace = false;
      }
      continue;
    }

    appendWord(tokens[i]);
    i += 1;
  }

  return out;
}

/** Language-appropriate output: Persian/Arabic get native chars, ZWNJ, and digit glyphs. */
function localizeOutput(text: string, lang: string): string {
  const base = lang.toLowerCase().split('-')[0];
  if (base === 'fa') {
    // Arabic-form letters → Persian, common ZWNJ fixes, and Persian digit glyphs.
    return halfSpace(digitsEnToFa(toPersianChars(text)));
  }
  if (base === 'ar') {
    return digitsEnToAr(text);
  }
  // Other languages keep Latin digits and their own script as recognized.
  return text;
}

export interface ProcessingOptions {
  lang: string;
  punctuationCommands: boolean;
}

/** Full pipeline for a finalized transcript segment. */
export function processFinalTranscript(text: string, opts: ProcessingOptions): string {
  let result = text;
  if (opts.punctuationCommands) result = applyPunctuationCommands(result, opts.lang);
  result = localizeOutput(result, opts.lang);
  return result;
}
