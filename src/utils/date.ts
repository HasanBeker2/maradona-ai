const DAY_MAP_TR: Record<string, number> = {
  pazartesi: 1, sali: 2, çarşamba: 3, carsamba: 3,
  persembe: 4, perşembe: 4, cuma: 5, cumartesi: 6, pazar: 0,
};

const DAY_MAP_EN: Record<string, number> = {
  monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
  friday: 5, saturday: 6, sunday: 0,
};

export function parseDueDate(text: string | null): string | null {
  if (!text) return null;

  const lower = text.toLowerCase().trim();
  const today = new Date();

  const dayNum =
    DAY_MAP_TR[lower] ??
    DAY_MAP_EN[lower] ??
    null;

  if (dayNum !== null) {
    const current = today.getDay();
    let diff = dayNum - current;
    if (diff <= 0) diff += 7;
    const target = new Date(today);
    target.setDate(today.getDate() + diff);
    return target.toISOString().split('T')[0]!;
  }

  const relative: Record<string, number> = {
    today: 0, bugün: 0, bugun: 0,
    tomorrow: 1, yarin: 1, yarın: 1,
  };
  if (relative[lower] !== undefined) {
    const target = new Date(today);
    target.setDate(today.getDate() + relative[lower]!);
    return target.toISOString().split('T')[0]!;
  }

  // DD.MM.YYYY format (Turkish)
  const dotMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotMatch) {
    return `${dotMatch[3]}-${dotMatch[2]}-${dotMatch[1]}`;
  }

  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]!;
  }

  return null;
}
