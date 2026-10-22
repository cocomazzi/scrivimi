/* Shared, deterministic merge rules. This file also runs under node for tests. */
(function (root) {
  'use strict';
  const keys = ['italiano-famiglia-vocaboli-v1', 'italiano-famiglia-testi-v2', 'parliamo-immagini-risposte-v1'];
  const equal = (a, b) => stable(a) === stable(b);
  function stable(value) {
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function decode(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid-payload');
    const result = {};
    keys.forEach((k, i) => {
      if (!Object.hasOwn(payload, k)) { result[k] = i ? {} : []; return; }
      if (typeof payload[k] !== 'string') throw new Error('invalid-payload');
      const v = JSON.parse(payload[k]);
      if (!i) {
        if (!Array.isArray(v) || !v.every(row => Array.isArray(row) && row.length === 2 && row.every(x => typeof x === 'string'))) throw new Error('invalid-payload');
      } else {
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('invalid-payload');
        if (!Object.values(v).every(x => typeof x === 'string' || (i === 1 && Array.isArray(x) && x.every(y => typeof y === 'string')))) throw new Error('invalid-payload');
      }
      result[k] = v;
    });
    return result;
  }
  function merge(basePayload, localPayload, remotePayload) {
    const base = decode(basePayload), local = decode(localPayload), remote = decode(remotePayload), conflicts = [];
    function value(b, l, r, path, atomic = false) {
      if (equal(l, r) || equal(b, r)) return l;
      if (equal(b, l)) return r;
      const object = x => x && typeof x === 'object' && !Array.isArray(x);
      if (!atomic && object(l) && object(r) && (b === undefined || object(b))) {
        const out = Object.create(null);
        new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)]).forEach(k => {
          const v = value(b?.[k], Object.hasOwn(l, k) ? l[k] : undefined, Object.hasOwn(r, k) ? r[k] : undefined, path + '.' + k);
          if (v !== undefined) out[k] = v;
        });
        return out;
      }
      if (!atomic && Array.isArray(l) && Array.isArray(r) && (b === undefined || Array.isArray(b))) {
        return Array.from({length: Math.max(b?.length || 0, l.length, r.length)}, (_, i) => value(b?.[i], l[i], r[i], path + '.' + i) ?? '');
      }
      conflicts.push(path); return l;
    }
    const payload = {...remotePayload}; // Preserve fields written by older/future clients.
    keys.forEach((k, i) => { payload[k] = JSON.stringify(value(base[k], local[k], remote[k], k, i === 0)); });
    return {payload, conflicts};
  }
  const api = {keys, equal, decode, merge};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScrivimiSync = api;
})(globalThis);
