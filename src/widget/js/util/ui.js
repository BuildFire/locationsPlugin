import state from '../state';
import { addBreadcrumb } from './helpers';

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
  const {
    design,
    filter,
    sorting,
    bookmarks
  } = state.settings;
  const mainMapContainer = document.querySelector('#mainMapContainer');
  const mapCenterBtn = document.querySelector('#mapCenterBtn');

  let baseMapHeight = 164;
  let baseCenterBtnBottom = 120;

  if (!design.hideQuickFilter || filter.allowFilterByArea) {
    baseMapHeight += 46;
    baseCenterBtnBottom -= 10;
  }

  if (sorting.hideSorting && filter.hidePriceFilter && filter.hideOpeningHoursFilter && (!bookmarks.enabled || !bookmarks.allowForFilters)) {
    baseMapHeight -= 36;
    baseCenterBtnBottom -= 30;
  }

  mainMapContainer.style.height = `calc(100vh - ${baseMapHeight}px)`;
  mapCenterBtn.style.bottom = `${baseCenterBtnBottom}px`;
};

export const navigateTo = (template) => {
  const currentActive = document.querySelector('section.active');
  currentActive?.classList.remove('active');
  document.querySelector(`section#${template}`).classList.add('active');
  if (template === 'home' && state.breadcrumbs.length) {
    addBreadcrumb({ pageName: 'home', title: 'Home' }, false);
  }
  if (template === "home") {
    if (document.querySelector(`section#${template} > #listing`).style.display === "none")
      buildfire.components.swipeableDrawer.hide()
    else buildfire.components.swipeableDrawer.show();
  } else buildfire.components.swipeableDrawer.hide();
};

export const resetBodyScroll = () => { document.querySelector('body').scrollTop = 0; };

export const hideOverlays = () => { document.querySelector('section.overlay')?.classList.remove('overlay'); };
