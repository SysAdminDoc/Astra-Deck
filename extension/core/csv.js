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

    core.csvSafeValue = csvSafeValue;
    core.csvCell = csvCell;
    core.csvRow = csvRow;
})();
