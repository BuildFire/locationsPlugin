/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
import buildfire from 'buildfire';
import WidgetController from './widget.controller';
import Location from '../entities/Location';
import Accordion from './js/Accordion';
import MainMap from './js/map/Map';
import state from './js/state';
import constants from './js/constants';
import views from './js/Views';
import IntroSearchService from './services/search/introSearchService';
import MapSearchService from './services/search/mapSearchService';
import {
  convertDateToTime12H,
  convertDateToTime
} from '../utils/datetime';
import {
  showElement,
  hideElement,
  adjustMapHeight,
  navigateTo,
  resetBodyScroll,
  hideOverlays
} from './js/util/ui';
import {
  truncateString,
  bookmarkLocation,
  shareLocation,
  deepObjectDiff,
  transformCategoriesToText,
  cdnImage,
  generateUUID, showToastMessage, addBreadcrumb, isLocationOpen, areArraysEqual, getDistanceString
} from './js/util/helpers';
import  Analytics  from '../utils/analytics';
import '../shared/strings';
import stringsConfig from '../shared/stringsConfig';
import editView from './js/views/editView';
import mapView from './js/views/mapView';
import introView from './js/views/introView';
import mapSearchControl from './js/map/search-control';
import createView from './js/views/createView';
import detailsView from './js/views/detailsView';
import reportAbuse from './js/reportAbuse';
import authManager from '../UserAccessControl/authManager';
import { calculateLocationDistance, setDefaultSorting, setSortMode } from './services';

let SEARCH_TIMOUT;

let mdcSortingMenu;
let mdcPriceMenu;
let chipSet;

if (!buildfire.components.carousel.view.prototype.clear) {
  buildfire.components.carousel.view.prototype.clear = function () {
    return this._removeAll();
  };
}

const refreshSettings = () => WidgetController
  .getAppSettings()
  .then((response) => state.settings = response);

const refreshCategories = () => WidgetController
  .searchCategories({
    sort: { title: 1 }
  })
  .then((result) => state.categories = result);

const refreshQuickFilter = () => {
  const { design, filter, bookmarks } = state.settings;
  const container = document.querySelector('.header-qf');
  const hideQFBtn = document.querySelector('#hideQFBtn');
  let html = '';
  if (chipSet) {
    chipSet.unlisten("MDCChip:interaction", initChipSetInteractionListener);
    chipSet.destroy();
    chipSet = null;
  }

  if (design.hideQuickFilter) {
    hideElement(container);
    hideQFBtn.style.opacity = '0.5';
    if (filter.allowFilterByArea) {
      showElement('#areaSearchLabel');
    }
    return;
  }
  const quickFilterItems = state.categories.slice(0, 10);
  const advancedFilterBtn = document.querySelector('#filterIconBtn');

  if (!quickFilterItems.length) {
    container.innerHTML = `<small class="mdc-theme--text-body d-block text-center margin-top-five margin-bottom-five">${window.strings.get('emptyState.emptyCategories').v}</small>`;
    advancedFilterBtn.classList.add('disabled');
    return;
  }

  if (filter.allowFilterByBookmarks && bookmarks.enabled) {
    html += `<div class="mdc-chip mdc-theme--text-primary-on-background" role="row" id="bookmarksFilterBtn">
        <div class="mdc-chip__ripple"></div>
        <span class="mdc-chip__checkmark"> <svg class="mdc-chip__checkmark-svg" viewBox="-2 -3 30 30">
          <path class="mdc-chip__checkmark-path" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59" /> </svg>
        </span>
        <span role="gridcell">
          <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
            <span class="mdc-chip__text">${window.strings.get('general.bookmarks').v}</span>
          </span>
        </span>
      </div>`;
  }
  html += quickFilterItems.map((n) => `<div class="mdc-chip mdc-theme--text-primary-on-background" role="row" id="${n.id}">
        <div class="mdc-chip__ripple"></div>
        <span class="mdc-chip__checkmark"> <svg class="mdc-chip__checkmark-svg" viewBox="-2 -3 30 30">
          <path class="mdc-chip__checkmark-path" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59" /> </svg>
        </span>
        <span role="gridcell">
          <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
            <span class="mdc-chip__text">${n.title}</span>
          </span>
        </span>
      </div>`).join('\n');

  container.innerHTML = html;
  const chipSetSelector = document.querySelector('#home .mdc-chip-set');
  chipSet = new mdc.chips.MDCChipSet(chipSetSelector);
  chipSet.listen('MDCChip:interaction', initChipSetInteractionListener);
  setTimeout(() => {
    chipSet.chips.forEach((a) => {
      if (state.filterElements[a.id]?.checked) {
        a.selected = true;
      }
    });
  }, 200);
};

const initChipSetInteractionListener = (event) => {
  const { chipId } = event.detail;
  if (chipId === 'bookmarksFilterBtn') {
    state.searchCriteria.bookmarked = !state.searchCriteria.bookmarked;
  } else if (state.filterElements[chipId]) {
    state.filterElements[chipId].checked = !state.filterElements[chipId].checked;
    refreshAdvancedFilterUI(chipId);
  } else {
    refreshAdvancedFilterUI(chipId);
    state.filterElements[chipId] = { checked: true, subcategories: [] };
  }
  resetResultsBookmark();
  clearAndSearchAllLocation();
};

const clearLocations = () => {
  state.listLocations = [];
  state.searchCriteria.page = 0;
  state.searchCriteria.page2 = 0;
  state.fetchingNextPage = false;
  state.fetchingEndReached = false;
  state.fetchingAllNearReached = false;
  state.searchableTitles = [];
  state.nearestLocation = null;
  state.isMapIdle = false;
  if (state.maps.map) state.maps.map.clearMarkers();
};

const triggerSearchOnMapIdle = () => {
  if (!state.isMapIdle) {
    setTimeout(() => {
      triggerSearchOnMapIdle();
    }, 300);
    return;
  }

  clearLocations();
  searchHandler().then((result) => {
    mapView.clearMapViewList();
    mapView.renderListingLocations(state.listLocations);
  });
};

const fetchOtherLocations = (nearbyLocationsLength) => {
  searchHandler().then((result) => {
    if (result && result.length) {
      if (nearbyLocationsLength) {
        introView.showOtherLocationsMessage();
      }
      introView.renderIntroductoryLocations(result, true);
    }
  });
};

const _handleIntroSearchResponse = (data) => {
  const result = data.aggregateLocations.filter((elem1) => (
    !state.listLocations.find((elem) => elem?.id === elem1?.id)
  )).map((r) => {
    const distance = calculateLocationDistance(r?.coordinates);
    const printedDistanceString = getDistanceString(distance);
    return { ...r, distance: printedDistanceString };
  });

  state.listLocations = state.listLocations.concat(result);
  if (state.searchCriteria.searchValue && !state.listLocations.length && !state.searchableTitles.length) {
    const searchableTitles = data.searchEngineLocations?.hits?.hits?.map((elem) => elem._source.searchable.title);
    if (searchableTitles && searchableTitles.length > 0) {
      state.searchableTitles = searchableTitles;
      return searchHandler();
    }
  }

  // this condition will print the first page of other locations
  // we call it this way to include the case when the near locations are not fet the page which will cause scroll issues
  if (data.printOtherLocationMessage) {
    fetchOtherLocations(result.length);
  }

  return result;
};

const _handleMapSearchResponse = (data) => {
  if (!data.aggregateLocations || !data.aggregateLocations.length) {
    return [];
  }

  const result = data.aggregateLocations.filter((elem1) => (
    !state.listLocations.find((elem) => elem?.id === elem1?.id)
  )).map((r) => {
    const distance = calculateLocationDistance(r?.coordinates);
    const printedDistanceString = getDistanceString(distance);
    return { ...r, distance: printedDistanceString };
  });

  state.listLocations = state.listLocations.concat(result);
  if (state.searchCriteria.sort.sortBy === 'distance' && state.userPosition && state.userPosition.latitude && state.userPosition.longitude) {
    result.sort((a, b) => a.distance.split(" ")[0] - b.distance.split(" ")[0]);
    state.listLocations.sort((a, b) => a.distance.split(" ")[0] - b.distance.split(" ")[0]);
  }

  if (state.searchCriteria.searchValue
    && !state.listLocations.length
    && !state.nearestLocation
    && data.nearestLocation
    && state.checkNearLocation) {
    state.nearestLocation = data.nearestLocation;
    state.checkNearLocation = false;
    const latLng = new google.maps.LatLng(state.nearestLocation.coordinates.lat, state.nearestLocation.coordinates.lng);
    state.maps.map.center(latLng);
    state.maps.map.setZoom(10);
    triggerSearchOnMapIdle();
  } else if (state.searchCriteria.searchValue
    && !state.listLocations.length
    && !state.searchableTitles.length) {
    const searchableTitles = data.searchEngineLocations?.hits?.hits?.map((elem) => (elem._source.searchable.title));
    if (searchableTitles && searchableTitles.length > 0) {
      state.searchableTitles = searchableTitles;
      return searchHandler();
    }
  }

  mapSearchControl.refresh();

  // Render Map listLocations
  mapView.renderListingLocations(result);

  if (!state.fetchingEndReached && state.listLocations.length < 200) {
    return searchHandler();
  }

  return result;
};

const searchHandler = () => (
  new Promise((resolve, reject) => {
    const { showIntroductoryListView } = state.settings;
    const activeTemplate = getComputedStyle(document.querySelector('section#listing'), null).display !== 'none' ? 'listing' : 'intro';
    state.fetchingNextPage = true;

    if (activeTemplate === 'intro' && showIntroductoryListView) {
      // fetch locations within intro list view
      IntroSearchService.searchIntroLocations().then((data) => resolve(_handleIntroSearchResponse(data)));
    } else {
      // fetch locations within map view
      MapSearchService.searchLocations().then((data) => resolve(_handleMapSearchResponse(data)));
    }
  })
);

const clearAndSearchAllLocation = () => {
  clearLocations();
  hideElement("div.empty-page");
  mapView.clearMapViewList();
  searchHandler().then(() => {
    prepareIntroViewList();
    mapView.renderListingLocations(state.listLocations);
  });
};

const prepareIntroViewList = () => {
  introView.clearIntroViewList();
  introView.renderIntroductoryLocations(state.listLocations, true);
  if (state.listLocations.length === 0 && (!state.pinnedLocations.length || state.pinnedLocations.length === 0)) {
    showElement("div.empty-page");
  }
};

const refreshIntroductoryDescription = () => {
  if (state.settings.introductoryListView.description) {
    const container = document.querySelector('.intro-details');
    container.innerHTML = state.settings.introductoryListView.description;
  }
};

const showFilterOverlay = () => {
  buildfire.components.swipeableDrawer.hide();
  const overlay = document.querySelector('section#filter');
  const currentActive = document.querySelector('section.active');

  currentActive?.classList.remove('active');
  overlay.classList.add('overlay');
  addBreadcrumb({ pageName: 'af' });
  state.currentFilterElements = JSON.parse(JSON.stringify(state.filterElements));
};

const refreshAdvancedFilterUI = (chipId) => {
  const expansionPanelCheckBox = document.querySelectorAll('#filter .mdc-checkbox input');
  Array.from(expansionPanelCheckBox).forEach((target) => {
    const parent = target.closest('div.expansion-panel');
    const categoryId = parent.dataset.cid;

    if (categoryId === chipId) {
      const category = state.categories.find((c) => c.id === categoryId);
      const checked = state.filterElements[categoryId]?.checked || false;
      target.checked = checked;
      target.indeterminate = false;
      state.filterElements[categoryId].subcategories = checked ? category.subcategories.map((c) => c.id) : [];
      if (chipSets[categoryId]) {
        chipSets[categoryId].chips.forEach((c) => c.selected = checked);
      }
    }
  });
};

const showLocationDetail = () => {
  const { selectedLocation } = state;

  views
    .fetch('detail')
    .then(() => {
      views.inject('detail');
      window.strings.inject(document.querySelector('section#detail'), false);
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
            workingHoursBtnLabel: document.querySelector('#topWorkingHoursBtn .mdc-button__label'),
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
            workingHoursBtnLabel: document.querySelector('#coverWorkingHoursBtn .mdc-button__label'),
          }
        };
        selectors.main.style.display = 'flex';
        selectors.rating.classList.add('location-detail__rating--dual-shadow');
      }

      detailsView.renderLocationActions();

      if (selectedLocation.images?.length > 0) {
        if (pageMapPosition === 'top') {
          selectors.cover.style.backgroundImage = `linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url('${buildfire.imageLib.cropImage(selectedLocation.images[0].imageUrl, { size: "full_width", aspect: "16:9" })}')`;
          selectors.cover.style.display = 'block';
        } else {
          selectors.main.style.backgroundImage = `linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url('${buildfire.imageLib.cropImage(selectedLocation.images[0].imageUrl, { size: "full_width", aspect: "16:9" })}')`;
        }
      }

      if (!selectedLocation.coordinates.lat || !selectedLocation.coordinates.lng) {
        selectedLocation.coordinates = constants.getDefaultLocation();
      }
      selectors.map.style.display = 'block';
      const detailMap = new MainMap(selectors.map, {
        mapTypeControl: true,
        disableDefaultUI: true,
        center: { lat: selectedLocation.coordinates.lat, lng: selectedLocation.coordinates.lng },
        zoom: 14,
      });

      detailMap.addMarker(selectedLocation, () => {});

      selectors.title.textContent = truncateString(selectedLocation.title, 30);
      selectors.subtitle.textContent = truncateString(selectedLocation.subtitle ?? '', 50);
      selectors.address.textContent = selectedLocation.formattedAddress;
      selectors.description.innerHTML = selectedLocation.description;
      selectors.distance.childNodes[0].nodeValue = selectedLocation.distance;

      if (state.settings.design?.showDetailsCategory && selectedLocation.settings.showCategory) {
        selectors.categories.textContent = transformCategoriesToText(selectedLocation.categories, state.categories);
        selectors.categories.style.display = 'block';
      }

      if (!selectedLocation.settings.showOpeningHours) {
        selectors.workingHoursBtn.style.display = 'none';
      } else {
        selectors.workingHoursBtnLabel.textContent = window.strings.get(isLocationOpen(selectedLocation) ? 'general.open' : 'general.closed').v;
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
      ${a.iconUrl ? `<img src="${cdnImage(a.iconUrl)}" alt="action-image">` : a.iconClassName ? `<i class="custom-action-item-icon ${a.iconClassName}"></i>` : ''}
        <div class="mdc-chip mdc-theme--text-primary-on-background" role="row">
          <div class="mdc-chip__ripple"></div>
          <span role="gridcell">
            <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
              <span class="mdc-chip__text">${a.title}</span>
            </span>
          </span>
        </div>
      </div>`).join('\n');
      selectors.carousel.innerHTML = selectedLocation.images.map((n) => `<div style="background-image: url('${buildfire.imageLib.cropImage(n.imageUrl, { size: "full_width", aspect: "1:1" })}');" data-id="${n.id}"></div>`).join('\n');
      addBreadcrumb({ pageName: 'detail', title: 'Location Detail' });
      resetBodyScroll();
      navigateTo('detail');
      if (selectedLocation.id) {
        WidgetController.updateLocation(selectedLocation.id, { $inc: { views: 1 } });
        Analytics.viewed(selectedLocation.id, {});
      }
    });
};

const showWorkingHoursDrawer = () => {
  const { days } = state.selectedLocation.openingHours;
  const { time } = state.settings.locationEditors;
  buildfire.components.drawer.open(
    {
      header: window.strings.get('general.openHours').v,
      content: `<table style="width: 100%;border-collapse: separate;border-spacing: 10px; border: none;">
      ${Object.entries(days).map(([day, prop]) => `<tr>
        <td style="vertical-align: top; font-weight: bold; text-transform: capitalize;">${window.strings.get(`general.${day}`).v}</td>
        <td style="vertical-align: top;">
          ${!prop.active ? window.strings.get('general.closed').v : prop.intervals.map((t, i) => `<p style="margin: ${i > 0 ? '10px 0 0' : '0'};">${time == "12H" ? convertDateToTime12H(t.from) : convertDateToTime(t.from)} - ${time == "12H" ? convertDateToTime12H(
    t.to
  ) : convertDateToTime(t.to)}</p>`).join('\n')}
        </td>
      </tr>`).join('\n')}
    </table>`,
      isHTML: true,
      enableFilter: false
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
  let actionItem = state.listLocations
    .reduce((prev, next) => prev.concat(next.actionItems), [])
    .find((entity) => entity.id === actionItemId);

  if (!actionItem) {
    actionItem = state.pinnedLocations
      .reduce((prev, next) => prev.concat(next.actionItems), [])
      .find((entity) => entity.id === actionItemId);
  }
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
      searchHandler()
        .then((result) => {
          result.forEach((location) => state.maps.map.addMarker(location, handleMarkerClick));
          introView.renderIntroductoryLocations(result);
        });
    }
  }
};

const fetchMoreListLocations = (e) => {
  if (state.fetchingNextPage || state.fetchingEndReached) return;
  const listContainer = document.querySelector('#listingLocationsList');
  if (e.target.scrollTop + e.target.offsetHeight > listContainer.offsetHeight) {
    searchHandler().then((result) => {
      result.forEach((location) => state.maps.map.addMarker(location, handleMarkerClick));
    });
  }
};

const viewFullImage = (url, selectedId) => {
  const images = [];
  const index = url.findIndex((x) => x.id === selectedId);
  url.forEach((image) => {
    images.push(image.imageUrl);
  });
  buildfire.imagePreviewer.show({ images, index });
};

const fetchPinnedLocations = (done) => {
  WidgetController
    .getPinnedLocations()
    .then((locations) => {
      state.pinnedLocations = locations.result.map((r) => {
        const distance = calculateLocationDistance(r?.coordinates);
        const printedDistanceString = getDistanceString(distance);
        return { ...r, distance: printedDistanceString };
      });
      done(null, state.pinnedLocations);
    })
    .catch((err) => {
      console.error('error fetching pinned locations: ', err);
    });
};
const clearAndSearchLocations = () => {
  clearLocations();
  searchHandler()
    .then((result) => {
      result.forEach((location) => state.maps.map.addMarker(location, handleMarkerClick));
      prepareIntroViewList();
      mapView.clearMapViewList();
      mapView.renderListingLocations(state.listLocations);
    });
};
const clearAndSearchWithDelay = () => {
  if (SEARCH_TIMOUT) clearTimeout(SEARCH_TIMOUT);
  SEARCH_TIMOUT = setTimeout(clearAndSearchLocations, 500);
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
        console.log(`Geocoder failed due to: ${status}`);
      }
    }
  );
};

const getDirections = () => {
  Analytics.locationDirectionsUsed();
  const { selectedLocation } = state;
  if (selectedLocation.coordinates?.lat && selectedLocation.coordinates?.lng) {
    buildfire.getContext((err, context) => {
      if (context && context.device && context.device.platform.toLowerCase() === 'ios') {
        buildfire.navigation.openWindow(`https://maps.apple.com/?q=${selectedLocation.title}&t=m&daddr=${selectedLocation.coordinates?.lat},${selectedLocation.coordinates?.lng}`, '_system');
      } else {
        buildfire.navigation.openWindow(`http://maps.google.com/maps?daddr=${selectedLocation.coordinates?.lat},${selectedLocation.coordinates?.lng}`, '_system');
      }
    });
  }
};

const initEventListeners = () => {
  window.addEventListener('resize', () => {
    initDrawer();
    const currentActive = document.querySelector('section.active');

    if (currentActive.id === 'home' && document.querySelector('section#intro').style.display === "none") {
      buildfire.components.swipeableDrawer.show();
    }
  }, true);
  document.querySelector('body').addEventListener('scroll', fetchMoreIntroductoryLocations, false);
  document.addEventListener('focus', (e) => {
    if (!e.target) return;

    if (e.target.id === 'searchTextField' && state.settings.filter.allowFilterByArea) {
      showElement('#areaSearchLabel');
      hideElement('.header-qf');
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (!e.target) return;

    if (e.target.id === 'reportAbuseBtn') {
      reportAbuse.report({ id: state.selectedLocation.id, createdBy: state.selectedLocation.createdBy._id });
    } if (e.target.id === 'moreOptionsBtn') {
      detailsView.showLocationDetailDrawer(e);
    } if (e.target.id === 'bookmarkResultsBtn') {
      bookmarkSearchResults(e);
    } else if (e.target.classList.contains('bookmark-location-btn')) {
      const locationId = e.target.closest('[data-id]')?.dataset?.id;
      bookmarkLocation(locationId, e);
    } else if (e.target.id === 'bookmarkLocationBtn') {
      bookmarkLocation(state.selectedLocation.id, e);
    } else if (e.target.id === 'addPhotosBtn') {
      detailsView.addLocationPhotos();
    } else if (e.target.id === 'editLocationBtn') {
      Analytics.inAppEditUsed();
      editView.init();
    } else if (e.target.id === 'locationDirectionsBtn') {
      getDirections();
    } else if (e.target.id === 'createNewLocationBtn') {
      createView.navigateTo();
    } else if (e.target.id === 'searchLocationsBtn') {
      state.searchCriteria.searchValue = e.target.value;
      clearAndSearchWithDelay();
    } else if (e.target.id === 'filterIconBtn') {
      showFilterOverlay();
    } else if (e.target.id === 'hideQFBtn' && !state.settings.design.hideQuickFilter) {
      hideElement('#areaSearchLabel');
      showElement('.header-qf');
    } else if (e.target.id === 'showMapView') {
      showMapView();
      initMapLocations();
    } else if (e.target.id === 'priceSortingBtn') {
      buildfire.components.swipeableDrawer.setStep('max');
      setTimeout(() => { mdcPriceMenu.open = true; }, 200);
    } else if (e.target.id === 'otherSortingBtn') {
      buildfire.components.swipeableDrawer.setStep('max');
      setTimeout(() => { mdcSortingMenu.open = true; }, 200);
    } else if (e.target.classList.contains('location-item') || e.target.classList.contains('location-image-item') || e.target.classList.contains('location-summary'))  {
      state.selectedLocation = state.pinnedLocations.concat(state.listLocations).find((i) => i.id === e.target.dataset.id);
      showLocationDetail();
    } else if (['topWorkingHoursBtn', 'coverWorkingHoursBtn'].includes(e.target.id)) {
      showWorkingHoursDrawer();
    } else if (e.target.id === 'shareLocationBtn') {
      shareLocation();
    } else if (e.target.classList?.contains('list-action-item') || e.target.dataset?.actionId) {
      handleListActionItem(e);
    } else if (e.target.parentNode?.classList?.contains('location-detail__carousel')) {
      const selectedId = e.target.getAttribute("data-id");
      viewFullImage(state.selectedLocation.images, selectedId);
    } else if (e.target.parentNode?.classList?.contains('action-item')) {
      handleDetailActionItem(e);
    } else if (e.target.id === 'mapCenterBtn') {
      if (state.maps.map && state.userPosition && state.userPosition.latitude && state.userPosition.longitude) {
        getFormattedAddress({ lat: state.userPosition.latitude, lng: state.userPosition.longitude }, (err, address) => {
          state.maps.map.center({ lat: state.userPosition.latitude, lng: state.userPosition.longitude });
          state.maps.map.setZoom(10);
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
      state.checkNearLocation  = true;
      resetResultsBookmark();
      clearAndSearchWithDelay();
    }

    // this is to refresh only
    if (keyCode === 13 && e.target.id === 'searchTextField' && value) {
      state.searchCriteria.searchValue = value;
      state.checkNearLocation  = true;
      resetResultsBookmark();
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
      state.maps.map.setZoom(10);
    }
    fillAreaSearchField(positionPoints);
  };
};
const chipSets = {};
const initFilterOverlay = (isInitialized, newcategories) => {
  let categories;
  if (isInitialized) {
    categories = state.categories;
  } else {
    categories = newcategories;
  }
  let html = '';
  const container = document.querySelector('#filter .expansion-panel__container .accordion');
  categories.forEach((category) => {
    let categoryIcon = `<i class="custom-category-icon ${category.iconClassName ?? 'bf-icon bf-icon-geo-alt'}"></i>`;
    if (category.iconUrl) {
      categoryIcon = `<img src="${category.iconUrl}" alt="category icon">`;
    }
    state.filterElements[category.id] = { checked: false, subcategories: [] };
    html += `<div class="expansion-panel" data-cid="${category.id}">
        <button class="expansion-panel-header mdc-ripple-surface">
          <div class="expansion-panel-header-content">
            <span class="expansion-panel-title mdc-theme--text-primary-on-background">
              ${categoryIcon}
              <span>${category.title}</span>
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
              <div style="opacity: ${category.subcategories.length > 0 ? 1 : 0}"  class="expansion-panel-indicator mdc-theme--text-primary-on-background"></div>
            </div>
          </div>
        </button>
        <div class="expansion-panel-body">
        ${category.subcategories.length > 0 ? `<div class="mdc-chip-set mdc-chip-set--filter expansion-panel-body-content" role="grid">
        ${category.subcategories.map((subcategory) => `<div class="mdc-chip mdc-theme--text-primary-on-background" role="row" data-sid="${subcategory.id}">
            <div class="mdc-chip__ripple"></div>
            <i class="material-icons-outlined mdc-chip__icon mdc-chip__icon--leading mdc-theme--text-primary-on-background">fmd_good</i>
            <span class="mdc-chip__checkmark">
              <svg class="mdc-chip__checkmark-svg" viewBox="-2 -3 30 30">
                <path class="mdc-chip__checkmark-path" fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59" /> </svg>
            </span>
            <span role="gridcell">
              <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                <span class="mdc-chip__text">${subcategory.title}</span>
              </span>
            </span>
          </div>`).join('\n')}
      </div>` : ""}

      </div>
      </div>`;
  });
  if (isInitialized) {
    container.innerHTML = html;
  } else {
    container.innerHTML += html;
  }

  new Accordion({
    element: container,
    multi: true
  });

  const chipSetsElements = document.querySelectorAll('#filter .mdc-chip-set');

  Array.from(chipSetsElements).forEach((c) => {
    const parent = c.closest('div.expansion-panel');
    chipSets[parent.dataset.cid] = new mdc.chips.MDCChipSet(c);
  });

  const expansionPanelCheckBox = document.querySelectorAll('#filter .mdc-checkbox input');
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
    if (chipSets[categoryId]) {
      chipSets[categoryId].chips.forEach((c) => {
        const { sid } = c.root_.dataset;
        if (target.checked && !state.filterElements[categoryId]?.subcategories.includes(sid)) {
          state.filterElements[categoryId].subcategories.push(sid);
        }
        c.selected = target.checked;
      });
    }

    target.disabled = true;
    mdcCheckBox.classList.add('mdc-checkbox--disabled');
    resetResultsBookmark();
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
    resetResultsBookmark();
    setTimeout(() => mdcChip.classList.remove('disabled'), 500);
  }));
};

const showMapView = () => {
  addBreadcrumb({ pageName: 'Map', title: 'Map View' });
  hideElement('section#intro');
  showElement('section#listing');
  clearAndSearchAllLocation();
  buildfire.components.swipeableDrawer.show();
  Analytics.mapListUsed();
};

const initAreaAutocompleteField = (textfield, callback) => {
  const areaSearchTextField = document.querySelector(`#${textfield}`);
  const autocomplete = new google.maps.places.SearchBox(
    areaSearchTextField,
    {
      types: ["address"],
    }
  );

  // fix fast click is preventing touch on places list
  setTimeout(() => {
    const target = document.querySelector('.pac-container');
    if (target) {
      const observer = new MutationObserver(() => {
        document.querySelectorAll('.pac-item span, .pac-item')
          .forEach((n) => n.classList.add('needsclick'));
      });
      observer.observe(target, { childList: true });
    }
    console.log('observer target :', target);
  }, 2000);

  callback(autocomplete);
};

const generateMapOptions = () => {
  const areaSearchTextField = document.querySelector('#areaSearchTextField');
  const selector = document.getElementById('mainMapContainer');
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
    selector.classList.add('dark');
    options.styles = options.styles.concat(constants.getMapStyle('nightMode'));
  } else {
    selector.classList.remove('dark');
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
    areaSearchTextField.value = map.initialAreaDisplayAddress || window.strings.get('general.notAvailable').v;
  } else if (userPosition) {
    options.center = {
      lat: userPosition.latitude,
      lng: userPosition.longitude
    };
    state.currentLocation = { lat: userPosition.latitude, lng: userPosition.longitude };
  } else {
    options.center = constants.getDefaultLocation();
    state.currentLocation = constants.getDefaultLocation();
  }

  return options;
};

const fillAreaSearchField = (coords) => {
  const areaSearchTextField = document.querySelector('#areaSearchTextField');
  getFormattedAddress(coords, (err, address) => {
    areaSearchTextField.value = address;
  });
};

const findViewPortLocations = () => {
  if (SEARCH_TIMOUT) clearTimeout(SEARCH_TIMOUT);
  SEARCH_TIMOUT = setTimeout(() => {
    if (state.viewportHasChanged) {
      clearLocations();
      mapView.clearMapViewList();
    }

    searchHandler().then((result) => {
      result.forEach((location) => state.maps.map.addMarker(location, handleMarkerClick));
    });
  }, 300);

  mapSearchControl.hide();
};

const initMainMap = () => {
  const selector = document.getElementById('mainMapContainer');
  const options = generateMapOptions();
  const { userPosition } = state;
  state.maps.map = new MainMap(selector, options);
  state.maps.map.onBoundsChange = () => {
    state.isMapIdle = false;
    state.viewportHasChanged = true;
    mapSearchControl.setLabel('FIND_IN_AREA');
    resetResultsBookmark();
    // handle hiding opened location
    const locationSummary = document.querySelector('#locationSummary');
    if (locationSummary && locationSummary.classList.contains('slide-in')) {
      locationSummary.classList.add('slide-out');
      locationSummary.classList.remove('slide-in');
    }
  };

  state.maps.map.onMapIdle = () => {
    state.isMapIdle = true;
    mapSearchControl.show();
  };

  mapSearchControl.init(findViewPortLocations);
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

window.addEventListener("click", (e) => {
  const locationContainer = document.querySelector('#locationSummary');

  if (!locationContainer.contains(e.target) && !locationContainer.classList.contains('transition-in-progress')) {
    locationContainer.classList.add('slide-out');
    locationContainer.classList.remove('slide-in');
  }
});

const handleMarkerClick = (location) => {
  const summaryContainer = document.querySelector('#locationSummary');
  const { bookmarks } = state.settings;
  summaryContainer.innerHTML = `<div data-id="${location.id}" class="mdc-ripple-surface pointer location-summary" style="background-image: linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url('${location.listImage ? buildfire.imageLib.cropImage(location.listImage, { size: "xl", aspect: "16:9" }) : './images/default-location-cover.png'}');">
            <div class="location-summary__header">
              <p>${location.distance ? location.distance : '--'}</p>
              <i class="material-icons-outlined mdc-text-field__icon pointer-all bookmark-location-btn" tabindex="0" role="button" style="visibility: ${!bookmarks.enabled || !bookmarks.allowForLocations ? 'hidden' : 'visible'};">${state.bookmarks.find((l) => l.id === location.clientId) ? 'star' : 'star_outline'}</i>
            </div>
            <div class="location-summary__body">
              <p class="margin-bottom-five">${location.title}</p>
              <p class="margin-top-zero">${transformCategoriesToText(location.categories, state.categories)}</p>
              <p>
                <span>${location.addressAlias ?? location.subtitle ?? ''}</span>
              </p>
            </div>
            <div class="mdc-chip-set" role="grid">
              ${location.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip mdc-theme--text-primary-on-background" role="row" data-action-id="${a.id}">
                <div class="mdc-chip__ripple"></div>
                <span role="gridcell">
                    <span role="checkbox" tabindex="0" aria-checked="true" class="mdc-chip__primary-action">
                      <span class="mdc-chip__text">${a.title}</span>
                    </span>
                  </span>
              </div>`).join('\n')}
            </div>
          </div>`;
  buildfire.components.swipeableDrawer.setStep('min');
  summaryContainer.classList.remove('slide-out');
  // transition-in-progress class is added to track css transitioning start/stop
  summaryContainer.classList.add('slide-in', 'transition-in-progress');
  setTimeout(() => {
    summaryContainer.classList.remove('transition-in-progress');
  }, 500);
};

const initDrawer = () => {
  let position = state.settings.design?.listViewPosition === "collapsed" ? "min" : state.settings.design?.listViewPosition === "expanded" ? "max" : "mid";
  buildfire.components.swipeableDrawer.initialize({
    startingStep: position,
    mode: "steps",
    transitionDuration: 125
  }, () => {

    let bookmarksTemplate = document.getElementById("bookmarksTemplate");
    let bookmarksTemplateClone = bookmarksTemplate.cloneNode(true);

    let filterOptionsTemplate = document.getElementById("filterOptionsTemplate");
    let filterOptionsTemplateClone = filterOptionsTemplate.cloneNode(true);

    let bodyContentTemplate = document.getElementById("bodyContentTemplate");
    let bodyContentTemplateClone = bodyContentTemplate.cloneNode(true);
    buildfire.components.swipeableDrawer.setHeaderContent(bookmarksTemplateClone.innerHTML + filterOptionsTemplateClone.innerHTML);
    buildfire.components.swipeableDrawer.setBodyContent(bodyContentTemplateClone);
    initDrawerFilterOptions();

    document.querySelector('.swipeable-drawer-content').addEventListener('scroll', fetchMoreListLocations, false);

    const openNowSortingBtn = document.querySelector('#openNowSortingBtn');
    openNowSortingBtn.onclick = () => {
      state.searchCriteria.openingNow = !state.searchCriteria.openingNow;
      if (state.searchCriteria.openingNow) {
        openNowSortingBtn.classList.add('selected');
      } else {
        openNowSortingBtn.classList.remove('selected');
      }
      state.checkNearLocation = true;
      resetResultsBookmark();
      clearAndSearchWithDelay();
    };
  });

  buildfire.components.swipeableDrawer.onStepChange = (step) => {
    const { sorting, filter } = state.settings;
    const headerHasButtons = (!sorting.hideSorting || !filter.hidePriceFilter || !filter.hideOpeningHoursFilter);
    if (step === "min" && headerHasButtons) {
      document.querySelector('.bookmark-result').classList.remove('margin-bottom-twenty');
      document.querySelector('.bookmark-result').classList.add('margin-bottom-thirty');
    } else {
      document.querySelector('.bookmark-result').classList.add('margin-bottom-twenty');
      document.querySelector('.bookmark-result').classList.remove('margin-bottom-thirty');
    }
  };
};

const initDrawerFilterOptions = () => {
  const { sorting, bookmarks, filter } = state.settings;
  const otherSortingContainer = document.querySelector('.other-sorting-container');
  const priceFilterContainer = document.querySelector('.price-filter-container');
  const drawerHeaderContainer = document.querySelector('.swipeable-drawer-header');
  const openNowFilterBtn = document.querySelector('#openNowSortingBtn');
  const otherSortingMenuList = document.querySelector('.other-sorting-menu ul');
  const otherSortingMenuBtnLabel = document.querySelector('#otherSortingBtn .mdc-button__label');
  const bookmarksContainer = document.querySelector('.bookmark-result');
  const isEmptyHeader = (!bookmarks.enabled || !bookmarks.allowForFilters) && sorting.hideSorting && filter.hidePriceFilter && filter.hideOpeningHoursFilter;
  const sortingOptions = [
    {
      key: 'allowSortByReverseAlphabetical',
      value: 'Z-A',
      textContent: window.strings.get('sortingOptions.alphabeticalDsc').v
    },
    {
      key: 'allowSortByNearest',
      value: 'distance',
      textContent: window.strings.get('sortingOptions.distance').v
    },
    {
      key: 'allowSortByRating',
      value: 'rating',
      textContent: window.strings.get('sortingOptions.recommended').v
    },
    {
      key: 'allowSortByPriceHighToLow',
      value: 'price-high-low',
      textContent: window.strings.get('sortingOptions.priceDsc').v
    },
    {
      key: 'allowSortByPriceLowToHigh',
      value: 'price-low-high',
      textContent: window.strings.get('sortingOptions.priceAsc').v
    },
    {
      key: 'allowSortByDate',
      value: 'date',
      textContent: window.strings.get('sortingOptions.recent').v
    },
    {
      key: 'allowSortByViews',
      value: 'views',
      textContent: window.strings.get('sortingOptions.mostViewed').v
    }
  ];

  [otherSortingContainer, priceFilterContainer, openNowFilterBtn, bookmarksContainer].forEach((el) => hideElement(el));

  if (bookmarks.enabled && bookmarks.allowForFilters) {
    bookmarksContainer.style.display = 'flex';
  }
  if (!sorting.hideSorting) {
    const otherSortingMenuBtn = document.querySelector('#otherSortingBtn');
    mdcSortingMenu = new mdc.menu.MDCMenu(document.querySelector('.other-sorting-menu'));
    let list = `<li class="mdc-list-item" role="menuitem" data-value="A-Z">
              <span class="mdc-list-item__ripple"></span>
              <span class="mdc-list-item__text">${window.strings.get('sortingOptions.alphabeticalAsc').v}</span>
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
    otherSortingMenuBtnLabel.textContent = window.strings.get(sorting.defaultSorting === 'distance' ? 'sortingOptions.distance' : 'sortingOptions.alphabeticalAsc').v;
    mdcSortingMenu.listen('MDCMenu:selected', (event) => {
      const value = event.detail.item.getAttribute('data-value');
      otherSortingMenuBtnLabel.textContent = event.detail.item.querySelector('.mdc-list-item__text').textContent;
      otherSortingMenuBtn.style.setProperty('background-color', 'var(--mdc-theme-primary)', 'important');

      setSortMode(value);
      resetResultsBookmark();
      clearAndSearchWithDelay();
    });
    showElement(otherSortingContainer);
  }
  if (!filter.hidePriceFilter) {
    mdcPriceMenu = new mdc.menu.MDCMenu(document.querySelector('.price-filter-menu'));
    const priceSortingBtnLabel = document.querySelector('#priceSortingBtn .mdc-button__label');
    const priceSortingBtn = document.querySelector('#priceSortingBtn');
    mdcPriceMenu.listen('MDCMenu:selected', (event) => {
      const value = event.detail.item.getAttribute('data-value');
      if (value === '0') {
        state.searchCriteria.priceRange = null;
        priceSortingBtnLabel.textContent = window.strings?.get('general.price')?.v;
        priceSortingBtn.style.removeProperty('background-color');
      } else {
        state.searchCriteria.priceRange = Number(value);
        state.checkNearLocation  = true;
        priceSortingBtnLabel.textContent = event.detail.item.querySelector('.mdc-list-item__text').textContent;
        priceSortingBtn.style.setProperty('background-color', 'var(--mdc-theme-primary)', 'important');
      }
      resetResultsBookmark();
      clearAndSearchWithDelay();
    });
    showElement(priceFilterContainer);
  }
  if (!filter.hideOpeningHoursFilter) {
    showElement(openNowFilterBtn);
  }
  if (isEmptyHeader && document.querySelector('html').getAttribute('safe-area') === 'true') {
    drawerHeaderContainer.style.paddingBottom = '30px';
  }

  adjustMapHeight();
};
const initHomeView = () => {
  views.inject('home');
  const { showIntroductoryListView } = state.settings;
  refreshQuickFilter();
  initMainMap();
  initAreaAutocompleteField('areaSearchTextField', (autocomplete) => {
    autocomplete.addListener('places_changed', () => {
      const places = autocomplete.getPlaces();
      const place = places[0];

      if (!place || !place.geometry) {
        return;
      }

      const point = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng()
      };

      state.currentLocation = point;
      state.maps.map.center(point);
      state.maps.map.setZoom(10);
      triggerSearchOnMapIdle();
    });
  });
  setDefaultSorting();
  initEventListeners();
  window.strings.inject(document, false);

  initDrawer();

  if (state.deepLinkData?.isResultsBookmark) {
    handleResultsBookmark();
  } else if (showIntroductoryListView) {
    Analytics.listViewUsed();
    initIntroLocations();
  } else {
    showMapView();
    initMapLocations();
  }

  if (state.deepLinkData?.locationId) {
    navigateToLocationId(state.deepLinkData.locationId);
  }
};

const initIntroLocations = () => {
  const { introductoryListView } = state.settings;
  const carouselSkeleton = new buildfire.components.skeleton('.skeleton-carousel', { type: 'image, sentence' }).start();
  const listSkeleton = new buildfire.components.skeleton('.skeleton-wrapper', { type: 'list-item-avatar-two-line, list-item-avatar-two-line, list-item-avatar-two-line, list-item-avatar-two-line' }).start();

  introView.initCreateLocationButton();
  showElement('section#intro');

  fetchPinnedLocations(() => {
    searchHandler().then((result) => {
      introView.renderIntroductoryLocations(state.listLocations, true);

      listSkeleton.stop();
      introView.refreshIntroductoryCarousel();
      carouselSkeleton.stop();
      refreshIntroductoryDescription();

      if (introductoryListView.images.length === 0
        && !state.listLocations.length
        && !state.pinnedLocations.length
        && !introductoryListView.description) {
        showElement('#intro div.empty-page');
      }
      // eslint-disable-next-line no-new
      new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));
    });
  });
};

let attempts = 0;
const initMapLocations = () => {
  if (!state.isMapIdle && attempts <= 3) {
    setTimeout(() => {
      initMapLocations();
    }, 200);
    attempts += 1;
    return;
  }
  attempts = 0;
  clearLocations();
  mapView.clearMapViewList();
  const type = state.settings.design.listViewStyle === 'backgroundImage'
    ? 'image, image, image, image'
    : 'list-item-avatar-two-line, list-item-avatar-two-line, list-item-avatar-two-line, list-item-avatar-two-line, list-item-avatar-two-line, list-item-avatar-two-line, list-item-avatar-two-line';
  const listViewCarousel = new buildfire.components.skeleton('#listingLocationsList', { type }).start();
  searchHandler()
    .then((result) => {
      result.forEach((location) => state.maps.map.addMarker(location, handleMarkerClick));
      introView.clearIntroViewList();
      listViewCarousel.stop();
    });
};

const setLocationsDistance = () => {
  state.listLocations = state.listLocations.map((location) => {
    const distance = calculateLocationDistance(location.coordinates);
    const printedDistanceString = getDistanceString(distance);
    const distanceSelector = document.querySelector(`.location-item[data-id="${location.id}"] .location-item__actions p`);
    const imageDistanceSelector = document.querySelector(`.location-image-item[data-id="${location.id}"] .location-image-item__header p`);

    if (distanceSelector) distanceSelector.textContent = printedDistanceString;
    if (imageDistanceSelector) imageDistanceSelector.textContent = printedDistanceString;
    return { ...location, ...{ distance: printedDistanceString } };
  });
  if (state.selectedLocation) {
    const distance = calculateLocationDistance(state.selectedLocation.coordinates);
    const printedDistanceString = getDistanceString(distance);
    state.selectedLocation.distance = printedDistanceString;
    const locationDetailSelector = document.querySelector('.location-detail__address p:last-child');
    locationDetailSelector.childNodes[0].nodeValue = state.selectedLocation.distance;
  }
};

const initGoogleMapsSDK = () => {
  const { apiKeys } = buildfire.getContext();
  const { googleMapKey } = apiKeys;
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = `https://maps.googleapis.com/maps/api/js?v=weekly${googleMapKey ? `&key=${googleMapKey}` : ''}&libraries=places&callback=googleMapOnLoad`;
  script.onload = () => {
    console.info('Successfully loaded Google\'s Maps SDK.');
  };
  script.onerror = () => {
    buildfire.dialog.alert({
      title: "Error",
      message: "Failed to load map.",
    });
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
          hideOverlays();
          navigateTo('home');
          showMapView();
          mapView.clearMapViewList();
          mapView.renderListingLocations(state.listLocations);
        } else if (d.listViewPosition !== o.listViewPosition) {
          hideOverlays();
          navigateTo('home');
          showMapView();
          let position = state.settings.design?.listViewPosition === "collapsed" ? "min" : state.settings.design?.listViewPosition === "expanded" ? "max" : "mid";
          buildfire.components.swipeableDrawer.setStep(position);
        } else if ((d.detailsMapPosition !== o.detailsMapPosition || d.showDetailsCategory !== o.showDetailsCategory) && state.listLocations.length) {
          [state.selectedLocation] = state.listLocations;
          showLocationDetail();
        } else if (d.hideQuickFilter !== o.hideQuickFilter) {
          const hideQFBtn = document.querySelector('#hideQFBtn');
          if (!d.hideQuickFilter) {
            hideQFBtn.style.opacity = '1';
            refreshQuickFilter();
            hideElement('#areaSearchLabel');
            showElement('.header-qf');
          } else {
            hideQFBtn.style.opacity = '0.5';
            hideElement('.header-qf');
            if (state.settings.filter.allowFilterByArea) {
              showElement('#areaSearchLabel');
            }
          }
          adjustMapHeight();
        } else {
          hideOverlays();
          navigateTo('home');
          showMapView();
          refreshMapOptions();
        }
      });
  } else if (scope === 'settings') {
    window.location.reload();
  } else if (scope === 'intro') {
    refreshSettings()
      .then(() => {
        if (state.settings.showIntroductoryListView) {
          const container = document.querySelector('#introLocationsList');
          container.innerHTML = '';
          setDefaultSorting();
          fetchPinnedLocations(() => clearAndSearchWithDelay());
          refreshIntroductoryDescription();
          hideOverlays();
          navigateTo('home');
          showElement('section#intro');
          hideElement('section#listing');
          introView.refreshIntroductoryCarousel();
          if (state.settings.introductoryListView.images.length === 0
            && state.listLocations.length === 0
            && !state.settings.introductoryListView.description
            && (!state.pinnedLocations.length || state.pinnedLocations.length == 0)) {
            showElement('#intro div.empty-page');
          }
          // eslint-disable-next-line no-new
          new mdc.ripple.MDCRipple(document.querySelector('.mdc-fab'));
        } else if (getComputedStyle(document.querySelector('section#intro'), null).display !== 'none') {
          showMapView();
        }
      });
  } else if (scope === 'locations') {
    const { data, realtimeUpdate, isCancel } = message;
    if (realtimeUpdate) {
      state.selectedLocation = {
        title: 'Location Title',
        subtitle: 'Location Subtitle',
        formattedAddress: 'Location Address',
        coordinates: constants.getDefaultLocation(),
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
      hideOverlays();
      showLocationDetail();
    } else if (isCancel) {
      buildfire.history.pop();
    } else {
      hideOverlays();
      navigateTo('home');
      showMapView();
    }
  } else if (scope === 'category') {
    refreshCategories()
      .then(() => {
        initFilterOverlay(true, null);
        showFilterOverlay();
        refreshQuickFilter();
      });
  } else if (scope === 'strings') {
    window.strings.refresh(() => window.location.reload());
  }
};

const handleResultsBookmark = () => {
  const { deepLinkData } = state;
  const { filter, sorting } = state.settings;
  const openNowFilterBtn = document.querySelector('#openNowSortingBtn');
  const priceSortingBtn = document.querySelector('#priceSortingBtn');
  const priceSortingBtnLabel = document.querySelector('#priceSortingBtn .mdc-button__label');
  const otherSortingMenuBtn = document.querySelector('#otherSortingBtn');
  const otherSortingMenuBtnLabel = document.querySelector('#otherSortingBtn .mdc-button__label');
  const searchTextField = document.querySelector('#searchTextField');
  const bookmarkResultsBtn = document.querySelector('#bookmarkResultsBtn');

  bookmarkResultsBtn.setAttribute('bookmarkId', deepLinkData.bookmarkId);
  bookmarkResultsBtn.textContent = 'star';

  if (deepLinkData.searchCriteria.openingNow && !filter.hideOpeningHoursFilter) {
    state.searchCriteria.openingNow = true;
    state.checkNearLocation  = true;
    openNowFilterBtn.classList.add('selected');
  }
  if (deepLinkData.searchCriteria.priceRange && !filter.hidePriceFilter) {
    state.searchCriteria.priceRange = deepLinkData.searchCriteria.priceRange;
    priceSortingBtnLabel.textContent = '$'.repeat(deepLinkData.searchCriteria.priceRange);
    priceSortingBtn.style.setProperty('background-color', 'var(--mdc-theme-primary)', 'important');
  }
  if (deepLinkData.searchCriteria.searchValue) {
    state.searchCriteria.searchValue = deepLinkData.searchCriteria.searchValue;
    searchTextField.value = state.searchCriteria.searchValue;
  }

  const { sortBy, order } = deepLinkData.searchCriteria.sort;

  if (!sorting.hideSorting && sorting.defaultSorting !== deepLinkData.searchCriteria.sort.sortBy && !(sorting.defaultSorting === 'alphabetical' && sortBy === '_buildfire.index.text' && order === 1)) {
    state.searchCriteria.sort = deepLinkData.searchCriteria.sort;
    otherSortingMenuBtn.style.setProperty('background-color', 'var(--mdc-theme-primary)', 'important');
    if (sortBy === 'distance') {
      otherSortingMenuBtnLabel.textContent = 'Distance';
    } else if (sortBy === '_buildfire.index.text' && order === 1) {
      otherSortingMenuBtnLabel.textContent = 'Title (A-Z)';
    } else if (sortBy === '_buildfire.index.text' && order === -1) {
      otherSortingMenuBtnLabel.textContent = 'Title (Z-A)';
    } else if (sortBy === 'price.range' && order === -1) {
      otherSortingMenuBtnLabel.textContent = '$ - $$$';
    } else if (sortBy === 'price.range' && order === 1) {
      otherSortingMenuBtnLabel.textContent = '$$$ - $';
    } else if (sortBy === '_buildfire.index.date1') {
      otherSortingMenuBtnLabel.textContent = 'Recent';
    } else if (sortBy === 'rating.average') {
      otherSortingMenuBtnLabel.textContent = 'Recommended';
    } else if (sortBy === 'views') {
      otherSortingMenuBtnLabel.textContent = 'Most Viewed';
    }
  }

  for (const key in deepLinkData.filterElements) {
    if (state.filterElements[key]) {
      state.filterElements[key] = deepLinkData.filterElements[key];
    }
  }

  if (Object.keys(deepLinkData.filterElements).length > 0) {
    refreshQuickFilter();
  }

  if (state.maps.map) {
    state.maps.map.center(deepLinkData.mapCenter);
    state.maps.map.setZoom(deepLinkData.mapZoom);
  }

  showMapView();
  initMapLocations();
};
const navigateToLocationId = (locationId) => {
  if (state.deepLinkData?.locationId) {
    refreshCategories()
      .then(() => WidgetController.getLocation(locationId))
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
  // handle going back from advanced filter
  console.log(state.breadcrumbs[state.breadcrumbs.length - 1]?.name);
  if (state.breadcrumbs.length && state.breadcrumbs[state.breadcrumbs.length - 1]?.name === 'categoriesEdit') {
    editView.refreshCategoriesText();
  } else if (state.breadcrumbs.length && state.breadcrumbs[state.breadcrumbs.length - 1]?.name === 'categoriesCreate') {
    createView.refreshCategoriesOverviewSubtitle();
  } else if (state.breadcrumbs.length && state.breadcrumbs[state.breadcrumbs.length - 1]?.name === 'af') {
    refreshQuickFilter();
    for (const key in state.currentFilterElements) {
      if (state.filterElements[key].checked !== state.currentFilterElements[key].checked
        || !areArraysEqual(state.filterElements[key].subcategories, state.currentFilterElements[key].subcategories)) {
        clearAndSearchAllLocation();
        break;
      }
    }
  } else if (
    state.breadcrumbs.length
    && (state.breadcrumbs[state.breadcrumbs.length - 1]?.name === "Map"
    || state.breadcrumbs[state.breadcrumbs.length - 1]?.name === "home")
    && state.settings.showIntroductoryListView
  ) {
    hideElement("section#listing");
    showElement("section#intro");
    const { showIntroductoryListView } = state.settings;
    if (showIntroductoryListView) {
      searchHandler().then(() => prepareIntroViewList());
    }
  }

  state.breadcrumbs.pop();
  if (!state.breadcrumbs.length) {
    hideOverlays();
    navigateTo('home');
    introView.refreshIntroductoryCarousel();
  } else {
    const page = state.breadcrumbs[state.breadcrumbs.length - 1];
    if (page?.name === 'af') {
      showFilterOverlay();
    } else if (page?.name === 'detail') {
      hideOverlays();
      showLocationDetail();
    } else if (page?.name === 'edit') {
      console.log('its edit');
      hideOverlays();
      showLocationEdit();
    } else if (page?.name === 'create') {
      hideOverlays();
      createView.show();
    } else {
      hideOverlays();
      navigateTo('home');
      introView.refreshIntroductoryCarousel();
    }
    // state.breadcrumbs.pop();
  }
};

const onReceivedMessageHandler = (message) => {
  if (message.cmd === 'sync') {
    handleCPSync(message);
  }
  if (message.cmd === "sort" && message.scope == "category") {
    WidgetController.searchCategories({
      sort: { title: message.sortBy === "Asc" ? 1 : -1 },
    })
      .then((result) => (state.categories = result))
      .then(() => {
        initFilterOverlay(true, null);
        refreshQuickFilter();
      });
  }
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
  let resolved;
  const startedAt = +new Date();
  const log = (message) => { console.info(`[User Position Debug]: ${message}`); };

  const attempt = () => {
    log(`attempting to get user position, attempt no: ${5 - retries + 1}`);
    buildfire.geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 1000 }, (err, position) => {
      log(`callback triggered: ${JSON.stringify(err)} : ${JSON.stringify(position)}`);
      if (!err) {
        state.userPosition = position.coords;
        resolved = true;
        log(`succeed, time elapsed: ${(((+new Date() - startedAt) % 60000) / 1000)}s`);
        resolve();
      } else if (retries > 0) {
        retries -= 1;
        attempt();
      } else {
        log('failed to get current user position');
        resolved = true;
        resolve();
      }
    });
  };
  setTimeout(() => {
    if (!resolved) {
      log(`Force resolving, time elapsed: ${(((+new Date() - startedAt) % 60000) / 1000)}s`);
      resolve();
    }
  }, 3000);
  attempt();
});

const watchUserPositionChanges = () => {
  buildfire.geo.watchPosition({ timeout: 30000 }, (position) => {
    state.userPosition = position.coords;
    if (state.maps.map) {
      state.maps.map.addUserPosition(state.userPosition);
    }
    setLocationsDistance();
  });
};

const getAllBookmarks = () => new Promise((resolve) => {
  buildfire.bookmarks.getAll((err, bookmarks) => {
    if (err) {
      console.error(err);
      return resolve;
    }
    console.info('retrieved bookmarks: ', bookmarks);
    state.bookmarks = bookmarks;
    resolve();
  });
});

const handleDeepLinkData = () => new Promise((resolve) => {
  buildfire.deeplink.getData((deepLinkData) => {
    console.log('deeplinkData: ', deepLinkData);
    state.deepLinkData = deepLinkData;
    resolve();
  });
  buildfire.deeplink.onUpdate((deeplinkData) => {
    if (deeplinkData) {
      console.log('deeplinkData onUpdate: ', deeplinkData);
      state.deepLinkData = deeplinkData;
      if (state.deepLinkData?.locationId) {
        buildfire.services.reportAbuse.triggerWidgetReadyForAdminResponse();
        navigateToLocationId(state.deepLinkData.locationId);
      }
    }
  }, true);
});

const resetResultsBookmark = () => {
  const bookmarkBtn = document.querySelector('#bookmarkResultsBtn');
  bookmarkBtn.removeAttribute('bookmarkId');
  bookmarkBtn.textContent = 'star_outline';
};

const bookmarkSearchResults = (e) => {
  if (state.bookmarkLoading) return;

  const targetBookmarkId = e.target.getAttribute('bookmarkId');
  if (targetBookmarkId) {
    return buildfire.bookmarks.delete(targetBookmarkId, (err, success) => {
      state.bookmarks.splice(state.bookmarks.findIndex((l) => l.id === targetBookmarkId), 1);
      showToastMessage('bookmarksRemoved');
      resetResultsBookmark();
    });
  }
  const bookmarkId = generateUUID();
  const { map } = state.maps;
  const {
    searchValue,
    openingNow,
    priceRange,
    sort
  } = state.searchCriteria;

  const payload = {
    isResultsBookmark: true,
    bookmarkId,
    searchCriteria: {
      searchValue,
      openingNow,
      priceRange,
      sort,
    },
    mapCenter: {
      lat: map.getCenter().lat(),
      lng: map.getCenter().lng()
    },
    mapZoom: map.zoom,
    filterElements: {}
  };

  for (const key in state.filterElements) {
    if (state.filterElements[key].checked) {
      payload.filterElements[key] = state.filterElements[key];
    }
  }

  buildfire.input.showTextDialog(
    {
      placeholder: window.strings.get('general.enterBookmarkTitleHere').v,
      saveText: window.strings.get('general.bookmark').v,
      maxLength: 50,
      defaultValue: state.searchCriteria.searchValue,
    },
    (err, response) => {
      if (err) return console.error(err);

      const { results } = response;

      if (response.cancelled || !results.length || !response.results[0].textValue) return;

      state.bookmarkLoading = true;
      setTimeout(() => { state.bookmarkLoading = false; }, 1000);
      buildfire.bookmarks.add(
        {
          id: bookmarkId,
          icon: 'https://pluginserver.buildfire.com/sharedResources/ic_location_no_img.png',
          title: response.results[0].textValue,
          payload,
        },
        (err, bookmark) => {
          if (err) return console.error(err);
          Analytics.resultsBookmarkUsed();
          e.target.textContent = 'star';
          e.target.setAttribute('bookmarkId', bookmarkId);
          state.bookmarks.push({
            id: bookmarkId,
            title: response.results[0].textValue
          });
          showToastMessage('bookmarksAdded');
        }
      );
    }
  );
};

const showLocationEdit = () => {
  navigateTo('edit');
  addBreadcrumb({ pageName: 'edit', title: 'Location Edit' });
};

const initAppStrings = () => {
  // string will have all the language settings from teh strings page on the control side
  window.strings = new buildfire.services.Strings('en-us', stringsConfig);
  return window.strings.init();
};

const getCurrentUser = () => new Promise((resolve) => {
  buildfire.auth.getCurrentUser((err, currentUser) => {
    if (!err && currentUser) {
      state.currentUser = currentUser;
    }
    resolve();
  });
});

let skipFilter = 1;
let isLoading = false;

const initApp = () => {
  const bootstrap = [
    getCurrentUserPosition(),
    refreshSettings(),
    getAllBookmarks(),
    handleDeepLinkData(),
    initAppStrings(),
    refreshCategories(),
    getCurrentUser(),
  ];
  initGoogleMapsSDK();
  window.googleMapOnLoad = () => {
    Promise.all(bootstrap)
      .then(() => {
        reportAbuse.init();
        authManager.onUserChange();
        views.fetch('filter').then(() => { views.inject('filter'); initFilterOverlay(true, null); });
        views.fetch('home').then(initHomeView);
        buildfire.history.onPop(onPopHandler);
        buildfire.messaging.onReceivedMessage = onReceivedMessageHandler;
        buildfire.components.ratingSystem.onRating = onRatingHandler;
        buildfire.appearance.titlebar.show();
        watchUserPositionChanges();
        setTimeout(() => {
          const t = document.querySelector('#filter');
          t.onscroll = (e) => {
            if (
              (t.scrollTop + t.clientHeight) / t.scrollHeight
              > 0.8 && !isLoading
            ) {
              isLoading = true;
              skipFilter += 1;
              const options = {
                filter: {},
                page: skipFilter,
                pageSize: 20,
                sort: { title: 1 }
              };

              WidgetController
                .searchCategories(options)
                .then((result) => {
                  if (result && result.length > 0) {
                    isLoading = false;
                    initFilterOverlay(false, result);
                  }
                });
            }
          };
        }, 3000);
      })
      .catch((err) => {
        console.error(`init error ${err}`);
      });
  };
};

initApp();
