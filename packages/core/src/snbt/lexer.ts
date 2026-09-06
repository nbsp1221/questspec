import type { SnbtPosition, SnbtSpan } from './ast.ts';
import { SnbtParseError } from './error.ts';

export type SnbtTokenType =
  | 'atom'
  | 'colon'
  | 'comma'
  | 'eof'
  | 'equals'
  | 'left-brace'
  | 'left-bracket'
  | 'right-brace'
  | 'right-bracket'
  | 'semicolon'
  | 'string';

export interface SnbtToken {
  span: SnbtSpan;
  type: SnbtTokenType;
  value?: string;
}

export interface SnbtLexerOptions {
  discardUnknownEscapes?: boolean;
}

const punctuation: Readonly<Record<string, SnbtTokenType>> = {
  ':': 'colon',
  ',': 'comma',
  '=': 'equals',
  '{': 'left-brace',
  '[': 'left-bracket',
  '}': 'right-brace',
  ']': 'right-bracket',
  ';': 'semicolon',
};

const simpleCharacter = /[\p{L}\p{N}._+\-∞]/u;

export class SnbtLexer {
  private column = 1;
  private index = 0;
  private line = 1;
  private lineHasOnlyWhitespace = true;
  private readonly options: SnbtLexerOptions;
  private readonly source: string;

  constructor(source: string, options: SnbtLexerOptions = {}) {
    this.options = options;
    this.source = source;
  }

  next(): SnbtToken {
    this.skipIgnored();
    const start = this.position();
    const character = this.peek();

    if (character === undefined) {
      return { span: { end: start, start }, type: 'eof' };
    }

    const punctuationType = punctuation[character];
    if (punctuationType) {
      this.advance();
      return { span: { end: this.position(), start }, type: punctuationType };
    }

    if (character === '"' || character === "'") {
      return this.readQuotedString(character, start);
    }

    if (simpleCharacter.test(character)) {
      let value = '';
      while (this.peek() !== undefined && simpleCharacter.test(this.peek()!)) {
        value += this.advance();
      }
      return { span: { end: this.position(), start }, type: 'atom', value };
    }

    this.advance();
    throw new SnbtParseError(
      'SNBT_INVALID_CHARACTER',
      `Unexpected character ${JSON.stringify(character)}`,
      { end: this.position(), start },
    );
  }

  private advance(): string {
    const character = this.source[this.index];
    this.index += 1;

    if (character === '\n') {
      this.column = 1;
      this.line += 1;
      this.lineHasOnlyWhitespace = true;
    } else {
      this.column += 1;
      if (!/\s/u.test(character)) {
        this.lineHasOnlyWhitespace = false;
      }
    }

    return character;
  }

  private peek(distance = 0): string | undefined {
    return this.source[this.index + distance];
  }

  private position(): SnbtPosition {
    return { column: this.column, line: this.line, offset: this.index };
  }

  private readQuotedString(quote: string, start: SnbtPosition): SnbtToken {
    this.advance();
    let value = '';
    const escapes: Readonly<Record<string, string>> = {
      '"': '"',
      "'": "'",
      '\\': '\\',
      'b': '\b',
      'f': '\f',
      'n': '\n',
      'r': '\r',
      't': '\t',
    };

    while (this.peek() !== undefined) {
      const character = this.advance();
      if (character === quote) {
        return { span: { end: this.position(), start }, type: 'string', value };
      }
      if (character === '\n') {
        throw new SnbtParseError('SNBT_UNTERMINATED_STRING', `String is not closed with ${quote}`, {
          end: this.position(),
          start,
        });
      }
      if (character !== '\\') {
        value += character;
        continue;
      }

      const escapeStart = this.position();
      const escaped = this.peek();
      if (escaped === undefined || escapes[escaped] === undefined) {
        if (escaped !== undefined) {
          this.advance();
        }
        if (escaped !== undefined && this.options.discardUnknownEscapes) {
          continue;
        }
        throw new SnbtParseError(
          'SNBT_INVALID_ESCAPE',
          `Unsupported escape sequence \\${escaped ?? ''}`,
          { end: this.position(), start: escapeStart },
        );
      }
      this.advance();
      value += escapes[escaped];
    }

    throw new SnbtParseError('SNBT_UNTERMINATED_STRING', `String is not closed with ${quote}`, {
      end: this.position(),
      start,
    });
  }

  private skipIgnored(): void {
    while (true) {
      const character = this.peek();
      if (character === undefined) {
        return;
      }

      if (/\s/u.test(character)) {
        this.advance();
        continue;
      }

      const isComment =
        this.lineHasOnlyWhitespace &&
        (character === '#' || (character === '/' && this.peek(1) === '/'));
      if (!isComment) {
        return;
      }

      while (this.peek() !== undefined && this.peek() !== '\n') {
        this.advance();
      }
    }
  }
}
