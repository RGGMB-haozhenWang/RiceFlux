"""Read accession-level Greenwood et al. supplementary leaf blast outcomes."""
from decimal import Decimal
import re
from xml.etree import ElementTree
from zipfile import ZipFile

from read_3k_trial_observations import _identifier, _number


DOI = "10.1038/s42003-024-06244-z"
SOURCE = "ptr_pia_2024_blast"
URL = "https://www.nature.com/articles/s42003-024-06244-z"
ASSAYS = (
    ("Mo15-125", "Mo15-125", "A", "B", "Mo15.125 Gauss Score", "级"),
    ("Mo15-23", "Mo15-23", "A", "B", "Mo15.23_Clean", "0/1"),
    ("Mo15-24", "Mo15-24", "K", "L", "Mo15-24 Binary infection score", "0/1"),
    ("IK81-25", "IK81-25", "B", "A", "Infection Score", "0/1"),
    ("M64", "M64-1-3-9-1", "B", "A", "Infection Score", "0/1"),
)


def read_blast(path):
    with ZipFile(path) as archive:
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        relationships = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        targets = {r.get("Id"): r.get("Target") for r in relationships}
        rel_id = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        sheet_paths = {r.get("name"): targets[r.get(rel_id)] for r in workbook.findall("{*}sheets/{*}sheet")}
        strings = ["".join(t.text or "" for t in node.findall(".//{*}t")) for node in
                   ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))]
        for sheet_name, isolate, id_col, val_col, header, unit in ASSAYS:
            target = sheet_paths[sheet_name]
            root = ElementTree.fromstring(archive.read(target.lstrip("/") if target.startswith("/") else "xl/" + target))
            seen, data = set(), []
            for row in root.findall("{*}sheetData/{*}row"):
                number = int(row.get("r"))
                if number < 12:
                    continue
                cells = {}
                for cell in row.findall("{*}c"):
                    column = re.match(r"[A-Z]+", cell.get("r"))[0]
                    if column not in {id_col, val_col}:
                        continue
                    value = cell.findtext("{*}v") or ""
                    if cell.get("t") == "s":
                        value = strings[int(value)]
                    cells[column] = value
                if number == 12:
                    if cells.get(id_col) != "ASSAY ID" or cells.get(val_col) != header:
                        raise ValueError(f"{sheet_name}: source score headers changed")
                    continue
                raw_id = re.sub(r"^IRIS (?=\d+-)", "IRIS_", cells.get(id_col, "").strip())
                sample_id = _identifier(raw_id, seen, f"{sheet_name} row {number}")
                raw = cells.get(val_col, "")
                value = "" if raw == "NA" else _number(raw, f"{sheet_name}!{val_col}{number}")
                if value and (unit == "0/1" and value not in {"0", "1"}
                              or unit == "级" and not 0 <= Decimal(value) <= 5):
                    raise ValueError(f"{sheet_name}!{val_col}{number}: score outside published scale")
                data.append((sample_id, value, number))
            if len(data) != 3024:
                raise ValueError(f"{sheet_name}: expected the 3024-row accession axis")
            yield sheet_name, isolate, val_col, header, unit, data
