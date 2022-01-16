import isObject from 'lodash.isobject';
import forEach from 'lodash.foreach';

export const deepObjectDiff = (a, b, reversible) => {
  const r = {};
  _deepDiff(a, b, r, reversible);
  if (reversible) _deepDiff(b, a, r, reversible);
  return r;
};

const _deepDiff = (a, b, r, reversible) => {
  forEach(a, (v, k) => {
    // already checked this or equal...
    if (r.hasOwnProperty(k) || b[k] === v) return;
    // but what if it returns an empty object? still attach?
    r[k] = isObject(v) ? deepObjectDiff(v, b[k], reversible) : v;
  });
};
