/* eslint-disable max-len */
import MapSearchService from '../../services/search/mapSearchService';
import state from '../state';
import { cdnImage, transformCategoriesToText, isLocationOpen, calculateLocationDistance, getDistanceString } from '../util/helpers';
import { hideElement, showElement } from '../util/ui';
import mapSearchControl from '../map/search-control';

const renderListingLocations = (list) => {
  const container = document.querySelector('#listingLocationsList');
  const emptyStateContainer = document.querySelector('.drawer-empty-state');
  const emptyStateContainer2 = document.querySelector('.empty-page');
  const bookmarksSettings = state.settings.bookmarks;
  let content;
  if (state.settings.design.listViewStyle === 'backgroundImage') {
    content = list.map((n) => (`<div data-id="${n.id}" class="mdc-ripple-surface pointer location-image-item" style="background-image: linear-gradient( rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6) ),url(${n.images.length ? cdnImage(n.images[0].imageUrl) : './images/default-location-cover.png'});">
            <div class="location-image-item__header">
              <p>${n.distance ? n.distance : '--'}</p>
              <i class="material-icons-outlined mdc-text-field__icon pointer-all bookmark-location-btn" tabindex="0" role="button" style="visibility: ${!bookmarksSettings.enabled || !bookmarksSettings.allowForLocations ? 'hidden' : 'visible'};">${state.bookmarks.find((l) => l.id === n.clientId) ? 'star' : 'star_outline'}</i>
            </div>
            <div class="location-image-item__body">
              <p class="margin-bottom-five text-ellipsis">${n.title ?? ''}</p>
              <p class="margin-top-zero text-ellipsis">${transformCategoriesToText(n.categories, state.categories)}</p>
              <p>
                <span class="text-ellipsis">${n.subtitle ?? ''}</span>
                <span>
                  <span>${n.settings.showPriceRange ? n.price.currency?.repeat(n.price?.range) : ''}</span>
                  <span class="location-image__open-status">${n.settings.showOpeningHours ? (window.strings.get(isLocationOpen(n) ? 'general.open' : 'general.closed').v) : ''}</span>
                </span>
              </p>
            </div>
            <div class="mdc-chip-set" role="grid">
              ${n.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip mdc-theme--text-primary-on-background" role="row" data-action-id="${a.id}">
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
          <img src="${cdnImage(n.listImage)}" alt="Location image">
          <div class="location-item__description">
            <p class="mdc-theme--text-header text-ellipsis">${n.title}</p>
            <p class="mdc-theme--text-body text-ellipsis text-truncate" style="display: ${n.subtitle ? 'block' : 'none'};">${n.subtitle ?? ''}</p>
            <p class="mdc-theme--text-body text-ellipsis text-truncate">${n.address ?? ''}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background pointer-all bookmark-location-btn align-self-center" tabindex="0" role="button" style="visibility: ${!bookmarksSettings.enabled || !bookmarksSettings.allowForLocations ? 'hidden' : 'visible'};">${state.bookmarks.find((l) => l.id === n.clientId) ? 'star' : 'star_outline'}</i>
            <p class="mdc-theme--text-body">${n.distance ? n.distance : '--'}</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">

          ${n.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip mdc-theme--text-primary-on-background" role="row" data-action-id="${a.id}">
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

  if (!state.listLocations.length) {
    emptyStateContainer.textContent = window.strings.get(state.firstRender ? 'emptyState.locationsListBeforeSearch' : 'emptyState.locationsListAfterSearch').v;
    showElement(emptyStateContainer);
  } else {
    hideElement(emptyStateContainer2);
    hideElement(emptyStateContainer);
  }

  state.firstRender = false;
  container.insertAdjacentHTML('beforeend', content);
};

const clearMapViewList = () => {
  document.querySelector('.swipeable-drawer').scrollTop = 0;
  document.querySelector('#listingLocationsList').innerHTML = '';
};

const triggerSearchOnMapIdle = () => {
  if (!state.isMapIdle) {
    setTimeout(() => {
      triggerSearchOnMapIdle();
    }, 300);
    return;
  }

  MapSearchService.searchLocations().then((_data) => {
    handleMapSearchResponse(_data);
    clearMapViewList();
    renderListingLocations(state.listLocations);
  });
};

const handleMapSearchResponse = (data) => {
  if (!data.aggregateLocations || !data.aggregateLocations.length) {
    if (!state.listLocations.length) {
      // if there's no result and no cached data then call "renderListingLocations" to show the empty state
      renderListingLocations([]);
    }
    return [];
  }

  const result = data.aggregateLocations.filter((elem1) => (
    !state.listLocations.find((elem) => elem?.id === elem1?.id)
  )).map((r) => {
    const distance = calculateLocationDistance(r?.coordinates, state.userPosition);
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
      return MapSearchService.searchLocations().then((_data) => {
        handleMapSearchResponse(_data);
      });
    }
  }

  mapSearchControl.refresh();

  // Render Map listLocations
  renderListingLocations(result);

  if (!state.fetchingEndReached && state.listLocations.length < 200) {
    return MapSearchService.searchLocations().then((_data) => {
      handleMapSearchResponse(_data);
    });
  }

  return result;
};

export default { renderListingLocations, clearMapViewList, handleMapSearchResponse };
