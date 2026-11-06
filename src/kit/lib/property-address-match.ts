export interface AddressMatchProperty {
  code: string;
  name: string | null;
  address: string | null;
}

export interface RankedProperty<T extends AddressMatchProperty> {
  property: T;
  score: number;
}

const STREET_MATCH_SCORE = 2;
const HOUSE_NUMBER_MATCH_SCORE = 1;
const CITY_MATCH_SCORE = 1;

export function foldAddressText(text: string | null | undefined): string {
  return (text ?? "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s*(?:strasse|str)(?![a-z])/g, "str")
    .replace(/str(?=\d)/g, "str ")
    .replace(/sstr(?=\s|$)/g, "str")
    .replace(/\s+/g, " ")
    .trim();
}

interface StreetKey {
  street: string;
  lowestNumber: number | null;
  highestNumber: number | null;
}

function parseStreetKey(address: string | null): StreetKey | null {
  const streetPart = (address ?? "").split(",")[0].trim();
  if (!streetPart) return null;
  const withNumber = streetPart.match(
    /^(.*?\D)\s*(\d+)\s*[a-zA-Z]?(?:\s*[-–/]\s*(\d+)\s*[a-zA-Z]?)?\s*$/,
  );
  if (!withNumber) {
    const street = foldAddressText(streetPart);
    return street ? { street, lowestNumber: null, highestNumber: null } : null;
  }
  const street = foldAddressText(withNumber[1]);
  if (!street) return null;
  const first = Number(withNumber[2]);
  const last = withNumber[3] ? Number(withNumber[3]) : first;
  return {
    street,
    lowestNumber: Math.min(first, last),
    highestNumber: Math.max(first, last),
  };
}

function cityOf(property: AddressMatchProperty): string | null {
  const fromAddress = (property.address ?? "").match(/\d{5}\s+(.+)$/);
  if (fromAddress) return foldAddressText(fromAddress[1]) || null;
  const fromName = (property.name ?? "").split(",")[0];
  return foldAddressText(fromName) || null;
}

function scoreProperty(foldedText: string, property: AddressMatchProperty): number {
  const key = parseStreetKey(property.address);
  if (!key) return 0;
  const padded = ` ${foldedText} `;
  const at = padded.indexOf(` ${key.street} `);
  if (at === -1) return 0;
  const tail = padded.slice(at + key.street.length + 1).trim();
  const numberInText = tail.match(/^(\d+)/);
  let score = STREET_MATCH_SCORE;
  if (key.lowestNumber !== null && key.highestNumber !== null && numberInText) {
    const number = Number(numberInText[1]);
    if (number < key.lowestNumber || number > key.highestNumber) return 0;
    score += HOUSE_NUMBER_MATCH_SCORE;
  }
  const city = cityOf(property);
  if (city && padded.includes(` ${city} `)) score += CITY_MATCH_SCORE;
  return score;
}

export function rankPropertiesForAddress<T extends AddressMatchProperty>(
  addressText: string | null | undefined,
  properties: readonly T[],
): RankedProperty<T>[] {
  const foldedText = foldAddressText(addressText);
  if (!foldedText) return [];
  return properties
    .map((property) => ({ property, score: scoreProperty(foldedText, property) }))
    .filter((ranked) => ranked.score > 0)
    .sort((a, b) => b.score - a.score || a.property.code.localeCompare(b.property.code));
}

export function firstAddressText(
  candidates: readonly (string | null | undefined)[],
): string | null {
  for (const candidate of candidates) {
    const trimmed = (candidate ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}
