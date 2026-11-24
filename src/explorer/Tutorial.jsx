import {useText} from './locale.jsx';
import React from 'react';
export function Tutorial({demo=false}){
  const localize = useText();
  return <div className="tutorial">{demo&&<p>{localize("当前是独立合成演示，不用于生物学解释。 / This demo uses synthetic data.")}</p>}
    <ol>
      <li><b>{localize("选择数据 / Choose data")}</b><p>{localize("从页眉「更多」打开「数据接口」，勾选 D1（6044）或 D2（RiceNavi 404），点击“应用数据集”。“来源 / 预览”仅查看来源，不改变分析。多个数据集同名材料保留为独立记录。可导入样本编号圈定群体。")}</p></li>
      <li><b>{localize("查询基因 / Find a gene")}</b><p>{localize("打开基因目录，输入 MSU ID、RAP ID 或别名，可按关联性状、数据集和证据筛选。选中基因后，左侧查看位点、单倍型和群体，右侧比较表型与文献证据。D1–D3 表示数据覆盖，InDel 表示观察到非参考插入或缺失等位，P 表示有对应的实测表型。F、H、L 分别为文献功能位点、单倍型组分和基因层文献。")}</p></li>
      <li><b>{localize("选择位点 / Select sites")}</b><p>{localize("“自选位点”可按坐标、CDS、启动子或文献预设选择。自动位点阈值位于「筛选」中的「位点质控」。“预设出处”列出 DOI 与原文位置。FPLS1097622 对应 Zhang 等 2022 年 DTH7 的七位点关联单倍型，不是七个独立证实的因果变异。")}</p></li>
      <li><b>{localize("读频率与表型 / Read frequencies and phenotypes")}</b><p>{localize("按每个 ALT 分别显示频率。Missing 使用全部预期等位，MAF 取第二常见等位。二倍体每份预期两个等位，部分缺失中已知等位仍计数。组合频率按所有选点均完整的材料计数。来源稻区不是种植地；表型按地点、年份和指标分别展示。展开“组间检验”查看 Welch ANOVA 与 Kruskal–Wallis，展开“鉴定与地点溯源”查看规程。")}</p></li>
      <li><b>{localize("比较基因与材料 / Compare genes and accessions")}</b><p>{localize("从页眉直接打开「多基因比较」，选基因及各自定义，查看组合、成员、等位频率及连锁 r²。页眉也可打开个体明细和材料比较。材料可逐个或批量加入；每页六份便于读图，选择数量不限六份。雷达图为群体百分位，缺失不补零，无优劣方向或总分。")}</p></li>
      <li><b>{localize("保存与下载 / Save and export")}</b><p>{localize("从「更多」打开「我的工作区」，可保存筛选、区段顺序、自选位点和材料。“下载基因数据”提供 TSV ZIP，含输入来源、所选位点、全部分型、表型、文献及名称复核。Excel 以制表符导入，材料编号设为文本。材料比较的导出包含全部已选材料。")}</p></li>
      <li><b>{localize("接入自己的数据 / Add your data")}</b><p>{localize("准备 manifest.json 和五张表：samples、variants、genotypes、environments、phenotypes。也可按样本表单独导入基因型或表型。分型接受逗号分隔 ALT 和 1/2 等位编号。")}</p></li>
    </ol><p><a href="./tutorial.html" target="_blank" rel="noreferrer">{localize("独立教程 / Full guide ↗")}</a> · <a href="./datasets/README.txt" target="_blank" rel="noreferrer">{localize("数据接口 / Input contract")}</a> · <a href="./formats/README.txt" target="_blank" rel="noreferrer">{localize("导出格式 / Exchange")}</a></p>
  </div>;
}
