import React,{useMemo,useRef,useState} from 'react';
import {isCross} from './breeder.js';
import {planExamples,planScenario,queryTraits} from './breederPlan.js';
import {downloadTable,matchesMaterial} from './formats.js';
import {geneScore} from './geneSearch.js';
import {checkGenotypeFields,checkPhenotypeFields} from './materialCheck.js';
import {checkPavFields} from './pav.js';

const code=s=>String(s??'').trim().toLowerCase();

function findEntities(data,query){
  const term=code(query);
  if(!term)return [];
  const materials=data.individuals.filter(s=>matchesMaterial(s,term)).map(s=>({
    type:'material',item:s,label:s.name,sub:(s.source_sample_id??s.id)+' · '+(s.dataset_name??s.dataset_id),
    badge:isCross(s)?'杂交组合':'材料',exact:[s.id,s.source_sample_id,s.name].some(x=>code(x)===term)
  }));
  const genes=data.genes.flatMap(g=>{
    const score=geneScore(g,query);
    return score?[{type:'gene',item:g,label:g.name,sub:g.catalog?.msu||g.catalog?.rap||g.id,badge:'基因',exact:score>=90}]:[];
  });
  const traits=queryTraits(data).filter(t=>[t.name,t.id].some(x=>code(x).includes(term))).map(t=>({
    type:'trait',item:t,label:t.name,sub:t.environments?.length?'群体实测':'文献性状',
    badge:'性状',exact:[t.name,t.id].some(x=>code(x)===term)
  }));
  return [...materials,...genes,...traits].sort((a,b)=>Number(b.exact)-Number(a.exact));
}

function enteredEntities(data,query,choices){
  const exact=choices.filter(c=>c.exact);
  if(exact.length)return exact.length===1?exact:[];
  if(planScenario(query))return [];
  const tokens=query.trim().split(/[×+＋,，;；\s]+/).filter(Boolean);
  if(tokens.length>1&&tokens.length<=16){
    const picked=tokens.map(token=>findEntities(data,token).filter(c=>c.exact));
    if(picked.every(p=>p.length===1)&&picked[0][0].type!=='trait'&&picked.every(p=>p[0].type===picked[0][0].type)){
      return picked.map(p=>p[0]);
    }
  }
  return choices.length===1?choices:[];
}

export function BreederInput({data,onSelect,onSentence,onUpload,upload,materials,genes,trait,importName,onRemoveMaterial,onRemoveGene,onRemoveTrait,onRemoveImport,onReset,children,planning}){
  const [query,setQuery]=useState('');
  const input=useRef(null);
  const choices=useMemo(()=>findEntities(data,query),[data,query]);
  const enter=useMemo(()=>enteredEntities(data,query,choices),[data,query,choices]);
  const sentence=!enter.length&&Boolean(planScenario(query));
  const preview=choices.length>9?[
    ...choices.filter(c=>c.exact),
    ...['material','gene','trait'].flatMap(type=>choices.filter(c=>c.type===type&&!c.exact).slice(0,3))
  ].slice(0,12):choices;
  const hasSelection=materials.length>0||genes.length>0||Boolean(trait)||Boolean(importName);
  function choose(items){
    if(!items.length)return;
    onSelect(items);
    setQuery('');
    input.current?.focus();
  }
  function propose(text){
    onSentence(text);
    setQuery('');
  }
  function submit(){
    if(enter.length)choose(enter);
    else if(sentence)propose(query);
  }
  function template(kind){
    if(kind==='markers'){
      downloadTable({filename:'riceflux_marker_dictionary.txt',columns:['marker_id','gene_id','gene_name','chr','position','ref','alt']},
        data.genes.flatMap(g=>g.variants.map(v=>({...v,marker_id:v.id,gene_id:g.id,gene_name:g.name,chr:v.chromosome,position:v.pos}))));
      return;
    }
    const fields=kind==='genotype'?checkGenotypeFields:kind==='pav'?checkPavFields:checkPhenotypeFields;
    downloadTable({filename:'riceflux_check_'+kind+'.txt',columns:fields},[]);
  }
  return <section className="breeder-entry" aria-label="育种查询入口">
    <form className="entry-form" role="search" onSubmit={e=>{e.preventDefault();submit();}}>
      <div className="review-search entry-search" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setQuery('');}}>
        <input type="search" ref={input} aria-label="搜索材料、基因或性状" placeholder="搜索材料、基因、性状，或描述任务" value={query}
          onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{
            if(e.nativeEvent.isComposing)return;
            if(e.key==='Escape')setQuery('');
            if(e.key==='Enter'){e.preventDefault();submit();}
          }}/>
        {query.trim()&&<div className="review-matches" aria-label="匹配对象">
          {preview.map(({type,item,label,sub,badge})=><button type="button" key={type+':'+item.id}
            onClick={()=>choose([{type,item}])}><span><strong>{label}</strong><small>{sub}</small></span><span>{badge}</span></button>)}
          {enter.length>1&&<button type="button" onClick={()=>choose(enter)}>加入 {enter.length} 项</button>}
          {sentence&&<button type="button" onClick={()=>propose(query)}>生成任务计划</button>}
          {!sentence&&!preview.length&&enter.length<2&&<p role="status">没有找到匹配的材料、基因或性状。</p>}
          {!sentence&&preview.length>1&&!enter.length&&<p>请选择具体对象。</p>}
        </div>}
      </div>
      <label className="entry-upload">
        <span>{upload.busy?'正在读取…':'导入文件'}</span>
        <input type="file" aria-label="导入文件" accept=".txt,.tsv,.vcf,.gz,.bgz" multiple disabled={upload.busy} onChange={e=>{
          const files=[...e.target.files];e.target.value='';if(files.length)onUpload(files);
        }}/>
      </label>
    </form>
    <div className="entry-helper">
      {!hasSelection&&!planning&&<span>例如 D106、GL7、粒长</span>}
      <details className="review-disclosure"><summary>任务例句</summary><ul className="entry-examples">
        {planExamples.map(example=><li key={example}><button type="button" className="review-link" onClick={e=>{
          e.currentTarget.closest('details').open=false;propose(example);
        }}>{example}</button></li>)}
      </ul></details>
      <details className="review-disclosure"><summary>上传格式</summary>
        <div className="entry-format-panel">
          <p>体检可上传同一材料的 SNP / InDel VCF、PAV 和表型。名单每行写一个编号。</p>
          <button className="review-link" type="button" onClick={()=>template('genotype')}>分型模板</button>
          <button className="review-link" type="button" onClick={()=>template('phenotype')}>表型模板</button>
          <button className="review-link" type="button" onClick={()=>template('pav')}>PAV 模板</button>
          <button className="review-link" type="button" onClick={()=>template('markers')}>位点字典</button>
        </div>
      </details>
    </div>
    {upload.error&&<p role="alert">{upload.error}</p>}
    {upload.notice&&<p role="status" className="breeder-note">{upload.notice}</p>}
    {(hasSelection||children)&&<div className="entry-context">
      {materials.slice(0,6).map(s=><span className="entry-chip" key={s.id}><span>{s.name}</span>
        <button type="button" aria-label={'移除材料 '+s.name} onClick={()=>onRemoveMaterial(s)}>×</button></span>)}
      {materials.length>6&&<span>{materials.length.toLocaleString()} 份材料</span>}
      {genes.map(g=><span className="entry-chip" key={g.id}><span>{g.name}</span>
        <button type="button" aria-label={'移除基因 '+g.name} onClick={()=>onRemoveGene(g.id)}>×</button></span>)}
      {trait&&<span className="entry-chip"><span>{trait.name}</span>
        <button type="button" aria-label={'移除性状 '+trait.name} onClick={onRemoveTrait}>×</button></span>}
      {importName&&<span className="entry-chip"><span>{importName} · 已导入</span>
        <button type="button" aria-label="清除体检结果" onClick={onRemoveImport}>×</button></span>}
      {children}
      {hasSelection&&<button className="review-link entry-clear" type="button" onClick={()=>{setQuery('');onReset();input.current?.focus();}}>清空查询</button>}
    </div>}
  </section>;
}
