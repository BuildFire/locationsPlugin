import buildfire from 'buildfire';
import WidgetController from './widget.controller';
import Accordion from './js/Accordion';

// todo tmp
import Settings from '../entities/Settings';
const settings = new Settings().toJSON();
console.log('current settings...', settings);
import Categories from '../repository/Categories';
import DataMocks from '../DataMocks';

const inst = DataMocks.generate('LOCATION')[0];

let CATEGORIES;
let introductoryLocations = [];
let filterElements = {};

// todo to be removed
const testingFn = () => {
  settings.showIntroductoryListView = true;
  if (settings.introductoryListView.images.length === 0) {
    settings.introductoryListView.images = [
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
  }

  if (!settings.introductoryListView.description) {
    settings.introductoryListView.description = '<h2 style="text-align: center;">Introduction to TinyMCE!</h2>';
  }
};

testingFn();

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
    done(template);
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
const hideElement = (selector) => {
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

const fetchCategories = (done) => {
  WidgetController
    .searchCategories({
      sort: { title: -1 }
    })
    .then((result) => {
      // todo make sure data is parsed correctly
      CATEGORIES = result;
      done();
    })
    .catch((err) => {
      console.error('search error: ', err);
    });
};

const renderLocations = (selector) => {
  const container = document.querySelector('#introLocationsList');
  container.innerHTML = introductoryLocations.map((n) => (`<div class="mdc-ripple-surface pointer location-item">
        <div class="d-flex">
          <img src="https://placekitten.com/200/300" alt="Location image">
          <div class="location-item__description">
            <p>${n.title}</p>
            <p class="mdc-theme--text-body">${n.subtitle}</p>
            <p class="mdc-theme--text-body">${n.address}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background" tabindex="0" role="button">star_outline</i>
            <p class="mdc-theme--text-body">1 mi</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Call</span>
                </span>
              </span>
          </div>
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Send Email</span>
                </span>
              </span>
          </div>
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Reservation</span>
                </span>
              </span>
          </div>
        </div>
      </div>`)).join('\n');
};
const renderListingLocations = () => {
  const container = document.querySelector('#listingLocationsList');
  container.innerHTML = introductoryLocations.map((n) => (`<div class="mdc-ripple-surface pointer location-item">
        <div class="d-flex">
          <img src="https://placekitten.com/200/300" alt="Location image">
          <div class="location-item__description">
            <p>${n.title}</p>
            <p class="mdc-theme--text-body">${n.subtitle}</p>
            <p class="mdc-theme--text-body">${n.address}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background" tabindex="0" role="button">star_outline</i>
            <p class="mdc-theme--text-body">1 mi</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Call</span>
                </span>
              </span>
          </div>
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Send Email</span>
                </span>
              </span>
          </div>
          <div class="mdc-chip" role="row">
            <div class="mdc-chip__ripple"></div>
            <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">Reservation</span>
                </span>
              </span>
          </div>
        </div>
      </div>`)).join('\n');
};

const fetchIntroductoryLocations = (done) => {
  WidgetController
    .searchLocations({
      sort: { title: -1 }
    })
    .then((result) => {
      introductoryLocations = result.map((l) => ({ id: l.id, ...l.data }));
      done();
    })
    .catch((err) => {
      console.error('search error: ', err);
    });
};

const refreshQuickFilter = () => {
  const quickFilterItems = CATEGORIES.slice(0, 10);
  const container = document.querySelector('.header-qf');

  container.innerHTML = quickFilterItems.reduce((c, n) => (`${c !== 0 ? c : ''} <div class="mdc-chip" role="row">
        <div class="mdc-chip__ripple"></div>
        <i class="material-icons-outlined mdc-chip__icon mdc-chip__icon--leading">fmd_good</i>
        <span class="mdc-chip__checkmark"> <svg class="mdc-chip__checkmark-svg" viewBox="-2 -3 30 30">
          <path class="mdc-chip__checkmark-path" fill="none" stroke="black" d="M1.73,12.91 8.1,19.28 22.79,4.59" /> </svg>
        </span>
        <span role="gridcell">
          <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
            <span class="mdc-chip__text">${n.title}</span>
          </span>
        </span>
      </div>`), 0);

  const chipSets = document.querySelectorAll('#home .mdc-chip-set');
  Array.from(chipSets).forEach((c) => new mdc.chips.MDCChipSet(c));
};

const refreshIntroductoryDescription = () => {
  if (settings.introductoryListView.description) {
    const container = document.querySelector('.intro-details');
    container.innerHTML = `<h2 style="text-align: center;">Introduction to TinyMCE!</h2>`;
  }
};

const refreshIntroductoryCarousel = () => {
  const { introductoryListView } = settings;
  if (introductoryListView.images.length > 0) {
    const carousel = new buildfire.components.carousel.view('.carousel');
    const carouselItems = introductoryListView.images;
    carousel.loadItems(carouselItems);
  }
};

const toggleFilterOverlay = () => {
  const filterOverlay = document.querySelector('section#filter');
  const homeView = document.querySelector('section#home');

  if (filterOverlay.classList.contains('overlay')) {
    homeView.classList.add('active');
    filterOverlay.classList.remove('overlay');
  } else {
    filterOverlay.classList.add('overlay');
    homeView.classList.remove('active');
    buildfire.history.push('Advanced Filter', {
      showLabelInTitlebar: true
    });
  }
};
const initDrawer = () => {
  const element = document.querySelector('.drawer');
  const resizer = document.querySelector('.drawer .resizer');
  const screenHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  const lowerMargin = 100;
  const upperMargin = 125;
  let originalHeight = 0;
  let originalY = 0;
  let originalMouseY = 0;

  const resize = (e) => {
    const height = originalHeight - (e.pageY - originalMouseY);
    if (height > lowerMargin && height < (screenHeight - upperMargin)) {
      console.log('resize called in if');
      element.style.height = `${height}px`;
      element.style.top = `${originalY + (e.pageY - originalMouseY)}px`;
    }
  };
  const stopResize = () => {
    document.removeEventListener('mousemove', resize);
  };
  const stopTouchResize = () => {
    document.removeEventListener('touchmove', resize);
  };

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
    originalY = element.getBoundingClientRect().top;
    originalMouseY = e.pageY;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
  });

  resizer.addEventListener('touchstart', (e) => {
    e.preventDefault();
    originalHeight = parseFloat(getComputedStyle(element, null).getPropertyValue('height').replace('px', ''));
    originalY = element.getBoundingClientRect().top;
    originalMouseY = e.pageY;
    document.addEventListener('touchmove', resize);
    document.addEventListener('touchend', stopTouchResize);
  });
};
const initEventListeners = () => {
  document.addEventListener('focus', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchTextField') {
      showElement('#areaSearchLabel');
      hideElement('.header-qf');
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchLocationsBtn') {
      searchLocations(e);
    } else if (e.target.id === 'filterIconBtn') {
      toggleFilterOverlay();
    } else if (e.target.id === 'showMapView') {
      showMapView();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!e.target) return;

    const keyCode = e.which || e.keyCode;

    if (keyCode === 13 && e.target.id === 'searchTextField') {
      searchLocations(e);
    }
  });
};

const initFilterOverlay = () => {
  if (Object.keys(filterElements).length > 0) {
    return;
  }

  let html = '';
  const container = document.querySelector('.expansion-panel__container .accordion');
  console.log('categories: ', CATEGORIES)
  CATEGORIES.forEach((category) => {
    filterElements[category.id] = [];
    html += `<div class="expansion-panel" data-cid="${category.id}">
        <button class="expansion-panel-header mdc-ripple-surface">
          <div class="expansion-panel-header-content">
            <span class="expansion-panel-title">
            
            <i class="glyphicon glyph-icon glyphicon-book"></i>
              ${category.title}
            </span>
            <div class="expansion-panel-actions margin-right-ten">
              <div class="mdc-touch-target-wrapper">
                <div class="mdc-checkbox mdc-checkbox--touch">
                  <input type="checkbox"
                         class="mdc-checkbox__native-control"
                         id="checkbox-1"/>
                  <div class="mdc-checkbox__background">
                    <svg class="mdc-checkbox__checkmark mdc-theme--on-primary"
                         viewBox="0 0 24 24">
                      <path class="mdc-checkbox__checkmark-path"
                            fill="none"
                            d="M1.73,12.91 8.1,19.28 22.79,4.59"/>
                    </svg>
                    <div class="mdc-checkbox__mixedmark"></div>
                  </div>
                  <div class="mdc-checkbox__ripple"></div>
                </div>
              </div>
              <div class="expansion-panel-indicator"></div>
            </div>
          </div>
        </button>
        <div class="expansion-panel-body">
          <div class="mdc-chip-set mdc-chip-set--filter expansion-panel-body-content" role="grid">
          ${category.subcategories.map((subcategory) => `<div class="mdc-chip" role="row" data-sid="${subcategory.id}">
              <div class="mdc-chip__ripple"></div>
              <i class="material-icons-outlined mdc-chip__icon mdc-chip__icon--leading">fmd_good</i>
              <span class="mdc-chip__checkmark">
                <svg class="mdc-chip__checkmark-svg" viewBox="-2 -3 30 30">
                  <path class="mdc-chip__checkmark-path" fill="none" stroke="black" d="M1.73,12.91 8.1,19.28 22.79,4.59" /> </svg>
              </span>
              <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">${subcategory.title}</span>
                </span>
              </span>
            </div>`).join('\n')}
        </div>
      </div>
      </div>`;
  });
  container.innerHTML = html;

  new Accordion({
    element: document.querySelector('.accordion'),
    multi: true
  });

  const chipSets = document.querySelectorAll('#filter .mdc-chip-set');
  Array.from(chipSets).forEach((c) => new mdc.chips.MDCChipSet(c));

  const expansionPanelCheckBox = document.querySelectorAll('.mdc-checkbox input');
  Array.from(expansionPanelCheckBox).forEach((c) => c.addEventListener('change', (e) => {
    const { target } = e;
    const mdcCheckBox = target.closest('.mdc-checkbox');
    const parent = target.closest('div.expansion-panel');
    const categoryId = parent.dataset.cid;
    const chips = parent.querySelectorAll('.expansion-panel-body .mdc-chip');
    if (!target.checked) {
      filterElements[categoryId] = [];
    }
    Array.from(chips).forEach((c) => {
      if (target.checked) {
        if (!filterElements[categoryId].includes(c.dataset.sid)) {
          filterElements[categoryId].push(c.dataset.sid);
        }
        c.classList.add('mdc-chip--selected');
      } else {
        c.classList.remove('mdc-chip--selected');
      }
    });

    target.disabled = true;
    mdcCheckBox.classList.add('mdc-checkbox--disabled');
    setTimeout(() => {
      target.disabled = false;
      mdcCheckBox.classList.remove('mdc-checkbox--disabled');
    }, 500);
  }));

  const subcategoriesChips = document.querySelectorAll('.mdc-chip');
  Array.from(subcategoriesChips).forEach((c) => c.addEventListener('click', (e) => {
    const { target } = e;
    const mdcChip = target.closest('.mdc-chip');

    if (mdcChip.classList.contains('disabled')) {
      return;
    }

    const parent = target.closest('div.expansion-panel');
    const input = parent.querySelector('.mdc-checkbox__native-control');
    const chipCheckbox = mdcChip.querySelector('.mdc-chip__primary-action');
    const selected = chipCheckbox.getAttribute('aria-checked') === 'true';
    const categoryId = parent.dataset.cid;
    const subcategoryId = mdcChip.dataset.sid;
    const category = CATEGORIES.find((c) => c.id === categoryId);

    if (selected && !filterElements[categoryId].includes(subcategoryId)) {
      filterElements[categoryId].push(subcategoryId);
    } else {
      filterElements[categoryId] = filterElements[categoryId].filter((item) => item !== subcategoryId);
    }

    input.indeterminate = false;
    if (filterElements[categoryId].length === 0) {
      input.checked = false;
    } else if (filterElements[categoryId].length === category.subcategories.length) {
      input.checked = true;
    } else {
      input.indeterminate = true;
    }

    mdcChip.classList.add('disabled');
    setTimeout(() => mdcChip.classList.remove('disabled'), 500);
  }));
};

const showMapView = () => {
  hideElement('section#intro');
  showElement('section#listing');
  initDrawer();
  renderListingLocations();
};

const initHomeView = () => {
  const { showIntroductoryListView, introductoryListView } = settings;
  injectTemplate('home');
  fetchCategories(() => {
    initFilterOverlay();
    refreshQuickFilter(); // todo if quick filter enabled
    fetchIntroductoryLocations(() => {
      if (showIntroductoryListView) {
        renderLocations();
        refreshIntroductoryDescription();
        showElement('section#intro');
        refreshIntroductoryCarousel();

        if (introductoryListView.images.length === 0
          && introductoryLocations.length === 0
          && !introductoryListView.description) {
          showElement('div.empty-page');
        }

        // eslint-disable-next-line no-new
        new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));
      } else {
        showMapView();
      }
    });
  });
};

const init = () => {
  fetchTemplate('filter', injectTemplate);
  fetchTemplate('home', initHomeView);

  initEventListeners();

  buildfire.history.onPop((breadcrumb) => {
    console.log('Breadcrumb popped', breadcrumb);
    if (document.querySelector('section#filter').classList.contains('overlay')) {
      toggleFilterOverlay();
    }
  });

  buildfire.appearance.getAppTheme((err, appTheme) => {
    if (err) return console.error(err);
    const root = document.documentElement;
    const { colors } = appTheme;
    root.style.setProperty('--body-theme', colors.bodyText);
    root.style.setProperty('--background-color', colors.backgroundColor);
    root.style.setProperty('--primary-color', colors.primaryTheme);
  });
};

fetchSettings(init);
