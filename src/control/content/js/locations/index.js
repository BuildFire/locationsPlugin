/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
import buildfire from "buildfire";
import Location from "../../../../entities/Location";
import SearchTableHelper from "../searchTable/searchTableHelper";
import searchTableConfig from "../searchTable/searchTableConfig";
import { generateUUID, createTemplate, getDefaultOpeningHours, toggleDropdown, handleInputError, isLatitude, isLongitude, showProgressDialog } from "../../utils/helpers";
import { downloadCsv, jsonToCsv, csvToJson, readCSVFile } from "../../utils/csv.helper";
import DialogComponent from "../dialog/dialog";
import LocationImagesUI from "./locationImagesUI";
import ActionItemsUI from "./actionItemsUI";
import LocationsController from "./controller";
import CategoriesController from "../categories/controller";
import globalState from '../../state';
import DeepLink from "../../../../utils/deeplink";
import { convertTimeToDate, convertDateToTime } from "../../../../utils/datetime";
import authManager from '../../../../UserAccessControl/authManager';
import Locations from "../../../../repository/Locations";
import Category from "../../../../entities/Category";
import { validateOpeningHoursDuplication } from '../../../../shared/utils';
import constants from '../../../../widget/js/constants';
import { isCameraControlVersion } from "../../../../shared/utils/mapUtils";

const breadcrumbsSelector = document.querySelector("#breadcrumbs");
const sidenavContainer = document.querySelector("#sidenav-container");
const locationsSection = document.querySelector("#main");
const inputLocationForm = document.querySelector("#form-holder");
let locationsTable = null;
let addLocationControls = {};
let selectCategoryDialog = null;
let locationImagesUI = null;
let notificationDialog = null;
let actionItemsUI = null;
let syncTimeOut;

const state = {
  locations: [],
  categories: [],
  pinnedLocations: [],
  categoriesLookup: {},
  map: null,
  locationObj: new Location(),
  selectedLocationCategories: { main: [], subcategories: [] },
  selectedOpeningHours: getDefaultOpeningHours(),
  weekDays: {
    sunday: "Sun",
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wen",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
  },
  isMapLoaded: false,
  breadcrumbs: [
    { title: "Locations", goBack: true },
  ],
  filter: {},
  sort: {
    "_buildfire.index.text": -1
  },
  pageIndex: 0,
  pageSize: 50,
  fetchingNextPage: false,
  fetchingEndReached: false,
  defaultCircleMarkerColor: {
    backgroundCSS: "background: rgba(253,35,5,1)",
    color: "rgba(253,35,5,1)",
    colorCSS: "color: rgba(253,35,5,1)",
    colorHex: "#fd2305",
    opacity: "100"
  },
  saveBtnClicked: false
};

const locationTemplateHeader = {
  id: 'id',
  title: "title",
  subtitle: "subtitle",
  address: "address",
  formattedAddress: "formattedAddress",
  addressAlias: "addressAlias",
  lat: "lat",
  lng: "lng",
  listImage: "listImage",
  description: "description",
  categories: "categories",
  markerType: "markerType",
  markerImage: "markerImage",
  markerColorRGBA: "markerColorRGBA",
  showCategory: "showCategory",
  showOpeningHours: "showOpeningHours",
  showPriceRange: "showPriceRange",
  showStarRating: "showStarRating",
  images: "images",
  views: "views",
  priceRange: "priceRange",
  priceCurrency: "priceCurrency",
  bookmarksCount: "bookmarksCount",
  phoneNumber: "phoneNumber",
  website: "website"
};

const locationInfoRowHeader = {
  id: '[!Reserved-Field!]',
  title: "Location Title Name is a required field",
  subtitle: "Subtitle of the location is a n optional field to add ",
  address: "Location address  is required filed, please make sure to upload accurate addresses from Google Map(https://www.google.com/maps) the address format is written with the format : Address Line 1, city , state , country and zip code",
  formattedAddress: "Google Map Location written with the format : Address Line 1, city , state , country and zip code",
  addressAlias: "This is for the Custom Location Title that can be displayed and pinned on the map ",
  lat: "Latitude (Required)",
  lng: "Longitude (Required)",
  listImage: "Please insert the location images as URL and you can upload multiple separated by comma ex: Image Url 1, Image Url 2ï؟½ ( this is a Required field to upload)",
  description: "Enter a Text or HTML Element (for the location description , this is a Required Field )",
  categories: "you can link each location to multiple categories and subcategories under each category , please fill as the below example to link category and subcategories together using the arrow and to set location to multiple use comma between each category, EX :  Category1 -> Subcategory1, Category1 -> Subcategory2, Category2",
  markerType: "Enter the type of the market as : Pin or Circle or Image",
  markerImage: "Please insert the location images as URL and you can upload multiple separated by comma ex: Image Url 1, Image Url 2 ( this is a Required field to upload)",
  markerColorRGBA: "If the marker type is selected to circle please fill this column with any of the following colors rgba(255,255,255,0)",
  showCategory: "TRUE or FALSE",
  showOpeningHours: "TRUE or FALSE",
  showPriceRange: "TRUE or FALSE",
  showStarRating: "TRUE or FALSE",
  images: "Insert images URLs separated by comma Image Url 1, Image Url 2 ",
  views: "",
  priceRange: "If price range is enabled select the following option :1  refer to $  or 2  refer $$ or 3 refer to $$$  or 4 refer $$$$",
  priceCurrency: "If price range is enabled select the currency type $ or €",
  bookmarksCount: "",
  phoneNumber: "Phone Number is an optional field, if provided will create a Call Phone Number Action Item with the provided Phone number.",
  website: "Website is an optional field, if provided will create a Web Content Action Item with the provided URL. The URL should starts with http or https, when possible use secure websites (https) some operating systems require it."
};

const renderAddLocationsPage = () => {
  sidenavContainer.style.display = "none";
  inputLocationForm.appendChild(createTemplate("addLocationTemplate"));
  inputLocationForm.style.display = "block";

  addLocationControls = {
    locationTitle: inputLocationForm.querySelector("#location-title-input"),
    locationTitleError: inputLocationForm.querySelector("#location-title-error"),
    locationSubtitle: inputLocationForm.querySelector("#location-subtitle-input"),
    locationSubtitleError: inputLocationForm.querySelector("#location-subtitle-error"),
    pinTopBtn: inputLocationForm.querySelector("#pin-top-btn"),
    pinnedLocationsLabel: inputLocationForm.querySelector("#location-pinned-label"),
    locationAddress: inputLocationForm.querySelector("#location-address-input"),
    locationAddressError: inputLocationForm.querySelector("#location-address-error"),
    locationCustomName: inputLocationForm.querySelector("#location-custom-name-input"),
    locationCustomNameError: inputLocationForm.querySelector("#location-custom-name-error"),
    markerTypeRadioBtns: inputLocationForm.querySelectorAll('input[name="markerType"]'),
    selectMarkerImageContainer: inputLocationForm.querySelector("#select-marker-image-container"),
    selectMarkerImageBtn: inputLocationForm.querySelector("#select-marker-image-btn"),
    markerImageError: inputLocationForm.querySelector("#location-marker-image-error"),
    selectMarkerColorContainer: inputLocationForm.querySelector("#select-marker-color-container"),
    selectMarkerColorBtn: inputLocationForm.querySelector("#select-marker-color-btn"),
    markerColorError: inputLocationForm.querySelector("#location-marker-color-error"),
    editCategoriesBtn: inputLocationForm.querySelector("#location-edit-categories-btn"),
    showCategoriesBtn: inputLocationForm.querySelector("#location-show-category-toggle"),
    categoriesContainer: inputLocationForm.querySelector("#location-categories-container"),
    categoriesCount: inputLocationForm.querySelector("#location-categories-count-txt"),
    categoriesList: inputLocationForm.querySelector("#location-categories-list"),
    locationCategoriesError: inputLocationForm.querySelector("#location-categories-error"),
    showOpeningHoursBtn: inputLocationForm.querySelector("#location-show-opening-hours-btn"),
    openingHoursContainer: inputLocationForm.querySelector("#location-opening-hours-container"),
    openingHoursFormGroup: inputLocationForm.querySelector("#locationOpeningHoursFormGroup"),
    priceRangeFormGroup: inputLocationForm.querySelector("#locationPriceRangeFormGroup"),
    showPriceRangeBtn: inputLocationForm.querySelector("#location-show-price-range-btn"),
    priceRangeRadioBtns: inputLocationForm.querySelectorAll('input[name="priceRangeValue"]'),
    selectPriceCurrency: inputLocationForm.querySelector("#location-select-price-currency"),
    showStarRatingBtn: inputLocationForm.querySelector("#location-show-star-rating-btn"),
    listImageBtn: inputLocationForm.querySelector("#location-list-image"),
    listImageError: inputLocationForm.querySelector("#location-list-image-error"),
    addLocationImageBtn: inputLocationForm.querySelector("#location-add-images-btn"),
    locationDescription: inputLocationForm.querySelector("#location-description-wysiwyg"),
    locationDescriptionError: inputLocationForm.querySelector("#location-description-error"),
    addActionItemsBtn: inputLocationForm.querySelector("#location-add-actions-btn"),
    saveBtn: inputLocationForm.querySelector("#location-save-btn"),
    cancelBtn: inputLocationForm.querySelector("#location-cancel-btn"),
    navigateToIntroLink: inputLocationForm.querySelector("#location-navigate-to-listview-link"),
    editAllCategoriesLink: inputLocationForm.querySelector("#location-edit-all-categories"),
  };
};

const cancelAddLocation = () => {
  sidenavContainer.style.display = "flex";
  inputLocationForm.innerHTML = "";
  inputLocationForm.style.display = "none";
  state.locationObj = new Location();
  state.selectedLocationCategories = { main: [], subcategories: [] };
  state.selectedOpeningHours = getDefaultOpeningHours();
  state.breadcrumbs = [
    { title: "Locations", goBack: true },
  ];
  breadcrumbsSelector.innerHTML = "";
  getPinnedLocation();
  triggerWidgetOnLocationsUpdate({ isCancel: true });
};

const renderBreadcrumbs = () => {
  breadcrumbsSelector.innerHTML = "";
  for (const breadcrumb of state.breadcrumbs) {
    const listItem = document.createElement('li');
    listItem.innerHTML = `<a>${breadcrumb.title}</a>`;
    listItem.onclick = () => {
      if (breadcrumb.goBack) {
        state.breadcrumbs.pop();
        breadcrumbsSelector.innerHTML = "";
        cancelAddLocation();
      }
    };
    breadcrumbsSelector.appendChild(listItem);
  }
};

const checkInputErrorOnChange = (element, errorElement) => {
  if (state.saveBtnClicked) {
    if (element.value != "") {
      errorElement.parentNode.classList.remove('has-error');
      errorElement.classList.add('hidden');
    } else {
      errorElement.classList.remove('hidden');
      errorElement.innerHTML = 'Required';
      errorElement.parentNode.classList.add('has-error');
    }
  }
}

window.addEditLocation = (location) => {
  const { settings } = globalState;
  renderAddLocationsPage();

  if (!location) {
    state.breadcrumbs.push({ title: "Add Location" });
    state.locationObj = new Location();
    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
  } else {
    state.breadcrumbs.push({ title: "Edit Location" });
    state.locationObj = new Location(location);
    addLocationControls.locationTitle.value = state.locationObj.title;
    addLocationControls.locationSubtitle.value = state.locationObj.subtitle;
    addLocationControls.locationAddress.value = state.locationObj.address;
    addLocationControls.locationCustomName.value = state.locationObj.addressAlias;
    addLocationControls.locationDescription.innerHTML = state.locationObj.description;
    addLocationControls.showCategoriesBtn.checked = state.locationObj.settings.showCategory;
    addLocationControls.showOpeningHoursBtn.checked = state.locationObj.settings.showOpeningHours;
    addLocationControls.showPriceRangeBtn.checked = state.locationObj.settings.showPriceRange;
    addLocationControls.showStarRatingBtn.checked = state.locationObj.settings.showStarRating;
    setIcon(state.locationObj.listImage, "url", addLocationControls.listImageBtn, { width: 120, height: 80 });
    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
  }
  renderBreadcrumbs();
  loadMap();
  renderSelectedCategoriesList(state.locationObj.categories);
  renderOpeningHours(state.locationObj.openingHours);
  onMarkerTypeChanged(state.locationObj.marker);
  onPriceRangeChanged(state.locationObj.price);

  locationImagesUI = new LocationImagesUI('location-image-items');
  actionItemsUI = new ActionItemsUI('location-action-items');
  tinymce.EditorManager.execCommand('mceRemoveEditor', true, 'location-description-wysiwyg');
  tinymce.init({
    selector: "#location-description-wysiwyg",
    setup: (ed) => {
      ed.on('keyup change', () => {
        state.locationObj.description = tinymce.activeEditor.getContent();
        state.locationObj.wysiwygSource = 'control';
        triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
        checkInputErrorOnChange(addLocationControls.locationDescription, addLocationControls.locationDescriptionError);
      });
    }
  });

  if (settings.globalEntries.allowOpenHours) {
    addLocationControls.openingHoursFormGroup.classList.remove('hidden');
  }

  if (settings.globalEntries.allowPriceRange) {
    addLocationControls.priceRangeFormGroup.classList.remove('hidden');
  }

  if (state.pinnedLocations.length >= 3 && state.locationObj.pinIndex === null) {
    addLocationControls.pinTopBtn.disabled = true;
  }

  let isPinned = false;
  let pinnedLocationsCount = state.pinnedLocations.length;
  if (state.locationObj.pinIndex !== null) {
    addLocationControls.pinTopBtn.innerHTML = 'Unpin';
    isPinned = true;
  }

  addLocationControls.pinnedLocationsLabel.innerHTML = `${pinnedLocationsCount} of 3 Pinned`;
  addLocationControls.pinTopBtn.onclick = () => {
    if (!isPinned) {
      addLocationControls.pinTopBtn.innerHTML = 'Unpin';
      pinnedLocationsCount += 1;
      state.locationObj.pinIndex = pinnedLocationsCount;
      isPinned = true;
    } else {
      addLocationControls.pinTopBtn.innerHTML = 'Pin to Top';
      pinnedLocationsCount -= 1;
      state.locationObj.pinIndex = null;
      isPinned = false;
    }
    addLocationControls.pinnedLocationsLabel.innerHTML = `${pinnedLocationsCount} of 3 Pinned`;
  };

  addLocationControls.navigateToIntroLink.onclick = () => {
    openConfirmationLeaveDialog((err, confirmed) => {
      if (confirmed) {
        saveLocation(location ? "Edit" : "Add", (done) => {
          if (done) {
            onSidenavChange('listView');
          }
        });
      }
    });
  };

  addLocationControls.editAllCategoriesLink.onclick = () => {
    openConfirmationLeaveDialog((err, confirmed) => {
      if (confirmed) {
        saveLocation(location ? "Edit" : "Add", (done) => {
          if (done) {
            onSidenavChange('categories');
          }
        });
      }
    });
  };

  addLocationControls.selectMarkerImageBtn.onclick = () => {
    buildfire.imageLib.showDialog(
      { showIcons: false, multiSelection: false }, (err, result) => {
        if (err) return console.error(err);
        if (!result) {
          return null;
        }
        const { selectedFiles, selectedStockImages } = result;
        let iconUrl = null;
        if (selectedFiles && selectedFiles.length > 0) {
          iconUrl = selectedFiles[0];
        } else if (selectedStockImages && selectedStockImages.length > 0) {
          iconUrl = selectedStockImages[0];
        }

        if (iconUrl) {
          setIcon(iconUrl, "url", addLocationControls.selectMarkerImageBtn);
          state.locationObj.marker.image = iconUrl;
          // state.locationObj.marker.color = null;
          triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
        }
      }
    );
  };

  addLocationControls.selectMarkerColorBtn.onclick = () => {
    buildfire.colorLib.showDialog(
      { colorType: "solid", solid: state.locationObj.marker.color },
      { hideGradient: true },
      null,
      (err, result) => {
        if (result.colorType === "solid") {
          state.locationObj.marker.color = result.solid;
          // state.locationObj.marker.icon = null;
          addLocationControls.selectMarkerColorBtn.querySelector(
            ".color"
          ).style.background = result.solid.color;
          triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
        } else {
          addLocationControls.selectMarkerColorBtn.querySelector(
            ".color"
          ).style.background = "none";
        }
      }
    );
  };

  addLocationControls.editCategoriesBtn.onclick = openSelectCategoriesDialog;
  addLocationControls.showCategoriesBtn.onchange = (e) => {
    state.locationObj.settings.showCategory = e.target.checked;
    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
  };

  addLocationControls.showOpeningHoursBtn.onchange = (e) => {
    state.locationObj.settings.showOpeningHours = e.target.checked;
    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
  };

  addLocationControls.showPriceRangeBtn.onchange = (e) => {
    state.locationObj.settings.showPriceRange = e.target.checked;
  };

  addLocationControls.showStarRatingBtn.onchange = (e) => {
    state.locationObj.settings.showStarRating = e.target.checked;
    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
  };

  addLocationControls.locationTitle.onkeydown = () => {
    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
  };
  addLocationControls.locationTitle.onchange = (e) => {
    checkInputErrorOnChange(addLocationControls.locationTitle, addLocationControls.locationTitleError);
  };
  addLocationControls.locationSubtitle.onkeydown = () => {
    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
  };

  addLocationControls.locationAddress.onchange = () => {
    const { address, coordinates } = state.locationObj;
    if (state.saveBtnClicked) {
      if (!address || !coordinates.lat || !coordinates.lng) {
        addLocationControls.locationTitleError.classList.remove('hidden');
        addLocationControls.locationTitleError.innerHTML = 'Required';
        addLocationControls.locationTitleError.parentNode.classList.add('has-error');
      } else {
        addLocationControls.locationTitleError.parentNode.classList.remove('has-error');
        addLocationControls.locationTitleError.classList.add('hidden');

      }
    }
  }


  addLocationControls.listImageBtn.onclick = () => {
    buildfire.imageLib.showDialog(
      { showIcons: false, multiSelection: false }, (err, result) => {
        if (err) return console.error(err);
        if (!result) {
          return null;
        }
        const { selectedFiles, selectedStockImages } = result;
        let iconUrl = null;
        if (selectedFiles && selectedFiles.length > 0) {
          iconUrl = selectedFiles[0];
        } else if (selectedStockImages && selectedStockImages.length > 0) {
          iconUrl = selectedStockImages[0];
        }

        if (iconUrl) {
          setIcon(iconUrl, "url", addLocationControls.listImageBtn, { width: 120, height: 80 });
          state.locationObj.listImage = iconUrl;
          if (state.saveBtnClicked) {
            addLocationControls.listImageError.parentNode.classList.remove('has-error');
            addLocationControls.listImageError.classList.add('hidden');
          }

        }
      }
    );
  };

  addLocationControls.addLocationImageBtn.onclick = () => {
    buildfire.imageLib.showDialog(
      { showIcons: false, multiSelection: true }, (err, result) => {
        if (err) return console.error(err);
        if (!result) {
          return null;
        }
        const { selectedFiles, selectedStockImages } = result;
        const locationImages = [];
        if (selectedFiles) {
          locationImages.push(...selectedFiles);
        } else if (selectedStockImages) {
          locationImages.push(...selectedStockImages);
        }
        state.locationObj.images.push(...locationImages.map((imageUrl) => ({ id: generateUUID(), imageUrl })));

        locationImagesUI.init(state.locationObj.images);
        triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
      }
    );
  };

  addLocationControls.addActionItemsBtn.onclick = () => {
    buildfire.actionItems.showDialog(null, {
      showIcon: true,
      imgLibOptions: {
        showIcons: true
      }
    }, (err, actionItem) => {
      if (err) return console.error(err);

      if (!actionItem) {
        return false;
      }
      actionItem.id = generateUUID();
      state.locationObj.actionItems.push(actionItem);
      actionItemsUI.addItem(actionItem);
      triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    });
  };

  locationImagesUI.onDeleteItem = (item, index, callback) => {
    buildfire.notifications.confirm(
      {
        title: "Delete Image",
        message: `Are you sure you want to delete this image?`,
        confirmButton: {
          text: "Delete",
          key: "y",
          type: "danger",
        },
        cancelButton: {
          text: "Cancel",
          key: "n",
          type: "default",
        },
      }, (e, data) => {
        if (e) console.error(e);
        if (data && data.selectedButton.key === "y") {
          state.locationObj.images = state.locationObj.images.filter((elem) => elem.id !== item.id);
          callback(item);
        }
      }
    );
  };

  locationImagesUI.onOrderChange = () => {
    state.locationObj.images = locationImagesUI.sortableList.items;
  };
  actionItemsUI.onDeleteItem = (item, index, callback) => {
    buildfire.notifications.confirm(
      {
        title: "Delete Action Item",
        message: `Are you sure you want to delete ${item.title} action?`,
        confirmButton: {
          text: "Delete",
          key: "y",
          type: "danger",
        },
        cancelButton: {
          text: "Cancel",
          key: "n",
          type: "default",
        },
      }, (e, data) => {
        if (e) console.error(e);
        if (data && data.selectedButton.key === "y") {
          state.locationObj.actionItems = state.locationObj.actionItems.filter((elem) => elem.id !== item.id);
          callback(item);
        }
      }
    );
  };

  actionItemsUI.onOrderChange = () => {
    state.locationObj.actionItems = actionItemsUI.sortableList.items;
  };

  actionItemsUI.onUpdateItem = (item, index, divRow) => {
    buildfire.actionItems.showDialog(item, {
      showIcon: true,
      imgLibOptions: {
        showIcons: true
      }
    }, (err, actionItem) => {
      if (err) return console.error(err);

      if (actionItem) {
        actionItem.id = item.id;
        state.locationObj.actionItems.forEach((action, index) => {
          if (action.id === item.id) {
            state.locationObj.actionItems[index] = actionItem;
          }
        });
        actionItemsUI.updateItem(actionItem, index, divRow);
        triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });

      }
    });
  };

  addLocationControls.saveBtn.onclick = (e) => {
    state.saveBtnClicked = true;
    saveLocation(location ? "Edit" : "Add");
  };

  addLocationControls.cancelBtn.onclick = cancelAddLocation;

  locationImagesUI.init(state.locationObj.images);
  actionItemsUI.init(state.locationObj.actionItems);
};

const saveLocation = (action, callback = () => { }) => {
  state.locationObj.title = addLocationControls.locationTitle.value;
  state.locationObj.subtitle = addLocationControls.locationSubtitle.value;
  state.locationObj.address = addLocationControls.locationAddress.value;
  state.locationObj.addressAlias = addLocationControls.locationCustomName.value;
  state.locationObj.description = tinymce.activeEditor.getContent();
  state.locationObj.openingHours = { ...state.locationObj.openingHours, ...state.selectedOpeningHours };
  if (!validateOpeningHoursDuplication(state.locationObj.openingHours)) {
    buildfire.dialog.alert(
      {
        title: "Location Save Error",
        message: "Opening hours are duplicated for the same day",
      },
      (err, actionButton) => { }
    );
    callback(false);
    return;
  };
  if (!locationInputValidation()) {
    callback(false);
    return;
  }
  addLocationControls.saveBtn.disabled = true;
  if (action === 'Add') {
    createLocation(state.locationObj).then(callback);
  } else {
    updateLocation(state.locationObj.id, state.locationObj).then(callback);
  }
};

const locationInputValidation = () => {
  const { title, address, description, coordinates, listImage, categories, openingHours, marker } = state.locationObj;
  let isValid = true;

  if (!title) {
    handleInputError(addLocationControls.locationTitleError, true);
    isValid = false;
  } else {
    handleInputError(addLocationControls.locationTitleError, false);
  }

  if (!address || !coordinates.lat || !coordinates.lng) {
    handleInputError(addLocationControls.locationAddressError, true);
    isValid = false;
  } else {
    handleInputError(addLocationControls.locationAddressError, false);
  }

  if (marker.type === 'image' && !marker.image) {
    handleInputError(addLocationControls.markerImageError, true);
    isValid = false;
  } else {
    handleInputError(addLocationControls.markerImageError, false);
  }

  if (marker.type === 'circle' && !marker.color) {
    handleInputError(addLocationControls.markerColorError, true);
    isValid = false;
  } else {
    handleInputError(addLocationControls.markerColorError, false);
  }

  // if (!coordinates.lat || !coordinates.lng) {
  //   handleInputError(addLocationControls.locationAddressError, true, 'Please select correct Address');
  //   isValid = false;
  // } else {
  //   handleInputError(addLocationControls.locationAddressError, false);
  // }

  // if (!categories || categories?.main?.length === 0) {
  //   handleInputError(addLocationControls.locationCategoriesError, true);
  //   isValid = false;
  // } else {
  //   handleInputError(addLocationControls.locationCategoriesError, false);
  // }

  if (!listImage) {
    handleInputError(addLocationControls.listImageError, true);
    isValid = false;
  } else {
    handleInputError(addLocationControls.listImageError, false);
  }

  if (!description) {
    handleInputError(addLocationControls.locationDescriptionError, true);
    isValid = false;
  } else {
    handleInputError(addLocationControls.locationDescriptionError, false);
  }

  if (!validateOpeningHours(openingHours)) {
    isValid = false;
  }

  const invalidInput = document.querySelector(".has-error");
  if (invalidInput) {
    invalidInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return isValid;
};

const validateOpeningHours = (openingHours) => {
  const { days } = openingHours;
  let isValid = true;
  for (const day in days) {
    if (days[day]) {
      isValid = days[day].intervals?.every((elem) => validateTimeInterval(elem.from, elem.to));
      if (!isValid) {
        return false;
      }
    }
  }
  return isValid;
};

const openRequiredCategoriesDialog = () => {
  buildfire.notifications.confirm(
    {
      title: "No Categories Added",
      message: `You need to create location categories before adding a location.`,
      confirmButton: {
        text: "Go to Categories",
        key: "y",
        type: "primary",
      },
      cancelButton: {
        text: "Cancel",
        key: "n",
        type: "default",
      },
    }, (e, data) => {
      if (e) console.error(e);
      if (data && data.selectedButton.key === "y") {
        cancelAddLocation();
        onSidenavChange('categories');
      }
    }
  );
};

const onMarkerTypeChanged = (marker) => {
  handleMarkerType(marker?.type);
  if (marker.image) {
    setIcon(marker.image, "url", addLocationControls.selectMarkerImageBtn);
  } else if (marker.color) {
    addLocationControls.selectMarkerColorBtn.querySelector(
      ".color"
    ).style.background = marker?.color?.color;
  }
  const radios = addLocationControls.markerTypeRadioBtns;
  for (const radio of radios) {
    if (radio.value === marker?.type) {
      radio.checked = true;
    }
    radio.onchange = (e) => {
      const { value } = e.target;
      state.locationObj.marker.type = value;
      state.locationObj.marker.color = state.defaultCircleMarkerColor;
      handleMarkerType(value);
      triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    };
  }

  function handleMarkerType(type) {
    if (type === 'image') {
      addLocationControls.selectMarkerImageContainer.classList.remove('hidden');
      addLocationControls.selectMarkerColorContainer.classList.add('hidden');
    } else if (type === 'circle') {
      addLocationControls.selectMarkerImageContainer.classList.add('hidden');
      addLocationControls.selectMarkerColorContainer.classList.remove('hidden');
    } else {
      addLocationControls.selectMarkerImageContainer.classList.add('hidden');
      addLocationControls.selectMarkerColorContainer.classList.add('hidden');
    }
  }
};

const onPriceRangeChanged = (price) => {
  if (price.currency) {
    addLocationControls.selectPriceCurrency.value = price.currency;
  }
  const radios = addLocationControls.priceRangeRadioBtns;
  for (const radio of radios) {
    if (Number(radio.value) === price?.range) {
      radio.checked = true;
    }
    radio.onchange = (e) => {
      const { value } = e.target;
      state.locationObj.price.range = Number(value);
    };
  }

  addLocationControls.selectPriceCurrency.onchange = (e) => {
    const { value } = e.target;
    state.locationObj.price.currency = value;
  };
};

const cropImage = (url, options) => {
  if (!url) {
    return "";
  }
  return buildfire.imageLib.cropImage(url, options);
};

const setIcon = (icon, type, selector, options = {}) => {
  if (!icon) {
    return;
  }

  let element = selector;
  if (typeof element === "string") {
    element = document.querySelector(element);
  } else if (!element || !(element instanceof Element) || !element.style) {
    console.warn(`invalid selector ${selector}.`);
  }

  const imageIcon = element.querySelector(".image-icon");
  const listIcon = element.querySelector(".custom-icon-list");
  const defaultIcon = element.querySelector(".add-icon");

  if (type === "url") {
    listIcon.classList.add("hidden");
    defaultIcon.classList.add("hidden");
    imageIcon.classList.remove("hidden");
    imageIcon.src = cropImage(icon, {
      width: options.width ? options.width : 40,
      height: options.height ? options.height : 40,
    });
  } else if (type === "font") {
    imageIcon.classList.add("hidden");
    defaultIcon.classList.add("hidden");
    listIcon.classList.remove("hidden");
    listIcon.className = `custom-icon-list ${icon}`;
  }
};

const openSelectCategoriesDialog = (action) => {
  const categoriesListContainer = document.createElement("div");
  categoriesListContainer.classList.add("select-categories-list");

  const searchBox = createTemplate('searchBoxTemplate');
  createDialogCategoriesList(state.categories, categoriesListContainer, state.locationObj.categories);

  const dialogContent = document.createElement("div");

  dialogContent.appendChild(searchBox);
  dialogContent.appendChild(categoriesListContainer);

  const searchInput = dialogContent.querySelector('.search-input');

  searchInput.onkeyup = (e) => {
    const searchValue = e.target.value;
    const data = state.categories.filter((elem) => elem.title.toLowerCase().includes(searchValue.toLowerCase()));
    createDialogCategoriesList(data, categoriesListContainer, state.locationObj.categories);
  };

  selectCategoryDialog = new DialogComponent("dialogComponent", dialogContent);

  selectCategoryDialog.showDialog(
    {
      title: `Select Categories`,
      saveText: "Save",
      hideDelete: false,
    },
    (e) => {
      e.preventDefault();
      state.locationObj.categories = { ...state.selectedLocationCategories };
      renderSelectedCategoriesList(state.locationObj.categories);
      triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
      selectCategoryDialog.close(e);
    }
  );
};

const createDialogCategoriesList = (categories, categoriesContainer, selected) => {
  categoriesContainer.innerHTML = "";
  state.selectedLocationCategories = { ...state.locationObj.categories };

  if (categories.length === 0) {
    categoriesContainer.appendChild(createEmptyHolder('No Categories Found'));
    return;
  }
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < categories.length; i++) {
    const _category = categories[i];
    const isCategorySelected = selected?.main.find((categoryId) => _category.id === categoryId);
    if (!isCategorySelected && _category.deletedOn) {
      continue;
    }
    const selectCategoryItem = createTemplate("selectCategoryItemTemplate");
    const categoryIcon = selectCategoryItem.querySelector(".category-icon");
    const categoryName = selectCategoryItem.querySelector(".category-name");
    const subcategoryCount = selectCategoryItem.querySelector(".subcategory-count");
    const enableCategoryBtn = selectCategoryItem.querySelector("#enable-category-toggle");
    const enableCategoryLabel = selectCategoryItem.querySelector("#enable-category-label");
    const subcategoriesContainer = selectCategoryItem.querySelector(".location-subcategories-container");
    subcategoriesContainer.innerHTML = "";

    selectCategoryItem.id = _category.id;

    const icon = _category.iconUrl
      ? _category.iconUrl
      : _category.iconClassName;
    const iconType = _category.iconUrl ? "url" : "font";

    setIcon(icon, iconType, categoryIcon);
    categoryName.innerHTML = _category.title;
    subcategoryCount.innerHTML = `${_category.subcategories.length} Subcategories`;
    enableCategoryBtn.id = `toggle_${_category.id}`;
    enableCategoryLabel.htmlFor = `toggle_${_category.id}`;

    if (isCategorySelected) {
      enableCategoryBtn.checked = true;
      subcategoriesContainer.style.display = "flex";
    } else {
      enableCategoryBtn.checked = false;
      subcategoriesContainer.style.display = "none";
    }

    enableCategoryBtn.onclick = (e) => {
      if (e.target.checked) {
        const isAdded = state.selectedLocationCategories.main.find((categoryId) => categoryId === _category.id);
        if (!isAdded) {
          state.selectedLocationCategories.main.push(_category.id);
        }

        if (_category.subcategories.length > 0) {
          subcategoriesContainer.style.display = "flex";
        }
      } else {
        state.selectedLocationCategories.main = state.selectedLocationCategories.main.filter((categoryId) => categoryId !== _category.id);
        state.selectedLocationCategories.subcategories = state.selectedLocationCategories.subcategories.filter(
          (subcategoryId) => !_category.subcategories.find((elem) => elem.id === subcategoryId)
        );
        subcategoriesContainer.style.display = "none";
      }
    };

    // eslint-disable-next-line no-restricted-syntax
    for (const subcategory of _category.subcategories) {
      const checkboxDiv = creatCheckboxElem();
      checkboxDiv.className = 'col-md-5 margin-top-ten checkbox checkbox-primary';
      const checkboxInput = checkboxDiv.querySelector('.checkbox-input');
      const checkboxLabel = checkboxDiv.querySelector('.checkbox-label');

      checkboxInput.id = subcategory.id;
      checkboxLabel.htmlFor = subcategory.id;
      checkboxLabel.innerHTML = subcategory.title;
      const isSubcategorySelected = selected?.subcategories.find((subcategoryId) => subcategory.id === subcategoryId);

      checkboxInput.checked = !!isSubcategorySelected;

      checkboxInput.onchange = (e) => {
        if (e.target.checked) {
          const isAdded = state.selectedLocationCategories.subcategories.find((subcategoryId) => subcategoryId === subcategory.id);
          if (!isAdded) {
            state.selectedLocationCategories.subcategories.push(subcategory.id);
          }
        } else {
          state.selectedLocationCategories.subcategories = state.selectedLocationCategories.subcategories.filter((subcategoryId) => subcategoryId !== subcategory.id);
        }
      };

      subcategoriesContainer.appendChild(checkboxDiv);
    }

    categoriesContainer.appendChild(selectCategoryItem);
  }
};

const renderSelectedCategoriesList = (locationCategories) => {
  addLocationControls.categoriesList.innerHTML = "";

  if (locationCategories?.main?.length === 0) {
    addLocationControls.categoriesCount.innerHTML = "";
    addLocationControls.categoriesList.innerHTML = `<div class="text-center"><h5>No Categories Selected.</h5></div>`;
    return;
  }

  addLocationControls.categoriesCount.innerHTML = `${locationCategories?.main.length} Categories, ${locationCategories?.subcategories.length} Subcategories`;

  for (const categoryId of locationCategories?.main) {
    const category = state.categoriesLookup[categoryId];
    if (!category) return console.warn(`location's category with ID: ${categoryId} is not found`);

    const subcategories = category.subcategories.filter(elem => locationCategories?.subcategories.includes(elem.id));

    const categoryListItem = document.createElement('div');
    categoryListItem.className = 'item-list';
    const itemContent = `
    <div class="item-list">
       <h5 class="text-bold">${category.title}</h5>
       <span class="text-muted">${subcategories.map((elem) => elem.title).join(', ')}</span>
     </div>
    `;
    categoryListItem.innerHTML = itemContent;

    addLocationControls.categoriesList.appendChild(categoryListItem);
  }
};

const openConfirmationLeaveDialog = (callback) => {
  buildfire.notifications.confirm(
    {
      title: 'Warning',
      message: `You are about to leave this page. your progress will be saved`,
      confirmButton: {
        text: "OK",
        key: "y",
        type: "primary",
      },
      cancelButton: {
        text: "Cancel",
        key: "n",
        type: "default",
      },
    }, (e, data) => {
      if (e) console.error(e);
      if (data && data.selectedButton.key === "y") {
        callback(null, true);
      } else {
        callback(null, false);
      }
    }
  );
};

const renderOpeningHours = (openingHours) => {
  state.selectedOpeningHours.days = { ...state.selectedOpeningHours.days, ...openingHours.days };
  const { days } = state.selectedOpeningHours;
  for (const day in days) {
    if (days[day]) {
      const openingHoursDayItem = createTemplate("openingHoursDayItemTemplate");
      const enableDayInput = openingHoursDayItem.querySelector(".enable-day-input");
      const enableDayLabel = openingHoursDayItem.querySelector(".enable-day-label");
      const dayIntervals = openingHoursDayItem.querySelector(".day-intervals");
      const addHoursBtn = openingHoursDayItem.querySelector(".add-hours-btn");
      openingHoursDayItem.id = day;
      enableDayInput.id = `enable-${day}-checkbox`;
      enableDayLabel.htmlFor = `enable-${day}-checkbox`;
      enableDayLabel.innerHTML = state.weekDays[day];

      enableDayInput.checked = !!days[day]?.active;
      enableDayInput.onchange = (e) => {
        days[day].active = e.target.checked;
        //  triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
      };
      addHoursBtn.onclick = (e) => {
        days[day].intervals?.push({ from: convertTimeToDate("08:00"), to: convertTimeToDate("20:00") });
        renderDayIntervals(days[day], dayIntervals);
        // triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
      };
      renderDayIntervals(days[day], dayIntervals);

      addLocationControls.openingHoursContainer.appendChild(openingHoursDayItem);
    }
  }
};

const renderDayIntervals = (day, dayIntervalsContainer) => {
  dayIntervalsContainer.innerHTML = "";
  day.intervals?.forEach((interval, intervalIndex) => {
    const template = document.getElementById('dayIntervalTemplate').content.firstChild;
    const dayInterval = template.cloneNode(true);

    const fromInput = dayInterval.querySelector(".from");
    const toInput = dayInterval.querySelector(".to");
    const intervalError = dayInterval.querySelector(".interval-error");
    const deleteBtn = dayInterval.querySelector(".delete-interval-btn");

    const dayIntervalId = generateUUID();
    dayInterval.id = dayIntervalId;
    fromInput.value = convertDateToTime(interval.from);
    toInput.value = convertDateToTime(interval.to);
    validateTimeInterval(interval.from, interval.to, intervalError);

    if (intervalIndex === 0) {
      deleteBtn.classList.add('hidden');
    } else {
      deleteBtn.classList.remove('hidden');
    }

    fromInput.onchange = (e) => {
      const start = convertTimeToDate(e.target.value);
      interval.from = start;
      if (!validateTimeInterval(start, interval.to, intervalError)) {
        return;
      }
      //  triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    };
    toInput.onchange = (e) => {
      const end = convertTimeToDate(e.target.value);
      interval.to = end;
      if (!validateTimeInterval(interval.from, end, intervalError)) {
        return;
      }
      // triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    };
    deleteBtn.onclick = (e) => {
      day.intervals = day.intervals.filter((elem, index) => index !== intervalIndex);
      dayInterval.remove();
      // triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    };

    dayIntervalsContainer.appendChild(dayInterval);
  });
};

const validateTimeInterval = (start, end, errorElem) => {
  start = new Date(start).getTime();
  end = new Date(end).getTime();
  let isValid = true;
  if (start > end) {
    isValid = false;
  }
  if (errorElem) {
    handleInputError(errorElem, !isValid, 'Choose an end time later than the start time');
  }
  return isValid;
};

const creatCheckboxElem = () => {
  const div = document.createElement("div");
  div.innerHTML = `<input type="checkbox" class="checkbox-input"/>
  <label for="checkbox1" class="checkbox-label "></label>`;

  return div;
};

const createEmptyHolder = (message) => {
  const div = document.createElement("div");
  div.className = 'empty-state margin-top-fifteen';
  div.innerHTML = `<hr class="none"><h4>${message ? message : 'No Data'}.</h4>`;
  return div;
};

window.intiMap = () => {
  console.log("Map Ready");
  const options = {
    center: { lat: 32.7182625, lng: -117.1601157 },
    zoom: 1,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
  };
  if (isCameraControlVersion()) {
    options.cameraControl = true;
  } else {
    options.zoomControl = true;
  }
  const map = new google.maps.Map(document.getElementById("location-map"), options);
  state.map = map;

  const autocomplete = new google.maps.places.SearchBox(
    addLocationControls.locationAddress,
    {
      types: ["address"],
    }
  );

  const geoCoder = new google.maps.Geocoder();

  autocomplete.bindTo("bounds", map);

  const marker = new google.maps.Marker({
    map,
    anchorPoint: new google.maps.Point(0, -29),
    draggable: true,
  });

  const currentPosition = { lat: state.locationObj.coordinates.lat, lng: state.locationObj.coordinates.lng }
  if (currentPosition.lat && currentPosition.lng) {
    const latlng = new google.maps.LatLng(currentPosition.lat, currentPosition.lng);
    marker.setVisible(true);
    marker.setPosition(latlng);
    map.setCenter(latlng);
    map.setZoom(15);
  }

  autocomplete.addListener("places_changed", () => {
    marker.setVisible(false);
    const places = autocomplete.getPlaces();
    const place = places[0];

    if (!place || !place.geometry || !place.geometry) {
      return;
    }

    if (place.geometry.viewport) {
      map.fitBounds(place.geometry.viewport);
    } else {
      map.setCenter(place.geometry.location);
      map.setZoom(17);
    }

    marker.setPosition(place.geometry.location);
    marker.setVisible(true);

    state.locationObj.coordinates.lat = place.geometry.location.lat();
    state.locationObj.coordinates.lng = place.geometry.location.lng();
    state.locationObj.formattedAddress = place.formatted_address;

    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    console.log(place);
  });

  marker.addListener("dragend", (e) => {
    map.setCenter(e.latLng);
    geoCoder.geocode(
      { location: { lat: e.latLng.lat(), lng: e.latLng.lng() } },
      (results, status) => {
        console.log(results);
        if (status === "OK") {
          if (results[0]) {
            state.locationObj.formattedAddress = results[0].formatted_address;
            state.locationObj.coordinates.lat = e.latLng.lat();
            state.locationObj.coordinates.lng = e.latLng.lng();
            addLocationControls.locationAddress.value = results[0].formatted_address;
            triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
          } else {
            console.log("No results found");
          }
        } else {
          console.log("Geocoder failed due to: " + status);
        }
      }
    );
  });
};

const loadMap = () => {
  buildfire.getContext((error, context) => {
    function setGoogleMapsScript(key) {
      const docHead = document.getElementsByTagName("head");
      const mapScript = document.getElementById("googleScript");
      const scriptEl = document.createElement("script");
      scriptEl.id = "googleScript";
      scriptEl.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=intiMap&libraries=places&v=weekly`;
      if (mapScript) {
        document.head.removeChild(mapScript);
      }
      docHead[0].appendChild(scriptEl);
    }

    setGoogleMapsScript(context.apiKeys.googleMapKey);
  });
};

const deleteLocation = (item, row, callback = () => { }) => {
  buildfire.notifications.confirm(
    {
      title: "Delete Location",
      message: `Are you sure you want to delete ${item.title} location?`,
      confirmButton: {
        text: "Delete",
        key: "y",
        type: "danger",
      },
      cancelButton: {
        text: "Cancel",
        key: "n",
        type: "default",
      },
    }, (e, data) => {
      if (e) console.error(e);
      if (data && data.selectedButton.key === "y") {
        LocationsController.deleteLocation(item.id).then(() => {
          state.locations = state.locations.filter((elem) => elem.id !== item.id);
          handleLocationEmptyState(false);
          triggerWidgetOnLocationsUpdate({});
          callback(item);
        });
      }
    }
  );
};

export const locationsAiSeeder = {
  instance: null,
  jsonTemplate: [{
    title: '',
    subtitle: '',
    address: '',
    listImage: '',
    description: '',
    latitude: '',
    longitude: '',
  }],
  init() {
    this.instance = new buildfire.components.aiStateSeeder({
      generateOptions: {
        userMessage: 'List a sample [business-type] locations in [target-region].',
        systemMessage: `Location\\'s listImage is an image URLUse https://app.buildfire.com/api/stockImages/?topic={title}&imageType=small, transform title in topic as a kebab case, title is a real-world name, description is a brief description.`,
        jsonTemplate: this.jsonTemplate,
        callback: this._handleGenerate.bind(this)
      },
      importOptions: {
        jsonTemplate: this.jsonTemplate,
        sampleCSV: 'Disneyland, The Happiest Place on Earth, 1313 Disneyland Dr, Anaheim, CA 92802, 33.8090, -117.9190, https://app.buildfire.com/api/stockImages/?topic=disneyland, Disneyland Resort is a famous theme park and resort complex in Anaheim, California, operated by The Walt Disney Company.\n'
          + 'Times Square, The Crossroads of the World, Manhattan, New York, NY 10036, 40.7580, -73.9855, https://app.buildfire.com/api/stockImages/?topic=times-square, Times Square is a major commercial and entertainment hub in Midtown Manhattan, New York City.',
        systemMessage: `listImage is a URL, latitude is a coordinate, longitude is a coordinate, subtitle can be empty string, address is a location address`,
        callback: this._handleImport.bind(this),
      }
    })
      .smartShowEmptyState();
  },
  _updateCoords(item) {
    const { settings } = globalState;
    settings.map.initialAreaCoordinates = item.coordinates;
    settings.map.initialAreaDisplayAddress = item.formattedAddress || 'N/A';
    return LocationsController.saveSettings(settings)
      .then(triggerWidgetOnSettingsUpdate);
  },
  deleteAll() {
    const promises = state.locations.map((item) => LocationsController.deleteLocation(item.id));
    return Promise.all(promises);
  },
  _insertData(data) {
    return LocationsController.bulkCreateLocation(data).then((result) => {
      triggerWidgetOnLocationsUpdate({});
      if (locationsTable) refreshLocations();
    }).catch((err) => {
      console.error(err);
    });
  },
  _applyDefaults(list) {
    return list.filter((i) => typeof i && i.title !== 'undefined')
      .map((item) => {
        item.subtitle = item.subtitle || item.title;
        item.description = item.description || 'N/A';
        item.address = item.address || 'California, San Diego';
        item.listImage = item.listImage || 'https://placehold.co/300x300';
        item.clientId = generateUUID();
        item.formattedAddress = item.address;
        item.coordinates = item.latitude && item.longitude && this._isValidCoordinates({ lat: Number(item.latitude), lng: Number(item.longitude) }) ? { lat: Number(item.latitude), lng: Number(item.longitude) } : constants.getDefaultLocation();
        item.createdOn = new Date();
        item.createdBy = authManager.sanitizedCurrentUser;
        return new Location(item).toJSON();
      });
  },
  _handleGenerate(err, data) {
    if (err || !data || typeof data !== 'object' || !Object.keys(data).length) {
      return buildfire.dialog.toast({
        message: "Bad AI request, please try changing your request.",
        type: "danger",
      });
    }

    let list = Object.values(data)[0];
    if (!Array.isArray(list)) {
      return;
    }
    list = this._applyDefaults(list);
    list = list.map((item) => {
      item.listImage = `${item.listImage}?v=${this._generateRandomNumber()}`;
      return item;
    });

    if (!list.length) {
      return buildfire.dialog.toast({
        message: "Bad AI request, please try changing your request.",
        type: "danger",
      });
    }

    const promises = [this.deleteAll().then(() => this._insertData(list))];

    if (this.instance.actionSource === 'emptyState') {
      const firstItemHasValidCoords = list.find((item) => this._isValidCoordinates(item.coordinates));
      if (firstItemHasValidCoords) {
        promises.push(this._updateCoords(firstItemHasValidCoords));
      }
    }

    Promise.all(promises).then(this.instance.requestResult.complete);
  },
  _handleImport(err, data) {
    if (err || !data || typeof data !== 'object' || !Object.keys(data).length) {
      return buildfire.dialog.toast({
        message: "Bad AI request, please try changing your request.",
        type: "danger",
      });
    }

    let list = Object.values(data)[0];
    if (!Array.isArray(list)) {
      return;
    }

    list = this._applyDefaults(list);

    if (!list.length) {
      return buildfire.dialog.toast({
        message: "Bad AI request, please try changing your request.",
        type: "danger",
      });
    }

    const promises = [];

    if (this.instance.requestResult.resetData) {
      promises.push(this.deleteAll().then(() => this._insertData(list)));
    } else {
      promises.push(this._insertData(list));
    }

    if (this.instance.actionSource === 'emptyState') {
      const firstItemHasValidCoords = list.find((item) => this._isValidCoordinates(item.coordinates));
      if (firstItemHasValidCoords) {
        promises.push(this._updateCoords(firstItemHasValidCoords));
      }
    }

    Promise.all(promises).then(this.instance.requestResult.complete);
  },
  _generateRandomNumber() {
    const min = 1000000000000; // Smallest 13-digit number
    const max = 9999999999999; // Largest 13-digit number
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
  _isValidCoordinates({ lat, lng }) {
    const isValidLatitude = typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
    const isValidLongitude = typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180;
    return isValidLatitude && isValidLongitude;
  },

};

const handleLocationEmptyState = (isLoading) => {
  const emptyState = locationsSection.querySelector('#location-empty-list');

  if (!emptyState) return;

  if (isLoading) {
    emptyState.innerHTML = `<h4> Loading... </h4>`;
    emptyState.classList.remove('hidden');
  } else if (state.locations.length === 0) {
    emptyState.classList.remove('hidden');
    emptyState.innerHTML = `<h4>No Locations Found</h4>`;
  } else {
    emptyState.classList.add('hidden');
  }
};

let timeoutId;
window.searchLocations = (e) => {
  const searchValue = e.target.value;
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    if (searchValue) {
      state.filter["_buildfire.index.text"] = { $regex: searchValue, $options: "i" };
    } else {
      delete state.filter["_buildfire.index.text"];
    }
    locationsTable.clearData();
    handleLocationEmptyState(true);
    refreshLocations();
  }, 300);
};

window.openLocationsBulkAction = (e) => {
  e.stopPropagation();
  const locationDropdown = locationsSection.querySelector('#location-bulk-dropdown');
  toggleDropdown(locationDropdown);
  document.body.onclick = () => {
    toggleDropdown(locationDropdown, true);
  };
};

const downloadCsvTemplate = (templateData, header, name) => {
  const csv = jsonToCsv(templateData, {
    header, locationInfoRowHeader
  });

  downloadCsv(csv, `${name ? name : 'template'}.csv`);
};

window.downloadLocationTemplate = () => {
  const templateData = [{}];
  downloadCsvTemplate(templateData, locationTemplateHeader);
};

const validateLocationCsv = (items) => {
  if (!Array.isArray(items) || !items.length) {
    showImportErrorMessage({
      message: "Please make sure of uploading correct CSV file.",
    });
    return false;
  }
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.id != null && item.id != '[!Reserved-Field!]') {
      if (!item.title || !item.address || !item.description) {
        showImportErrorMessage({
          message: `This file has missing title, address or description in row number [${i + 1}], please fix it and upload it again.`,
        });
        return false;
      }

      if (!isLatitude(item.lat) || !isLongitude(item.lng)) {
        showImportErrorMessage({
          message: `This file has wrong latitude or longitude in row number [${i + 1}], please fix it and upload it again.`,
        });
        return false;
      }
    }
  }

  return true;
  // return items.every((item, index, array) =>  item.title && item.address &&  item.lat && item.lng && item.description);
};

window.importLocations = () => {
  const fileInput = locationsSection.querySelector("#location-file-input");
  fileInput.click();
  fileInput.onchange = function (e) {
    readCSVFile(this.files[0], (err, result) => {
      if (!validateLocationCsv(result)) {
        return;
      }
      const dialogRef = showProgressDialog({
        title: 'Importing Locations',
        message: 'We’re importing your locations, please wait.'
      });
      insertData(result, (err, result) => {
        if (err) console.error(err);
        fileInput.value = '';
        dialogRef.close();
      })
    });
  };
};

const insertData = (jsonResult, callback, fileInput, dialogRef) => {
  CategoriesController.getAllCategories((allCategories1) => {
    for (const category of allCategories1) {
      state.categoriesLookup[category.id] = category;
    }
    state.categories = allCategories1;
    globalState.categories = allCategories1;
    upsertCategories(jsonResult, allCategories1).then((newCategories) => {
      if (newCategories.length == 0) {
        insertLocations(jsonResult, () => {
          callback(null, true);
        })
      } else {
        CategoriesController._bulkCreateCategories(newCategories).then((res) => {
          CategoriesController.registerCategoryAnalytics(res.data.length);
          CategoriesController.getAllCategories((allCategories2) => {
            for (const category of allCategories2) {
              state.categoriesLookup[category.id] = category;
            }
            state.categories = allCategories2;
            globalState.categories = allCategories2;
            insertLocations(jsonResult, () => {
              callback(null, true);
            })
          })
        }).catch((err) => {
          callback(err, false);
        });
      }
    })
  })
}

const upsertCategories = (result, allCategories) => {
  return new Promise((resolve, reject) => {
    var categories = []
    var newCategories = [];
    result.forEach(elem => {
      if (elem.categories) {
        var newSubCategories = [];
        var _categories = elem.categories.split(",").filter(Boolean)
        _categories.forEach(categoryAndSub => {

          var categoryAndSub = categoryAndSub.split("->")
          var selectedCategoryTitle = categoryAndSub[0].trim()
          var selectedSubCategories = categoryAndSub[1]?.split(",")
          var savedCategory = allCategories.find(x => x.title == selectedCategoryTitle && x.deletedBy == null)

          if (!savedCategory) { // Check if category not found in collection
            var isNewCategorySaved = newCategories.find(x => x == selectedCategoryTitle)

            if (!isNewCategorySaved) { // Check if category already added
              newCategories.push(selectedCategoryTitle)

              var categoryToBeSaved = {
                title: selectedCategoryTitle,
                iconUrl: "",
                iconClassName: "",
                subcategories: selectedSubCategories ? selectedSubCategories.map((subTitle) => ({ id: generateUUID(), title: subTitle?.trim() })) : [],
                createdOn: new Date(),
                createdBy: authManager.sanitizedCurrentUser
              }
              categories.push(new Category(categoryToBeSaved).toJSON())
            } else if (selectedSubCategories) {
              let selectedCategory = categories.find(x => x.title == selectedCategoryTitle)
              var isSubCategoryAdded = selectedCategory.subcategories.find(x => x.title == selectedSubCategories[0].trim())
              if (!isSubCategoryAdded) {
                selectedCategory.subcategories.push({ id: generateUUID(), title: selectedSubCategories[0].trim() })
              }
            }

          } else if (selectedSubCategories && selectedSubCategories.length > 0) { // Check if Subcategories found in old category
            var savedSubCategories = savedCategory.subcategories.map(x => x.title);
            var nonSavedSubCategories = selectedSubCategories.filter((elem) => !(savedSubCategories?.includes(elem.trim())))
            if (nonSavedSubCategories.length > 0) { // Check if there is new subcategory & update category
              nonSavedSubCategories.forEach(subCategory => {
                var isNewSubCategorySaved = newSubCategories.find(x => x == subCategory)
                if (isNewSubCategorySaved == null) { // Check if subcategory already added
                  newSubCategories.push(subCategory)
                  savedCategory.subcategories.push({ id: generateUUID(), title: subCategory?.trim() })
                }
              });
              CategoriesController.updateCategory(savedCategory.id, new Category(savedCategory)).then(() => { })
            }

          }
        });
      }
    })
    resolve(categories)
  });

}

const insertLocations = (result, callback) => {
  const locations = result.map((elem) => {
    delete elem.id;
    elem.title = elem.title?.trim();
    elem.subtitle = elem.subtitle?.trim();
    elem.address = elem.address?.trim();
    elem.formattedAddress = elem.formattedAddress?.trim();
    elem.addressAlias = elem.addressAlias?.trim();
    elem.listImage = elem.listImage?.trim();
    elem.description = elem.description?.trim();
    elem.images = elem.images?.split(',').filter((elem) => elem).map((imageUrl) => ({ id: generateUUID(), imageUrl: imageUrl.trim() }));
    elem.marker = { type: elem.markerType?.toLowerCase() || 'pin', color: { color: elem.markerColorRGBA } || null, image: elem.markerImage || null };
    elem.settings = {
      showCategory: elem.showCategory || true,
      showOpeningHours: elem.showOpeningHours || false,
      showPriceRange: elem.showPriceRange || false,
      showStarRating: elem.showStarRating || false,
    };
    elem.coordinates = { lat: Number(elem.lat), lng: Number(elem.lng) };
    elem.price = { range: elem.priceRange || 0, currency: elem.priceCurrency || '$' };
    var elemCategories = elem.categories?.split(",").filter(e => e)
    let categories = [];
    let subCategories = [];
    if (elemCategories) {
      elemCategories.forEach(categoryAndSub => {
        var _categoryAndSub = categoryAndSub.split("->")
        var selectedCategoryTitle = _categoryAndSub[0].trim();
        var selectedSubCategories = _categoryAndSub[1]?.trim();
        var savedCategory = state.categories?.find(x => x.title == selectedCategoryTitle)
        if (savedCategory) {
          var isCategoryAdded = categories.find(x => x == savedCategory.id)
          if (!isCategoryAdded) {
            categories.push(savedCategory.id)

          }
          if (selectedSubCategories) {
            var selectedSubCategory = savedCategory.subcategories.find(x => x.title == selectedSubCategories)
            if (selectedSubCategory) {
              subCategories.push(selectedSubCategory.id)
            }
          }
        }
      })
    }
    elem.categories = { main: categories, subcategories: subCategories };
    elem.openingHours = { ...getDefaultOpeningHours(), timezone: null };
    elem.createdOn = new Date();
    elem.createdBy = authManager.sanitizedCurrentUser;
    // add location actionItems
    let actionItems = [];
    if (elem.phoneNumber) {
      actionItems.push({
        "title": "Phone",
        "action": "callNumber",
        "iconClassName": "bf-icon bf-icon-phone",
        "phoneNumber": elem.phoneNumber,
        "id": generateUUID()
      });
    }
    if (elem.website) {
      if (!elem.website.startsWith('https://') && !elem.website.startsWith('http://')) {
        elem.website = 'http://' + elem.website;
      }
      actionItems.push({
        "title": "Website",
        "action": "linkToWeb",
        "iconClassName": "bf-icon bf-icon-globe",
        "openIn": "_blank",
        "url": elem.website,
        "id": generateUUID()
      });
    }
    if (actionItems.length > 0) {
      elem.actionItems = actionItems
    }

    return new Location(elem).toJSON();
  });
  LocationsController.bulkCreateLocation(locations).then((result) => {
    buildfire.dialog.toast({
      message: "Successfully imported locations",
      type: "success",
    });
    refreshLocations();
    triggerWidgetOnLocationsUpdate({});
    callback(null, true)
  }).catch((err) => {
    callback(err, null)
    console.error(err);
  });
}
window.exportLocations = () => {
  const dialogRef = showProgressDialog({
    title: 'Exporting Locations',
    message: 'We’re exporting your locations, please wait.'
  });

  let searchOptions = {
    limit: 50,
    skip: 0,
    recordCount: true
  }, records = [];

  const processLocations = () => {
    const data = records.map(elem => {
      elem = elem;
      elem.lat = elem.coordinates?.lat;
      elem.lng = elem.coordinates?.lng;
      elem.settings = elem.settings;
      elem.markerType = elem.marker.type;
      elem.markerImage = elem.marker.image;
      elem.markerColorRGBA = elem.marker.color?.color;
      elem.priceRange = elem.price.range;
      elem.priceCurrency = elem.price.currency;
      // action item / phone number and website
      elem.phoneNumber = "";
      elem.website = "";
      let categories = [];
      elem.categories.main.forEach(catId => {
        var category = state.categoriesLookup[catId]
        if (category.subcategories && category.subcategories.length > 0 && elem.categories.subcategories.length > 0) {
          var subcategories = category.subcategories.filter(x => elem.categories.subcategories.includes(x.id))
          if (subcategories && subcategories.length > 0) {
            subcategories.forEach(e => {
              categories.push({
                title: category.title + " -> " + e.title
              })
            })
          } else {
            categories.push({ title: category.title })
          }
        } else {
          categories.push({ title: category.title })
        }
      });
      elem.categories = categories

      return elem;
    });
    downloadCsvTemplate(data, locationTemplateHeader, 'locations');
    dialogRef.close();
  }

  const getLocations = () => {
    Locations.search(searchOptions).then(response => {
      if (response.result.length < searchOptions.limit) {
        records = records.concat(response.result);
        processLocations();
      } else {
        searchOptions.skip = searchOptions.skip + searchOptions.limit;
        records = records.concat(response.result);
        return getLocations();
      }
    }).catch(err => console.error(err));
  }
  getLocations();
};

const showImportErrorMessage = ({ message }) => {
  buildfire.dialog.alert(
    {
      title: "Couldn't import locations",
      message,
    },
    (err, actionButton) => { }
  );
};

const loadLocations = () => {
  const options = {};

  if (state.filter) {
    options.filter = state.filter;
  }

  if (state.sort) {
    options.sort = state.sort;
  } else {
    options.sort = { "_buildfire.index.text": -1 };
  }

  options.page = state.pageIndex;
  options.pageSize = state.pageSize;

  LocationsController.searchLocations(options).then(({ result, totalRecord }) => {
    state.locations = state.locations.concat(result || []);
    state.totalRecord = totalRecord || 0;
    handleLocationEmptyState(false);
    locationsTable.renderData(state.locations, state.categories);
    state.fetchingNextPage = false;
    state.fetchingEndReached = state.locations.length >= totalRecord;
  });
};

const loadMoreLocations = () => {
  if (state.fetchingNextPage || state.fetchingEndReached) return;
  state.fetchingNextPage = true;
  state.pageIndex += 1;
  loadLocations();
};

const refreshLocations = () => {
  state.locations = [];
  state.fetchingNextPage = false;
  state.fetchingEndReached = false;
  state.pageIndex = 0;
  loadLocations();
};

const getPinnedLocation = () => {
  LocationsController.getPinnedLocation().then(({ result, totalRecord }) => {
    state.pinnedLocations = result || [];
  });
};
const loadCategories = (callback) => {
  CategoriesController.getAllCategories((allCategories) => {
    for (const category of allCategories) {
      state.categoriesLookup[category.id] = category;
    }
    state.categories = allCategories;
    globalState.categories = allCategories;
    callback(null, allCategories);
  });
};

const copyLocationDeepling = (location, tr) => {
  DeepLink.generateDeeplinkUrl(location).then((result) => {
    const copyElement = document.createElement("textarea");
    copyElement.style.position = 'fixed';
    copyElement.style.opacity = '0';
    copyElement.textContent = result.url;
    const body = document.getElementsByTagName('body')[0];
    body.appendChild(copyElement);
    copyElement.select();
    document.execCommand('copy');
    body.removeChild(copyElement);
    const tooltip = document.getElementById(`tooltip-content-${location.id}`);
    tooltip.innerHTML = 'Copied!';
  });
};

const onCopyMouseOut = (location, tr) => {
  const tooltip = document.getElementById(`tooltip-content-${location.id}`);
  tooltip.innerHTML = 'Copy Deeplink';
};

const showAnalyticsReport = (obj) => {
  buildfire.analytics.showReports({ eventKey: `locations_${obj.id}_viewed` });
};

const showNotificationForm = (obj) => {
  if (!obj.subscribers || !obj.subscribers.length) {
    return buildfire.dialog.toast({ message: "This location has no subscribers to notify.", type: 'danger' });
  }

  notificationDialog = new DialogComponent(
    "dialogComponent",
    "sendNotificationTemplate"
  );

  const notificationTitleInput = notificationDialog.container.querySelector('#notification-title-input');
  const notificationMessageInput = notificationDialog.container.querySelector('#notification-message-input');
  const notificationTitleError = notificationDialog.container.querySelector('#notification-title-input-error');
  const notificationMessageError = notificationDialog.container.querySelector('#notification-message-input-error');
  const sendBtn = notificationDialog.container.querySelector('.dialog-save-btn');
  const closeIcon = notificationDialog.container.querySelector('.close-modal');
  const cancelBtn = notificationDialog.container.querySelector('.dialog-cancel-btn');

  notificationDialog.showDialog(
    {
      title: `Notify Users of Location Update`,
      saveText: "Send",
      hideDelete: false,
    }, (e) => {
      e.preventDefault();

      const title = notificationTitleInput.value;
      const message = notificationMessageInput.value;

      if (!title) {
        notificationTitleInput.classList.add('border-danger');
        notificationTitleError.classList.remove('hidden');
      } else if (!message) {
        notificationMessageInput.classList.add('border-danger');
        notificationMessageError.classList.remove('hidden');
      } else {
        sendBtn.classList.add('disabled');
        closeIcon.classList.add('disabled');
        cancelBtn.classList.add('disabled');

        buildfire.notifications.pushNotification.schedule({
          title,
          text: message,
          users: obj.subscribers,
          queryString: `&dld=${encodeURIComponent(JSON.stringify({ locationId: obj.id }))}`,
        }, (err, result) => {
          sendBtn.classList.remove('disabled');
          closeIcon.classList.remove('disabled');
          cancelBtn.classList.remove('disabled');

          notificationDialog.close();
          if (err) return buildfire.dialog.toast({ message: "Failed to send notification. Please try again later.", type: 'danger' });
          return buildfire.dialog.toast({ message: "Notification sent successfully.", type: 'success' });
        });
      }
    });
};

const updateLocationImage = (obj, tr) => {
  buildfire.imageLib.showDialog(
    { showIcons: false, multiSelection: false }, (err, result) => {
      if (err) return console.error(err);
      if (!result) {
        return null;
      }
      const { selectedFiles, selectedStockImages } = result;
      let iconUrl = null;
      if (selectedFiles && selectedFiles.length > 0) {
        iconUrl = selectedFiles[0];
      } else if (selectedStockImages && selectedStockImages.length > 0) {
        iconUrl = selectedStockImages[0];
      }

      const location = state.locations.find((elem) => elem.id === obj.id);
      if (iconUrl && location) {
        location.listImage = iconUrl;
        locationsTable.renderRow(location, tr);
        updateLocation(location.id, new Location(location));
      }
    }
  );
};

const createLocation = (location) => LocationsController.createLocation(location).then((res) => {
  refreshLocations();
  cancelAddLocation();
  triggerWidgetOnLocationsUpdate({});
  return true;
}).catch(() => {
  addLocationControls.saveBtn.disabled = false;
});

const updateLocation = (locationId, location) => {
  return LocationsController.updateLocation(locationId, location).then((res) => {
    refreshLocations();
    cancelAddLocation();
    triggerWidgetOnLocationsUpdate({});
    return true;
  }).catch(() => {
    addLocationControls.saveBtn.disabled = false;
  });
};

const triggerWidgetOnLocationsUpdate = ({ realtimeUpdate = false, isCancel = false } = {}) => {
  if (syncTimeOut) clearTimeout(syncTimeOut);
  syncTimeOut = setTimeout(() => {
    let data = null;
    if (realtimeUpdate) {
      data = {
        ...state.locationObj,
        id: state.locationObj.id,
        title: addLocationControls.locationTitle.value,
        subtitle: addLocationControls.locationSubtitle.value,
        address: state.locationObj.address,
        formattedAddress: addLocationControls.locationAddress.value,
        coordinates: state.locationObj.coordinates,
        marker: state.locationObj.marker,
        categories: state.locationObj.categories,
        settings: state.locationObj.settings,
        images: state.locationObj.images,
        description: state.locationObj.description,
        actionItems: state.locationObj.actionItems,
        listImage: state.locationObj.listImage,
        rating: state.locationObj.rating,
        price: state.locationObj.price,
        editingPermissions: state.locationObj.editingPermissions,
        openingHours: { ...state.locationObj.openingHours, ...state.selectedOpeningHours }
      };
    }
    buildfire.messaging.sendMessageToWidget({
      cmd: 'sync',
      scope: 'locations',
      realtimeUpdate,
      isCancel,
      data
    });
  }, 500);
};

const triggerWidgetOnSettingsUpdate = () => {
  buildfire.messaging.sendMessageToWidget({
    cmd: 'sync',
    scope: 'settings'
  });
};

// this called in content.js;
window.initLocations = () => {
  const { settings } = globalState;
  locationsTable = new SearchTableHelper(
    "locations-items",
    searchTableConfig,
    settings
  );
  handleLocationEmptyState(true);
  state.filter = {};

  loadCategories((err, result) => {
    refreshLocations();
  });
  getPinnedLocation();
  locationsTable.onEditRow = (obj, tr) => {
    window.addEditLocation(obj);
  };

  locationsTable.onRowDeleted = deleteLocation;
  locationsTable.onImageClick = updateLocationImage;

  locationsTable.onSort = (sort) => {
    state.sort["_buildfire.index.text"] = sort.title;
    refreshLocations();
  };
  locationsTable.onCopy = copyLocationDeepling;
  locationsTable.onShowNotificationForm = showNotificationForm;
  locationsTable.onShowReport = showAnalyticsReport;
  locationsTable.onCopyMouseOut = onCopyMouseOut;
  locationsTable.onLoadMore = loadMoreLocations;
};
