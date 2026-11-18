RiceFlux 数据接口 / Load data · Tables 1.1

入口 / Entry
数据接口 → 导入基因型 / 表型。解压 examples/riceflux_import_examples.zip 可获得完整合成样例。规范表格为 UTF-8 TSV、制表符分隔 TXT 或相同内容的 gzip 文件。保留 ID 的大小写及前导零。表头只写一行，单元格内无 TAB 或换行。值缺失时填 NA，分型还可写 . 或 ./.。

四种导入方式 / Import modes
1. 完整数据包。选择 manifest.json 和其中声明的五张表。兼容 RiceFlux tables 1.0。
2. 新建本地数据集。填写名称与来源。选择 samples.tsv 加 variants.tsv / genotypes.tsv、environments.tsv / phenotypes.tsv，或两对表一起导入。
3. 追加表型。先预览目标数据集，再选 environments.tsv、phenotypes.tsv。按该数据集的 sample_id 连接。环境 ID 与试验键须新增，既有分型、表型值和底表版本均保留。
4. 追加基因型。先预览仅表型的数据集，再选 variants.tsv、genotypes.tsv。已有分型的数据集可将另一批基因型作为独立版本导入。
本地数据在浏览器中处理。点击“应用数据集”生效。我的工作区可保存；基于内置数据集追加时仅保存新增表和底表版本。
New local datasets may have both measurements and calls, or just one kind. Append traits by exact sample_id to a selected dataset. Append genotypes to phenotype-only datasets. Saving the workspace retains local input.

manifest.json（完整包）
schema: RiceFlux tables 1.1（兼容 1.0）
id: 唯一，由字母、数字、下划线、连字符组成。
name, version, source: 人可读名称、版本、来源说明或链接。
assembly: IRGSP-1.0/MSU7。
genotype_evidence: G_chip 实测调用，G_projected 投影/插补，G_direct 靶标直接检测，G_mixed 混合证据。G_none 适用于纯表型（无位点）。
files: samples, variants, genotypes, environments, phenotypes 五个键，值为本目录相应 .tsv/.txt 或 .gz 文件名。
可选 counts，记录 samples、variants、environments 行数。可选 sha256，按解压后 UTF-8 文本计算各输入哈希。更改内容后须更新哈希。

五表 / Input tables
samples.tsv
  sample_id name source_group subspecies region material_type [ped_id legacy]
  一份材料一行。以 (dataset_id, sample_id) 区分材料。region 为来源地，试验地登记到 environments。
variants.tsv
  marker_id gene_id chr position ref alt
  每坐标一行。gene_id 是已登记的唯一 MSU/RAP ID。正链，1-based。坐标须落入模型允许区间。
  ref 为 A/C/G/T。alt 可有一个或多个正链替代碱基，如 G,C（保留该表的原始顺序）。无已登记 ALT 可填 NA。不同数据集的相同位点使用同 marker_id、基因、染色体、坐标和 REF，ALT 集合可不同。
genotypes.tsv
  sample_id <marker_id...>
  位点列与 variants 相符。samples 的每个编号有一行。分型为未分相二倍体，如 A/G、G/C、A/.、./.；也接受等位编号 0/0、1/2、2/.。0 指 REF，1/2/3 按本表 ALT 顺序。跨数据集合并时以实际碱基重编码。两个 ALT 的杂合状态保留。
  示例 REF=A、ALT=G,C 时，1/2 表示 G/C。非 SNP、分相、拷贝数和 SV 另有表示方式；当前表格适配器处理 SNP。
environments.tsv
  environment_id trait_id trait_name unit category family assay site year
  可选 ontology_id、mapping_status、method_id、scale_id、growth_stage、method_description、source_note。相同试验键指 trait_id × assay × site × year，须唯一；相同 trait_id 和 assay 需使用兼容单位与方法。
phenotypes.tsv
  sample_id <environment_id...>
  一份材料最多一行，数值或 NA。缺行表示无记录。分型无表型时，环境与表型表可仅含表头。表型无分型时，位点表仅含表头，分型表仅有 sample_id 列。

样本名单 / Sample selection
在侧栏“导入样本名单”粘贴或选 TXT/TSV。可一行一个原编号，或带 sample_id（也接受导出的 source_sample_id）和可选 dataset_id 两列。重复合并。同号跨数据集时指定 dataset_id。预览匹配状态，再应用匹配材料。Excel 导入编号时设单元格为文本。

统计与输出 / Statistics and export
AF 按有效等位计数，ALT 分频逐一报告。Missing = 缺失等位数 / 预期等位数。MAF = 第二常见等位频率。部分缺失中的有效等位进入 AF，组合只纳入所选位点均完整的材料。未分相调用保留基因型组合。ALT 剂量 LD 以所选的单个 ALT 为准。
组间表型检验按数据集、指标、地点和年份分别计算。至少两个组各有 5 份有效值才估计。提供 Welch ANOVA、Kruskal–Wallis、样本数、P 值及视图内 Holm 值。等级指标使用秩检验。下载用 tests.tsv 和 groups.tsv 保存组别定义、分母、比较族、结果及状态。供探索性比较，亲缘和群体结构未校正。
Gene and material exports use UTF-8 TSV in ZIP. Open TSV in Excel with accession IDs imported as text.

静态发布 / Static deployment
纯静态 HTTP。将包放进 datasets/，在 index.tsv 登记 id、name、version、manifest。打开页面时读取首个内置数据集，其余按选择加载。大规模区段数据使用 regions.json、染色体索引和独立 gzip 分片。目录入口只访问选中的基因所需分片。已验证的本地区段档案从“RiceData 已克隆基因区段”选择目录，不随首次页面下载。
