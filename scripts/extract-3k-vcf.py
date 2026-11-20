"""Extract catalogue regions from authoritative variant-major PLINK and write diploid VCF."""
import argparse
from collections import Counter, defaultdict
import gzip
import json
import mmap
from pathlib import Path
import shutil


class Reference:
    def __init__(self, fasta):
        with fasta.open('rb') as handle:
            self.fasta = mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ)
        self.index = {}
        for line in Path(str(fasta) + '.fai').read_text().splitlines():
            name, length, start, bases, width = line.split()[:5]
            self.index[int(name.removeprefix('Chr'))] = tuple(map(int, (length, start, bases, width)))

    def span(self, chrom, pos, size):
        length, start, bases, width = self.index[chrom]
        first, last = pos - 1, pos + size - 2
        if first < 0 or last >= length:
            return ''
        byte = lambda i: start + (i // bases) * width + i % bases
        return self.fasta[byte(first):byte(last)+1].replace(b'\n', b'').upper().decode()


def minimal_indel(fasta, chrom, pos, ref, alt):
    while ref[-1] == alt[-1]:
        if min(len(ref), len(alt)) == 1:
            if pos == 1:
                break
            pos -= 1
            prefix = fasta.span(chrom, pos, 1)
            if prefix not in {'A', 'C', 'G', 'T'}:
                pos += 1
                break
            ref, alt = prefix + ref, prefix + alt
        ref, alt = ref[:-1], alt[:-1]
    while min(len(ref), len(alt)) > 1 and ref[0] == alt[0]:
        pos, ref, alt = pos + 1, ref[1:], alt[1:]
    return pos, ref, alt


def roster(prefix):
    with gzip.open(f'{prefix}.fam.gz', 'rt') as handle:
        result = [line.split()[1] for line in handle]
    if not result or len(result) != len(set(result)):
        raise ValueError(f'Duplicate or empty FAM axis {prefix}')
    return result


def region_index(genes):
    patterns, tiles = {}, defaultdict(list)
    for gene in genes:
        if not gene['model']:
            continue
        chrom = int(gene['chromosome'].removeprefix('Chr'))
        for tile in range(gene['start'] // 16384, gene['end'] // 16384 + 1):
            tiles[(chrom, tile)].append(gene)
        for marker in gene['variants']:
            kind = 'InDel' if len(marker['ref']) > 1 or any(len(a) > 1 for a in (marker['alt'] or '').split(',')) else 'SNP'
            patterns[(chrom, marker['pos'], marker['ref'], kind)] = gene
    return patterns, tiles


def normalized_candidates(bim, kind, fasta, indexes):
    patterns, tiles = indexes
    accepted, counts = [], Counter()
    with gzip.open(bim, 'rt') as handle:
        for index, line in enumerate(handle):
            chrom, marker, _, pos, a1, a2 = line.split()
            chrom, pos = int(chrom), int(pos)
            counts['source_markers'] += 1
            if not any(g['start'] <= pos <= g['end'] for g in tiles.get((chrom, pos // 16384), ())):
                continue
            counts['target_source_records'] += 1
            if max(len(a1), len(a2)) > 51 or not set(a1 + a2) <= set('ACGT') or a1 == a2:
                counts['unsupported_alleles'] += 1
                continue
            if (kind == 'SNP' and (len(a1), len(a2)) != (1, 1)) or (kind == 'InDel' and len(a1) == len(a2)):
                counts['unsupported_alleles'] += 1
                continue
            matches = [a for a in (a1, a2) if fasta.span(chrom, pos, len(a)) == a]
            if len(matches) != 1:
                counts['ambiguous_ref' if matches else 'ref_mismatch'] += 1
                continue
            ref = matches[0]
            alt = a2 if ref == a1 else a1
            a1_ref = ref == a1
            original = (pos, a1, a2, marker)
            if kind == 'InDel':
                pos, ref, alt = minimal_indel(fasta, chrom, pos, ref, alt)
                if not(ref.startswith(alt) or alt.startswith(ref)):
                    counts['complex_after_normalization'] += 1
                    continue
            if fasta.span(chrom, pos, len(ref)) != ref:
                raise ValueError(f'Normalization produced invalid REF {chrom}:{pos}')
            known = patterns.get((chrom, pos, ref, kind))
            genes = [g for g in tiles.get((chrom, pos // 16384), ()) if g['start'] <= pos <= g['end']]
            if not known and len(genes) != 1:
                counts['ambiguous_or_outside_gene'] += 1
                continue
            gene = known or genes[0]
            feature = 'CDS' if any(f['start'] <= pos <= f['end'] for f in gene['features']) else (
                'promoter' if gene['promoter']['start'] <= pos <= gene['promoter']['end'] else 'other')
            accepted.append((chrom,pos,ref,alt,kind,index,original,a1_ref,gene['id'],feature,bool(known)))
    collisions = Counter((r[0],r[1],r[2],r[4]) for r in accepted)
    unique = [r for r in accepted if collisions[(r[0],r[1],r[2],r[4])] == 1]
    counts['ambiguous_normalized_identity'] = len(accepted)-len(unique)
    counts['accepted_region_records'] = len(unique)
    return unique, counts


def plink_bytes(prefix, expected, path):
    with gzip.open(f'{prefix}.bed.gz', 'rb') as source, path.open('xb') as target:
        shutil.copyfileobj(source, target, 4 * 1024 * 1024)
    with path.open('rb') as handle:
        if path.stat().st_size != expected or handle.read(3) != b'\x6c\x1b\x01':
            raise ValueError(f'BED length or variant-major header mismatch {prefix}')
        return mmap.mmap(handle.fileno(), 0, access=mmap.ACCESS_READ)


def extract(args):
    genes = json.loads(gzip.decompress(args.catalog.read_bytes()))['genes']
    fasta = Reference(args.fasta)
    indexes = region_index(genes)
    names = {'SNP': 'snp', 'InDel': 'indel'}
    prefixes = {'SNP': args.snp, 'InDel': args.indel}
    axes = {kind: roster(prefix) for kind, prefix in prefixes.items()}
    samples = list(dict.fromkeys(axes['SNP'] + axes['InDel']))
    sources, candidates, audit = {}, [], {}
    for kind, prefix in prefixes.items():
        positions = {key: i for i, key in enumerate(axes[kind])}
        remap = [positions.get(id) for id in samples]
        region, counts = normalized_candidates(f'{prefix}.bim.gz', kind, fasta, indexes)
        stride = (len(positions)+3)//4
        source = plink_bytes(prefix, 3+counts['source_markers']*stride, args.out / (names[kind]+'.bed'))
        sources[kind] = source, stride, remap
        audit[kind] = dict(counts, source_samples=len(positions))
        candidates.extend(region)
    candidates.sort(key=lambda row: row[:4])
    by_group = defaultdict(list)
    for row in candidates:
        by_group[(row[8],row[4],row[9])].append(row)
    selected = {r for r in candidates if r[-1]}
    # Cover the CDS and promoter with one additional marker each. Use another
    # regional marker only if a gene has neither class for that variant type.
    for (gene,kind,feature), rows in by_group.items():
        if feature == 'other' and any((gene,kind,key) in by_group for key in ('CDS','promoter')):
            continue
        choices = [r for r in rows if not r[-1]]
        if choices:
            selected.add(choices[len(choices)//2])
    if not selected:
        raise ValueError('No admissible records')

    def write_vcf(handle, records, ids):
        handle.write('##fileformat=VCFv4.3\n##reference=IRGSP-1.0/MSU7\n')
        for chrom, (length,*_) in fasta.index.items():
            handle.write(f'##contig=<ID=Chr{chrom},length={length}>\n')
        handle.write('##INFO=<ID=RF_SOURCE,Number=1,Type=String,Description="RiceFlux source registry ID">\n')
        handle.write('##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">\n')
        handle.write('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t'+'\t'.join(samples)+'\n')
        for row in records:
            chrom,pos,ref,alt,kind,index,original,a1_ref,*_ = row
            source,stride,remap = sources[kind]
            offset = 3 + index * stride
            packed = source[offset:offset+stride]
            codes = ('0/0','./.','0/1','1/1') if a1_ref else ('1/1','./.','0/1','0/0')
            gt = (codes[(packed[i//4] >> (2 * (i%4))) & 3] if i is not None else './.' for i in remap)
            marker = ids[row]
            handle.write(f'Chr{chrom}\t{pos}\t{marker}\t{ref}\t{alt}\t.\t.\tRF_SOURCE={names[kind]}\tGT\t'+'\t'.join(gt)+'\n')

    ids = {r: f'{names[r[4]]}_bim_{r[5]+1}' for r in candidates}
    with (args.out/'region_sites.tsv').open('x') as handle:
        handle.write('source_record_id\tchr\tposition\tref\talt\tkind\toriginal_position\tA1\tA2\tsource_marker\tA1_is_REF\tgene_id\tfeature\tprior_marker\tbrowser_selected\n')
        for r in candidates:
            chrom,pos,ref,alt,kind,index,original,a1_ref,gene,feature,known = r
            handle.write('\t'.join(map(str,(ids[r],chrom,pos,ref,alt,kind,*original,int(a1_ref),gene,feature,int(known),int(r in selected))))+'\n')
    with (args.out/'browser.vcf').open('x') as handle:
        write_vcf(handle, (row for row in candidates if row in selected), ids)
    if args.full_region:
        with gzip.open(args.out/'regional.vcf.gz','xt',compresslevel=3) as handle:
            write_vcf(handle, candidates, ids)
    for kind in names:
        audit[kind]['browser_markers'] = sum(r[4] == kind for r in selected)
    audit['samples'] = {'union':len(samples),'intersection':len(set(axes['SNP']) & set(axes['InDel'])),
        **{name: len(axis) for name,axis in axes.items()}}
    audit['catalogue'] = {'operational_entries':len(genes),'modeled_entries':sum(bool(g['model']) for g in genes),
        'genes_with_regional_markers':len({r[8] for r in candidates}), 'genes_in_browser':len({r[8] for r in selected})}
    (args.out/'extraction.json').write_text(json.dumps(audit,indent=2)+'\n')
    print(json.dumps(audit,indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snp', type=Path, required=True)
    parser.add_argument('--indel', type=Path, required=True)
    parser.add_argument('--fasta', type=Path, required=True)
    parser.add_argument('--catalog', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--full-region', action='store_true')
    opts = parser.parse_args()
    opts.out.mkdir()
    extract(opts)
