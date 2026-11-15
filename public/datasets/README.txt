RiceFlux 多数据集接口 1.0

访问方式
静态 HTTP 服务即可部署，无需数据库或服务器插件。浏览器读取 datasets/index.tsv；每行登记 id、name、version、manifest（例如 rice6044-v1/manifest.json）。文件路径相对于 datasets/。新版本使用新的数据集 id 和目录，保留原版本。首次打开加载索引第一项，其余按选择读取。

导入与下载
数据集面板中一次选择 manifest.json 和下列五张表；接受 TSV、制表符分隔的 TXT，或其 gzip 压缩文件。导入数据仅保存在当前会话中，不自动上传。要长期公开，管理员将目录与索引一起部署。面板可以直接下载解压后的 TSV；“下载输入清单”生成对应未压缩文件名的清单。6044 完整包解压后也可重新导入（同一会话已有 id 时须改用独立 id）。

manifest.json
必需：schema="RiceFlux tables 1.0"、id（字母/数字/下划线/短横线）、name、version、assembly="IRGSP-1.0/MSU7"、source、genotype_evidence、files。
genotype_evidence 必须为 G_chip（芯片/VCF观测调用）、G_projected（投影或插补代理）、G_direct（目标事件直接检测）、G_mixed（混合证据）；按来源填写，混合类型不能整体提升为直接检测。不同证据类型合并时总览保留 G_mixed，逐材料输出保留所属数据集类型。
files 的键为 samples、variants、genotypes、environments、phenotypes，值是同目录下的文件名。
可选 counts：samples、variants、environments 的行数；可选 sha256：五张表解压后 UTF-8 文本的 SHA256。修改表后必须重算 SHA256，不能沿用旧哈希。内置数据同时验证计数与哈希。

表格规范
UTF-8；首行表头；制表符分隔；单元格内禁止制表符和换行，不使用 CSV 引号转义。空值用 NA 或 .。坐标 1-based、正链。各表 ID 保持大小写和原始值。

1. samples.tsv
sample_id name source_group subspecies region material_type [ped_id legacy]
一份材料一行，sample_id 在该数据集内唯一。name 使用原始登记品种名。subspecies 可记录 indica、japonica 或更细分的遗传亚群，必须有来源；region 是材料来源地区，不能填表型试验地点。material_type 如 modern cultivar、landrace；未知字段填 NA。source_group 保留原数据分组。legacy 可选 true/false。

2. variants.tsv
marker_id gene_id chr position ref alt
每个双等位 SNP 一行；gene_id 优先使用唯一 MSU ID，亦接受已登记 RAP ID。名称模糊查询只用于找基因，不参与数据连接。位点须落在本库已核定的基因/上游及已登记标记区间内；参考模型或身份不明确的基因不能导入坐标。alt 未确定时用 NA，不能从缺失调用推断 ALT。
同一坐标在不同数据集须有相同 marker_id、gene_id、REF 和 ALT；反向链或 REF/ALT 调换必须在导入前校正。当前仅支持已登记基因模型上的二倍体 SNP。SV、拷贝数、分相单倍型和多等位位点需扩展独立 schema。

3. genotypes.tsv[.gz]
sample_id 后接 variants 中全部 marker_id，顺序可不同。
每份 samples 材料恰好一行；单元格为未分相正链碱基，例如 A/A、A/G、A/.、./.；NA 也表示全部缺失。缺少某材料整行会拒绝导入。不同数据集未检测到的位点按缺失保留，不填 REF。已知的单个拷贝仍进入等位频率分母。

4. environments.tsv
 environment_id trait_id trait_name unit category family assay site year
（表头起始无空格。）每个表型列一行；相同性状、鉴定指标、地点、年份在一个数据集内唯一。trait_id 标识可比性状，assay 标识评分指标或菌株。相同 trait_id/assay 在不同数据集的单位必须一致。未知单位请用明确文字而非 NA。新增 trait_id 可用于探索性展示，不自动赋予基因关联证据。

5. phenotypes.tsv[.gz]
sample_id 后接 environments 中全部 environment_id。
一份材料最多一行，实测值为有限数值或 NA；整行缺失表示该材料未测表型。允许只有表头的空环境表和只含 sample_id 的表型表。多数据集的试验地点分面带数据集标签，原始地点另外保留，避免合并同名试验。

群体与身份
材料键为 (dataset_id, sample_id)；同名不同编号及不同数据集材料不自动合并。数据集、遗传亚群、来源地区、材料类别、原来源组分别保存；比较时选择来源组、数据集、亚群、地区、亚群×地区、数据集×来源组。
同一生物材料出现在多个数据集时，合并样本数反映记录数，不代表独立材料数。应使用数据集分组或先完成有来源的身份去重。
内置6044名录未单独核定 region，因此为 NA；不从组名缩写自动推断。试验地点来自 environments。

文献
literature.tsv 包含 gene_id、doi、summary、scope、event_id。scope="已整理事件概述" 或 "已整理位点概述" 沿用已审效应/位点说明，句间以分号连接；scope="先验记录概述" 摘录该 DOI 对应的事件身份；scope="论文题名" 仅展示题名，尚未新增全文概述。无概述的 DOI 仍保留，不编造摘要。事件功能证据、单倍型组分、区域探索标记沿用各自来源级别，群体频率不升级因果证据。

输出
材料、位点对照、单倍型组合与成员使用 TSV；当前分析状态可下载 JSON 快照，关系模型可下载 JSON-LD。材料输出新增 dataset_id、source_sample_id、subspecies、region、display_group、genotype_evidence；source_group 始终为原始分组。组合频率表的 source_group 表示本次选择的比较组，grouping_dimension 记录分组维度，dataset_versions 记录数据集版本。
等位频率 = ALT 拷贝数 / 已检出拷贝数。组合频率 = 该组合材料数 / 全部所选基因均完成判型的材料数。悬浮群体组成比例 = 该群体在此组合中的材料数 / 此组合总材料数。

重建内置表格
从原已发布来源运行 node scripts/export_datasets.mjs，然后运行 npm test 和 npm run build -- --configLoader native。原始 JSON 存档仍保留用于逐调用对照；常规页面载入使用 TSV 和精简的参考注释索引。无需重跑 GWAS/GP。
