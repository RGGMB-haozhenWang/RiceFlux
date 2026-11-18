"""Produce an on-demand browser index for the accepted RiceData/D1 region archive."""
import argparse
import csv
import gzip
import hashlib
import io
import json
import os
from collections import defaultdict
from pathlib import Path

def sha(path):
    if path.stat().st_flags & 0x40000000: raise ValueError(f'Offline placeholder: {path}')
    with path.open('rb') as file: return hashlib.file_digest(file,'sha256').hexdigest()

def rows(path):
    reader = gzip.open if path.suffix=='.gz' else open
    with reader(path,'rt',encoding='utf-8',newline='') as file:
        yield from csv.DictReader(file,delimiter='\t')

def write(path,data):
    part=path.with_suffix(path.suffix+'.partial')
    part.write_bytes(data);part.replace(path)

def tsv(fields,records):
    return ('\t'.join(fields)+'\n'+''.join('\t'.join(str(row.get(key,'')).replace('\t',' ').replace('\n',' ').replace('\r',' ') for key in fields)+'\n' for row in records)).encode()

def main():
    parser=argparse.ArgumentParser(__doc__)
    parser.add_argument('delivery',type=Path)
    parser.add_argument('archive',type=Path)
    parser.add_argument('public',type=Path)
    args=parser.parse_args()
    delivery=json.loads(args.delivery.read_text());root=args.delivery.parent
    if delivery['schema']!='riceflux_cloned_regions_delivery_v1' or delivery['status']!='PASS':raise ValueError('Accepted delivery required')
    archive=args.archive;archive.mkdir(exist_ok=False)
    args.public.mkdir(parents=True,exist_ok=True)
    source=defaultdict(list)
    for row in rows(root/delivery['source_rows']):
        if row['mapped_msu']:source[row['mapped_msu']].append(row)
    gene_rows=[]
    for gene in rows(root/delivery['genes']):
        entries=source[gene['msu']]
        symbols=list(dict.fromkeys(e['gene_symbol'] for e in entries if e['gene_symbol']))
        gene_rows.append({**gene,'symbol':symbols[0] if symbols else gene['msu'],'aliases':' | '.join(symbols),
            'rap':';'.join(dict.fromkeys(e['parsed_rap'] for e in entries if e['parsed_rap'])), 'source_url':entries[0]['url']})
    assert len(gene_rows)==delivery['counts']['unique_genes']
    fields=['msu','symbol','aliases','rap','chromosome','gene_start','gene_end','strand','transcript','promoter_start','promoter_end','unique_sites','sites_gene_body','sites_promoter_2kb','source_url']
    index=gzip.compress(tsv(fields,gene_rows),mtime=0)
    write(args.public/'cloned_genes.tsv.gz',index)
    links=defaultdict(list)
    for row in rows(root/delivery['marker_genes']): links[int(row['site_index'])].append((row['msu'],row['subfeature']))
    marker_fields=['site_index','marker_id','position','ref','alt','gene_ids','features']
    per_chr=defaultdict(list)
    for r in rows(root/delivery['markers']):
        i=int(r['site_index']);bound=links[i]
        per_chr[r['chromosome']].append({'site_index':i,'marker_id':r['marker'],'position':r['position'],'ref':r['ref'],
            'alt':','.join(json.loads(r['alt_frequencies'])),'gene_ids':','.join(g for g,_ in bound),'features':','.join(f for _,f in bound)})
    assert sum(map(len,per_chr.values()))==delivery['counts']['sites']
    chromosome_files={}
    for chromosome,records in per_chr.items():
        path=archive/(chromosome+'.tsv.gz')
        write(path,gzip.compress(tsv(marker_fields,records),mtime=0))
        chromosome_files[chromosome]={'file':path.name,'sha256':sha(path),'count':len(records)}
    shards=json.loads((root/delivery['shard_index']).read_text())
    for item in shards['shards']:
        # The compact browser view references the same immutable bytes on ZT.
        src=root/item['file'];assert src.stat().st_size==item['compressed_bytes'];os.link(src,archive/src.name)
    roster=root/delivery['samples'];os.link(roster,archive/'samples.tsv')
    write(archive/'regions.json',(json.dumps({'schema':'RiceFlux regions 1.0','source_run':root.parent.name,
        'source_sha256':sha(args.delivery),'genetic_evidence':'G_chip','index_sha256':hashlib.sha256(index).hexdigest(),
        'samples':{'file':'samples.tsv','sha256':sha(roster)},'chromosomes':chromosome_files,**{k:shards[k] for k in ('shape','axes','states','shards')}},indent=2)+'\n').encode())
    write(args.public/'cloned_genes_info.json',(json.dumps({'source':'RiceData snapshot 2026-08-12','assembly':'IRGSP-1.0/MSU7','counts':delivery['counts'],
        'compressed_genotype_bytes':delivery['sizes']['gzip'],'version':root.parent.name,'archive_sha256':sha(archive/'regions.json'),
        'study':'https://doi.org/10.1016/j.molp.2025.03.007'},indent=2)+'\n').encode())
    size=sum(path.stat().st_size for path in archive.iterdir())
    print(json.dumps({'browser_archive':str(archive),'total_logical_bytes':size,'genotype_shards':len(shards['shards']),
        'index_bytes':len(index),'genotype_hardlink_bytes':sum(s['compressed_bytes'] for s in shards['shards'])},indent=2))

if __name__=='__main__': main()
