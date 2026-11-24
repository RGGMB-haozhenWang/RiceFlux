import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalDataset,extendDataset,importDatasetFiles,importVcfInput,resolveSampleList} from './dataImport.js';
import {combineDatasets} from './datasets.js';
import {semanticManifest} from './inputSchema.js';
import {sha256Text} from './sha256.js';
import {alleleStats,gtToken,validateDataset} from './model.js';
import {callOf} from './catalog.js';
import {dosage} from './analysis.js';

const reference={meta:{},traits:[{id:'all_prior'}],genes:[{id:'G',chromosome:'Chr1',model:'G.1',start:5,end:16,
  features:[],promoter:{start:5,end:7},variants:[],trait_ids:['all_prior'],catalog:{msu:'G'}}]};
const samples='sample_id\tname\tsource_group\tsubspecies\tregion\tmaterial_type\n007\tA\tSC\tindica\tNA\tdemo\n008\tB\tSC\tindica\tNA\tdemo\n009\tC\tNE\tjaponica\tNA\tdemo\n';
const variants=alt=>'marker_id\tgene_id\tchr\tposition\tref\talt\nChr01:10\tG\tChr1\t10\tA\t'+alt+'\n';
const gt=(a,b,c)=>'sample_id\tChr01:10\n007\t'+a+'\n008\t'+b+'\n009\t'+c+'\n';
const pheno={environments:'environment_id\ttrait_id\ttrait_name\tunit\tcategory\tfamily\tassay\tsite\tyear\ne\tt1\tNew trait\tmm\tTest\tlength\tmetric\tSite\t2026\n',
  phenotypes:'sample_id\te\n007\t1.5\n009\t3\n'};
const meta=(id,genotype_evidence='G_chip')=>({id,name:id,version:'1',source:'Validated fixture',genotype_evidence});

test('previous variants/genotypes TXT remaps mixed long SNP calls into a fragment PAV axis',()=>{
  const long='A'+'C'.repeat(50);
  const source=createLocalDataset({samples,variants:variants(long+',G'),genotypes:gt('2/2','1/1','0/1')},meta('p'),reference);
  assert.equal(source.variants[0].alt,'G');
  assert.equal(source.pav[0].states,' .1.'.trim());
  assert.equal(source.pav[0].event.lengthChange,50);
  assert.equal(source.texts.genotypes,'sample_id\tChr01:10\n007\t1/1\n008\t./.\n009\t0/.\n');
  assert.equal(source.pav[0].source.role,'pav');
});

test('PAV-only VCF supports sample reordering and adding to an existing phenotype dataset',async()=>{
  const long='A'+'C'.repeat(51);
  const vcf='##fileformat=VCFv4.2\n##reference=IRGSP-1.0\n#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t008\t007\t009\n'+
    'Chr1\t10\tlarge\tA\t'+long+'\t.\tPASS\t.\tGT\t1/1\t0/0\t./.\n';
  const {patch,provenance}=await importVcfInput(vcf,{samples},meta('p'),reference,'input.vcf');
  assert.equal(patch.genotypes,'sample_id\n007\n008\n009\n');
  const source=createLocalDataset(patch,{...meta('p'),provenance},reference);
  assert.equal(source.variants.length,0);
  assert.equal(source.pav[0].states,'01.');
  const existing=createLocalDataset({samples,...pheno},meta('p'),reference);
  const next=extendDataset(existing,'genotypes',patch,{...meta('p'),version:'2',provenance},reference);
  assert.equal(next.pav[0].event.kind,'INS');
  assert.equal(next.pav[0].states,'01.');
});

test('multiallelic genotype indices follow each input ALT order and merge by nucleotide',()=>{
  const a=createLocalDataset({samples,variants:variants('G,C'),genotypes:gt('1/2','2/.','0/1')},meta('a'),reference);
  const b=createLocalDataset({samples,variants:variants('C,T'),genotypes:gt('1/2','T/T','./.')},meta('b'),reference);
  const d=validateDataset(combineDatasets(reference,[a,b],'dataset_group'));
  const mark=d.genes[0].variants[0],labels=d.individuals.map(s=>gtToken(callOf(s,mark),mark));
  assert.equal(mark.alt,'C,G,T');
  assert.deepEqual(labels,['C/G','C/·','A/G','C/T','T/T','·/·']);
  const s=alleleStats(d.individuals,mark);
  assert.deepEqual(s.alleleCounts.map(a=>a.count),[1,3,2,3]);
  assert.equal(s.maf,3/9);assert.equal(s.missing,3/12);assert.equal(s.af,8/9);
  assert.equal(dosage(d.individuals[3],mark,3),1);
  assert.equal(new Set(d.populations.map(g=>g.color)).size,4);
  assert.throws(()=>createLocalDataset({samples,variants:variants('G,C'),genotypes:gt('0/3','0/0','0/0')},meta('bad'),reference),/007.*编号/);
  assert.throws(()=>createLocalDataset({samples,variants:variants('G,G'),genotypes:gt('0/1','0/0','0/0')},meta('bad'),reference),/不重复/);
});

test('phenotypes and genotypes can be introduced independently with unchanged accession IDs and explicit sources',()=>{
  const phenotypeOnly=createLocalDataset({samples,...pheno},meta('r'),reference);
  assert.equal(phenotypeOnly.variants.length,0);
  const withGT=extendDataset(phenotypeOnly,'genotypes',{variants:variants('G'),genotypes:gt('0/1','0/0','./.')},{...meta('r','G_direct'),version:'2'},reference);
  assert.deepEqual(withGT.samples.map(s=>s.sample_id),['007','008','009']);
  assert.equal(withGT.manifest.genotype_evidence,'G_direct');
  const genotypeOnly=createLocalDataset({samples,variants:variants('G'),genotypes:gt('0/1','0/0','./.')},meta('r'),reference);
  const withPhen=extendDataset(genotypeOnly,'phenotypes',pheno,{...meta('r'),source:'Trial notebook',version:'2'},reference);
  assert.equal(withPhen.texts.genotypes,genotypeOnly.texts.genotypes);
  assert.equal(withPhen.environments[0].source_note,'Trial notebook');
  const data=combineDatasets(reference,[withPhen]);assert.deepEqual(data.individuals.map(s=>s.phenotypes.e),[1.5,null,3]);
  assert.throws(()=>extendDataset(genotypeOnly,'phenotypes',{...pheno,phenotypes:pheno.phenotypes+'lost\t1\n'},meta('r'),reference),/未知/);
  assert.throws(()=>extendDataset(withPhen,'phenotypes',pheno,meta('r'),reference),/重复/);
});

test('files with leading-zero IDs are exact; ambiguous and unmatched rows are never included',()=>{
  const accessions=[{id:'D1-007',dataset_id:'D1',source_sample_id:'007'}, {id:'D2-007',dataset_id:'D2',source_sample_id:'007'}];
  const result=resolveSampleList('sample_id\tdataset_id\n007\tD2\n007\t\n7\tD1\n007\tD2\n',accessions);
  assert.deepEqual(result.map(r=>r.status),['matched','ambiguous','unknown']);
  assert.equal(result[0].sample.id,'D2-007');
  assert.equal(resolveSampleList('007\n',accessions,'D1')[0].sample.id,'D1-007');
});

const upload=(name,text)=>new File([text],name);
test('legacy and ontology manifests validate identical TXT axes and hashes',async()=>{
  const source=createLocalDataset({samples,variants:variants('AG,ACT'),genotypes:gt('1/2','./.','0/0'),...pheno},meta('release'),reference);
  const entries=Object.entries(source.texts);
  const manifest={...source.manifest,files:Object.fromEntries(entries.map(([key])=>[key,key+'.txt'])),
    sha256:Object.fromEntries(await Promise.all(entries.map(async([key,txt])=>[key,await sha256Text(txt)])))};
  const tables=entries.map(([key,txt])=>upload(key+'.txt',txt));
  const opts={mode:'package',registry:[],reference};
  const semantic=semanticManifest(manifest);
  for(const [name,value] of [['manifest.json',manifest],['manifest.jsonld',semantic]]){
    const {bundle}=await importDatasetFiles([upload(name,JSON.stringify(value)),...tables],opts);
    assert.deepEqual(bundle.manifest,manifest);
    assert.deepEqual(bundle.samples.map(s=>s.sample_id),['007','008','009']);
    assert.equal(bundle.variants[0].markerType,'InDel');
    assert.deepEqual(bundle.variants[0].alleles,['A','AG','ACT']);
    assert.equal(bundle.phenotypes.get('007').e,1.5);
  }
  const windowsTables=entries.map(([key,txt])=>upload(key+'.txt',txt.replaceAll('\n','\r\n')));
  const windows=await importDatasetFiles([upload('manifest.json',JSON.stringify(manifest)),...windowsTables],opts);
  assert.deepEqual(windows.bundle.texts,source.texts);
  await assert.rejects(importDatasetFiles([upload('manifest.json',JSON.stringify(manifest)),
    ...windowsTables.filter(f=>f.name!=='samples.txt'),
    upload('samples.txt',samples.replace('007','7').replaceAll('\n','\r\n'))],opts),/数据哈希不匹配.*samples/);
  await assert.rejects(importDatasetFiles([upload('manifest.jsonld',JSON.stringify({...semantic,'@type':'v1:GeneRecord'})),...tables],opts),/DatasetVersion/);
  await assert.rejects(importDatasetFiles([upload('manifest.jsonld',JSON.stringify(semantic)),...tables.filter(f=>f.name!=='samples.txt'),
    upload('samples.txt',samples.replace('007','7'))],opts),/数据哈希不匹配.*samples/);
});

test('the shared VCF profile preserves allele order, source IDs and unobserved sites',async()=>{
  const vcf=['##fileformat=VCFv4.3','##reference=IRGSP-1.0','#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\t007\t008\t009',
    'Chr1\t10\tinsertion\tA\tAG,ACT\t.\tPASS\t.\tGT\t1/2\t./.\t0/0',
    'Chr1\t13\tsnp\tC\tT\t.\tPASS\t.\tGT\t0/1\t0/0\t0/0'].join('\n');
  const opts={mode:'new',registry:[],metadata:meta('upload'),reference};
  const file=upload('region.vcf',vcf);
  const {bundle}=await importDatasetFiles([file],opts);
  const view=combineDatasets(reference,[bundle]);
  assert.deepEqual(bundle.samples.map(s=>s.sample_id),['007','008','009']);
  assert.deepEqual(bundle.variants.map(v=>[v.pos,v.markerType,v.source_record_id]),[[10,'InDel','insertion'],[13,'SNP','snp']]);
  const [indel]=view.genes[0].variants;
  assert.deepEqual(view.individuals.map(s=>callOf(s,indel)),[[1,2],[null,null],[0,0]]);
  assert.equal(bundle.manifest.provenance.sources[0].files[0].sha256,await sha256Text(vcf));
  await assert.rejects(importDatasetFiles([file,upload('variants.txt',variants('AG'))],opts),/一份区域 VCF/);
  const target={variants:[],sourceBundle(){assert.fail('invalid upload must not materialize packed inputs');}};
  await assert.rejects(importDatasetFiles([upload('environments.txt',pheno.environments)],{...opts,mode:'phenotypes',target}),/成对/);
});
