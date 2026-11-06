const STRONG_LEGAL_FORMS = new Set([
  "gmbh",
  "mbh",
  "ag",
  "kg",
  "kgaa",
  "gbr",
  "egbr",
  "eg",
  "ohg",
  "ug",
  "ek",
  "se",
  "haftungsbeschraenkt",
  "gemeinnuetzige",
  "ggmbh",
]);

const WEAK_LEGAL_FORMS = new Set(["co", "sl", "sa", "sau", "srl"]);

const STIFTUNG_FILLER = new Set(["rechtsfaehige", "rechtsfaehigen", "buergerlichen", "rechts"]);

function foldGermanLetters(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function dropLegalFormRuns(tokens: string[]): string[] {
  const kept: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const startsRun =
      STRONG_LEGAL_FORMS.has(tokens[index]) ||
      ((WEAK_LEGAL_FORMS.has(tokens[index]) || tokens[index] === "und") && index > 0);
    if (!startsRun) {
      kept.push(tokens[index]);
      index += 1;
      continue;
    }
    let end = index;
    let hasStrong = false;
    while (
      end < tokens.length &&
      (STRONG_LEGAL_FORMS.has(tokens[end]) ||
        WEAK_LEGAL_FORMS.has(tokens[end]) ||
        tokens[end] === "und")
    ) {
      if (STRONG_LEGAL_FORMS.has(tokens[end])) hasStrong = true;
      end += 1;
    }
    while (end > index && tokens[end - 1] === "und") end -= 1;
    if (hasStrong && end > index) {
      index = end;
    } else {
      kept.push(tokens[index]);
      index += 1;
    }
  }
  return kept;
}

export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  const folded = foldGermanLetters(String(name)).replace(/&/g, " und ");
  let tokens = folded
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length > 1 && (tokens[0] === "herr" || tokens[0] === "frau")) {
    tokens = tokens.slice(1);
  }
  const withoutFiller = tokens.filter((token) => token !== "firma" && token !== "fa");
  if (withoutFiller.length > 0) tokens = withoutFiller;
  if (tokens.includes("stiftung")) {
    const withoutStiftungFiller = tokens.filter((token) => !STIFTUNG_FILLER.has(token));
    if (withoutStiftungFiller.length > 0) tokens = withoutStiftungFiller;
  }
  const stiftungAndCo =
    tokens.includes("stiftung") && (tokens.includes("kg") || tokens.includes("ohg"));
  if (stiftungAndCo) return tokens;
  const withoutLegalForm = dropLegalFormRuns(tokens);
  return withoutLegalForm.length > 0 ? withoutLegalForm : tokens;
}

export function companyNameKey(name: string | null | undefined): string {
  return [...new Set(nameTokens(name))].sort().join(" ");
}

function editDistanceAtMost(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previousRow = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const currentRow = [i];
    for (let j = 1; j <= right.length; j += 1) {
      currentRow[j] = Math.min(
        previousRow[j] + 1,
        currentRow[j - 1] + 1,
        previousRow[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previousRow = currentRow;
  }
  return previousRow[right.length];
}

export type NameSpellingVerdict = "same" | "other_spelling" | "close" | "different" | "unknown";

export function compareCompanyNameSpelling(
  onDocument: string | null | undefined,
  companyName: string | null | undefined,
): NameSpellingVerdict {
  const left = (onDocument ?? "").trim();
  const right = (companyName ?? "").trim();
  if (!left || !right) return "unknown";
  const collapseSpaces = (text: string) => text.toLowerCase().replace(/\s+/g, " ");
  if (collapseSpaces(left) === collapseSpaces(right)) return "same";
  if (companyNameKey(left) === companyNameKey(right)) return "other_spelling";
  const leftKey = companyNameKey(left).replace(/ /g, "");
  const rightKey = companyNameKey(right).replace(/ /g, "");
  if (leftKey && rightKey && editDistanceAtMost(leftKey, rightKey, 2) <= 2) return "close";
  return "different";
}
