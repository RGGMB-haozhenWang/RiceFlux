"""Join 3K public accession metadata, historical descriptors and RPAN PAV."""
import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from zipfile import ZipFile

PAPER = '10.1038/s41586-018-0063-9'
LEGACY = '10.1186/2047-217X-3-7'
PAV_PAPER = '10.1038/sdata.2018.79'
PAV_DATA = '10.6084/m9.figshare.5103769.v1'
S3 = 'https://s3.amazonaws.com/3kricegenome'
PMC = 'https://pmc-oa-opendata.s3.amazonaws.com'
RPAN = 'https://cgm.sjtu.edu.cn/3kricedb'


def worksheet(file, number):
    with ZipFile(file) as archive:
        strings = [''.join(t.text or '' for t in row.findall('.//{*}t'))
                   for row in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
        doc = ET.fromstring(archive.read(f'xl/worksheets/sheet{number}.xml'))
    for row in doc.findall('.//{*}row'):
        cells = {}
        for cell in row.findall('{*}c'):
            value = cell.findtext('{*}v')
            if value not in (None,''):
                column = re.match(r'[A-Z]+', cell.get('r')).group()
                cells[column] = (strings[int(value)] if cell.get('t') == 's' else value).strip()
        yield int(row.get('r')), cells


def table(file, number, header):
    fields = {}
    for lineno, cells in worksheet(file, number):
        if lineno == header:
            fields = cells
        elif lineno > header and cells:
            yield lineno, {key:cells.get(col,'') for col,key in fields.items()}


def token(raw):
    key = re.sub(r'^IRGC\s*', '', raw.strip(), flags=re.I)
    return str(int(key)) if key.isdigit() else ''


def sample_id(raw):
    return raw.strip().replace('IRIS ', 'IRIS_')


def by_key(rows, key):
    groups = defaultdict(list)
    for row in rows:
        value = key(row)
        if value:
            groups[value].append(row)
    return groups


def sha(file):
    with file.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def tsv(file, columns, rows):
    with file.open('x') as handle:
        writer = csv.writer(handle, delimiter='\t', lineterminator='\n', quoting=csv.QUOTE_NONE, quotechar=None)
        writer.writerow(columns)
        for row in rows:
            writer.writerow(str(row.get(key,'')).replace('\t',' ').replace('\n',' ').replace('\r',' ') for key in columns)


def observations(opts):
    src, out = opts.sources, opts.out
    rows2014 = [dict(r, file_row=f'S1{suffix}:row{n}', id=sample_id(r['DNA_UNIQUE_ID']))
                for sheet,suffix in ((2,'A'),(3,'B')) for n,r in table(src/'id_3k_2014.xlsx',sheet,2)
                if r['DNA_UNIQUE_ID']]
    rows2018 = [dict(r, file_row=f'Table 1:row{n}', id=sample_id(r['3K_DNA_IRIS_UNIQUE_ID']))
                for n,r in table(src/'id_3k_2018.xlsx',2,2) if r['3K_DNA_IRIS_UNIQUE_ID']]
    by14, by18 = by_key(rows2014,lambda r:r['id']), by_key(rows2018,lambda r:r['id'])
    for mapping in (by14,by18):
        if any(len(rows)!=1 for rows in mapping.values()):
            raise ValueError('Publication accession metadata has non-unique DNA IDs')

    def fam(prefix):
        with gzip.open(src/f'{prefix}.fam.gz','rt') as handle:
            return {line.split()[1] for line in handle}

    snp, indel = fam(opts.snp_prefix), fam('indel')
    open_vcf=gzip.open(opts.vcf,'rt') if opts.vcf.suffix=='.gz' else opts.vcf.open()
    with open_vcf as handle:
        sample_ids = next(line.rstrip('\n').split('\t')[9:] for line in handle if line.startswith('#CHROM\t'))
    if len(sample_ids)!=len(set(sample_ids)) or set(sample_ids)!=snp|indel:
        raise ValueError('VCF sample axes do not reconcile with source FAM')
    samples=[]
    for id in sample_ids:
        a = (by18.get(id) or [{}])[0]
        b = (by14.get(id) or [{}])[0]
        group=a.get('K9_group_Admixture') or 'NA'
        subspecies = {'XI':'Xian/indica','GJ':'Geng/japonica','cA':'circum-Aus','cB':'circum-Basmati'}.get(group.split('-')[0],group)
        samples.append(dict(sample_id=id,name=a.get('Genetic_Stock_varname') or b.get('DNA_VARNAME_source') or id,
            source_group=group,subspecies=subspecies,region=a.get('Region_of_Origin') or 'NA',
            country=a.get('Country_Origin_updated') or b.get('ORI_COUNTRY') or '',material_type='germplasm accession',
            stock_accession=a.get('Genetic_Stock_Accession') or b.get('Genetic_Stock_Accno') or '',
            source_accession=a.get('IRGC_Accno_source') or b.get('DNA_Accno_source') or '',
            original_name=a.get('Other_VARNAME_source') or b.get('DNA_VARNAME_source') or '',
            source_status=a.get('Status_with_Pedigree-plus-knowledge',''),
            identity_2018=a.get('file_row',''),identity_2014=b.get('file_row',''),
            snp_in_fam=int(id in snp),indel_in_fam=int(id in indel)))

    genetic, origin, entry = defaultdict(set), defaultdict(set), defaultdict(set)
    for a in rows2014+rows2018:
        if a['id'] not in snp|indel:
            continue
        for index,raw in [(genetic,a.get('Genetic_Stock_Accno') or a.get('Genetic_Stock_Accession','')),
                          (origin,a.get('DNA_Accno_source') or a.get('IRGC_Accno_source',''))]:
            key=token(raw)
            if key:
                index[key].add(a['id'])
        if a.get('Entry_No') and a['file_row'].startswith('S1A'):
            entry[a['Entry_No']].add(a['id'])

    workbook=src/'catalog_3k.xlsx'
    source_rows={}
    joins=[]
    for n,row in table(workbook,2,1):
        stock, gs, source = row['STOCK_ID'],token(row['GS_ACCNO']),token(row['Source_Accno'])
        if not stock:
            continue
        if stock in source_rows:
            raise ValueError(f'Non-unique STOCK_ID in consolidated workbook: {stock}')
        g, o, e=genetic[gs],origin[source],entry[stock]
        matched=g if len(g)==1 and (not o or g&o) else g&o
        basis='exact_genetic_stock' if len(g)==1 else 'genetic_stock_and_source'
        if not g:
            matched=o&e
            basis='original_accession_and_published_entry'
        accepted=len(matched)==1
        id=next(iter(matched)) if accepted else ''
        why=basis if accepted else ('conflicting_ids' if g and o and not g&o else 'unresolved_identity')
        join=dict(stock_id=stock,gs_accno=gs,source_accno=source,workbook_row=n,sample_id=id,match=why)
        source_rows[stock]=join
        joins.append(join)
    # A source record is retained by its original cell address and method.
    descriptors=[]
    for data_sheet,dictionary_sheet,label in [(6,4,'<2007 Dictionary'),(7,5,'>2007 Dictionary')]:
        names, codes={}, {}
        for _,row in table(workbook,dictionary_sheet,1):
            field=row['Field Name']
            if field:
                names[field]=row['Descriptor']
                codes[(field,row['Value'])]=row['Value Description']
        for n,row in table(workbook,data_sheet,1):
            stock=row['STOCK_ID']
            id=source_rows.get(stock,{}).get('sample_id')
            if not id:
                continue
            for field,code in row.items():
                if field in ('STOCK_ID','NAME','CROPYEAR') or not code or code in ('NA','.'):
                    continue
                descriptors.append(dict(sample_id=id,descriptor_id=field,descriptor=names.get(field) or field,
                    value_code=code,value_label=codes.get((field,code),''),site='',crop_year=row['CROPYEAR'],
                    dictionary_id=label,source_id='historic',source_record_id=f'sheet{data_sheet}:row{n}:{field}'))
    if not descriptors:
        raise ValueError('No identity-verified 3K phenotype observations')

    genes=json.loads(gzip.decompress(opts.catalog.read_bytes()))['genes']
    rap_index=by_key(genes,lambda g:g.get('catalog',{}).get('rap') or (g['id'] if g['id'].startswith('Os') else ''))
    pav_groups=[]
    group_names=['cB(aro)','cA(Aus)','ADM','ind1','ind2','ind3','ind4','ind5','jap1','jap2','jap3','jap4']
    with (src/'rpan_gene_feature.tsv').open() as handle:
        original=list(csv.DictReader(handle,delimiter='\t'))
    group_size={key:max(int(row[key]) for row in original) for key in group_names}
    if sum(group_size.values())!=453 or max(int(row['ALL']) for row in original)!=453:
        raise ValueError('RPAN release group sizes do not reconcile with the 453-accession source')
    for row in original:
        r=rap_index.get(row['Gene_id'],[])
        if len(r)!=1:
            continue
        for group,total in [('ALL',453),*group_size.items()]:
            present=int(row[group])
            if present>total or sum(int(row[key]) for key in group_names)!=int(row['ALL']):
                raise ValueError('Invalid RPAN group counts '+row['Gene_id'])
            pav_groups.append(dict(pav_id='rpan_'+row['Gene_id'],gene_id=r[0]['id'],source_gene_id=row['Gene_id'],
                source_id='rpan',population='RPAN 453' if group=='ALL' else group,present=present,denominator=total))

    tsv(out/'samples.tsv',samples[0].keys(),samples)
    tsv(out/'descriptors.tsv',descriptors[0].keys(),descriptors)
    tsv(out/'sample_joins.tsv',joins[0].keys(),joins)
    tsv(out/'pav_summary.tsv',pav_groups[0].keys(),pav_groups)
    tsv(out/'environments.tsv',('environment_id','trait_id','trait_name','unit','category','family','assay','site','year'),[])
    tsv(out/'phenotypes.tsv',('sample_id',),[])
    coverage={'accessions':len(samples),'sample_metadata_2018':sum(bool(r['identity_2018']) for r in samples),
        'sample_metadata_2014':sum(bool(r['identity_2014']) for r in samples),
        'phenotype_rows':len(descriptors),'phenotyped_accessions':len({r['sample_id'] for r in descriptors}),
        'phenotype_descriptor_count':len({r['descriptor_id'] for r in descriptors}),
        'phenotype_code_without_label':sum(not r['value_label'] for r in descriptors),
        'phenotype_identity_outcomes':dict(Counter(r['match'] for r in joins)),
        'pav_genes_aggregate':len({r['gene_id'] for r in pav_groups}),'pav_summary_rows':len(pav_groups),
        'pav_published_cohort_size':453,'pav_per_accession_records':0}

    def source(id,role,release,citation,method,url,files,**extra):
        return dict(id=id,role=role,release=release,citation=citation,method=method,url=url,
            files=[dict(name=name,url=href,sha256=sha(src/name)) for name,href in files],**extra)

    snp_dir=f'{S3}/snpseek-dl/3krg-base-filt-core-v0.7'
    snp_files=[(f'{opts.snp_prefix}.{ext}.gz',f'{snp_dir}/core_v0.7.{ext}.gz') for ext in ('bed','bim','fam')]
    indel_files=[(f'indel.{ext}.gz',f'{S3}/reduced/Nipponbare_indel.{ext}.gz') for ext in ('bed','bim','fam')]
    release=opts.release
    sources=[
        source('snp','genotype','CoreSNP v0.7','3K RG CoreSNP','LD-pruned biallelic SNP calls from SNP-Seek PLINK',snp_dir+'/readme_core_v0.7.txt',snp_files,doi=PAPER,assembly='IRGSP-1.0/MSU7'),
        source('indel','genotype','InDel v4','3K RG biallelic InDel','Variant-major PLINK calls. REF orientation independently checked against Nipponbare.',S3+'/reduced/3krg-indel-README.txt',indel_files,doi=PAPER,assembly='IRGSP-1.0/MSU7'),
        source('identity_2018','identity','Supplementary Data 1','Wang et al., Nature 2018','DNA ID, K9 group, country and region: Table 1 Metadata','https://doi.org/'+PAPER,
            [('id_3k_2018.xlsx',PMC+'/PMC6784863.1/41586_2018_63_MOESM3_ESM.xlsx')],doi=PAPER),
        source('identity_2014','identity','Supplementary Table S1','3K Rice Genomes Project, GigaScience 2014','DNA ID, published entry and genetic stock accession','https://doi.org/'+LEGACY,
            [('id_3k_2014.xlsx',PMC+'/PMC4035669.1/2047-217X-3-7-S1.xlsx')],doi=LEGACY),
        source('historic','phenotype','v20170411','IRRI SNP-Seek 3K historical phenotypes','Historical categorical observations with their original old/new descriptor dictionaries.',S3+'/snpseek-dl/phenotype/3kRG_PhenotypeData_v20170411.xlsx',
            [('catalog_3k.xlsx',S3+'/snpseek-dl/phenotype/3kRG_PhenotypeData_v20170411.xlsx')]),
        source('rpan','pav','GeneFeature.txt','RPAN 453 high-depth accessions','Published map-to-pan gene presence counts. Cohort and subgroups use the original RPAN denominators.',RPAN+'/data_download.php',
            [('rpan_gene_feature.tsv',RPAN+'/data/GeneFeature.txt')],doi=PAV_PAPER,related_data_doi=PAV_DATA),
    ]
    archive=dict(schema='RiceFlux provenance 1.0',sources=sources,coverage=coverage,assembly='IRGSP-1.0/MSU7',
        transformation='区域 GT 按 FASTA 定向、左对齐并转为非分相二倍体。区域选取依据为 RiceFlux 已建模基因及其登记窗口。历史表型保留分类代码与原始字典。',
        gaps=['PAV 原始逐材料矩阵访问受限，接入 RPAN 原库发布群体汇总。','Dataverse 定量表下载需要填写访客登记，本版使用 IRRI 历史分类表型。'],
        regional_extraction=json.loads(opts.extraction.read_text()))
    manifest=dict(schema='RiceFlux tables 1.2',id='rice3k',name='3K Rice Genomes',version=release,
        assembly='IRGSP-1.0/MSU7',genotype_evidence='G_chip',source='https://doi.org/'+PAPER,
        provenance=archive)
    (out/'manifest_source.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    (out/'observation_coverage.json').write_text(json.dumps(coverage,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps(coverage,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for arg in ('sources','catalog','vcf','extraction','out'):
        parser.add_argument('--'+arg,type=Path,required=True)
    parser.add_argument('--snp-prefix',default='core',choices=('core',))
    parser.add_argument('--release',default='2026-11-20.1')
    args=parser.parse_args()
    args.out.mkdir()
    observations(args)
