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
            if col not in ('A','B','C','D','L'):
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


def run(args):
    reference=json.loads(gzip.decompress(args.reference.read_bytes()))
    old_msu,old_rap=defaultdict(list),defaultdict(list)
    for g in reference['genes']:
        if g['catalog'].get('historical'):
            continue
        for field,index in [('msu',old_msu),('rap',old_rap)]:
            if value:=g['catalog'].get(field):
                index[value].append(g['id'])
    msu_for_rap,rap_for_msu=crosswalk(args.crosswalk)
    records={}
    stats=Counter()
    audit=[]
    for row,values in xlsx_rows(args.workbook):
        stats['source_rows']+=1
        msu,rap=values.get('B',''),values.get('C','')
        msu=msu if MSU.fullmatch(msu) else ''
        rap=rap if RAP.fullmatch(rap) else ''
        original=(msu,rap)
        if not(msu or rap):
            stats['no_stable_id']+=1
            audit.append((row,*original,'','no_stable_id'))
            continue
        warning=''
        if rap and not msu and len(msu_for_rap[rap])==1:
            msu=next(iter(msu_for_rap[rap]))
        if msu and rap and msu_for_rap[rap]!={msu}:
            stats['rap_pair_not_unique']+=1
            warning='rap_pair_not_unique'
            rap=''
        if msu and not rap:
            candidates=[r for r in rap_for_msu[msu] if msu_for_rap[r]=={msu}]
            if len(candidates)==1:
                rap=candidates[0]
        # Join by a source accession, never by a possibly shared gene symbol.
        old=set(old_msu.get(msu,()))|set(old_rap.get(rap,()))
        if len(old)>1:
            stats['legacy_ambiguous_rows']+=1
            audit.append((row,*original,'','legacy_identity_ambiguous'))
            continue
        if old:
            key=next(iter(old))
            route='legacy_overlap'
        else:
            key=msu or rap
            route='extension'
        rec=records.setdefault(key,{'route':route,'msu':msu,'raps':set(),'names':[], 'aliases':set(),'dois':set()})
        if rap:
            rec['raps'].add(rap)
        rec['names'].extend(symbols(values['A']))
        rec['aliases'].update(symbols(values.get('L','')))
        rec['dois'].update(d.lower().rstrip('.') for d in DOI.findall(values.get('D','')))
        audit.append((row,*original,key,route+(':'+warning if warning else '')))
    stats['unique_workbook_loci']=len(records)
    stats['duplicate_source_rows']=stats['source_rows']-stats['no_stable_id']-stats['legacy_ambiguous_rows']-len(records)
    stats['legacy_overlap']=sum(r['route']=='legacy_overlap' for r in records.values())
    extension={key:r for key,r in records.items() if r['route']=='extension'}
    models=dict(gene_models(args.gff,{r['msu'] for r in extension.values()}))
    real_rows=[]
    for id_,r in sorted(extension.items()):
        msu=r['msu']
        rap=next(iter(r['raps'])) if len(r['raps'])==1 else ''
        name=next(iter(r['names']),id_)
        aliases=sorted((set(r['names'])|r['aliases'])-{name,id_,msu,rap})
        chr_,start,end,strand,transcript,features=models.get(msu,('','','','','',[]))
        if chr_:
            stats['mapped_new_genes']+=1
        real_rows.append((id_,name,msu,rap,';'.join(aliases),chr_,start,end,strand,transcript,
                          ';'.join(f'{a}-{b}' for a,b in features),';'.join(sorted(r['dois']))))
    stats['legacy_entries']=len(reference['genes'])
    stats['extension_entries']=len(real_rows)
    stats['catalog_total']=stats['legacy_entries']+stats['extension_entries']
    stats['unlocated_new_genes']=stats['extension_entries']-stats['mapped_new_genes']
    payload=write_table(COLUMNS,real_rows)
    manifest={
        'schema':'RiceFlux gene catalog 1.0','version':args.version,'file':'genes.tsv.gz','assembly':'IRGSP-1.0/MSU7',
        'sha256':hashlib.sha256(payload).hexdigest(),'counts':dict(stats),
        'inputs':{'workbook_sha256':sha(args.workbook),'reference_sha256':sha(args.reference),
                  'crosswalk_sha256':sha(args.crosswalk),'gff_sha256':sha(args.gff)},
    }
    args.out.mkdir()
    (args.out/'genes.tsv.gz').write_bytes(gzip.compress(payload,compresslevel=9,mtime=0))
    (args.out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    (args.out/'workbook_row_audit.tsv').write_bytes(write_table(('source_row','source_msu','source_rap','catalog_id','status'),audit))
    print(json.dumps(dict(stats),ensure_ascii=False,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for opt in ('workbook','reference','gff','crosswalk','out'):
        parser.add_argument('--'+opt,type=Path,required=True)
    parser.add_argument('--version',required=True)
    run(parser.parse_args())
