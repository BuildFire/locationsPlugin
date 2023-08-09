import state from '../state';
import { cdnImage, transformCategoriesToText, isLocationOpen, truncateString } from '../util/helpers';
import { hideElement, showElement } from '../util/ui';

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
              <p class="margin-bottom-five">${truncateString(n.title, 30)}</p>
              <p class="margin-top-zero">${transformCategoriesToText(n.categories, state.categories)}</p>
              <p>
                <span>${n.subtitle ? truncateString(n.subtitle, 40) : ''}</span>
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
            <p class="mdc-theme--text-header">${truncateString(n.title, 18)}</p>
            <p class="mdc-theme--text-body text-truncate" style="display: ${n.subtitle ? 'block' : 'none'};">${n.subtitle ? truncateString(n.subtitle, 18) : ''}</p>
            <p class="mdc-theme--text-body text-truncate">${truncateString(n.address, 25)}</p>
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

export default { renderListingLocations, clearMapViewList };
