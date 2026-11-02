# RiceFlux

**在线演示：** https://rggmb-haozhenwang.github.io/RiceFlux/

面向育种家的群体与等位变异探索演示，参考 [EasyHap](https://github.com/Guangqi-He/EasyHap) 的基因区域、变异、群体组成与表型查看流程。选择性状、基因、群体或感兴趣的个体后，可查看各群体的等位基因频率、基因型组合和模拟表型，并导出当前筛选结果。

> **演示数据声明**：材料、基因、群体、坐标、基因型与表型均为合成数据；未使用真实水稻材料、1001 Genomes 或 AtFLM 实测数据。结果不能用于育种决策或论文结论。

## 运行

```bash
npm ci
npm test
npm run build
npm run dev
```

运行 `npm run dev` 后按终端显示的网址查看。构建产物位于 `docs/`，可作为 GitHub Pages 静态页面发布，不需要 Python 服务。

## 数据口径

- ALT 频率按已检出的等位基因拷贝计数，部分缺失调用只计入已知拷贝。无调用时显示 `—`。
- MAF 和缺失率根据当前筛选队列计算。基因型组合按所有保留位点均完整的个体统计；未分相数据不会被称作已解析的单倍型。
- 表型图仅展示模拟分布，不包含显著性检验，也不表示优良等位基因。
- 本项目是独立实现的交互演示；不执行 EasyHap，不上传或解析 VCF，也没有在线数据库和用户账户。

## 源码结构

`src/explorer/` 包含 React 界面、样式、统计逻辑与测试；`data/` 和 `public/data/` 是相同的固定种子合成数据；`generate_explorer_data.py` 用于再生成数据。重生成后将 `data/explorer_demo.json` 同步至 `public/data/`，重新构建 `docs/`。

项目由 React、Vite 和 Radix Themes 构建。所用第三方组件各自保留原有许可证。
