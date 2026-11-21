// Fast drop-in for make.fun csv-reader 1.0.0.
//
// Same answers as the reference on every input, but built for speed: one
// left-to-right pass that jumps between field boundaries with indexOf
// instead of walking the text a character at a time, and slices fields out
// of the input instead of gluing them together char by char. A field that
// holds no carriage return is one slice; quoted fields only do extra work
// when they actually contain a doubled quote or an embedded line break.
//
// The reading rules it follows, exactly as the reference states them:
//  - a U+FEFF at the very start is dropped;
//  - a record ends at LF or CRLF, and a line left with no characters is no record;
//  - outside quotes a CR not followed by LF is dropped (stray_cr);
//  - a field opening with a quote runs to the next quote that is not doubled,
//    "" inside it is one quote, each CRLF or lone CR inside it reads as LF;
//    what follows its closing quote, up to the next comma or line break, is
//    appended as it stands (quote_junk, when the field ends); a quote that
//    never closes is a literal character, and the text after it is read again
//    as unquoted (unterminated_quote);
//  - a quote inside an unquoted field is a literal character;
//  - fields stay strings, never trimmed or converted;
//  - columns is the first record when header is true, else null; rows holds
//    the records after it, each padded with "" (short_row) or cut (long_row)
//    to the first record's width;
//  - each error is {code, line, row}, in the order met; line is the 1-based
//    line its record starts on, row its record's index in rows (null for the
//    header). A record's short_row or long_row is reported when it ends.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

const QUOTE = 34; // "
const COMMA_CH = 44; // ,
const LF = 10; // \n
const CR = 13; // \r
const BOM = 0xfeff;

/** csv-reader 1.0.0's answer for one case's input {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === BOM) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error of the record carries these two.
  let recordLine = 1;
  let recordRow = null;

  function strayCr() {
    errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
  }

  // Reads an unquoted field starting at pos, with `first` already in its
  // value. Returns the field and how it ended; `added` counts the characters
  // this call kept (the junk check after a closing quote needs that count:
  // dropped CRs do not count). A CR not followed by LF is dropped
  // (stray_cr); a CR right before the LF that ends the field is one CRLF.
  function readUnquoted(first) {
    if (pos >= n) return { value: first, ended: END, added: 0 };
    const ci = text.indexOf(',', pos);
    const ni = text.indexOf('\n', pos);
    let end;
    let isComma = false;
    let isEnd = false;
    if (ci === -1 && ni === -1) {
      end = n;
      isEnd = true;
    } else if (ni === -1 || (ci !== -1 && ci < ni)) {
      end = ci;
      isComma = true;
    } else {
      end = ni;
    }
    const seg = text.slice(pos, end);
    const ri = seg.indexOf('\r');
    let value;
    let added;
    if (ri === -1) {
      // Clean field: one slice, nothing to fix up.
      value = first + seg;
      added = seg.length;
    } else if (ri === seg.length - 1 && !isComma && !isEnd) {
      // A lone CR sitting right before the LF: one CRLF line break.
      value = first + seg.slice(0, ri);
      added = seg.length - 1;
    } else {
      // One or more stray CRs inside the field: drop each, keep the rest.
      let out = '';
      let j = 0;
      for (;;) {
        const r = seg.indexOf('\r', j);
        if (r === -1) {
          out += seg.slice(j);
          break;
        }
        out += seg.slice(j, r);
        if (r + 1 < seg.length) {
          strayCr();
          j = r + 1;
          continue;
        }
        // The CR is the segment's last character.
        if (isComma || isEnd) strayCr();
        break;
      }
      value = first + out;
      added = out.length;
    }
    if (isEnd) {
      pos = n;
      return { value, ended: END, added };
    }
    if (isComma) {
      pos = end + 1;
      return { value, ended: COMMA, added };
    }
    pos = end + 1;
    line += 1;
    return { value, ended: LINE_BREAK, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let parts = null; // pieces of the value, only when it takes >1 segment
    let value = '';
    let p = pos + 1; // scan position inside the quotes
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      const seg = text.slice(p, q);
      const doubled = text.charCodeAt(q + 1) === QUOTE;
      let piece = seg;
      if (/[\r\n]/.test(seg)) {
        // Each CRLF or lone CR inside quotes reads as one LF, and each of
        // them starts a new line.
        const chunks = seg.split(/\r\n|\r|\n/);
        line += chunks.length - 1;
        piece = chunks.join('\n');
      }
      if (!doubled) {
        value = parts === null ? piece : parts.join('') + piece;
        pos = q + 1;
        break;
      }
      if (parts === null) parts = [];
      parts.push(piece, '"');
      p = q + 2;
    }
    // pos is just past the closing quote.
    if (pos >= n) return { value, ended: END, added: 0 };
    const c = text.charCodeAt(pos);
    if (c === COMMA_CH) {
      pos += 1;
      return { value, ended: COMMA, added: 0 };
    }
    if (c === LF) {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    if (c === CR && text.charCodeAt(pos + 1) === LF) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK, added: 0 };
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = COMMA;
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === QUOTE;
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
      ended = field.ended;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
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
