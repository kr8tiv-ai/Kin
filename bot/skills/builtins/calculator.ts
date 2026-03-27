/**
 * Calculator Skill - Safe arithmetic expression evaluator
 *
 * Parses and evaluates mathematical expressions without using eval().
 * Implements a recursive-descent parser supporting:
 *   - Basic arithmetic: +, -, *, /
 *   - Exponentiation: ^
 *   - Parentheses for grouping
 *   - Negative numbers and unary minus
 */

import type { KinSkill, SkillContext, SkillResult } from '../types.js';

// ============================================================================
// Token Types
// ============================================================================

type TokenType = 'NUMBER' | 'PLUS' | 'MINUS' | 'MULTIPLY' | 'DIVIDE' | 'POWER' | 'LPAREN' | 'RPAREN' | 'EOF';

interface Token {
  type: TokenType;
  value: number | null;
}

// ============================================================================
// Tokenizer
// ============================================================================

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < expression.length) {
    const ch = expression[pos]!;

    // Skip whitespace
    if (/\s/.test(ch)) {
      pos++;
      continue;
    }

    // Numbers (including decimals)
    if (/\d/.test(ch) || (ch === '.' && pos + 1 < expression.length && /\d/.test(expression[pos + 1]!))) {
      let numStr = '';
      while (pos < expression.length && (/\d/.test(expression[pos]!) || expression[pos] === '.')) {
        numStr += expression[pos];
        pos++;
      }
      const value = parseFloat(numStr);
      if (isNaN(value)) {
        throw new Error(`Invalid number: "${numStr}"`);
      }
      tokens.push({ type: 'NUMBER', value });
      continue;
    }

    // Operators and parentheses
    const opMap: Record<string, TokenType> = {
      '+': 'PLUS',
      '-': 'MINUS',
      '*': 'MULTIPLY',
      '/': 'DIVIDE',
      '^': 'POWER',
      '(': 'LPAREN',
      ')': 'RPAREN',
    };

    // Also accept 'x' and 'X' as multiplication (e.g. "3x5")
    if (ch === 'x' || ch === 'X') {
      tokens.push({ type: 'MULTIPLY', value: null });
      pos++;
      continue;
    }

    const tokenType = opMap[ch];
    if (tokenType) {
      tokens.push({ type: tokenType, value: null });
      pos++;
      continue;
    }

    throw new Error(`Unexpected character: "${ch}"`);
  }

  tokens.push({ type: 'EOF', value: null });
  return tokens;
}

// ============================================================================
// Recursive-Descent Parser
// ============================================================================

class ExpressionParser {
  private tokens: Token[];
  private pos: number;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.pos = 0;
  }

  private current(): Token {
    return this.tokens[this.pos]!;
  }

  private consume(expected?: TokenType): Token {
    const token = this.current();
    if (expected && token.type !== expected) {
      throw new Error(`Expected ${expected} but got ${token.type}`);
    }
    this.pos++;
    return token;
  }

  /**
   * Grammar (precedence low-to-high):
   *   expr       = term (('+' | '-') term)*
   *   term       = power (('*' | '/') power)*
   *   power      = unary ('^' unary)*       (right-associative)
   *   unary      = ('-' unary) | primary
   *   primary    = NUMBER | '(' expr ')'
   */

  parse(): number {
    const result = this.expr();
    if (this.current().type !== 'EOF') {
      throw new Error('Unexpected tokens after expression');
    }
    return result;
  }

  private expr(): number {
    let left = this.term();

    while (this.current().type === 'PLUS' || this.current().type === 'MINUS') {
      const op = this.consume();
      const right = this.term();
      left = op.type === 'PLUS' ? left + right : left - right;
    }

    return left;
  }

  private term(): number {
    let left = this.power();

    while (this.current().type === 'MULTIPLY' || this.current().type === 'DIVIDE') {
      const op = this.consume();
      const right = this.power();

      if (op.type === 'DIVIDE' && right === 0) {
        throw new Error('Division by zero');
      }

      left = op.type === 'MULTIPLY' ? left * right : left / right;
    }

    return left;
  }

  private power(): number {
    const base = this.unary();

    if (this.current().type === 'POWER') {
      this.consume();
      // Right-associative: 2^3^2 = 2^(3^2) = 512
      const exponent = this.power();
      return Math.pow(base, exponent);
    }

    return base;
  }

  private unary(): number {
    if (this.current().type === 'MINUS') {
      this.consume();
      return -this.unary();
    }

    if (this.current().type === 'PLUS') {
      this.consume();
      return this.unary();
    }

    return this.primary();
  }

  private primary(): number {
    const token = this.current();

    if (token.type === 'NUMBER') {
      this.consume();
      return token.value!;
    }

    if (token.type === 'LPAREN') {
      this.consume('LPAREN');
      const result = this.expr();
      this.consume('RPAREN');
      return result;
    }

    throw new Error(`Unexpected token: ${token.type}`);
  }
}

// ============================================================================
// Public Evaluate Function
// ============================================================================

export function safeEvaluate(expression: string): number {
  if (!expression.trim()) {
    throw new Error('Empty expression');
  }

  const tokens = tokenize(expression);
  const parser = new ExpressionParser(tokens);
  return parser.parse();
}

// ============================================================================
// Expression Extraction
// ============================================================================

/**
 * Extracts a math expression from a natural-language message.
 *
 * Patterns:
 *   "calculate 2 + 3"
 *   "what is 5 * 10"
 *   "math 100 / 4"
 *   "2 + 2"  (bare expression)
 */
function extractExpression(message: string): string | null {
  // Strip known prefixes
  const prefixPatterns = [
    /^(?:calculate|compute|eval|solve|math)\s+/i,
    /^what(?:'s| is)\s+/i,
    /^how much is\s+/i,
  ];

  let cleaned = message.trim();
  for (const pattern of prefixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove trailing question marks
  cleaned = cleaned.replace(/\?+$/, '').trim();

  // Verify it looks like a math expression (digits and operators)
  if (/[\d]/.test(cleaned) && /[+\-*/^()]/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

// ============================================================================
// Skill Definition
// ============================================================================

export const calculatorSkill: KinSkill = {
  name: 'calculator',
  description: 'Safely evaluates arithmetic expressions (no eval)',
  triggers: [
    'calculate',
    'compute',
    'math',
    '\\d+\\s*[+\\-*/^]\\s*\\d+',
    'what is \\d',
    'what\'s \\d',
    'how much is',
  ],

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const expression = extractExpression(ctx.message);

    if (!expression) {
      return {
        content:
          'Give me a math expression to solve! For example: "calculate 2 + 3 * 4" or "what is 100 / 5".',
        type: 'text',
      };
    }

    try {
      const result = safeEvaluate(expression);

      // Format: avoid floating point noise (e.g. 0.1 + 0.2 = 0.30000000000000004)
      const formatted = Number.isInteger(result)
        ? result.toString()
        : parseFloat(result.toPrecision(12)).toString();

      return {
        content: `*${expression}* = *${formatted}*`,
        type: 'markdown',
        metadata: {
          expression,
          result,
        },
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid expression';

      return {
        content: `Could not evaluate "${expression}": ${message}`,
        type: 'error',
        metadata: { expression, error: message },
      };
    }
  },
};

export default calculatorSkill;
