import * as Promise from 'bluebird';
import state from '../state';
import Location from '../../../entities/Location';
import Locations from '../../../repository/Locations';
import DeepLink from '../../../utils/deeplink';
import SearchEngine from '../../../repository/searchEngine';
import views from '../Views';
import {
  createTemplate,
  generateUUID,
  getDefaultOpeningHours,
  showToastMessage,
  transformCategoriesToText,
  addBreadcrumb,
  getActiveTemplate,
  cropImage,
} from '../util/helpers';
import { uploadImages } from '../util/forms';
import { navigateTo, resetBodyScroll } from '../util/ui';
import Accordion from '../Accordion';
import { convertDateToTime, convertTimeToDate } from '../../../utils/datetime';
import mapView from './mapView';
import introView from './introView';
import { validateOpeningHoursDuplication } from '../../../shared/utils';
import constants from '../constants';
import accessManager from '../accessManager';

const localState = {
  pendingLocation: null,
  selectedOpeningHours: getDefaultOpeningHours(),
  imageUploadPending: false,
  carouselUploadPending: false,
  map: null,
  geocodeTimeout: null,
};

let editViewAccordion;
let formTextFields;

const _toggleDescriptionTextarea = (isDisabled) => {
  const descriptionTextField = document.querySelector('#locationDescriptionField');
  const descriptionTextArea = document.querySelector('#locationDescriptionField textarea');

  if (!isDisabled) {
    descriptionTextField.classList.remove('mdc-text-field--disabled');
    descriptionTextArea.disabled = false;
  } else {
    descriptionTextField.classList.add('mdc-text-field--disabled');
    descriptionTextArea.disabled = true;
  }
};

const _handleDescriptionInput = () => {
  const { pendingLocation } = localState;

  buildfire.input.showTextDialog(
    {
      placeholder: window.strings.get('locationEditing.descriptionDialogPlaceholder').v,
      saveText: window.strings.get('locationEditing.descriptionDialogSave').v,
      cancelText: window.strings.get('locationEditing.descriptionDialogCancel').v,
      defaultValue: pendingLocation.description,
      wysiwyg: true,
    },
    (err, response) => {
      if (err) return console.error(err);
      if (response.cancelled) return;
      formTextFields.locationDescriptionField.instance.value =  response.results[0].textValue;
      pendingLocation.description = response.results[0].wysiwygValue;
      pendingLocation.wysiwygSource = 'widget';
    }
  );
};

const _toggleInputError = (element, hasError) => {
  if (typeof element === 'string') {
    element = document.querySelector(`#${element}`);
  }

  if (element.classList.contains('mdc-text-field')) {
    const fn = hasError ? 'add' : 'remove';
    element.classList[fn]('mdc-text-field--invalid');
  } else if (element.classList.contains('mdc-text-field-helper-line')) {
    const fn = hasError ? 'add' : 'remove';
    element.classList[fn]('has-error');
  } else {
    const fn = hasError ? 'remove' : 'add';
    element.classList[fn]('hidden');
  }
};

const _validateTimeInterval = (start, end, errorElem) => {
  start = new Date(start).getTime();
  end = new Date(end).getTime();
  let isValid = true;
  if (start > end) {
    isValid = false;
  }

  if (errorElem) {
    _toggleInputError(errorElem, !isValid, 'Choose an end time later than the start time');
  }

  return isValid;
};

const _validateOpeningHours = (openingHours) => {
  const { days } = openingHours;
  let isValid = true;
  for (const day in days) {
    if (days[day]) {
      isValid = days[day].intervals?.every((elem) => _validateTimeInterval(elem.from, elem.to));
      if (!isValid) {
        return false;
      }
    }
  }
  return isValid;
};

const _validateLocationSave = () => {
  const {
    title, address, coordinates, listImage, openingHours, description
  } = localState.pendingLocation;
  let isValid = true;

  if (!title) {
    isValid = false;
    _toggleInputError('locationTitleField', true);
  } else {
    _toggleInputError('locationTitleField', false);
  }

  if (!description) {
    isValid = false;
    _toggleInputError('locationDescriptionField', true);
  } else {
    _toggleInputError('locationDescriptionField', false);
  }

  if (!address || !coordinates.lat || !coordinates.lng) {
    isValid = false;
    _toggleInputError('locationAddressField', true);
  } else {
    _toggleInputError('locationAddressField', false);
  }

  if (!listImage) {
    _toggleInputError('locationListImageFieldHelper', true);
    isValid = false;
  } else {
    _toggleInputError('locationListImageFieldHelper', false);
  }

  if (!_validateOpeningHours(openingHours)) {
    isValid = false;
  }

  return isValid;
};

const showLocationEdit = () => {
  state.breadcrumbs = [];
  resetBodyScroll();
  navigateTo('edit');
  addBreadcrumb({ pageName: 'edit', title: 'Location Edit' });
};

const refreshCategoriesText = () => {
  const { pendingLocation } = localState;
  const locationCategoriesOverview = document.querySelector('#locationCategoriesOverview');
  const locationCategoriesText = locationCategoriesOverview.querySelector('h5');
  const categoriesText = transformCategoriesToText(pendingLocation.categories, state.categories);

  if (categoriesText) {
    locationCategoriesText.textContent = categoriesText;
    locationCategoriesText.classList.remove('hidden');
  } else {
    locationCategoriesText.classList.add('hidden');
  }
};

const updateLocation = (locationId, location) => {
  location.lastUpdatedOn = new Date();
  location.lastUpdatedBy = state.currentUser;
  const promiseChain = [
    Locations.update(locationId, location.toJSON()),
    DeepLink.registerDeeplink(location),
    SearchEngine.update(Locations.TAG, locationId, location.toJSON())
  ];
  return Promise.all(promiseChain);
};

const _reflectChanges = () => {
  const updatedLocation = localState.pendingLocation.toJSON();
  state.selectedLocation = updatedLocation;

  const indexInList = state.listLocations.findIndex((i) => i.id === updatedLocation.id);
  const indexInPinned = state.pinnedLocations.findIndex((i) => i.id === updatedLocation.id);
  if (indexInList > -1) {
    state.listLocations[indexInList] = updatedLocation;
  }
  if (indexInPinned > -1) {
    state.pinnedLocations[indexInPinned] = updatedLocation;
  }

  const activeTemplate = getActiveTemplate();

  if (activeTemplate === 'intro') {
    introView.clearIntroViewList();
    introView.renderIntroductoryLocations(state.listLocations, true);
  } else {
    mapView.clearMapViewList();
    mapView.renderListingLocations(state.listLocations);
  }
};

const _reverseAddress = () => {
  const { pendingLocation } = localState;
  const geoCoder = new google.maps.Geocoder();
  const lat = localState.map.getCenter().lat();
  const lng = localState.map.getCenter().lng();

  geoCoder.geocode(
    {
      location: { lat, lng, }
    },
    (results, status) => {
      if (status === 'OK') {
        if (results[0]) {
          formTextFields.locationAddressField.instance.value = results[0].formatted_address;
          pendingLocation.formattedAddress = results[0].formatted_address;
          pendingLocation.address = results[0].formatted_address;
          pendingLocation.coordinates.lat = lat;
          pendingLocation.coordinates.lng = lng;
        } else {
          console.log("No results found");
        }
      } else {
        console.log(`Geocoder failed due to: ${status}`);
      }
    }
  );
};

const _buildMap = () => {
  const { pendingLocation } = localState;
  const zoomPosition = google.maps.ControlPosition.RIGHT_TOP;
  const options = {
    minZoom: 3,
    maxZoom: 19,
    streetViewControl: false,
    fullscreenControl: false,
    mapTypeControl: false,
    gestureHandling: 'greedy',
    zoomControlOptions: {
      position: zoomPosition,
    },
    disableDefaultUI: true,
    // center: new google.maps.LatLng(52.5498783, 13.425209099999961),
    center: constants.getDefaultLocation(),
    zoom: 14,
  };

  if (pendingLocation.coordinates.lat && pendingLocation.coordinates.lng) {
    options.center = {
      lat: pendingLocation.coordinates.lat, lng: pendingLocation.coordinates.lng
    };
  }
  localState.map = new google.maps.Map(document.getElementById('locationMapContainer'), options);
  google.maps.event.addListener(localState.map, 'center_changed', () => {
    if (localState.geocodeTimeout) clearTimeout(localState.geocodeTimeout);
    localState.geocodeTimeout = setTimeout(_reverseAddress, 500);
  });

  const marker = document.createElement('div');
  marker.classList.add('centered-marker');

  const mapContainer = localState.map.getDiv();
  mapContainer.appendChild(marker);
};

const _saveChanges = (e) => {
  const { pendingLocation } = localState;
  pendingLocation.title = formTextFields.locationTitleField.instance.value;
  pendingLocation.subtitle = formTextFields.locationSubtitleField.instance.value;
  pendingLocation.address = formTextFields.locationAddressField.instance.value;
  pendingLocation.addressAlias = formTextFields.locationAddressAliasField.instance.value;
  pendingLocation.openingHours = { ...pendingLocation.openingHours, ...localState.selectedOpeningHours };

  const { days } = pendingLocation.openingHours;
  for (const day in days) {
    if (days[day]) {
      days[day].intervals = days[day].intervals.filter((d) => typeof d !== 'undefined');
    }
  }

  if (!_validateLocationSave()) return;
  if (!validateOpeningHoursDuplication(pendingLocation.openingHours)) return;

  e.target.disabled = true;

  updateLocation(pendingLocation.id, pendingLocation)
    .then(() => {
      showToastMessage('locationSaved', 5000);
      _reflectChanges();
      buildfire.history.pop();
      introView.refreshIntroductoryCarousel();
    })
    .catch((err) => {
      e.target.disabled = false;
    });
};

const _createImageHolder = (options, onClick, onDelete) => {
  const { hasImage, imageUrl } = options;

  const div = document.createElement('div');
  div.className = 'img-select-holder';
  const button = document.createElement('button');
  button.className = 'img-select margin-right-ten';
  if (hasImage) button.classList.add('has-img');

  const i = document.createElement('i');
  i.className = 'material-icons-outlined mdc-text-field__icon mdc-theme--text-icon-on-background delete-img-btn';
  i.textContent = 'close';
  i.tabIndex = '0';
  div.appendChild(button);
  const img = document.createElement('img');
  img.src = imageUrl ?? '';
  button.appendChild(i);
  button.appendChild(img);

  if (onClick) button.onclick = onClick;
  if (onDelete) i.onclick = onDelete;
  return div;
};

const _refreshLocationImages = () => {
  const { pendingLocation } = localState;

  const locationImagesList = document.querySelector('#locationImagesList');
  locationImagesList.innerHTML = '';
  locationImagesList.appendChild(_createImageHolder({ hasImage: false }, _addLocationCarousel));
  pendingLocation.images.forEach((image) => {
    const div = _createImageHolder(
      {
        hasImage: true,
        imageUrl: cropImage(image.imageUrl, {
          width: 64,
          height: 64
        })
      },
      null,
      (e) => {
        e.stopPropagation();
        pendingLocation.images.splice(pendingLocation.images.findIndex((l) => l.id === image.id), 1);
        div.remove();
      }
    );
    locationImagesList.appendChild(div);
  });
};

const _addLocationCarousel = () => {
  const { pendingLocation } = localState;
  if (state.carouselUploadPending) return;
  const uploadOptions = { allowMultipleFilesUpload: true };
  const locationImagesList = document.querySelector('#locationImagesList');
  const locationImagesSelectBtn = locationImagesList.querySelector('button');
  uploadImages(
    uploadOptions,
    (onProgress) => {
      state.carouselUploadPending = true;
      locationImagesSelectBtn.disabled = true;
      console.log(`onProgress${JSON.stringify(onProgress)}`);
    },
    (err, files) => {
      state.carouselUploadPending = false;
      locationImagesSelectBtn.disabled = false;
      if (files) {
        pendingLocation.images = [...pendingLocation.images, ...files.map((i) => ({ imageUrl: i.url, id: generateUUID() }))];
        _refreshLocationImages();
      }
    }
  );
};

const _initAddressAutocompleteField = (textfield) => {
  const { pendingLocation } = localState;
  const areaSearchTextField = document.querySelector(`#${textfield}`);
  const autocomplete = new google.maps.places.SearchBox(
    areaSearchTextField,
    {
      types: ["address"],
    }
  );

  // fix fast click is preventing touch on places list
  setTimeout(() => {
    // select the latest search box container
    const containers = document.querySelectorAll('.pac-container');
    const target = containers[containers.length - 1];
    if (target) {
      const observer = new MutationObserver(() => {
        target.querySelectorAll('.pac-item span, .pac-item')
          .forEach((n) => n.classList.add('needsclick'));
      });
      observer.observe(target, { childList: true });
    }
  }, 2000);
  autocomplete.addListener('places_changed', () => {
    const places = autocomplete.getPlaces();
    const place = places[0];
    if (!place || !place.geometry) return;
    pendingLocation.coordinates.lat = place.geometry.location.lat();
    pendingLocation.coordinates.lng = place.geometry.location.lng();
    pendingLocation.formattedAddress = place.formatted_address;
    localState.map.setCenter(pendingLocation.coordinates);
  });
};

const _initCategoriesOverlay = () => {
  let html = '';
  const container = document.querySelector('#categories .expansion-panel__container .accordion');
  state.categories.forEach((category) => {
    let categoryIcon = `<i class="${category.iconClassName ?? 'glyphicon glyphicon-map-marker'}"></i>`;
    if (category.iconUrl) {
      categoryIcon = `<img src="${category.iconUrl}" alt="category icon">`;
    }
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
              <div class="expansion-panel-indicator mdc-theme--text-primary-on-background"></div>
            </div>
          </div>
        </button>
        <div class="expansion-panel-body">
          <div class="mdc-chip-set mdc-chip-set--filter expansion-panel-body-content" role="grid">
          ${category.subcategories.length > 0 ? category.subcategories.map((subcategory) => `<div class="mdc-chip mdc-theme--text-primary-on-background" role="row" data-sid="${subcategory.id}">
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
            </div>`).join('\n') : ''}
        </div>
      </div>
      </div>`;
  });
  container.innerHTML = html;
  new Accordion({
    element: container,
    multi: true
  });

  const chipSetsElements = document.querySelectorAll('#categories .mdc-chip-set');
  const chipSets = {};
  Array.from(chipSetsElements).forEach((c) => {
    const parent = c.closest('div.expansion-panel');
    chipSets[parent.dataset.cid] = new mdc.chips.MDCChipSet(c);
  });

  const expansionPanelCheckBox = document.querySelectorAll('#categories .mdc-checkbox input');
  Array.from(expansionPanelCheckBox).forEach((c) => {
    const parent = c.closest('div.expansion-panel');
    const categoryId = parent.dataset.cid;
    const category = state.categories.find((c) => c.id === categoryId);
    const input = parent.querySelector('.mdc-checkbox__native-control');
    const subCategoriesIds = category.subcategories.map((s) => s.id);
    const { categories } = localState.pendingLocation;

    if (categories.main.indexOf(categoryId) > -1) {
      input.checked = true;
      chipSets[categoryId].chips.forEach((c) => {
        const { sid } = c.root_.dataset;
        if (categories.subcategories.indexOf(sid) > -1) {
          c.selected = true;
        }
      });
    }

    c.addEventListener('change', (e) => {
      const { target } = e;
      const mdcCheckBox = target.closest('.mdc-checkbox');

      if (!target.checked) {
        categories.main = categories.main.filter((c) => c !== categoryId);
        categories.subcategories = categories.subcategories.filter((c) => subCategoriesIds.indexOf(c) === -1);
      } else if (!categories.main.includes(categoryId)) {
        categories.main.push(categoryId);
      }

      if (!target.checked) {
        chipSets[categoryId].chips.forEach((c) => c.selected = target.checked);
      }

      target.disabled = true;
      mdcCheckBox.classList.add('mdc-checkbox--disabled');
      setTimeout(() => {
        target.disabled = false;
        mdcCheckBox.classList.remove('mdc-checkbox--disabled');
      }, 500);
    });
  });

  const subcategoriesChips = document.querySelectorAll('#categories .mdc-chip');
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
    const { categories } = localState.pendingLocation;

    if (selected) {
      input.checked = true;
      if (!categories.subcategories.includes(subcategoryId)) {
        categories.subcategories.push(subcategoryId);
      }
      if (!categories.main.includes(categoryId)) {
        categories.main.push(categoryId);
      }
    } else {
      categories.subcategories = categories.subcategories.filter((item) => item !== subcategoryId);
    }

    if (selected && !categories.main.includes(categoryId)) {
      categories.main.push(categoryId);
    }

    mdcChip.classList.add('disabled');
    setTimeout(() => mdcChip.classList.remove('disabled'), 500);
  }));
};

const _showCategoriesOverlay = () => {
  const overlay = document.querySelector('section#categories');
  const currentActive = document.querySelector('section.active');

  currentActive?.classList.remove('active');
  overlay.classList.add('overlay');
  addBreadcrumb({ pageName: 'categoriesEdit' });
};

const _renderDayIntervals = (day, dayIntervalsContainer) => {
  dayIntervalsContainer.innerHTML = '';
  day.intervals?.forEach((interval, intervalIndex) => {
    if (!interval) return;
    const template = document.getElementById('dayIntervalTemplate').content.firstChild;
    const dayInterval = template.cloneNode(true);

    const fromInput = dayInterval.querySelector(".from");
    const toInput = dayInterval.querySelector(".to");
    const intervalError = dayInterval.querySelector(".interval-error");
    const deleteBtn = dayInterval.querySelector(".delete-interval-btn");
    const addHoursBtn = dayInterval.querySelector(".add-hours-btn");

    dayInterval.id = generateUUID(); // todo is it needed ?
    fromInput.value = convertDateToTime(interval.from);
    toInput.value = convertDateToTime(interval.to);

    _validateTimeInterval(interval.from, interval.to, intervalError);

    if (intervalIndex === 0) {
      deleteBtn.classList.add('hidden');
      addHoursBtn.classList.remove('hidden');
    } else {
      addHoursBtn.classList.add('hidden');
      deleteBtn.classList.remove('hidden');
    }

    fromInput.onchange = (e) => {
      const start = convertTimeToDate(e.target.value);
      interval.from = start;
      if (!_validateTimeInterval(start, interval.to, intervalError)) {

      }
    };

    toInput.onchange = (e) => {
      const end = convertTimeToDate(e.target.value);
      interval.to = end;
      if (!_validateTimeInterval(interval.from, end, intervalError)) {

      }
    };

    deleteBtn.onclick = (e) => {
      day.intervals[intervalIndex] = undefined;
      dayInterval.remove();
      if (editViewAccordion) editViewAccordion.setSize();
    };

    addHoursBtn.onclick = (e) => {
      day.intervals?.push({ from: convertTimeToDate("08:00"), to: convertTimeToDate("20:00") });
      _renderDayIntervals(day, dayIntervalsContainer);
      if (editViewAccordion) editViewAccordion.setSize();
    };

    dayIntervalsContainer.appendChild(dayInterval);
  });
};

const _renderOpeningHours = () => {
  const openingHoursContainer = document.querySelector('#locationOpeningHoursContainer');
  const { openingHours } = localState.pendingLocation;
  localState.selectedOpeningHours.days =  { ...localState.selectedOpeningHours.days, ...openingHours.days };
  const { days } = localState.selectedOpeningHours;

  for (const day in days) {
    if (days[day]) {
      const openingHoursDayItem = createTemplate('openingHoursDayItemTemplate');
      const enableDayInput = openingHoursDayItem.querySelector('.enable-day-input');
      const enableDayLabel = openingHoursDayItem.querySelector('h4');
      const dayIntervals = openingHoursDayItem.querySelector(".day-intervals");

      openingHoursDayItem.id = day;

      enableDayInput.id = `enable-${day}-checkbox`;
      enableDayLabel.innerHTML = window.strings.get(`locationEditing.${day}`).v;
      enableDayInput.checked = !!days[day]?.active;
      enableDayInput.onchange = (e) => {
        days[day].active = e.target.checked;
      };

      _renderDayIntervals(days[day], dayIntervals);
      openingHoursContainer.appendChild(openingHoursDayItem);
    }
  }
};

const _uploadListImage = () => {
  const locationListImageInput = document.querySelector('#locationListImageInput');
  const listImageImg = locationListImageInput.querySelector('img');
  const listImageSelectBtn = locationListImageInput.querySelector('button');

  const { pendingLocation } = localState;
  if (localState.imageUploadPending) return;
  const uploadOptions = { allowMultipleFilesUpload: false };
  uploadImages(
    uploadOptions,
    (onProgress) => {
      localState.imageUploadPending = true;
      listImageSelectBtn.disabled = true;
      console.log(`onProgress${JSON.stringify(onProgress)}`);
    },
    (err, files) => {
      localState.imageUploadPending = false;
      listImageSelectBtn.disabled = false;
      if (files) {
        const { url } = files[0];
        pendingLocation.listImage = url;
        listImageImg.src = cropImage(url, {
          width: 64,
          height: 64,
        });
        listImageSelectBtn.classList.add('has-img');
        _toggleInputError('locationListImageFieldHelper', false);
      }
    }
  );
};

const init = () => {
  if (!state.selectedLocation || !accessManager.canEditLocations()) return;

  localState.pendingLocation =  new Location(state.selectedLocation);
  const { pendingLocation } = localState;
  const editView = document.querySelector('section#edit');

  formTextFields = {
    locationTitleField: {
      instance: null,
      value: pendingLocation.title,
      required: true
    },
    locationSubtitleField: {
      instance: null,
      value: pendingLocation.subtitle,
      required: false
    },
    locationAddressField: {
      instance: null,
      value: pendingLocation.address,
      required: true
    },
    locationAddressAliasField: {
      instance: null,
      value: pendingLocation.addressAlias,
      required: false
    },
    locationDescriptionField: {
      id: 'locationDescriptionField',
      instance: null,
      value: pendingLocation.description,
      required: true
    },
    locationStarRatingSwitch: {
      instance: null,
      value: pendingLocation.settings.showStarRating
    },
    locationShowCategorySwitch: {
      instance: null,
      value: pendingLocation.settings.showCategory
    },
    locationEnableEditingSwitch: {
      instance: null,
      value: false
    },
    locationPriceRangeSwitch: {
      instance: null,
      value: pendingLocation.settings.showPriceRange
    },
    locationOpeningHoursSwitch: {
      instance: null,
      value: pendingLocation.settings.showOpeningHours
    },
    locationCurrencySelect: {
      instance: null,
      value: pendingLocation.price.currency,
      set(val) {
        this.value = val;
        pendingLocation.price.currency = val;
      }
    },
    locationPriceRangeSelect: {
      instance: null,
      value: pendingLocation.price.range,
      set(val) {
        this.value = val;
        pendingLocation.price.range = Number(val);
      }
    }
  };

  Promise.all([
    views.fetch('edit'),
    views.fetch('categories')
  ])
    .then(() => {
      views.inject('edit');
      views.inject('categories');
      const locationListImageInput = document.querySelector('#locationListImageInput');
      const listImageImg = locationListImageInput.querySelector('img');
      const listImageSelectBtn = locationListImageInput.querySelector('button');
      const listImageDeleteBtn = locationListImageInput.querySelector('.delete-img-btn');
      const descriptionTextArea = document.querySelector('#locationDescriptionField textarea');
      const enableEditingContainer = document.querySelector('#locationEnableEditingContainer');
      const descriptionNote = document.querySelector('#descriptionNote');

      listImageDeleteBtn.onclick = (e) => {
        e.stopPropagation();
        pendingLocation.listImage = null;
        listImageSelectBtn.classList.remove('has-img');
      };

      listImageSelectBtn.onclick = _uploadListImage;
      listImageImg.src = cropImage(pendingLocation.listImage, { width: 64, height: 64, });

      _buildMap();
      refreshCategoriesText();
      _refreshLocationImages();
      _renderOpeningHours();
      _initAddressAutocompleteField('locationAddressFieldInput');

      editView.addEventListener('click', (e) => {
        if (e.target.id === 'saveChangesBtn') {
          _saveChanges(e);
        } else if (e.target.id === 'hideEditNoteBtn') {
          e.target.closest('.mdc-card').remove();
        } else if (e.target.id === 'locationCategoriesOverview') {
          _initCategoriesOverlay();
          _showCategoriesOverlay();
        }
      });
      editView.querySelectorAll('.mdc-text-field').forEach((i) => {
        const instance = new mdc.textField.MDCTextField(i);
        if (formTextFields[i.id]) {
          const field = formTextFields[i.id];
          instance.value = field.value || '';
          instance.required = field.required;
          field.instance = instance;
        }
      });
      editView.querySelectorAll('.mdc-select').forEach(((i) => {
        const field = formTextFields[i.id];
        const instance = new mdc.select.MDCSelect(i);
        instance.value = String(field.value);
        instance.listen('MDCSelect:change', () => {
          field.set(instance.value);
        });
        field.instance = instance;
      }));
      editView.addEventListener('change', (e) => {
        if (e.target.id === 'locationStarRatingInput') {
          pendingLocation.settings.showStarRating = e.target.checked;
        } else if (e.target.id === 'locationShowCategoryInput') {
          pendingLocation.settings.showCategory = e.target.checked;
        } else if (e.target.id === 'locationPriceRangeInput') {
          pendingLocation.settings.showPriceRange = e.target.checked;
        } else if (e.target.id === 'locationOpeningHoursInput') {
          pendingLocation.settings.showOpeningHours = e.target.checked;
        } else if (e.target.id === 'locationEnableEditingInput') {
          if (e.target.checked) {
            _toggleDescriptionTextarea(false);
            formTextFields.locationDescriptionField.instance.value = '';
            pendingLocation.description = '';
          } else {
            _toggleDescriptionTextarea(true);
            formTextFields.locationDescriptionField.instance.value = state.selectedLocation.description;
            pendingLocation.description = state.selectedLocation.description;
            pendingLocation.wysiwygSource = 'control';
          }
        }
      });
      editView.querySelectorAll('.mdc-switch').forEach(((i) => {
        const instance = new mdc.switchControl.MDCSwitch(i);
        if (formTextFields[i.id]) {
          const field = formTextFields[i.id];
          instance.checked = field.value;
          field.instance = instance;
        }
      }));

      descriptionTextArea.addEventListener('focus', _handleDescriptionInput);
      if (pendingLocation.wysiwygSource === 'control') {
        enableEditingContainer.classList.remove('hidden');
        descriptionNote.classList.remove('hidden');
      } else if (pendingLocation.wysiwygSource === 'widget') {
        _toggleDescriptionTextarea(false);
      }

      window.strings.inject(document.querySelector('section#edit'), false);
      showLocationEdit();
      editViewAccordion = new Accordion({
        element: document.querySelector('.edit-location-accordion'),
        multi: true,
        expanded: true
      });
    })
    .catch((err) => {
      console.error(`error initilizing editView ${err}`);
    });
};

export default { init, refreshCategoriesText };
