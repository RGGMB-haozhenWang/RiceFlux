import {useText} from './locale.jsx';
import React,{useMemo,useState} from 'react';
import {BreederPriorCheck} from './BreederPriorCheck.jsx';
import {AccessionPicker} from './BreederTasks.jsx';
import {callLabel} from './BreederReview.jsx';
import {fileText,isVcfFile,vcfFileText} from './dataImport.js';
import {downloadTable} from './formats.js';
import {geneSchemes} from './jointHaplotypes.js';
import {checkGenotypeFields,checkPhenotypeFields,inspectMaterialGene,parseMaterialChecks} from './materialCheck.js';
import {siteName} from './regions.js';
import {useGeneCalls} from './useGeneCalls.js';
import {checkPavFields,pavNames,pavState} from './pav.js';
import {sha256Text} from './sha256.js';

const statusNames={called:'有效',missing:'缺测',partial:'部分缺测',unknown:'未登记位点',invalid:'无效调用',excluded:'未纳入'};
const reasons={coordinate:'坐标不受支持',unsupported_alleles:'等位表达不受支持',filtered:'位点过滤未通过',reference_conflict:'REF 与字典冲突',unregistered:'字典未收录',outside_catalog:'关注区域之外',ambiguous_gene:'基因归属待核',no_gt:'缺少 GT'};
const evidenceNames={G_mixed:'混合或未明确',G_chip:'芯片或变异表观测',G_direct:'目标事件直接检测',G_projected:'投影或插补'};

export async function readCheckFiles(files){
  return Promise.all(files.map(async file=>{
    const text=await (isVcfFile(file.name)?vcfFileText(file):fileText(file));
    return {name:file.name,text,sha256:await sha256Text(text)};
  }));
}

export function MaterialCheck({data,axes,models,initialGene,siteSelections,geneControls,fileCheck,setFileCheck,showInput=true,initialSampleId,initialSamples=[]}){
  const localize = useText();
  const [known,setKnown]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [evidence,setEvidence]=useState('G_mixed');
  const [importedId,setImportedId]=useState('');
  const activeImport=fileCheck?.materials?.find(m=>m.sample.id===importedId)??fileCheck;
  const [comparisonIds,setComparisonIds]=useState([]);
  const comparisonSamples=fileCheck?(fileCheck.materials??[fileCheck]).map(m=>m.sample):[...new Map([...initialSamples,...data.individuals.filter(s=>comparisonIds.includes(s.id)),...(known||initialSampleId?[data.individuals.find(s=>s.id===(known||initialSampleId))].filter(Boolean):[])].map(s=>[s.id,s])).values()];
  const markerCatalog=useMemo(()=>data.genes.flatMap(g=>g.variants.map(v=>({...v,gene_id:g.id,gene_name:g.name}))),[data]);
  const geneByMarker=useMemo(()=>new Map(markerCatalog.map(v=>[v.id,v.gene_id])),[markerCatalog]);
  const sample=activeImport?.sample??data.individuals.find(s=>s.id===(known||initialSampleId));
  const ids=useMemo(()=>{
    const primary=models.map(m=>m.gene.id);
    if(fileCheck)return [...new Set([...primary,...(fileCheck.materials??[fileCheck]).flatMap(m=>[...m.calls.keys()]).map(id=>geneByMarker.get(id))])].filter(Boolean);
    return primary.length?primary:[initialGene].filter(Boolean);
  },[models,fileCheck,geneByMarker,initialGene]);
  const status=useGeneCalls(data,ids,Boolean(sample&&!fileCheck&&ids.length));
  const checkModels=useMemo(()=>ids.flatMap(id=>{
    const pinned=models.find(m=>m.gene.id===id);
    if(pinned)return [pinned];
    const gene=data.genes.find(g=>g.id===id);
    if(!gene)return [];
    const menu=geneSchemes(gene,data.evidence,[],siteSelections[id]);
    return [{gene,scheme:menu[0]}];
  }),[ids,models,data,siteSelections]);
  const readings=activeImport?.readings??(sample?axes.filter(a=>a.dataset===sample.dataset_id&&Object.hasOwn(sample.phenotypes,a.id)).map(a=>({
    trait:a.trait_name,value:sample.phenotypes[a.id],unit:a.unit,site:siteName(a.source.original_site??a.source.site),
    year:a.source.year,method:a.assay
  })):[]);
  const genes=sample&&(fileCheck||status.ready)?checkModels.map(({gene,scheme})=>({
    gene,scheme,...inspectMaterialGene(sample,scheme,activeImport?.calls)
  })):[];
  const measured=readings.filter(r=>Number.isFinite(r.value));
  const descriptors=sample?.descriptors||[];
  const submitted=activeImport?.submitted??[];
  const pav=activeImport?.pav??(sample?(data.pav||[]).flatMap(assay=>{
    const status=pavState(assay,sample);
    if(status==='unassayed'||models.length&&!ids.includes(assay.geneId))return [];
    return [{gene_id:assay.geneId,gene:assay.geneId?data.genes.find(g=>g.id===assay.geneId)?.name:assay.sourceGene,source_gene_id:assay.sourceGene,status,
      method:assay.source.method,source:assay.source.citation,doi:assay.source.doi,dataset_version:assay.version}];
  }):[]);
  async function read(event){
    const files=[...event.target.files];
    event.target.value='';
    if(!files.length)return;
    setBusy(true);setError('');
    try{
      if(files.length>3)throw Error('可各选一份分型、表型和 PAV。');
      const inputs=await readCheckFiles(files);
      const next=parseMaterialChecks(inputs.map(f=>f.text),markerCatalog,evidence,data.genes);
      setFileCheck({...next,inputs});setKnown('');
    }catch(e){setError(e.message);}finally{setBusy(false);}
  }
  function templates(kind){
    const fields=kind==='genotype'?checkGenotypeFields:kind==='pav'?checkPavFields:checkPhenotypeFields;
    downloadTable({filename:'riceflux_check_'+kind+'.txt',columns:fields},[]);
  }
  function exportCheck(){
    const fields=['section','sample_id','dataset_id','dataset_version','genotype_evidence','gene_id','gene','marker_id','marker_type','source_record_id','chr','position','ref','alt','input_genotype','status','ordered_calls','expected_sites','covered_sites','complete_sites','positions_to_check','source_gene_id','trait','value','unit','site','year','method','source','note','doi','file','sha256_text'];
    const rows=[
      ...readings.map(r=>({...r,section:'phenotype',status:r.value===null?'missing':'measured'})),
      ...genes.map(r=>({section:'gene',gene_id:r.gene.id,gene:r.gene.name,status:r.call.status,ordered_calls:r.call.bases,
        expected_sites:r.expected,covered_sites:r.covered,complete_sites:r.complete,positions_to_check:r.gaps.join(','),
        note:r.call.label,doi:r.scheme.doi.join(',')})),
      ...submitted.map(r=>({...r,section:'submitted_marker',input_genotype:r.genotype})),
      ...pav.map(r=>({...r,section:'pav'})),
      ...descriptors.map(r=>({...r,section:'descriptor',trait:r.descriptor,value:r.value_code,note:r.value_label,year:r.crop_year,method:r.dictionary_id,doi:r.source?.doi,source:r.source?.citation})),
      ...(fileCheck?.inputs||[]).map(f=>({section:'input',file:f.name,sha256_text:f.sha256})),
    ].map(r=>({dataset_version:data.meta.datasets?.find(d=>d.id===sample.dataset_id)?.version,...r,sample_id:sample.source_sample_id??sample.id,dataset_id:fileCheck?'local_check':sample.dataset_id,
      genotype_evidence:r.section==='pav'?'':sample.genotype_evidence}));
    downloadTable({filename:'riceflux_material_check.txt',columns:fields},rows);
  }
  return <div className="task-content">
    <section className="breeder-card" aria-label={localize("选择多份体检材料")}>
      <h2>{localize("选择材料比较文献优势状态")}</h2>
      <AccessionPicker label={localize("添加比较材料")} samples={data.individuals} onPick={s=>{setComparisonIds(ids=>[...new Set([...ids,s.id])]);setFileCheck(null);}}/>
      <p>{localize(comparisonSamples.length)}{" "+localize("份材料已加入比较。可在顶部清空查询重新选择。")}</p>
      <div className="breeder-pins">{comparisonSamples.map(s=><span className="breeder-pin" key={s.id}>{localize(s.name)} · {localize(s.dataset_id)}{comparisonIds.includes(s.id)&&<button type="button" aria-label={localize('移除比较 '+s.name)} onClick={()=>setComparisonIds(ids=>ids.filter(id=>id!==s.id))}>×</button>}</span>)}</div>
    </section>
    {comparisonSamples.length>0&&<BreederPriorCheck data={data} axes={axes} samples={comparisonSamples} models={models} localReadings={fileCheck?(s=>(fileCheck.materials??[fileCheck]).find(m=>m.sample.id===s.id)?.readings):null} localCalls={fileCheck?(s=>(fileCheck.materials??[fileCheck]).find(m=>m.sample.id===s.id)?.calls):null}/>}

    {showInput&&<section className="breeder-card" aria-label={localize("导入体检材料")}>
      <div className="task-form">
        <label>{localize("检测来源")}<select aria-label={localize("体检分型来源")} value={evidence} disabled={busy} onChange={e=>setEvidence(e.target.value)}>
          {Object.entries(evidenceNames).map(([id,name])=><option key={id} value={id}>{localize(name)}</option>)}
        </select></label>
        <label className="task-upload">{localize("导入体检文件")}<input type="file" aria-label={localize("导入体检文件")} multiple accept=".txt,.tsv,.vcf,.gz,.bgz" onChange={read} disabled={busy}/></label>
        <button className="review-link" type="button" onClick={()=>templates('genotype')}>{localize("分型模板")}</button>
        <button className="review-link" type="button" onClick={()=>templates('phenotype')}>{localize("表型模板")}</button>
        <button className="review-link" type="button" onClick={()=>templates('pav')}>{localize("PAV 模板")}</button>
        <button className="review-link" type="button" onClick={()=>downloadTable({filename:'riceflux_marker_dictionary.txt',
          columns:['marker_id','gene_id','gene_name','chr','position','ref','alt']},markerCatalog.map(v=>({...v,marker_id:v.id,chr:v.chromosome,position:v.pos})))}>{localize("位点字典")}</button>
      </div>
      <p className="breeder-note">{localize("TXT 可包含多份材料，使用 sample_id 配对分型、表型和 PAV；VCF 每次仅支持一份材料。VCF 中长度变化达到 50 bp 的锚定 InDel 归入片段 PAV。")}</p>
      {error&&<p role="alert">{localize(error)}</p>}
      {busy&&<p role="status">{localize("正在校验材料编号和位点。")}</p>}
      <details className="review-disclosure"><summary>{localize("查询已入库材料")}</summary>
        <AccessionPicker label={localize("已入库材料")} samples={data.individuals} selected={!fileCheck?sample:null} onPick={s=>{setKnown(s.id);setFileCheck(null);setError('');}}/>
      </details>
    </section>}
    {fileCheck?.materials?.length>1&&<label>{localize("查看导入材料详情")}<select aria-label={localize("导入材料详情")} value={sample.id} onChange={e=>setImportedId(e.target.value)}>{fileCheck.materials.map(m=><option key={m.sample.id} value={m.sample.id}>{localize(m.sample.name)}</option>)}</select></label>}
    {sample&&<section className="breeder-card" aria-label={localize("材料体检结果")}>
      <div className="task-heading"><h2>{localize(sample.name)}</h2>
        <span>{localize(sample.source_sample_id??sample.id)} · {fileCheck?localize("本次导入"):sample.dataset_name??sample.dataset_id}</span>
        <button type="button" className="review-link review-to-end" onClick={exportCheck}
          disabled={!fileCheck&&!status.ready}>{localize("下载体检 TXT")}</button>
      </div>
      <p className="breeder-counts">
        <span><b>{localize(measured.length)}</b>{" "+localize("条定量实测")}</span>
        {descriptors.length>0&&<span><b>{localize(descriptors.length)}</b>{" "+localize("条分类表型")}</span>}
        {fileCheck&&submitted.length>0&&<span><b>{localize(submitted.filter(r=>r.status==='called').length)}</b> / {localize(submitted.length)}{" "+localize("个提交位点调用完整")}</span>}
        {pav.length>0&&<span><b>{localize(pav.filter(r=>r.status!=='unknown').length)}</b> / {localize(pav.length)}{" "+localize("条 PAV 已判定")}</span>}
        {sample.genotype_evidence!=='G_none'&&<span>{localize("来源")+" "}{localize(evidenceNames[sample.genotype_evidence]??sample.genotype_evidence)}</span>}
      </p>
      {!showInput&&fileCheck&&submitted.length>0&&<label className="entry-evidence-label">{localize("检测来源")}<select aria-label={localize("体检分型来源")} value={sample.genotype_evidence} onChange={e=>setFileCheck({
          ...fileCheck,sample:{...fileCheck.sample,genotype_evidence:e.target.value},...(fileCheck.materials?{materials:fileCheck.materials.map(m=>({...m,sample:{...m.sample,genotype_evidence:e.target.value}}))}:{})})}>
          {Object.entries(evidenceNames).map(([id,name])=><option key={id} value={id}>{localize(name)}</option>)}
        </select>
      </label>}
      {localize(geneControls)}
      {!fileCheck&&!status.ready&&<p role={status.error?'alert':'status'}>{status.error?<>{localize(status.error)} <button type="button" onClick={status.retry}>{localize("重试")}</button></>:'正在读取分型…'}</p>}
      {genes.length>0&&<div className="matrix-scroll"><table className="individual-table" aria-label={localize("基因体检")}>
        <thead><tr><th>{localize("基因")}</th><th>{localize("完整 / 覆盖 / 定义位点")}</th><th>{localize("判型")}</th><th>{localize("需补查的位置")}</th></tr></thead>
        <tbody>{genes.map(r=><tr key={r.gene.id}><th scope="row">{localize(r.gene.name)}<small>{r.scheme.kind==='literature'?localize("文献型"):localize("标记型")}</small></th>
          <td>{localize(r.complete)} / {localize(r.covered)} / {localize(r.expected)}</td><td>{localize(callLabel(r.call))}</td><td>{localize(r.gaps.join('、')||'—')}</td>
        </tr>)}</tbody>
      </table></div>}
      {!genes.length&&(!ids.length||status.ready||fileCheck)&&<p className="breeder-note">{localize("可添加关注基因，检查其定义位点是否覆盖。")}</p>}
      {fileCheck&&submitted.length>0&&<details className="review-disclosure"><summary>{localize("查看提交位点及问题")}</summary>
        <div className="matrix-scroll"><table className="individual-table" aria-label={localize("提交位点")}>
          <thead><tr><th>{localize("位点")}</th><th>{localize("输入")}</th><th>{localize("核对状态")}</th></tr></thead><tbody>{submitted.slice(0,100).map(r=><tr key={r.marker_id}>
            <th scope="row">{localize(r.marker_type&&r.marker_type+' · ')}{localize(r.marker_id)}</th><td>{localize(r.genotype||'—')}</td><td>{localize(statusNames[r.status])}{r.note&&<small>{localize(reasons[r.note]||r.note)}</small>}</td>
          </tr>)}</tbody>
        </table></div>{submitted.length>100&&<p>{localize("显示前 100 条，体检 TXT 含全部记录。")}</p>}</details>}
      {pav.length>0&&<details className="review-disclosure"><summary>{localize("存在 / 缺失记录（PAV）")}</summary>
        <div className="matrix-scroll"><table className="individual-table" aria-label={localize("体检 PAV 记录")}>
          <thead><tr><th>{localize("基因 / 原始编号")}</th><th>{localize("状态")}</th><th>{localize("方法与来源")}</th></tr></thead><tbody>{pav.map((r,i)=><tr key={i}>
            <th scope="row">{localize(r.gene)}<small>{localize(r.source_gene_id)}</small></th><td>{localize(pavNames[r.status])}</td>
            <td>{localize(r.method)}<small>{r.doi?<a href={'https://doi.org/'+r.doi} target="_blank" rel="noreferrer">{localize("原文 DOI")}</a>:r.source}</small></td>
          </tr>)}</tbody>
        </table></div></details>}
      {descriptors.length>0&&<details className="review-disclosure"><summary>{localize("种质表型描述（分类）")}</summary>
        <div className="matrix-scroll"><table className="individual-table" aria-label={localize("体检分类表型")}>
          <thead><tr><th>{localize("指标")}</th><th>{localize("原始代码 / 定义")}</th><th>{localize("季节与数据字典")}</th></tr></thead><tbody>{descriptors.map((r,i)=><tr key={i}>
            <th scope="row">{localize(r.descriptor)}<small>{localize(r.descriptor_id)}</small></th><td>{localize(r.value_code)}{r.value_label&&<small>{localize(r.value_label)}</small>}</td>
            <td>{localize([r.site,r.crop_year,r.dictionary_id].filter(Boolean).join(' · '))}</td>
          </tr>)}</tbody>
        </table></div></details>}
      <details className="review-disclosure"><summary>{localize("实测表型与缺测记录")}</summary>
        {!readings.length?<p className="breeder-note">{localize("没有提交或接入表型记录。")}</p>:<div className="matrix-scroll"><table className="individual-table" aria-label={localize("体检表型记录")}>
          <thead><tr><th>{localize("性状")}</th><th>{localize("原值")}</th><th>{localize("地点、年份与方法")}</th></tr></thead><tbody>{readings.map((r,index)=><tr key={index}>
            <th scope="row">{localize(r.trait)}</th><td>{r.value===null?localize("缺测"):r.value+' '+r.unit}</td><td>{localize([r.site,r.year,r.method].join(' · '))}</td>
          </tr>)}</tbody>
        </table></div>}</details>
    </section>}
  </div>;
}
