export function quoteCsvCell(value) {
  let text = String(value ?? '');
  // Quoting escapes delimiters but spreadsheets may still interpret a quoted cell as a formula.
  if (/^[\s\u0000-\u001f]*[=+@-]|^[\t\r\n]/u.test(text.normalize('NFKC'))) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
