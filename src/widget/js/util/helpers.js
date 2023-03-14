import isObject from 'lodash.isobject';
import forEach from 'lodash.foreach';
import { convertTimeToDate, getCurrentDayName, openingNowDate } from '../../../utils/datetime';
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

export const transformCategoriesToText = (locationCategories, categories) => {
  let text = '';
  if (!locationCategories.main.length) {
    return text;
  }
  const subCategories = categories.map((cat) => cat.subcategories).flat();
  const mainCategoriesTitles = [];
  const subCategoriesTitles = [];
  locationCategories.main.forEach((c) => {
    const item = categories.find((p) => p.id === c);
    if (item) mainCategoriesTitles.push(item.title);
  });
  locationCategories.subcategories.forEach((c) => {
    const item = subCategories.find((p) => p.id === c);
    if (item) subCategoriesTitles.push(item.title);
  });

  if (mainCategoriesTitles.length > 1) {
    text = mainCategoriesTitles.join(', ');
  } else {
    text = `${mainCategoriesTitles[0]}${subCategoriesTitles.length ? ` | ${subCategoriesTitles.join(', ')}` : ''}`;
  }

  if (text.length > 30) text = text.slice(0, 30).concat('...');
  return text;
};

export const cdnImage = (imageUrl) => {
  const { cloudImageHost } = buildfire.getContext().endPoints;
  return `${cloudImageHost}/${imageUrl}`;
};

export const generateUUID = () => {
  let dt = new Date().getTime();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const replace = (dt + Math.random() * 16) % 16 | 0;
    dt = Math.floor(dt / 16);
    return (c === "x" ? replace : (replace & 0x3) | 0x8).toString(16);
  });
};

export const getDefaultOpeningHours = () => {
  const intervals = [{ from: convertTimeToDate("08:00"), to: convertTimeToDate("20:00") }];
  return {
    days: {
      monday: {index: 0, active: true, intervals: [...intervals]},
      tuesday: {index: 1, active: true, intervals: [...intervals]},
      wednesday: {index: 2, active: true, intervals: [...intervals]},
      thursday: {index: 3, active: true, intervals: [...intervals]},
      friday: {index: 4, active: true, intervals: [...intervals]},
      saturday: {index: 5, active: true, intervals: [...intervals]},
      sunday: {index: 6, active: true, intervals: [...intervals]},
    }
  }
};

export const createTemplate = (templateId) => {
  const template = document.getElementById(`${templateId}`);
  return document.importNode(template.content, true);
};

export const showToastMessage = (message, duration = 3000) => {
  buildfire.dialog.toast({ message: window.strings.get(`toast.${message}`).v, duration });
};

export const addBreadcrumb = ({ pageName, label }, showLabel = true) => {
  if (state.breadcrumbs.length && state.breadcrumbs[state.breadcrumbs.length - 1].name === pageName) {
    return;
  }
  state.breadcrumbs.push({ name: pageName });
  buildfire.history.push(label, {
    showLabelInTitlebar: false
  });
};

export const getActiveTemplate = () => getComputedStyle(document.querySelector('section#listing'), null).display !== 'none' ? 'listing' : 'intro';

export const cropImage = (url, options) => {
  if (!url) {
    return '';
  }
  return buildfire.imageLib.cropImage(url, options);
};

export const isLocationOpen = (location) => {
  let isOpen = false;
  const today = location.openingHours.days[getCurrentDayName()];
  const now = openingNowDate();

  if (today.active) {
    const interval = today.intervals.find((i) => (new Date(i.from) <= now) && (new Date(i.to) > now));
    if (interval) isOpen = true;
  }
  return isOpen;
};

