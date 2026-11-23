"""Register named rice loci from the supplied XLSX and frozen reference annotations."""
import argparse
from collections import Counter, defaultdict
import csv
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
from xml.etree import ElementTree as ET
from zipfile import ZipFile

MSU = re.compile(r'LOC_Os(?:0[1-9]|1[0-2])g\d{5}')
RAP = re.compile(r'Os(?:0[1-9]|1[0-2])g\d{7}')
DOI = re.compile(r'10\.\d{4,9}/[-._;()/\w]+', re.ASCII | re.I)
SYMBOL = re.compile(r'[A-Za-z0-9][A-Za-z0-9_().+\-]{0,59}')
COLUMNS = ('gene_id','name','msu','rap','aliases','chr','gene_start','gene_end','strand','transcript','cds','catalog_dois')


def sha(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle,'sha256').hexdigest()


def xlsx_rows(file):
    with ZipFile(file) as archive:
        names=archive.namelist()
        strings = [''.join(t.text or '' for t in row.findall('.//{*}t'))
                   for row in ET.fromstring(archive.read('xl/sharedStrings.xml'))] if 'xl/sharedStrings.xml' in names else []
        doc = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
    for row in doc.findall('.//{*}row'):
        values={}
        for cell in row.findall('{*}c'):
            col=re.match(r'[A-Z]+',cell.get('r','')).group()
            if col not in tuple('ABCDEFGHIJKL'):
                continue
            value=cell.findtext('{*}v')
            kind=cell.get('t')
            if kind=='s':
                value=strings[int(value)]
            elif kind=='inlineStr':
                value=''.join(t.text or '' for t in cell.findall('.//{*}t'))
            values[col]=(value or '').strip()
        if row.get('r')=='1':
            if (values.get('A'),values.get('B'),values.get('C'),values.get('D'))!=('基因名','MSUID','RAPID','DOI编号'):
                raise ValueError('Unexpected workbook columns')
        elif values.get('A'):
            yield int(row.get('r')),values


def crosswalk(file):
    msu_for_rap,rap_for_msu=defaultdict(set),defaultdict(set)
    with gzip.open(file,'rt') as handle:
        for line in handle:
            rap,_,ids=line.strip().partition('\t')
            if not RAP.fullmatch(rap):
                continue
            for token in ids.split(','):
                msu=token.split('.')[0].strip()
                if MSU.fullmatch(msu):
                    msu_for_rap[rap].add(msu)
                    rap_for_msu[msu].add(rap)
    return msu_for_rap,rap_for_msu


def gene_models(file,requested):
    genes,transcripts,cds={},{},defaultdict(set)
    with gzip.open(file,'rt') as handle:
        for line in handle:
            if line.startswith('#'):
                continue
            fields=line.rstrip('\n').split('\t')
            if len(fields)!=9 or fields[2] not in ('gene','mRNA','CDS'):
                continue
            chr_,_,feature,start,end,_,strand,_,attributes=fields
            attrs=dict(item.split('=',1) for item in attributes.split(';') if '=' in item)
            id_,parent=attrs.get('ID',''),attrs.get('Parent','')
            if feature=='gene' and id_ in requested:
                if id_ in genes:
                    raise ValueError(f'Duplicate GFF gene: {id_}')
                genes[id_]=(chr_,int(start),int(end),strand)
            elif feature=='mRNA' and parent in requested:
                transcripts[id_]=parent
            elif feature=='CDS':
                for transcript in parent.split(','):
                    if transcript.split('.')[0] in requested:
                        cds[transcript].add((int(start),int(end)))
    by_gene=defaultdict(list)
    for transcript,gene in transcripts.items():
        by_gene[gene].append(transcript)
    for id_,model in genes.items():
        candidates=by_gene[id_]
        primary=id_+'.1'
        if primary not in candidates:
            primary=min(candidates,key=lambda t:(-sum(b-a+1 for a,b in cds[t]),t),default='')
        yield id_,(*model,primary,sorted(cds[primary]))


def write_table(columns,rows):
    stream=io.StringIO()
    writer=csv.writer(stream,delimiter='\t',lineterminator='\n',quoting=csv.QUOTE_NONE,quotechar=None)
    writer.writerow(columns)
    writer.writerows(rows)
    return stream.getvalue().encode()


def symbols(value):
    for word in re.split(r'\s*[,;，；、|/]\s*',value):
        if SYMBOL.fullmatch(word) and not re.search(r'candidate|putative',word,re.I):
            yield word


def clean(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def run(args):
    reference=json.loads(gzip.decompress(args.reference.read_bytes()))
    old_msu,old_rap=defaultdict(set),defaultdict(set)
    for g in reference['genes']:
        if g.get('catalog',{}).get('historical'):
            continue
        for field,index in [('msu',old_msu),('rap',old_rap)]:
            value=g.get('catalog',{}).get(field,'')
            if value:
                index[value].add(g['id'])
    msu_for_rap,rap_for_msu=crosswalk(args.crosswalk)
    corrections={}
    if args.corrections:
        ledger=json.loads(args.corrections.read_text())
        if ledger['input_sha256']!=sha(args.workbook):
            raise ValueError('Correction ledger is not bound to this workbook')
        corrections={int(c['cell'][1:]):c for c in ledger['changes']}
    records={}; stats=Counter(); audit=[]
    for row,v in xlsx_rows(args.workbook):
        stats['source_rows']+=1
        if row in corrections:
            c=corrections[row]
            if v.get('E','')!=c['before']:
                raise ValueError(f'Correction source mismatch at row {row}')
            v['E']=c['after']; stats['restored_abstract_cells']+=1
        source_msu,source_rap=v.get('B',''),v.get('C','')
        msu=source_msu if MSU.fullmatch(source_msu) else ''
        rap=source_rap if RAP.fullmatch(source_rap) else ''
        status='source_stable_id'
        if rap and not msu and len(msu_for_rap[rap])==1:
            msu=next(iter(msu_for_rap[rap])); status='exact_crosswalk'
        if msu and rap and msu_for_rap[rap]!={msu}:
            rap=''; status='source_pair_unresolved'; stats['rap_pair_not_unique']+=1
        if msu and not rap:
            candidates=[r for r in rap_for_msu[msu] if msu_for_rap[r]=={msu}]
            if len(candidates)==1:
                rap=candidates[0]
        old=old_msu.get(msu,set())|old_rap.get(rap,set())
        if len(old)>1:
            key=f'UNRESOLVED_row_{row:05d}'; status='legacy_identity_ambiguous'
            msu=rap=''; stats['legacy_ambiguous_rows']+=1
        elif old:
            key=next(iter(old))
        else:
            key=msu or rap or f'UNRESOLVED_row_{row:05d}'
        if not(msu or rap):
            status='unresolved_no_stable_id' if not old else status
            stats['no_stable_id']+=1
        r=records.setdefault(key,dict(msu=msu,raps=set(),names=[],aliases=set(),dois=set(),rows=[],
            abstracts=[],annotations=[],traits=set(),statuses=set(),source_msu=set(),source_rap=set()))
        r['raps'].update([rap] if rap else [])
        r['names'].append(clean(v['A'])); r['aliases'].update(symbols(v.get('L','')))
        r['dois'].update(d.lower().rstrip('.') for d in DOI.findall(v.get('D','')))
        r['rows'].append(row); r['statuses'].add(status)
        r['source_msu'].add(source_msu); r['source_rap'].add(source_rap)
        if v.get('E'): r['abstracts'].append(clean(v['E']))
        ann={field:clean(v.get(col,'')) for col,field in [('F','msu_annotation'),('G','rap_annotation'),('H','go'),('I','kegg_gene'),('J','kegg_ko'),('K','kegg_pathway')] if v.get(col)}
        if ann: r['annotations'].append(ann)
        for fragment in re.findall(r'相关表型包括([^。]+)',v.get('E','')):
            r['traits'].update(clean(x) for x in re.split('[、；;]',fragment) if clean(x))
        audit.append((row,clean(v['A']),source_msu,source_rap,key,status))
    stats['unique_workbook_loci']=len(records)
    stats['duplicate_source_rows']=stats['source_rows']-len(records)
    legacy_ids={g['id'] for g in reference['genes']}
    stats['legacy_overlap']=sum(k in legacy_ids for k in records)
    extension={k:r for k,r in records.items() if k not in legacy_ids}
    models=dict(gene_models(args.gff,{r['msu'] for r in extension.values()}))
    rows=[]
    extra=('original_names','source_rows','traits','evidence_abstract','source_annotations','identity_status','source_msu','source_rap','bibliography_status')
    for id_,r in sorted(records.items()):
        msu=r['msu']; rap=next(iter(r['raps'])) if len(r['raps'])==1 else ''
        name=r['names'][0]
        aliases=sorted((set(r['names'])|r['aliases'])-{name,id_,msu,rap})
        chr_,start,end,strand,transcript,features=models.get(msu,('','','','','',[]))
        if chr_ and id_ in extension: stats['mapped_new_genes']+=1
        if r['abstracts']: stats['entries_with_abstract']+=1
        if r['dois']: stats['entries_with_doi']+=1
        js=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
        rows.append((id_,name,msu,rap,';'.join(aliases),chr_,start,end,strand,transcript,
            ';'.join(f'{a}-{b}' for a,b in features),';'.join(sorted(r['dois'])),
            js(list(dict.fromkeys(r['names']))),js(r['rows']),js(sorted(r['traits'])),
            ' | '.join(dict.fromkeys(r['abstracts'])),js(r['annotations']),';'.join(sorted(r['statuses'])),
            js(sorted(r['source_msu']-{''})),js(sorted(r['source_rap']-{''})),
            'source_doi_not_independently_reviewed' if r['dois'] else 'missing_doi'))
    stats['legacy_entries']=len(reference['genes'])
    stats['extension_entries']=len(extension)
    stats['enrichment_entries']=stats['legacy_overlap']
    stats['table_entries']=len(rows)
    stats['catalog_total']=stats['legacy_entries']+stats['extension_entries']
    stats['unlocated_new_genes']=stats['extension_entries']-stats['mapped_new_genes']
    payload=write_table(COLUMNS+extra,rows)
    manifest={'schema':'RiceFlux gene catalog 1.1','version':args.version,'file':'genes.tsv.gz',
        'assembly':'IRGSP-1.0/MSU7','sha256':hashlib.sha256(payload).hexdigest(),'counts':dict(stats),
        'inputs':{key+'_sha256':sha(value) for key,value in vars(args).items() if key in ('workbook','reference','gff','crosswalk','corrections') and value},
        'source_status':'resident_workbook_backup_with_bound_cell_corrections' if corrections else 'resident_workbook',
        'identity_rule':'exact accession and unique RAP-MSU mapping; gene symbols never join records',
        'evidence_status':'Source functional annotations and DOI are retained, not independently verified abstracts or proof of cloned status.',
        'crosswalk':{'version':'RAP-MSU 2026-02-05','columns':['RAP gene identifier','comma-separated MSU transcript identifiers'],'url':'https://rapdb.dna.affrc.go.jp/download/irgsp1.html'}}
    args.out.mkdir(exist_ok=False)
    for file,content in [('genes.tsv.gz',gzip.compress(payload,compresslevel=9,mtime=0)),('genes.tsv',payload),
        ('manifest.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode()),
        ('workbook_row_audit.tsv',write_table(('source_row','original_name','source_msu','source_rap','catalog_id','status'),audit))]:
        target=args.out/file; partial=target.with_suffix(target.suffix+'.partial'); partial.write_bytes(content); partial.replace(target)
    print(json.dumps(dict(stats),ensure_ascii=False,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for opt in ('workbook','reference','gff','crosswalk','out'):
        parser.add_argument('--'+opt,type=Path,required=True)
    parser.add_argument('--corrections',type=Path)
    parser.add_argument('--version',required=True)
    run(parser.parse_args())
