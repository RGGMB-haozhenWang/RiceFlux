# RiceFlux

[打开水稻核心基因与现代籼稻材料图谱](https://rggmb-haozhenwang.github.io/RiceFlux/prior/)。首页默认打开真实材料数据。可按基因、位点、单倍型、材料编号、品种名或来源组检索，查看同一材料在具体地点年份的实测表型，并导出结果。

| 数据 | 范围 |
|---|---|
| 材料 | 6,044 份原始材料名录；2,347 份现代籼稻精确匹配分型（SC 954、CC-I 1,190、SW-I 203） |
| 基因与位点 | 50 个基因，425 条文献或定向复核记录；254 个有群体双等位分型的目标坐标覆盖 32 个基因 |
| 实测表型 | 1,599 份材料有至少一个有效值，共 76,542 个有效值、63 个非空的性状环境列 |
| 群体证据 | 对照 25 个完整可比组合的分组人数、66 个性状环境列的分组汇总、23 项主环境效应对比 |

[原始研究](https://pubmed.ncbi.nlm.nih.gov/40083159/) · [项目实际数据目录](public/prior/) · [逐材料基因型](https://rggmb-haozhenwang.github.io/RiceFlux/prior/genotypes.tsv.gz) · [逐材料表型](https://rggmb-haozhenwang.github.io/RiceFlux/prior/phenotypes.tsv.gz) · [位点字典](public/prior/typed_sites.tsv) · [数据说明与哈希](public/prior/data_manifest.json)。分型按 MSU7 正链一基坐标排列。原始双等位值保留杂合及 0/N 缺失状态；表型空格表示未测。`public/prior/` 是图谱源文件，`docs/prior/` 是 GitHub Pages 发布副本。

**合成数据演示** [群体与等位变异探索](https://rggmb-haozhenwang.github.io/RiceFlux/?view=demo)

面向育种家的群体与等位变异探索演示，参考 [EasyHap](https://github.com/Guangqi-He/EasyHap) 的基因区域、变异、群体组成与表型查看流程。选择性状、基因、群体或感兴趣的个体后，可查看各群体的等位基因频率、基因型组合和模拟表型，并导出当前筛选结果。

> **原群体演示的数据声明**：材料、基因、群体、坐标、基因型与表型均为合成数据；未使用真实水稻材料、1001 Genomes 或 AtFLM 实测数据。结果不能用于育种决策或论文结论。

## 运行

```bash
npm ci
npm test
npm run build
npm run dev
```

运行 `npm run dev` 后按终端显示的网址查看。构建产物位于 `docs/`，可作为 GitHub Pages 静态页面发布，不需要 Python 服务。

## 合成演示的数据口径

- ALT 频率按已检出的等位基因拷贝计数，部分缺失调用只计入已知拷贝。无调用时显示 `—`。
- MAF 和缺失率根据当前筛选队列计算。基因型组合按所有保留位点均完整的个体统计；未分相数据不会被称作已解析的单倍型。
- 表型图仅展示模拟分布，不包含显著性检验，也不表示优良等位基因。
- 本项目是独立实现的交互演示；不执行 EasyHap，不上传或解析 VCF，也没有在线数据库和用户账户。

## 源码结构

`src/explorer/` 包含 React 界面、样式、统计逻辑与测试；`data/` 和 `public/data/` 是相同的固定种子合成数据；`generate_explorer_data.py` 用于再生成数据。重生成后将 `data/explorer_demo.json` 同步至 `public/data/`，重新构建 `docs/`。

项目由 React、Vite 和 Radix Themes 构建。所用第三方组件各自保留原有许可证。
