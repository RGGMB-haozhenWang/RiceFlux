import {useText} from './locale.jsx';
import React from 'react';
import {isCross,materialKey,targetRange} from './breeder.js';
import {planSources} from './breederPlan.js';
import {siteName} from './regions.js';

const tasks={
  parents:['双亲与后代','确认材料身份和母父本方向','核对关注位点的双亲携带型','查看可追踪差异、F1 预期和已登记组合'],
  traits:['材料与性状','确定性状和表型来源','对照原值或单倍型配对实测','按目标区间定位达标材料'],
  stack:['基因聚合','确认关注基因及判型定义','计算群体中的实际联合型别','按组合查回携带材料'],
  check:['材料体检','核对材料编号和输入表','检查位点覆盖、缺测或无效调用','查看表型原值并导出报告'],
};

const materialLabel=s=>s.name+' · '+(s.source_sample_id??s.id)+' · '+(s.dataset_name??s.dataset_id);
const axisLabel=a=>[siteName(a.source.original_site??a.source.site),a.source.year,a.assay,a.unit,a.dataset].join(' · ');

export function BreederPlan({plan,axes,onChange,onRun,onClose}){
  const localize = useText();
  const [name,...steps]=tasks[plan.scenario];
  const parents=plan.materials.filter(s=>!isCross(s));
  const confirmedPair=plan.female&&plan.male&&plan.female!==plan.male&&
    parents.some(s=>materialKey(s)===plan.female)&&parents.some(s=>materialKey(s)===plan.male);
  const {choices,specified}=plan.scenario==='check'?{choices:[],specified:false}:planSources(plan,axes);
  const scope=choices.find(a=>a.key===plan.axis)??(choices.length===1?choices[0]:null);
  const target=targetRange(plan.goal??{});
  const errors=[];
  if(plan.scenario==='parents'&&!confirmedPair)errors.push(parents.length<2?'请在上面的搜索框补充双亲名称或编号。':'请选择母父本方向。');
  if(plan.scenario==='stack'&&plan.genes.length<2)errors.push('请在搜索框添加至少两个基因。');
  if(plan.scenario==='traits'&&!plan.traits.length&&!plan.materials.length)errors.push('请补充性状或材料名称。');
  if(plan.scenario==='check'&&plan.materials.length!==1)errors.push('请用「导入文件」提交同一材料的 VCF、表型或 PAV。');
  if(plan.traits.length>1)errors.push('请明确这次要使用的一个性状。');
  if(plan.goal?.invalid||target.invalid)errors.push('请用明确的范围或边界，例如 8.20–8.25 mm 或至少 8.20 mm。');
  if(specified&&!scope)errors.push(!plan.traits.length?'请先补充要比较的性状。':
    choices.length?'请选择测定记录，再应用目标。':'当前数据没有匹配所给地点、年份和单位的测定记录。');
  if(plan.issues.length)errors.push('请核对未识别或存在多个匹配的名称。');

  return <section className="breeder-card entry-plan" aria-label={localize("育种任务计划")}>
    <div className="task-heading"><h2>{localize(name)}{plan.ran?localize(" · 已打开结果"):localize(" · 任务计划")}</h2>
      <button type="button" className="review-link review-to-end" onClick={onClose}>{plan.ran?localize("收起计划"):localize("关闭计划")}</button></div>
    {plan.ran?<details className="review-disclosure"><summary>{localize("查看原句与步骤")}</summary>
      <p>{localize(plan.sentence)}</p><ol>{steps.map(step=><li key={step}>{localize(step)}</li>)}</ol>
    </details>:<>
      <p className="entry-plan-request">{localize(plan.sentence)}</p>
      <div className="task-form entry-plan-inputs">
        {plan.materials.length>0&&<span>{localize("材料")+" "}{localize(plan.materials.map(s=>s.source_sample_id??s.id).join('、'))}</span>}
        {plan.genes.length>0&&<span>{localize("基因")+" "}{localize(plan.genes.map(g=>g.name).join('、'))}</span>}
        {plan.traits.length===1&&<span>{localize("性状")+" "}{localize(plan.traits[0].name)}</span>}
        {plan.traits.length>1&&<label>{localize("性状")}<select aria-label={localize("计划性状")} value="" onChange={e=>onChange({
          traits:plan.traits.filter(t=>t.id===e.target.value),axis:''})}>
          <option value="">{localize("为当前任务选择一个性状")}</option>
          {plan.traits.map(t=><option key={t.id} value={t.id}>{localize(t.name)}</option>)}
        </select></label>}
        {target.active&&<span>{localize("目标")+" "}{localize(target.min===null?'≤ '+target.max:target.max===null?'≥ '+target.min:target.min+'–'+target.max)} {localize(plan.goal.unit)}</span>}
      </div>
      {plan.scenario==='parents'&&parents.length>=2&&<div className="task-form">
        {[['female','母本'],['male','父本']].map(([key,label])=><label key={key}>{localize(label)}
          <select aria-label={localize('计划'+label)} value={plan[key]} onChange={e=>onChange({[key]:e.target.value})}>
            <option value="">{localize("选择")}{localize(label)}</option>
            {parents.map(s=><option key={s.id} value={materialKey(s)}>{localize(materialLabel(s))}</option>)}
          </select>
        </label>)}
      </div>}
      {specified&&choices.length>1&&<label className="entry-plan-source">{localize("测定记录")}<select aria-label={localize("计划测定记录")} value={scope?.key??''} onChange={e=>onChange({axis:e.target.value})}>
        <option value="">{localize("选择地点、年份和测定方法")}</option>
        {choices.map(a=><option key={a.key} value={a.key}>{localize(axisLabel(a))}</option>)}
      </select></label>}
      {specified&&choices.length===1&&scope&&<p className="breeder-note">{localize("测定记录")+" "}{localize(axisLabel(scope))}</p>}
      {plan.issues.length>0&&<p className="breeder-note">{localize("待核对")+" "}{localize(plan.issues.join('、'))}
        <button type="button" className="review-link" onClick={()=>onChange({issues:[]})}>{localize("仅使用已确认对象")}</button></p>}
      <ol>{steps.map(step=><li key={step}>{localize(step)}</li>)}</ol>
      {errors.map(error=><p key={error} className="breeder-note" role="status">{localize(error)}</p>)}
      <button type="button" className="entry-run" disabled={errors.length>0}
        onClick={()=>onRun(specified?scope:null)}>{localize("执行计划")}</button>
    </>}
  </section>;
}
