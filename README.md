# RiceFlux

[打开面板 / Open dashboard](https://rggmb-haozhenwang.github.io/RiceFlux/) · [教程 / Guide](https://rggmb-haozhenwang.github.io/RiceFlux/tutorial.html)

面向水稻育种的基因、位点组合与材料比较。展示原始表型、参考群体百分位和探索性组间检验。
A static rice genetics workbench for genes, genotype combinations and accessions. Display raw phenotypes, reference percentiles and exploratory group comparisons.

- **D1**: 6044 份名录材料（5222 现代品种、822 地方品种），1067 SNP。
- **D2**: RiceNavi 404 份材料，23 个严格匹配 SNP，18 个基因；完整来源库另保留 319 条位点记录。
- **RiceData**: 4,883 个已定位克隆基因，283,533 个 D1 区段 SNP。网页搜索目录，本地档案按基因读取分片。
- **先验 / Prior**: 477 基因输入库。查询包含补充及历史身份；MSU ID 未解决的条目明确标记。
- **证据 / Evidence**: 数据集覆盖、文献功能位点、单倍型组分与调用质量分别标注。6044 的表型列附原文测定规程、地点与指标。

## 使用 / Use

1. 数据接口选择数据集；以 MSU/RAP ID 或别名查询基因。
2. 自选位点或文献定义，查看 Missing、MAF、组合、各地表型与组间检验。
3. 下载 TSV 数据包；Excel 按制表符导入，材料 ID 设为文本。工作区设置可保存与迁移。

Choose datasets → search a gene → select sites → compare → export TSV.

## 本地与发布 / Run and deploy

```sh
npm ci
npm test
npm run build
python3 -m http.server 4173 --directory docs
```

构建到 `docs/`，可直接发布到静态服务器，无服务器插件。输入支持完整数据包，也可分别导入样本名单、基因型与表型。[接口规范](public/datasets/README.txt)、[输入样表](public/formats/prior.tsv)、[完整技术说明](docs-reference.md)。
Build output is a static site. Add versioned datasets through `public/datasets/index.tsv`; see the input contract above.

来源：[6044](https://doi.org/10.1016/j.molp.2025.03.007) · [RiceNavi](https://doi.org/10.1038/s41588-020-00769-9)。保留来源名录和调用，不自动合并同名材料，不将缺失改为参考等位。
