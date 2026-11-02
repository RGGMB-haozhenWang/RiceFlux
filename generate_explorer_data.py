"""Deterministic synthetic SNP/phenotype fixture; no public or private biological data."""
import json
import random
from pathlib import Path

rng = random.Random(20261030)
traits = [dict(id='heading',name='抽穗期',unit='天'),dict(id='grain',name='粒长',unit='mm'),dict(id='quality',name='整精米率',unit='%'),dict(id='restoration',name='恢复率',unit='%')]
populations = [dict(id='P1',name='籼稻群体 A',color='#478b78'),dict(id='P2',name='籼稻群体 B',color='#78a5c8'),dict(id='P3',name='粳稻群体',color='#b39ac4'),dict(id='P4',name='混合育种群体',color='#d6ac70')]
genes=[]
for i,(name,trait,desc) in enumerate([('SIM_HD01','heading','抽穗期关联演示'),('SIM_HD02','heading','花期调节演示'),('SIM_GS01','grain','粒形关联演示'),('SIM_Q01','quality','碾米品质演示'),('SIM_RF01','restoration','恢复性关联演示')]):
    start=10000+i*20000
    variants=[dict(id=f'{name}:v{j+1}',pos=start+offset,ref=ref,alt=alt,feature=feature) for j,(offset,ref,alt,feature) in enumerate([(300,'A','G','promoter'),(1450,'C','T','CDS'),(1920,'G','A','intron'),(2860,'T','C','CDS'),(3390,'A','C','intron'),(4300,'G','T','CDS')])]
    if i%2:
        variants[0]['pos']=start+4700
        variants.sort(key=lambda v:v['pos'])
    genes.append(dict(id=name,name=name,trait_ids=[trait],description=desc,chromosome=f'SIM_Chr{i+1}',assembly='SIM-RICE-v1',start=start,end=start+5000,strand='+' if i%2==0 else '-',gene_start=start+1100,gene_end=start+4600,features=[dict(start=start+1100,end=start+1650,type='CDS'),dict(start=start+2550,end=start+3100,type='CDS'),dict(start=start+4050,end=start+4600,type='CDS')],variants=variants))
individuals=[]
patterns=[[0,0,0,0,0,0],[1,1,0,0,1,0],[1,0,1,1,0,1],[0,1,1,0,1,1]]
for p,pop in enumerate(populations):
    for j in range(24):
        genotypes={}
        phenotypes={t['id']:round(base+rng.gauss(0,sd),2) if rng.random()>.06 else None for t,base,sd in zip(traits,[88,8.2,65,86],[8,.5,5,7])}
        for trait in ('quality','restoration'):
            if phenotypes[trait] is not None:phenotypes[trait]=min(100,max(0,phenotypes[trait]))
        for g in genes:
            pattern=patterns[rng.choices(range(4),weights=[[6,2,1,1],[1,6,2,1],[1,1,6,2],[2,2,2,4]][p])[0]]
            for k,v in enumerate(g['variants']):
                gt=[pattern[k],pattern[k]]
                u=rng.random()
                if u<.04: gt=[None,None]
                elif u<.06: gt=[gt[0],None]
                elif u<.15: gt=[0,1]
                genotypes[v['id']]=gt
        individuals.append(dict(id=f'SIM{p*24+j+1:03}',name=f'虚拟材料 {p*24+j+1:03}',population_id=pop['id'],ploidy=2,genotypes=genotypes,phenotypes=phenotypes))
data=dict(meta=dict(id='flux-explorer-synthetic-20261030-v1',synthetic=True,seed=20261030,assembly='SIM-RICE-v1',mode='genotype',note='所有材料、群体、基因、坐标、基因型与表型均为虚构；未使用1001 Genomes或AtFLM实测数据。基因-性状连接为演示配置，表型独立生成，不代表关联或因果证据。'),traits=traits,populations=populations,genes=genes,individuals=individuals)
if __name__=='__main__':
    path=Path(__file__).resolve().parent/'data/explorer_demo.json'
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(f'{len(individuals)} synthetic individuals, {len(genes)} genes, {sum(len(g["variants"]) for g in genes)} SNPs -> {path}')
