import state from '../state';
import { cdnImage } from '../util/helpers';

const renderIntroductoryLocations = (list, includePinned = false) => {
  const container = document.querySelector('#introLocationsList');
  let reducedLocations = list.reduce((filtered, n) => {
    if(n.listImage != null){
      n.listImage = buildfire.imageLib.cropImage(n.listImage, {size: "full_width", aspect:"1:1"})
    } else {
      n.listImage = "./images/empty_image.png"
    }
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
          <img src=${n.listImage != null ? buildfire.imageLib.cropImage(n.listImage, {size: "full_width", aspect:"1:1"}) : "./images/empty_image.png"} alt="Location image">
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


export default { renderIntroductoryLocations, clearIntroViewList };
