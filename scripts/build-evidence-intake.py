"""Deterministic annotations and a conservative RiceNavi adapter; frozen sources stay intact."""
from pathlib import Path
import csv, gzip, hashlib, io, json, re, zipfile

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
OUT = PUBLIC / 'annotations'
OUT.mkdir(exist_ok=True)

def read(path):
    raw = path.read_bytes()
    return gzip.decompress(raw).decode() if raw[:2] == b'\x1f\x8b' else raw.decode()

def rows(path):
    return list(csv.DictReader(io.StringIO(read(path)), delimiter='\t'))

def atomic(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_bytes(content if isinstance(content, bytes) else content.encode())
    temp.replace(path)

def table(path, keys, values):
    stream = io.StringIO()
    w = csv.DictWriter(stream, keys, delimiter='\t', lineterminator='\n', extrasaction='ignore')
    w.writeheader(); w.writerows(values)
    atomic(path, stream.getvalue())
    return stream.getvalue()

def aliases(g):
    names = {n.strip().casefold() for x in [g['name'], *g.get('catalog', {}).get('aliases', [])] for n in re.split(r'[;,/；]', x) if n.strip()}
    if g['id'] == 'Os06g0133000': names.add('waxy')  # RiceData gene/420, checked 2026-11-17.
    return names

ref = json.loads(read(PUBLIC / 'datasets/reference.json.gz'))
genes = ref['genes']
index = rows(PUBLIC / 'formats/gene_index.tsv')
by_id = {g['id']: g for g in genes}
alias_ids = {}
for g in genes:
    for alias in aliases(g): alias_ids.setdefault(alias, set()).add(g['id'])
audit = []
for g in genes:
    c = g['catalog']; entries = [r for r in index if r['riceflux_gene_id'] == g['id']]
    conflicts = [r for r in entries if r['MSU_ID'] not in ['', 'NA', c.get('msu')]]
    shared = sorted(a for a in aliases(g) if len(alias_ids[a]) > 1)
    status = 'id_conflict' if conflicts else 'msu_unresolved' if not c.get('msu') else 'matched_prior' if entries else 'supplemental_identity'
    # A symbol already present in the frozen identity record, not a new name inference.
    display = 'RCN1' if g['id'] == 'LOC_Os11g05470' and 'rcn1' in aliases(g) else g['name']
    audit.append(dict(gene_id=g['id'], msu_id=c.get('msu') or '', rap_id=c.get('rap') or '', display_name=display,
        original_name=g['name'], aliases=';'.join(sorted(aliases(g))), identity_status=status,
        shared_aliases=';'.join(shared), prior_records=len(entries), identity_source=c.get('identity') or '',
        review_scope='frozen_prior_ID_consistency; not_new_external_validation'))
assert not any(r['identity_status'] == 'id_conflict' for r in audit), 'Resolve conflicting prior IDs before publication'
table(OUT / 'gene_identity.tsv', list(audit[0]), audit)

source = PUBLIC / 'sources/ricenavi-20261025'
loci, materials = rows(source / 'loci.tsv'), rows(source / 'materials.tsv')
known = {(g['chromosome'], str(v['pos'])): (g, v) for g in genes for v in g['variants']}
admission, accepted = [], []
for r in loci:
    match = known.get((r['chromosome'], r['position_literal']))
    reason = 'non_biallelic_SNP_adapter_required' if r['variant_type'] != 'SNP' else 'not_in_verified_marker_dictionary' if not match else ''
    if not reason:
        g, v = match
        if (r['ref_literal'], r['alt_literal']) != (v['ref'], v['alt']): reason = 'REF_ALT_mismatch'
        elif r['gene_symbol'].casefold() not in aliases(g): reason = 'gene_identity_unresolved'
        else: accepted.append((r, g, v))
    admission.append(dict(external_id=r['external_id'], source_row=r['source_row'], reported_gene=r['gene_symbol'],
        chr=r['chromosome'], position=r['position_literal'], variant_type=r['variant_type'],
        gene_id=match[0]['id'] if match else '', marker_id=match[1]['id'] if not reason else '',
        status='admitted' if not reason else 'source_only', reason=reason or 'exact_gene_chr_pos_REF_ALT',
        confidence='source_reported; per_call_QC_unavailable', source_commit=r['version']))
assert len(accepted) == 23 and len(materials) == 404
table(OUT / 'ricenavi_admission.tsv', list(admission[0]), admission)
package = PUBLIC / 'datasets/ricenavi-v1'
selected = {r['external_id']: v for r, g, v in accepted}
calls = {m['material_id']: {} for m in materials}
counts = dict(complete=0, partial=0, missing=0, heterozygous=0)
for r in rows(source / 'calls.tsv.gz'):
    if r['external_id'] not in selected: continue
    v = selected[r['external_id']]
    alleles = json.loads(r['decoded_alleles'])
    if alleles is None: alleles = [None, None]
    assert len(alleles) == 2
    pair = [a if a in [v['ref'], v['alt']] else '.' for a in alleles]
    assert all(a in [v['ref'], v['alt'], None, '.', 'N', '0', ''] for a in alleles), (r, v)
    target = calls[r['material_id']]
    assert v['id'] not in target
    target[v['id']] = '/'.join(sorted(pair))  # Source pipe is not certified phase.
    missing = pair.count('.')
    counts['missing' if missing == 2 else 'partial' if missing else 'complete'] += 1
    counts['heterozygous'] += int(not missing and pair[0] != pair[1])
texts = {}
texts['samples'] = table(package / 'samples.tsv', ['sample_id','name','source_group','subspecies','region','material_type'], [
    dict(sample_id=m['material_id'], name=m['reported_name'], source_group='RiceNavi:'+(m['reported_type'] or 'unrecorded'),
         subspecies=m['reported_type'] or 'NA', region=m['reported_country'] or 'NA', material_type='source catalog accession') for m in materials])
texts['variants'] = table(package / 'variants.tsv', ['marker_id','gene_id','chr','position','ref','alt'], [
    dict(marker_id=v['id'], gene_id=g['catalog'].get('msu') or g['id'], chr=g['chromosome'], position=v['pos'], ref=v['ref'], alt=v['alt']) for r,g,v in accepted])
texts['genotypes'] = table(package / 'genotypes.tsv', ['sample_id', *[v['id'] for r,g,v in accepted]], [
    dict(sample_id=m['material_id'], **calls[m['material_id']]) for m in materials])
assert all(len(c) == len(accepted) for c in calls.values())
texts['environments'] = table(package / 'environments.tsv', ['environment_id','trait_id','trait_name','unit','category','family','assay','site','year'], [])
texts['phenotypes'] = table(package / 'phenotypes.tsv', ['sample_id'], [dict(sample_id=m['material_id']) for m in materials])
manifest = dict(schema='RiceFlux tables 1.0', id='ricenavi404', name='RiceNavi 404', version='2026-11-17.1', assembly='IRGSP-1.0/MSU7',
    source='https://doi.org/10.1038/s41588-020-00769-9', genotype_evidence='G_chip',
    assay_description='Source-reported sequence calls; legacy G_chip means observed call, not a chip assay',
    confidence='not_certified', badge='D2',
    files={k:k+'.tsv' for k in texts}, sha256={k:hashlib.sha256(v.encode()).hexdigest() for k,v in texts.items()},
    counts=dict(samples=404, variants=len(accepted), environments=0),
    notes='Only exact gene + chromosome + coordinate + REF/ALT matches are admitted. Unphased diploid calls. No per-call depth/quality audit. Materials remain independent of 6044; original phenotypes lack bound site/year/method and stay in the source catalog.',
    source_commit=loci[0]['version'], admission_table='../../annotations/ricenavi_admission.tsv', call_counts=counts)
atomic(package / 'manifest.json', json.dumps(manifest, ensure_ascii=False, indent=2)+'\n')
support = []
for dataset, badge, variants in [('rice6044', 'D1', [(g,v) for g in genes for v in g['variants']]), ('ricenavi404','D2',[(g,v) for r,g,v in accepted])]:
    for g in genes:
        markers = [v for item,v in variants if item['id']==g['id']]
        if not markers: continue
        levels = [ref['evidence']['sites'].get(v['id'],{}).get('level','') for v in markers]
        support.append(dict(dataset_id=dataset,badge=badge,gene_id=g['id'],marker_count=len(markers),
            functional_sites=levels.count('原文功能位点'),haplotype_components=levels.count('文献单倍型组分'),
            marker_ids=';'.join(v['id'] for v in markers),high_confidence_sites=0,
            confidence_status='not_certified; per_call_depth_quality_not_bound'))
table(OUT / 'dataset_gene_support.tsv',list(support[0]),support)
table(PUBLIC / 'datasets/index.tsv', ['id','name','version','manifest'], [
    dict(id='rice6044',name='RiceAtlas 6044',version='2026-11-14.1',manifest='rice6044-v1/manifest.json'),
    dict(id=manifest['id'],name=manifest['name'],version=manifest['version'],manifest='ricenavi-v1/manifest.json')])

paper = 'https://doi.org/10.1016/j.molp.2025.03.007'
group_defs = [('SC','华南','South China','indica'),('CC-I','华中籼稻','Central China indica','indica'),('SW-I','西南籼稻','Southwest China indica','indica'),('NE','东北','Northeast China','japonica'),('CC-J','华中粳稻','Central China japonica','japonica'),('NC','华北','North China','japonica'),('SW-J','西南粳稻','Southwest China japonica','japonica')]
samples = rows(PUBLIC / 'datasets/rice6044-v1/samples.tsv')
groups = [dict(dataset_id='rice6044', code=code, label_zh=zh, label_en=en, expected_subspecies=sub,
    n=sum(s['source_group']==code for s in samples), source='6044_accession.xlsx; '+paper,
    interpretation='source_ecological_group; not_planting_site; retain_original_subspecies') for code,zh,en,sub in group_defs]
table(OUT / 'populations.tsv', list(groups[0]), groups)
locations = dict(Gongzhuling='公主岭',Tanghai='唐海',Hefei='合肥',Wuhan='武汉',Hangzhou='杭州',Kunming='昆明',Nanning='南宁',Donggang='东港',Menghai='勐海',Yuxi='玉溪',Jinzhai='金寨',Wuzhou='梧州',Beijing='北京')
dictionary = {r['column']:r for r in rows(PUBLIC / 'prior/phenotype_dictionary.tsv')}
envs = []
for e in rows(PUBLIC / 'datasets/rice6044-v1/environments.tsv'):
    col = e['environment_id'][4:]; original = dictionary[col]
    envs.append(dict(dataset_id='rice6044', **e, column=col, original_trait=original['trait'],
        site_label=locations.get(e['site'], e['site']+'（原表拼写待核 / spelling unresolved）'),
        site_status='source_header_spelling_unresolved' if e['site']=='Jinhai' else 'source_header_city_only',
        method_description='原表指标 / Source endpoint: '+original['trait'],
        method_status='endpoint_unit_traced; detailed_protocol_pending',
        source_table='6044_pheno(1).xlsx', source_locator='phenotype_dictionary.tsv column '+col,
        source_doi='10.1016/j.molp.2025.03.007',
        protocol_gap='起算/采样时期、仪器、重复数及评分/接种规程待原文逐项绑定 / timing, instruments, replicates and scoring/inoculation protocol not bound',
        latitude='', longitude=''))
table(OUT / 'environments.tsv', list(envs[0]), envs)
presets = [dict(gene_id='Os07g0695100', source_tag='FPLS1097622', title='Zhang et al. 2022 · DTH7 · GNP',
    doi='10.3389/fpls.2022.1097622', locator='Haplotype analysis; Supplementary Figure 5B,C',
    summary='4 个启动子 SNP 与 3 个非同义 SNP 定义 5 型，研究每穗粒数。/ Four promoter and three nonsynonymous SNPs define five haplotypes for grain number per panicle.',
    caveat='文献关联单倍型组分；不是每个 SNP 均经独立因果验证。坐标与碱基继承已验收先验。/ Association haplotype components, not seven independently validated causal variants; coordinates and bases inherited from the accepted prior.')]
table(OUT / 'presets.tsv', list(presets[0]), presets)
print(json.dumps(dict(riceNavi=manifest['counts'], calls=counts, genes=len({g['id'] for r,g,v in accepted}), identity_status={s:sum(r['identity_status']==s for r in audit) for s in set(r['identity_status'] for r in audit)}, shared_alias_genes=sum(bool(r['shared_aliases']) for r in audit), environments=len(envs)), ensure_ascii=False))
