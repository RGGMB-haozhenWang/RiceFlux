import React,{useEffect,useMemo,useState} from 'react';
import {readTable} from './datasets.js';
import {readText} from './observed.js';
import {openRegionArchive,readRegionGene} from './regionArchive.js';
import {alleleStats,gtToken,percent} from './model.js';
import {callOf} from './catalog.js';
import {writeTSV,saveFile} from './formats.js';
import {zipTables} from './exports.js';

const path='regions/';
export function RegionArchive(){
  const [catalog,setCatalog]=useState(null),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[group,setGroup]=useState('all');
  const [archive,setArchive]=useState(null),[loaded,setLoaded]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    const c=new AbortController(),base=import.meta.env.BASE_URL+path;
    Promise.all([readText(base+'cloned_genes_info.json',c.signal),readText(base+'cloned_genes.tsv.gz',c.signal)]).then(([info,text])=>{
      setCatalog({info:JSON.parse(info),genes:readTable(text,['msu','symbol'],'cloned gene index').objects()});
    }).catch(err=>{if(err.name!=='AbortError')setError(err.message);});
    return()=>c.abort();
  },[]);
  const hits=(catalog?.genes||[]).filter(g=>[g.symbol,g.aliases,g.rap,g.msu].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
  const gene=hits.find(g=>g.msu===selected)||hits[0];
  useEffect(()=>{
    if(!archive||!gene)return;
    let active=true;setBusy(true);setError('');setLoaded(null);
    readRegionGene(archive,gene).then(variants=>{if(active)setLoaded({id:gene.msu,variants});})
      .catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[archive,gene]);
  const available=archive?.samples||[];
  const cohort=useMemo(()=>available.map((s,ordinal)=>({...s,id:s.sample_id,ordinal,ploidy:2})).filter(s=>group==='all'||s.source_group===group),[archive,group]);
  const variants=loaded?.id===gene?.msu?loaded?.variants||[]:[];
  const stats=useMemo(()=>variants.map(v=>alleleStats(cohort,v)),[variants,cohort]);

  async function chooseDirectory(event){
    const files=[...event.target.files];event.target.value='';if(!files.length)return;
    setBusy(true);setError('');setLoaded(null);
    try{setArchive(await openRegionArchive(files,catalog.info));}
    catch(err){setArchive(null);setError(err.message);setBusy(false);}
  }
  function download(){
    const markers=variants.map((v,i)=>({marker_id:v.id,gene_id:gene.msu,chr:v.chromosome,position:v.pos,ref:v.ref,alt:v.alt,feature:v.feature,...stats[i],allele_frequencies:JSON.stringify(stats[i].alleleCounts)}));
    const genotype=cohort.map(s=>Object.fromEntries([['sample_id',s.id],...variants.map(v=>[v.id,gtToken(callOf(s,v),v).replaceAll('·','.')])]));
    saveFile('riceflux_'+gene.msu+'_region.zip',zipTables({
      'README.txt':`RiceFlux region selection\nData: 6044 / G_chip / IRGSP-1.0/MSU7.\nRun: ${catalog.info.version}\nScope: ${group}\nSource: ${catalog.info.study}\nMissing is counted over expected alleles. MAF is the second-largest called allele frequency.\n`,
      'variants.tsv':writeTSV(['marker_id','gene_id','chr','position','ref','alt','feature','called','total','maf','missing','allele_frequencies'],markers),
      'genotypes.tsv':writeTSV(['sample_id',...variants.map(v=>v.id)],genotype),
      'samples.tsv':writeTSV(['sample_id','name','source_group','subspecies','region','material_type'],cohort),
    }),'application/zip');
  }
  return <div className="region-archive">
    {error&&<p role="alert">{error}</p>}
    {catalog&&<><p>{catalog.info.counts.unique_genes.toLocaleString()} 个已定位基因 · {catalog.info.counts.sites.toLocaleString()} 个 D1 区段 SNP · IRGSP-1.0/MSU7</p>
      <div className="compare-tools"><input type="search" aria-label="查找 RiceData 区段" placeholder="基因名 / MSU / RAP ID" value={query} onChange={e=>{setQuery(e.target.value);setSelected('');}}/>
        <select aria-label="RiceData 区段基因" value={gene?.msu||''} onChange={e=>setSelected(e.target.value)}>{hits.slice(0,60).map(g=><option key={g.msu} value={g.msu}>{g.symbol} · {g.msu}</option>)}</select>
        <label className="file-button">打开本地分型目录<input type="file" aria-label="RiceData 分型目录" webkitdirectory="" onChange={chooseDirectory}/></label>
        <a href={'./'+path+'cloned_genes.tsv.gz'} download>目录 TSV.gz</a></div>
      <p className="footnote">{hits.length.toLocaleString()} 个匹配项，列表前 60 条。选择含 regions.json 的目录后，只读取当前基因所需分片。</p>
      {gene&&<p><strong>{gene.symbol} · {gene.msu}</strong> · {gene.chromosome}:{gene.gene_start}–{gene.gene_end} · {gene.unique_sites} SNP · <a href={gene.source_url} target="_blank" rel="noreferrer">RiceData</a></p>}
      {busy&&<p role="status">读取并校验当前区段…</p>}
      {archive&&loaded&&<div className="compare-tools"><label>分组 / Population <select aria-label="区段来源组" value={group} onChange={e=>setGroup(e.target.value)}><option value="all">D1 全部</option>{[...new Set(archive.samples.map(s=>s.source_group))].map(g=><option key={g}>{g}</option>)}</select></label><span>{cohort.length.toLocaleString()} 份材料</span><button disabled={!variants.length} onClick={download}>下载该基因完整分型</button></div>}
      {variants.length>0&&<><div className="matrix-scroll archive-markers"><table className="individual-table"><thead><tr>{['Marker','REF → ALT','区域','ALT AF','Missing','MAF'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{variants.map((v,i)=><tr key={v.id}><td>{v.id}</td><td>{v.ref} → {v.alt}</td><td>{v.feature}</td><td>{stats[i].alleleCounts.slice(1).map(a=>`${a.allele} ${percent(a.frequency)}`).join(' · ')}</td><td>{percent(stats[i].missing)}</td><td>{percent(stats[i].maf)}</td></tr>)}</tbody></table></div></>}
      {archive&&loaded&&!variants.length&&gene&&Number(gene.unique_sites)===0&&<p>源 MAP 在该区段无标记记录。</p>}
    </>}
  </div>;
}
