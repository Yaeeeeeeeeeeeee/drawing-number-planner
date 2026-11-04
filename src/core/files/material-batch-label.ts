/** Business label only; filesystem paths and batch ordering remain unchanged. */
export function materialBatchLabel(name: string): string {
  const prefixed = /^\d{2}\.(.+)$/.exec(name);
  if (!prefixed) return name;
  const label = prefixed[1];
  // Recognize batch dates and descriptions, rather than decimals or version numbers.
  const dates = /^(\d{8}(?:~\d{8})*)(?:（[^（）\r\n]+）|\([^()\r\n]+\))?$/.exec(label);
  if (dates) return dates[1].split('~').every(isBatchDate) ? label : name;
  const description = /^([\p{Script=Han}]+)(?:（(\d{8})）|\((\d{8})\))?$/u.exec(label);
  if (description && /首批|次批|第[一二三四五六七八九十百零]+批|大货/.test(description[1])) {
    const date = description[2] ?? description[3];
    if (!date || isBatchDate(date)) return label;
  }
  return name;
}

function isBatchDate(value: string): boolean {
  const dateText = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateText;
}
