"""Read source trial values without converting their decimal precision.

RFGB archives contain headerless, two-column TSVs. Lu Table S2 contains
mean lesion length (cm) for three replications, not individual replicates.
Only identifier whitespace is normalized. Blank values remain empty strings.
"""
import csv
import io
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

_ID = re.compile(r'(?:IRIS_\d+-\d+|[BC]\d{3}|CX\d+)\Z')
_NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\Z')
_ASSAYS = {'C4': 'G', 'C5': 'J', 'V': 'M', 'P9a': 'P'}


def _number(raw, location):
    if raw and not _NUMBER.fullmatch(raw):
        raise ValueError(f'{location}: expected numeric or blank value, got {raw!r}')
    return raw


def _identifier(raw, seen, location, allow_duplicates=False):
    key = raw.strip()
    if not _ID.fullmatch(key):
        raise ValueError(f'{location}: invalid accession ID {raw!r}')
    if key in seen and not allow_duplicates:
        raise ValueError(f'{location}: duplicate accession ID {key!r}')
    seen.add(key)
    return key


def read_rfgb(path, *, allow_duplicate_ids=False):
    """Yield (accession_id, raw_value, 1-based TSV row) from an RFGB ZIP.

    The archive must contain exactly one expected TXT member (leaf rolling
    uses the original environment suffix ``_2015SZ``).
    Parsing finishes validation before yielding, so a malformed tail cannot
    leave a partially accepted table in the consumer.
    Duplicate IDs fail by default; opt in only to retain every copy for audit
    and caller-side quarantine, without deduplicating or selecting a value.
    """
    path = Path(path)
    with ZipFile(path) as archive:
        expected = ('leaf_rolling_index_2015SZ.txt' if path.stem == 'leaf_rolling_index'
                    else f'{path.stem}.txt')
        if archive.namelist() != [expected]:
            raise ValueError(f'{path}: expected sole archive member {expected!r}')
        raw = archive.read(expected).decode('utf-8')
    rows, seen = [], set()
    for number, fields in enumerate(csv.reader(io.StringIO(raw), delimiter='\t',
                                              quoting=csv.QUOTE_NONE), 1):
        location = f'{path.name}:{expected}:row{number}'
        if len(fields) != 2:
            raise ValueError(f'{location}: expected exactly two TSV columns')
        key = _identifier(fields[0], seen, location, allow_duplicate_ids)
        rows.append((key, _number(fields[1], location), number))
    if not rows:
        raise ValueError(f'{path}: empty RFGB data table')
    yield from rows


def _lu_cells(archive):
    workbook = ET.fromstring(archive.read('xl/workbook.xml'))
    sheets = workbook.findall('{*}sheets/{*}sheet')
    if len(sheets) != 1 or sheets[0].get('name') != 'Sheet1':
        raise ValueError('Lu workbook must have exactly one sheet named Sheet1')
    relation = sheets[0].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
    relations = ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
    targets = [r.get('Target') for r in relations if r.get('Id') == relation]
    if targets not in (['worksheets/sheet1.xml'], ['/xl/worksheets/sheet1.xml']):
        raise ValueError('Unexpected Lu worksheet relationship')
    strings = [''.join(t.text or '' for t in s.findall('.//{*}t'))
               for s in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
    sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    dimension = sheet.find('{*}dimension')
    if dimension is None or dimension.get('ref') != 'A1:Q349':
        raise ValueError('Lu Table S2 shape must be A1:Q349')
    rows = {}
    for row in sheet.findall('{*}sheetData/{*}row'):
        number = int(row.get('r'))
        if number in rows:
            raise ValueError(f'Duplicate Lu worksheet row {number}')
        cells = {}
        for cell in row.findall('{*}c'):
            ref = cell.get('r', '')
            match = re.fullmatch(r'([A-Q])([1-9]\d*)', ref)
            if not match or int(match[2]) != number or match[1] in cells:
                raise ValueError(f'Invalid/duplicate Lu cell reference {ref!r}')
            if cell.find('{*}f') is not None:
                raise ValueError(f'Lu {ref}: formulas are not raw observations')
            value = cell.findtext('{*}v') or ''
            kind = cell.get('t', 'n')
            if kind == 's':
                if not value.isdigit() or int(value) >= len(strings):
                    raise ValueError(f'Lu {ref}: invalid shared-string index')
                value = strings[int(value)]
            elif kind == 'inlineStr':
                value = ''.join(t.text or '' for t in cell.findall('{*}is//{*}t'))
            elif kind != 'n':
                raise ValueError(f'Lu {ref}: unsupported raw cell type {kind!r}')
            cells[match[1]] = value
        rows[number] = cells
    if list(rows) != list(range(1, 350)):
        raise ValueError('Lu worksheet must contain ordered rows 1 through 349')
    return rows


def read_lu(path):
    """Yield (accession_id, {C4/C5/V/P9a: raw LL string}, worksheet_row).

    Validate the original Table S2 layout and all 340 accession rows before
    yielding. Rows 344 onward are footnotes, never accessions or observations.
    """
    with ZipFile(path) as archive:
        cells = _lu_cells(archive)
    if cells[1].get('A') != ('Table S2 Information about the diverse rice panel '
                             'of 340 accessions used in this study'):
        raise ValueError('Unexpected Lu Table S2 title')
    header2 = dict(zip('ABCDE', ['3K_IDa', 'Genetic_Stock_varname', 'Origin',
                               'Region', 'Subgroupb']))
    header2.update({'F': 'C4', 'I': 'C5', 'L': 'V', 'O': 'P9a'})
    header3 = dict(zip('FGHIJKLMNOPQ', ['Resistance levelc', 'LLd (cm)', 'SDe',
        'Resistance level', 'LL (cm)', 'SD', 'Resistance level', 'LL (cm)', 'SD',
        'Resistance level', 'LL (cm)', 'SD']))
    for number, expected in ((2, header2), (3, header3)):
        if {k: v for k, v in cells[number].items() if v} != expected:
            raise ValueError(f'Lu row {number}: original assay headers changed')
    for number, prefix in enumerate('abcdef', 344):
        if not cells[number].get('A', '').startswith(prefix + ' ') or any(
                v for k, v in cells[number].items() if k != 'A'):
            raise ValueError(f'Lu row {number}: expected footnote boundary')
    rows, seen = [], set()
    for number in range(4, 344):
        row = cells[number]
        key = _identifier(row.get('A', ''), seen, f'Lu row {number}')
        values = {assay: _number(row.get(column, ''), f'Lu {column}{number}')
                  for assay, column in _ASSAYS.items()}
        rows.append((key, values, number))
    yield from rows


if __name__ == '__main__':
    import json
    import sys

    source = Path(sys.argv[1])
    summary = {}
    for trait, count in (('grain_length', 2013), ('grain_width', 2013),
                         ('grain_length_width_ratio', 2013),
                         ('thousand_grain_weight', 1847)):
        rows = list(read_rfgb(source / f'{trait}.zip'))
        assert len(rows) == count, (trait, len(rows), count)
        assert [r[2] for r in rows] == list(range(1, count + 1))
        summary[trait] = {'rows': count, 'blank_values': sum(not r[1] for r in rows)}
    rows = list(read_lu(source / 'lu_blb.xlsx'))
    assert len(rows) == 340 and [r[2] for r in rows] == list(range(4, 344))
    assert rows[0] == ('B015', {'C4': '22.222222222222221',
        'C5': '22.362499999999997', 'V': '25.333333333333332',
        'P9a': '18.747058823529414'}, 4)
    summary['lu_blb'] = {'rows': len(rows), 'll_values': 4 * len(rows),
        'blank_values': sum(not v for _, values, _ in rows for v in values.values())}
    print(json.dumps(summary, indent=2))
