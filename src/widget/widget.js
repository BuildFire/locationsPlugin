import buildfire from 'buildfire';
import WidgetController from './widget.controller';

const templates = {};

/** template management start */
const fetchTemplate = (template, done) => {
  if (templates[template]) {
    console.warn(`template ${template} already exist.`);
    return;
  }

  const xhr = new XMLHttpRequest();
  xhr.onload = () => {
    const content = xhr.responseText;
    templates[template] = new DOMParser().parseFromString(content, 'text/html');
    done();
  };
  xhr.onerror = () => {
    console.error(`fetching template ${template} failed.`);
  };
  xhr.open('GET', `./templates/${template}.html`);
  xhr.send(null);
};

const injectTemplate = (template) => {
  if (!templates[template]) {
    console.warn(`template ${template} not found.`);
    return;
  }
  const createTemplate = document.importNode(templates[template].querySelector('template').content, true);
  document.querySelector(`#${template}`).appendChild(createTemplate);
};
/** template management end */

const searchLocations = () => {};

/** ui helpers start */
const showElement = (selector) => {
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
const hidElement = (selector) => {
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
/** ui helpers end */

const init = () => {
  injectTemplate('home');

  document.addEventListener('focus', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchTextField') {
      showElement('#areaSearchLabel');
      hidElement('.header-qf');
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchLocationsBtn') {
      searchLocations(e);
    }
  });

  const carousel = new buildfire.components.carousel.view('.carousel');
  const carouselItems = [
    {
      iconUrl: "https://placeimg.com/800/400",
    },
    {
      iconUrl: "https://placeimg.com/800/400",
    },
    {
      iconUrl: "https://placeimg.com/800/400",
    },
  ];
  carousel.loadItems(carouselItems);

  document.querySelector('.intro-details').innerHTML = `<h2 style="text-align: center;">Introduction to TinyMCE!</h2>`;

  const chipSets = document.querySelectorAll('.mdc-chip-set');
  Array.from(chipSets).forEach((c) => new mdc.chips.MDCChipSet(c));

  const fabRipple = new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));

  buildfire.appearance.getAppTheme((err, appTheme) => {
    if (err) return console.error(err);
    const root = document.documentElement;
    const { colors } = appTheme;
    root.style.setProperty('--body-theme', colors.bodyText);
  });
};

fetchTemplate('home', init);
