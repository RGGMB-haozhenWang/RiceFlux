RiceFlux 育种证据本体 V1.0.0

manifest.json 给出词表、图谱和字段映射的 SHA-256，并固定原始来源和数据包版本。
ontology.jsonld 是版本化词表。graph.jsonld.gz 是证据关系图。
fields.tsv 是本体字段和源文件的对应表。legacy_ids.tsv.gz 按源文件和旧 IRI 查询对应的新实体。

现有八列先验输入、可选的 Source_DOI 和五表数据包继续使用原格式。
图谱连接基因、参考位点、文献型定义、带版本的检测标记、群体和证据来源。
分型矩阵保留在数据包中。材料身份是数据集 ID 与原始 sample_id 的组合。
同一个位点可以出现在多个数据集。覆盖由每个版本的位点字典确定，匹配由实际调用决定。
区域 SNP 的来源角色与文献型定义分别登记。
旧 modern_indica 和 modern-indica 在样本编号和来源组逐行相符后映射为同一成员集合。
该集合有 2,347 份已分型材料，历史名录另有 7 份符合入组条件但没有准确的样本号匹配。
View 和 OutputDataset 的共同上位类型为 AnalysisArtifact。

验收结果见 acceptance.json。

本地复跑
在 RiceFlux 源码目录运行以下命令，Python 3.10 及以上即可。每次构建使用新的输出目录。

python3 scripts/evidence_ontology.py build --output /path/to/new-bundle
python3 scripts/evidence_ontology.py validate
python3 scripts/evidence_ontology.py query-alk --dataset rice6044 --version 2026-11-14.1 --scope all
python3 scripts/evidence_ontology.py query-alk --dataset rice6044 --version 2026-11-14.1 --scope legacy_modern_indica
python3 scripts/evidence_ontology.py query-alk --dataset rice6044 --version 2026-11-14.1 --scope source_group/SC
python3 scripts/evidence_ontology.py query-alk --dataset ricenavi404 --version 2026-11-17.1
python3 scripts/evidence_ontology.py --public /path/to/static-site validate

查询可加 --include-members 返回逐材料结果。validate 核对来源哈希、表轴、坐标、组分顺序、来源、分母和缺失状态，并执行负例。
ALK 文献 DOI 为 10.1186/s12284-020-00393-5。参考组分按顺序为 Chr6 6752756 A、6752887 G、6752888 C。
三种文献型依次为 ALKᵃ（AGC）、ALKᵇ（GTT）、ALKᶜ（GGC）。完整纯合调用才进入文献匹配分母。
D2 未覆盖第二个位点，逐材料状态为 uncovered，匹配计数及可判定分母为 null。

当前 REF 核对使用冻结的位点字典和参考注释。外部性状 ID 保留 unmapped，等待逐项核实。
匹配结果描述观测分型与文献状态的一致性。可用于复查文献定义及群体中的分型分布。
