# RiceFlux technical reference

## Identity and evidence

Gene display names are aliases. Use MSU/RAP IDs for joins. `annotations/gene_identity.tsv` compares every displayed identity with the accepted 477-gene index; gaps and shared aliases are explicit. It is not a fresh external validation of every gene.

`D1` and `D2` indicate source dataset coverage. `F` is a previously curated functional site, `H` a literature haplotype component, `L` gene-level literature. HC needs per-call/site QC evidence; it is not inferred from genotype completeness, a DOI, or a dataset name. The legacy `G_chip` code denotes an observed source sequence call here, not a claim that the cohort was measured on a chip.

## Input and output

Use [the five-table contract](public/datasets/README.txt) and [prior input examples](public/formats/README.txt). Reference coordinates are positive-strand, 1-based IRGSP-1.0/MSU7. The table adapter accepts diploid biallelic and multiallelic SNPs. Complex events remain in the source library until a dedicated adapter is verified.

Gene export 1.3 adds identity, source support, call provenance and population dictionaries to the existing TSV bundle. Environment exports include original workbook column, study DOI and unresolved method/site details. Material comparison exports two normalized tables: `phenotypes.tsv` and `reference_members.tsv`; join on `environment_id`. This avoids repeating a large reference-material list in every phenotype row.

## Rebuild and extend

`python3 scripts/build-evidence-intake.py` deterministically rebuilds annotations and the admitted RiceNavi subset from the frozen public inputs. Every new input package needs a unique dataset ID, version and decompressed-text hashes. Dataset IDs namespace accessions; similarly named materials are not automatically merged.

`npm run build` regenerates the scoped Radix CSS and emits a static site. The source stylesheet stays in the lockfile-pinned Radix package. Only used component families and blue/slate/gray theme colours are retained; add a family or colour to `scripts/build-theme.mjs` when introducing a new UI component.

## Packed static deployment

```sh
npm run build:packed -- /path/to/new-site
python3 -m http.server 4173 --bind 127.0.0.1 --directory /path/to/new-site
```

Keep the five-table dataset and its ZIP in `public/datasets/`. Register its version in `index.tsv`. For each `<version-dir>/manifest.json`, supply a matching `<version-dir>.zip` with the five inputs at its root or under `<version-dir>/`. The builder checks the decompressed TSV hashes, reconstructs all calls and phenotypes, and writes a fresh static directory. The compact site serves the original ZIP for archival download and exact TSV preview. Add `--keep-source-tables` to the build command for deployments that also serve the earlier loose-table URLs.

`manifest.json` records the portable files and the optional `RiceFlux packed 1.0` index. The index binds an ordered sample and marker dictionary to gzip assets under `datasets/blobs/<sha256>.gz`. A call block has one byte per sample and marker, arranged marker-major. The byte is `a + 5*b`, with `0` for REF, `1–3` for ALT indices, and `4` for a missing allele. The content address and byte count describe the decoded bytes. The axis asset contains sample, marker and environment metadata and the existing phenotype table. The browser reads the current gene blocks before showing its statistics. Multi-gene and material comparisons request their own blocks. Original TSV files and the full prior input are read when the relevant controls are used.

Serve the files from any static HTTP origin. When headers are configurable, use long immutable caching for hash-named assets and revalidation for dataset indexes. Use a new manifest directory when the dataset version changes. Make the new blobs reachable before pointing the index at that version. The regular build and legacy table reader provide a rollback path.

## Evidence and coverage

- Per-call DP/GQ and source VCF binding have not been audited; no calls are certified HC.
- The 6044 subset contains 66 columns for 7 traits. Endpoint labels, units, sites, years and methods trace to the phenotype workbook, the main Phenotyping section and the Supplementary Note. The grain instrument and grain count remain unspecified on the cited paper page. `Jinhai` and `Jinzhai` are retained separately. The paper’s invalid minute values are kept verbatim and have no decimal conversion.
- RiceNavi admits 23 of 319 source records (18 genes, 404 accessions). The other 296 have explicit non-admission reasons. Unbound RiceNavi phenotypes remain source metadata.
- The phenotype panel reports Welch ANOVA and Kruskal–Wallis by dataset and trial, with Holm correction across the current year and assay. The comparisons are exploratory and have no kinship or population structure adjustment. Percentiles use observed values in the selected reference cohort.

## Breeding evidence ontology V1

The [versioned bundle](public/formats/ontology/v1/README.txt) binds its vocabulary, evidence graph, legacy IRI map and fields to the original source hashes and portable dataset versions. `python3 scripts/evidence_ontology.py validate` checks the bindings and runs the ALK acceptance queries. For a compact static build, add `--public /path/to/static-site` before `validate`.

Dataset version and assay coverage are explicit in the graph. The five-table packages retain accession-level calls and phenotypes. Individual ALK calls, literature labels and match denominators can be reproduced with `query-alk` as documented in the bundle.
