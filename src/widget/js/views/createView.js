import state from '../state';
import Location from '../../../entities/Location';
import views from '../Views';
import {
  createTemplate,
  generateUUID,
  getDefaultOpeningHours,
  showToastMessage,
  transformCategoriesToText,
  addBreadcrumb,
  getActiveTemplate,
  cropImage
} from '../util/helpers';
import { navigateTo, resetBodyScroll } from '../util/ui';
import Accordion from '../Accordion';
import { convertDateToTime, convertTimeToDate } from '../../../utils/datetime';
import mapView from './mapView';
import introView from './introView';
import { validateOpeningHoursDuplication } from '../../../shared/utils';
import accessManager from '../accessManager';
import widgetController from '../../widget.controller';
import {
  validateTimeInterval,
  uploadImages, toggleFieldError, createImageHolder, validateOpeningHours
} from '../util/forms';
import constants from '../constants';

export default {
  get _defaultFieldsInfo() {
    return {
      title: {
        id: 'locationTitleTextField',
        instance: null,
        value: '',
        required: true
      },
      subtitle: {
        id: 'locationSubtitleTextField',
        instance: null,
        value: '',
        required: false
      },
      address: {
        id: 'locationAddressTextField',
        instance: null,
        value: null,
        required: true
      },
      addressAlias: {
        id: 'locationCustomNameTextField',
        instance: null,
        value: '',
        required: false
      },
      showCategory: {
        id: 'locationShowCategoryCheckbox',
        instance: null,
        value: true,
        required: false
      },
      showPriceRange: {
        id: 'locationShowPriceRangeCheckbox',
        instance: null,
        value: false,
        required: false
      },
      currency: {
        instance: null,
        id: 'locationCurrencySelect',
        value: null,
        set(val, payload) {
          this.value = val;
          payload.price.currency = val;
        }
      },
      priceRange: {
        instance: null,
        id: 'locationPriceRangeSelect',
        value: null,
        set(val, payload) {
          this.value = val;
          payload.price.range = Number(val);
        }
      },
      showStarRating: {
        id: 'locationShowStarRatingCheckbox',
        instance: null,
        value: false,
        required: false
      },
      showOpeningHours: {
        id: 'locationShowOpeningHoursCheckbox',
        instance: null,
        value: false,
        required: false
      }
    };
  },
  _accordion: null,
  _map: null,
  _isCurrentlyUploading: false,
  _isCurrentlyImagesUploading: false,
  payload: null,
  _formFieldsInstances: null,
  _currentImageOnProgress: [],
  _querySelect(selector) {
    const createView = document.querySelector('section#create');
    return createView.querySelector(selector);
  },
  _handleChangeLocationImages() {
    if (this._isCurrentlyImagesUploading) return;
    const uploadOptions = { allowMultipleFilesUpload: true };
    const locationImagesList = this._querySelect('#locationListImagesContainer');
    const locationImagesSelectBtn = locationImagesList.querySelector('button');

    uploadImages(
      uploadOptions,
      (onProgress) => {
        const existImage = this._currentImageOnProgress.find(_imgObj=>_imgObj.fileId==onProgress.file.fileId&&_imgObj.filename==onProgress.file.filename&&_imgObj.percentage<=onProgress.file.percentage);
          if(!existImage){
            this._isCurrentlyImagesUploading = true;
            locationImagesSelectBtn.classList.add('hidden');
            this._currentImageOnProgress.push({fileId:onProgress.file.fileId,filename:onProgress.file.filename,percentage:onProgress.file.percentage, source:'carousel'});
            this._buildUploadImageSkeleton();
        }else{
            existImage.percentage = onProgress.file.percentage;
        }
        console.log(`onProgress${JSON.stringify(onProgress)}`);
      },
      (err, files) => {
        this._currentImageOnProgress = this._currentImageOnProgress.filter(_imgObj=>(_imgObj.source!=='carousel'));
        locationImagesSelectBtn.classList.remove('hidden');
        this._isCurrentlyImagesUploading = false;
        if (files) {
          this.payload.images = [
            ...this.payload.images,
            ...files.map((i) => ({ imageUrl: i.url, id: generateUUID() }))
          ];
          this._buildLocationImages();
        }
      }
    );
  },
  _buildUploadImageSkeleton(){
    const locationImagesList = this._querySelect('#locationListImagesContainer');
    locationImagesList.appendChild(createImageHolder({ hasSkeleton: true, hasImage: false }, null));
  },
  _buildLocationImages() {
    const locationImagesList = this._querySelect('#locationListImagesContainer');
    locationImagesList.innerHTML = '';
    locationImagesList.appendChild(
      createImageHolder({ hasImage: false }, this._handleChangeLocationImages.bind(this))
    );

    if (this.payload.images?.length) {
      this.payload.images.forEach((image) => {
        const div = createImageHolder(
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
            this.payload.images.splice(
              this.payload.images.findIndex((l) => l.id === image.id),
              1
            );
            div.remove();
          }
        );
        locationImagesList.appendChild(div);
      });
    }
  },
  _renderDayIntervals(day, dayIntervalsContainer) {
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

      dayInterval.id = generateUUID();
      fromInput.value = convertDateToTime(interval.from);
      toInput.value = convertDateToTime(interval.to);

      validateTimeInterval(interval.from, interval.to, intervalError);

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
        if (!validateTimeInterval(start, interval.to, intervalError)) {

        }
      };

      toInput.onchange = (e) => {
        const end = convertTimeToDate(e.target.value);
        interval.to = end;
        if (!validateTimeInterval(interval.from, end, intervalError)) {

        }
      };

      deleteBtn.onclick = (e) => {
        day.intervals[intervalIndex] = undefined;
        dayInterval.remove();
        if (this._accordion) this._accordion.setSize();
      };

      addHoursBtn.onclick = (e) => {
        day.intervals?.push({ from: convertTimeToDate("08:00"), to: convertTimeToDate("20:00") });
        this._renderDayIntervals(day, dayIntervalsContainer);
        if (this._accordion) this._accordion.setSize();
      };

      dayIntervalsContainer.appendChild(dayInterval);
    });
  },
  validate() {
    const {
      title,
      description,
      address,
      coordinates,
      listImage,
      openingHours
    } = this.payload;
    let isValid = true;

    if (!title) {
      isValid = false;
      toggleFieldError(this._querySelect(`#${this._formFieldsInstances.title.id}`), true);
      toggleFieldError(this._querySelect(`#${this._formFieldsInstances.title.id} ~ .mdc-text-field-helper-line`), true);
    } else {
      toggleFieldError(this._querySelect(`#${this._formFieldsInstances.title.id}`), false);
      toggleFieldError(this._querySelect(`#${this._formFieldsInstances.title.id} ~ .mdc-text-field-helper-line`), false);
    }

    if (!description) {
      isValid = false;
      toggleFieldError(this._querySelect('#locationDescriptionTextField'), true);
      toggleFieldError(this._querySelect('#locationDescriptionTextField ~ .mdc-text-field-helper-line'), true);
    } else {
      toggleFieldError(this._querySelect('#locationDescriptionTextField'), false);
      toggleFieldError(this._querySelect('#locationDescriptionTextField ~ .mdc-text-field-helper-line'), false);
    }

    if (!address || !coordinates.lat || !coordinates.lng) {
      isValid = false;
      toggleFieldError(this._querySelect(`#${this._formFieldsInstances.address.id}`), true);
      toggleFieldError(this._querySelect(`#${this._formFieldsInstances.address.id} ~ .mdc-text-field-helper-line`), true);
    } else {
      toggleFieldError(this._querySelect(`#${this._formFieldsInstances.address.id}`), false);
      toggleFieldError(this._querySelect(`#${this._formFieldsInstances.address.id} ~ .mdc-text-field-helper-line`), false);
    }

    if (!listImage) {
      toggleFieldError(this._querySelect('#locationListImageFieldHelper'), true);
      isValid = false;
    } else {
      toggleFieldError(this._querySelect('#locationListImageFieldHelper'), false);
    }

    if (!validateOpeningHours(openingHours)) {
      isValid = false;
    }

    return { isValid };
  },
  submit(e) {
    this.payload.title = this._formFieldsInstances.title.instance.value;
    this.payload.subtitle = this._formFieldsInstances.subtitle.instance.value;
    this.payload.address = this._formFieldsInstances.address.instance.value;
    this.payload.addressAlias = this._formFieldsInstances.addressAlias.instance.value;

    const { days } = this.payload.openingHours;
    for (const day in days) {
      if (days[day]) {
        days[day].intervals = days[day].intervals.filter((d) => typeof d !== 'undefined');
      }
    }

    const { isValid } = this.validate();

    if (!isValid || !validateOpeningHoursDuplication(this.payload.openingHours)) {
      e.target.disabled = false;
      return;
    }

    widgetController.createLocation(this.payload)
      .then((result) => {
        showToastMessage('locationSaved', 5000);
        this._appendToLocationsList(result);
        buildfire.history.pop();
        introView.refreshIntroductoryCarousel();
      })
      .catch((err) => {
        console.error(err);
        e.target.disabled = false;
      });
  },
  _appendToLocationsList(createdLocation) {
    const activeTemplate = getActiveTemplate();

    state.listLocations.push(createdLocation);
    state.pinnedLocations.push(createdLocation);

    if (activeTemplate === 'intro') {
      introView.clearIntroViewList();
      introView.renderIntroductoryLocations(state.listLocations, true);
    } else {
      mapView.clearMapViewList();
      mapView.renderListingLocations(state.listLocations);
    }
  },
  _hideElement(element) {
    element.classList.add('hidden');
  },
  show() {
    state.breadcrumbs = [];
    resetBodyScroll();
    navigateTo('create');
    addBreadcrumb({ pageName: 'create', title: 'Location Create' });
  },
  buildForm() {
    this._accordion = new Accordion({
      element: this._querySelect('.create-location-accordion'),
      multi: true,
      expanded: true
    });

    this._formFieldsInstances = this._defaultFieldsInfo;

    const { allowOpenHours, allowPriceRange } = state.settings.globalEntries;

    if (!allowOpenHours) {
      this._hideElement(this._querySelect('#openHoursExpansion'));
    }
    if (!allowPriceRange) {
      this._hideElement(this._querySelect('#priceRangeExpansion'));
    }

    this._buildOpeningSchedule();
    this._buildListImage();
    this._buildLocationImages();

    const createView = document.querySelector('section#create');

    createView.querySelectorAll('.mdc-text-field').forEach((i) => {
      const instance = new mdc.textField.MDCTextField(i);
      const key = Object
        .keys(this._formFieldsInstances)
        .find((key) => this._formFieldsInstances[key].id === i.id);
      const field = this._formFieldsInstances[key];
      if (field) {
        instance.value = field.value || '';
        instance.required = field.required;
        field.instance = instance;
      }

      this._handleAddressInput();
    });
    createView.querySelectorAll('.mdc-switch').forEach(((i) => {
      const instance = new mdc.switchControl.MDCSwitch(i);
      const key = Object
        .keys(this._formFieldsInstances)
        .find((key) => this._formFieldsInstances[key].id === i.id);
      const field = this._formFieldsInstances[key];

      if (field) {
        instance.checked = field.value;
        field.instance = instance;
      }
    }));
    createView.querySelectorAll('.mdc-select').forEach(((i) => {
      const instance = new mdc.select.MDCSelect(i);
      const key = Object
        .keys(this._formFieldsInstances)
        .find((key) => this._formFieldsInstances[key].id === i.id);
      const field = this._formFieldsInstances[key];
      if (!field) return;
      instance.value = String(field.value);
      instance.listen('MDCSelect:change', () => {
        field.set(instance.value, this.payload);
      });
      field.instance = instance;
    }));
  },
  _buildOpeningSchedule() {
    const openingHoursContainer = this._querySelect('#locationOpeningHoursContainer');

    this.payload.openingHours = getDefaultOpeningHours();
    const { days } = this.payload.openingHours;

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

        this._renderDayIntervals(days[day], dayIntervals);
        openingHoursContainer.appendChild(openingHoursDayItem);
      }
    }
  },
  _buildListImage() {
    const createView = document.querySelector('section#create');
    const listImageInput = createView.querySelector('#locationListImageInput');
    const listImageImg = listImageInput.querySelector('img');
    const listImageAddBtn = listImageInput.querySelector('button');
    const listImageDeleteBtn = listImageInput.querySelector('.delete-img-btn');

    listImageDeleteBtn.onclick = (e) => {
      e.stopPropagation();
      this.payload.listImage = null;
      listImageAddBtn.classList.remove('has-img');
    };

    listImageAddBtn.onclick = this._uploadListImage.bind(this);
    listImageImg.src = cropImage(this.payload.listImage, { width: 64, height: 64, });
  },
  _uploadListImage() {
    const listImageInput = this._querySelect('#locationListImageInput');
    const listImageImg = listImageInput.querySelector('img');
    const listImageSelectBtn = listImageInput.querySelector('button');
    const listImageSkeletonContainer = locationListImageInput.querySelector('.img-skeleton-container');

    if (this._isCurrentlyUploading) return;
    const uploadOptions = { allowMultipleFilesUpload: false };
    uploadImages(
      uploadOptions,
      (onProgress) => {
        const existImage = this._currentImageOnProgress.find(_imgObj=>_imgObj.fileId==onProgress.file.fileId&&_imgObj.filename==onProgress.file.filename&&_imgObj.percentage<=onProgress.file.percentage);
        if(!existImage){
          this._isCurrentlyUploading = true;
          this._currentImageOnProgress.push({fileId:onProgress.file.fileId,filename:onProgress.file.filename,percentage:onProgress.file.percentage, source:'location'});
          listImageSkeletonContainer.classList.remove('hidden');
          listImageSelectBtn.classList.add('hidden');
        }else{
          existImage.percentage= onProgress.file.percentage;
        }
        console.log(`onProgress${JSON.stringify(onProgress)}`);
      },
      (err, files) => {
        this._currentImageOnProgress = this._currentImageOnProgress.filter(_imgObj=>(_imgObj.source!=='location'));
        this._isCurrentlyUploading = false;
        listImageSkeletonContainer.classList.add('hidden');
        listImageSelectBtn.classList.remove('hidden');
        if (files) {
          const { url } = files[0];
          this.payload.listImage = url;
          listImageImg.src = cropImage(url, {
            width: 64,
            height: 64,
          });
          listImageSelectBtn.classList.add('has-img');
          toggleFieldError('locationListImageFieldHelper', false);
        }
      }
    );
  },
  _buildCategoriesOverview() {
    let html = '';
    const container = document.querySelector('#categories .expansion-panel__container .accordion');
    state.categories.forEach((category) => {
      let categoryIcon = `<i class="custom-category-icon ${category.iconClassName ?? 'bf-icon bf-icon-geo-alt'}"></i>`;
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
      const { categories } = this.payload;

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
      const { categories } = this.payload;

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
  },
  refreshCategoriesOverviewSubtitle() {
    const locationCategoriesOverview = this._querySelect('#locationCategoriesOverview');
    const locationCategoriesText = locationCategoriesOverview.querySelector('h5');
    const categoriesText = transformCategoriesToText(this.payload.categories, state.categories);

    if (categoriesText) {
      locationCategoriesText.textContent = categoriesText;
      locationCategoriesText.classList.remove('hidden');
    } else {
      locationCategoriesText.classList.add('hidden');
    }
  },
  _showCategoriesOverlay() {
    const overlay = document.querySelector('section#categories');
    const currentActive = document.querySelector('section.active');

    currentActive?.classList.remove('active');
    overlay.classList.add('overlay');
    addBreadcrumb({ pageName: 'categoriesCreate' });
  },
  _handleAddressInput() {
    const addressInput = this._querySelect('#locationAddressTextField input');
    const autocomplete = new google.maps.places.SearchBox(
      addressInput,
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
      this.payload.coordinates.lat = place.geometry.location.lat();
      this.payload.coordinates.lng = place.geometry.location.lng();
      this.payload.formattedAddress = place.formatted_address;
      this.payload.address = place.formatted_address;
      this._map.setCenter(this.payload.coordinates);
    });
  },
  _handleDescriptionInput(e) {
    if (e.target.classList.contains('disabled')) return;
    e.target.classList.add('disabled');
    buildfire.input.showTextDialog(
      {
        placeholder: window.strings.get('locationEditing.descriptionDialogPlaceholder').v,
        saveText: window.strings.get('locationEditing.descriptionDialogSave').v,
        cancelText: window.strings.get('locationEditing.descriptionDialogCancel').v,
        defaultValue: this.payload.description,
        wysiwyg: true,
      },
      (err, response) => {
        e.target.classList.remove('disabled');
        if (err) return console.error(err);
        if (response.cancelled) return;
        this.payload.description = response.results[0].wysiwygValue;
        e.target.innerHTML = response.results[0].wysiwygValue || `<label class="mdc-floating-label">${window.strings.get('locationEditing.locationDescription').v}</label>`;
      }
    );
  },
  onViewClick(e) {
    if (e.target.id === 'locationDescriptionTextField') {
      this._handleDescriptionInput(e);
    } else if (e.target.id === 'submitBtn') {
      e.target.disabled = true;
      this.submit(e);
    } else if (e.target.id === 'locationCategoriesOverview') {
      this._buildCategoriesOverview();
      this._showCategoriesOverlay();
    }
  },
  onViewChange(e) {
    if (e.target.id === 'showCategoryCheckbox') {
      this.payload.settings.showCategory = e.target.checked;
    } else if (e.target.id === 'showPriceRangeCheckbox') {
      this.payload.settings.showPriceRange = e.target.checked;
    } else if (e.target.id === 'showOpeningHoursCheckbox') {
      this.payload.settings.showOpeningHours = e.target.checked;
    } else if (e.target.id === 'showStarRatingCheckbox') {
      this.payload.settings.showStarRating = e.target.checked;
    }
  },
  destroyEventsHandlers() {},
  buildEventsHandlers() {
    const createView = document.querySelector('section#create');
    const onViewHandler =  this.onViewClick.bind(this);
    const onChangeHandler =  this.onViewChange.bind(this);

    createView.addEventListener('click', onViewHandler);
    createView.addEventListener('change', onChangeHandler);

    this.destroyEventsHandlers = () => {
      createView.removeEventListener('click', onViewHandler);
      createView.removeEventListener('change', onChangeHandler);
    };
  },
  _reverseAddress() {
    const geoCoder = new google.maps.Geocoder();
    geoCoder.geocode(
      {
        location: {
          lat: this._map.getCenter().lat(),
          lng: this._map.getCenter().lng(),
        }
      },
      (results, status) => {
        if (status === 'OK') {
          if (results[0]) {
            this._formFieldsInstances.address.instance.value = results[0].formatted_address;
            this.payload.formattedAddress = results[0].formatted_address;
            this.payload.address = results[0].formatted_address;
            this.payload.coordinates.lat = this._map.getCenter().lat();
            this.payload.coordinates.lng = this._map.getCenter().lng();
          } else {
            console.log("No results found");
          }
        } else {
          console.log(`Geocoder failed due to: ${status}`);
        }
      }
    );
  },
  _geocodeTimeout: null,
  buildMap() {
    const zoomPosition = google.maps.ControlPosition.RIGHT_TOP;
    const options = {
      minZoom: 3,
      maxZoom: 19,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      gestureHandling: "greedy",
      zoomControlOptions: {
        position: zoomPosition,
      },
      disableDefaultUI: true,
      // center: new google.maps.LatLng(52.5498783, 13.425209099999961),
      center: constants.getDefaultLocation(),
      zoom: 14,
    };
    this._map = new google.maps.Map(document.querySelector('section#create #locationMapContainer'), options);
    google.maps.event.addListener(this._map, 'center_changed', () => {
      if (this._geocodeTimeout) clearTimeout(this._geocodeTimeout);
      this._geocodeTimeout = setTimeout(this._reverseAddress.bind(this), 500);
    });

    const marker = document.createElement('div');
    marker.classList.add('centered-marker');

    const mapContainer = this._map.getDiv();
    mapContainer.appendChild(marker);
  },
  // each time the user want to create!
  navigateTo() {
    const userHasAccess = accessManager.canCreateLocations();
    if (!userHasAccess) return;

    Promise.all([
      views.fetch('create'),
      views.fetch('categories')
    ])
      .then(() => {
        views.inject('create');
        views.inject('categories');

        this.payload = new Location({ wysiwygSource: 'widget' });
        this.buildForm();
        this.destroyEventsHandlers();
        this.buildEventsHandlers();
        this.buildMap();
        this.show();
        window.strings.inject(document.querySelector('section#create'), false);
      });
  },
};
