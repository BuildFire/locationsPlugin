import buildfire from 'buildfire';
import WidgetController from './widget.controller';

// todo tmp
import Settings from '../entities/Settings';
const settings = new Settings().toJSON();

console.log('current settings...', settings);

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

const searchLocations = () => {
  console.log('search Locations triggered')
};

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
const hideELement = (selector) => {
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

const fetchSettings = (callback) => {
  setTimeout(() => {
    callback();
  }, 500);
};

const init = () => {
  const { showIntroductoryListView } = settings;

  fetchTemplate('home', () => {
    injectTemplate('home');

    document.addEventListener('focus', (e) => {
      if (!e.target) return;

      if (e.target.id === 'searchTextField') {
        showElement('#areaSearchLabel');
        hideELement('.header-qf');
      }
    }, true);

    document.addEventListener('click', (e) => {
      if (!e.target) return;

      if (e.target.id === 'searchLocationsBtn') {
        searchLocations(e);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!e.target) return;

      const keyCode = e.which || e.keyCode;

      if (keyCode === 13 && e.target.id === 'searchTextField') {
        searchLocations(e);
      }
    });

    if (showIntroductoryListView) {
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
    }
  });

  buildfire.appearance.getAppTheme((err, appTheme) => {
    if (err) return console.error(err);
    const root = document.documentElement;
    const { colors } = appTheme;
    root.style.setProperty('--body-theme', colors.bodyText);
  });
};

fetchSettings(init);
