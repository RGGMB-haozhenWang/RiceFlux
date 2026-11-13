RiceFlux 静态部署与数据交换格式 v1

部署
将发布包 docs/ 中的所有文件按原目录结构复制到 HTTP 或 HTTPS 服务器的站点或子目录。在该目录打开 index.html。服务器仅提供静态文件，客户端需要现代浏览器。应用使用相对路径。浏览器解压 gzip。服务器可将 .gz 作为普通二进制文件提供。中文文本采用 UTF-8。跨域代理、数据库服务和服务器插件均无安装步骤。
本机预览可在 docs/ 所在目录运行 python3 -m http.server 8000 --directory docs 并访问 http://localhost:8000/。修改前端源码时，在开发机运行 npm ci、npm test 和 npm run build，部署构建所得 docs/。

输入
prior.tsv 是使用项目文献坐标的八列样表。用制表符分列，每行一个基因的一条先验记录。同一基因可以有多行。表头及顺序如下。
QTG	Trait	Function	MSU_ID	Chr	Position	Ref	Hap
QTG 必填，保留符号或别名。Trait 和 Function 填写来源报告的性状与功能。MSU_ID 可填写 LOC_Os 编号。名称与编号冲突时进入身份待核。
Chr 取 1–12 或 Chr1–Chr12。Position 为日本晴 IRGSP-1.0 / MSU7 染色体正链 1-based 坐标。多组分使用英文逗号，保留文献顺序。Ref 按相同顺序填写正链参考序列。可用 NA 或空字段表示未知。各行须保留八列，文本字段内部不用制表符或换行。
Hap 保留原文型名、单个等位状态或逗号分隔的有序状态。参照样表，DTH7 的七组分定义来自 DOI 10.3389/fpls.2022.1097622，ALK 的三组分定义来自 DOI 10.1186/s12284-020-00393-5。导入器原样显示 Hap，逐组分按基因、染色体、位置和 REF 接入当前材料分型。计算命名型携带率需要完整的等位定义与基因型。
交互导入在“多基因比较”中选择本机 TSV，浏览器在本机解析。持久发布可把文件放在站点的 formats/ 下，将 formats/deployment.json 的 prior_file 从 null 改成 "formats/my_prior.tsv"。文件名使用英文字母、数字、下划线或连字符。改名或替换文件后刷新页面即可。纯元数据或未匹配的输入行仍可浏览、导出。
已发布材料的主键为 accession_id。prior/accession_names_zh.tsv.gz 包含 accession_id、original_name、name_zh、name_status、source_urls、source_record。source_record 标明本地可审计总表的记录键，16 个有候选名的条目仅有本地记录。study_name 表示研究用名，source_candidate 表示来源候选，multiple_candidates 表示存在同名或别名歧义，unresolved 表示中文名待核。全部分型表及表型表的材料键、位点列字典和文件哈希见 prior/data_manifest.json。

输出
riceflux_prior_results.tsv 的前八列保留输入值，每个 Position 组分一行，Component 从 1 起按原顺序编号。追加 Matched_gene、Marker、Status、N_samples、REF_copies、ALT_copies、Called_copies、ALT_frequency。匹配结果为 matched、gene_unresolved、position_missing 或 site_unmatched。未匹配行的调用及频率字段为空。N_samples 是当前选中材料数，Called_copies 是检出的拷贝数，ALT_frequency 是 ALT_copies / Called_copies，范围 0–1，无可用拷贝时留空。
riceflux_comparison.tsv 使用相同列序，逐个列出所选基因的已接入位点，包括未通过单基因视图 MAF 阈值的稀有位点。Status 为 typed 或 no_typed_site。此表按同一材料筛选统计，Hap 留空。多基因视图的轨道使用独立坐标窗口，同一行的多个 SNP 可以属于同一个先验事件。
单基因视图“导出当前分析”保存 JSON，包含材料与群体筛选、位点阈值、轨道基因、个体分型、组合、局部表型与材料名称状态。频率和地区表型的适用材料范围随选择一起导出。

riceflux_material_genotypes.tsv 每行一份材料，前六列为 accession_id、original_name、name_zh、name_status、material_type、source_group。后续每列为一个“基因|位点”，值为正链未分相的等位对，· 表示缺失拷贝，NA 表示基因没有可选位点。导出保留材料范围和搜索条件。

多基因单倍型组合
打开“多基因比较”时，面板将当前基因与 ALK 加入比较；当前基因为 ALK 时配对 DTH7。可移除并添加其他基因。每份材料按所选方案的全部位点判型，只有各基因都得到唯一标签才进入组合计数。当前材料、来源群体、材料类别和个体筛选沿用左侧设置。文献定义使用固定组分，单基因探索用 MAF 滑块不改变这些组分。各基因可以独立切换方案。不同来源或不同位点集合的文献型分别计算。
文献命名型需要完整、纯合、与文献状态一致。含缺失、杂合、定义位点未覆盖、纯合状态未匹配及多个型名并列均保留为未完整判型。无完整可用文献方案的基因默认使用本面板已有标记的实测纯合序列，标注“群体纯合标记型”。只有一个标记时标为“单标记”。导入八列表的 Hap 给出与 Position 等长的逗号分隔 A/C/G/T 状态时，可选择“导入状态型”。仅有型名的导入行保存在输入匹配结果中。
riceflux_joint_combinations.tsv 按 ALL 和每个来源群体输出所有观察到的完整组合，组内未出现的组合份数为 0。population_n 为当前范围内材料数，joint_typed_n 为所有基因联合可判型的材料数，joint_unresolved_n 为剩余材料数。frequency_within_typed = member_n / joint_typed_n。分母为零时留空。definition 字段含方案、坐标顺序、参考碱基、型名、状态和 DOI。
riceflux_joint_materials.tsv 按所选组合及成员检索条件导出。每个基因分别输出 type、status 和 ordered_calls。ordered_calls 顺序对应组合表中的 definition，· 表示缺失拷贝，斜线表示未分相等位对。联合状态 unresolved 的材料仍保留可判定基因的结果。
