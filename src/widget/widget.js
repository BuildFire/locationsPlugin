import buildfire from 'buildfire';
import WidgetController from './widget.controller';

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
  container.innerHTML = introductoryLocations.reduce((c, n) => (`${c !== 0 ? c : ''} <div class="mdc-ripple-surface pointer location-item">
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
      </div>`), 0);
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

  const chipSets = document.querySelectorAll('.mdc-chip-set');
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

const showFilterOverlay = () => {
  if (Object.keys(filterElements).length === 0) {
    const container = document.querySelector('.expansion-panel__container .accordion');
    let html = '';
    CATEGORIES.forEach((category) => {
      filterElements[category.id] = [];
      html += `<div class="expansion-panel" data-cid="${category.id}">
        <button class="expansion-panel-header mdc-ripple-surface">
          <div class="expansion-panel-header-content">
            <span class="expansion-panel-title">
              <i class="material-icons-outlined mdc-text-field__icon" tabindex="0" role="button">fmd_good</i>
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
          <div class="mdc-chip-set mdc-chip-set--filter margin-top-fifteen expansion-panel-body-content" role="grid">
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
  }
  document.querySelector('section#filter').classList.add('overlay');
  document.querySelector('section.active').classList.remove('active');
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
    }

    if (e.target.id === 'filterIconBtn') {
      showFilterOverlay();
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

const initHomePage = () => {
  const { showIntroductoryListView, introductoryListView } = settings;
  injectTemplate('home');
  fetchCategories(() => {

    console.log('CATEGORIES: ', CATEGORIES)
    fetchIntroductoryLocations(() => {
      if (showIntroductoryListView) {
        refreshIntroductoryCarousel();
        renderLocations();
        refreshQuickFilter();
        refreshIntroductoryDescription();

        if (introductoryListView.images.length === 0
          && introductoryLocations.length === 0
          && !introductoryListView.description) {
          showElement('div.empty-page');
        }

        // eslint-disable-next-line no-new
        new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));
      }
    });
  });
};

const init = () => {
  fetchTemplate('filter', injectTemplate);
  fetchTemplate('home', initHomePage);

  initEventListeners();

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


class Accordion {
  constructor({ element, active = null, multi = false }) {
    this.el = element;
    this.activePanel = active;
    this.multi = multi;

    this.init();
  }

  cacheDOM() {
    this.panels = this.el.querySelectorAll(".expansion-panel");
    this.headers = this.el.querySelectorAll(".expansion-panel-header");
    this.bodies = this.el.querySelectorAll(".expansion-panel-body");
  }

  init() {
    this.cacheDOM();
    this.setSize();
    this.initialExpand();
    this.attachEvents();
  }

  // Remove "active" class from all expansion panels.
  collapseAll() {
    for (const h of this.headers) {
      h.closest(".expansion-panel").classList.remove("active");
    }
  }

  // Add "active" class to the parent expansion panel.
  expand(idx) {
    this.panels[idx].classList.add("active");
  }

  // Toggle "active" class to the parent expansion panel.
  toggle(idx) {
    this.panels[idx].classList.toggle("active");
  }

  // Get the height of each panel body and store it in attribute
  // for the CSS transition.
  setSize() {
    this.bodies.forEach((b, idx) => {
      const bound = b
        .querySelector(".expansion-panel-body-content")
        .getBoundingClientRect();
      b.setAttribute("style", `--ht:${bound.height}px`);
    });
  }

  initialExpand() {
    if (this.activePanel > 0 && this.activePanel < this.panels.length) {
      // Add the "active" class to the correct panel
      this.panels[this.activePanel - 1].classList.add("active");
      // Fix the current active panel index "zero based index"
      this.activePanel = this.activePanel - 1;
    }
  }

  attachEvents() {
    this.headers.forEach((h, idx) => {
      h.addEventListener('click', (e) => {
        if (e.target.classList.contains('mdc-checkbox__native-control')) return;
        if (!this.multi) {
          // Check if there is an active panel and close it before opening another one.
          // If there is no active panel, close all the panels.
          if (this.activePanel === idx) {
            this.collapseAll();
            this.activePanel = null;
          } else {
            this.collapseAll();
            this.expand(idx);
            this.activePanel = idx;
          }
        } else {
          this.toggle(idx);
        }
      });
    });

    // Recalculate the panel body height and store it on resizing the window.
    addEventListener("resize", this.setSize.bind(this));
  }
}


setTimeout(() => {
  /**
   *    1- Checkbox click
   *        a- if is checked uncheck all
   *        b- if is not checked check them all
   *    2- Chip click
   *       a- if there is difference then intermediate
   *       b- if all are checked then check the box
   *       c- if all are unchecked then uncheck the box
   */
  showFilterOverlay();


  const myAccordion = new Accordion({
    element: document.querySelector(".accordion"),
    active: 2,
    multi: true
  });

  const chipSets = document.querySelectorAll('.mdc-chip-set');
  Array.from(chipSets).forEach((c) => new mdc.chips.MDCChipSet(c));

  const checkbox = document.querySelectorAll('.mdc-checkbox input');

  Array.from(checkbox).forEach((c) => c.addEventListener('change', (e) => {
    const el = e.target;
    const parent = el.closest('div.expansion-panel');
    const categoryId = parent.dataset.cid;
    const chips = parent.querySelectorAll('.expansion-panel-body .mdc-chip');
    if (!el.checked) {
      filterElements[categoryId] = [];
    }
    Array.from(chips).forEach((c) => {
      if (el.checked) {
        if (!filterElements[categoryId].includes(c.dataset.sid)) {
          filterElements[categoryId].push(c.dataset.sid);
        }
        c.classList.add('mdc-chip--selected');
      } else {
        c.classList.remove('mdc-chip--selected');
      }
    });
  }));

  const subcategoriesChips = document.querySelectorAll('.mdc-chip');
  Array.from(subcategoriesChips).forEach((c) => c.addEventListener('click', (e) => {
    const { target } = e;
    const subcategory = target.closest('.mdc-chip');
    const chipCheckbox = target.closest('.mdc-chip__primary-action');
    const isChecked = chipCheckbox.getAttribute('aria-checked') === 'true';
    const parent = target.closest('div.expansion-panel');
    const categoryId = parent.dataset.cid;
    const subcategoryId = subcategory.dataset.sid;
    const category = CATEGORIES.find((c) => c.id === categoryId);

    if (isChecked && !filterElements[categoryId].includes(subcategoryId)) {
      filterElements[categoryId].push(subcategoryId);
    } else {
      filterElements[categoryId] = filterElements[categoryId].filter((item) => item !== subcategoryId);
    }

    console.log('filterElements: ', filterElements);
    console.log('category: ', category);

    const input = parent.querySelector('.mdc-checkbox__native-control');

    if (filterElements[categoryId].length === 0) {
      input.indeterminate = false;
      input.checked = false;
    } else if (filterElements[categoryId].length === category.subcategories.length) {
      input.indeterminate = false;
      input.checked = true;
    } else {
      input.indeterminate = true;
    }
  }));
}, 2500);
