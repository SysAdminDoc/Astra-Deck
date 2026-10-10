(() => {
    'use strict';

    // extension/core/csv.js
    //
    // v4.70.0 — one CSV writer for every export in the extension.
    //
    // Three exporters each had their own escaper and NONE of them neutralized
    // spreadsheet formula injection: download history (`_csvCell`), Watch Later
    // (`_csvEscape`) and Subscription Groups (`_csvEscape`). The last one even
    // DETECTED a leading `=`/`+`/`-`/`@` — but only to decide whether to wrap
    // the cell in quotes, and quoting does not stop Excel, LibreOffice or
    // Sheets from evaluating `"=cmd|..."` when the file is opened.
    //
    // Exported cells include video titles, filenames and channel names, all of
    // which are arbitrary uploader-controlled text, so a title beginning with
    // `=` is a live formula in the user's spreadsheet.
    //
    // The neutralizer is the one already used by scripts/export-i18n-proofing.js:
    // prefix a single quote, which every major spreadsheet treats as "the rest
    // of this cell is literal text".

    const core = globalThis.YTKitCore || (globalThis.YTKitCore = {});
    if (core.csvCell) return;

    // Leading characters a spreadsheet will treat as the start of a formula.
    // \t and \r are included because they can shift a value into an adjacent
    // cell where it becomes the leading character.
    const FORMULA_LEAD = /^[=+\-@\t\r]/;
    const NEEDS_QUOTING = /[",\r\n]/;

    function csvSafeValue(value) {
        const text = String(value ?? '');
        return FORMULA_LEAD.test(text) ? `'${text}` : text;
    }

    // A complete CSV cell: formula-neutralized, then quoted only when the
    // content requires it.
    function csvCell(value) {
        const text = csvSafeValue(value);
        if (!NEEDS_QUOTING.test(text)) return text;
        return `"${text.replace(/"/g, '""')}"`;
    }

    function csvRow(values) {
        return (Array.isArray(values) ? values : []).map(csvCell).join(',');
    }

    // The reading side, for files other apps export (Google Takeout's
    // subscriptions.csv). RFC 4180 rows: quoted fields, doubled quotes inside
    // them, CRLF or LF line ends, and a leading byte-order mark dropped.
    // Values come back as written. The formula prefix csvCell adds is a
    // spreadsheet safeguard and is not undone here.
    function parseCsv(text) {
        const source = String(text ?? '').replace(/^﻿/, '');
        const rows = [];
        let row = [];
        let cell = '';
        let quoted = false;
        for (let i = 0; i < source.length; i += 1) {
            const ch = source[i];
            if (quoted) {
                if (ch !== '"') cell += ch;
                else if (source[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else {
                    quoted = false;
                }
                continue;
            }
            if (ch === '"' && cell === '') {
                quoted = true;
            } else if (ch === ',') {
                row.push(cell);
                cell = '';
            } else if (ch === '\r' || ch === '\n') {
                if (ch === '\r' && source[i + 1] === '\n') i += 1;
                row.push(cell);
                rows.push(row);
                row = [];
                cell = '';
            } else {
                cell += ch;
            }
        }
        if (cell !== '' || row.length) {
            row.push(cell);
            rows.push(row);
        }
        return rows;
    }

    core.csvSafeValue = csvSafeValue;
    core.csvCell = csvCell;
    core.csvRow = csvRow;
    core.parseCsv = parseCsv;
})();
