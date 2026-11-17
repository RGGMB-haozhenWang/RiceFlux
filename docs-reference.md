# RiceFlux technical reference

## Identity and evidence

Gene display names are aliases. Use MSU/RAP IDs for joins. `annotations/gene_identity.tsv` compares every displayed identity with the accepted 477-gene index; gaps and shared aliases are explicit. It is not a fresh external validation of every gene.

`D1` and `D2` indicate source dataset coverage. `F` is a previously curated functional site, `H` a literature haplotype component, `L` gene-level literature. HC needs per-call/site QC evidence; it is not inferred from genotype completeness, a DOI, or a dataset name. The legacy `G_chip` code denotes an observed source sequence call here, not a claim that the cohort was measured on a chip.

## Input and output

Use [the five-table contract](public/datasets/README.txt) and [prior input examples](public/formats/README.txt). Reference coordinates are positive-strand, 1-based IRGSP-1.0/MSU7. The current numerical adapter accepts diploid biallelic SNPs. Complex events remain in the source library until a dedicated adapter is verified.

Gene export 1.2 adds identity, source support, call provenance and population dictionaries to the existing TSV bundle. Environment exports include original workbook column, study DOI and unresolved method/site details. Material comparison exports two normalized tables: `phenotypes.tsv` and `reference_members.tsv`; join on `environment_id`. This avoids repeating a large reference-material list in every phenotype row.

## Rebuild and extend

`python3 scripts/build-evidence-intake.py` deterministically rebuilds annotations and the admitted RiceNavi subset from the frozen public inputs. Every new input package needs a unique dataset ID, version and decompressed-text hashes. Dataset IDs namespace accessions; similarly named materials are not automatically merged.

`npm run build` regenerates the scoped Radix CSS and emits a static site. The source stylesheet stays in the lockfile-pinned Radix package. Only used component families and blue/slate/gray theme colours are retained; add a family or colour to `scripts/build-theme.mjs` when introducing a new UI component.

## Current gaps

- Per-call DP/GQ and source VCF binding have not been audited; no calls are certified HC.
- The 6044 subset contains 66 columns for 7 traits. Endpoint labels, units, sites and years trace to source headers; detailed measurement protocols are not yet bound. `Jinhai` and `Jinzhai` are retained separately.
- RiceNavi admits 23 of 319 source records (18 genes, 404 accessions). The other 296 have explicit non-admission reasons. Unbound RiceNavi phenotypes remain source metadata.
- Phenotypes and percentiles remain descriptive, without favourable directions or a cultivar total score.
