/** RFC 4180 field escaping: quote when the value carries a delimiter, quote, or newline. */
export function toCsv(headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\n");
}