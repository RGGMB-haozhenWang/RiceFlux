import {useText} from './locale.jsx';
import React,{useEffect,useMemo,useState} from 'react';
import {callLabel,ReviewRange,ReviewSource,shown} from './BreederReview.jsx';
import {materialKey} from './breeder.js';
import {catalogColumns,catalogRows,categories,decisionLabels,schemeLabels,schemeDefinition,accessionId,accessionName,
  measurements,observationEvidence,selectTrial,trialAssay,trialCaption,trialLocation,trialSite,trialYear} from './breederCatalog.js';
import {downloadTable} from './formats.js';
import {typeMaterial} from './jointHaplotypes.js';
import {findGenes} from './geneSearch.js';

const nFmt=n=>n.toLocaleString();
const statusLabels={met:'区间内',outside:'区间外',missing:'缺测'};
const subspeciesName=value=>({indica:'籼稻',japonica:'粳稻'})[value?.toLowerCase()]??value;
const chromosomeName=value=>value?.replace(/^Chr0?(\d+)$/i,'$1 号染色体')||'染色体未登记';

function TrialFilters({sources,traits,axis,chooseTrait,chooseAxis}){
  const localize = useText();
  const atTrait=axis?sources.filter(r=>r.trait_id===axis.trait_id):[];
  const sites=new Map(atTrait.map(r=>[trialSite(r),trialLocation(r)]));
  const atSite=axis?atTrait.filter(r=>trialSite(r)===trialSite(axis)):[];
  const years=[...new Set(atSite.map(trialYear))].sort().reverse();
  const atYear=axis?atSite.filter(r=>trialYear(r)===trialYear(axis)):[];
  const switchTrial=(field,value)=>{
    const record=selectTrial(sources,axis,field,value);
    if(record)chooseAxis(record.key);
  };
  return <div className="catalog-trial-filters">
    <label>{localize("目标性状")}<select aria-label={localize("选择性状")} value={axis?.trait_id??''} onChange={e=>chooseTrait(e.target.value)}>
      <option value="">{localize("选择目标性状")}</option>
      {Array.from(traits,([id,trait])=><option key={id} value={id}>{localize(trait)}</option>)}
    </select></label>
    {axis&&<>
      <label>{localize("试验地点")}<select aria-label={localize("试验地点")} value={trialSite(axis)} onChange={e=>switchTrial('site',e.target.value)}>
        {Array.from(sites,([site,label])=><option key={site} value={site}>{localize(label)}</option>)}
      </select></label>
      <label>{localize("年份")}<select aria-label={localize("试验年份")} value={trialYear(axis)} onChange={e=>switchTrial('year',e.target.value)}>
        {years.map(year=><option key={year} value={year}>{year||localize("未登记")}</option>)}
      </select></label>
      {atYear.length>1&&<label>{localize("测定指标")}<select aria-label={localize("测定指标")} value={axis.key} onChange={e=>chooseAxis(e.target.value)}>
        {atYear.map(r=><option key={r.key} value={r.key}>{localize(trialAssay(r))} · {localize(r.unit)}</option>)}
      </select></label>}
      <span className="catalog-trial-count">{localize("全库")+" "}{localize(nFmt(axis.observed))}{localize("份实测")}{localize(atYear.length===1&&trialAssay(axis)!==axis.trait_name?' · '+trialAssay(axis):'')}</span>
      <ReviewSource axis={axis} sources={sources} onAxis={chooseAxis} datasets={[]} allowSwitch={false}/>
    </>}
  </div>;
}

function GeneEntry({data,dataset,axis,models,onAdd}){
  const localize = useText();
  const [query,setQuery]=useState('');
  const available=useMemo(()=>data.genes.filter(g=>!models.some(m=>m.gene.id===g.id)&&
    g.variants.some(v=>v.assayedDatasets?.has(dataset.id))),[data,models,dataset.id]);
  const related=useMemo(()=>{
    if(!axis)return [];
    const ids=new Set((data.reference?.genes??[]).filter(g=>g.trait_ids?.includes(axis.trait_id)).map(g=>g.id));
    return available.filter(g=>ids.has(g.id));
  },[available,axis?.trait_id,data.reference]);
  const term=query.trim();
  const suggestions=useMemo(()=>term?findGenes(available,term).slice(0,6):
    (related.length?related:available).slice().sort((a,b)=>a.name.localeCompare(b.name)).slice(0,5),[available,related,term]);
  function add(gene){onAdd(gene);setQuery('');}
  return <div className="catalog-gene-entry">
    <label className="catalog-gene-search">{localize("比较基因")}<input type="search" aria-label={localize("查找比较基因")} value={query}
      placeholder={localize("当前数据包的基因名称或 MSU / RAP ID")} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{
        if(e.nativeEvent.isComposing)return;
        if(e.key==='Escape')setQuery('');
        if(e.key==='Enter'&&suggestions.length===1){e.preventDefault();add(suggestions[0]);}
      }}/></label>
    <div className="catalog-gene-suggestions" role="group" aria-label={localize("可添加的比较基因")}>
      <span>{term?localize("匹配基因"):related.length?axis.trait_name+'关联基因':localize("有分型的基因")}</span>
      {suggestions.map(g=><button className="review-link" type="button" key={g.id} aria-label={localize('添加 '+g.name)}
        title={localize(g.catalog?.msu||g.id)} onClick={()=>add(g)}>+ {localize(g.name)}</button>)}
      {!suggestions.length&&<span role="status">{query.trim()?localize("没有匹配基因。"):localize("暂无其他可添加的分型基因。")}</span>}
    </div>
  </div>;
}

function OntologyEvidence({axis,dataset}){
  const localize = useText();
  const evidence=observationEvidence(axis,dataset);
  if(!evidence)return null;
  return <details className="review-disclosure catalog-ontology">
    <summary>{localize("性状定义与本体证据")}</summary>
    <dl className="catalog-ontology-detail">
      <dt>{localize("性状")}</dt><dd>{localize(evidence.traitLabel)} · {localize(evidence.traitId)}</dd>
      <dt>{localize("本体映射")}</dt><dd>{localize(evidence.mappingCaption)}</dd>
      <dt>{localize("测定")}</dt><dd>{evidence.methodLabel||localize("未登记")} · {evidence.unit||localize("单位未登记")}</dd>
      <dt>{localize("方法标识")}</dt><dd>{evidence.methodId||localize("未登记")}</dd>
      <dt>{localize("量表标识")}</dt><dd>{evidence.scaleId||localize("未登记")}</dd>
      <dt>{localize("试验")}</dt><dd>{localize(evidence.environmentCaption)} · {localize(evidence.environmentId)}</dd>
      <dt>{localize("生育时期")}</dt><dd>{evidence.growthStage||localize("未登记")}</dd>
      <dt>{localize("本地性状标识")}</dt><dd>{localize(evidence.traitIri)}</dd>
      <dt>{localize("测定变量标识")}</dt><dd>{localize(evidence.variableIri)}</dd>
      <dt>{localize("环境标识")}</dt><dd>{localize(evidence.environmentIri)}</dd>
    </dl>
  </details>;
}

function GeneColumns({models,chooseScheme,removeGene,dataset}){
  const localize = useText();
  if(!models.length)return null;
  return <div className="catalog-gene-columns">
    {models.map(model=><details className="catalog-gene" key={model.gene.id}>
      <summary>{localize(model.gene.name)}<small>{localize("分型依据")}</small></summary>
      <div className="catalog-gene-detail">
        <p>{localize([model.gene.chromosome,model.gene.catalog?.msu||model.gene.id].filter(Boolean).join(' · '))}</p>
        <label>{localize("分型依据")}<select aria-label={localize(model.gene.name+' 的分型依据')} value={model.scheme.id}
          onChange={e=>chooseScheme(model.gene.id,e.target.value)}>
          {model.menu.map(option=>{
            const coverage=option.markers.filter(v=>v?.assayedDatasets?.has(dataset.id)).length;
            return <option key={option.id} value={option.id}>{localize(schemeLabels[option.kind])} · {localize(coverage)}/{localize(option.positions.length)}{localize("位点有分型")}{localize(option.doi[0]?' · '+option.doi[0]:'')}</option>;
          })}
        </select></label>
        {model.scheme.doi[0]?<a href={'https://doi.org/'+model.scheme.doi[0]} target="_blank" rel="noreferrer">{localize("分型原文")}</a>:
          model.gene.catalog?.geneDOI?.[0]&&<a href={'https://doi.org/'+model.gene.catalog.geneDOI[0]} target="_blank" rel="noreferrer">{localize("基因文献")}</a>}
        <button type="button" className="review-link" onClick={()=>removeGene(model.gene.id)}>{localize("移除此基因")}</button>
      </div>
    </details>)}
  </div>;
}

function MaterialRecords({sample,axis,sources,onAxis,models,calls}){
  const localize = useText();
  const records=measurements(sample,sources);
  const groups=new Map();
  for(const r of records){
    if(!groups.has(r.trait_id))groups.set(r.trait_id,[]);
    groups.get(r.trait_id).push(r);
  }
  const grouped=Array.from(groups).sort(([a],[b])=>Number(b===axis?.trait_id)-Number(a===axis?.trait_id));
  return <div className="catalog-records" role="region" aria-label={localize(accessionName(sample)+' 的材料档案')}>
    <div>
      <h3>{localize(accessionId(sample))} · {localize(accessionName(sample))}</h3>
      <p>{localize([categories[sample.kind]??sample.kind,subspeciesName(sample.subspecies),
        sample.source_group&&'来源组 '+sample.source_group].filter(Boolean).join(' · '))}</p>
      {models.length>0&&<dl>{models.map((m,i)=><React.Fragment key={m.gene.id}>
        <dt>{localize(m.gene.name)} · {localize(schemeLabels[m.scheme.kind])}</dt>
        <dd>{localize(callLabel(calls?.calls[i]))}
          {calls?.calls[i]?.bases&&<small title={localize(m.scheme.positions.join(', '))}>{localize("位点调用")+" "}{localize(calls.calls[i].bases)}</small>}</dd>
      </React.Fragment>)}</dl>}
    </div>
    <div>
      <h4>{localize("实测记录")+" "}<small>{localize(records.length)}{" "+localize("条")}</small></h4>
      {!records.length&&<p>{localize("该材料暂无表型实测记录。")}</p>}
      <div className="catalog-observations" key={axis?.key??'all'}>
        {grouped.map(([traitId,rows],index)=>{
          const ordered=rows.slice().sort((a,b)=>Number(b.key===axis?.key)-Number(a.key===axis?.key));
          return <details className="catalog-records-group" key={traitId} open={traitId===axis?.trait_id||!groups.has(axis?.trait_id)&&index===0}>
            <summary>{localize(rows[0].trait_name)} <small>{localize(rows.length)}{" "+localize("条")}</small></summary>
            <ul>{ordered.map(r=><li key={r.key}>
              <span>{localize(trialCaption(r))}</span><b>{localize(sample.phenotypes[r.id])} {localize(r.unit)}</b>
              {axis?.key===r.key?<span className="catalog-current">{localize("当前对照")}</span>:
                <button className="review-link" type="button" aria-label={localize('对照 '+r.trait_name+' '+trialCaption(r))}
                  onClick={()=>onAxis(r.key)}>{localize("对照此场次")}</button>}
            </li>)}</ul>
          </details>;
        })}
      </div>
    </div>
  </div>;
}

export function BreederCatalog({data,onAddGene,onCompare,dataset,candidates,selected,sources,axis,bounds,target,observations,models,status,callById,
  selectedOnly,onSelectedOnly,inspect,onInspect,chooseTrait,chooseAxis,chooseScheme,removeGene,add,remove,clear,onBounds,review,onReview}){
  const localize = useText();
  const [kind,setKind]=useState(''),[measured,setMeasured]=useState(''),[inside,setInside]=useState('');
  const [page,setPage]=useState(0),[sort,setSort]=useState(''),[reviewing,setReviewing]=useState(false);
  const keys=useMemo(()=>new Set(selected.map(materialKey)),[selected]);
  const bySample=useMemo(()=>new Map(observations.map(r=>[r.sample.id,r])),[observations]);
  const traits=useMemo(()=>new Map(sources.map(r=>[r.trait_id,r.trait_name])),[sources]);
  const byCategory=useMemo(()=>{
    const categories=new Map();
    for(const s of candidates)categories.set(s.kind,(categories.get(s.kind)??0)+1);
    return categories;
  },[candidates]);
  const hasPhenotype=useMemo(()=>new Set(candidates.filter(s=>sources.some(r=>Number.isFinite(s.phenotypes[r.id]))).map(s=>s.id)),
    [candidates,sources]);
  const measurementKey=axis?.key??'any-trial';
  const measuredOnly=measured===measurementKey;
  const insideOnly=target.active&&inside===axis?.key;
  const visibleRows=useMemo(()=>{
    const value=s=>s.phenotypes[axis?.id];
    const available=s=>axis?Number.isFinite(value(s)):hasPhenotype.has(s.id);
    const list=selectedOnly?selected.filter(s=>!insideOnly||bySample.get(s.id)?.target_status==='met'):
      candidates.filter(s=>(!kind||s.kind===kind)&&(!measuredOnly||available(s)));
    if(axis)list.sort((a,b)=>{
      const x=value(a),y=value(b);
      if(!Number.isFinite(x))return Number.isFinite(y)?1:0;
      if(!Number.isFinite(y))return -1;
      return sort==='asc'?x-y:sort==='desc'?y-x:0;
    });
    else if(!selectedOnly)list.sort((a,b)=>Number(available(b))-Number(available(a)));
    return list;
  },[axis?.id,bySample,candidates,hasPhenotype,insideOnly,kind,measuredOnly,selected,selectedOnly,sort]);
  const size=selectedOnly?10:6,last=Math.max(0,Math.ceil(visibleRows.length/size)-1),activePage=Math.min(last,page);
  const inspectedRow=selectedOnly&&inspect?visibleRows.findIndex(sample=>materialKey(sample)===inspect.key):-1;
  useEffect(()=>{
    if(inspectedRow>=0)setPage(Math.floor(inspectedRow/size));
  },[inspect,inspectedRow,size]);
  const rows=visibleRows.slice(activePage*size,(activePage+1)*size);
  const definitions=JSON.stringify(Object.fromEntries(models.map(m=>[m.gene.id,schemeDefinition(m)])));
  const context=JSON.stringify([dataset.version,axis?.key,target.min,target.max,definitions]);
  const recorded=review?.context===context?review.decisions:{};
  const conditionsChanged=review&&review.context!==context&&selected.some(s=>Object.hasOwn(review.decisions,materialKey(s)));
  const showDecisions=selectedOnly&&reviewing;
  const showRange=selectedOnly&&axis&&observations.some(r=>Number.isFinite(r.value));
  function inspectTrial(key){
    setPage(0);
    setSort('');
    chooseAxis(key);
  }
  function recordDecision(sample,value){
    const next={...recorded},key=materialKey(sample);
    if(value)next[key]=value;
    else delete next[key];
    onReview({context,decisions:next});
  }
  function exportCatalog(){
    downloadTable({filename:'riceflux_'+dataset.id+'_materials.txt',columns:catalogColumns},
      catalogRows(selected,dataset,axis,target,bySample,models,callById,recorded));
  }
  const loading=status.error?'载入失败':'载入中';
  return <section className="breeder-card catalog-card" aria-label={localize("材料比较表")}>
    <header className="catalog-heading">
      <div><h2>{localize("材料比较表")}</h2><span>{localize(selectedOnly?selected.length:candidates.length)}{" "+localize("份 ·")+" "}{localize(dataset.name)}</span></div>
      <details className="review-disclosure catalog-source">
        <summary>{localize("数据来源")}</summary>
        <div className="catalog-source-detail">
          <b>{localize(dataset.name)} · {localize(dataset.version)}</b>
          <p>{localize(Array.from(byCategory,([type,count])=>(categories[type]??type)+' '+nFmt(count)+' 份').join(' · '))}</p>
          <p>{localize(traits.size)}{" "+localize("项实测性状 ·")+" "}{localize(sources.length)}{" "+localize("个测定记录")}</p>
        </div>
      </details>
    </header>
    <div className="catalog-target-controls"><TrialFilters sources={sources} traits={traits} axis={axis} chooseAxis={inspectTrial}
      chooseTrait={id=>{setPage(0);setSort('');chooseTrait(id);}}/>
      {axis&&<OntologyEvidence axis={axis} dataset={dataset}/>}
    </div>
    <GeneEntry data={data} dataset={dataset} axis={axis} models={models} onAdd={onAddGene}/>
    <GeneColumns models={models} dataset={dataset} chooseScheme={chooseScheme} removeGene={removeGene}/>
    <div className="catalog-actions">
      <div className="catalog-scope" role="group" aria-label={localize("显示材料")}>
        <button type="button" aria-pressed={!selectedOnly} onClick={()=>{onSelectedOnly(false);setPage(0);}}>{localize("全部材料")}</button>
        <button type="button" aria-pressed={selectedOnly} onClick={()=>{onSelectedOnly(true);setPage(0);}}>{localize("已选")+" "}{localize(nFmt(selected.length))}{" "+localize("份")}</button>
      </div>
      {selectedOnly&&selected.length===2&&onCompare&&<button className="review-link" type="button" onClick={onCompare}>{localize("比较双亲")}</button>}
      {!selectedOnly&&<><select aria-label={localize("材料类别")} value={kind}
        onChange={e=>{setKind(e.target.value);setPage(0);}}>
        <option value="">{localize("全部类别")}</option>
        {Array.from(byCategory,([id,count])=><option key={id} value={id}>{localize(categories[id]??id)}（{localize(nFmt(count))}）</option>)}
      </select>
      {sources.length>0&&<label className="breeder-check"><input type="checkbox" checked={measuredOnly}
        onChange={e=>{setMeasured(e.target.checked?measurementKey:'');setPage(0);}}/>{localize("仅看有实测")}</label>}</>}
      {showRange&&<ReviewRange axis={axis} bounds={bounds} target={target} onBounds={onBounds}
        observations={observations} selectedCount={selected.length}/>}
      {selectedOnly&&target.active&&<label className="breeder-check"><input type="checkbox" checked={insideOnly}
        onChange={e=>{setInside(e.target.checked?axis.key:'');setPage(0);}}/>{localize("仅看区间内")}</label>}
      {selectedOnly&&selected.length>0&&<>
        <button className="review-link" type="button" aria-pressed={reviewing} onClick={()=>setReviewing(!reviewing)}>{localize("记录取舍")}</button>
        <button className="review-link" type="button" onClick={clear}>{localize("清空已选")}</button>
      </>}
      {(last>0||selected.length>0)&&<div className="catalog-page">
        {last>0&&<>
          <span>{localize(nFmt(activePage*size+1))}–{localize(nFmt(Math.min((activePage+1)*size,visibleRows.length)))} / {localize(nFmt(visibleRows.length))}{" "+localize("份")}</span>
          <button type="button" className="review-link" disabled={!activePage} onClick={()=>setPage(activePage-1)}>{localize("上一页")}</button>
          <button type="button" className="review-link" disabled={activePage===last} onClick={()=>setPage(activePage+1)}>{localize("下一页")}</button>
        </>}
        {selected.length>0&&<button className="catalog-download" type="button" disabled={target.invalid||models.length>0&&!status.ready}
          onClick={exportCatalog}>{localize("下载已选资料")}</button>}
      </div>}
    </div>
    {showDecisions&&conditionsChanged&&<p className="breeder-note">{localize("对照条件已变更，请复核取舍。")}</p>}
    <div className="matrix-scroll catalog-matrix"><table className="individual-table" aria-label={localize("材料资料表")}>
      <thead><tr><th scope="col">{localize("选择")}</th><th scope="col">{localize("编号")}</th><th scope="col">{localize("品种名")}<small>{localize("点击查看实测记录")}</small></th><th scope="col">{localize("材料类别")}</th>
        <th scope="col" aria-sort={axis?(sort==='asc'?'ascending':sort==='desc'?'descending':'none'):undefined}>
          {axis?<button className="review-link review-sort" type="button" aria-label={localize('按'+axis.trait_name+'排序')}
            onClick={()=>{setSort(sort==='asc'?'desc':'asc');setPage(0);}}>{localize(axis.trait_name)}（{localize(axis.unit)}）{localize(sort==='asc'?' ↑':sort==='desc'?' ↓':' ↕')}</button>:localize("已测性状")}
        </th>
        {models.map(m=><th scope="col" key={m.gene.id}>{localize(m.gene.name)}{" "+localize("基因型")}<small>{localize(chromosomeName(m.gene.chromosome))} · {localize(schemeLabels[m.scheme.kind])}</small></th>)}
        {selectedOnly&&target.active&&<th scope="col">{localize("筛选区间")}</th>}
        {showDecisions&&<th scope="col">{localize("取舍")}</th>}
      </tr></thead>
      <tbody>{rows.map(sample=>{
        const key=materialKey(sample),open=inspect?.key===key,r=bySample.get(sample.id);
        const value=sample.phenotypes[axis?.id];
        const calls=callById.get(sample.id)??(status.ready&&models.length?{calls:models.map(m=>typeMaterial(sample,m.scheme))}:null);
        const measuredTraits=axis?[]:[...new Set(measurements(sample,sources).map(t=>t.trait_name))];
        const phenotypeSummary=measuredTraits.length?measuredTraits.slice(0,3).map(value=>localize(value)).join(localize('、'))+(measuredTraits.length>3?localize(' 等 #0# 项',[measuredTraits.length]):''):localize('暂无实测');
        const span=5+models.length+Number(!!selectedOnly&&target.active)+Number(showDecisions);
        return <React.Fragment key={sample.id}><tr>
          <td><input type="checkbox" aria-label={localize('选择 '+accessionId(sample))} checked={keys.has(key)}
            onChange={e=>e.target.checked?add([sample]):remove(sample)}/></td>
          <th scope="row">{localize(accessionId(sample))}</th>
          <td><button type="button" className="review-link review-name" aria-expanded={open}
            onClick={()=>onInspect(open?'':key)}>{localize(accessionName(sample))}</button></td>
          <td>{localize(categories[sample.kind]??sample.kind)}<small>{localize(subspeciesName(sample.subspecies))}</small></td>
          <td>{localize(axis?(Number.isFinite(value)?value:'该场次缺测'):phenotypeSummary)}
            {axis&&selectedOnly&&r?.percentile!=null&&<small>{localize("同场次百分位")+" "}{localize(shown(r.percentile))}%</small>}</td>
          {models.map((m,i)=><td key={m.gene.id}>{localize(status.ready?callLabel(calls?.calls[i]):loading)}</td>)}
          {selectedOnly&&target.active&&<td className={r?.target_status==='met'?'breeder-met':''}>{localize(statusLabels[r?.target_status])}</td>}
          {showDecisions&&<td><select aria-label={localize(accessionId(sample)+' 的取舍')} disabled={target.invalid}
            value={recorded[key]??''} onChange={e=>recordDecision(sample,e.target.value)}>
            <option value="">{localize("待决定")}</option>
            {Object.entries(decisionLabels).map(([id,label])=><option key={id} value={id}>{localize(label)}</option>)}
          </select></td>}
        </tr>
        {open&&<tr className="catalog-records-row"><td colSpan={span}>
          <MaterialRecords sample={sample} axis={axis} sources={sources} onAxis={inspectTrial} models={models} calls={calls}/>
        </td></tr>}</React.Fragment>;
      })}
      {!rows.length&&<tr><td colSpan={5+models.length}>{selectedOnly&&!selected.length?localize("从「全部材料」勾选，或在顶部搜索编号添加材料。"):localize("当前条件无匹配材料。")}</td></tr>}
      </tbody>
    </table></div>
  </section>;
}
