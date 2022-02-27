import state from '../state';

export const showElement = (selector) => {
  let element = selector;
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }

  if (!element || !(element instanceof Element) || !element.style) {
    console.warn(`invalid selector ${selector}.`);
  } else {
    element.style.display = 'block';
  }
};

export const hideElement = (selector) => {
  let element = selector;
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }

  if (!element || !(element instanceof Element) || !element.style) {
    console.warn(`invalid selector ${selector}.`);
  } else {
    element.style.display = 'none';
  }
};

export const toggleDropdownMenu = (element) => {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  const menu = new mdc.menu.MDCMenu(element);
  menu.open = true;
};

export const adjustMapHeight = () => {
  const { design, filter, sorting } = state.settings;
  const mainMapContainer = document.querySelector('#mainMapContainer');
  const mapCenterBtn = document.querySelector('#mapCenterBtn');
  const headerHasOptions = (!sorting.hideSorting || !filter.hidePriceFilter || !filter.hideOpeningHoursFilter);

  let baseMapHeight = 164;
  let baseCenterBtnBottom = 120;

  if (!design.hideQuickFilter || filter.allowFilterByArea) {
    baseMapHeight += 46;
    baseCenterBtnBottom -= 10;
  }

  if (sorting.hideSorting && filter.hidePriceFilter && filter.hideOpeningHoursFilter) {
    baseMapHeight -= 36;
    baseCenterBtnBottom -= 30;
  }

  if (!headerHasOptions && document.querySelector('html').getAttribute('safe-area') === 'true') {
    baseMapHeight += 20;
    baseCenterBtnBottom += 20;
  }

  mainMapContainer.style.height = `calc(100vh - ${baseMapHeight}px)`;
  mapCenterBtn.style.bottom = `${baseCenterBtnBottom}px`;
};
