export const defaultCheckBand = 5;

export function validatePhenotypeCheck(check) {
  if (check == null) return;
  let key;
  try { key = JSON.parse(check.key); } catch {}
  if (!Array.isArray(key) || key.length !== 2 || key[0] !== null && typeof key[0] !== 'string' ||
    typeof key[1] !== 'string' || !key[1] || !Number.isFinite(check.bandPct) || check.bandPct < 0 || check.bandPct > 100) {
    throw Error('表型对照设置无效');
  }
}

const discreteScale = /级|评分|等级|未注明|不适用|ordinal|categorical|\bbinary\b|\bscore\b|0\s*\/\s*1/i;

export function checkObservation(sample, endpoint, bandPct) {
  if (!sample || !endpoint || sample.dataset_id !== endpoint.source.dataset_id) return null;
  const value = sample.phenotypes[endpoint.id];
  if (!Number.isFinite(value)) return null;
  const padding = Math.abs(value) * (bandPct / 100);
  const band = padding > 0 && !discreteScale.test([endpoint.unit, endpoint.scale_id].join(' ')) &&
    Number.isFinite(value - padding) && Number.isFinite(value + padding) ? [value - padding, value + padding] : null;
  return {value, band};
}
