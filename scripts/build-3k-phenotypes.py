#!/usr/bin/env python3
"""Build a RiceFlux D3 phenotype release while retaining its existing genotype blocks."""
import argparse
from collections import Counter
import csv
import gzip
import hashlib
import io
import json
import os
from pathlib import Path

from read_3k_trial_observations import read_lu, read_rfgb
from read_3k_blast import DOI as BLAST_DOI, SOURCE as BLAST_SOURCE, URL as BLAST_URL, read_blast


RFGB = "https://rfgbv2.rmbreeding.cn/phenotype"
BEIJING = "中国北京 · 中国农科院作物科学研究所"
HAINAN = "中国海南（冬季）"
IRRI = "菲律宾 · IRRI"
SHENZHEN = "中国深圳（早季）"
UNKNOWN_YEAR = "年份未报告"
RFGB_TRAITS = (
    ("grain_length", "GL", "length", "粒长", "mm", "粒形", "length", HAINAN, "2016"),
    ("grain_width", "GW", "width", "粒宽", "mm", "粒形", "width", HAINAN, "2016"),
    ("grain_length_width_ratio", "GLWR", "grain_ratio", "粒长宽比", "ratio", "粒形", "grain_ratio", HAINAN, "2016"),
    ("thousand_grain_weight", "TGW", "thousand_grain_weight", "千粒重", "g", "产量构成", "thousand_grain_weight", HAINAN, "2016"),
    ("panicle_length", "PL", "panicle_length", "穗长", "cm", "穗部", "panicle_length", IRRI, UNKNOWN_YEAR),
    ("culm_number", "CN", "culm_number", "茎秆数", "count", "株型", "culm_number", IRRI, UNKNOWN_YEAR),
    ("culm_length", "CL", "culm_length", "茎秆长", "cm", "株型", "culm_length", IRRI, UNKNOWN_YEAR),
    ("leaf_rolling_index", "LRI", "leaf_rolling_index", "卷叶指数", "%", "叶部", "leaf_rolling_index", SHENZHEN, "2015"),
    ("seedling_height", "SH", "seedling_height", "苗高", "cm", "苗期", "seedling_height", IRRI, UNKNOWN_YEAR),
    ("ligule_length", "LL", "ligule_length", "叶舌长", "mm", "叶部", "ligule_length", IRRI, UNKNOWN_YEAR),
)
LU_SOURCE = "lu_2021_blight"
LU_DOI = "10.1186/s12284-021-00462-3"
LU_ARTICLE = "https://link.springer.com/article/" + LU_DOI
LU_STRAINS = {"C4": "Z173", "C5": "GD1358", "V": "Chinese strain V", "P9a": "PXO339"}
ENV_FIELDS = (
    "environment_id", "trait_id", "trait_name", "unit", "category", "family", "assay", "site", "year",
    "source_id", "original_trait", "source_table", "column", "source_doi", "source_url",
    "protocol_locator", "method_description", "method_en", "field_design", "protocol_gap", "source_note",
)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".partial")
    with partial.open("xb") as handle:
        handle.write(data)
    os.replace(partial, path)


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()


def tsv(fields, rows):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, delimiter="\t", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode()


def table(raw):
    return list(csv.DictReader(io.StringIO(raw.decode()), delimiter="\t"))


def file_source(path):
    return {"name": path.name, "sha256": sha(path.read_bytes())}


def serialize_axes(incoming, sample_ids):
    environments, sources, joins, rejections = [], [], [], []
    observations = {sample_id: {} for sample_id in sample_ids}
    counts = {}

    def append(environment, rows, *, quarantine_duplicates=False):
        env_id = environment["environment_id"]
        if env_id in counts:
            raise ValueError("Duplicate environment: " + env_id)
        environments.append(environment)
        counts[env_id] = dict(valid=0, missing=0, unmatched=0, conflicting=0)
        if quarantine_duplicates:
            rows = list(rows)
            id_counts = Counter(sample_id for sample_id, _, _ in rows)
        else:
            id_counts = {}
        seen = set()
        for sample_id, value, row_num in rows:
            record = dict(environment_id=env_id, sample_id=sample_id, source_row=row_num, value=value)
            if id_counts.get(sample_id, 0) > 1:
                counts[env_id]["conflicting"] += 1
                rejections.append({**record, "reason": "multiple_distinct_records"})
                continue
            if sample_id in seen:
                raise ValueError(f"Duplicate identity for {env_id}: {sample_id}")
            seen.add(sample_id)
            if sample_id not in observations:
                counts[env_id]["unmatched"] += 1
                rejections.append({**record, "reason": "not_in_d3"})
                continue
            joins.append(record)
            if value == "":
                counts[env_id]["missing"] += 1
            else:
                observations[sample_id][env_id] = value
                counts[env_id]["valid"] += 1
        if not counts[env_id]["valid"]:
            raise ValueError("Environment has zero matched observations: " + env_id)

    for stem, code, trait, label, unit, category, family, site, year in RFGB_TRAITS:
        path = incoming / (stem + ".zip")
        url = "https://rfgbv2.rmbreeding.cn/data/traits/" + path.name
        source_id = "rfgb_" + code.lower()
        sources.append(dict(id=source_id, role="phenotype", release="RFGB v2 public phenotype catalogue",
            citation="RFGB 3K Phenotype, " + code, url=RFGB, download_url=url,
            method="Original numeric measurements and trial metadata from RFGB. Detailed protocol unavailable in catalogue.",
            files=[file_source(path)]))
        keep_conflicts = code == "LRI"
        member = "leaf_rolling_index_2015SZ.txt" if keep_conflicts else stem + ".txt"
        append(dict(environment_id="env_3k_rfgb_" + code.lower(), trait_id=trait, trait_name=label, unit=unit,
            category=category, family=family, assay="RFGB " + code, site=site, year=year,
            source_id=source_id, original_trait=code, source_table=member, column="2",
            source_url=RFGB, protocol_locator="3K Phenotype · " + code,
            method_description="保留 RFGB 发布的逐材料原始测值和单位。",
            method_en="Numeric measurements from the public RFGB table.",
            protocol_gap="RFGB 目录未登记具体测定步骤或重复数。",
            source_note="RFGB 3K Phenotype"),
            read_rfgb(path, allow_duplicate_ids=keep_conflicts), quarantine_duplicates=keep_conflicts)

    path = incoming / "lu_blb.xlsx"
    lu_rows = list(read_lu(path))
    sources.append(dict(id=LU_SOURCE, role="phenotype", release="2021 article, Supplementary Table S2",
        citation="Lu et al. (2021), Rice, Additional file 2 / Table S2", doi=LU_DOI, url=LU_ARTICLE,
        license="CC BY 4.0", method="Lesion length (cm), means of three replicates, kept by strain.",
        files=[file_source(path)]))
    for (strain, alias), column in zip(LU_STRAINS.items(), "GJMP", strict=True):
        append(dict(environment_id="env_3k_lu_" + strain.lower(), trait_id="blight", trait_name="白叶枯病斑长度",
            unit="cm", category="抗病", family="blight", assay="Lu 2021 " + strain + " · " + alias,
            site=BEIJING, year=UNKNOWN_YEAR, source_id=LU_SOURCE, original_trait="LL (cm) · " + strain,
            source_table="Table S2", column=column, source_doi=LU_DOI, source_url=LU_ARTICLE,
            protocol_locator="Methods / Additional file 2",
            method_description="按菌株记录病斑长度，采用补表公布的 3 次重复均值。数值越低表示该试验中病斑越短。",
            method_en="Mean lesion length in centimetres, reported separately by strain.",
            field_design="340 份 3K 材料，3 次重复。", protocol_gap="原文未登记试验年份。",
            source_note="Lu et al. 2021 Table S2"), ((sid, values[strain], row) for sid, values, row in lu_rows))

    add_blast(incoming, append, sources)
    measurements = [dict(sample_id=key, **values) for key, values in observations.items() if values]
    return environments, sources, measurements, joins, rejections, counts


def add_blast(incoming, append, sources):
    path = incoming / "blast_ptr.xlsx"
    sources.append(dict(id=BLAST_SOURCE, role="phenotype", release="2024 article, Supplementary Data 1",
        citation="Greenwood et al. (2024), Communications Biology 7:607, Supplementary Data 1",
        doi=BLAST_DOI, url=BLAST_URL, license="CC BY 4.0",
        method="Accession disease score or published binary outcome, separated by isolate and scale.",
        files=[file_source(path)]))
    for sheet, isolate, column, header, unit, data in read_blast(path):
        binary = unit == "0/1"
        suffix = isolate.lower().replace("-", "_")
        append(dict(environment_id="env_3k_greenwood_" + suffix, trait_id="leaf_blast", trait_name="叶瘟抗性",
            unit=unit, category="抗病", family="blast", assay="Greenwood 2024 " + isolate + (" · 二分类" if binary else " · 0–5 病级"),
            site="地点未报告", year=UNKNOWN_YEAR, source_id=BLAST_SOURCE, original_trait=header,
            source_table="Supplementary Data 1 · " + sheet, column=column, source_doi=BLAST_DOI, source_url=BLAST_URL,
            protocol_locator="Materials and Methods / Supplementary Data 1",
            method_description=("采用该菌株工作表公开的 0/1 编码。" if binary else "采用该菌株工作表公布的 0–5 病级，病级越低表示症状越轻。"),
            method_en="Reported binary outcome." if binary else "Published severity score on the 0–5 scale.",
            field_design="原研究选取 500 份 3K 材料；有效测值按各菌株单独统计。",
            protocol_gap=("原文未登记试验地点、年份；0/1 结果保留原始编码。" if binary else "原文未登记试验地点、年份。"),
            source_note="Greenwood et al. 2024 Supplementary Data 1"), data)


def build(datasets, incoming, audit):
    base = "rice3k-v4"
    release = "rice3k-v5"
    version = "2026-11-22.1"
    current = json.loads((datasets / base / "manifest.json").read_bytes())
    manifest = json.loads(json.dumps(current))
    old_version = manifest["version"]
    index = manifest["packed"]
    raw_axes = gzip.decompress((datasets / "blobs" / (index["axes"]["sha256"] + ".gz")).read_bytes())
    if sha(raw_axes) != index["axes"]["sha256"] or len(raw_axes) != index["axes"]["bytes"]:
        raise ValueError("Base axes integrity check failed")
    axes = json.loads(raw_axes)
    samples = [r["sample_id"] for r in table(axes["samples"].encode())]
    if len(samples) != len(set(samples)) or len(samples) != manifest["counts"]["samples"]:
        raise ValueError("Base sample axis is inconsistent")

    environments, sources, measurements, joins, rejections, counts = serialize_axes(incoming, samples)
    env_data = tsv(ENV_FIELDS, environments)
    pheno_data = tsv(("sample_id", *(r["environment_id"] for r in environments)), measurements)
    overlay = {}
    for key, raw in (("environments", env_data), ("phenotypes", pheno_data)):
        overlay[key] = raw.decode()
        manifest["sha256"][key] = sha(raw)
    axis_data = json.dumps(overlay, ensure_ascii=False, separators=(",", ":")).encode()
    index["phenotype_axes"] = dict(sha256=sha(axis_data), bytes=len(axis_data))
    index["phenotype_overlay"] = True
    manifest["version"] = version
    manifest["counts"]["environments"] = len(environments)
    manifest["provenance"]["sources"].extend(sources)
    manifest["provenance"]["previous_version"] = old_version
    manifest["provenance"]["gaps"] = [
        gap for gap in manifest["provenance"].get("gaps", [])
        if not any(token in gap.lower() for token in ("quantitative", "numerical", "dataverse", "定量表型", "无逐材料数值表型"))
    ]
    manifest["provenance"]["gaps"].append("原始来源覆盖各自的 3K 子集。试验、菌株与缺测按源表保留。")
    atomic(datasets / "blobs" / (index["phenotype_axes"]["sha256"] + ".gz"), gzip.compress(axis_data, compresslevel=9, mtime=0))
    atomic(datasets / release / "manifest.json", (json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n").encode())

    index_rows = table((datasets / "index.tsv").read_bytes())
    row = next(r for r in index_rows if r["id"] == "rice3k")
    if row["version"] != old_version:
        raise ValueError("Dataset registry does not point to the expected source version")
    row.update(version=version, manifest=release + "/manifest.json", previous_version=old_version,
        previous_manifest=base + "/manifest.json")
    atomic(datasets / "index.tsv", tsv(tuple(row), index_rows))
    coverage = datasets / "catalog_coverage.tsv.gz"
    coverage_rows = table(gzip.decompress(coverage.read_bytes()))
    updated = 0
    for entry in coverage_rows:
        if entry["dataset_id"] == "rice3k" and entry["dataset_version"] == old_version:
            entry["dataset_version"] = version
            updated += 1
    if not updated:
        raise ValueError("No existing D3 marker coverage to carry forward")
    atomic(coverage, gzip.compress(tsv(tuple(coverage_rows[0]), coverage_rows), mtime=0))

    audit.mkdir(parents=True, exist_ok=False)
    atomic(audit / "environments.tsv", env_data)
    atomic(audit / "phenotypes.tsv", pheno_data)
    fields = ("environment_id", "sample_id", "source_row", "value")
    atomic(audit / "source_rows.tsv", tsv(fields, joins))
    atomic(audit / "excluded_source_rows.tsv", tsv((*fields, "reason"), rejections))
    atomic(audit / "summary.json", json_bytes(dict(
        dataset="rice3k", version=version, previous_version=old_version, samples=len(samples),
        measured_samples=len(measurements), observations=sum(c["valid"] for c in counts.values()), counts=counts,
        unchanged_marker_blocks=len(index["blocks"]), unchanged_gene_coverage=updated,
        shared_archive_sha256=sha((datasets / index["archive"]).read_bytes()), sources=sources,
        observation_join="Exact published 3K ID after trimming exterior whitespace; Greenwood IRIS space prefix normalized to IRIS_.")))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("datasets", type=Path)
    parser.add_argument("incoming", type=Path)
    parser.add_argument("audit", type=Path)
    args = parser.parse_args()
    build(args.datasets, args.incoming, args.audit)
