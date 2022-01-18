import * as Promise from 'bluebird';
import buildfire from 'buildfire';
import WidgetController from './widget.controller';
import Accordion from './js/Accordion';
import MainMap from './js/Map';
import drawer from './js/drawer';
import state from './js/state';
import constants from './js/constants';
import views from './js/Views';
import { openingNowDate, getCurrentDayName, convertDateToTime } from '../utils/datetime';
import { showElement, hideElement, toggleDropdownMenu } from './js/util/ui';
import { deepObjectDiff } from './js/util/helpers';

// following is San Diego,US location
const DEFAULT_LOCATION = { lat: 32.7182625, lng: -117.1601157 };
let SEARCH_TIMOUT;

if (!buildfire.components.carousel.view.prototype.clear) {
  buildfire.components.carousel.view.prototype.clear = function () {
    return this._removeAll();
  };
}

const searchLocations = (type) => {
  // add geo stage when search user location , area, open Now
  const pipelines = [];
  let pageIndex = state.searchCriteria.page;
  const query = {};
  if (state.searchCriteria.searchValue && state.searchableTitles.length === 0) {
    query["_buildfire.index.text"] = { $regex: state.searchCriteria.searchValue.toLowerCase(), $options: "-i" };
  }

  // categories & subcategories filter
  const categoryIds = [];
  const subcategoryIds = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const key in state.filterElements) {
    if (state.filterElements[key].checked) {
      categoryIds.push(key);
      subcategoryIds.push(...state.filterElements[key].subcategories);
    }
  }
  // eslint-disable-next-line max-len
  if (categoryIds.length > 0 || subcategoryIds.length > 0 || state.searchCriteria.priceRange || state.searchableTitles.length > 0) {
    const array1Index = [...categoryIds.map((id) => `c_${id}`), ...subcategoryIds.map((id) => `s_${id}`)];
    if (state.searchCriteria.priceRange) {
      array1Index.push(`pr_${state.searchCriteria.priceRange}`);
    }

    if (state.searchableTitles.length > 0) {
      array1Index.push(...state.searchableTitles.map((title) => `title_${title.toLowerCase()}`));
    }
    query["_buildfire.index.array1.string1"] = { $in: array1Index };
  }

  let $geoNear = null;
  if (type !== 'bound' && state.currentLocation) {
    $geoNear = {
      near: { type: "Point", coordinates: [state.currentLocation.lng, state.currentLocation.lat] },
      key: "_buildfire.geo",
      maxDistance: 10000,
      distanceField: "distance",
      query: { ...query },
      num: 5000
    };
    pipelines.push({ $geoNear });
  } else {
    const $match = { ...query };
    if (type === 'bound' && Array.isArray(state.mapBounds)) {
      $match["_buildfire.geo"] =  {
        $geoWithin: {
          $geometry: {
            type : "Polygon",
            coordinates: [state.mapBounds]
          }
        }
      };
      pageIndex = state.searchCriteria.page2;
    }

    // if (Object.keys($match).length === 0) {
    $match["_buildfire.index.string1"] = buildfire.getContext().instanceId;
    // }
    pipelines.push({ $match });
  }

  if (state.searchCriteria.openingNow) {
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
  if (state.searchCriteria.sort) {
    if (state.searchCriteria.sort.sortBy === 'distance' && !$geoNear) {
      $sort["_buildfire.index.text"] = 1;
    } else {
      $sort[state.searchCriteria.sort.sortBy] = state.searchCriteria.sort.order;
    }
    pipelines.push({ $sort });
  }
  const promiseChain = [
    WidgetController.searchLocationsV2(pipelines, pageIndex)
  ];

  if (state.searchCriteria.searchValue) {
    promiseChain.push(WidgetController.getSearchEngineResults(state.searchCriteria.searchValue));
  }

  return Promise.all(promiseChain)
    .then(([result, result2]) => {
      console.log(result2);
      state.fetchingNextPage = false;
      state.fetchingEndReached = result.length < state.searchCriteria.pageSize;
      result = result.filter((elem1) => !state.listLocations.find((elem) => elem?.id === elem1?.id))
        .map((r) => ({ ...r, distance: calculateLocationDistance(r?.coordinates) }));
      state.listLocations = state.listLocations.concat(result);
      result.forEach((location) => state.maps.map.addMarker(location, handleMarkerClick));

      // eslint-disable-next-line max-len
      if (state.searchCriteria.searchValue && state.listLocations.length === 0 && state.searchableTitles.length === 0) {
        const searchableTitles =  result2?.hits?.hits?.map((elem) => elem._source.searchable.title);
        if (searchableTitles && searchableTitles.length > 0) {
          state.searchableTitles = searchableTitles;
          return searchLocations();
        }
      }
      return result;
    })
    .catch(console.error);
};

const refreshSettings = () => {
  return WidgetController
    .getAppSettings()
    .then((response) => state.settings = response);
};

const refreshCategories = () => {
  return WidgetController
    .searchCategories({
      sort: { title: -1 }
    })
    .then((result) => state.categories = result);
};

const clearIntroViewList = () => { document.querySelector('#introLocationsList').innerHTML = ''; };
const clearMapViewList = () => { document.querySelector('#listingLocationsList').innerHTML = ''; };
const hideFilterOverlay = () => { document.querySelector('section#filter').classList.remove('overlay'); };

const renderIntroductoryLocations = (list, includePinned = false) => {
  const container = document.querySelector('#introLocationsList');
  let reducedLocations = list.reduce((filtered, n) => {
    const index = state.pinnedLocations.findIndex((pinned) => pinned.id === n.id);
    if (index === -1) {
      filtered.push(`<div class="mdc-ripple-surface pointer location-item" data-id=${n.id}>
        <div class="d-flex">
          <img src=${n.listImage} alt="Location image">
          <div class="location-item__description">
            <p class="mdc-theme--text-header">${n.title}</p>
            <p class="mdc-theme--text-body text-truncate" style="display: ${n.subtitle ? 'block' : 'none'};">${n.subtitle ?? ''}</p>
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
      </div>`);
    }
    return filtered;
  }, []);

  if (includePinned) {
    reducedLocations = state.pinnedLocations.map((n) => (`<div class="mdc-ripple-surface pointer location-item" data-id=${n.id}>
        <div class="d-flex">
          <img src=${n.listImage} alt="Location image">
          <div class="location-item__description">
            <p class="mdc-theme--text-header">${n.title}</p>
            <p class="mdc-theme--text-body text-truncate" style="display: ${n.subtitle ? 'block' : 'none'};">${n.subtitle ?? ''}</p>
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
      </div>`)).concat(reducedLocations);
  }
  const content = reducedLocations.join('\n');
  container.insertAdjacentHTML('beforeend', content);
};
const renderListingLocations = (list) => {
  const container = document.querySelector('#listingLocationsList');
  let content;
  if (state.settings.design.listViewStyle === 'backgroundImage') {
    content = list.map((n) => (`<div data-id="${n.id}" class="mdc-ripple-surface pointer location-image-item" style="background-image: linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(${n.images.length ? n.images[0].imageUrl : './images/default-location-cover.png'});">
            <div class="location-image-item__header">
              <p>${n.distance ? n.distance : '--'}</p>
              <i class="material-icons-outlined mdc-text-field__icon" tabindex="0" role="button" style="visibility: hidden;">star_outline</i>
            </div>
            <div class="location-image-item__body">
              <p class="margin-bottom-five">${n.title}</p>
              <p class="margin-top-zero">${transformCategories(n.categories)}</p>
              <p>
                <span>${n.subtitle ?? ''}</span>
                <span>
                  <span>${n.price.currency?.repeat(n.price?.range)}</span>
                  <span class="location-image__open-status">${isLocationOpen(n) ? 'Open Now' : 'Closed'}</span>
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
    content = list.map((n) => (`<div class="mdc-ripple-surface pointer location-item" data-id="${n.id}">
        <div class="d-flex">
          <img src="${n.listImage}" alt="Location image">
          <div class="location-item__description">
            <p class="mdc-theme--text-header">${n.title}</p>
            <p class="mdc-theme--text-body text-truncate" style="display: ${n.subtitle ? 'block' : 'none'};">${n.subtitle ?? ''}</p>
            <p class="mdc-theme--text-body text-truncate">${n.address}</p>
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
  container.insertAdjacentHTML('beforeend', content);
};

const refreshQuickFilter = () => {
  const container = document.querySelector('.header-qf');
  const quickFilterItems = state.categories.slice(0, 10);
  const advancedFilterBtn = document.querySelector('#filterIconBtn');

  if (!quickFilterItems.length) {
    container.innerHTML = '<small class="mdc-theme--text-body d-block text-center margin-top-five margin-bottom-five">No Categories Added</small>';
    advancedFilterBtn.classList.add('disabled');
    return;
  }

  container.innerHTML = quickFilterItems.map((n) => `<div class="mdc-chip" role="row" id="${n.id}">
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
  Array.from(chipSets).forEach((c) => {
    const chip = new mdc.chips.MDCChipSet(c);
    chip.listen('MDCChip:interaction', (event) => {
      const categoryId = event.detail.chipId;
      console.log(categoryId);
      if (state.filterElements[categoryId]) {
        state.filterElements[categoryId].checked = !state.filterElements[categoryId].checked;
      } else {
        state.filterElements[categoryId] = { checked: true, subcategories: [] };
      }
      clearAndSearchWithDelay();
    });
  });
};

const refreshIntroductoryDescription = () => {
  if (state.settings.introductoryListView.description) {
    const container = document.querySelector('.intro-details');
    container.innerHTML = state.settings.introductoryListView.description;
  }
};

const refreshIntroductoryCarousel = () => {
  const { introductoryListView } = state.settings;
  if (state.introCarousel) {
    state.introCarousel.clear();
    state.introCarousel.append(introductoryListView.images);
  } else if (introductoryListView.images.length > 0) {
    state.introCarousel = new buildfire.components.carousel.view('.carousel');
    state.introCarousel.loadItems(introductoryListView.images);
  }
};

const addBreadcrumb = ({ pageName, label }, showLabel = true) => {
  if (state.breadcrumbs.length && state.breadcrumbs[state.breadcrumbs.length - 1].name === pageName) {
    return;
  }
  state.breadcrumbs.push({ name: pageName });
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

const transformCategories = (categories) => {
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

const isLocationOpen = (location) => {
  let isOpen = false;
  const today = location.openingHours.days[getCurrentDayName()];
  const now = openingNowDate();

  if (today.active) {
    const interval = today.intervals.find((i) => (new Date(i.from) <= now) && (new Date(i.to) > now));
    if (interval) isOpen = true;
  }
  return isOpen;
};

const showLocationDetail = () => {
  const { selectedLocation } = state;

  views
    .fetch('detail')
    .then(() => {
      views.inject('detail');
      const pageMapPosition = state.settings.design.detailsMapPosition;
      let selectors = {
        address: document.querySelector('.location-detail__address p:first-child'),
        distance: document.querySelector('.location-detail__address p:last-child'),
        carousel: document.querySelector('.location-detail__carousel'),
        actionItems: document.querySelector('.location-detail__actions'),
        description: document.querySelector('.location-detail__description'),
        rating: document.querySelector('.location-detail__rating'),
        ratingSystem: document.querySelector('.location-detail__rating div[data-rating-id]'),
        ratingValue: document.querySelector('.location-cover__rating-value')
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
            map: document.querySelector('.location-detail__map--top-view'),
            workingHoursBtn: document.querySelector('#topWorkingHoursBtn'),
            workingHoursBtnLabel: document.querySelector('#topWorkingHoursBtn .mdc-button__label')
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
            map: document.querySelector('.location-detail__map'),
            workingHoursBtn: document.querySelector('#coverWorkingHoursBtn'),
            workingHoursBtnLabel: document.querySelector('#coverWorkingHoursBtn .mdc-button__label')
          }
        };
        selectors.main.style.display = 'flex';
        selectors.rating.classList.add('location-detail__rating--dual-shadow');
      }

      if (selectedLocation.images?.length > 0) {
        if (pageMapPosition === 'top') {
          selectors.cover.style.backgroundImage = `linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(${selectedLocation.images[0].imageUrl})`;
          selectors.cover.style.display = 'block';
        } else {
          selectors.main.style.backgroundImage = `linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(${selectedLocation.images[0].imageUrl})`;
        }
      }

      if (!selectedLocation.coordinates.lat || !selectedLocation.coordinates.lng) {
        selectedLocation.coordinates = DEFAULT_LOCATION;
      }
      selectors.map.style.display = 'block';
      const detailMap = new google.maps.Map(selectors.map, {
        mapTypeControl: true,
        disableDefaultUI: true,
        center: { lat: selectedLocation.coordinates.lat, lng: selectedLocation.coordinates.lng },
        zoom: 14,
      });

      new google.maps.Marker({
        position: new google.maps.LatLng({ lat: selectedLocation.coordinates.lat, lng: selectedLocation.coordinates.lng }),
        map: detailMap,
      });

      selectors.title.textContent = selectedLocation.title;
      selectors.subtitle.textContent = selectedLocation.subtitle ?? '';
      selectors.address.textContent = selectedLocation.formattedAddress;
      selectors.description.innerHTML = selectedLocation.description;
      selectors.distance.childNodes[0].nodeValue = selectedLocation.distance;

      if (state.settings.design?.showDetailsCategory && selectedLocation.settings.showCategory) {
        selectors.categories.textContent = transformCategories(selectedLocation.categories);
        selectors.categories.style.display = 'block';
      }

      if (!selectedLocation.settings.showOpeningHours) {
        selectors.workingHoursBtn.style.display = 'none';
      } else if (!isLocationOpen(selectedLocation)) {
        selectors.workingHoursBtnLabel.textContent = 'Closed';
      }

      if (!selectedLocation.settings.showStarRating) {
        document.querySelectorAll('.location-detail__rating > *').forEach((el) => { el.style.display = 'none'; });
        selectors.ratingValue.style.display = 'none';
      } else {
        selectors.ratingSystem.dataset.ratingId = selectedLocation.id;
        selectors.ratingValue.textContent = Array(Math.round(selectedLocation.rating.average) + 1).join('★ ');
        buildfire.components.ratingSystem.injectRatings();
      }
      selectors.actionItems.innerHTML = selectedLocation.actionItems.map((a) => `<div class="action-item" data-id="${a.id}">
<!--        <i class="material-icons-outlined mdc-text-field__icon" tabindex="0" role="button">call</i>-->
      ${a.iconUrl ? `<img src="${a.iconUrl}" alt="action-image">` : ''}
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
      addBreadcrumb({ pageName: 'detail', title: 'Location Detail' });
      navigateTo('detail');
    });
};
const showWorkingHoursDrawer = () => {
  const { days } = state.selectedLocation.openingHours;
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

const shareLocation = () => {
  buildfire.deeplink.generateUrl(
    {
      data: { locationId: state.selectedLocation.id },
    },
    (err, result) => {
      if (err) return console.error(err);
      buildfire.device.share({
        subject: state.selectedLocation.title,
        text: state.selectedLocation.title,
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
  const actionItem = state.selectedLocation.actionItems.find((a) => a.id === actionId);
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
  const actionItem = state.listLocations
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

  if (activeTemplate === 'intro' && !state.fetchingNextPage && !state.fetchingEndReached) {
    if (e.target.scrollTop + e.target.offsetHeight > listContainer.offsetHeight) {
      state.fetchingNextPage = true;
      state.searchCriteria.page += 1;
      searchLocations()
        .then((result) => {
          renderIntroductoryLocations(result);
        });
    }
  }
};

const fetchMoreListLocations = (e) => {
  const listContainer = document.querySelector('#listingLocationsList');
  if (e.target.scrollTop + e.target.offsetHeight > listContainer.offsetHeight) {
    if (!state.fetchingNextPage && !state.fetchingEndReached) {
      state.fetchingNextPage = true;
      if (state.mapBounds) {
        state.searchCriteria.page2 += 1;
      } else {
        state.searchCriteria.page += 1;
      }
      searchLocations(state.mapBounds ? "bound" : "point")
        .then((result) => {
          renderListingLocations(result);
        });
    }
  }
};

const viewFullImage = (url) => { buildfire.imagePreviewer.show({ images: url.map((u) => u.imageUrl) }); };

const setDefaultSorting = () => {
  const { showIntroductoryListView, introductoryListView, sorting } = state.settings;
  if (showIntroductoryListView && introductoryListView.sorting) {
    if (introductoryListView.sorting === 'distance') {
      state.searchCriteria.sort = { sortBy: 'distance', order: 1 };
    } else if (introductoryListView.sorting === 'alphabetical') {
      state.searchCriteria.sort = { sortBy: '_buildfire.index.text', order: 1 };
    } else if (introductoryListView.sorting === 'newest') {
      state.searchCriteria.sort = { sortBy: '_buildfire.index.date1', order: 1 };
    }
  } else if (sorting.defaultSorting === 'distance') {
    state.searchCriteria.sort = { sortBy: 'distance', order: 1 };
  } else if (sorting.defaultSorting === 'alphabetical') {
    state.searchCriteria.sort = { sortBy: '_buildfire.index.text', order: 1 };
  }
};

const clearLocations = () => {
  state.listLocations = [];
  state.mapBounds = null;
  state.searchCriteria.page = 0;
  state.searchCriteria.page2 = 0;
  state.fetchingNextPage = false;
  state.fetchingEndReached = false;
  state.searchableTitles = [];
  if (state.maps.map) state.maps.map.clearMarkers();
};

const fetchPinnedLocations = (done) => {
  WidgetController
    .getPinnedLocations()
    .then((locations) => {
      state.pinnedLocations = locations.result.filter((elem1) => !state.pinnedLocations.find((elem) => elem?.id === elem1?.id))
        .map((r) => ({ ...r, distance: calculateLocationDistance(r?.coordinates) }));
      done(null, state.pinnedLocations);
    })
    .catch((err) => {
      console.error('error fetching pinned locations: ', err);
    });
};
const clearAndSearchLocations = () => {
  clearLocations();
  searchLocations()
    .then(() => {
      const { showIntroductoryListView } = state.settings;
      if (showIntroductoryListView) {
        clearIntroViewList();
        fetchPinnedLocations(() => {
          renderIntroductoryLocations(state.listLocations, true);
        });
      }
      clearMapViewList();
      renderListingLocations(state.listLocations);
    });
};
const clearAndSearchWithDelay = () => {
  if (SEARCH_TIMOUT) clearTimeout(SEARCH_TIMOUT);
  SEARCH_TIMOUT = setTimeout(clearAndSearchLocations, 500);
};

const onMapBoundsChange = (bounds) => {
  console.log(state.mapBounds);
  if (SEARCH_TIMOUT) clearTimeout(SEARCH_TIMOUT);
  SEARCH_TIMOUT = setTimeout(() => {
    if (!state.firstSearchInit) {
      return;
    }
    state.mapBounds = bounds;
    state.searchCriteria.page2 = 0;
    searchLocations('bound').then((result) => {
      renderListingLocations(result);
    });
  }, 500);

  // handle hiding opened location
  const locationSummary = document.querySelector('#locationSummary');
  if (locationSummary && locationSummary.classList.contains('slide-in')) {
    locationSummary.classList.add('slide-out');
    locationSummary.classList.remove('slide-in');
  }
};

const getFormattedAddress = (coords, cb) => {
  const geoCoder = new google.maps.Geocoder();
  geoCoder.geocode(
    { location: coords },
    (results, status) => {
      if (status === 'OK') {
        if (results[0]) {
          cb(null, results[0].formatted_address);
        } else {
          console.log("No results found");
        }
      } else {
        console.log("Geocoder failed due to: " + status);
      }
    }
  );
};
const initEventListeners = () => {
  document.querySelector('body').addEventListener('scroll', fetchMoreIntroductoryLocations, false);
  document.querySelector('.drawer').addEventListener('scroll', fetchMoreListLocations, false);
  document.addEventListener('focus', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchTextField' && state.settings.filter.allowFilterByArea) {
      showElement('#areaSearchLabel');
      hideElement('.header-qf');
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchLocationsBtn') {
      state.searchCriteria.searchValue = e.target.value;
      clearAndSearchWithDelay();
    } else if (e.target.id === 'filterIconBtn') {
      toggleFilterOverlay();
    } else if (e.target.id === 'showMapView') {
      const { showIntroductoryListView, introductoryListView, sorting } = state.settings;
      if (showIntroductoryListView && introductoryListView.sorting !== sorting.defaultSorting) {
        if (sorting.defaultSorting === 'distance') {
          state.searchCriteria.sort = { sortBy: 'distance', order: 1 };
        } else if (sorting.defaultSorting === 'alphabetical') {
          state.searchCriteria.sort = { sortBy: '_buildfire.index.text', order: 1 };
        }
        clearLocations();
        clearMapViewList();
        searchLocations()
          .then(() => {
            renderListingLocations(state.listLocations);
            showMapView();
          });
      } else {
        showMapView();
      }
    } else if (['priceSortingBtn', 'otherSortingBtn'].includes(e.target.id)) {
      drawer.reset('expanded');
      setTimeout(() => { toggleDropdownMenu(e.target.nextElementSibling); }, 200);

      const menu = new mdc.menu.MDCMenu(e.target.nextElementSibling);
      const otherSortingMenuBtnLabel = document.querySelector('#otherSortingBtn .mdc-button__label');
      const otherSortingMenuBtn = document.querySelector('#otherSortingBtn');
      const priceSortingBtnLabel = document.querySelector('#priceSortingBtn .mdc-button__label');
      const priceSortingBtn = document.querySelector('#priceSortingBtn');
      menu.listen('MDCMenu:selected', (event) => {
        const value = event.detail.item.getAttribute('data-value');
        if (e.target.id === 'priceSortingBtn') {
          state.searchCriteria.priceRange = Number(value);
          priceSortingBtnLabel.textContent = event.detail.item.querySelector('.mdc-list-item__text').textContent;
          priceSortingBtn.style.setProperty('background-color', 'var(--mdc-theme-primary)', 'important');
        } else if (e.target.id === 'otherSortingBtn') {
          otherSortingMenuBtnLabel.textContent = event.detail.item.querySelector('.mdc-list-item__text').textContent;
          otherSortingMenuBtn.style.setProperty('background-color', 'var(--mdc-theme-primary)', 'important');
          if (value === 'distance') {
            state.searchCriteria.sort = { sortBy: 'distance', order: 1 };
          } else if (value === 'A-Z') {
            state.searchCriteria.sort = { sortBy: '_buildfire.index.text', order: 1 };
          } else if (value === 'Z-A') {
            state.searchCriteria.sort = { sortBy: '_buildfire.index.text', order: -1 };
          } else if (value === 'date') {
            state.searchCriteria.sort = { sortBy: '_buildfire.index.date1', order: 1 };
          } else if (value === 'price-low-high') {
            state.searchCriteria.sort = { sortBy: 'price.range', order: -1 };
          } else if (value === 'price-high-low') {
            state.searchCriteria.sort = { sortBy: 'price.range', order: 1 };
          } else if (value === 'rating') {
            state.searchCriteria.sort = { sortBy: 'rating.average', order: 1 };
          } else if (value === 'views') {
            state.searchCriteria.sort = { sortBy: 'views', order: 1 };
          }
        }
        clearAndSearchWithDelay();
      });
    } else if (e.target.classList.contains('location-item') || e.target.classList.contains('location-image-item') || e.target.classList.contains('location-summary'))  {
      state.selectedLocation = state.listLocations.find((i) => i.id === e.target.dataset.id);
      showLocationDetail();
    } else if (['topWorkingHoursBtn', 'coverWorkingHoursBtn'].includes(e.target.id)) {
      showWorkingHoursDrawer();
    } else if (e.target.id === 'shareLocationBtn') {
      shareLocation();
    } else if (e.target.classList.contains('list-action-item') || e.target.dataset.actionId) {
      handleListActionItem(e);
    } else if (e.target.parentNode?.classList.contains('location-detail__carousel')) {
      viewFullImage(state.selectedLocation.images);
    } else if (e.target.parentNode?.classList.contains('action-item')) {
      handleDetailActionItem(e);
    } else if (e.target.id === 'mapCenterBtn') {
      if (state.maps.map && state.userPosition.latitude && state.userPosition.longitude) {
        getFormattedAddress({ lat: state.userPosition.latitude, lng: state.userPosition.longitude }, (err, address) => {
          state.maps.map.center({ lat: state.userPosition.latitude, lng: state.userPosition.longitude });
          state.maps.map.addUserPosition(state.userPosition);
          const areaSearchTextField = document.querySelector('#areaSearchTextField');
          areaSearchTextField.value = address;
        });
      }
    }
  }, false);

  document.addEventListener('keyup', (e) => {
    if (!e.target) return;

    const keyCode = e.which || e.keyCode;
    const { value } = e.target;

    if (e.target.id === 'searchTextField') {
      state.searchCriteria.searchValue = value;
      clearAndSearchWithDelay();
    }

    // this is to refresh only
    if (keyCode === 13 && e.target.id === 'searchTextField' && value) {
      console.log('value: ', value);
      state.searchCriteria.searchValue = value;
      clearAndSearchWithDelay();
    }
  });

  const myCurrentLocationBtn = document.querySelector('#myCurrentLocationBtn');
  myCurrentLocationBtn.onclick = (e) => {
    if (!state.userPosition) return;
    const positionPoints = { lat: state.userPosition.latitude, lng: state.userPosition.longitude };
    state.currentLocation = positionPoints;
    if (state.maps.map) {
      state.maps.map.addUserPosition(state.userPosition);
      state.maps.map.center({ lat: state.userPosition.latitude, lng: state.userPosition.longitude });
    }
    clearAndSearchWithDelay();
    fillAreaSearchField(positionPoints);
  };

  const openNowSortingBtn = document.querySelector('#openNowSortingBtn');
  openNowSortingBtn.onclick = () => {
    state.searchCriteria.openingNow = !state.searchCriteria.openingNow;
    if (state.searchCriteria.openingNow) {
      openNowSortingBtn.classList.add('selected');
    } else {
      openNowSortingBtn.classList.remove('selected');
    }
    clearAndSearchWithDelay();
  };
};

const initFilterOverlay = () => {
  let html = '';
  const container = document.querySelector('.expansion-panel__container .accordion');
  state.categories.forEach((category) => {
    state.filterElements[category.id] = { checked: false, subcategories: [] };
    html += `<div class="expansion-panel" data-cid="${category.id}">
        <button class="expansion-panel-header mdc-ripple-surface">
          <div class="expansion-panel-header-content">
            <span class="expansion-panel-title mdc-theme--text-primary-on-background">
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
      state.filterElements[categoryId] = { checked: false, subcategories: [] };
    } else {
      state.filterElements[categoryId].checked = true;
    }

    chipSets[categoryId].chips.forEach((c) => {
      const { sid } = c.root_.dataset;
      if (target.checked && !state.filterElements[categoryId]?.subcategories.includes(sid)) {
        state.filterElements[categoryId].subcategories.push(sid);
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
    const category = state.categories.find((c) => c.id === categoryId);

    if (selected && !state.filterElements[categoryId].subcategories.includes(subcategoryId)) {
      state.filterElements[categoryId].subcategories.push(subcategoryId);
    } else {
      state.filterElements[categoryId].subcategories = state.filterElements[categoryId].subcategories.filter((item) => item !== subcategoryId);
    }

    input.indeterminate = false;
    if (state.filterElements[categoryId].subcategories.length === 0) {
      input.checked = false;
      state.filterElements[categoryId].checked = false;
    } else if (state.filterElements[categoryId].subcategories.length === category.subcategories.length) {
      input.checked = true;
      state.filterElements[categoryId].checked = true;
    } else {
      input.indeterminate = true;
      state.filterElements[categoryId].checked = true;
    }

    mdcChip.classList.add('disabled');
    setTimeout(() => mdcChip.classList.remove('disabled'), 500);
  }));
};

const showMapView = () => {
  const introLocationsList = document.querySelector('#introLocationsList');
  hideElement('section#intro');
  showElement('section#listing');
  state.firstSearchInit = true;
  introLocationsList.innerHTML = '';
};

const navigateTo = (template) => {
  const currentActive = document.querySelector('section.active');
  currentActive?.classList.remove('active');
  document.querySelector(`section#${template}`).classList.add('active');
  if (template === 'home' && state.breadcrumbs.length) {
    addBreadcrumb({ pageName: 'home', title: 'Home' }, false);
  }
};

const initAreaAutocompleteField = () => {
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
    state.currentLocation = point;
    state.maps.map.center(point);
    clearAndSearchWithDelay();
    console.log(place);
  });
};

const generateMapOptions = () => {
  const areaSearchTextField = document.querySelector('#areaSearchTextField');
  const { map, design } = state.settings;
  const { userPosition } = state;
  const options = {
    styles: [],
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    mapTypeControl: design.allowStyleSelection,
  };

  if (design.enableMapTerrainView) {
    options.mapTypeId = google.maps.MapTypeId.TERRAIN;
  } else if (design.defaultMapType === 'satellite') {
    options.mapTypeId = google.maps.MapTypeId.SATELLITE;
  }

  if (design.defaultMapStyle === 'dark') {
    options.styles = options.styles.concat(constants.getMapStyle('nightMode'));
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

  if (map.initialArea && map.initialAreaCoordinates.lat && map.initialAreaCoordinates.lng) {
    options.center = { ...map.initialAreaCoordinates };
    state.currentLocation = { ...map.initialAreaCoordinates };
    areaSearchTextField.value = map.initialAreaString;
  } else if (userPosition) {
    options.center = {
      lat: userPosition.latitude,
      lng: userPosition.longitude
    };
    state.currentLocation = { lat: userPosition.latitude, lng: userPosition.longitude };
  } else {
    options.center = DEFAULT_LOCATION;
    state.currentLocation = DEFAULT_LOCATION;
  }

  return options;
};

const fillAreaSearchField = (coords) => {
  const areaSearchTextField = document.querySelector('#areaSearchTextField');
  getFormattedAddress(coords, (err, address) => {
    state.maps.map.center(coords);
    areaSearchTextField.value = address;
  });
};

const initMainMap = () => {
  const selector = document.getElementById('mainMapContainer');
  const options = generateMapOptions();
  const { userPosition } = state;

  state.maps.map = new MainMap(selector, options);
  state.maps.map.onBoundsChange = onMapBoundsChange;
  if (userPosition) {
    state.maps.map.addUserPosition(userPosition);
    if (!state.settings.map.initialArea
      || !state.settings.map.initialAreaCoordinates.lat
      || !state.settings.map.initialAreaCoordinates.lng) {
      fillAreaSearchField({ lat: userPosition.latitude, lng: userPosition.longitude });
    }
  }
};

const refreshMapOptions = () => {
  const { map } = state.maps;
  if (map) {
    const options = generateMapOptions();
    map.updateOptions(options);
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
                <span>${location.addressAlias ?? location.subtitle ?? ''}</span>
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
const initDrawerFilterOptions = () => {
  const { sorting } = state.settings;
  const otherSortingMenuList = document.querySelector('.other-sorting-menu ul');
  const otherSortingMenuBtnLabel = document.querySelector('#otherSortingBtn .mdc-button__label');
  const sortingOptions = [
    {
      key: 'allowSortByReverseAlphabetical',
      value: 'Z-A',
      textContent: 'Title (Z-A)'
    },
    {
      key: 'allowSortByNearest',
      value: 'distance',
      textContent: 'Distance'
    },
    {
      key: 'allowSortByRating',
      value: 'rating',
      textContent: 'Recommended'
    },
    {
      key: 'allowSortByPriceHighToLow',
      value: 'price-high-low',
      textContent: 'Price (High > Low)'
    },
    {
      key: 'allowSortByPriceLowToHigh',
      value: 'price-low-high',
      textContent: 'Price (Low > High)'
    },
    {
      key: 'allowSortByDate',
      value: 'date',
      textContent: 'Newest (New to old)'
    },
    {
      key: 'allowSortByViews',
      value: 'views',
      textContent: 'Most Viewed'
    }
  ];

  let list = `<li class="mdc-list-item" role="menuitem" data-value="A-Z">
              <span class="mdc-list-item__ripple"></span>
              <span class="mdc-list-item__text">Title (A-Z)</span>
            </li>`;

  for (let i = 0; i < sortingOptions.length; i++) {
    const option = sortingOptions[i];
    if (sorting[option.key]) {
      list += `<li class="mdc-list-item" role="menuitem" data-value="${option.value}">
              <span class="mdc-list-item__ripple"></span>
              <span class="mdc-list-item__text">${option.textContent}</span>
            </li>`;
    }
  }

  otherSortingMenuList.innerHTML = list;
  otherSortingMenuBtnLabel.textContent = sorting.defaultSorting === 'distance' ? 'Distance' : 'A-Z';
};
const initHomeView = () => {
  const { showIntroductoryListView, introductoryListView } = state.settings;
  views.inject('home');
  initFilterOverlay();
  refreshQuickFilter();
  initMainMap();
  initAreaAutocompleteField();
  setDefaultSorting();
  initEventListeners();
  searchLocations()
    .then(() => {
      drawer.initialize(state.settings);
      initDrawerFilterOptions();
      if (showIntroductoryListView) {
        fetchPinnedLocations(() => {
          renderIntroductoryLocations(state.listLocations, true);
          refreshIntroductoryDescription();
          showElement('section#intro');
          refreshIntroductoryCarousel();

          if (introductoryListView.images.length === 0
            && !state.listLocations.length
            && !introductoryListView.description) {
            showElement('#intro div.empty-page');
          }
          // eslint-disable-next-line no-new
          new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));
        });
      } else {
        renderListingLocations(state.listLocations);
        showMapView();
      }
    });
};

const calculateLocationDistance = (address) => {
  const { userPosition } = state;
  if (!userPosition) return null;

  const destination = { latitude: address.lat, longitude: address.lng };
  const distance = buildfire.geo.calculateDistance(userPosition, destination, { decimalPlaces: 5 });
  let result;
  if (distance < 0.2) {
    result = `${Math.round(distance * 5280).toLocaleString()} ft`;
  } else if (state.settings.measurementUnit === 'metric') {
    result = `${Math.round(distance * 1.60934).toLocaleString()} km`;
  } else {
    result = `${Math.round(distance).toLocaleString()} mi`;
  }
  return result;
};

const setLocationsDistance = () => {
  state.listLocations = state.listLocations.map((location) => {
    const distance = calculateLocationDistance(location.coordinates);
    const distanceSelector = document.querySelector(`.location-item[data-id="${location.id}"] .location-item__actions p`);
    const imageDistanceSelector = document.querySelector(`.location-image-item .location-image-item__header p`);

    if (distanceSelector) distanceSelector.textContent = distance;
    if (imageDistanceSelector) imageDistanceSelector.textContent = distance;
    return { ...location, ...{ distance } };
  });
  if (state.selectedLocation) {
    state.selectedLocation.distance = calculateLocationDistance(state.selectedLocation.coordinates);
    const locationDetailSelector = document.querySelector('.location-detail__address p:last-child');
    locationDetailSelector.childNodes[0].nodeValue = state.selectedLocation.distance;
  }
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

const handleCPSync = (message) => {
  const outdatedSettings = { ...state.settings };
  const { scope } = message;

  if (scope === 'design') {
    refreshSettings()
      .then(() => {
        // current design
        const d = state.settings.design;
        // outdated design
        const o = outdatedSettings.design;

        if (d.listViewStyle !== o.listViewStyle) {
          hideFilterOverlay();
          navigateTo('home');
          showMapView();
          clearMapViewList();
          renderListingLocations(state.listLocations);
        } else if (d.listViewPosition !== o.listViewPosition) {
          hideFilterOverlay();
          navigateTo('home');
          showMapView();
          drawer.reset(d.listViewPosition);
        } else if (d.detailsMapPosition !== o.detailsMapPosition || d.showDetailsCategory !== o.showDetailsCategory) {
          if (state.listLocations.length > 0) {
            [state.selectedLocation] = state.listLocations;
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
    refreshSettings()
      .then(() => {
        const f = state.settings.filter;
        const of = outdatedSettings.filter;
        const ms = state.settings.map;
        const oms = outdatedSettings.map;

        if (Object.keys(deepObjectDiff(state.settings.sorting, outdatedSettings.sorting)).length) {
          hideFilterOverlay();
          navigateTo('home');
          showMapView();
          initDrawerFilterOptions();
        } else if (f.allowFilterByArea !== of.allowFilterByArea) {
          const areaSearchInput = document.querySelector('#areaSearchLabel');
          if (areaSearchInput?.style.display === 'block' && !f.allowFilterByArea) {
            showElement('.header-qf');
            hideElement('#areaSearchLabel');
          }
        } else if (state.settings.measurementUnit !== outdatedSettings.measurementUnit) {
          setLocationsDistance();
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
    refreshSettings()
      .then(() => {
        if (state.settings.showIntroductoryListView) {
          const container = document.querySelector('#introLocationsList');
          container.innerHTML = '';
          fetchPinnedLocations(() => {
            renderIntroductoryLocations(state.listLocations, true);
            refreshIntroductoryDescription();
            hideFilterOverlay();
            navigateTo('home');
            showElement('section#intro');
            hideElement('section#listing');
            refreshIntroductoryCarousel();
            if (state.settings.introductoryListView.images.length === 0
              && state.listLocations.length === 0
              && !state.settings.introductoryListView.description) {
              showElement('#intro div.empty-page');
            }
            // eslint-disable-next-line no-new
            new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));
          });
        } else if (getComputedStyle(document.querySelector('section#intro'), null).display !== 'none') {
          showMapView();
        }
      });
  } else if (scope === 'locations') {
    const { data, realtimeUpdate, isCancel } = message;
    if (realtimeUpdate) {
      state.selectedLocation = {
        id: 'tmp-location',
        title: 'Location Title',
        subtitle: 'Location Subtitle',
        formattedAddress: 'Location Address',
        coordinates: DEFAULT_LOCATION,
        categories: {
          main: [],
          subcategories: []
        },
        settings: {},
        description: 'Location description',
        rating: {
          total: 0,
          count: 0,
          average: 0
        },
        bookmarksCount: 0
      };
      if (data && Object.keys(data).length > 0) {
        for (const [key, value] of Object.entries(data)) {
          if (value) {
            state.selectedLocation[key] = value;
          }
        }
      }
      hideFilterOverlay();
      showLocationDetail();
    } else if (isCancel) {
      buildfire.history.pop();
    } else {
      hideFilterOverlay();
      navigateTo('home');
      showMapView();
    }
  } else if (scope === 'category') {
    refreshCategories()
      .then(() => {
        initFilterOverlay();
        showFilterOverlay();
        refreshQuickFilter();
      });
  }
};

const getDataHandler = (deeplinkData) => {
  console.log('getData deeplinkData: ', deeplinkData);
  if (deeplinkData?.locationId) {
    refreshCategories()
      .then(() => WidgetController.getLocation(deeplinkData.locationId))
      .then((response) => {
        state.selectedLocation = response.data;
        showLocationDetail();
      })
      .catch((err) => {
        console.error('fetch location error: ', err);
      });
  }
};

const onPopHandler = (breadcrumb) => {
  console.log('Breadcrumb popped', breadcrumb);
  console.log('Breadcrumb popped', state.breadcrumbs);
  state.breadcrumbs.pop();
  if (!state.breadcrumbs.length) {
    hideFilterOverlay();
    navigateTo('home');
  } else {
    const page = state.breadcrumbs[state.breadcrumbs.length - 1];
    if (page.name === 'af') {
      showFilterOverlay();
    } else if (page.name === 'detail') {
      hideFilterOverlay();
      showLocationDetail();
    } else {
      hideFilterOverlay();
      navigateTo('home');
    }
    state.breadcrumbs.pop();
  }
};

const onReceivedMessageHandler = (message) => {
  if (message.cmd === 'sync') {
    handleCPSync(message);
  }
  console.log('widget message: ', message);
};
const onRatingHandler = (e) => {
  WidgetController
    .updateLocationRating(state.selectedLocation.id, e.summary)
    .catch((err) => {
      console.error('err updating rating: ', err);
    });
};

const getCurrentUserPosition = () => new Promise((resolve) => {
  let retries = 5;
  const attempt = () => {
    console.info(`attempting to get user position ${retries}`);
    buildfire.geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 1000 }, (err, position) => {
      if (!err) {
        state.userPosition = position.coords;
        resolve();
      } else if (retries > 0) {
        retries -= 1;
        attempt();
      } else {
        console.warn(`failed to get current user position ${err}`);
        resolve();
      }
    });
  };
  attempt();
});

const init = () => {
  initGoogleMapsSDK();

  getCurrentUserPosition()
    .then(refreshSettings)
    .then(() => {
      views.fetch('filter').then(() => { views.inject('filter'); });
      views.fetch('home').then(refreshCategories).then(initHomeView);
      buildfire.deeplink.getData(getDataHandler);
      buildfire.history.onPop(onPopHandler);
      buildfire.messaging.onReceivedMessage = onReceivedMessageHandler;
      buildfire.components.ratingSystem.onRating = onRatingHandler;
      buildfire.appearance.titlebar.show();
    });
};

init();
