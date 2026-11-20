# RiceFlux

[打开面板 / Open dashboard](https://rggmb-haozhenwang.github.io/RiceFlux/) · [教程 / Guide](https://rggmb-haozhenwang.github.io/RiceFlux/tutorial.html)

面向水稻育种的基因、位点组合与材料比较。展示原始表型、参考群体百分位和探索性组间检验。
A static rice genetics workbench for genes, genotype combinations and accessions. Display raw phenotypes, reference percentiles and exploratory group comparisons.

- **D1**: 6044 份名录材料（5222 现代品种、822 地方品种），1067 SNP。
- **D2**: RiceNavi 404 份材料，23 个严格匹配 SNP，18 个基因；完整来源库另保留 319 条位点记录。
- **D3** 为 3K 的 3,024 份材料。扩展数据包含基因区域 SNP、InDel 和原始群体注释。
- **基因目录 / Gene catalog** 按 MSU、RAP 和别名查询。点击 InDel 徽标或区域图标记，可查看各数据集版本的坐标、等位序列、有效分母和来源。
- **证据 / Evidence**: 数据集覆盖、文献功能位点、单倍型组分与调用质量分别标注。6044 的表型列附原文测定规程、地点与指标。
- **表型评价 / Phenotype assessment** 按 V4 首批 50 个基因开放。相对性状可设置区间，绝对性状按已登记测定方向判断。原文单倍型效应附性状、比较范围与 DOI。 [性状规范](public/formats/trait-assessment.json) · [首批基因](public/prior/core50_genes.tsv)

## 使用 / Use

1. 用页眉「查基因」查找 MSU／RAP ID、基因名或别名。滚动查看位点、单倍型、表型和证据，也可从页眉直接跳转。
2. 在「筛选」中选材料和位点质控条件。「更多」提供数据接口、比较、个体明细和工作区。
3. 下载 UTF-8 制表符 TXT。Excel 导入时将材料 ID 设为文本。工作区设置可保存与迁移。
4. 从「育种工作台」选择双亲、查询试验表型并聚合关注基因。目标范围按性状和试验保存。

Choose datasets → search a gene → select sites → compare → export TSV.

## 本地与发布 / Run and deploy

```sh
npm ci
npm test
npm run build:packed -- /path/to/new-site --datasets=/path/to/staged/datasets --audience=researcher
python3 -m http.server 4173 --bind 127.0.0.1 --directory /path/to/new-site
```

打包结果可直接在静态服务器部署。用暂存目录的 `index.tsv` 注册 D3。完整数据包接受 `manifest.json` 或 `manifest.jsonld` 与配套 TXT/TSV。区域 VCF 同时接收 SNP 和短 InDel。[接口说明](public/datasets/README.txt) · [本体输入规范](public/formats/dataset-intake.json) · [输入样表](public/formats/prior.tsv) · [完整技术说明](docs-reference.md)
The packed site uses versioned dataset releases from the staging registry.

来源：[6044](https://doi.org/10.1016/j.molp.2025.03.007) · [RiceNavi](https://doi.org/10.1038/s41588-020-00769-9)。保留来源名录和调用，不自动合并同名材料，不将缺失改为参考等位。
