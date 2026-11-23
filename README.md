# RiceFlux

[基因分析](https://rggmb-haozhenwang.github.io/RiceFlux/) · [育种工作台](https://rggmb-haozhenwang.github.io/RiceFlux/?view=breeder) · [变更日志](CHANGELOG.md)

RiceFlux 用水稻先验、分型、试验表型和文献证据比较基因与材料。

- 基因分析可按名称、MSU 或 RAP 查询，选择位点、数据集和试验，比较表型与群体频率。
- 育种工作台可选择多份材料，按染色体查找基因，核对材料携带的文献优势型及对应证据。
- D1 为 RiceAtlas 6044，D2 为 RiceNavi 404，D3 为 3K Rice Genomes。数据版本和溯源可从页面的数据接口查看。

## 输入

使用 UTF-8 制表符 TXT 或 TSV。新版分型包使用 `RiceFlux tables 1.3`，以 MSU7 基因 ID 和 IRGSP-1.0 正链位点为主键。RAP、基因名和原始检测编号保留在对照表等来源字段。六列观测表可导入「编号、性状、基因、染色体、基因型、表型」，多位点或多试验时补充位点或试验编号。 [输入说明](public/datasets/README.txt) · [本体契约](public/formats/dataset-intake.json)

## 开发与发布

```sh
npm ci
npm test
npm run build:packed -- /path/to/new-site --datasets=/path/to/staged/datasets
python3 -m http.server 4173 --bind 127.0.0.1 --directory /path/to/new-site
```

发布使用版本化数据目录。替换线上构建前，核对数据索引、按需下载和变更日志。 [技术说明](docs-reference.md)

## 数据下载

[扩展先验 TSV.gz](docs/formats/prior_expanded.tsv.gz) · [克隆基因注释 TSV.gz](docs/datasets/cloned_catalog/genes.tsv.gz)
