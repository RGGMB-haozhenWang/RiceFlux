# RiceFlux technical reference

## Identity and evidence

Gene display names are aliases. Use MSU/RAP IDs for joins. `annotations/gene_identity.tsv` records the review of the original prior. The optional `datasets/cloned_catalog/manifest.json` binds the expanded catalogue to a version, reference assembly and SHA-256. Catalogue DOIs are references at gene level.

`D1` and `D2` indicate source dataset coverage. `F` is a previously curated functional site, `H` a literature haplotype component, `L` gene-level literature. HC needs per-call/site QC evidence; it is not inferred from genotype completeness, a DOI, or a dataset name. The legacy `G_chip` code denotes an observed source sequence call here, not a claim that the cohort was measured on a chip.

## Input and output

Use the five-table contract and prior input examples. Reference coordinates are positive-strand, 1-based IRGSP-1.0/MSU7. Tables 1.2 accepts SNPs and short, normalized, prefix-anchored InDels with at most four declared alleles. This includes REF and up to three ALTs. Complex events use a separate representation. [Five-table contract](public/datasets/README.txt) · [Prior input examples](public/formats/README.txt)

Analysis downloads use UTF-8 tab-delimited TXT. ZIP exports contain individual TXT tables. Environment exports include the original workbook column, DOI and recorded measurement method. Join `phenotypes.txt` to `reference_members.txt` on `environment_id` to reconstruct percentile denominators. Registered source ZIPs retain their versioned filenames.

### 区域 VCF 与 PAV

数据接口和材料体检共用 VCF 解析器。群体数据接入后按基因分片，位点身份由染色体、坐标、REF 和变异类型组成，实际等位序列用于跨群体重编码。符号 SV 和基因 PAV 使用独立记录。PAV 通过原始基因 ID 追溯算法与组装，通过 MSU/RAP 对照定位到参考基因。只有来源数据提供材料级状态时，群体筛选才会改变存在比例和分母。

3K 数据分三步构建。运行 `extract-3k-vcf.py` 从已验收的 PLINK 和 FASTA 提取区域 VCF，运行 `build-3k-observations.py` 整理公开材料名录、历史分类型表型和 RPAN 已发布汇总，再用 `intake-vcf.mjs` 校验 VCF 与来源表，生成可移植输入包。将数据注册到暂存目录后，可用 `npm run build:packed -- /path/to/site --datasets=/path/to/staged/datasets` 构建静态预览。分类表型可在材料体检中查原始代码、数据字典及记录出处。

扩展目录用 `scripts/build-cloned-catalog.py` 生成基因索引。用 `scripts/extract-3k-catalog-vcf.py` 按参考基因区和上游 2 kb 为新增基因选择代表位点，每基因最多一个 SNP 和一个 InDel。用 `intake-vcf.mjs --reference … --append-to …` 将新增 VCF 追加到已有版本。打包器写出独立的分型覆盖索引。目录和覆盖在首屏可读取，原始调用随数据集和基因按需加载。InDel 徽标要求该数据集至少有一个已观察到的非参考 InDel 等位。

### 材料体检工作流

从同一入口搜索材料，或导入区域 VCF、表型 TXT、PAV TXT。选择关注基因后，先显示定义位点的覆盖、调用状态和实际分型。待核位置可以展开查看并导出，附原文件哈希。PAV 的存在、缺失、未判定和未覆盖按来源呈现。实测表型保留协议、单位与环境，分类表型保留原始字典。育种者选好材料和测定记录后再设阈值。

产品迭代以完成育种任务为单位。输入框保留材料、基因和性状，切换任务复用这些选择。首屏优先呈现可判定结果和需补查的位置，原始证据随条目展开。用双亲对比、材料体检、性状筛选和多基因组合四个真实案例验证操作步数、错误复原和 TXT 可重现性。评价方向由育种者按场景决定。

## Rebuild and extend

`python3 scripts/build-evidence-intake.py` deterministically rebuilds annotations and the admitted RiceNavi subset from the frozen public inputs. Every new input package needs a unique dataset ID, version and decompressed-text hashes. Dataset IDs namespace accessions; similarly named materials are not automatically merged.

`npm run build` regenerates the scoped Radix CSS and emits a static site. The source stylesheet stays in the lockfile-pinned Radix package. Only used component families and blue/slate/gray theme colours are retained; add a family or colour to `scripts/build-theme.mjs` when introducing a new UI component.

## Packed static deployment

```sh
npm run build:packed -- /path/to/new-site
python3 -m http.server 4173 --bind 127.0.0.1 --directory /path/to/new-site
```

Keep the five tables and their ZIP in the dataset root. Register `<version-dir>/manifest.json` or `<version-dir>/manifest.jsonld` in `index.tsv`. In the matching `<version-dir>.zip`, place the manifest and tables together at the ZIP root or under `<version-dir>/`. The builder checks decompressed table hashes and verifies the packed calls against the portable tables. The site serves the original ZIP for download and exact table preview. Add `--keep-source-tables` to serve loose tables as well. [Dataset input contract](public/formats/dataset-intake.json)

`manifest.json` records the portable files and the optional `RiceFlux packed 1.0` index. The index binds an ordered sample and marker dictionary to gzip assets under `datasets/blobs/<sha256>.gz`. A call block has one byte per sample and marker, arranged marker-major. The byte is `a + 5*b`, with `0` for REF, `1–3` for ALT indices, and `4` for a missing allele. The content address and byte count describe the decoded bytes. The axis asset contains sample, marker and environment metadata and the existing phenotype table. The browser reads the current gene blocks before showing its statistics. Multi-gene and material comparisons request their own blocks. Original TSV files and the full prior input are read when the relevant controls are used.

Serve the files from any static HTTP origin. When headers are configurable, use long immutable caching for hash-named assets and revalidation for dataset indexes. Use a new manifest directory when the dataset version changes. Make the new blobs reachable before pointing the index at that version. The regular build and legacy table reader provide a rollback path.

## Evidence and coverage

### Trait assessment

The pilot uses the 50 stable V4 identities in `prior/core50_genes.tsv`. All loaded quantitative traits appear as stacked cards with assay, year and trial selections. Category records retain their reported value codes. A relative target belongs to a trait, method and scale and is saved with the workspace. Comparisons use the median distance to the closed interval, then the proportion of observations in the interval. Fixed-direction assessments use the verified assay scale. Results are tied where the comparisons are equal. The ranking is descriptive within each dataset and trial. Reported effects use the original definition ID, comparison and DOI. [Assessment contract](public/formats/trait-assessment.json) · [Original studies by haplotype](public/formats/haplotype-effects.tsv)

- Per-call DP/GQ and source VCF binding have not been audited; no calls are certified HC.
- The 6044 subset contains 66 columns for 7 traits. Endpoint labels, units, sites, years and methods trace to the phenotype workbook, the main Phenotyping section and the Supplementary Note. The grain instrument and grain count remain unspecified on the cited paper page. `Jinhai` and `Jinzhai` are retained separately. The paper’s invalid minute values are kept verbatim and have no decimal conversion.
- RiceNavi admits 23 of 319 source records (18 genes, 404 accessions). The other 296 have explicit non-admission reasons. Unbound RiceNavi phenotypes remain source metadata.
- The phenotype panel reports Welch ANOVA and Kruskal–Wallis by dataset and trial, with Holm correction across the current year and assay. The comparisons are exploratory and have no kinship or population structure adjustment. Percentiles use observed values in the selected reference cohort.

## Breeding evidence ontology V1

The [versioned bundle](public/formats/ontology/v1/README.txt) binds its vocabulary, evidence graph, legacy IRI map and fields to the original source hashes and portable dataset versions. `python3 scripts/evidence_ontology.py validate` checks the bindings and runs the ALK acceptance queries. For a compact static build, add `--public /path/to/static-site` before `validate`.

Dataset version and assay coverage are explicit in the graph. The five-table packages retain accession-level calls and phenotypes. Individual ALK calls, literature labels and match denominators can be reproduced with `query-alk` as documented in the bundle.

## 育种工作台

在浏览器打开 `?view=breeder`，从同一个输入框搜索材料、基因或性状。例如输入 `D106 × D112` 可加入两份材料，再选择「比较双亲」。输入 `DTH7 + GL7` 可加入两个基因并查看组合。用同一入口的「导入文件」可读材料编号名单或体检文件。「数据与设置」可以保存审查清单、双亲、筛选区间和关注基因。

同一输入框也可以用一句话描述任务，按回车生成任务计划。系统按预设场景匹配已登记的材料、基因和性状，并列出待核对的字段。执行前可补充材料、确认母父本方向或选择测定记录。目标支持 `8.20–8.25 mm`、`至少 8.20 mm` 和 `不超过 8.25 mm` 等表达，应用到所选测定记录。例句可从「任务例句」打开。

表型列优先显示关注性状在清单中有实测的记录，同一性状有多个来源时默认选实测覆盖最多的一项。列标题显示地点、年份、方法及单位。「表型来源」可切换测定记录并追溯规程。手动选定记录或划定区间后固定该记录。区间按数据集版本、环境、方法和单位保存，包含边界，可只填一端。切换来源、排序和仅看达标会更新表中可见记录，审查清单仍保留已选材料。

| 面板 | 育种人员能做的事 | 判读依据 |
|---|---|---|
| 设计后代改良 | 直接查找母本和父本，根据目标性状添加关注基因，核对携带型及可追踪差异。可跳转到已登记组合的实测表型。 | 双亲有完整纯合实测调用时，按位点列 F1 预期等位。F2 或回交分离还需代次、连锁相、重组和实际后代数据。 |
| 查材料与性状 | 按编号审查材料或组合，也可直接按性状查多个关联基因的型别、配对实测、原文及携带材料。审查表原值、百分位和关注基因并列，TXT 包含来源版本、分型定义和有序调用。 | 百分位参考当前群体中同一测定记录及材料类别的有效值。型别表保留实际配对数、中位数和四分位。用户设定目标后按同一测定记录给出达标份数与比例。 |
| 聚合关注基因 | 按 MSU/RAP 或名称添加至少两个基因，点击组合查看实际携带材料，按需展开判型、位点质量和连锁。 | 群体内频率以所选基因均完成判型的群体材料为分母。 |
| 新材料体检 | 上传分型或表型 TXT，或同时上传两表。查看位点覆盖、缺测、判型、无效调用和实测记录，下载体检报告。 | 两表使用同一 `sample_id`。分型使用位点字典中的编号和实际等位序列。导入和体检在浏览器内完成。 |

体检分型 TXT 使用 `sample_id marker_id genotype`，表型 TXT 使用 `sample_id trait value unit site year method`，实际文件以制表符分隔。分型可填写 `A/G`、`A/AA` 或 `NA`。位点字典提供当前加载数据集中的坐标和等位信息。范围之外的位点、无效调用和缺测在体检报告中各自保留。

### 基因效力与位点有效性

效力的估计单位是「等位状态 × 对照 × 性状 × 群体与环境」。优先看效应量、方向、区间和有效样本。描述性均值差含背景差异。可用于育种复核的估计应控制亲缘、群体结构、环境和有关背景，说明等位与环境的互作，并在独立环境、家系或材料中复核。近等基因系、分离或功能实验可为目标事件提供更直接的证据。

位点有效性先核对参考组装、坐标、REF/ALT 与检测方法，检查覆盖、调用质量、重复一致性、缺失、MAF 及当前群体是否分离。随后比较条件效应、重复性和与已知功能变异的连锁。标记的技术可用性、预测能力和因果证据各采用相应的验收指标。

| 分级 | 判定 |
|---|---|
| L / 文献 | L0 尚无来源，L1 基因层文献，L2 有 DOI 的有序文献型定义。精确功能实验需绑定实际事件、性状和背景。 |
| P / 表型 | P0 当前型别缺少可比较的配对组，P1 至少两个完整纯合型有同一试验的观测分型和实测值。配对数、原值分布和达标率随视图显示。 |
| I / 推断 | I0 目前无模型效应。未来记录推断方法、训练范围、验证单位、误差和适用范围。双亲位点推导以 F1 预期单列。 |
| C / 效力 | C0 缺少当前可用线索，C1 有先验或描述性线索。本地版显示 C0–C1。C2 计划用于已复核、控制混杂的效应及适用范围。C3 再要求目标事件的直接功能支撑和独立育种验证。 |

仅有杂交组合实测时，可按目标区间筛组合或样本。双亲实测齐全且对应同一试验后才能比较中亲或优亲。若有多个连通的亲本配组和试验重复，可以用配合力模型估计亲本的一般配合力与组合的特殊配合力。单个组合的达标证据归于该组合。亲本或等位效力需要可区分亲本背景、等位状态与环境的对照设计。

### 3K 与后续模型

D1 有 1,067 条 SNP，D2 有 23 条 SNP，两套观测字典中的 InDel 均为 0。官方 3K 双等位 InDel v4 登记 2,354,934 个位点与 3,023 个样本。历史表型与联合分析资源另有登记。先核对 FAM 原编号和表型名录的身份映射、缺失编码、测量单位与试验元数据，然后提取目标基因区段。按 IRGSP-1.0 核对正链 REF，再转换为 1.2 表格。PLINK 的 A1/A2 次序需对照参考与来源调用。浏览器按需载入经过验收的基因分片。 [3K 发布页](https://3kricegenome.s3.amazonaws.com/3kRG_download.html) · [InDel v4 清单](https://s3.amazonaws.com/3kricegenome/reduced/3krg-indel-README.txt) · [配套历史表型资源](https://doi.org/10.7910/DVN/HGRSJG)

GWAS 接口以试验指标、样本范围、组装、坐标、REF 和效应等位为主轴，保留效应、标准误、校正结果、模型和变异匹配级别。GP 接口按材料或组合、目标试验与模型版本登记预测均值和区间，随结果保存训练范围、家系或亲本层面的外部验证及误差。两种接口将结果挂在推断证据层，分别声明关联和预测的适用范围。

RiceAtlas 已展示群体单倍型与 GWAS 资源，并在论文中展示了用育种设计功能改良绥粳 4 号粒形。RiceFlux 用一份可保存的材料清单连接表型、分型和来源。育种家可在看过实测值后筛出达标记录，再核对双亲中目标型的来源和多基因组合。 [RiceAtlas 原文](https://doi.org/10.1016/j.molp.2025.03.007)

## 亲本导入决策 v1

从育种工作台打开「亲本导入决策」。先导入已验收的家系效应 TXT，再选轮回亲本、试验、目标性状和可选的代价性状，填写同单位的阈值。输入在浏览器中读取，下载的报告包含当前筛选和判断。公开站点提供空白模板。

一行代表一个分析中、同一家系、同一试验和性状的 **供体型后代减共同亲本型后代**。请使用字段顺序一致的 UTF-8 制表符文本，可加 BOM。

```text
schema_version	analysis_id	source_ref	contrast	assembly	gene_id	haplotype_id	recurrent_parent	donor_parent	family_id	trial_id	trial_label	trait_id	trait_label	unit	genotype_evidence	status	estimate	ci_lower	ci_upper	n_donor	n_recurrent	next_check
```

- `schema_version` 为 `1`，`contrast` 为 `donor_vs_recurrent_within_family`。`analysis_id` 区分不可混用的冻结分析，`source_ref` 指向可复核的报告、文件哈希或其他版本证据。材料 ID 在输入分析范围内应唯一，同名跨数据集时用数据集与材料编号限定。
- `haplotype_id` 可使用「导出分型对应 TXT」中的 `observed_haplotype_id`。无法与该定义完全对齐时，填来源限定的紧凑 JSON `["source_scoped","分析ID","来源引用","稳定定义ID"]`，最后一项绑定来源内的组分与等位状态。文献型名可供解释，裸 `Hap1` 不能作为键。
- `genotype_evidence` 接受 `G_direct`、`G_chip`、`G_projected`、`G_mixed`。按上游实际调用填写。代理或区域关联需同时给出下一步直接分型任务。
- `status` 接受 `estimated`、`not_estimable`、`not_measured`。可估计行提供有限估计值、两侧区间及两个正整数样本量。缺测或不可估计的数值字段留空，已知的样本数可保留；`next_check` 可记录区间口径、校正结果或验证事项。
- 目标的区间下限达到最低收益、代价的区间上限未超过允许增量，才标为达到设定条件。区间跨越阈值保留为不确定，整段不符合标为未达到。缺少指定代价、背景、试验或源分型不一致时保留证据不足。判断是同一家系试验证据对用户阈值的复核，跨家系和跨试验保持独立。公开群体原始差值、原文效应和 F1 预期型仍在原界面的各自证据栏中使用。

## GitHub 发布留痕

每次发布在 [CHANGELOG.md](CHANGELOG.md) 顶部追加记录，包含用户可见变化、数据/接口版本、验证范围和状态。将日志、源码、数据和 GitHub Pages 构建后需要更新的 `docs/` 入口或资源一并审核。提交后先运行 `node scripts/check-changelog.mjs <本次发布前的提交> HEAD`，再推送。发布后核对 Pages 运行结果和线上行为；Git 提交或本地构建与线上验证分别记录。

本地开发从 `npm test` 及构建开始。发布时以当前 Pages 静态目录为基础核对数据索引和已有资产，将新构建的入口和资产合入 `docs/`。完整 3K 注册和已打包数据以 `docs/datasets/` 当前版本为准。
