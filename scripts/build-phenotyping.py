"""Bind the 66 released phenotype columns to Ma et al. 2025 and the cited standard."""
import csv
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[1] / 'public'
DOI = '10.1016/j.molp.2025.03.007'
HAN = '韩龙植、魏兴华等，水稻种质资源描述规范和数据标准，中国农业出版社，2006，70–71 页（ISBN 7-109-10791-4）'
METHOD = 'Ma et al. 2025, Phenotyping, p. 663; Supplementary Figure 1'
FIELD_DESIGN = '2022–2023 年七地增广设计，共 73 区组，每区组 50 条目。每小区四行，原文记 16 株，行距 26.7 cm，株距 10 cm，小区间通道 50 cm。五个田块设置 1 m 保护行和边界缓冲。每小区随机选 10 株，排除边株。'
FIELD_QC = '研究对原记录人工核错，按性状排除距均值超过 3 个标准差的异常值。环境原因未记录的值留空。'
# Original DMS is retained separately, including the two source minute anomalies.
FIELD = {
    'Gongzhuling': ('GZL', '吉林公主岭', 124,44,43,27),
    'Tanghai': ('TH', '河北唐海', 118,17,39,18),
    'Kunming': ('KM', '云南昆明', 103,6,25,20),
    'Nanning': ('NN', '广西南宁', 108,11,22,48),
    'Hefei': ('HF', '安徽合肥', 117,12,31,48),
    'Hangzhou': ('HZ', '浙江杭州', 119,94,30,8),
    'Wuhan': ('WH', '湖北武汉', 114,2,30,42),
}
DISEASE = {
    'Donggang': ('DG', '辽宁东港', 124,8,39,55),
    'Jinzhai': ('JZ', '安徽金寨', 115,48,31,12),
    'Hangzhou': ('HZ', '浙江杭州 · 稻瘟病鉴定', 119,18,30,11),
    'Wuzhou': ('WZ', '广西梧州', 111,5,22,47),
    'Yuxi': ('YX', '云南玉溪', 103,27,24,41),
    'Menghai': ('MH', '云南勐海', 100,20,21,97),
    'Beijing': ('BJ', '北京', 116,14,40,10),
}
PROTOCOLS = {
    'heading': ('sowing_to_50_percent_heading', '抽穗期于田间记录。从播种起，至约 50% 的穗露出剑叶叶鞘，按天计。', 'Days from sowing to 50% panicle emergence above the flag-leaf sheath.', METHOD, HAN),
    'length': ('postharvest_grain_length', '收获后在实验室测定粒长，单位 mm。论文按水稻标准鉴定体系记录。', 'Grain length measured after harvest in the laboratory, in millimetres.', METHOD, HAN),
    'width': ('postharvest_grain_width', '收获后在实验室测定粒宽，单位 mm。论文按水稻标准鉴定体系记录。', 'Grain width measured after harvest in the laboratory, in millimetres.', METHOD, HAN),
    'leaf_blast': ('leaf_blast_severity', '以叶片发病程度评分，常规叶瘟等级为 0–9。', 'Leaf blast severity was rated on a 0–9 scale for the standard score.', 'Supplementary Note, Evaluation of blast resistance, PDF pp. 21–22', '水稻品种区域试验稻瘟病抗性鉴定与评价技术规程（2014，原文引）'),
    'neck_blast': ('neck_blast_incidence_grade', '早熟阶段按每份材料 10 个穗的发病率评价，分为 0、1、3、5、7、9 级。', 'Neck blast classified from incidence on ten panicles per accession in early ripening, grades 0, 1, 3, 5, 7 and 9.', 'Supplementary Note, Evaluation of blast resistance, PDF pp. 21–22', '水稻品种区域试验稻瘟病抗性鉴定与评价技术规程（2014，原文引）'),
    'blight': ('bacterial_blight_lesion_length', '北京 2023 年按菌株分别记录叶片病斑长度，单位 cm。每株测定叶片的病斑长度，原法每株系评价 5 株。', 'Leaf lesion length in centimetres at Beijing in 2023, recorded separately by strain, with five plants per strain in the reported protocol.', 'Supplementary Note, Evaluation of leaf bacterial blight, PDF p. 22', 'Wei et al. 2021（补件所引）'),
    'sheath': ('sheath_blight_relative_lesion_height', '以病斑高度除以秆长计算相对病斑高度（%）。病斑高度取秆上最低至最高病斑间距，秆长取土表至穗颈。每株取病斑最重的 3 个分蘖，每重复 3 株。', 'Relative lesion height is lesion height divided by culm length, expressed as a percentage. Three most affected tillers per plant and three plants per replicate were assessed.', 'Supplementary Note, Evaluation of sheath blight resistance, PDF p. 23', 'Zhang et al. 2019（补件所引）'),
}

path = PUBLIC / 'annotations/environments.tsv'
with path.open() as src:
    rows = list(csv.DictReader(src, delimiter='\t'))
result = []
for r in rows:
    trait = r['trait_id']
    field = trait in ('heading','length','width')
    key,text,en,locator,standard = PROTOCOLS[trait]
    coords = (FIELD if field else DISEASE).get(r['site'])
    site_status,site_code,coordinate_literal,latitude,longitude = 'standard_site', '', '', '', ''
    if coords:
        site_code,r['site_label'],e,em,n,nm = coords
        coordinate_literal = f'{e}°{em:02d}′ E, {n}°{nm:02d}′ N'
        if em<60 and nm<60:
            latitude,longitude = f'{n+nm/60:.6f}',f'{e+em/60:.6f}'
        else:
            site_status = 'source_minutes_out_of_range'
    else:
        site_status = 'workbook_spelling_unresolved'
    gaps = []
    if trait in ('length','width'):gaps.append('论文 Phenotyping 段未写明粒样数量及仪器，详见作者所引标准。')
    if r['assay'].startswith('SLBR_CH'):
        key='leaf_blast_strain_endpoint'
        text='叶瘟分菌株鉴定，原始指标为 '+r['assay']+'。原表未注明量纲。'
        en='Strain-specific leaf blast endpoint '+r['assay']+'. The workbook does not label its unit.'
        gaps.append('通用等级与这一分菌株列的换算未确认。')
    if site_status=='source_minutes_out_of_range':gaps.append('原文坐标分值超出 0–59，显示原记法。十进制度留空。')
    if site_status=='workbook_spelling_unresolved':gaps.append('原表 Jinhai 与补件所列 Jinzhai 的对应尚未确认。')
    result.append({**r,'protocol_id':key,'method_description':text,'method_en':en,'protocol_locator':locator,
        'standard':standard,'field_design':FIELD_DESIGN if field else '', 'quality_control':FIELD_QC if field else '',
        'method_status':'source_bound_with_gaps' if gaps else 'source_bound', 'protocol_gap':' '.join(gaps),
        'site_code':site_code,'site_status':site_status,'coordinate_literal':coordinate_literal,
        'latitude':latitude,'longitude':longitude,'source_doi':DOI})

assert len(result)==66 and len({r['environment_id'] for r in result})==66
target = PUBLIC / 'annotations/phenotyping.tsv'
temp = target.with_suffix('.tsv.partial')
with temp.open('w',newline='') as out:
    writer = csv.DictWriter(out, fieldnames=list(result[0]), delimiter='\t', lineterminator='\n')
    writer.writeheader()
    writer.writerows(result)
temp.replace(target)
