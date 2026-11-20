#!/usr/bin/env python3
"""Build and check the RiceFlux evidence graph against versioned table releases."""
import argparse
from collections import Counter, defaultdict
import gzip
from hashlib import sha256
import json
from math import isfinite
from pathlib import Path, PurePosixPath
import re
from urllib.parse import quote, unquote, urlsplit
import zipfile

PUBLIC = Path(__file__).resolve().parents[1] / "public"
REL = "formats/ontology/v1"
VERSION = "1.0.0"
BASE = "https://rggmb-haozhenwang.github.io/RiceFlux/"
OLD = BASE + "prior/#"
NS = BASE + REL + "/ontology.jsonld#"
ENTITY = BASE + "formats/ontology/entity/"
CONTEXT = {
    "@vocab": NS,
    "v1": NS,
    "owl": "http://www.w3.org/2002/07/owl#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
}
CORE = "prior/ontology.jsonld.gz"
V4 = "prior/v4_catalog.jsonld.gz"
POPULATION = "prior/population_ontology.jsonld"
SUPPLEMENT = "formats/literature.json"
EXCHANGE = "formats/exchange.json"
REFERENCE = "datasets/reference.json.gz"
TRAITS = "formats/traits.tsv"
OLD_ROSTER = "prior/accessions_6044.tsv.gz"
OLD_CALLS = "prior/genotypes.tsv.gz"
SOURCE_FILES = (
    CORE, V4, POPULATION, SUPPLEMENT, EXCHANGE, REFERENCE, TRAITS, OLD_ROSTER,
    OLD_CALLS, "formats/ontology.txt", "formats/prior.tsv", "formats/prior_477.tsv", "datasets/index.tsv",
)
PRIOR_FIELDS = ["QTG", "Trait", "Function", "MSU_ID", "Chr", "Position", "Ref", "Hap"]
# IRGSP-1.0 pseudomolecule lengths used by the exchange reader.
CHR_LENGTHS = (43270923, 35937250, 36413819, 35502694, 29958434, 31248787,
               29697621, 28443022, 23012720, 23207287, 29021106, 27531856)
ASSEMBLY = "IRGSP-1.0"
ASSEMBLY_LABELS = {ASSEMBLY, "MSU7", "IRGSP-1.0/MSU7", "IRGSP-1.0 / MSU7"}
TABLES = ("samples", "variants", "genotypes", "environments", "phenotypes")
MISSING = {"", ".", "NA"}
ALPHABET = set("ACGT")
ALK_DOI = "10.1186/s12284-020-00393-5"
ALK_SITES = (("Chr6", 6752756, "A"), ("Chr6", 6752887, "G"), ("Chr6", 6752888, "C"))
ALK_NAMES = {"AGC": "ALKᵃ", "GTT": "ALKᵇ", "GGC": "ALKᶜ"}
MATCH_STATES = ("called", "heterozygous", "missing", "both", "unmatched", "ambiguous", "uncovered")
AUDIT_SCOPES = (
    ("rice6044", "2026-11-14.1", "all"),
    ("rice6044", "2026-11-14.1", "legacy_modern_indica"),
    ("ricenavi404", "2026-11-17.1", "all"),
)


def need(condition, code, detail=""):
    if not condition:
        raise ValueError(f"{code} {detail}".strip())


def digest(data):
    return sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode()


def read(path):
    need(not getattr(path.stat(), "st_flags", 0) & 0x40000000, "SOURCE_OFFLINE", path)
    return path.read_bytes()


def unpack(raw):
    return gzip.decompress(raw) if raw.startswith(b"\x1f\x8b") else raw


def document(root, path):
    return json.loads(unpack(read(root / path)))


def rows(raw, fields, label):
    lines = unpack(raw).decode("utf-8-sig").splitlines()
    need(lines, "EMPTY_TABLE", label)
    headers = lines[0].split("\t")
    need(len(set(headers)) == len(headers) and all(headers) and set(fields) <= set(headers), "BAD_HEADER", label)
    return headers, lines[1:]


def table(raw, fields, label):
    headers, lines = rows(raw, fields, label)
    result = []
    for line in lines:
        parts = line.split("\t")
        need(len(parts) == len(headers), "ROW_WIDTH", label)
        result.append(dict(zip(headers, parts)))
    return result


def keyed(records, field, label):
    result = {}
    for record in records:
        value = record[field]
        need(value not in MISSING and value not in result, "DUPLICATE_OR_EMPTY_KEY", label)
        result[value] = record
    return result


def iri(*parts):
    return ENTITY + "/".join(quote(str(part), safe="") for part in parts)


def link(identity):
    return {"@id": identity}


def old_id(ref):
    identity = ref["@id"] if isinstance(ref, dict) else ref
    return OLD + identity[3:] if identity.startswith("rf:") else identity


def coordinate(assembly, chromosome, position, ref):
    need(assembly in ASSEMBLY_LABELS, "ASSEMBLY", assembly)
    match = re.fullmatch(r"(?i)(?:chr)?0*([1-9]|1[012])", str(chromosome))
    need(match is not None, "CHR", chromosome)
    index = int(match.group(1))
    need(re.fullmatch(r"[1-9]\d*", str(position)) is not None, "POSITION", position)
    position = int(position)
    need(isinstance(ref, str) and re.fullmatch(r"[ACGT]+", ref), "REF", ref)
    need(position + len(ref) - 1 <= CHR_LENGTHS[index - 1], "POSITION", position)
    return f"Chr{index}", position, ref


def source_url(url):
    parsed = urlsplit(url)
    need(parsed.scheme == "https" and parsed.netloc, "SOURCE_IRI", url)
    if parsed.netloc.lower() == "doi.org":
        doi = unquote(parsed.path.lstrip("/")).lower()
        need(re.fullmatch(r"10\.\d{4,9}/\S+", doi), "SOURCE_DOI", url)
        return "https://doi.org/" + doi, doi
    return url, None


class Dataset:
    """Portable table access also covers compact static sites with a source ZIP."""
    def __init__(self, root, row):
        self.root = root
        self.path = row["manifest"]
        need(re.fullmatch(r"[\w-]+/manifest\.json", self.path), "MANIFEST_PATH", self.path)
        self.folder = PurePosixPath(self.path).parts[0]
        self.manifest = document(root, "datasets/" + self.path)
        self.manifest.pop("packed", None)
        self.id, self.version = self.manifest["id"], self.manifest["version"]
        self.identity = iri("dataset", self.id, self.version)
        need((self.id, self.version) == (row["id"], row["version"]), "DATASET_VERSION", self.path)
        need(self.manifest["schema"] in {"RiceFlux tables 1.0", "RiceFlux tables 1.1"}, "DATASET_SCHEMA")
        need(self.manifest["assembly"] == "IRGSP-1.0/MSU7", "ASSEMBLY", self.path)
        source_url(self.manifest["source"])
        need(self.manifest["genotype_evidence"] in {"G_chip", "G_projected", "G_direct", "G_mixed", "G_none"}, "EVIDENCE_TYPE")
        need(set(TABLES) <= set(self.manifest["files"]) and set(TABLES) <= set(self.manifest["sha256"]), "MANIFEST_TABLES")
        self.samples = keyed(self.records("samples", ("sample_id", "source_group", "material_type", "subspecies")), "sample_id", self.path)
        self.variants = keyed(self.records("variants", ("marker_id", "gene_id", "chr", "position", "ref", "alt")), "marker_id", self.path)
        self.environments = keyed(self.records("environments", (
            "environment_id", "trait_id", "trait_name", "assay", "unit", "site", "year",
        )), "environment_id", self.path)
        need(self.manifest["counts"] == {"samples": len(self.samples), "variants": len(self.variants),
             "environments": len(self.environments)}, "AXIS_COUNTS", self.path)
        self.validate_phenotypes()

    def text(self, key):
        name = self.manifest["files"][key]
        need(re.fullmatch(r"[\w.-]+\.(?:tsv|txt)(?:\.gz)?", name), "TABLE_PATH", name)
        path = self.root / "datasets" / self.folder / name
        if path.is_file():
            raw = read(path)
        else:
            zip_path = self.root / "datasets" / (self.folder + ".zip")
            need(not getattr(zip_path.stat(), "st_flags", 0) & 0x40000000, "SOURCE_OFFLINE", zip_path)
            with zipfile.ZipFile(zip_path) as archive:
                matches = [entry for entry in (name, self.folder + "/" + name) if entry in archive.namelist()]
                need(len(matches) == 1, "ARCHIVE_MEMBER", name)
                raw = archive.read(matches[0])
        raw = unpack(raw)
        need(digest(raw) == self.manifest["sha256"][key], "TABLE_HASH", f"{self.id}/{name}")
        return raw

    def records(self, name, fields):
        return table(self.text(name), fields, self.id + "/" + name)

    def validate_phenotypes(self):
        header, lines = rows(self.text("phenotypes"), ("sample_id",), self.path)
        need(header[0] == "sample_id" and set(header[1:]) == set(self.environments),
             "PHENOTYPE_AXIS", self.path)
        seen = set()
        number = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")
        for line in lines:
            key, *values = line.split("\t")
            need(key in self.samples and key not in seen and len(values) == len(header) - 1,
                 "PHENOTYPE_SAMPLE_AXIS", self.path)
            seen.add(key)
            for cell in values:
                value = cell.strip()
                need(value in MISSING or number.fullmatch(value) and isfinite(float(value)),
                     "PHENOTYPE_VALUE", self.path)


def datasets(root, bound_ids=None):
    for name in ("formats/prior.tsv", "formats/prior_477.tsv"):
        fields, _ = rows(read(root / name), PRIOR_FIELDS, name)
        need(fields in (PRIOR_FIELDS, [*PRIOR_FIELDS, "Source_DOI"]), "PRIOR_TSV_AXIS", name)
    content = table(read(root / "datasets/index.tsv"), ("id", "version", "manifest"), "dataset index")
    return {row["id"]: Dataset(root, row) for row in keyed(content, "id", "dataset index").values()
            if bound_ids is None or row["id"] in bound_ids}


CLASSES = {
    "AnalyticalTool": None, "InputDataset": None, "AnalysisArtifact": None,
    "View": "AnalysisArtifact", "OutputDataset": "AnalysisArtifact",
    "DatasetVersion": "InputDataset", "SourceArtifact": "InputDataset",
    "GeneRecord": None, "GeneIdentity": "GeneRecord", "ReferenceSite": None,
    "AssayedMarker": None, "RegionalComparisonSNP": "AssayedMarker",
    "Population": None, "AccessionIdentity": None, "Publication": None, "Source": None,
    "PriorEvent": None, "ReportedAllele": "PriorEvent", "LiteratureHaplotypeDefinition": "PriorEvent",
    "OrderedComponent": None, "EvidenceAssertion": None, "GenotypeCall": None,
    "ComponentCoverage": None, "HaplotypeMatchResult": None,
    "Trait": None, "PriorCollection": None, "ObservationVariable": None, "TrialEnvironment": None,
}


def vocabulary():
    nodes = []
    for name, parent in CLASSES.items():
        node = {"@id": "v1:" + name, "@type": "owl:Class"}
        if parent:
            node["rdfs:subClassOf"] = link("v1:" + parent)
        nodes.append(node)
    for name, domain, target in [
        ("produces", "AnalyticalTool", "AnalysisArtifact"),
        ("accepts", "AnalyticalTool", "InputDataset"),
        ("gene", None, "GeneRecord"),
        ("locatedAt", None, "ReferenceSite"),
        ("orderedComponents", "PriorEvent", "OrderedComponent"),
        ("ofDefinition", "OrderedComponent", "PriorEvent"),
        ("datasetVersion", None, "DatasetVersion"),
        ("observationVariable", "TrialEnvironment", "ObservationVariable"),
        ("sourceArtifact", None, "SourceArtifact"),
        ("assesses", "EvidenceAssertion", "PriorEvent"),
    ]:
        node = {"@id": "v1:" + name, "@type": "owl:ObjectProperty", "rdfs:range": link("v1:" + target)}
        if domain:
            node["rdfs:domain"] = link("v1:" + domain)
        nodes.append(node)
    return {"@context": CONTEXT, "@id": NS.rstrip("#"), "@type": "owl:Ontology",
            "owl:versionInfo": VERSION, "@graph": nodes}


class Projection:
    def __init__(self, root, packages):
        self.root, self.packages = root, packages
        self.nodes, self.aliases = {}, {}
        self.ref = document(root, REFERENCE)
        self.core = keyed(document(root, CORE)["@graph"], "@id", CORE)
        self.v4 = keyed(document(root, V4)["@graph"], "@id", V4)
        self.gene_ids, self.reference_genes, self.marker_ids = {}, {}, {}
        for name in SOURCE_FILES:
            self.add(BASE + name, "SourceArtifact", path=name)

    def add(self, identity, kind, **fields):
        need(identity not in self.nodes, "ENTITY_COLLISION", identity)
        self.nodes[identity] = {"@id": identity, "@type": kind, **fields}
        return identity

    def alias(self, file, ref, target, relation):
        key = (file, old_id(ref))
        need(key not in self.aliases or self.aliases[key] == (target, relation), "ALIAS_CONFLICT", key)
        self.aliases[key] = (target, relation)

    def mapped(self, file, ref):
        key = (file, old_id(ref))
        need(key in self.aliases, "UNRESOLVED_LEGACY_REF", key)
        return self.aliases[key][0]

    def sources(self, sources):
        records = []
        for source in sources:
            url, doi = source_url(old_id(source))
            if url not in self.nodes:
                fields = {"doi": doi} if doi else {}
                self.add(url, "Publication" if doi else "Source", **fields)
            if link(url) not in records:
                records.append(link(url))
        return records

    def site(self, assembly, chromosome, position, ref):
        chrom, pos, base = coordinate(assembly, chromosome, position, ref)
        identity = iri("site", ASSEMBLY, chrom, pos, base)
        if identity not in self.nodes:
            self.add(identity, "ReferenceSite", assembly=ASSEMBLY, chromosome=chrom, position=pos, reference=base)
        return identity

    def genes(self):
        for gene in self.ref["genes"]:
            catalog = gene["catalog"]
            msu, rap = catalog.get("msu"), catalog.get("rap")
            stable = msu or rap
            if stable:
                namespace = "MSU7" if msu else "RAP-DB"
                regex = r"LOC_Os\d{2}g\d{5}" if msu else r"Os\d{2}g\d{7}"
                need(re.fullmatch(regex, stable), "GENE_ID", stable)
                identity = iri("gene", ASSEMBLY, namespace, stable)
                kind = "GeneIdentity"
            else:
                namespace, stable = "source", gene["id"]
                identity, kind = iri("gene_record", stable), "GeneRecord"
            for key in {gene["id"], msu, rap, catalog.get("sourceId")} - {None, ""}:
                need(key not in self.gene_ids, "GENE_ID_COLLISION", key)
                self.gene_ids[key] = identity
            self.reference_genes[identity] = gene
            self.add(identity, kind, locusIdentifier=stable, namespace=namespace, assembly=ASSEMBLY,
                     label=gene["name"], msu=msu or "", rap=rap or "",
                     identityStatus="historical" if catalog.get("historical") else ("registered" if msu or rap else "unresolved"),
                     sourceArtifact=link(BASE + REFERENCE))
        for node in self.core.values():
            if node["@type"] != "Gene":
                continue
            keys = [node[k] for k in ("msu", "rap") if node.get(k)]
            matches = {self.gene_ids[k] for k in keys if k in self.gene_ids}
            need(len(matches) == 1 and all(k in self.gene_ids for k in keys), "CORE_GENE", node["@id"])
            self.alias(CORE, node["@id"], next(iter(matches)), "identity")
        for node in self.v4.values():
            if node["@type"] in {"Gene", "HistoricalGeneIdentity"}:
                source = node["@id"].removeprefix("rf:gene_")
                need(source in self.gene_ids, "V4_GENE", source)
                kind = self.nodes[self.gene_ids[source]]["@type"]
                self.alias(V4, node["@id"], self.gene_ids[source], "identity" if kind == "GeneIdentity" else "record")
        for node in self.core.values():
            if node["@type"] == "ReferenceSite":
                site = self.site(node["assembly"], node["chromosome"], node["position"], node["reference"])
                self.alias(CORE, node["@id"], site, "coordinate")

    def versions(self):
        v4_markers = {n["@id"].removeprefix("rf:marker_"): n for n in self.v4.values()
                      if n["@type"] in {"RegionalComparisonSNP", "LiteratureComponent"}}
        for dataset in self.packages.values():
            self.add(dataset.identity, "DatasetVersion", datasetId=dataset.id, version=dataset.version,
                     assembly=ASSEMBLY, annotation="MSU7", source=link(source_url(dataset.manifest["source"])[0]),
                     genotypeEvidence=dataset.manifest["genotype_evidence"],
                     manifestPath="datasets/" + dataset.path, counts=dataset.manifest["counts"])
            self.sources([dataset.manifest["source"]])
            all_members = set(dataset.samples)
            scopes = {"all": all_members}
            groups = defaultdict(set)
            for accession, row in dataset.samples.items():
                groups[row["source_group"]].add(accession)
            scopes.update({"source_group/" + group: members for group, members in groups.items()})
            historical = {}
            if dataset.id == "rice6044":
                legacy, historical = self.modern_indica(dataset)
                scopes["legacy_modern_indica"] = set(legacy)
            for scope, members in scopes.items():
                identity = iri("population", dataset.id, dataset.version, scope)
                history = historical if scope == "legacy_modern_indica" else {}
                self.add(identity, "Population", datasetVersion=link(dataset.identity), scope=scope,
                         memberCount=len(members), memberSha256=membership_hash(dataset, members), **history)
                if scope == "legacy_modern_indica":
                    for path, fragment in [(CORE, "rf:modern_indica"), (POPULATION, OLD + "modern-indica")]:
                        self.alias(path, fragment, identity, "same_membership")
            used = set()
            for marker, row in dataset.variants.items():
                gene = self.gene_ids.get(row["gene_id"])
                need(gene is not None, "MARKER_GENE", marker)
                location = coordinate(dataset.manifest["assembly"], row["chr"], row["position"], row["ref"])
                chrom, pos, ref = location
                model = self.reference_genes[gene]
                need(len(ref) == 1 and (chrom, pos) not in used, "MARKER_COORDINATE", marker)
                need(model["model"] and model["chromosome"] == chrom and model["start"] <= pos <= model["end"],
                     "MARKER_MODEL", marker)
                used.add((chrom, pos))
                alts = [] if row["alt"] in MISSING else row["alt"].split(",")
                need(len(set([ref, *alts])) == 1 + len(alts) and set(alts) <= ALPHABET, "MARKER_ALTS", marker)
                source = v4_markers.get(marker) if dataset.id == "rice6044" else None
                marker_id = self.add(iri("marker", dataset.id, dataset.version, marker),
                                     "RegionalComparisonSNP" if source and source["@type"] == "RegionalComparisonSNP" else "AssayedMarker",
                                     markerId=marker, gene=link(gene), datasetVersion=link(dataset.identity),
                                     locatedAt=link(self.site(ASSEMBLY, *location)), alternate=alts)
                self.marker_ids[(dataset.id, marker)] = marker_id
                if source:
                    self.alias(V4, source["@id"], marker_id, "assayed_marker")
                    need(self.mapped(V4, source["gene"]) == gene and
                         coordinate(ASSEMBLY, source["chromosome"], source["position"], source["reference"]) == location,
                         "V4_MARKER", marker)

    def modern_indica(self, dataset):
        """Check membership and group labels across three released roster representations."""
        old = keyed(table(read(self.root / OLD_CALLS), ("accession_id", "group"), OLD_CALLS), "accession_id", OLD_CALLS)
        roster = keyed(table(read(self.root / OLD_ROSTER), ("accession_id", "source_group", "core50_panel_status"), OLD_ROSTER),
                       "accession_id", OLD_ROSTER)
        a = {key: row["group"] for key, row in old.items()}
        b = {key: row["source_group"] for key, row in dataset.samples.items() if row.get("legacy") == "true"}
        c = {key: row["source_group"] for key, row in roster.items() if row["core50_panel_status"] == "included"}
        eligible = sum(row["core50_panel_status"] in {"included", "no_exact_PED_ID"} for row in roster.values())
        pop = keyed(document(self.root, POPULATION)["@graph"], "@id", POPULATION)
        core_group, pop_group = self.core["rf:modern_indica"], pop[OLD + "modern-indica"]
        need(a == b == c and len(dataset.samples) == len(roster) == pop_group["registryN"], "LEGACY_MEMBERSHIP")
        need(old_id(core_group["genotypeMatrix"]) == BASE + OLD_CALLS and core_group["genotyped"] == pop_group["n"] == len(a)
             and eligible == core_group["eligible"] == pop_group["eligible"], "LEGACY_DENOMINATORS")
        counts = dict(Counter(a.values()))
        need(counts == {x["label"]: x["accessionCount"] for x in core_group["sourceGroupCounts"]}
             == {pop[x["@id"]]["label"]: pop[x["@id"]]["n"] for x in pop_group["groups"]}, "LEGACY_GROUP_COUNTS")
        return a, {"historicalMatrix": link(BASE + OLD_CALLS), "historicalGenotyped": len(a),
                   "historicalEligible": eligible, "historicalSource": [link(BASE + CORE), link(BASE + POPULATION)]}

    def events(self):
        evidence_by_definition = defaultdict(list)
        for node in self.core.values():
            if node["@type"] == "Evidence" and node.get("assesses"):
                evidence_by_definition[node["assesses"]["@id"]].extend(node["supportedBy"])
        for node in self.core.values():
            if node["@type"] in {"HaplotypeDefinition", "AlleleRecord"}:
                components = [self.core[x["@id"]] for x in node.get("orderedComponents", {}).get("@list", [])]
                self.definition(CORE, node, components, evidence_by_definition[node["@id"]])
        for node in document(self.root, SUPPLEMENT)["@graph"]:
            self.definition(SUPPLEMENT, node, node["orderedComponents"], node["supportedBy"])
        for node in self.v4.values():
            if node["@type"] == "PriorEvent":
                event = self.add(iri("event", "v4", node["@id"][3:]), "PriorEvent", label=node["label"],
                                 gene=link(self.mapped(V4, node["gene"])), supportedBy=self.sources(node["eventLiterature"]),
                                 sourceArtifact=link(BASE + V4), sourceStatus=node["status"])
                self.alias(V4, node["@id"], event, "record")
        for node in self.v4.values():
            if node["@type"] in {"LiteratureComponent", "RegionalComparisonSNP"}:
                marker = self.nodes[self.mapped(V4, node["@id"])]
                marker["reportedEvent"] = [link(self.mapped(V4, r)) for r in node["sourceEvent"]]
        for node in self.core.values():
            if node["@type"] == "Evidence":
                fields = {}
                if "assesses" in node:
                    fields["assesses"] = link(self.mapped(CORE, node["assesses"]))
                identity = self.add(iri("assertion", node["@id"][3:]), "EvidenceAssertion",
                                    gene=link(self.mapped(CORE, node["aboutGene"])),
                                    supportedBy=self.sources(node["supportedBy"]), sourceArtifact=link(BASE + CORE), **fields)
                self.alias(CORE, node["@id"], identity, "record")

    def definition(self, file, node, components, sources):
        gene = self.mapped(CORE, node["gene"])
        identity = iri("definition", "core" if file == CORE else "supplement", node["@id"][3:])
        records = []
        for ordinal, component in enumerate(components, 1):
            need(component.get("ordinal", ordinal) == ordinal, "COMPONENT_ORDER", node["@id"])
            location = component.get("locatedAt")
            site = self.mapped(CORE, location) if location else None
            if file == SUPPLEMENT:
                g = self.reference_genes[gene]
                need(site == self.site(g["assembly"], g["chromosome"], component["position"], component["reference"]),
                     "SUPPLEMENT_COORDINATE", node["@id"])
            need(component.get("coordinateStatus", "mapped") == ("mapped" if site else "unknown"),
                 "COMPONENT_LOCATION", node["@id"])
            data = {"locatedAt": link(site)} if site else {}
            if "reportedState" in component:
                data["reportedState"] = component["reportedState"]
            record = self.add(iri("component", "core" if file == CORE else "supplement", node["@id"][3:], ordinal),
                              "OrderedComponent", ofDefinition=link(identity), ordinal=ordinal,
                              coordinateStatus="mapped" if site else "unknown",
                              stateStatus="reported" if "reportedState" in component else "unknown", **data)
            records.append(link(record))
            if "@id" in component:
                self.alias(file, component["@id"], record, "ordered_component")
        kind = "LiteratureHaplotypeDefinition" if node["@type"] == "HaplotypeDefinition" else "ReportedAllele"
        self.add(identity, kind, gene=link(gene), label=node["label"], orderedComponents={"@list": records},
                 supportedBy=self.sources(sources), sourceArtifact=link(BASE + file),
                 reportedCompleteness=node.get("completeness", "source_defined"))
        self.alias(file, node["@id"], identity, "record")

    def traits(self):
        fields = ("trait_id", "name", "term_kind", "mapping_status", "ontology_id")
        registry = table(read(self.root / TRAITS), fields, TRAITS)
        for row in registry:
            need(row["mapping_status"] == "unmapped" and not row["ontology_id"], "UNVERIFIED_EXTERNAL_MAPPING", row["trait_id"])
            identity = iri("trait", row["trait_id"])
            kind = "Trait" if row["term_kind"] == "measured_trait" else "PriorCollection"
            if identity not in self.nodes:
                self.add(identity, kind, traitId=row["trait_id"], label=row["name"], mappingStatus="unmapped")
            need(self.nodes[identity]["label"] == row["name"] and self.nodes[identity]["@type"] == kind,
                 "TRAIT_DEFINITION", row["trait_id"])
        for dataset in self.packages.values():
            for row in dataset.environments.values():
                study = iri("trait", row["trait_id"])
                need(self.nodes[study]["@type"] == "Trait" and self.nodes[study]["label"] == row["trait_name"],
                     "ENVIRONMENT_TRAIT", row["environment_id"])
                need(not row.get("ontology_id") and row.get("mapping_status", "unmapped") == "unmapped",
                     "UNVERIFIED_EXTERNAL_MAPPING", row["environment_id"])
                method = row.get("method_id") or "RF:method:" + row["trait_id"] + ":" + row["assay"]
                scale = row.get("scale_id") or "RF:scale:" + row["unit"]
                variable = iri("variable", row["trait_id"], method, scale)
                if variable not in self.nodes:
                    self.add(variable, "ObservationVariable", trait=link(study), methodId=method,
                             scaleId=scale, assay=row["assay"], unit=row["unit"])
                need(self.nodes[variable]["unit"] == row["unit"], "VARIABLE_SCALE", row["environment_id"])
                self.add(iri("environment", dataset.id, dataset.version, row["environment_id"]), "TrialEnvironment",
                         datasetVersion=link(dataset.identity), observationVariable=link(variable),
                         environmentId=row["environment_id"], site=row["site"], year=row["year"],
                         growthStage=row.get("growth_stage") or "not_recorded")

    def tool(self):
        exchange = keyed(document(self.root, EXCHANGE)["@graph"], "@id", EXCHANGE)
        core_tool = self.core["rf:RiceFlux"]
        legacy_tool = exchange["rf:RiceFlux"]
        accepts, produces = [], []
        items = [
            (CORE, self.core, "accepts", core_tool["accepts"], accepts),
            (CORE, self.core, "produces", [core_tool["produces"]], produces),
            (EXCHANGE, exchange, "accepts", legacy_tool["accepts"], accepts),
            (EXCHANGE, exchange, "produces", legacy_tool["produces"], produces),
        ]
        for file, document_nodes, predicate, inputs, results in items:
            for input_ref in inputs:
                raw = input_ref["@id"] if isinstance(input_ref, dict) else input_ref
                node = document_nodes[raw]
                kind = node["@type"]
                need(kind == "InputDataset" if predicate == "accepts" else kind in {"View", "OutputDataset"},
                     "ANALYTICAL_ARTIFACT", raw)
                identity = self.add(iri("artifact", raw[3:]), kind, sourceArtifact=link(BASE + file),
                                    label=node.get("label", node.get("filename", raw[3:])))
                self.alias(file, raw, identity, "record")
                results.append(link(identity))
        tool = self.add(iri("tool", "RiceFlux"), "AnalyticalTool", accepts=accepts, produces=produces)
        for file in (EXCHANGE, CORE):
            self.alias(file, "rf:RiceFlux", tool, "identity")
        self.alias(CORE, "rf:produces", NS + "produces", "revised_range")

    def build(self):
        self.genes()
        self.versions()
        self.events()
        self.traits()
        self.tool()
        return {"@context": CONTEXT, "@id": BASE + REL + "/graph.jsonld.gz", "version": VERSION,
                "@graph": list(self.nodes.values())}


def membership_hash(dataset, keys):
    return digest("".join(key + "\t" + dataset.samples[key]["source_group"] + "\n" for key in sorted(keys)).encode())


def table_bytes(columns, records):
    return ("\t".join(columns) + "\n" + "".join("\t".join(str(row[k]) for k in columns) + "\n" for row in records)).encode()


def field_bindings():
    return """entity	fields	input	rule
GeneIdentity	locusIdentifier, namespace	datasets/reference.json.gz: genes[].catalog.msu / rap	Prefer a verified MSU7 locus; use RAP-DB when MSU is absent. Names are labels.
GeneRecord	identityStatus	datasets/reference.json.gz: genes[].catalog	Keep historical and unresolved records addressable.
ReferenceSite	assembly, chromosome, position, reference	prior/ontology.jsonld.gz; dataset manifest + variants.tsv	Use IRGSP-1.0 pseudomolecules, 1-based forward coordinates and exact REF.
DatasetVersion	datasetId, version, genotypeEvidence, source	manifest.json: id, version, genotype_evidence, source	Preserve the version and evidence class. G_chip represents source sequence calls in the two published packages.
AssayedMarker	markerId, datasetVersion, gene, locatedAt, alternate	variants.tsv: marker_id, gene_id, chr, position, ref, alt	Marker identity belongs to the dataset version. ALT order addresses allele indices.
RegionalComparisonSNP	markerId, datasetVersion, reportedEvent	prior/v4_catalog.jsonld.gz: RegionalComparisonSNP, sourceEvent	Inherit the reported comparison-marker role. Event links record evidence context.
AccessionIdentity	dataset_id, sample_id	samples.tsv: sample_id	Use the dataset identifier plus the raw sample identifier. Never join packages on sample name.
GenotypeCall	dataset_version, sample_id, marker_id, genotype	genotypes.tsv + variants.tsv	Diploid slash-separated calls. Explicit 0/0 is reference. NA, dot, blank or a missing allele preserve absence.
Population	scope, memberCount, memberSha256	samples.tsv: sample_id, source_group, legacy	Hash sorted raw sample ID and source-group pairs. Legacy aliases require exact membership and group agreement.
Population	historicalGenotyped, historicalEligible, historicalMatrix	prior/ontology.jsonld.gz; prior/population_ontology.jsonld; prior/accessions_6044.tsv.gz	Retain historical matrix and eligibility counts separately from current observations.
PriorEvent	gene, label, supportedBy, sourceArtifact	prior/v4_catalog.jsonld.gz: PriorEvent	Preserve the source record and its event-level citations.
LiteratureHaplotypeDefinition	gene, orderedComponents, supportedBy	prior/ontology.jsonld.gz; formats/literature.json	Keep each source definition and its ordered list. Carry DOI from its declared evidence.
OrderedComponent	ordinal, coordinateStatus, stateStatus, locatedAt, reportedState	orderedComponents: ordinal, locatedAt, reportedState	Retain source order, including unknown coordinates and states.
ComponentCoverage	ordinal, position, ref, marker_id, status	definition component + versioned variants.tsv	Require the same gene, assembly, chromosome, position and REF. An uncovered component has a null marker_id.
HaplotypeMatchResult	population_n, complete_homozygous_n, matches, status_counts	definition + versioned calls + selected population	Count all eligible members by status. Matches require complete homozygous calls. Uncovered definitions have null callable and match counts.
Trait	traitId, label, mappingStatus	formats/traits.tsv: trait_id, name, mapping_status	Local ID for unmapped external terms.
ObservationVariable	trait, methodId, scaleId, unit	environments.tsv: trait_id, method_id, scale_id, assay, unit	Identify by trait, method and scale. Use a local identifier for an absent method or scale ID.
TrialEnvironment	datasetVersion, environmentId, observationVariable, site, year, growthStage	environments.tsv: environment_id, site, year, growth_stage	Record the site, year and stage as measurement context.
InputDataset	QTG, Trait, Function, MSU_ID, Chr, Position, Ref, Hap	formats/prior.tsv; formats/prior_477.tsv; formats/exchange.json	Retain eight ordered columns and optional trailing Source_DOI.
AnalysisArtifact	produces	prior/ontology.jsonld.gz; formats/exchange.json	AnalyticalTool produces a View or an OutputDataset through their common parent.
""".encode("utf-8")


def atomic(path, data):
    tmp = path.with_name(path.name + ".partial")
    with tmp.open("xb") as stream:
        stream.write(data)
    tmp.replace(path)


def build(root, out):
    packages = datasets(root)
    project = Projection(root, packages)
    graph = project.build()
    schema = vocabulary()
    validate_graph(schema, graph, packages)
    aliases = [
        dict(source_file=k[0], legacy_iri=k[1], canonical_iri=v[0], relation=v[1])
        for k, v in sorted(project.aliases.items())
    ]
    assets = {
        "ontology.jsonld": json_bytes(schema),
        "graph.jsonld.gz": gzip.compress(json_bytes(graph), compresslevel=9, mtime=0),
        "legacy_ids.tsv.gz": gzip.compress(table_bytes(
            ("source_file", "legacy_iri", "canonical_iri", "relation"), aliases), compresslevel=9, mtime=0),
        "fields.tsv": field_bindings(),
    }
    manifest = {
        "schema": "RiceFlux breeding evidence ontology", "version": VERSION, "namespace": NS,
        "contract": "formats/ontology.txt",
        "assets": {k: {"bytes": len(v), "sha256": digest(v)} for k, v in assets.items()},
        "sources": {name: digest(read(root / name)) for name in SOURCE_FILES},
        "dataset_manifests": {
            ds.id: {"version": ds.version, "path": "datasets/" + ds.path,
                    "portable_manifest_sha256": digest(json_bytes(ds.manifest))}
            for ds in packages.values()
        },
    }
    out.mkdir(parents=True, exist_ok=False)
    for name, value in assets.items():
        atomic(out / name, value)
    atomic(out / "manifest.json", json_bytes(manifest))
    return {"entities": len(graph["@graph"]), "legacy_mappings": len(aliases)}


def population_members(dataset, scope):
    if scope == "all":
        return set(dataset.samples)
    if scope == "legacy_modern_indica":
        need(dataset.id == "rice6044", "UNKNOWN_POPULATION", scope)
        return {key for key, row in dataset.samples.items() if row.get("legacy") == "true"}
    need(scope.startswith("source_group/"), "UNKNOWN_POPULATION", scope)
    value = scope.removeprefix("source_group/")
    keys = {key for key, row in dataset.samples.items() if row["source_group"] == value}
    need(keys, "UNKNOWN_POPULATION", scope)
    return keys


def validate_graph(schema, graph, packages):
    need(schema == vocabulary(), "VOCABULARY_CONTRACT")
    need(graph["@context"] == CONTEXT and graph["version"] == VERSION, "GRAPH_VERSION")
    nodes = keyed(graph["@graph"], "@id", "evidence graph")
    versions = {package.identity: package for package in packages.values()}

    def target(ref, kinds):
        node = nodes.get(ref["@id"])
        need(node is not None and node["@type"] in kinds, "REFERENCE_TYPE", ref["@id"])
        return node

    def walk(value):
        if isinstance(value, dict):
            if "@id" in value:
                need(value["@id"] in nodes, "DANGLING_REFERENCE", value["@id"])
            for key, item in value.items():
                if key != "@id":
                    walk(item)
        elif isinstance(value, list):
            for item in value:
                walk(item)

    known_markers = defaultdict(set)
    used_components = set()
    for identity, node in nodes.items():
        kind = node["@type"]
        need(kind in CLASSES, "UNKNOWN_TYPE", identity)
        walk(node)
        if "sourceArtifact" in node:
            target(node["sourceArtifact"], {"SourceArtifact"})
        for source in node.get("supportedBy", []):
            target(source, {"Source", "Publication", "SourceArtifact"})
        if kind == "Publication":
            need(source_url(identity) == (identity, node["doi"]), "PUBLICATION_ID", identity)
        if kind == "ReferenceSite":
            key = coordinate(node["assembly"], node["chromosome"], node["position"], node["reference"])
            need(node["assembly"] == ASSEMBLY and identity == iri("site", ASSEMBLY, *key), "SITE_ID", identity)
        if "gene" in node:
            target(node["gene"], {"GeneRecord", "GeneIdentity"})
        if kind == "DatasetVersion":
            ds = versions.get(identity)
            need(ds is not None and node["assembly"] == ASSEMBLY and node["datasetId"] == ds.id and
                 node["version"] == ds.version and node["counts"] == ds.manifest["counts"] and
                 node["genotypeEvidence"] == ds.manifest["genotype_evidence"] and
                 node["source"] == link(source_url(ds.manifest["source"])[0]), "DATASET_BINDING", identity)
        if kind == "Population":
            ds = versions[target(node["datasetVersion"], {"DatasetVersion"})["@id"]]
            members = population_members(ds, node["scope"])
            need(node["memberCount"] == len(members) and node["memberSha256"] == membership_hash(ds, members),
                 "POPULATION_DENOMINATOR", identity)
        if kind in {"AssayedMarker", "RegionalComparisonSNP"}:
            ds = versions[target(node["datasetVersion"], {"DatasetVersion"})["@id"]]
            marker = node["markerId"]
            row = ds.variants.get(marker)
            need(row is not None and identity == iri("marker", ds.id, ds.version, marker), "MARKER_ID", marker)
            site = target(node["locatedAt"], {"ReferenceSite"})
            key = coordinate(ds.manifest["assembly"], row["chr"], row["position"], row["ref"])
            need((site["chromosome"], site["position"], site["reference"]) == key, "MARKER_REF", marker)
            gene = nodes[node["gene"]["@id"]]
            need(row["gene_id"] in {gene["locusIdentifier"], gene["msu"], gene["rap"]}, "MARKER_GENE", marker)
            alts = [] if row["alt"] in MISSING else row["alt"].split(",")
            need(node["alternate"] == alts and not set(alts) - ALPHABET and
                 len(set([row["ref"], *alts])) == 1 + len(alts), "MARKER_ALTS", marker)
            for event in node.get("reportedEvent", []):
                target(event, {"PriorEvent"})
            known_markers[ds.id].add(marker)
        if kind in {"LiteratureHaplotypeDefinition", "ReportedAllele"}:
            for ordinal, ref in enumerate(node["orderedComponents"]["@list"], 1):
                component = target(ref, {"OrderedComponent"})
                need(component["@id"] not in used_components and type(component["ordinal"]) is int and
                     component["ordinal"] == ordinal and component["ofDefinition"] == link(identity),
                     "COMPONENT_ORDER", identity)
                used_components.add(component["@id"])
                loc = component.get("locatedAt")
                need(component["coordinateStatus"] == ("mapped" if loc else "unknown"), "COMPONENT_LOCATION", identity)
                if loc:
                    target(loc, {"ReferenceSite"})
                reported = component.get("reportedState")
                need(component["stateStatus"] == ("reported" if reported is not None else "unknown"), "COMPONENT_STATE", identity)
                need(reported is None or isinstance(reported, str) and bool(reported), "COMPONENT_STATE", identity)
        if kind == "EvidenceAssertion" and "assesses" in node:
            target(node["assesses"], {"LiteratureHaplotypeDefinition", "ReportedAllele", "PriorEvent"})
        if kind == "AnalyticalTool":
            kinds = {target(ref, {"View", "OutputDataset"})["@type"] for ref in node["produces"]}
            need(kinds == {"View", "OutputDataset"}, "ARTIFACT_RANGE", identity)
            for ref in node["accepts"]:
                target(ref, {"InputDataset", "DatasetVersion", "SourceArtifact"})
        if kind in {"Trait", "PriorCollection"}:
            need(node["mappingStatus"] == "unmapped" and "externalTrait" not in node,
                 "UNVERIFIED_EXTERNAL_MAPPING", identity)
        if kind == "ObservationVariable":
            target(node["trait"], {"Trait"})
            need(all(node.get(k) for k in ("methodId", "scaleId", "unit")), "VARIABLE_IDENTITY", identity)
        if kind == "TrialEnvironment":
            ds = versions[target(node["datasetVersion"], {"DatasetVersion"})["@id"]]
            row = ds.environments.get(node["environmentId"])
            variable = target(node["observationVariable"], {"ObservationVariable"})
            need(row and (node["site"], node["year"], variable["assay"], variable["unit"]) ==
                 (row["site"], row["year"], row["assay"], row["unit"]) and
                 variable["trait"] == link(iri("trait", row["trait_id"])), "ENVIRONMENT_BINDING", identity)
    need(used_components == {k for k, n in nodes.items() if n["@type"] == "OrderedComponent"},
         "ORPHAN_COMPONENT")
    for ds in packages.values():
        need(known_markers[ds.id] == set(ds.variants), "MARKER_AXIS", ds.id)
    return nodes


def load_bundle(root, bundle):
    manifest = document(bundle, "manifest.json")
    need(manifest["version"] == VERSION and manifest["namespace"] == NS, "MANIFEST_VERSION")
    need(set(manifest["sources"]) == set(SOURCE_FILES), "SOURCE_BINDINGS")
    for name, expected in manifest["sources"].items():
        source = read(root / name)
        if name == "datasets/index.tsv":
            # Compare the original registry rows byte for byte. Later dataset
            # versions have separate portable manifests and validation.
            head, *entries = source.splitlines(keepends=True)
            bound = {id.encode() for id in manifest["dataset_manifests"]}
            source = head + b"".join(row for row in entries if row.split(b"\t", 1)[0] in bound)
        need(digest(source) == expected, "SOURCE_HASH", name)
    packages = datasets(root, manifest["dataset_manifests"])
    need(set(packages) == set(manifest["dataset_manifests"]), "DATASET_REGISTRY")
    for ds in packages.values():
        bound = manifest["dataset_manifests"][ds.id]
        need((bound["version"], bound["path"], bound["portable_manifest_sha256"]) ==
             (ds.version, "datasets/" + ds.path, digest(json_bytes(ds.manifest))), "DATASET_MANIFEST_HASH", ds.id)
    need(set(manifest["assets"]) == {"ontology.jsonld", "graph.jsonld.gz", "legacy_ids.tsv.gz", "fields.tsv"},
         "BUNDLE_ASSETS")
    for name, shape in manifest["assets"].items():
        content = read(bundle / name)
        need(shape == {"bytes": len(content), "sha256": digest(content)}, "ASSET_HASH", name)
    need(read(bundle / "fields.tsv") == field_bindings(), "FIELD_BINDINGS")
    schema, graph = document(bundle, "ontology.jsonld"), document(bundle, "graph.jsonld.gz")
    nodes = validate_graph(schema, graph, packages)
    aliases = table(read(bundle / "legacy_ids.tsv.gz"),
                    ("source_file", "legacy_iri", "canonical_iri", "relation"), "legacy_ids")
    keys = {(row["source_file"], row["legacy_iri"]) for row in aliases}
    need(len(keys) == len(aliases), "DUPLICATE_LEGACY_BINDING")
    need(all(r["source_file"] in manifest["sources"] and
             (r["canonical_iri"] in nodes or r["canonical_iri"] == NS + "produces") for r in aliases), "LEGACY_BINDING")
    # Validate the cross-release projection data that define aliases and vertex identity.
    expected = Projection(root, packages)
    expected_graph = expected.build()
    need(json_bytes(graph) == json_bytes(expected_graph), "SOURCE_PROJECTION")
    need({(r["source_file"], r["legacy_iri"]): (r["canonical_iri"], r["relation"]) for r in aliases}
         == expected.aliases, "SOURCE_ALIAS_BINDING")
    return packages, nodes, len(aliases)


def alleles(token, ref, alts):
    if token in MISSING:
        return None, None
    values = token.split("/")
    need(len(values) == 2, "GENOTYPE_PLOIDY", token)
    called = [value for value in values if value != "."]
    alphabet = [ref, *alts]
    if all(re.fullmatch(r"[0-3]", value) for value in called):
        need(all(int(value) < len(alphabet) for value in called), "GENOTYPE_INDEX", token)
        return tuple(None if value == "." else alphabet[int(value)] for value in values)
    need(all(value in alphabet for value in called), "GENOTYPE_BASE", token)
    return tuple(None if value == "." else value for value in values)


def alk_definitions(nodes):
    found = {}
    site_ids = None
    definition_ids = []
    for suffix in range(1, 4):
        identity = iri("definition", "supplement", f"alk_three_site_{suffix}")
        definition = nodes[identity]
        need(definition["@type"] == "LiteratureHaplotypeDefinition" and
             definition["gene"] == link(iri("gene", ASSEMBLY, "MSU7", "LOC_Os06g12450")) and
             definition["supportedBy"] == [link("https://doi.org/" + ALK_DOI)], "ALK_SOURCE", identity)
        components = [nodes[c["@id"]] for c in definition["orderedComponents"]["@list"]]
        sites = [nodes[c["locatedAt"]["@id"]] for c in components]
        need(tuple((s["chromosome"], s["position"], s["reference"]) for s in sites) == ALK_SITES,
             "ALK_COMPONENTS", identity)
        site_ids = tuple(s["@id"] for s in sites)
        definition_ids.append(identity)
        variant = "".join(c["reportedState"] for c in components)
        need(variant not in found and ALK_NAMES.get(variant) == definition["label"], "ALK_STATE", identity)
        found[variant] = definition["label"]
    need(found == ALK_NAMES, "ALK_STATE")
    return [nodes[site] for site in site_ids], found, definition_ids


def query_alk(packages, nodes, dataset_id, version, scope, include_members=False):
    ds = packages.get(dataset_id)
    need(ds is not None and ds.version == version, "QUERY_DATASET_VERSION", f"{dataset_id}/{version}")
    sites, labels, definition_ids = alk_definitions(nodes)
    population = iri("population", ds.id, ds.version, scope)
    need(population in nodes, "UNKNOWN_POPULATION", scope)
    selected = population_members(ds, scope)
    gene = iri("gene", ASSEMBLY, "MSU7", "LOC_Os06g12450")
    markers = {n["locatedAt"]["@id"]: n for n in nodes.values()
               if n["@type"] in {"AssayedMarker", "RegionalComparisonSNP"} and n["datasetVersion"] == link(ds.identity)
               and n["gene"] == link(gene)}
    coverage = []
    for ordinal, site in enumerate(sites, 1):
        marker = markers.get(site["@id"])
        coverage.append({"ordinal": ordinal, "chr": site["chromosome"], "position": site["position"],
                         "ref": site["reference"], "site_iri": site["@id"],
                         "marker_id": marker["markerId"] if marker else None,
                         "status": "covered" if marker else "uncovered"})
    ready = all(c["status"] == "covered" for c in coverage)
    fields, lines = rows(ds.text("genotypes"), ("sample_id",), ds.path)
    need(fields[0] == "sample_id" and set(fields[1:]) == set(ds.variants), "GENOTYPE_AXIS", ds.path)
    ids = [c["marker_id"] for c in coverage]
    columns = [(fields.index(k), site["reference"], markers[site["@id"]]["alternate"])
               for k, site in zip(ids, sites)] if ready else []
    seen, counts, matches, member_rows = set(), Counter(), Counter(), []
    for line in lines:
        cells = line.split("\t")
        accession = cells[0]
        need(len(cells) == len(fields) and accession in ds.samples and accession not in seen,
             "GENOTYPE_SAMPLE_AXIS", ds.path)
        seen.add(accession)
        if accession not in selected:
            continue
        label, bases = "", ""
        if not ready:
            status = "uncovered"
        else:
            pairs = [alleles(cells[col], ref, alts) for col, ref, alts in columns]
            missing = any(None in pair for pair in pairs)
            heterozygous = any(a is not None and b is not None and a != b for a, b in pairs)
            calls = [a if a is not None and a == b else "/".join(sorted(v or "·" for v in (a,b)))
                     for a, b in pairs]
            bases = " ".join(calls)
            if missing or heterozygous:
                status = "both" if missing and heterozygous else ("missing" if missing else "heterozygous")
            else:
                label = labels.get("".join(calls), "")
                status = "called" if label else "unmatched"
                if label:
                    matches[label] += 1
        counts[status] += 1
        if include_members:
            member_rows.append({"sample_id": accession, "accession_iri": iri("accession", ds.id, accession),
                                "status": status, "label": label, "bases": bases})
    need(seen == set(ds.samples), "GENOTYPE_SAMPLE_AXIS", ds.path)
    statuses = {key: counts[key] for key in MATCH_STATES}
    result = {"dataset_id": ds.id, "dataset_version": ds.version, "dataset_iri": ds.identity,
              "genotype_evidence": ds.manifest["genotype_evidence"], "population_iri": population,
              "scope": scope, "doi": ALK_DOI, "definition_iris": definition_ids, "components": coverage,
              "population_n": len(selected), "member_sha256": membership_hash(ds, selected), "complete_homozygous_n":
              sum(counts[key] for key in ("called", "unmatched", "ambiguous")) if ready else None,
              "matches": {label: matches[label] if ready else None for label in ALK_NAMES.values()},
              "status_counts": statuses}
    validate_result(result, len(selected))
    if include_members:
        result["members"] = member_rows
    return result


def validate_result(result, eligible):
    counts = result["status_counts"]
    need(set(counts) == set(MATCH_STATES) and all(type(n) is int and n >= 0 for n in counts.values()),
         "MATCH_STATUS_COUNTS")
    need(result["population_n"] == eligible == sum(counts.values()), "RESULT_DENOMINATOR")
    ready = all(c["status"] == "covered" for c in result["components"])
    if ready:
        need(counts["uncovered"] == 0 and result["complete_homozygous_n"] ==
             sum(counts[k] for k in ("called", "unmatched", "ambiguous")) and
             sum(result["matches"].values()) == counts["called"], "RESULT_CALLABLE_COUNT")
    else:
        need(counts["uncovered"] == eligible and result["complete_homozygous_n"] is None and
             all(count is None for count in result["matches"].values()), "RESULT_UNCOVERED")


def negative_checks(packages, nodes):
    from copy import deepcopy

    def reject(code, check):
        try:
            check()
        except ValueError as error:
            need(str(error).startswith(code), "WRONG_NEGATIVE_ERROR", error)
        else:
            raise ValueError("NEGATIVE_ACCEPTED " + code)

    graph = {"@context": CONTEXT, "version": VERSION}
    definition = iri("definition", "supplement", "alk_three_site_1")
    malformed = deepcopy(nodes)
    ids = malformed[definition]["orderedComponents"]["@list"]
    ids.reverse()
    reject("COMPONENT_ORDER", lambda: validate_graph(vocabulary(), {**graph, "@graph": list(malformed.values())}, packages))
    wrong_ref = deepcopy(nodes)
    marker = iri("marker", "rice6044", "2026-11-14.1", "Chr06:6752756")
    site = iri("site", ASSEMBLY, "Chr6", 6752756, "T")
    wrong_ref[site] = {**wrong_ref[iri("site", ASSEMBLY, "Chr6", 6752756, "A")], "@id": site, "reference": "T"}
    wrong_ref[marker]["locatedAt"] = link(site)
    reject("MARKER_REF", lambda: validate_graph(vocabulary(), {**graph, "@graph": list(wrong_ref.values())}, packages))
    denominator = deepcopy(nodes)
    key = iri("population", "rice6044", "2026-11-14.1", "legacy_modern_indica")
    denominator[key]["memberCount"] += 7
    reject("POPULATION_DENOMINATOR", lambda: validate_graph(vocabulary(), {**graph, "@graph": list(denominator.values())}, packages))
    wrong_source = {**nodes, definition: {**nodes[definition], "supportedBy": []}}
    reject("ALK_SOURCE", lambda: alk_definitions(wrong_source))
    reject("GENOTYPE_INDEX", lambda: alleles("0/2", "A", ["G"]))
    need(alleles("NA", "A", ["G"]) == (None, None) and alleles("./1", "A", ["G"]) == (None, "G")
         and alleles("0/0", "A", ["G"]) == ("A", "A"), "MISSING_REFERENCE_SEMANTICS")
    uncovered = query_alk(packages, nodes, "ricenavi404", "2026-11-17.1", "all")
    uncovered["complete_homozygous_n"] = 0
    reject("RESULT_UNCOVERED", lambda: validate_result(uncovered, uncovered["population_n"]))
    reject("QUERY_DATASET_VERSION", lambda: query_alk(packages, nodes, "rice6044", "wrong", "all"))
    return ["COMPONENT_ORDER", "MARKER_REF", "POPULATION_DENOMINATOR", "ALK_SOURCE",
            "GENOTYPE_INDEX", "RESULT_UNCOVERED", "QUERY_DATASET_VERSION"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", type=Path, default=PUBLIC, help="Public tree or its static build")
    parser.add_argument("--bundle", type=Path, help="Evidence bundle directory, defaults to public/" + REL)
    sub = parser.add_subparsers(dest="action", required=True)
    build_args = sub.add_parser("build", help="Generate a new versioned bundle directory")
    build_args.add_argument("--output", type=Path, required=True)
    validate = sub.add_parser("validate", help="Validate graph, source bindings and ALK queries")
    validate.add_argument("--include-members", action="store_true")
    query = sub.add_parser("query-alk", help="Run independent match with one exact dataset version")
    query.add_argument("--dataset", required=True)
    query.add_argument("--version", required=True)
    query.add_argument("--scope", default="all", help="all, legacy_modern_indica or source_group/SC")
    query.add_argument("--include-members", action="store_true")
    args = parser.parse_args()
    root = args.public.resolve()
    if args.action == "build":
        result = build(root, args.output)
    else:
        packages, nodes, aliases = load_bundle(root, args.bundle or root / REL)
        if args.action == "query-alk":
            result = query_alk(packages, nodes, args.dataset, args.version, args.scope, args.include_members)
        else:
            result = {"version": VERSION, "entities": len(nodes), "legacy_mappings": aliases,
                      "rejected_negative_cases": negative_checks(packages, nodes),
                      "alk": [query_alk(packages, nodes, *scope, args.include_members) for scope in AUDIT_SCOPES]}
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
