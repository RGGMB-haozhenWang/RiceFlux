from pathlib import Path
import sqlite3,json,csv,io,gzip,hashlib,datetime
import argparse
parser=argparse.ArgumentParser(description='Export the frozen RiceNavi source and ontology tables')
parser.add_argument('--database',type=Path,required=True)
args=parser.parse_args()
app=Path(__file__).resolve().parents[1]
db=args.database
assert hashlib.file_digest(db.open('rb'),'sha256').hexdigest()=='cbf0ee47f4063396251e967c53129acd503a55303576842dd168ef27a4b8667b','Frozen source hash mismatch'
c=sqlite3.connect('file:'+str(db.resolve())+'?mode=ro',uri=True); c.row_factory=sqlite3.Row
out=app/'public/sources/ricenavi-20261025';out.mkdir(parents=True,exist_ok=True)
def table(path,rows,fields):
 s=io.StringIO();w=csv.DictWriter(s,fieldnames=fields,delimiter='\t',lineterminator='\n',extrasaction='ignore');w.writeheader();w.writerows(rows);raw=s.getvalue().encode();b=gzip.compress(raw,mtime=0) if path.suffix=='.gz' else raw;p=path.with_suffix(path.suffix+'.partial');p.write_bytes(b);p.replace(path);return {'rows':len(rows),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
loci=[dict(r) for r in c.execute('select * from u_external_loci order by source_row')]
for r in loci:r.pop('payload',None)
materials=[dict(r) for r in c.execute('select * from u_official_material_metadata order by material_id')]
for r in materials:
 p=json.loads(r.pop('payload'));r.update({'amylose_percent':p.get('Amylose Content (%)'),'heading_days':p.get('Heading Date (d)'),'protein_percent':p.get('Protein Content  (%)'),'yield_g_per_plant':p.get('Yield per Plant (g)'),'environment_status':'site_year_method_not_bound'})
calls=[dict(r) for r in c.execute('select * from u_external_calls order by external_id,material_id')]
assert len(loci)==319 and len(materials)==404 and len(calls)==319*404
files={}
for name,rows in [('loci.tsv',loci),('materials.tsv',materials),('calls.tsv.gz',calls)]:files[name]=table(out/name,rows,list(rows[0]))
manifest={'schema':'RiceFlux external source 1.0','name':'RiceNavi frozen catalogue','source':'https://github.com/xhhuanglab/RiceNavi','commit':'3f62be31b91c1cc1d1730dd92d4b2d48d3baa22e','catalog_date':'2026-10-25','assembly_label':'source Pos_7.0; per-event coordinate equivalence not certified','call_quality':'source reported; no per-call QC or raw VCF binding','phase':'not certified; source pipe is not proof of phase','same_material_across_datasets':False,'files':files,'restrictions':'No automatic favorable-state assertion, 6044 merge, or booting-stage cold evidence integration.'};(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
(out/'README.txt').write_text('RiceNavi source snapshot: 319 loci, 404 accessions, 128876 source calls.\nSource https://github.com/xhhuanglab/RiceNavi commit '+manifest['commit']+'\nThe 404 accession metadata come from the frozen official website /qtnmap/samples snapshot (2026-10-25); source_sha256 retained in materials.tsv. The website also had 347 loci; this export uses the internally consistent 319-locus GitHub call matrix.\nRaw calls and source effects preserved. Index alleles, delimiter, and Manta DEL tokens are not upgraded to laboratory genotypes or phased haplotypes. reliable_export=0 reflects unavailable per-call QC, not evidence that a call is wrong. Gene aliases are navigation only. Phenotypes lack bound site/year/method; not pooled with 6044.\n')
ref=json.loads(gzip.decompress((app/'public/datasets/reference.json.gz').read_bytes())); rows=[]
for t in ref['traits']:
 for e in t.get('environments') or [None]:
  row={'trait_id':t['id'],'name':t['name'],'category':t.get('category',''),'family':t.get('family',''),'term_kind':'measured_trait' if e else 'prior_collection','ontology_id':'','mapping_status':'unmapped','method_id':('RF:method:'+t['id']+':'+e['assay']) if e else '', 'method_label':e['assay'] if e else '', 'scale_id':('RF:scale:'+e['unit']) if e else '', 'unit':e['unit'] if e else '', 'growth_stage':'not_recorded','default_direction':'unspecified','ontology_reference':'https://cropontology.org/ontology/CO_320/Rice'}
  if row not in rows:rows.append(row)
table(app/'public/formats/traits.tsv',rows,list(rows[0]))
points=[16.7,13.6,19.4,9.7,12.4,15.3,12.1,12.9,2.8,8.2,12,11.9]
regions=[{'assembly':'IRGSP-1.0','chr':'Chr'+str(i+1),'feature':'centromere_approximate_point','position':round(p*1000000),'start':'','end':'','resolution':'approximate_Mb_not_boundary','source':'https://rice.uga.edu/annotation_pseudo_centromeres.shtml','assembly_basis':'RGAP current pseudomolecules FAQ; approximate legacy clone locations','accessed':'2026-11-16'} for i,p in enumerate(points)]
table(app/'public/formats/genome_regions.tsv',regions,list(regions[0]))
print(json.dumps({'files':files,'traits':len(rows),'genome_regions':len(regions)},indent=2))
