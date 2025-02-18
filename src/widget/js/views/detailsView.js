/* eslint-disable max-len */
import Analytics from '../../../utils/analytics';
import editView from './editView';
import state from '../state';
import {
  shareLocation,
  bookmarkLocation,
  generateUUID,
  showToastMessage,
  getActiveTemplate,
  transformCategoriesToText,
  extractContributorName,
  isLocationOpen,
  cdnImage
} from '../util/helpers';
import { uploadImages } from '../util/forms';
import accessManager from '../accessManager';
import reportAbuse from '../reportAbuse';
import Locations from '../../../repository/Locations';
import Location from '../../../entities/Location';
import DeepLink from '../../../utils/deeplink';
import SearchEngine from '../../../repository/searchEngine';
import introView from './introView';
import mapView from './mapView';
import authManager from '../../../UserAccessControl/authManager';
import notifications from '../../services/notifications';
import widgetController from '../../widget.controller';
import views from '../Views';
import constants from '../constants';
import MainMap from '../map/Map';

let selectors = {};

export default {
  _currentImageOnProgress: [],
  _reflectUpdatedLocationOnUI() {
    const location = state.selectedLocation;
    const carouselContainer = document.querySelector('.location-detail__carousel');

    carouselContainer.innerHTML = location.images.map((n) => `<div style="background-image: url('${buildfire.imageLib.cropImage(n.imageUrl, { size: "full_width", aspect: "1:1" })}');" data-id="${n.id}"></div>`).join('\n');

    const indexInList = state.listLocations.findIndex((i) => i.id === location.id);
    const indexInPinned = state.pinnedLocations.findIndex((i) => i.id === location.id);
    if (indexInList > -1) {
      state.listLocations[indexInList] = location;
    }
    if (indexInPinned > -1) {
      state.pinnedLocations[indexInPinned] = location;
    }

    const activeTemplate = getActiveTemplate();

    if (activeTemplate === 'intro') {
      introView.clearIntroViewList();
      introView.renderIntroductoryLocations(state.listLocations, true);
    } else {
      mapView.clearMapViewList();
      mapView.renderListingLocations(state.listLocations);
    }

    buildfire.spinner.hide();
    showToastMessage('uploadedSuccessfully');
  },
  updateLocation() {
    const location = new Location(state.selectedLocation);
    location.lastUpdatedOn = new Date();
    location.lastUpdatedBy = state.sanitizedCurrentUser;
    const promiseChain = [
      Locations.update(location.id, location.toJSON()),
      DeepLink.registerDeeplink(location),
      SearchEngine.update(Locations.TAG, location.id, location.toJSON())
    ];
    return Promise.all(promiseChain)
      .then(() => {
        state.selectedLocation = location;
        this._reflectUpdatedLocationOnUI();
      })
      .catch((err) => {
        console.error(err);
      });
  },
  _buildUploadImageSkeleton() {
    const carouselContainer = document.querySelector('.location-detail__carousel');
    carouselContainer.innerHTML += `<div class="img-select-holder"><div class="bf-skeleton-loader img-skeleton-container"></div></div>`;
  },
  addLocationPhotos() {
    if (!accessManager.canAddLocationPhotos()) return;
    const addPhotosBtn = document.querySelector("#addPhotosBtn");

    uploadImages(
      { allowMultipleFilesUpload: true },
      (onProgress) => {
        buildfire.spinner.show();

        const existImage = this._currentImageOnProgress.find((_imgObj) => (
          _imgObj.fileId === onProgress.file.fileId
          && _imgObj.filename === onProgress.file.filename
          && _imgObj.percentage <= onProgress.file.percentage));

        if (!existImage) {
          this._currentImageOnProgress.push({
            fileId: onProgress.file.fileId,
            filename: onProgress.file.filename,
            percentage: onProgress.file.percentage,
            source: 'carousel'
          });

          this._buildUploadImageSkeleton();
          addPhotosBtn.classList.add('disabled');
        }
      },
      (err, files) => {
        addPhotosBtn.classList.remove('disabled');
        this._currentImageOnProgress = this._currentImageOnProgress.filter((_imgObj) => _imgObj.source !== 'carousel');

        files = files?.filter((file) => file.status === 'success');
        if (err || !files?.length) {
          showToastMessage('uploadingFailed', 5000);
        } else {
          showToastMessage('uploadingComplete', 5000);
          state.selectedLocation.images = [...state.selectedLocation.images, ...files.map((i) => ({ imageUrl: i.url, id: generateUUID() }))];
        }
        this.updateLocation();
      }
    );
  },
  handleLocationDetailDrawerClick(err, result) {
    if (err) return console.error(err);
    buildfire.components.drawer.closeDrawer();
    switch (result.name) {
      case 'reportAbuse':
        reportAbuse.report({ id: state.selectedLocation.id, createdBy: state.selectedLocation.createdBy?._id });
        break;
      case 'share':
        shareLocation();
        break;
      case 'edit':
        Analytics.inAppEditUsed();
        editView.init();
        break;
      case 'addPhotos':
        this.addLocationPhotos();
        break;
      case 'bookmark':
        bookmarkLocation(state.selectedLocation.id);
        break;
      default:
        console.error('unhandled action ', result.name);
    }
  },
  getEnabledActions() {
    const { bookmarks, subscription } = state.settings;
    const { selectedLocation } = state;

    const actions = [
      {
        text: window.strings?.get('details.reportAbuse')?.v,
        name: 'reportAbuse',
        classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
        textContent: 'report',
        id: 'reportAbuseBtn',
      },
      {
        text: window.strings?.get('details.share')?.v,
        name: 'share',
        classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
        textContent: 'share',
        id: 'shareLocationBtn',
      },
    ];

    if (selectedLocation.id && accessManager.canEditLocations()) {
      actions.push({
        text: window.strings?.get('details.edit')?.v,
        name: 'edit',
        classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
        textContent: 'edit',
        id: 'editLocationBtn',
      });
      if (subscription.enabled && subscription.allowCustomNotifications) {
        actions.push({
          text: window.strings?.get('details.notifySubscribers')?.v,
          name: 'notifySubscribers',
          classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
          textContent: 'notifySubscribers',
          id: 'notifySubscribers',
        });
      }
    } else if (accessManager.canAddLocationPhotos()) {
      actions.push({
        text: window.strings?.get('details.addPhotos')?.v,
        name: 'addPhotos',
        classNames: 'material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
        textContent: 'add_a_photo',
        id: 'addPhotosBtn',
      });
    }

    if (bookmarks.enabled && bookmarks.allowForLocations) {
      actions.push({
        text: window.strings?.get('details.bookmark')?.v,
        name: 'bookmark',
        classNames: 'material-icons-outlined mdc-text-field__icon margin-left-fifteen pointer',
        textContent: 'star_outline',
        id: 'bookmarkLocationBtn',
      });
    }

    return actions;
  },
  showLocationDetailDrawer() {
    let actions = this.getEnabledActions();
    const addPhotoEnabled = actions.find((a) => a.name === 'addPhotos');
    const editLocationEnabled = actions.find((a) => a.name === 'edit');
    const notifySubscribersEnabled = actions.find((a) => a.name === 'notifySubscribers');
    actions = actions.filter((action) => {
      let isQualified = true;
      if (action.name === 'notifySubscribers' || action.name === 'addPhotos' || action.name === 'edit') {
        isQualified = false;
      } else if (!notifySubscribersEnabled && action.name === 'share') {
        isQualified = false;
      } else if (action.name === 'reportAbuse' && !(addPhotoEnabled || editLocationEnabled)) {
        isQualified = false;
      }
      return isQualified;
    });

    buildfire.components.drawer.open(
      {
        listItems: actions
      },
      this.handleLocationDetailDrawerClick.bind(this)
    );
  },
  renderLocationActions() {
    const { bookmarks } = state.settings;
    const isTopMapPosition = state.settings.design.detailsMapPosition === 'top';
    const { selectedLocation } = state;
    const isLocationBookmarked = state.bookmarks.find((l) => l.id === selectedLocation.clientId);
    const actionsContainer = document.querySelector(
      isTopMapPosition ? '.location-detail__top-header-icons' : '.location-detail__cover'
    );

    const actions = this.getEnabledActions();

    // Render 2 base icons and show more icon
    if (actions.length > 3) {
      const primaryActions = [
        {
          classNames: 'action-btn-0 material-icons-outlined mdc-text-field__icon pointer',
          textContent: 'more_horiz',
          id: 'moreOptionsBtn',
        },
        {
          classNames: 'action-btn-1 material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
          textContent: 'share',
          id: 'shareLocationBtn',
        },
      ];
      const addPhotoEnabled = actions.find((a) => a.name === 'addPhotos');
      const editLocationEnabled = actions.find((a) => a.name === 'edit');
      const sendNotificationEnabled = actions.find((a) => a.name === 'notifySubscribers');

      if (addPhotoEnabled) {
        primaryActions.push({
          classNames: 'action-btn-2 material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
          textContent: 'add_a_photo',
          id: 'addPhotosBtn',
        });
      } else if (editLocationEnabled) {
        primaryActions.push({
          classNames: 'action-btn-2 material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
          textContent: 'edit',
          id: 'editLocationBtn',
        });
        if (sendNotificationEnabled) {
          primaryActions.splice(1, 1);
          primaryActions.push({
            classNames: 'action-btn-1 material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
            textContent: 'notification_add',
            id: 'notifySubscribers',
          });
          actions.unshift({
            classNames: 'action-btn-1 material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
            textContent: 'share',
            id: 'shareLocationBtn',
          });
        }
      } else {
        primaryActions.push({
          classNames: 'action-btn-2 material-icons-outlined margin-left-fifteen mdc-text-field__icon pointer',
          textContent: 'report',
          id: 'reportAbuseBtn',
        });
      }

      primaryActions.forEach((action) => {
        const i = document.createElement('i');
        i.textContent = action.textContent;
        i.className = action.classNames;
        i.tabIndex = '0';
        i.role = 'button';
        i.id = action.id;
        actionsContainer.appendChild(i);
      });
    } else {
      actions.forEach((action, index) => {
        const i = document.createElement('i');
        i.textContent = action.textContent;
        i.className = `${action.classNames} action-btn-${index}`;
        i.tabIndex = '0';
        i.role = 'button';
        i.id = action.id;
        actionsContainer.appendChild(i);
      });
    }

    const bookmarkLocationBtn = document.querySelector('#bookmarkLocationBtn');
    if (bookmarks.enabled && bookmarks.allowForLocations && isLocationBookmarked && bookmarkLocationBtn) {
      bookmarkLocationBtn.textContent = 'star';
    }
  },

  handleLocationFollowingState() {
    const { selectedLocation } = state;

    if (selectedLocation.subscribers.indexOf(authManager.currentUser.userId) > -1) {
      selectedLocation.subscribers = selectedLocation.subscribers.filter((id) => id !== authManager.currentUser.userId);
      selectors.subscribeBtnLabel.textContent = window.strings.get('general.follow').v;
      selectors.subscribeBtn.className = 'mdc-button mdc-button--outlined bf-outlined-btn disabled-btn';
      widgetController.unsubscribeFromLocationUpdates(selectedLocation.id, authManager.currentUser.userId).then(() => {
        selectors.subscribeBtn.classList.remove('disabled-btn');
        showToastMessage('unSubscribeFromLocationUpdates');
      }).catch((err) => {
        console.error(err);
        selectors.subscribeBtn.classList.remove('disabled-btn');
        showToastMessage('somethingWentWrong', 3000, 'danger');
      });
    } else {
      notifications.subscribe();

      selectedLocation.subscribers.push(authManager.currentUser.userId);
      selectors.subscribeBtnLabel.textContent = window.strings.get('general.following').v;
      selectors.subscribeBtn.className = 'mdc-button mdc-button--unelevated bf-outlined-btn disabled-btn';
      widgetController.subscribeToLocationUpdates(selectedLocation.id, authManager.currentUser.userId).then(() => {
        selectors.subscribeBtn.classList.remove('disabled-btn');
        showToastMessage('subscribeToLocationUpdates');
      }).catch((err) => {
        console.error(err);
        selectors.subscribeBtn.classList.remove('disabled-btn');
        showToastMessage('somethingWentWrong', 3000, 'danger');
      });
    }
  },

  initLocationDetails() {
    return new Promise((resolve, reject) => {
      const { selectedLocation } = state;
      const showContributorName = (state.settings.design?.showContributorName && selectedLocation.createdBy?._id);

      const promises = [views.fetch('detail')];

      if (showContributorName) {
        promises.push(authManager.getUserProfile(selectedLocation.createdBy._id));
      }

      Promise.all(promises)
        .then((result) => {
          views.inject('detail');
          window.strings.inject(document.querySelector('section#detail'), false);

          this.renderLocationActions();

          if (selectedLocation.id) {
            widgetController.updateLocation(selectedLocation.id, { $inc: { views: 1 } });
            Analytics.viewed(selectedLocation.id, {});
          }

          const pageMapPosition = state.settings.design.detailsMapPosition;
          selectors = {
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
                subtitle: document.querySelector('.location-detail__top-header h5#locationSubtitle'),
                contributor: document.querySelector('.location-detail__top-header h5#locationContributor'),
                categories: document.querySelector('.location-detail__top-subtitle p'),
                cover: document.querySelector('.location-detail__bottom-cover'),
                main: document.querySelector('.location-detail__top-view'),
                map: document.querySelector('.location-detail__map--top-view'),
                workingHoursBtn: document.querySelector('#topWorkingHoursBtn'),
                subscribeBtn: document.querySelector('#topLocationSubscribe'),
                workingHoursBtnLabel: document.querySelector('#topWorkingHoursBtn .mdc-button__label'),
                subscribeBtnLabel: document.querySelector('#topLocationSubscribe .mdc-button__label'),
              }
            };
            selectors.main.style.display = 'block';
            selectors.rating.classList.add('location-detail__rating--single-shadow');
          } else {
            selectors = {
              ...selectors,
              ...{
                title: document.querySelector('.location-detail__cover h2'),
                subtitle: document.querySelector('.location-detail__cover h4#locationSubtitleCover'),
                contributor: document.querySelector('.location-detail__cover h4#locationContributorCover'),
                categories: document.querySelector('.location-detail__cover p:first-child'),
                main: document.querySelector('.location-detail__cover'),
                map: document.querySelector('.location-detail__map'),
                workingHoursBtn: document.querySelector('#coverWorkingHoursBtn'),
                subscribeBtn: document.querySelector('#coverLocationSubscribe'),
                workingHoursBtnLabel: document.querySelector('#coverWorkingHoursBtn .mdc-button__label'),
                subscribeBtnLabel: document.querySelector('#coverLocationSubscribe .mdc-button__label'),
              }
            };
            selectors.main.style.display = 'flex';
            if (selectedLocation.settings.showStarRating) {
              selectors.rating.classList.add('location-detail__rating--dual-shadow');
            }
          }

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

          detailMap.addMarker(selectedLocation, () => { });

          selectors.title.textContent = selectedLocation.title ?? '';
          selectors.subtitle.textContent = selectedLocation.subtitle ?? '';

          selectors.address.textContent = selectedLocation.formattedAddress;
          selectors.description.innerHTML = selectedLocation.description;
          selectors.distance.childNodes[0].nodeValue = selectedLocation.distance;

          if (state.settings.design?.showDetailsCategory && selectedLocation.settings.showCategory) {
            selectors.categories.textContent = transformCategoriesToText(selectedLocation.categories, state.categories);
            selectors.categories.style.display = 'block';
          }

          if (showContributorName && result[1]) {
            selectors.contributor.textContent = `${window.strings.get('details.contributorPrefix').v} ${extractContributorName(result[1])}`;
            selectors.contributor.classList.remove('hidden');
            if (pageMapPosition !== 'top') {
              selectors.title.classList.add('reduced-margin');
            }
          }

          if (!state.settings || !state.settings.subscription || !state.settings.subscription.enabled) {
            selectors.subscribeBtn.style.display = 'none';
          } else if (authManager.currentUser && authManager.currentUser.userId && selectedLocation.subscribers.indexOf(authManager.currentUser.userId) > -1) {
            selectors.subscribeBtnLabel.textContent = window.strings.get('general.following').v;
            selectors.subscribeBtn.className = 'mdc-button mdc-button--unelevated bf-outlined-btn';
          } else {
            selectors.subscribeBtnLabel.textContent = window.strings.get('general.follow').v;
            selectors.subscribeBtn.className = 'mdc-button mdc-button--outlined bf-outlined-btn';
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
          resolve();
        });
    });
  },
};
