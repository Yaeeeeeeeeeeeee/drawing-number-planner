/** Business label only; filesystem paths and batch ordering remain unchanged. */
export function materialBatchLabel(name: string): string {
  if (/^\d{2}\.首批大货$/.test(name)) return '首批大货';
  const match = /^\d{2}\.(\d{4})(\d{2})(\d{2})$/.exec(name);
  if (!match) return name;
  const dateText = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateText
    ? `${match[1]}${match[2]}${match[3]}` : name;
}
