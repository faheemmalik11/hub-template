import type { QueryColumnSpec, QueryColumnType } from "./types";

export class WhereClauseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhereClauseError";
  }
}

type TokenKind =
  "identifier" | "keyword" | "number" | "string" | "operator" | "lparen" | "rparen" | "comma";

interface Token {
  kind: TokenKind;
  value: string;
}

const KEYWORDS = new Set([
  "and",
  "or",
  "not",
  "is",
  "null",
  "in",
  "between",
  "ilike",
  "like",
  "true",
  "false",
  "extract",
  "from",
  "month",
  "year",
]);

const COMPARISON_OPERATORS = new Set(["=", "<>", "!=", ">", ">=", "<", "<="]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", value: "(" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", value: ")" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma", value: "," });
      i += 1;
      continue;
    }
    if (ch === "'") {
      let value = "";
      i += 1;
      for (;;) {
        if (i >= input.length) throw new WhereClauseError("Unterminated string literal.");
        if (input[i] === "'" && input[i + 1] === "'") {
          value += "'";
          i += 2;
          continue;
        }
        if (input[i] === "'") {
          i += 1;
          break;
        }
        value += input[i];
        i += 1;
      }
      tokens.push({ kind: "string", value });
      continue;
    }
    const twoChar = input.slice(i, i + 2);
    if (twoChar === "<>" || twoChar === "!=" || twoChar === ">=" || twoChar === "<=") {
      tokens.push({ kind: "operator", value: twoChar === "!=" ? "<>" : twoChar });
      i += 2;
      continue;
    }
    if (ch === "=" || ch === ">" || ch === "<") {
      tokens.push({ kind: "operator", value: ch });
      i += 1;
      continue;
    }
    const numberMatch = /^-?\d+(\.\d+)?/.exec(input.slice(i));
    if (numberMatch && (ch === "-" || /\d/.test(ch))) {
      tokens.push({ kind: "number", value: numberMatch[0] });
      i += numberMatch[0].length;
      continue;
    }
    const wordMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(input.slice(i));
    if (wordMatch) {
      const word = wordMatch[0].toLowerCase();
      tokens.push({ kind: KEYWORDS.has(word) ? "keyword" : "identifier", value: word });
      i += wordMatch[0].length;
      continue;
    }
    throw new WhereClauseError(`Unexpected character "${ch}" in WHERE clause.`);
  }
  return tokens;
}

function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class Parser {
  private position = 0;
  comparisonCount = 0;

  constructor(
    private tokens: Token[],
    private columns: Map<string, QueryColumnSpec>,
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private next(): Token {
    const token = this.tokens[this.position];
    if (!token) throw new WhereClauseError("Unexpected end of WHERE clause.");
    this.position += 1;
    return token;
  }

  private expectKeyword(word: string) {
    const token = this.next();
    if (token.kind !== "keyword" || token.value !== word) {
      throw new WhereClauseError(`Expected "${word}" but found "${token.value}".`);
    }
  }

  atEnd(): boolean {
    return this.position >= this.tokens.length;
  }

  parseExpression(): string {
    let result = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (token?.kind === "keyword" && (token.value === "and" || token.value === "or")) {
        this.next();
        result = `${result} ${token.value} ${this.parseTerm()}`;
        continue;
      }
      return result;
    }
  }

  private parseTerm(): string {
    const token = this.peek();
    if (token?.kind === "keyword" && token.value === "not") {
      this.next();
      return `not ${this.parseTerm()}`;
    }
    if (token?.kind === "lparen") {
      this.next();
      const inner = this.parseExpression();
      const closing = this.next();
      if (closing.kind !== "rparen") throw new WhereClauseError("Expected closing parenthesis.");
      return `(${inner})`;
    }
    return this.parseComparison();
  }

  private column(): QueryColumnSpec {
    const token = this.next();
    if (token.kind !== "identifier") {
      throw new WhereClauseError(`Expected a column name but found "${token.value}".`);
    }
    const spec = this.columns.get(token.value);
    if (!spec) throw new WhereClauseError(`Column "${token.value}" is not allowed.`);
    return spec;
  }

  private literal(type: QueryColumnType): string {
    const token = this.next();
    if (type === "number") {
      if (token.kind !== "number") {
        throw new WhereClauseError(
          `Expected a number for a numeric column, found "${token.value}".`,
        );
      }
      return token.value;
    }
    if (type === "date") {
      if (token.kind !== "string" || !DATE_PATTERN.test(token.value)) {
        throw new WhereClauseError(`Expected a 'YYYY-MM-DD' date literal, found "${token.value}".`);
      }
      return quoteString(token.value);
    }
    if (type === "boolean") {
      if (token.kind !== "keyword" || (token.value !== "true" && token.value !== "false")) {
        throw new WhereClauseError(
          `Expected true or false for a boolean column, found "${token.value}".`,
        );
      }
      return token.value;
    }
    if (token.kind !== "string") {
      throw new WhereClauseError(
        `Expected a quoted string for a text column, found "${token.value}".`,
      );
    }
    return quoteString(token.value);
  }

  private parseExtract(): string {
    this.next();
    const opening = this.next();
    if (opening.kind !== "lparen") throw new WhereClauseError('Expected "(" after extract.');
    const part = this.next();
    if (part.kind !== "keyword" || (part.value !== "month" && part.value !== "year")) {
      throw new WhereClauseError("extract() supports only month or year.");
    }
    this.expectKeyword("from");
    const spec = this.column();
    if (spec.type !== "date") {
      throw new WhereClauseError(`extract() is only allowed on date columns, not "${spec.name}".`);
    }
    const closing = this.next();
    if (closing.kind !== "rparen") throw new WhereClauseError('Expected ")" to close extract.');
    this.comparisonCount += 1;
    const operatorToken = this.next();
    if (operatorToken.kind !== "operator" || !COMPARISON_OPERATORS.has(operatorToken.value)) {
      throw new WhereClauseError(`Unsupported operator "${operatorToken.value}" after extract().`);
    }
    const value = this.next();
    if (value.kind !== "number" || !/^\d+$/.test(value.value)) {
      throw new WhereClauseError("extract() comparisons need a plain whole number.");
    }
    return `extract(${part.value} from ${spec.name}) ${operatorToken.value} ${value.value}`;
  }

  private parseComparison(): string {
    const upcoming = this.peek();
    if (upcoming?.kind === "keyword" && upcoming.value === "extract") {
      return this.parseExtract();
    }
    const spec = this.column();
    this.comparisonCount += 1;
    const token = this.next();

    if (token.kind === "keyword" && token.value === "is") {
      let negated = false;
      let follower = this.next();
      if (follower.kind === "keyword" && follower.value === "not") {
        negated = true;
        follower = this.next();
      }
      if (follower.kind !== "keyword" || follower.value !== "null") {
        throw new WhereClauseError('Expected NULL after "is".');
      }
      return `${spec.name} is ${negated ? "not " : ""}null`;
    }

    let negated = false;
    let operatorToken = token;
    if (operatorToken.kind === "keyword" && operatorToken.value === "not") {
      negated = true;
      operatorToken = this.next();
    }

    if (operatorToken.kind === "keyword" && operatorToken.value === "in") {
      const opening = this.next();
      if (opening.kind !== "lparen") throw new WhereClauseError('Expected "(" after IN.');
      const values: string[] = [];
      for (;;) {
        values.push(this.literal(spec.type));
        const separator = this.next();
        if (separator.kind === "comma") continue;
        if (separator.kind === "rparen") break;
        throw new WhereClauseError("Expected ',' or ')' inside IN list.");
      }
      return `${spec.name} ${negated ? "not " : ""}in (${values.join(", ")})`;
    }

    if (operatorToken.kind === "keyword" && operatorToken.value === "between") {
      if (negated) throw new WhereClauseError("NOT BETWEEN is not supported.");
      if (spec.type !== "number" && spec.type !== "date") {
        throw new WhereClauseError(
          `BETWEEN is only allowed on number or date columns, not "${spec.name}".`,
        );
      }
      const lower = this.literal(spec.type);
      this.expectKeyword("and");
      const upper = this.literal(spec.type);
      return `${spec.name} between ${lower} and ${upper}`;
    }

    if (
      operatorToken.kind === "keyword" &&
      (operatorToken.value === "ilike" || operatorToken.value === "like")
    ) {
      if (spec.type !== "text") {
        throw new WhereClauseError(`ILIKE is only allowed on text columns, not "${spec.name}".`);
      }
      const pattern = this.next();
      if (pattern.kind !== "string") {
        throw new WhereClauseError("Expected a quoted pattern after ILIKE.");
      }
      return `${spec.name} ${negated ? "not " : ""}ilike ${quoteString(pattern.value)}`;
    }

    if (negated) throw new WhereClauseError(`Unexpected "not" before "${operatorToken.value}".`);

    if (operatorToken.kind !== "operator" || !COMPARISON_OPERATORS.has(operatorToken.value)) {
      throw new WhereClauseError(`Unsupported operator "${operatorToken.value}".`);
    }
    if (spec.type === "boolean" && operatorToken.value !== "=" && operatorToken.value !== "<>") {
      throw new WhereClauseError(`Only = and <> are allowed on boolean column "${spec.name}".`);
    }
    if (spec.type === "text" && !["=", "<>"].includes(operatorToken.value)) {
      throw new WhereClauseError(
        `Only =, <> and ILIKE are allowed on text column "${spec.name}"; ranges need a number or date column.`,
      );
    }
    return `${spec.name} ${operatorToken.value} ${this.literal(spec.type)}`;
  }
}

export function validateWhereClause(
  rawClause: string,
  columns: QueryColumnSpec[],
  maxConditions = 12,
): string {
  const trimmed = rawClause.trim().replace(/;+\s*$/, "");
  if (!trimmed) throw new WhereClauseError("WHERE clause is empty.");
  if (trimmed.length > 2000) throw new WhereClauseError("WHERE clause is too long.");
  const catalog = new Map(columns.map((column) => [column.name.toLowerCase(), column]));
  const parser = new Parser(tokenize(trimmed), catalog);
  const normalized = parser.parseExpression();
  if (!parser.atEnd()) {
    throw new WhereClauseError("Unexpected trailing content after the WHERE clause.");
  }
  if (parser.comparisonCount === 0) {
    throw new WhereClauseError("WHERE clause contains no condition.");
  }
  if (parser.comparisonCount > maxConditions) {
    throw new WhereClauseError(`WHERE clause has more than ${maxConditions} conditions.`);
  }
  return normalized;
}
