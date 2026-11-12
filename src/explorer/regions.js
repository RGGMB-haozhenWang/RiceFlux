const locations = {
  Gongzhuling:'公主岭', Tanghai:'唐海', Hefei:'合肥', Wuhan:'武汉', Hangzhou:'杭州', Kunming:'昆明',
  Nanning:'南宁', Donggang:'东港', Menghai:'勐海', Yuxi:'玉溪', Jinzhai:'金寨', Wuzhou:'梧州', Beijing:'北京',
};

const definitions = {
  'Heading date (days)': ['heading','抽穗期','天','生育期','heading'],
  'Grain length (mm)': ['length','粒长','mm','粒形','length'],
  'Grain width (mm)': ['width','粒宽','mm','粒形','width'],
  'Scale of leaf blast resistance': ['leaf_blast','叶瘟抗性','级','抗病','blast','叶瘟评分'],
  'Scale of neck blast resistance': ['neck_blast','穗颈瘟抗性','级','抗病','blast','穗颈瘟评分'],
  'Lesion length of rice bacterial blight_C5 (cm)': ['blight','白叶枯病斑长度','cm','抗病','blight','C5'],
  'Relative lesion height of rice sheath blight disease (%)': ['sheath','纹枯病相对病斑高度','%','抗病','sheath'],
};
export const siteName = site => locations[site] || site;

export function measuredTraits(environments) {
  const traits = new Map();
  for (const source of environments) {
    let definition = definitions[source.trait];
    const lesion = /^LL_(.+)\(cm\)$/.exec(source.trait);
    if (lesion) definition = ['blight','白叶枯病斑长度','cm','抗病','blight',lesion[1]];
    if (/^SLBR_CH\d+$/.test(source.trait)) definition = ['leaf_blast','叶瘟抗性','原表单位未注明','抗病','blast',source.trait];
    if (!definition) throw new Error('未登记的实测性状：' + source.trait);
    const [id, name, unit, category, family, assay = name] = definition;
    if (!traits.has(id)) traits.set(id, {id, name, family, category, environments:[]});
    traits.get(id).environments.push({id:'env_' + source.column, assay, unit, source});
  }
  return [...traits.values()];
}

// Each plotted cell represents at most one original workbook column.
export function regionalView(trait, selection = {}) {
  if (!trait?.environments) return null;
  const assays = [...new Set(trait.environments.map(e => e.assay))];
  const assay = assays.includes(selection.assay) ? selection.assay : assays[0];
  const endpoints = trait.environments.filter(e => e.assay === assay);
  const years = [...new Set(endpoints.map(e => e.source.year))].sort();
  const year = years.includes(selection.year) ? selection.year : years.at(-1);
  const sites = [...new Set(endpoints.map(e => e.source.site))];
  const current = endpoints.filter(e => e.source.year === year);
  const bySite = new Map(current.map(e => [e.source.site, e]));
  if (bySite.size !== current.length) throw new Error('一个地点、年份和鉴定指标对应多个原始列');
  const active = bySite.get(selection.site) || bySite.get('Hefei') || current.find(e => e.source.n > 0) || current[0];
  return {assays, assay, years, year, unit:active.unit, active, sites:sites.map(site => ({site, endpoint:bySite.get(site) || null}))};
}

export function regionalDistributions(groups, view, selectedIds = []) {
  const selected = new Set(selectedIds);
  let minimum = Infinity, maximum = -Infinity;
  const sites = view.sites.map(({site, endpoint}) => {
    const rows = groups.map(({members, key}, index) => {
      const values = [], highlighted = [];
      if (endpoint) for (const sample of members) {
        const value = sample.phenotypes[endpoint.id];
        if (!Number.isFinite(value)) continue;
        values.push(value);
        if (selected.has(sample.id)) highlighted.push({id:sample.id, value});
      }
      values.sort((a,b) => a-b);
      const n = values.length;
      if (!n) return {key, index, n, highlighted};
      const q = p => {
        const i = (n - 1) * p, left = Math.floor(i);
        return values[left] + (values[Math.ceil(i)] - values[left]) * (i - left);
      };
      minimum = Math.min(minimum, values[0]);
      maximum = Math.max(maximum, values[n-1]);
      return {key, index, n, min:values[0], q1:q(.25), median:q(.5), q3:q(.75), max:values[n-1], highlighted};
    });
    return {site, endpoint, rows, total:rows.reduce((sum,row) => sum+row.n,0)};
  });
  if (minimum === Infinity) return {sites, domain:null};
  // Use the same scale for every region, including when all observed values are equal.
  const span = maximum-minimum || Math.max(1, Math.abs(minimum)*.1);
  const step = 10 ** Math.floor(Math.log10(span / 4));
  const lower = minimum === maximum ? minimum-span/2 : minimum;
  const upper = minimum === maximum ? maximum+span/2 : maximum;
  return {sites, domain:[Math.floor(lower/step)*step, Math.ceil(upper/step)*step]};
}
