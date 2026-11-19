// Table bundles use base 5 to encode two indices (REF, up to three ALTs, missing).
// The older demo and versioned source adapters keep their original base-3 representation.
export const missingCode = 4;
export const missingPair = 24;
export const snpBase = /^[ACGT]$/;
export const literalAllele = /^[ACGT]{1,51}$/;
const packedPairs = Array.from({ length: 25 }, (_, code) => [code % 5, Math.floor(code / 5)]
  .map(allele => allele === missingCode ? null : allele));

export function alleleNames(marker) {
  return marker.alleles || [marker.ref, ...(marker.alt?.split(',') || [])];
}

export function markerKind(alleles, allowIndel = false) {
  if (!alleles.length || new Set(alleles).size !== alleles.length || alleles.length > 4) return null;
  if (alleles.every(a => snpBase.test(a))) return 'SNP';
  if (!allowIndel || !alleles.every(a => literalAllele.test(a))) return null;
  const [ref, ...alts] = alleles;
  const simple = alts.every(alt => alt.length === ref.length ? alt.length === 1
    : alt.startsWith(ref) || ref.startsWith(alt));
  return simple && alts.some(alt => alt.length !== ref.length) ? 'InDel' : null;
}

export function baseAt(marker, index) {
  return index === null ? '·' : alleleNames(marker)[index];
}

export function packedCall(code) { return packedPairs[code]; }

export function packCall(pair) {
  return (pair[0] ?? missingCode) + 5 * (pair[1] ?? missingCode);
}

export function callPair(token, alleles) {
  if (token === '' || token === '.' || token === 'NA') return [null, null];
  const pair = token.split('/');
  if (pair.length !== 2) throw Error('分型须为未分相二倍体，例如 A/G、1/2、A/. 或 ./.');
  const called = pair.filter(part => part !== '.');
  const numeric = called.every(part => /^[0-3]$/.test(part));
  if (!numeric && !called.every(part => literalAllele.test(part))) throw Error('分型碱基序列或等位编号无效');
  return pair.map(part => {
    if (part === '.') return null;
    const code = numeric ? Number(part) : alleles.indexOf(part);
    if (code < 0 || code >= alleles.length) throw Error('分型碱基或编号不在 REF/ALT 中');
    return code;
  });
}
