import {useLocale} from './locale.jsx';
import React,{useMemo,useRef,useState} from 'react';
import {Button} from '@radix-ui/themes';
import {isCross} from './breeder.js';
import {planExamples,planScenario,queryTraits,traitSearchLabels} from './breederPlan.js';
import {downloadTable,matchesMaterial} from './formats.js';
import {geneScore} from './geneSearch.js';
import {checkGenotypeFields,checkPhenotypeFields} from './materialCheck.js';
import {checkPavFields} from './pav.js';

const code=s=>String(s??'').trim().toLowerCase();

function findEntities(data,query,datasetId){
  const term=code(query);
  if(!term)return [];
  const materials=data.individuals.filter(s=>(!datasetId||s.dataset_id===datasetId)&&matchesMaterial(s,term)).map(s=>({
    type:'material',item:s,label:s.name,sub:(s.source_sample_id??s.id)+' · '+(s.dataset_name??s.dataset_id),
    badge:isCross(s)?'杂交组合':'材料',exact:[s.id,s.source_sample_id,s.name].some(x=>code(x)===term)
  }));
  if(datasetId)return materials.sort((a,b)=>Number(b.exact)-Number(a.exact));
  const genes=data.genes.flatMap(g=>{
    const score=geneScore(g,query);
    return score?[{type:'gene',item:g,label:g.name,sub:g.catalog?.msu||g.catalog?.rap||g.id,badge:'基因',exact:score>=90}]:[];
  });
  const traits=queryTraits(data).filter(t=>traitSearchLabels(t).some(x=>code(x).includes(term))).map(t=>({
    type:'trait',item:t,label:t.name,sub:t.environments?.length?'群体实测':'文献性状',
    badge:'性状',exact:traitSearchLabels(t).some(x=>code(x)===term)
  }));
  return [...materials,...genes,...traits].sort((a,b)=>Number(b.exact)-Number(a.exact));
}

function enteredEntities(data,query,choices,datasetId){
  const exact=choices.filter(c=>c.exact);
  if(exact.length)return exact.length===1?exact:[];
  if(planScenario(query))return [];
  const tokens=query.trim().split(/[×+＋,，;；\s]+/).filter(Boolean);
  if(tokens.length>1&&tokens.length<=16){
    const picked=tokens.map(token=>findEntities(data,token,datasetId).filter(c=>c.exact));
    if(picked.every(p=>p.length===1)&&picked[0][0].type!=='trait'&&picked.every(p=>p[0].type===picked[0][0].type)){
      return picked.map(p=>p[0]);
    }
  }
  return choices.length===1?choices:[];
}

export function BreederInput({data,onSelect,onSentence,onUpload,upload,materials,genes,trait,importName,onRemoveMaterial,onRemoveGene,onRemoveTrait,onRemoveImport,onReset,children,planning,compact=false,datasetId}){
  const {language,t:localize} = useLocale();
  const [query,setQuery]=useState('');
  const [suggest,setSuggest]=useState(false);
  const input=useRef(null);
  const choices=useMemo(()=>findEntities(data,query,datasetId),[data,query,datasetId]);
  const enter=useMemo(()=>enteredEntities(data,query,choices,datasetId),[data,query,choices,datasetId]);
  const sentence=!compact&&!enter.length&&Boolean(planScenario(query));
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
    else {setSuggest(true);input.current?.focus();}
  }
  function template(kind){
    if(kind==='markers'){
      downloadTable({filename:'riceflux_marker_dictionary.txt',columns:['marker_id','gene_id','gene_name','chr','position','ref','alt']},
        data.genes.flatMap(g=>g.variants.filter(v=>!compact||!datasetId||v.assayedDatasets?.has(datasetId)).map(v=>({...v,marker_id:v.id,gene_id:g.id,gene_name:g.name,chr:v.chromosome,position:v.pos}))));
      return;
    }
    const fields=kind==='genotype'?checkGenotypeFields:kind==='pav'?checkPavFields:checkPhenotypeFields;
    downloadTable({filename:'riceflux_check_'+kind+'.txt',columns:fields},[]);
  }
  const examples=<div className="entry-examples" aria-label={localize("任务示例")}>
    {planExamples.map(({title,prompt,promptEn})=><Button key={title} type="button" size="1" color="gray" variant="soft"
      onClick={()=>{const example=language==='en'?promptEn:prompt;if(compact)propose(example);else{setQuery(example);input.current?.focus();}}}>{localize(title)}</Button>)}
  </div>;
  const reset=<button className="review-link entry-clear" type="button"
    onClick={()=>{setQuery('');onReset();input.current?.focus();}}>{localize("清空查询")}</button>;
  return <section className="breeder-entry" aria-label={localize("育种查询入口")}>
    <form className="entry-form" role="search" onSubmit={e=>{e.preventDefault();submit();}}>
      <div className="review-search entry-search" onFocus={()=>setSuggest(true)}
        onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setSuggest(false);}}>
        <input type="search" ref={input} aria-label={compact?localize("搜索并添加材料"):localize("搜索材料、基因或性状")}
          placeholder={compact?localize("搜索材料编号或品种名"):localize("搜索材料、基因、性状，或描述任务")} value={query}
          onChange={e=>{setQuery(e.target.value);setSuggest(true);}} onKeyDown={e=>{
            if(e.nativeEvent.isComposing)return;
            if(e.key==='Escape')setSuggest(false);
            if(e.key==='Enter'){e.preventDefault();submit();}
          }}/>
        {suggest&&query.trim()&&<div className="review-matches" aria-label={localize("匹配对象")}>
          {preview.map(({type,item,label,sub,badge})=><button type="button" key={type+':'+item.id}
            onClick={()=>choose([{type,item}])}><span><strong>{localize(label)}</strong><small>{localize(sub)}</small></span><span>{localize(badge)}</span></button>)}
          {enter.length>1&&<button type="button" onClick={()=>choose(enter)}>{localize("加入")+" "}{localize(enter.length)}{" "+localize("项")}</button>}
          {!sentence&&!preview.length&&enter.length<2&&<p role="status">{compact?localize("没有找到匹配材料。"):localize("没有找到匹配的材料、基因或性状。")}</p>}
          {!sentence&&preview.length>1&&!enter.length&&<p>{localize("请选择具体对象。")}</p>}
        </div>}
      </div>
      <Button type="submit" disabled={!query.trim()}>{sentence?localize("生成计划"):compact?localize("添加材料"):localize("查询")}</Button>
      <label className="entry-upload">
        <span>{upload.busy?localize("正在读取…"):compact?localize("导入名单"):localize("导入文件")}</span>
        <input type="file" aria-label={localize("导入文件")} accept=".txt,.tsv,.vcf,.gz,.bgz" multiple disabled={upload.busy} onChange={e=>{
          const files=[...e.target.files];e.target.value='';if(files.length)onUpload(files);
        }}/>
      </label>
    </form>
    <div className="entry-helper">
      {compact?<details className="review-disclosure"><summary>{localize("育种工具")}</summary>
        <div className="entry-examples">{localize(examples)}{localize(children)}{localize(hasSelection&&reset)}</div>
      </details>:!hasSelection&&!planning&&examples}
      <details className="review-disclosure"><summary>{localize("上传格式")}</summary>
        <div className="entry-format-panel">
          <p>{localize("名单可按一行一个编号导入，也可上传带「编号」列的制表符 TXT。体检支持同一材料的 SNP / InDel VCF、PAV 和表型。")}</p>
          <button className="review-link" type="button" onClick={()=>template('genotype')}>{localize("分型模板")}</button>
          <button className="review-link" type="button" onClick={()=>template('phenotype')}>{localize("表型模板")}</button>
          <button className="review-link" type="button" onClick={()=>template('pav')}>{localize("PAV 模板")}</button>
          <button className="review-link" type="button" onClick={()=>template('markers')}>{localize("位点字典")}</button>
        </div>
      </details>
    </div>
    {upload.error&&<p role="alert">{localize(upload.error)}</p>}
    {upload.notice&&<p role="status" className="breeder-note">{localize(upload.notice)}</p>}
    {!compact&&(hasSelection||children)&&<div className="entry-context">
      {materials.slice(0,6).map(s=><span className="entry-chip" key={s.id}><span>{localize(s.name)}</span>
        <button type="button" aria-label={localize('移除材料 '+s.name)} onClick={()=>onRemoveMaterial(s)}>×</button></span>)}
      {materials.length>6&&<span>{localize(materials.length.toLocaleString())}{" "+localize("份材料")}</span>}
      {genes.map(g=><span className="entry-chip" key={g.id}><span>{localize(g.name)}</span>
        <button type="button" aria-label={localize('移除基因 '+g.name)} onClick={()=>onRemoveGene(g.id)}>×</button></span>)}
      {trait&&<span className="entry-chip"><span>{localize(trait.name)}</span>
        <button type="button" aria-label={localize('移除性状 '+trait.name)} onClick={onRemoveTrait}>×</button></span>}
      {importName&&<span className="entry-chip"><span>{localize(importName)}{" "+localize("· 已导入")}</span>
        <button type="button" aria-label={localize("清除体检结果")} onClick={onRemoveImport}>×</button></span>}
      {localize(children)}
      {localize(hasSelection&&reset)}
    </div>}
  </section>;
}
