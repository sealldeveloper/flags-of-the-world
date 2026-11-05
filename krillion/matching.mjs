// Independent local matcher. Only archived canonical answers supply names and scores.
import {answerIndex, canonical, outcome} from './model.mjs';

export function normalizeAnswer(value) {
  return String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en-US')
    .replace(/×/g, ' x ').replace(/\+\+/g, ' plus plus ').replace(/#/g, ' sharp ')
    .replace(/&/g, ' and ').replace(/['’‘`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function forms(value) {
  const normalized = normalizeAnswer(value);
  if (!normalized) return [];
  const variants = new Set([normalized, normalized.replace(/^(the|an|a) /, '')]);
  for (const text of [...variants]) {
    const words = text.split(' '), last = words.at(-1);
    // English suffix variants only. Foreign-script names remain intact.
    if (!/^[a-z]{4,}$/.test(last)) continue;
    const endings = [];
    if (last.endsWith('ies')) endings.push(last.slice(0, -3) + 'y');
    if (last.endsWith('ves')) endings.push(last.slice(0, -3) + 'f', last.slice(0, -3) + 'fe');
    if (/(ches|shes|xes|zes|sses|oes)$/.test(last)) endings.push(last.slice(0, -2));
    if (last.endsWith('s') && !/(ss|us|is)$/.test(last)) endings.push(last.slice(0, -1));
    for (const ending of endings) variants.add([...words.slice(0, -1), ending].join(' '));
  }
  return [...new Set([...variants].flatMap(text => [text, text.replace(/ /g, '')]))];
}

function register(map, key, answer) {
  if (!map.has(key)) map.set(key, answer);
  else if (map.get(key) !== answer) map.set(key, null);
}

export function createMatcher(answers) {
  const exact = answerIndex(answers), normalized = new Map();
  for (const answer of answers) for (const key of forms(answer.answer)) register(normalized, key, answer);
  const lengths = new Map();
  for (const [key, answer] of normalized) {
    if (key.includes(' ')) continue;
    const length = [...key].length;
    if (length < 5 || length > 514) continue;
    if (!lengths.has(length)) lengths.set(length, []);
    lengths.get(length).push({key, answer});
  }
  return {exact, normalized, lengths};
}

// Bounded optimal-string-alignment distance: insertion/deletion/replacement and
// adjacent transposition. Three narrow rows avoid a full quadratic matrix.
export function editDistance(left, right, maximum = 2) {
  const a = typeof left === 'string' ? [...left] : left;
  const b = typeof right === 'string' ? [...right] : right;
  if (!Number.isInteger(maximum) || maximum < 0 || maximum > 2) throw Error('Invalid typo distance');
  const limit = maximum + 1;
  if (Math.abs(a.length - b.length) > maximum) return limit;
  let previousPrevious = new Uint16Array(b.length + 1).fill(limit);
  let previous = new Uint16Array(b.length + 1).fill(limit);
  let current = new Uint16Array(b.length + 1).fill(limit);
  for (let j = 0; j <= Math.min(b.length, maximum); j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current.fill(limit); current[0] = Math.min(i, limit);
    let best = current[0];
    for (let j = Math.max(1, i - maximum); j <= Math.min(b.length, i + maximum); j++) {
      let distance = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) distance = Math.min(distance, previousPrevious[j - 2] + 1);
      current[j] = Math.min(distance, limit); best = Math.min(best, current[j]);
    }
    if (best > maximum) return limit;
    [previousPrevious, previous, current] = [previous, current, previousPrevious];
  }
  return Math.min(previous[b.length], limit);
}

export function matchAnswer(index, raw, {exactOnly = false} = {}) {
  const exact = index.exact.get(canonical(raw));
  if (exact) return {kind: 'exact', answer: exact};
  if (exactOnly) return {kind: 'none'};
  let normalizedAnswer, ambiguous = false;
  for (const key of forms(raw)) {
    if (!index.normalized.has(key)) continue;
    const answer = index.normalized.get(key);
    if (!answer || normalizedAnswer && normalizedAnswer !== answer) ambiguous = true;
    else normalizedAnswer = answer;
  }
  if (ambiguous) return {kind: 'ambiguous'};
  if (normalizedAnswer) return {kind: 'normalized', answer: normalizedAnswer};
  const key = normalizeAnswer(raw).replace(/ /g, ''), query = [...key];
  if (query.length < 5 || query.length > 512 || !/\p{L}/u.test(key)) return {kind: 'none'};
  let best = 3, winner = null, tied = false;
  for (let length = Math.max(5, query.length - 2); length <= query.length + 2; length++) {
    const minimum = Math.min(length, query.length), maximum = minimum >= 9 ? 2 : 1;
    if (Math.abs(length - query.length) > maximum) continue;
    for (const candidate of index.lengths.get(length) || []) {
      const distance = editDistance(query, candidate.key, Math.min(maximum, best));
      if (distance > maximum) continue;
      if (distance < best) {best = distance; winner = candidate.answer; tied = !winner;}
      else if (distance === best && (!candidate.answer || candidate.answer !== winner)) tied = true;
    }
  }
  return tied ? {kind: 'ambiguous'} : winner ? {kind: 'fuzzy', answer: winner} : {kind: 'none'};
}

export function matchedOutcome(prompt, index, raw, {confirmation, exactOnly = false} = {}) {
  const match = matchAnswer(index, raw, {exactOnly});
  if (match.kind === 'exact') return {...outcome(prompt, index.exact, raw), match: 'exact'};
  if (match.answer) {
    if (confirmation === match.answer.answer) return {...outcome(prompt, index.exact, match.answer.answer), rawAnswer: raw, match: match.kind};
    return {...outcome(prompt, index.exact, ''), rawAnswer: raw || null, match: match.kind, suggestion: match.answer.answer};
  }
  return {...outcome(prompt, index.exact, ''), rawAnswer: raw || null, match: match.kind};
}
