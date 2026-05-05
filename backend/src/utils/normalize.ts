const TR_MAP: Record<string, string> = {
  ç: 'c', Ç: 'C',
  ğ: 'g', Ğ: 'G',
  ı: 'i', İ: 'I',
  ö: 'o', Ö: 'O',
  ş: 's', Ş: 'S',
  ü: 'u', Ü: 'U',
};

export function normalizeTurkish(text: string): string {
  return text.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR_MAP[c] ?? c);
}

export function containsTrigger(text: string): boolean {
  const normalized = normalizeTurkish(text).toLowerCase();
  return normalized.includes('maradona');
}

export function normalizeNameForMatch(name: string): string {
  return normalizeTurkish(name).toLowerCase().trim();
}
