// The downloadable JSON-LD contract also supplies the browser's field order and filenames.
import contract from '../../public/formats/exchange.json' with { type: 'json' };

export const formats = Object.fromEntries(
  contract['@graph'].map(node => [node['@id'].slice(3), node])
);
export const namespace = contract['@context'].rf;
export const columns = formats.priorTable.columns;

export function writeTSV(keys, rows) {
  const cell = value => String(value ?? '').replace(/[\r\n\t]/g, ' ');
  return [keys.join('\t'), ...rows.map(row => keys.map(k => cell(row[k])).join('\t'))].join('\n') + '\n';
}

export function saveFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], {type}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTable(format, rows, fields = format.columns ?? formats[format.sameColumnsAs['@id'].slice(3)].columns) {
  saveFile(format.filename, writeTSV(fields, rows), 'text/tab-separated-values;charset=utf-8');
}

export function matchesMaterial(sample, query) {
  const term = query.trim().toLowerCase();
  return [sample.id, sample.name, sample.ped].some(value => value?.toLowerCase().includes(term));
}

export function materialRow(sample) {
  return {
    accession_id: sample.id, original_name: sample.name,
    material_type: sample.kind, source_group: sample.population_id
  };
}
