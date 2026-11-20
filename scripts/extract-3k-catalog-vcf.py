"""Extract representative regional variants or all validated regional CoreSNP records."""
import argparse
from collections import Counter
import csv
import gzip
import json
import mmap
from pathlib import Path
from runpy import run_path


def lookup_bytes(values):
    return bytes(sum(values[(byte >> shift) & 3] for shift in (0,2,4,6)) for byte in range(256))


MISSING = lookup_bytes((0,1,0,0))
ALTERNATE = {True:lookup_bytes((0,0,1,2)),False:lookup_bytes((2,0,1,0))}
GENOTYPES = {True:('0/0','./.','0/1','1/1'),False:('1/1','./.','0/1','0/0')}
PRIORITY = {'CDS':0,'promoter':1,'other':2}


def calls(row,source,stride):
    offset=3+row[5]*stride
    return source[offset:offset+stride]


def quality(packed,n,a1_reference):
    whole,tail=divmod(n,4)
    real=packed[:whole]
    missing=sum(real.translate(MISSING))
    alternate=sum(real.translate(ALTERNATE[a1_reference]))
    for slot in range(tail):
        code=(packed[whole] >> (2*slot)) & 3
        missing+=code==1
        alternate+=GENOTYPES[a1_reference][code].count('1')
    return missing,alternate


def extract(args):
    recipe=run_path(str(Path(__file__).with_name('extract-3k-vcf.py')))
    reference=json.loads(args.reference.read_text())
    genes=reference['genes']
    new={g['id'] for g in genes if g['catalog'].get('collection')=='cloned_catalog' and g['model']}
    fasta=recipe['Reference'](args.fasta)
    intervals=recipe['region_index'](genes)
    opener=gzip.open if args.old_variants.suffix=='.gz' else open
    with opener(args.old_variants,'rt') as handle:
        existing={(int(row['chr'].removeprefix('Chr')),int(row['position']),row['ref'],
            'InDel' if len(row['ref'])!=len(row['alt']) else 'SNP'):row for row in csv.DictReader(handle,delimiter='\t')}
    prefixes={'SNP':'core'} if args.all_snps else {'SNP':'core','InDel':'indel'}
    axes={kind:recipe['roster'](args.sources/name) for kind,name in prefixes.items()}
    samples=list(dict.fromkeys(axes['SNP']+axes.get('InDel',[])))
    selected,sources,report=[],{},{}
    for kind,name in prefixes.items():
        data=args.sources/(name+'.bim.gz')
        rows,audit=recipe['normalized_candidates'](data,kind,fasta,intervals)
        ids=axes[kind]
        stride=(len(ids)+3)//4
        with (args.bed/('snp.bed' if kind=='SNP' else 'indel.bed')).open('rb') as handle:
            if handle.read(3)!=b'\x6c\x1b\x01':
                raise ValueError('Invalid variant-major BED for '+kind)
            matrix=mmap.mmap(handle.fileno(),0,access=mmap.ACCESS_READ)
        if len(matrix)!=3+stride*audit['source_markers']:
            raise ValueError('BED axis and size mismatch for '+kind)
        indices={sample:i for i,sample in enumerate(ids)}
        sources[kind]=(matrix,stride,[indices.get(sample) for sample in samples])
        best={}
        for row in rows:
            chr_,pos,ref,alt,_,index,original,a1_ref,gene,feature,known=row
            if not args.all_snps and gene not in new:
                continue
            previous=existing.get((chr_,pos,ref,kind))
            if previous:
                if args.all_snps:
                    if previous['alt']!=alt or previous['source_record_id']!=f'snp_bim_{index+1}':
                        raise ValueError(f'Prior SNP identity differs from CoreSNP at Chr{chr_}:{pos}')
                    if previous['gene_id']!=gene:
                        audit['existing_gene_binding_differs']+=1
                audit['already_registered']+=1
                continue
            missing,alternate=quality(calls(row,matrix,stride),len(ids),a1_ref)
            if alternate==0:
                audit['new_candidates_without_called_alt']+=1
                continue
            audit['new_candidates_with_called_alt']+=1
            if args.all_snps:
                selected.append((row,missing,alternate))
                continue
            rank=(PRIORITY[feature],missing,chr_,pos,ref,alt,index)
            if gene not in best or rank<best[gene][0]:
                best[gene]=(rank,row,missing,alternate)
        selected.extend((row,missing,alternate) for _,row,missing,alternate in best.values())
        if not args.all_snps:
            audit['new_genes_with_representative']=len(best)
        report[kind]=dict(audit)
    selected.sort(key=lambda item:item[0][:4])
    args.out.mkdir()
    with (args.out/'new_regions.vcf').open('x') as vcf,(args.out/'selected_sites.tsv').open('x') as log:
        vcf.write('##fileformat=VCFv4.3\n##reference=IRGSP-1.0/MSU7\n')
        for chromosome,(length,*_) in fasta.index.items():
            vcf.write(f'##contig=<ID=Chr{chromosome},length={length}>\n')
        vcf.write('##INFO=<ID=RF_SOURCE,Number=1,Type=String,Description="RiceFlux source registry ID">\n')
        vcf.write('##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n')
        vcf.write('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t'+'\t'.join(samples)+'\n')
        log.write('source_record_id\tgene_id\tmarker_type\tchr\tposition\tref\talt\tfeature\tmissing_samples\talt_copies\toriginal_position\tA1\tA2\tA1_is_ref\n')
        for row,missing,alternate in selected:
            chromosome,pos,ref,alt,kind,index,original,a1_ref,gene,feature,_=row
            matrix,stride,remap=sources[kind]
            source_id='snp' if kind=='SNP' else 'indel'
            marker=f'{source_id}_bim_{index+1}'
            packed=calls(row,matrix,stride)
            code=GENOTYPES[a1_ref]
            states=(code[(packed[i//4]>>(2*(i%4)))&3] if i is not None else './.' for i in remap)
            vcf.write(f'Chr{chromosome}\t{pos}\t{marker}\t{ref}\t{alt}\t.\t.\tRF_SOURCE={source_id}\tGT\t'+'\t'.join(states)+'\n')
            log.write('\t'.join(map(str,(marker,gene,kind,chromosome,pos,ref,alt,feature,missing,alternate,*original[:3],int(a1_ref))))+'\n')
    report['new_catalogue_genes_with_model']=len(new)
    report['samples']=len(samples)
    report['added_region_markers']=len(selected)
    report['added_genes_with_markers']=len({row[8] for row,_,_ in selected})
    (args.out/'coverage.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ('reference','sources','bed','fasta','old-variants','out'):
        parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--all-snps',action='store_true',
        help='Add every admissible SNP with observed ALT in the full catalog; the existing VCF contributes other marker types.')
    extract(parser.parse_args())
