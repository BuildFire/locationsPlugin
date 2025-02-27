/* eslint-disable max-len */
import state from '../state';
import accessManager from '../accessManager';
import { calculateLocationDistance, getDistanceString } from '../util/helpers';
import IntroSearchService from '../../services/search/introSearchService';
import { hideElement } from '../util/ui';

const renderIntroductoryLocations = (list, includePinned = false) => {
  const container = document.querySelector('#introLocationsList');
  let reducedLocations = list.reduce((filtered, n) => {
    if (n.listImage != null) {
      n.listImage = buildfire.imageLib.cropImage(n.listImage, { size: "full_width", aspect: "1:1" })
    } else {
      n.listImage = "./images/empty_image.PNG"
    }
    const index = state.pinnedLocations.findIndex((pinned) => pinned.id === n.id);
    if (index === -1) {
      filtered.push(`<div class="mdc-ripple-surface pointer location-item" data-id=${n.id}>
        <div class="d-flex">
          <img src=${n.listImage} alt="Location image">
          <div class="location-item__description">
            <p class="location-title mdc-theme--text-header text-ellipsis">${n.title ?? ''}</p>
            <p class="location-subtitle mdc-theme--text-body text-truncate text-ellipsis" style="display: ${n.subtitle ? 'block' : 'none'};">${n.subtitle ?? ''}</p>
            <p class="location-address mdc-theme--text-body text-ellipsis">${n.address ?? ''}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background" tabindex="0" role="button" style="visibility: hidden;">star_outline</i>
            <p class="mdc-theme--text-body">${n.distance ? n.distance : '--'}</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">

         ${n.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip mdc-theme--text-primary-on-background list-action-item" role="row" data-action-id="${a.id}">
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
          <img src=${n.listImage != null ? buildfire.imageLib.cropImage(n.listImage, { size: "full_width", aspect: "1:1" }) : "./images/empty_image.PNG"} alt="Location image">
          <div class="location-item__description">
            <p class="location-title mdc-theme--text-header text-ellipsis">${n.title ?? ""}</p>
            <p class="location-subtitle mdc-theme--text-body text-ellipsis" style="display: ${n.subtitle ? 'block' : 'none'};">${n.subtitle ?? ""}</p>
            <p class="location-address mdc-theme--text-body text-ellipsis">${n.address ?? ""}</p>
          </div>
          <div class="location-item__actions">
            <i class="material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background" tabindex="0" role="button" style="visibility: hidden;">star_outline</i>
            <p class="mdc-theme--text-body">${n.distance ? n.distance : '--'}</p>
          </div>
        </div>
        <div class="mdc-chip-set" role="grid">

         ${n.actionItems.slice(0, 3).map((a) => `<div class="mdc-chip mdc-theme--text-primary-on-background list-action-item" role="row" data-action-id="${a.id}">
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

const clearIntroViewList = () => { document.querySelector('#introLocationsList').innerHTML = ''; };

const refreshIntroductoryCarousel = () => {
  const { introductoryListView } = state.settings;
  setTimeout(() => {
    if (state.introCarousel) {
      state.introCarousel.clear();
      state.introCarousel.loadItems(introductoryListView.images);
    } else if (introductoryListView.images.length > 0) {
      state.introCarousel = new buildfire.components.carousel.view('.carousel');
      state.introCarousel.loadItems(introductoryListView.images);
    }
  }, 100);
};

const initCreateLocationButton = () => {
  const userHasAccess = accessManager.canCreateLocations();
  const selector = document.querySelector('#createNewLocationBtn');

  if (userHasAccess) {
    selector.classList.remove('hidden');
  } else {
    selector.classList.add('hidden');
  }
};

const separateListItems = () => {
  const container = document.querySelector('#introLocationsList');
  const nearLocationsMessage = `<div id="nearLocationsMessageContainer" class="location-item"><h4 class="separate-location-message mdc-theme--text-header">${window.strings.get('general.nearYou').v}</h4></div>`;
  const otherLocationsMessage = `<div id="otherLocationsMessageContainer" class="location-item"><h4 class="separate-location-message mdc-theme--text-header">${window.strings.get('general.otherLocations').v}</h4></div>`;

  container.insertAdjacentHTML('afterbegin', nearLocationsMessage);
  container.insertAdjacentHTML('beforeend', otherLocationsMessage);
};

const fetchOtherLocations = (lastNearPage) => {
  IntroSearchService.searchIntroLocations().then((result) => {
    const formattedList = handleIntroSearchResponse(result);
    renderIntroductoryLocations(lastNearPage, false);
    if (formattedList && formattedList.length) {
      if (state.listLocations.length > formattedList.length) {
        separateListItems();
      }
      renderIntroductoryLocations(formattedList, false);
    }
  });
};

const handleIntroSearchResponse = (data) => {
  const result = data.aggregateLocations.filter((elem1) => (
    !state.listLocations.find((elem) => elem?.id === elem1?.id)
  )).map((r) => {
    const distance = calculateLocationDistance(r?.coordinates, state.userPosition);
    const printedDistanceString = getDistanceString(distance);
    return { ...r, distance: printedDistanceString };
  });

  state.listLocations = state.listLocations.concat(result);
  if (state.searchCriteria.searchValue && !state.listLocations.length && !state.searchableTitles.length) {
    const searchableTitles = data.searchEngineLocations?.hits?.hits?.map((elem) => elem._source.searchable.title);
    if (searchableTitles && searchableTitles.length > 0) {
      state.searchableTitles = searchableTitles;
      return IntroSearchService.searchIntroLocations().then((_data) => handleIntroSearchResponse(_data));
    }
  }

  // this condition will print the first page of other locations
  // we call it this way to include the case when the near locations are not fet the page which will cause scroll issues
  if (state.printOtherLocationMessage && !state.separateListItemsMessageShown) {
    state.separateListItemsMessageShown = true;
    fetchOtherLocations(result);
    return [];
  }

  if (state.listLocations && state.listLocations.length) {
    hideElement("div.empty-page");
  }

  return result;
};

export default {
  initCreateLocationButton,
  refreshIntroductoryCarousel,
  renderIntroductoryLocations,
  clearIntroViewList,
  separateListItems,
  handleIntroSearchResponse
};
