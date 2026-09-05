const STOPWORDS = new Set([
  "o", "a", "os", "as", "de", "da", "do", "das", "dos",
  "em", "no", "na", "nos", "nas", "para", "pra", "um", "uma",
  "uns", "umas", "com", "por", "que", "e",
]);

const DIACRITICS_REGEX = /[̀-ͯ]/g;

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}
