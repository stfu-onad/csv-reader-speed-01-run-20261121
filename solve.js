// csv-speed: a fast drop-in for csv-reader 1.0.0 (make.fun).
//
// run(input) returns exactly what csv-reader 1.0.0 returns for {text, header}:
// {columns, rows, errors}, following the broken-row policy in the competition
// rules. The reference reader was read to pin that policy down; this parser
// is written from scratch: one left-to-right pass, fields cut out with slice
// instead of built character by character, quoted fields skipped to their
// next quote with indexOf, and line breaks counted as they are met.

/** Finds the next CR or LF at or after lastIndex; one search stops at the first of either. */
const BREAK_RE = /[\r\n]/g;

/** Finds the next comma, CR or LF at or after lastIndex. */
const DELIM_RE = /[,\r\n]/g;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = text.charCodeAt(0) === 0xFEFF ? 1 : 0;
  let line = 1;

  while (pos < n) {
    // A line left with no characters is no record.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    const recordLine = line;
    const recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;

    for (;;) {
      let value;
      let ended; // 0 = comma, 1 = line break, 2 = end of text
      let prefix = '';

      if (text.charCodeAt(pos) === 34) {
        // ---- a field that opens with a quote ----
        quoted = true;
        const open = pos;
        const openLine = line;
        let i = pos + 1;
        let seg = i;
        let parts = null;
        let closed = false;
        let closeQ = -1;
        while (i < n) {
          const q = text.indexOf('"', i);
          if (q < 0) { i = n; break; }
          // A line break before the quote means the stretch up to it needs
          // a character walk (CR/CRLF inside quotes read as one LF).
          BREAK_RE.lastIndex = i;
          const br = BREAK_RE.exec(text);
          const m = br !== null && br.index < q ? br.index : -1;
          if (m < 0) {
            // Clean stretch: no CR or LF before the quote.
            if (text.charCodeAt(q + 1) === 34) {
              // A doubled quote is one quote in the value.
              if (parts === null) parts = [text.slice(seg, q + 1)];
              else parts.push(text.slice(seg, q + 1));
              i = q + 2;
              seg = i;
              continue;
            }
            closed = true;
            closeQ = q;
            i = q + 1;
            break;
          }
          // Walk the stretch [i, q): CR and CRLF become one LF, LF counts.
          let k = i;
          while (k < q) {
            const c = text.charCodeAt(k);
            if (c === 13) {
              if (parts === null) parts = [text.slice(seg, k)];
              else parts.push(text.slice(seg, k));
              parts.push('\n');
              line += 1;
              k += text.charCodeAt(k + 1) === 10 ? 2 : 1;
              seg = k;
            } else {
              if (c === 10) line += 1;
              k += 1;
            }
          }
          if (text.charCodeAt(q + 1) === 34) {
            if (parts === null) parts = [text.slice(seg, q + 1)];
            else parts.push(text.slice(seg, q + 1));
            i = q + 2;
            seg = i;
            continue;
          }
          closed = true;
          closeQ = q;
          i = q + 1;
          break;
        }

        if (closed) {
          if (parts === null) value = text.slice(seg, closeQ);
          else { parts.push(text.slice(seg, closeQ)); value = parts.join(''); }
          // What follows the closing quote.
          if (i >= n) {
            ended = 2;
            pos = i;
          } else {
            const c = text.charCodeAt(i);
            if (c === 44) { ended = 0; pos = i + 1; }
            else if (c === 10) { ended = 1; line += 1; pos = i + 1; }
            else if (c === 13 && text.charCodeAt(i + 1) === 10) { ended = 1; line += 1; pos = i + 2; }
            else {
              // Junk after the closing quote, appended as it stands.
              let j = i;
              let jstart = i;
              let jparts = null;
              let added = 0;
              let jend = i;
              ended = 2;
              while (j < n) {
                const c2 = text.charCodeAt(j);
                if (c2 === 44) { jend = j; j += 1; ended = 0; break; }
                if (c2 === 10) { jend = j; j += 1; line += 1; ended = 1; break; }
                if (c2 === 13) {
                  if (text.charCodeAt(j + 1) === 10) { jend = j; j += 2; line += 1; ended = 1; break; }
                  errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
                  if (jparts === null) jparts = [text.slice(jstart, j)];
                  else jparts.push(text.slice(jstart, j));
                  j += 1;
                  jstart = j;
                  continue;
                }
                j += 1;
              }
              if (ended === 2) jend = j;
              if (jparts === null) {
                added = jend - jstart;
                value += text.slice(jstart, jend);
              } else {
                jparts.push(text.slice(jstart, jend));
                const js = jparts.join('');
                added = js.length;
                value += js;
              }
              if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
              pos = j;
            }
          }
          fields.push(value);
          if (ended !== 0) break;
          continue;
        }

        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        pos = open + 1;
        line = openLine;
        prefix = '"';
      } else {
        quoted = false;
      }
      // ---- an unquoted field (or the re-read after an unterminated quote) ----
      // One regex search finds the next comma, CR or LF: the field is the
      // slice up to it, no character-by-character walk.
      let start = pos;
      let parts = prefix === '' ? null : [prefix];
      let i = pos;
      let end = n;
      ended = 2;
      for (;;) {
        DELIM_RE.lastIndex = i;
        const d = DELIM_RE.exec(text);
        if (d === null) { end = n; i = n; break; }
        const di = d.index;
        const dc = text.charCodeAt(di);
        if (dc === 44) { end = di; i = di + 1; ended = 0; break; }
        if (dc === 10) { end = di; i = di + 1; line += 1; ended = 1; break; }
        // CR: a line break when followed by LF, else a dropped stray CR.
        if (text.charCodeAt(di + 1) === 10) { end = di; i = di + 2; line += 1; ended = 1; break; }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (parts === null) parts = [text.slice(start, di)];
        else parts.push(text.slice(start, di));
        i = di + 1;
        start = i;
      }
      if (parts === null) value = text.slice(start, end);
      else { parts.push(text.slice(start, end)); value = parts.join(''); }
      pos = i;
      fields.push(value);
      if (ended !== 0) break;
    }

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
