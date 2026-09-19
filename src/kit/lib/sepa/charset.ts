const ALLOWED_CHARACTER = /[A-Za-z0-9/\-?:().,'+ ]/;

const COMBINING_MARKS = /[\u0300-\u036f]/g;

export const DEFAULT_TRANSLITERATION: Readonly<Record<string, string>> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  Ä: "Ae",
  Ö: "Oe",
  Ü: "Ue",
  ß: "ss",
  æ: "ae",
  Æ: "Ae",
  ø: "oe",
  Ø: "Oe",
  å: "aa",
  Å: "Aa",
  đ: "d",
  Đ: "D",
  ł: "l",
  Ł: "L",
  þ: "th",
  Þ: "Th",
  ð: "d",
  Ð: "D",
  œ: "oe",
  Œ: "Oe",
  "&": "+",
  " ": " ",
};

function applyTable(text: string, table: Readonly<Record<string, string>>): string {
  let result = "";
  for (const character of text) {
    result += table[character] ?? character;
  }
  return result;
}

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(COMBINING_MARKS, "");
}

function replaceUnsupported(text: string): string {
  let result = "";
  for (const character of text) {
    result += ALLOWED_CHARACTER.test(character) ? character : " ";
  }
  return result;
}

function collapseSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function toSepaCharacters(
  text: string,
  table: Readonly<Record<string, string>> = DEFAULT_TRANSLITERATION,
): string {
  return collapseSpaces(replaceUnsupported(stripAccents(applyTable(text, table))));
}

export function isSepaCharacters(text: string): boolean {
  for (const character of text) {
    if (!ALLOWED_CHARACTER.test(character)) return false;
  }
  return true;
}

export function shorten(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit).trimEnd();
}
