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
  } = state.settings;
  const mainMapContainer = document.querySelector('#mainMapContainer');

  let baseMapHeight = 210;

  if (design.hideQuickFilter && !filter.allowFilterByArea) {
    baseMapHeight = 160;
  }
  

  mainMapContainer.style.height = `calc(100vh - ${baseMapHeight}px)`;
};

export const navigateTo = (template) => {
  const currentActive = document.querySelector('section.active');
  currentActive?.classList.remove('active');
  document.querySelector(`section#${template}`).classList.add('active');
  if (template === 'home' && state.breadcrumbs.length) {
    addBreadcrumb({ pageName: 'home', title: 'Home' }, false);
  }
  buildfire.components.swipeableDrawer.hide();

  if (template === "home" && document.querySelector('section#intro').style.display === "none") {
    buildfire.components.swipeableDrawer.show();
  }
};

export const resetBodyScroll = () => { document.querySelector('body').scrollTop = 0; };

export const hideOverlays = () => { document.querySelector('section.overlay')?.classList.remove('overlay'); };
