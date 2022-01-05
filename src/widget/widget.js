import buildfire from 'buildfire';
import WidgetController from './widget.controller';
import Accordion from './js/Accordion';
import authManager from '../UserAccessControl/authManager';
import MainMap from './js/Map';
import drawer from './js/drawer';
import {openingNowDate, getCurrentDayName, convertDateToTime} from '../utils/datetime';

// if (templateSection.childNodes.length === 0) {
//   injectTemplate(template);
// }

let settings;
let CATEGORIES;
let userPosition;
let introductoryLocations = [];
let introductoryLocationsCount = 0;
let introductoryLocationsPending = false;
let currentIntroductoryPage = 0;
let filterElements = {};
let markerClusterer;
let selectedLocation;
let mainMap;
let currentLocation;
const criteria = {
  searchValue: '',
  openingNow: false,
  priceRange: null,
  sort: {
    sortBy: 'distance',
    order: 1
  },
  page: 0,
  pageSize: 50,
};
let listLocations = [];
let mapLocations = [];
let fetchingNextPage = false;
let fetchingEndReached = false;
let introCarousel;
let breadcrumbs = [];

if (!buildfire.components.carousel.view.prototype.clear) {
  buildfire.components.carousel.view.prototype.clear = function () {
    return this._removeAll();
  };
}

// todo to be removed
const testingFn = () => {
  settings.showIntroductoryListView = false;
  settings.design.listViewStyle = 'image';
  settings.design.detailsMapPosition = 'bottom'; // top or bottom
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

// testingFn();

const templates = {};

/** template management start */
const injectTemplate = (template) => {
  if (!templates[template]) {
    console.warn(`template ${template} not found.`);
    return;
  }
  const templateElement = document.querySelector(`#${template}`);
  const createTemplate = document.importNode(templates[template].querySelector('template').content, true);
  templateElement.innerHTML = '';
  templateElement.appendChild(createTemplate);
};

const fetchTemplate = (template, done) => {
  if (templates[template]) {
    console.warn(`template ${template} already exist.`);
    return done();
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
/** template management end */

let SEARCH_TIMEOUT;
const searchLocationsWithDelay = () => {
  clearTimeout(SEARCH_TIMEOUT);
  SEARCH_TIMEOUT = setTimeout(searchLocations, 300);
};

const searchLocations = (mapBounds) => {
  // add geo stage when search user location , area, open Now
  const pipelines = [];
  let pageIndex = criteria.page;
  const query = {};
  if (criteria.searchValue) {
    query["_buildfire.index.text"] = criteria.searchValue.toLowerCase();
  }

  // categories & subcategories filter
  const categoryIds = [];
  const subcategoryIds = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const key in filterElements) {
    if (filterElements[key].checked) {
      categoryIds.push(key);
      subcategoryIds.push(...filterElements[key].subcategories);
    }
  }
  if (categoryIds.length > 0 || subcategoryIds.length > 0 || criteria.priceRange) {
    const array1Index = [...categoryIds.map((id) => `c_${id}`), ...subcategoryIds.map((id) => `s_${id}`)];
    if (criteria.priceRange) {
      array1Index.push(`pr_${criteria.priceRange}`);
    }
    query["_buildfire.index.array1.string1"] = { $in: array1Index };
  }

  let $geoNear = null;
  if (currentLocation && !mapBounds) {
    $geoNear = {
      near: { type: "Point", coordinates: [currentLocation.lng, currentLocation.lat] },
      key: "_buildfire.geo",
      maxDistance: 10000,
      distanceField: "distance",
      query: { ...query }
    };
    pipelines.push({ $geoNear });
  } else {
    const $match = { ...query };
    /*
      mapBounds = [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
        [west, north]
      ]
    */
    if (mapBounds && Array.isArray(mapBounds)) {
      $match["_buildfire.geo"] =  {
        $geoWithin: {
          $geometry: {
            type : "Polygon",
            coordinates: [...mapBounds]
          }
        }
      };
      pageIndex = 0;
    }

    if (Object.keys($match).length === 0) {
      $match["_buildfire.index.string1"] = buildfire.getContext().instanceId;
    }
    pipelines.push({ $match });
  }

  if (criteria.openingNow) {
    const $match2 = {  };
    $match2[`openingHours.days.${getCurrentDayName()}.intervals`] = {
      $elemMatch: {
        from: { $lte: openingNowDate() },
        to: { $gt: openingNowDate() }
      }
    };
    $match2[`openingHours.days.${getCurrentDayName()}.active`] = true;
    pipelines.push({ $match: $match2 });
  }

  const $sort = {};
  if (criteria.sort) {
    if (criteria.sort.sortBy === 'distance' && !$geoNear) {
      $sort["_buildfire.index.text"] = 1;
    } else {
      $sort[criteria.sort.sortBy] = criteria.sort.order;
    }
    pipelines.push({ $sort });
  }

  return WidgetController.searchLocationsV2(pipelines, pageIndex).then((result) => {
    console.log(result);
    listLocations = listLocations.concat(result || []);
    fetchingNextPage = false;
    fetchingEndReached = result.length < criteria.pageSize;
    return result;
  }).catch(console.error);
};

const loadMoreLocations = () => {
  if (fetchingNextPage || fetchingEndReached) return;
  fetchingNextPage = true;
  criteria.page += 1;
  searchLocations();
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
  WidgetController
    .getAppSettings()
    .then((response) => {
      settings = response;
      console.log('settings: ', settings);
      callback();
    })
    .catch((err) => {
      console.error('error fetching settings: ', err);
      callback();
    });
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

const renderIntroductoryLocations = (list) => {
  const container = document.querySelector('#introLocationsList');
  const content = list.map((n) => (`<div class="mdc-ripple-surface pointer location-item" data-id=${n.id}>
        <div class="d-flex">
          <img src=${n.listImage} alt="Location image">
          <div class="location-item__description">
            <p class="mdc-theme--text-header">${n.title}</p>
            <p class="mdc-theme--text-body text-truncate">${n.subtitle}</p>
            <p class="mdc-theme--text-body text-truncate">${n.address}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background" tabindex="0" role="button" style="visibility: hidden;">star_outline</i>
            <p class="mdc-theme--text-body">${n.distance ? n.distance : '--'}</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">

         ${n.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip list-action-item" role="row" data-action-id="${a.id}">
              <div class="mdc-chip__ripple"></div>
              <span role="gridcell">
                  <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                    <span class="mdc-chip__text">${a.title}</span>
                  </span>
                </span>
            </div>`).join('\n')}
         ${n.actionItems.length > 3 ? '<span style="align-self: center; padding: 4px;">...</span>' : ''}
        </div>
      </div>`)).join('\n');
  container.insertAdjacentHTML('beforeend', content);
};
const renderListingLocations = (list) => {
  const container = document.querySelector('#listingLocationsList');
  if (settings.design.listViewStyle === 'backgroundImage') {
    container.innerHTML = list.map((n) => (`<div data-id="${n.id}" class="mdc-ripple-surface pointer location-image-item" style="background-image: linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(${n.images.length ? n.images[0].iconUrl : './images/default-location-cover.png'});">
            <div class="location-image-item__header">
              <p>${n.distance ? n.distance : '--'}</p>
              <i class="material-icons-outlined mdc-text-field__icon" tabindex="0" role="button" style="visibility: hidden;">star_outline</i>
            </div>
            <div class="location-image-item__body">
              <p class="margin-bottom-five">${n.title}</p>
              <p class="margin-top-zero">${transformCategories(n.categories)}</p>
              <p>
                <span>${n.subtitle}</span>
                <span>
                  <span>${n.price.currency?.repeat(n.price?.range)}</span>
                  <span style="margin-left: 10px;color: #91dba6;">Open Now</span>
                </span>
              </p>
            </div>
            <div class="mdc-chip-set" role="grid">
              ${n.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip" role="row" data-action-id="${a.id}">
                <div class="mdc-chip__ripple"></div>
                <span role="gridcell">
                    <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                      <span class="mdc-chip__text">${a.title}</span>
                    </span>
                  </span>
              </div>`).join('\n')}
              ${n.actionItems.length > 3 ? '<span style="align-self: center; padding: 4px;">...</span>' : ''}
            </div>
          </div>
`)).join('\n');
  } else {
    container.innerHTML = list.map((n) => (`<div class="mdc-ripple-surface pointer location-item" data-id="${n.id}">
        <div class="d-flex">
          <img src="${n.listImage}" alt="Location image">
          <div class="location-item__description">
            <p>${n.title}</p>
            <p class="mdc-theme--text-body">${n.subtitle}</p>
            <p class="mdc-theme--text-body">${n.address}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background" tabindex="0" role="button" style="visibility: hidden;">star_outline</i>
            <p class="mdc-theme--text-body">${n.distance ? n.distance : '--'}</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">
        
          ${n.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip" role="row" data-action-id="${a.id}">
            <div class="mdc-chip__ripple"></div>
              <span role="gridcell">
                <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                  <span class="mdc-chip__text">${a.title}</span>
                </span>
              </span>
            </div>`).join('\n')}
          ${n.actionItems.length > 3 ? '<span style="align-self: center; padding: 4px;">...</span>' : ''}
        </div>
      </div>`)).join('\n');
  }
};
const updateMapMarkers = (locations) => {
  locations.forEach((location) => mainMap.addMarker(location, handleMarkerClick));
};
const fetchIntroductoryLocations = (done) => {
  introductoryLocationsPending = true;
  WidgetController
    .searchLocations({ page: currentIntroductoryPage })
    .then((response) => {
      introductoryLocations = introductoryLocations.concat(response.result.map((r) => ({ ...r, ...{ distance: calculateLocationDistance(r.coordinates) } })));
      introductoryLocationsCount = response.totalRecord;
      introductoryLocationsPending = false;
      updateMapMarkers(introductoryLocations);
      done(null, introductoryLocations);
    })
    .catch((err) => {
      console.error('search error: ', err);
    });
};

const refreshQuickFilter = () => {
  const quickFilterItems = CATEGORIES.slice(0, 10);
  const container = document.querySelector('.header-qf');
  const advancedFilterBtn = document.querySelector('#filterIconBtn');

  if (quickFilterItems.length === 0) {
    container.innerHTML = '<small class="mdc-theme--text-body d-block text-center margin-top-five margin-bottom-five">No Categories Added</small>';
    advancedFilterBtn.classList.add('disabled');
    return;
  }

  container.innerHTML = quickFilterItems.map((n) => `<div class="mdc-chip" role="row">
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
      </div>`).join('\n');
  const chipSets = document.querySelectorAll('#home .mdc-chip-set');
  Array.from(chipSets).forEach((c) => new mdc.chips.MDCChipSet(c));
};

const refreshIntroductoryDescription = () => {
  if (settings.introductoryListView.description) {
    const container = document.querySelector('.intro-details');
    container.innerHTML = settings.introductoryListView.description;
  }
};

const refreshIntroductoryCarousel = () => {
  const { introductoryListView } = settings;
  if (introCarousel) {
    introCarousel.clear();
    introCarousel.append(introductoryListView.images);
  } else if (introductoryListView.images.length > 0) {
    introCarousel = new buildfire.components.carousel.view('.carousel');
    introCarousel.loadItems(introductoryListView.images);
  }
};

const hideFilterOverlay = () => {
  const filterOverlay = document.querySelector('section#filter');
  if (filterOverlay.classList.contains('overlay')) {
    filterOverlay.classList.remove('overlay');
  }
};

const addBreadcrumb = ({ pageName, label }, showLabel = true) => {
  if (breadcrumbs.length && breadcrumbs[breadcrumbs.length - 1].name === pageName) {
    return;
  }
  breadcrumbs.push({ name: pageName });
  buildfire.history.push(label, {
    showLabelInTitlebar: showLabel
  });
};
const showFilterOverlay = () => {
  const filterOverlay = document.querySelector('section#filter');
  const currentActive = document.querySelector('section.active');

  currentActive?.classList.remove('active');
  filterOverlay.classList.add('overlay');
  addBreadcrumb({ pageName: 'af', title: 'Advanced Filter' });
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
    addBreadcrumb({ pageName: 'af', title: 'Advanced Filter' });
  }
};
const toggleDropdownMenu = (element) => {
  if (typeof element === 'string') {
    element = document.querySelector(element);
  }
  const menu = new mdc.menu.MDCMenu(element);
  menu.open = true;
};

const transformCategories = (categories) => {
  const subCategories = CATEGORIES.map((cat) => cat.subcategories).flat();
  const mainCategoriesTitles = [];
  const subCategoriesTitles = [];
  categories.main.forEach((c) => {
    const item = CATEGORIES.find((p) => p.id === c);
    if (item) mainCategoriesTitles.push(item.title);
  });
  categories.subcategories.forEach((c) => {
    const item = subCategories.find((p) => p.id === c);
    if (item) subCategoriesTitles.push(item.title);
  });
  return mainCategoriesTitles.length > 1
    ? categories.main.join(', ')
    : `${mainCategoriesTitles[0]} | ${subCategoriesTitles.join(', ')}`;
};
const showLocationDetail = () => {
  fetchTemplate('detail', () => {
    injectTemplate('detail');
    const pageMapPosition = settings.design.detailsMapPosition;
    let selectors = {
      address: document.querySelector('.location-detail__address p:first-child'),
      distance: document.querySelector('.location-detail__address p:last-child'),
      carousel: document.querySelector('.location-detail__carousel'),
      actionItems: document.querySelector('.location-detail__actions'),
      description: document.querySelector('.location-detail__description'),
      rating: document.querySelector('.location-detail__rating')
    };

    if (pageMapPosition === 'top') {
      selectors = {
        ...selectors,
        ...{
          title: document.querySelector('.location-detail__top-header h1'),
          subtitle: document.querySelector('.location-detail__top-header h5'),
          categories: document.querySelector('.location-detail__top-subtitle p'),
          cover: document.querySelector('.location-detail__bottom-cover'),
          main: document.querySelector('.location-detail__top-view'),
          map: document.querySelector('.location-detail__map--top-view')
        }
      };
      selectors.main.style.display = 'block';
      selectors.rating.classList.add('location-detail__rating--single-shadow');
    } else {
      selectors = {
        ...selectors,
        ...{
          title: document.querySelector('.location-detail__cover h2'),
          subtitle: document.querySelector('.location-detail__cover h4'),
          categories: document.querySelector('.location-detail__cover p:first-child'),
          main: document.querySelector('.location-detail__cover'),
          map: document.querySelector('.location-detail__map')
        }
      };
      selectors.main.style.display = 'flex';
      selectors.rating.classList.add('location-detail__rating--dual-shadow');
    }

    if (selectedLocation.images.length > 0) {
      if (pageMapPosition === 'top') {
        selectors.cover.style.backgroundImage = `linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(${selectedLocation.images[0].imageUrl})`;
        selectors.cover.style.display = 'block';
      } else {
        selectors.main.style.backgroundImage = `linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(${selectedLocation.images[0].imageUrl})`;
      }
    }

    selectors.map.style.display = 'block';
    const detailMap = new google.maps.Map(selectors.map, {
      mapTypeControl: true,
      disableDefaultUI: true,
      center: { lat: selectedLocation.coordinates.lat, lng: selectedLocation.coordinates.lng },
      zoom: 14,
    });

    selectors.title.textContent = selectedLocation.title;
    selectors.subtitle.textContent = selectedLocation.subtitle;
    selectors.address.textContent = selectedLocation.formattedAddress;
    selectors.description.innerHTML = selectedLocation.description;
    selectors.distance.childNodes[0].nodeValue = selectedLocation.distance;

    if (settings.design?.showDetailsCategory) {
      selectors.categories.textContent = transformCategories(selectedLocation.categories);
      selectors.categories.style.display = 'block';
    }

    selectors.actionItems.innerHTML = selectedLocation.actionItems.map((a) => `<div class="action-item" data-id="${a.id}">
        <i class="material-icons-outlined mdc-text-field__icon" tabindex="0" role="button">call</i>
        <div class="mdc-chip" role="row">
          <div class="mdc-chip__ripple"></div>
          <span role="gridcell">
            <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
              <span class="mdc-chip__text">${a.title}</span>
            </span>
          </span>
        </div>
      </div>`).join('\n');
    selectors.carousel.innerHTML = selectedLocation.images.map((n) => `<div style="background-image: url(${n.imageUrl});" data-id="${n.id}"></div>`).join('\n');
    buildfire.components.ratingSystem.injectRatings();

    addBreadcrumb({ pageName: 'detail', title: 'Location Detail' });
    navigateTo('detail');
  });
};
const showWorkingHoursDrawer = () => {
  const { days } = selectedLocation.openingHours;
  buildfire.components.drawer.open(
    {
      header: 'Open Hours',
      content: `<table style="width: 100%;border-collapse: separate;border-spacing: 10px; border: none;">
      ${Object.entries(days).map(([day, prop]) => `<tr>
        <td style="vertical-align: top; font-weight: bold; text-transform: capitalize;">${day}</td>
        <td style="vertical-align: top;">
          ${!prop.active ? 'Closed' : prop.intervals.map((t, i) => `<p style="margin: ${i > 0 ? '10px 0 0' : '0'};">${convertDateToTime(t.from)} - ${convertDateToTime(t.to)}</p>`).join('\n')}
        </td>
      </tr>`).join('\n')}
    </table>`,
      isHTML: true,
      enableFilter: false
    }
  );
};

const chatWithOwner = () => {
  const { currentUser } = authManager;
  const users = [];

  if (!currentUser) {
    return console.warn('undefined currentUser');
  }
  users.push(selectedLocation.owner.userId);
  users.push(currentUser._id);
  buildfire.navigation.navigateToSocialWall(
    {
      title: selectedLocation.title,
      wallUserIds: users
    },
    (err, result) => {
      if (err) console.error(err);
    }
  );
};
const shareLocation = () => {
  buildfire.deeplink.generateUrl(
    {
      data: { locationId: selectedLocation.id },
    },
    (err, result) => {
      if (err) return console.error(err);
      buildfire.device.share({
        subject: selectedLocation.title,
        text: selectedLocation.title,
        link: result.url
      }, (err, result) => {
        if (err) console.error(err);
        if (result) console.log(result);
      });
    }
  );
};

const handleDetailActionItem = (e) => {
  const actionId = e.target.parentNode.dataset.id;
  const actionItem = selectedLocation.actionItems.find((a) => a.id === actionId);
  buildfire.actionItems.execute(
    actionItem,
    (err) => {
      if (err) {
        console.error(err);
      }
    }
  );
};
const handleListActionItem = (e) => {
  const actionItemId = e.target.dataset.actionId;
  const actionItem = introductoryLocations
    .reduce((prev, next) => prev.concat(next.actionItems), [])
    .find((entity) => entity.id === actionItemId);
  buildfire.actionItems.execute(
    actionItem,
    (err) => {
      if (err) {
        console.error(err);
      }
    }
  );
};
const fetchMoreIntroductoryLocations = (e) => {
  const listContainer = document.querySelector('section#intro');
  const activeTemplate = getComputedStyle(document.querySelector('section#listing'), null).display !== 'none' ? 'listing' : 'intro';

  if (activeTemplate === 'intro' && !introductoryLocationsPending && introductoryLocationsCount > introductoryLocations.length) {
    if (e.target.scrollTop + e.target.offsetHeight > listContainer.offsetHeight) {
      currentIntroductoryPage += 1;
      fetchIntroductoryLocations((err, result) => {
        renderIntroductoryLocations(result);
      });
    }
  }
};

const fetchMoreListLocations = (e) => {
  const listContainer = document.querySelector('#listingLocationsList');
  if (e.target.scrollTop + e.target.offsetHeight > listContainer.offsetHeight) {
    if (!introductoryLocationsPending && introductoryLocationsCount > introductoryLocations.length) {
      currentIntroductoryPage += 1;
      fetchIntroductoryLocations((err, result) => {
        renderListingLocations(result);
      });
    }
  };
};
const viewFullImage = (url) => {
  buildfire.imagePreviewer.show({ images: url.map((u) => u.imageUrl) });
};

const initEventListeners = () => {
  document.querySelector('body').addEventListener('scroll', fetchMoreIntroductoryLocations, false);
  document.querySelector('.drawer').addEventListener('scroll', fetchMoreListLocations, false);
  document.addEventListener('focus', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchTextField' && settings.filter.allowFilterByArea) {
      showElement('#areaSearchLabel');
      hideElement('.header-qf');
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchLocationsBtn') {
      criteria.searchValue = e.target.value;
      searchLocations();
    } else if (e.target.id === 'filterIconBtn') {
      toggleFilterOverlay();
    } else if (e.target.id === 'showMapView') {
      showMapView();
    } else if (['priceSortingBtn', 'otherSortingBtn'].includes(e.target.id)) {
      toggleDropdownMenu(e.target.nextElementSibling);
      const menu = new mdc.menu.MDCMenu(e.target.nextElementSibling);
      menu.listen('MDCMenu:selected', (event) => {
        const value = event.detail.item.getAttribute('data-value');
        if (e.target.id === 'priceSortingBtn') {
          criteria.priceRange = Number(value);
        } else if (e.target.id === 'otherSortingBtn') {
          if (value === 'distance') {
            criteria.sort = { sortBy: 'distance', order: 1 };
          } else if (value === 'A-Z') {
            criteria.sort = { sortBy: '_buildfire.index.text', order: 1 };
          } else if (value === 'Z-A') {
            criteria.sort = { sortBy: '_buildfire.index.text', order: -1 };
          }
        }
        searchLocationsWithDelay();
      });
    } else if (e.target.classList.contains('location-item') || e.target.classList.contains('location-image-item') || e.target.classList.contains('location-summary'))  {
      selectedLocation = introductoryLocations.find((i) => i.id === e.target.dataset.id);
      showLocationDetail();
    } else if (e.target.id === 'workingHoursBtn') {
      showWorkingHoursDrawer();
    } else if (e.target.id === 'chatWithOwnerBtn') {
      chatWithOwner();
    } else if (e.target.id === 'shareLocationBtn') {
      shareLocation();
    } else if (e.target.classList.contains('list-action-item') || e.target.dataset.actionId) {
      handleListActionItem(e);
    } else if (e.target.parentNode?.classList.contains('location-detail__carousel')) {
      viewFullImage(selectedLocation.images);
    } else if (e.target.parentNode?.classList.contains('action-item')) {
      handleDetailActionItem(e);
    } else if (e.target.id === 'mapCenterBtn') {
      if (mainMap && userPosition.latitude && userPosition.longitude) {
        mainMap.center({ lat: userPosition.latitude, lng: userPosition.longitude });
      }
    }
  }, false);

  document.addEventListener('keydown', (e) => {
    if (!e.target) return;

    const keyCode = e.which || e.keyCode;

    if (keyCode === 13 && e.target.id === 'searchTextField') {
      criteria.searchValue = e.target.value;
      searchLocations();
    }
  });

  const searchTextField = document.querySelector('#searchTextField');
  searchTextField.onkeyup = (e) => {
    criteria.searchValue = e.target.value;
    searchLocationsWithDelay();
  };

  const myCurrentLocationBtn = document.querySelector('#myCurrentLocationBtn');
  const areaSearchTextField = document.querySelector('#areaSearchTextField');
  myCurrentLocationBtn.onclick = (e) => {
    buildfire.geo.getCurrentPosition({ enableHighAccuracy: true }, (err, position) => {
      if (err || !position) {
        return console.error(err, position);
      }
      const { coords } = position;
      const geoCoder = new google.maps.Geocoder();
      const positionPoints = { lat: coords.latitude, lng: coords.longitude };
      currentLocation = positionPoints;
      searchLocations();
      geoCoder.geocode(
        { location: positionPoints },
        (results, status) => {
          console.log(results);
          if (status === "OK") {
            if (results[0]) {
              areaSearchTextField.value = results[0].formatted_address;
            } else {
              console.log("No results found");
            }
          } else {
            console.log("Geocoder failed due to: " + status);
          }
        }
      );
    });
  };

  const openNowSortingBtn = document.querySelector('#openNowSortingBtn');
  openNowSortingBtn.onclick = () => {
    criteria.openingNow = !criteria.openingNow;
    searchLocations();
  };
};

const initFilterOverlay = () => {
  let html = '';
  const container = document.querySelector('.expansion-panel__container .accordion');
  CATEGORIES.forEach((category) => {
    filterElements[category.id] = { checked: false, subcategories: [] };
    html += `<div class="expansion-panel" data-cid="${category.id}">
        <button class="expansion-panel-header mdc-ripple-surface">
          <div class="expansion-panel-header-content">
            <span class="expansion-panel-title">
            <i class="${category.iconClassName ?? 'glyphicon glyphicon-map-marker'}"></i>
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

  const chipSetsElements = document.querySelectorAll('#filter .mdc-chip-set');
  const chipSets = {};
  Array.from(chipSetsElements).forEach((c) => {
    const parent = c.closest('div.expansion-panel');
    chipSets[parent.dataset.cid] = new mdc.chips.MDCChipSet(c);
  });

  const expansionPanelCheckBox = document.querySelectorAll('.mdc-checkbox input');
  Array.from(expansionPanelCheckBox).forEach((c) => c.addEventListener('change', (e) => {
    const { target } = e;
    const mdcCheckBox = target.closest('.mdc-checkbox');
    const parent = target.closest('div.expansion-panel');
    const categoryId = parent.dataset.cid;
    if (!target.checked) {
      filterElements[categoryId] = { checked: false, subcategories: [] };
    } else {
      filterElements[categoryId].checked = true;
    }

    chipSets[categoryId].chips.forEach((c) => {
      const { sid } = c.root_.dataset;
      if (target.checked && !filterElements[categoryId]?.subcategories.includes(sid)) {
        filterElements[categoryId].subcategories.push(sid);
      }
      c.selected = target.checked;
    });
    target.disabled = true;
    mdcCheckBox.classList.add('mdc-checkbox--disabled');
    setTimeout(() => {
      target.disabled = false;
      mdcCheckBox.classList.remove('mdc-checkbox--disabled');
    }, 500);
  }));

  const subcategoriesChips = document.querySelectorAll('#filter .mdc-chip');
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

    if (selected && !filterElements[categoryId].subcategories.includes(subcategoryId)) {
      filterElements[categoryId].subcategories.push(subcategoryId);
    } else {
      filterElements[categoryId].subcategories = filterElements[categoryId].subcategories.filter((item) => item !== subcategoryId);
    }

    input.indeterminate = false;
    if (filterElements[categoryId].subcategories.length === 0) {
      input.checked = false;
      filterElements[categoryId].checked = false;
    } else if (filterElements[categoryId].subcategories.length === category.subcategories.length) {
      input.checked = true;
      filterElements[categoryId].checked = true;
    } else {
      input.indeterminate = true;
      filterElements[categoryId].checked = true;
    }

    mdcChip.classList.add('disabled');
    setTimeout(() => mdcChip.classList.remove('disabled'), 500);
  }));
};

const showMapView = () => {
  const introLocationsList = document.querySelector('#introLocationsList');
  hideElement('section#intro');
  showElement('section#listing');
  introLocationsList.innerHTML = '';
};

const navigateTo = (template) => {
  const currentActive = document.querySelector('section.active');
  currentActive?.classList.remove('active');
  document.querySelector(`section#${template}`).classList.add('active');
  if (template === 'home' && breadcrumbs.length) {
    addBreadcrumb({ pageName: 'home', title: 'Home' }, false);
  }
};

const initAreaAutocompleteField = (template) => {
  const areaSearchTextField = document.querySelector('#areaSearchTextField');
  const autocomplete = new google.maps.places.Autocomplete(
    areaSearchTextField,
    {
      types: ["address"],
    }
  );

  autocomplete.addListener("place_changed", () => {
    const place = autocomplete.getPlace();
    if (!place || !place.geometry || !place.geometry) {
      return;
    }

    const point = {
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng()
    };
    currentLocation = point;
    searchLocations();

    console.log(place);
  });
};

const initMainMap = () => {
  const { map, design } = settings;
  const selector = document.getElementById('mainMapContainer');
  const options = {
    styles: [],
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };

  if (design.allowStyleSelection) {
    options.mapTypeControl = true;
  }

  if (design.enableMapTerrainView) {
    options.mapTypeId = google.maps.MapTypeId.TERRAIN;
  } else if (design.defaultMapType === 'satellite') {
    options.mapTypeId = google.maps.MapTypeId.SATELLITE;
  }

  if (design.defaultMapStyle === 'dark') {
    options.styles = options.styles.concat([
      { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
      {
        featureType: "administrative.locality",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
      },
      {
        featureType: "poi",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
      },
      {
        featureType: "poi.park",
        elementType: "geometry",
        stylers: [{ color: "#263c3f" }],
      },
      {
        featureType: "poi.park",
        elementType: "labels.text.fill",
        stylers: [{ color: "#6b9a76" }],
      },
      {
        featureType: "road",
        elementType: "geometry",
        stylers: [{ color: "#38414e" }],
      },
      {
        featureType: "road",
        elementType: "geometry.stroke",
        stylers: [{ color: "#212a37" }],
      },
      {
        featureType: "road",
        elementType: "labels.text.fill",
        stylers: [{ color: "#9ca5b3" }],
      },
      {
        featureType: "road.highway",
        elementType: "geometry",
        stylers: [{ color: "#746855" }],
      },
      {
        featureType: "road.highway",
        elementType: "geometry.stroke",
        stylers: [{ color: "#1f2835" }],
      },
      {
        featureType: "road.highway",
        elementType: "labels.text.fill",
        stylers: [{ color: "#f3d19c" }],
      },
      {
        featureType: "transit",
        elementType: "geometry",
        stylers: [{ color: "#2f3948" }],
      },
      {
        featureType: "transit.station",
        elementType: "labels.text.fill",
        stylers: [{ color: "#d59563" }],
      },
      {
        featureType: "water",
        elementType: "geometry",
        stylers: [{ color: "#17263c" }],
      },
      {
        featureType: "water",
        elementType: "labels.text.fill",
        stylers: [{ color: "#515c6d" }],
      },
      {
        featureType: "water",
        elementType: "labels.text.stroke",
        stylers: [{ color: "#17263c" }],
      },
    ]);
  }

  if (map.initialArea && map.initialAreaCoordinates.lat && map.initialAreaCoordinates.lng) {
    options.center = {
      lat: map.initialAreaCoordinates.lat,
      lng: map.initialAreaCoordinates.lng
    };
    currentLocation = { ...map.initialAreaCoordinates };
  } else if (userPosition) {
    options.center = {
      lat: userPosition.latitude,
      lng: userPosition.longitude
    };
    currentLocation = { lat: userPosition.latitude, lng: userPosition.longitude };
  } else {
    // todo change to san diego
    options.center = { lat: 38.70290288229097, lng: 35.52352225602528 };
  }

  if (!map.showPointsOfInterest) {
    options.styles.push({
      featureType: 'poi',
      elementType: 'labels',
      stylers: [
        { visibility: 'off' }
      ]
    });
  }
  mainMap = new MainMap(selector, options);
  if (userPosition) {
    mainMap.addUserPosition(userPosition);
  }
};

const refreshMapOptions = () => {
  if (mainMap) {
    const { map, design } = settings;
    const options = {
      styles: [],
      mapTypeId: google.maps.MapTypeId.ROADMAP
    };

    if (design.allowStyleSelection) {
      options.mapTypeControl = true;
    }

    if (design.enableMapTerrainView) {
      options.mapTypeId = google.maps.MapTypeId.TERRAIN;
    } else if (design.defaultMapType === 'satellite') {
      options.mapTypeId = google.maps.MapTypeId.SATELLITE;
    }

    if (design.defaultMapStyle === 'dark') {
      options.styles = options.styles.concat([
        { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
        { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
        {
          featureType: "administrative.locality",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "poi",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "poi.park",
          elementType: "geometry",
          stylers: [{ color: "#263c3f" }],
        },
        {
          featureType: "poi.park",
          elementType: "labels.text.fill",
          stylers: [{ color: "#6b9a76" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#38414e" }],
        },
        {
          featureType: "road",
          elementType: "geometry.stroke",
          stylers: [{ color: "#212a37" }],
        },
        {
          featureType: "road",
          elementType: "labels.text.fill",
          stylers: [{ color: "#9ca5b3" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry",
          stylers: [{ color: "#746855" }],
        },
        {
          featureType: "road.highway",
          elementType: "geometry.stroke",
          stylers: [{ color: "#1f2835" }],
        },
        {
          featureType: "road.highway",
          elementType: "labels.text.fill",
          stylers: [{ color: "#f3d19c" }],
        },
        {
          featureType: "transit",
          elementType: "geometry",
          stylers: [{ color: "#2f3948" }],
        },
        {
          featureType: "transit.station",
          elementType: "labels.text.fill",
          stylers: [{ color: "#d59563" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#17263c" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.fill",
          stylers: [{ color: "#515c6d" }],
        },
        {
          featureType: "water",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#17263c" }],
        },
      ]);
    }

    if (map.initialArea && map.initialAreaCoordinates.lat && map.initialAreaCoordinates.lng) {
      options.center = {
        lat: map.initialAreaCoordinates.lat,
        lng: map.initialAreaCoordinates.lng
      };
    } else if (userPosition) {
      options.center = {
        lat: userPosition.latitude,
        lng: userPosition.longitude
      };
    } else {
      // todo change to san diego
      options.center = { lat: 38.70290288229097, lng: 35.52352225602528 };
    }

    if (!map.showPointsOfInterest) {
      options.styles.push({
        featureType: 'poi',
        elementType: 'labels',
        stylers: [
          { visibility: 'off' }
        ]
      });
    }

    mainMap.updateOptions(options);
  }
};
const handleMarkerClick = (location) => {
  const summaryContainer = document.querySelector('#locationSummary');
  summaryContainer.innerHTML = `<div data-id="${location.id}" class="mdc-ripple-surface pointer location-summary" style="background-image: linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(${location.listImage});">
            <div class="location-summary__header">
              <p>${location.distance ? location.distance : '--'}</p>
              <i class="material-icons-outlined mdc-text-field__icon" tabindex="0" role="button" style="visibility: hidden;">star_outline</i>
            </div>
            <div class="location-summary__body">
              <p class="margin-bottom-five">${location.title}</p>
              <p class="margin-top-zero">${transformCategories(location.categories)}</p>
              <p>
                <span>${location.subtitle}</span>
              </p>
            </div>
            <div class="mdc-chip-set" role="grid">
              ${location.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip" role="row" data-action-id="${a.id}">
                <div class="mdc-chip__ripple"></div>
                <span role="gridcell">
                    <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                      <span class="mdc-chip__text">${a.title}</span>
                    </span>
                  </span>
              </div>`).join('\n')}
            </div>
          </div>`;
  drawer.reset('collapsed');
  summaryContainer.classList.remove('slide-out');
  summaryContainer.classList.add('slide-in');
};
const initHomeView = () => {
  const { showIntroductoryListView, introductoryListView } = settings;
  injectTemplate('home');
  fetchCategories(() => {
    initFilterOverlay();
    refreshQuickFilter(); // todo if quick filter enabled
    initMainMap();
    initAreaAutocompleteField();
    fetchIntroductoryLocations(() => {
      drawer.initialize(settings);
      renderListingLocations(introductoryLocations);
      if (showIntroductoryListView) {
        renderIntroductoryLocations(introductoryLocations);
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

const calculateLocationDistance = (address) => {
  if (!userPosition) return null;
  const origin = {
    latitude: userPosition.latitude,
    longitude: userPosition.longitude,
  };
  const destination = {
    latitude: address.lat,
    longitude: address.lng
  };
  const distance = buildfire.geo.calculateDistance(origin, destination, { decimalPlaces: 5 });
  let result;
  if (distance < 0.5) {
    result = `${Math.round(distance * 5280).toLocaleString()} ft`;
  } else if (settings.measurementUnit === 'metric') {
    result = `${Math.round(distance * 1.60934).toLocaleString()} km`;
  } else {
    result = `${Math.round(distance).toLocaleString()} mi`;
  }
  return result;
};

const updateLocationsDistance = () => {
  introductoryLocations = introductoryLocations.map((location) => {
    const distance = calculateLocationDistance(location.coordinates);
    const distanceSelector = document.querySelector(`.location-item[data-id="${location.id}"] .location-item__actions p`);
    const imageDistanceSelector = document.querySelector(`.location-image-item .location-image-item__header p`);

    if (distanceSelector) distanceSelector.textContent = distance;
    if (imageDistanceSelector) imageDistanceSelector.textContent = distance;
    return { ...location, ...{ distance } };
  });
  if (selectedLocation) {
    const locationDetailSelector = document.querySelector('.location-detail__address p:last-child');
    selectedLocation.distance = calculateLocationDistance(selectedLocation.coordinates);
    if (locationDetailSelector) {
      locationDetailSelector.childNodes[0].nodeValue = selectedLocation.distance;
    }
  }
};
const clearTemplate = (template) => {
  if (!templates[template]) {
    console.warn(`template ${template} not found.`);
    return;
  }
  document.querySelector(`section#${template}`).innerHTML = '';
};
const initGoogleMapsSDK = () => {
  const { apiKeys } = buildfire.getContext();
  const { googleMapKey } = apiKeys;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = `https://maps.googleapis.com/maps/api/js?v=weekly${googleMapKey ? `&key=${googleMapKey}` : ''}&libraries=places&`;
  script.onload = () => {
    console.info('Successfully loaded Google\'s Maps SDK.');
  };
  document.head.appendChild(script);
};

const handleCPSync = (scope) => {
  const outdatedSettings = { ...settings };
  console.log('handle cp sync for: ', scope);
  if (scope === 'design') {
    fetchSettings(() => {
      // current design
      const d = settings.design;
      // outdated design
      const o = outdatedSettings.design;

      if (d.listViewPosition !== o.listViewPosition || d.listViewStyle !== o.listViewStyle) {
        hideFilterOverlay();
        navigateTo('home');
        showMapView();
        drawer.reset(d.listViewPosition);
        renderListingLocations(introductoryLocations);
      } else if (d.detailsMapPosition !== o.detailsMapPosition || d.showDetailsCategory !== o.showDetailsCategory) {
        if (introductoryLocations.length > 0) {
          [selectedLocation] = introductoryLocations;
          showLocationDetail();
        }
      } else {
        hideFilterOverlay();
        navigateTo('home');
        showMapView();
        refreshMapOptions();
      }
    });
  } else if (scope === 'settings') {
    fetchSettings(() => {
      const f = settings.filter;
      const of = outdatedSettings.filter;
      const ms = settings.map;
      const oms = outdatedSettings.map;
      if (f.allowFilterByArea !== of.allowFilterByArea) {
        const areaSearchInput = document.querySelector('#areaSearchLabel');
        if (areaSearchInput?.style.display === 'block' && !f.allowFilterByArea) {
          showElement('.header-qf');
          hideElement('#areaSearchLabel');
        }
      } else if (settings.measurementUnit !== outdatedSettings.measurementUnit) {
        updateLocationsDistance();
      } else if (ms.showPointsOfInterest !== oms.showPointsOfInterest
        || ms.initialArea !== oms.initialArea
        || ms.initialAreaCoordinates.lat !== oms.initialAreaCoordinates.lat
        || ms.initialAreaCoordinates.lng !== oms.initialAreaCoordinates.lng) {
        hideFilterOverlay();
        navigateTo('home');
        showMapView();
        refreshMapOptions();
      }
    });
  } else if (scope === 'intro') {
    fetchSettings(() => {
      if (settings.showIntroductoryListView) {
        const container = document.querySelector('#introLocationsList');
        container.innerHTML = '';
        renderIntroductoryLocations(introductoryLocations);
        refreshIntroductoryDescription();
        hideFilterOverlay();
        navigateTo('home');
        showElement('section#intro');
        hideElement('section#listing');
        refreshIntroductoryCarousel();
        if (settings.introductoryListView.images.length === 0
          && introductoryLocations.length === 0
          && !settings.introductoryListView.description) {
          showElement('div.empty-page');
        }
        // eslint-disable-next-line no-new
        new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));
      } else if (getComputedStyle(document.querySelector('section#intro'), null).display !== 'none') {
        showMapView();
      }
    });
  } else if (scope === 'locations') {
    // todo incase there is data object then navigate to detail page with the given data
    // todo else just refetch the latest data and reflect on intro and listing page
  } else if (scope === 'category') {
    fetchCategories(() => {
      initFilterOverlay();
      showFilterOverlay();
    });
  }
};

const init = () => {
  initGoogleMapsSDK();
  fetchSettings(() => {
    fetchTemplate('filter', injectTemplate);
    fetchTemplate('home', initHomeView);
    // fetchCategories(() => {
    //   showLocationDetail();
    // });

    setTimeout(() => { initEventListeners(); }, 1000);
    buildfire.deeplink.getData((deeplinkData) => {
      console.log('getData deeplinkData: ', deeplinkData);
      if (deeplinkData?.locationId) {
        WidgetController
          .getLocation(deeplinkData.locationId)
          .then((response) => {
            selectedLocation = response.data;
            showLocationDetail();
          })
          .catch((err) => {
            console.error('fetch location error: ', err);
          });
      }
    });

    buildfire.geo.getCurrentPosition({ enableHighAccuracy: true }, (err, position) => {
      if (err) {
        return console.error(err);
      }
      userPosition = position.coords;
      updateLocationsDistance();
      if (mainMap) {
        mainMap.addUserPosition(userPosition);
      }
    });

    buildfire.history.onPop((breadcrumb) => {
      console.log('Breadcrumb popped', breadcrumb);
      console.log('Breadcrumb popped', breadcrumbs);
      breadcrumbs.pop();
      if (!breadcrumbs.length) {
        hideFilterOverlay();
        navigateTo('home');
      } else {
        const page = breadcrumbs[breadcrumbs.length - 1];
        if (page.name === 'af') {
          showFilterOverlay();
        } else if (page.name === 'detail') {
          hideFilterOverlay();
          showLocationDetail();
        } else {
          hideFilterOverlay();
          navigateTo('home');
        }
        breadcrumbs.pop();
      }
    });

    buildfire.appearance.getAppTheme((err, appTheme) => {
      if (err) return console.error(err);
      const root = document.documentElement;
      const { colors } = appTheme;
      root.style.setProperty('--body-theme', colors.bodyText);
      root.style.setProperty('--header-theme', colors.headerText);
      root.style.setProperty('--background-color', colors.backgroundColor);
      root.style.setProperty('--primary-color', colors.primaryTheme);
    });

    buildfire.messaging.onReceivedMessage = (message) => {
      if (message.cmd === 'sync') {
        handleCPSync(message.scope);
      }
      console.log('widget message: ', message);
    };
  });
};

authManager.enforceLogin(init);
