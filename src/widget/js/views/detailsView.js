import Analytics from '../../../utils/analytics';
import editView from './editView';
import state from '../state';
import {
  shareLocation,
  bookmarkLocation,
  generateUUID,
  showToastMessage,
  getActiveTemplate
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

export default {
  _isCurrentlyUploading: false,
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
    location.lastUpdatedBy = state.currentUser;
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
  _buildUploadImageSkeleton(){
    const carouselContainer = document.querySelector('.location-detail__carousel');
    carouselContainer.innerHTML+=`<div class="img-select-holder"><div class="bf-skeleton-loader img-skeleton-container"></div></div>`;
  },
  addLocationPhotos() {
    if (this._isCurrentlyUploading || !accessManager.canAddLocationPhotos()) return;
    const addPhotosBtn= document.querySelector("#addPhotosBtn");

    uploadImages(
      { allowMultipleFilesUpload: true },
      (onProgress) => {
        buildfire.spinner.show();
        const existImage = this._currentImageOnProgress.find(_imgObj=>_imgObj.fileId==onProgress.file.fileId&&_imgObj.filename==onProgress.file.filename&&_imgObj.percentage<=onProgress.file.percentage);
        if(!existImage){
          showToastMessage('uploadingImages', 5000);
          this._currentImageOnProgress.push({fileId:onProgress.file.fileId,filename:onProgress.file.filename,percentage:onProgress.file.percentage, source:'carousel'});
          this._buildUploadImageSkeleton();
          this._isCurrentlyUploading = true;
          addPhotosBtn.classList.add('disabled');
        }
        console.log(`onProgress${JSON.stringify(onProgress)}`);
      },
      (err, files) => {
        this._isCurrentlyUploading = false;
        addPhotosBtn.classList.remove('disabled');
        this._currentImageOnProgress = this._currentImageOnProgress.filter(_imgObj=>_imgObj.source!=='carousel');

        if(err || !files){
          showToastMessage('uploadingFailed', 5000);
        }else if (files) {
          files=files.filter(file=>file.status=='success');
          if(files.length){
            showToastMessage('uploadingComplete', 5000);
            state.selectedLocation.images = [...state.selectedLocation.images, ...files.map((i) => ({ imageUrl: i.url, id: generateUUID() }))];
          }else{
            showToastMessage('uploadingFailed', 5000);
          }
          this.updateLocation();
        }
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
    const { bookmarks } = state.settings;
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
    actions = actions.filter((action) => {
      let isQualified = true;
      if (action.name === 'share' || action.name === 'addPhotos' || action.name === 'edit') {
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
};
