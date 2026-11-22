import {useState} from 'react';
import {fileText} from './dataImport.js';
import {downloadTable} from './formats.js';
import {introgressionColumns,parseIntrogressionReview,introgressionCaseKey,evaluateIntrogression} from './introgressionReview.js';

const verdicts={awaiting_goal:'待填写目标',insufficient:'证据不足',outside:'未达到门槛',uncertain:'区间跨越门槛',supported:'区间支持当前目标'};
const states={estimated:'已估计',not_estimable:'不可估计',not_measured:'未测量'};
const evidenceLabels={G_direct:'直接分型（输入声明）',G_chip:'芯片实测',G_projected:'投影 / 代理',G_mixed:'混合来源'};
const number=value=>value===null||value===undefined?'未知':String(value);
const effectFormat=new Intl.NumberFormat('zh-CN',{maximumFractionDigits:3,signDisplay:'exceptZero',useGrouping:false});
const signed=value=>value===null||value===undefined?'未知':Math.abs(value)>0&&Math.abs(value)<.001
  ?(value>0?'+':'')+value.toExponential(2):effectFormat.format(value);
const threshold=value=>value.trim()===''?undefined:Number(value);
const options=(rows,key,label)=>[...new Map(rows.map(row=>[row[key],label?`${row[label]} · ${row[key]}`:row[key]])).entries()];

function Endpoint({row,missingLabel}) {
  if(!row)return <span className="intro-missing">{missingLabel}</span>;
  return <>
    <strong>{states[row.status]}</strong>
    <span className="intro-effect">{signed(row.estimate)} {row.unit}</span>
    <small>CI [{signed(row.ci_lower)}, {signed(row.ci_upper)}] {row.unit}</small>
    <small>供体型 n={number(row.n_donor)} · 轮回亲本型 n={number(row.n_recurrent)}</small>
  </>;
}

export function IntrogressionReview() {
  const [rows,setRows]=useState([]),[filename,setFilename]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [parent,setParent]=useState(''),[trial,setTrial]=useState(''),[target,setTarget]=useState(''),[tradeoff,setTradeoff]=useState('');
  const [minGain,setMinGain]=useState(''),[maxCost,setMaxCost]=useState('');
  const base=rows.filter(row=>(!parent||row.recurrent_parent===parent)&&(!trial||row.trial_id===trial));
  const traitOptions=options(base,'trait_id','trait_label');
  const groups=new Map();
  for(const row of base){const key=introgressionCaseKey(row);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  const gain=threshold(minGain),cost=threshold(maxCost);
  const targetUnits=[...new Set(base.filter(row=>row.trait_id===target).map(row=>row.unit))];
  const costUnits=[...new Set(base.filter(row=>row.trait_id===tradeoff).map(row=>row.unit))];
  const unitsConflict=targetUnits.length>1||costUnits.length>1;
  const goalReady=Boolean(target)&&!unitsConflict&&Number.isFinite(gain)&&gain>=0&&(!tradeoff||(Number.isFinite(cost)&&cost>=0));
  const decisions=[...groups.entries()].map(([key,endpoints])=>{
    const gainRow=endpoints.find(row=>row.trait_id===target),costRow=tradeoff?endpoints.find(row=>row.trait_id===tradeoff):undefined;
    return {key,row:endpoints[0],gainRow,costRow,verdict:goalReady?evaluateIntrogression(gainRow,costRow,{minGain:gain,...(tradeoff?{maxCost:cost}:{})}):'awaiting_goal'};
  });
  async function load(file) {
    if(!file)return;
    setLoading(true);setError('');
    // Clear the old source before reading so a rejected replacement cannot look accepted.
    setRows([]);setFilename('');setParent('');setTrial('');setTarget('');setTradeoff('');setMinGain('');setMaxCost('');
    try {const parsed=parseIntrogressionReview(await fileText(file));setRows(parsed);setFilename(file.name);}
    catch(err){setError(err.message||'无法读取 UTF-8 TXT 文件');}
    finally {setLoading(false);}
  }
  function exportDecision() {
    const fields=['decision_schema_version','analysis_id','source_ref','contrast','assembly','recurrent_parent','donor_parent','family_id','trial_id','trial_label','gene_id','haplotype_id','genotype_evidence',
      'target_trait_id','target_trait_label','target_unit','min_gain','target_status','target_estimate','target_ci_lower','target_ci_upper','target_n_donor','target_n_recurrent',
      'tradeoff_trait_id','tradeoff_trait_label','tradeoff_unit','max_tolerated_increase','tradeoff_status','tradeoff_estimate','tradeoff_ci_lower','tradeoff_ci_upper','tradeoff_n_donor','tradeoff_n_recurrent',
      'verdict','verdict_label','decision_scope','target_next_check','tradeoff_next_check'];
    const endpoint=(prefix,row)=>Object.fromEntries(['status','estimate','ci_lower','ci_upper','n_donor','n_recurrent'].map(key=>[`${prefix}_${key}`,row?.[key]??(key==='status'?'missing':'')]));
    downloadTable({filename:'riceflux_introgression_decision.txt',columns:fields},decisions.map(({row,gainRow,costRow,verdict})=>({...row,decision_schema_version:'1',
      target_trait_id:target,target_trait_label:gainRow?.trait_label??'',target_unit:gainRow?.unit??'',min_gain:minGain,
      ...endpoint('target',gainRow),tradeoff_trait_id:tradeoff,tradeoff_trait_label:costRow?.trait_label??'',tradeoff_unit:costRow?.unit??'',max_tolerated_increase:tradeoff?maxCost:'',
      ...endpoint('tradeoff',costRow),tradeoff_status:tradeoff?(costRow?.status??'missing'):'not_selected',verdict,verdict_label:verdicts[verdict],
      decision_scope:tradeoff?'目标及所选代价；关联区间判断，未证明田间导入增益':'仅目标性状；未评估代价，未证明田间导入增益',
      target_next_check:gainRow?.next_check||'待补充目标核验计划',tradeoff_next_check:tradeoff?(costRow?.next_check||'待补充代价核验计划'):'未选择代价性状'})));
  }
  return <section className="breeder-card introgression-review" aria-labelledby="introgression-title">
    <div className="intro-heading"><div><h2 id="introgression-title">亲本导入决策</h2><p>同一家系内，供体型后代相对轮回亲本型后代的性状差异。</p></div>
      <button type="button" onClick={()=>downloadTable({filename:'riceflux_introgression_template.txt',columns:introgressionColumns},[])}>下载空白模板 TXT</button>
    </div>
    <section className="intro-stage" aria-labelledby="intro-source-title">
      <h3 id="intro-source-title">1 · 导入证据</h3>
      <label className="intro-file">导入 UTF-8 TXT<input type="file" accept=".txt,.tsv,text/plain,text/tab-separated-values" disabled={loading} onChange={event=>{const file=event.target.files?.[0];event.target.value='';void load(file);}}/></label>
      <p className="breeder-note">文件仅在本地浏览器读取。按模板列名和制表符填写；空白模板不含示例效应。</p>
      <p role="status">{loading?'正在读取…':filename?`${filename} · ${rows.length} 条性状记录`:'尚未导入证据'}</p>
      {error&&<p className="intro-error" role="alert">导入失败：{error}</p>}
      <details><summary>输入约定与证据边界</summary><p>schema_version 为 1；contrast 为 donor_vs_recurrent_within_family。正值表示供体型增加。estimated 必须有估计值、CI 和两组正整数样本数；not_estimable / not_measured 的估计与 CI 留空，样本数未知时留空。</p>
        <p>haplotype_id 使用稳定坐标签名，或 ["source_scoped","analysis_id","source_ref","来源内唯一型别"] 的紧凑 JSON。来源限定型别只在该分析及来源内比较；完整身份含供体、基因、型别、家系、试验与证据来源。</p>
        <p>G_direct 仅表示输入声明的直接分型；G_chip 为芯片实测，G_projected 为投影 / 代理，G_mixed 保留混合来源。此判断基于输入关联证据，不能证明田间导入增益。</p></details>
    </section>
    {rows.length>0&&<>
      <section className="intro-stage" aria-labelledby="intro-goal-title">
        <h3 id="intro-goal-title">2 · 选择背景与目标</h3>
        <div className="intro-controls">
          <label>轮回亲本<select value={parent} onChange={event=>{setParent(event.target.value);setTarget('');setTradeoff('');setMinGain('');setMaxCost('');}}><option value="">全部轮回亲本</option>{options(rows,'recurrent_parent').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label>试验<select value={trial} onChange={event=>{setTrial(event.target.value);setTarget('');setTradeoff('');setMinGain('');setMaxCost('');}}><option value="">全部试验</option>{options(rows,'trial_id','trial_label').map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label>目标性状<select value={target} onChange={event=>{setTarget(event.target.value);setMinGain('');if(event.target.value===tradeoff){setTradeoff('');setMaxCost('');}}}><option value="">请选择目标性状</option>{traitOptions.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label>最小增益{targetUnits.length===1?`（${targetUnits[0]}）`:""}<input aria-label="最小增益" type="number" step="any" min="0" value={minGain} disabled={!target} onChange={event=>setMinGain(event.target.value)} placeholder="填写非负数"/></label>
          <label>代价性状（可选）<select value={tradeoff} onChange={event=>{setTradeoff(event.target.value);setMaxCost('');}} disabled={!target}><option value="">未选择代价性状</option>{traitOptions.filter(([id])=>id!==target).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
          <label>最大容许增加{costUnits.length===1?`（${costUnits[0]}）`:""}<input aria-label="最大容许增加" type="number" step="any" min="0" value={maxCost} disabled={!tradeoff} onChange={event=>setMaxCost(event.target.value)} placeholder="填写非负数"/></label>
        </div>
        <p className="breeder-note">门槛使用对应性状的原始单位；正值为增加。以目标 CI 下限达到最小增益、代价 CI 上限不超过最大容许增加为区间支持。不同单位不合并效应；同一性状若存在多个单位，请缩小背景或试验范围后判断。</p>
        <p role="status">{unitsConflict&&"所选性状存在多个单位，当前不作门槛判断。"}{goalReady?'目标已填写，可查看区间判断。':'请选择目标性状并填写非负的最小增益；选择代价后，还需填写最大容许增加。'}{!tradeoff&&' 当前未选择代价性状，仅评估目标，不代表无代价。'}</p>
      </section>
      <section className="intro-stage" aria-labelledby="intro-results-title">
        <div className="intro-heading"><h3 id="intro-results-title">3 · 候选判断 · {decisions.length} 个案例</h3><button type="button" disabled={!decisions.length} onClick={exportDecision}>导出当前决策 TXT</button></div>
        {!decisions.length?<p>当前筛选下没有案例。</p>:<div className="intro-table-scroll"><table className="individual-table intro-table"><thead><tr><th scope="col">案例身份</th><th scope="col">目标效应</th><th scope="col">代价效应</th><th scope="col">决策与下一步</th></tr></thead><tbody>
          {decisions.map(({key,row,gainRow,costRow,verdict})=><tr key={key}>
            <th scope="row"><strong>{row.donor_parent} → {row.recurrent_parent}</strong><span>{row.gene_id} · {row.family_id}</span><small>{row.trial_label} · {row.trial_id}</small><details><summary>型别与来源</summary><dl><dt>haplotype_id</dt><dd>{row.haplotype_id}</dd><dt>assembly</dt><dd>{row.assembly}</dd><dt>analysis_id</dt><dd>{row.analysis_id}</dd><dt>source_ref</dt><dd>{row.source_ref}</dd></dl></details><small>{row.genotype_evidence} · {evidenceLabels[row.genotype_evidence]}</small></th>
            <td>{target?<><small>{gainRow?.trait_label||target}</small><Endpoint row={gainRow} missingLabel="缺少目标性状记录"/></>:<span className="intro-missing">待选择目标性状</span>}</td>
            <td>{tradeoff?<><small>{costRow?.trait_label||tradeoff}</small><Endpoint row={costRow} missingLabel="缺少代价性状记录，不能判为通过"/></>:<span className="intro-missing">未评估代价</span>}</td>
            <td><span className="intro-verdict" data-verdict={verdict}>{verdicts[verdict]}</span><small>{tradeoff?'仅覆盖所选目标及代价':'仅目标性状判断；代价未知'}</small><p>目标核验：{gainRow?.next_check||'待补充'}</p>{tradeoff&&<p>代价核验：{costRow?.next_check||'待补充'}</p>}</td>
          </tr>)}
        </tbody></table></div>}
      </section>
    </>}
  </section>;
}
