import isObject from 'lodash.isobject';
import forEach from 'lodash.foreach';
import state from '../state';

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


export const transformCategoriesToText = (categories) => {
  if (!categories.main.length) {
    return '--';
  }
  const subCategories = state.categories.map((cat) => cat.subcategories).flat();
  const mainCategoriesTitles = [];
  const subCategoriesTitles = [];
  categories.main.forEach((c) => {
    const item = state.categories.find((p) => p.id === c);
    if (item) mainCategoriesTitles.push(item.title);
  });
  categories.subcategories.forEach((c) => {
    const item = subCategories.find((p) => p.id === c);
    if (item) subCategoriesTitles.push(item.title);
  });
  return mainCategoriesTitles.length > 1
    ? categories.main.join(', ')
    : `${mainCategoriesTitles[0]}${subCategoriesTitles.length ? ` | ${subCategoriesTitles.join(', ')}` : ''}`;
};
