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
import generateDeeplinkUrl from "../../../../utils/generateDeeplinkUrl";
import { convertTimeToDate, convertDateToTime } from "../../../../utils/datetime";
import authManager from '../../../../UserAccessControl/authManager';

const breadcrumbsSelector = document.querySelector("#breadcrumbs");
const sidenavContainer = document.querySelector("#sidenav-container");
const locationsSection = document.querySelector("#main");
const inputLocationForm = document.querySelector("#form-holder");
let locationsTable = null;
let addLocationControls = {};
let selectCategoryDialog = null;
let locationImagesUI = null;
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
  markerColor: "markerColor",
  showCategory: "showCategory",
  showOpeningHours: "showOpeningHours",
  showPriceRange: "showPriceRange",
  showStarRating: "showStarRating",
  images: "images",
  views: "views",
  priceRange: "priceRange",
  priceCurrency: "priceCurrency",
  bookmarksCount: "bookmarksCount"
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
    selectMarkerColorContainer: inputLocationForm.querySelector("#select-marker-color-container"),
    selectMarkerColorBtn: inputLocationForm.querySelector("#select-marker-color-btn"),
    editCategoriesBtn: inputLocationForm.querySelector("#location-edit-categories-btn"),
    showCategoriesBtn: inputLocationForm.querySelector("#location-show-category-toggle"),
    categoriesContainer: inputLocationForm.querySelector("#location-categories-container"),
    categoriesCount: inputLocationForm.querySelector("#location-categories-count-txt"),
    categoriesList: inputLocationForm.querySelector("#location-categories-list"),
    locationCategoriesError: inputLocationForm.querySelector("#location-categories-error"),
    showOpeningHoursBtn: inputLocationForm.querySelector("#location-show-opening-hours-btn"),
    openingHoursContainer: inputLocationForm.querySelector("#location-opening-hours-container"),
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
    addOwnerBtn: inputLocationForm.querySelector("#location-add-owner-btn"),
    deleteOwnerBtn: inputLocationForm.querySelector("#location-delete-owner-btn"),
    ownerTxt: inputLocationForm.querySelector("#location-owner-txt"),
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

window.addEditLocation = (location) => {
  if (state.categories.length === 0) {
    openRequiredCategoriesDialog();
    return;
  }

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

    if (state.locationObj.owner && Object.keys(state.locationObj.owner).length > 0) {
      addLocationControls.ownerTxt.innerHTML = state.locationObj.owner.displayName;
      addLocationControls.deleteOwnerBtn.classList.remove('hidden');
    }
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
        triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
      });
    }
  });

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
          state.locationObj.marker.color = null;
        }
      }
    );
  };

  addLocationControls.selectMarkerColorBtn.onclick = () => {
    buildfire.colorLib.showDialog(
      { colorType: "solid", solid: { color: state.locationObj.marker.color } },
      { hideGradient: true },
      null,
      (err, result) => {
        if (result.colorType === "solid") {
          state.locationObj.marker.color = result.solid.color;
          state.locationObj.marker.icon = null;
          addLocationControls.selectMarkerColorBtn.querySelector(
            ".color"
          ).style.background = result.solid.color;
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

  addLocationControls.locationSubtitle.onkeydown = () => {
    triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
  };

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
    buildfire.actionItems.showDialog(null, { showIcon: true }, (err, actionItem) => {
      if (err) return console.error(err);

      if (!actionItem) {
        return false;
      }
      console.log("Action item created", actionItem);
      actionItem.id = generateUUID();
      state.locationObj.actionItems.push(actionItem);
      actionItemsUI.addItem(actionItem);
      triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    });
  };

  addLocationControls.addOwnerBtn.onclick = () => {
    buildfire.auth.showUsersSearchDialog(null, (err, result) => {
      if (err) return console.log(err);

      if (!result) return;
      const { users } = result;
      if (users && users.length > 0) {
        state.locationObj.owner = result.users[0];
        addLocationControls.ownerTxt.innerHTML = state.locationObj.owner.displayName;
        addLocationControls.deleteOwnerBtn.classList.remove('hidden');
      }
    });
  };

  addLocationControls.deleteOwnerBtn.onclick = () => {
    state.locationObj.owner = null;
    addLocationControls.ownerTxt.innerHTML = '';
    addLocationControls.deleteOwnerBtn.classList.add('hidden');
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
    buildfire.actionItems.showDialog(item, null, (err, actionItem) => {
      if (err) return console.error(err);

      if (actionItem) {
        actionItem.id = item.id;
        actionItemsUI.updateItem(actionItem, index, divRow);
      }
    });
  };

  addLocationControls.saveBtn.onclick = (e) => {
    saveLocation(location ? "Edit" : "Add");
  };

  addLocationControls.cancelBtn.onclick = cancelAddLocation;

  locationImagesUI.init(state.locationObj.images);
  actionItemsUI.init(state.locationObj.actionItems);
};

const saveLocation = (action, callback = () => {}) => {
  state.locationObj.title = addLocationControls.locationTitle.value;
  state.locationObj.subtitle = addLocationControls.locationSubtitle.value;
  state.locationObj.address = addLocationControls.locationAddress.value;
  state.locationObj.addressAlias = addLocationControls.locationCustomName.value;
  state.locationObj.description = tinymce.activeEditor.getContent();

  if (!locationInputValidation()) {
    callback(false);
    return;
  }

  state.locationObj.openingHours = { ...state.locationObj.openingHours, ...state.selectedOpeningHours };

  addLocationControls.saveBtn.disabled = true;
  if (action === 'Add') {
    createLocation(state.locationObj).then(callback);
  } else {
    updateLocation(state.locationObj.id, state.locationObj).then(callback);
  }
};

const locationInputValidation = () => {
  const { title, address, description, coordinates, listImage, categories } = state.locationObj;
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

  // if (!coordinates.lat || !coordinates.lng) {
  //   handleInputError(addLocationControls.locationAddressError, true, 'Please select correct Address');
  //   isValid = false;
  // } else {
  //   handleInputError(addLocationControls.locationAddressError, false);
  // }

  if (!categories || categories?.main?.length === 0) {
    handleInputError(addLocationControls.locationCategoriesError, true);
    isValid = false;
  } else {
    handleInputError(addLocationControls.locationCategoriesError, false);
  }

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

  const invalidInput = document.querySelector(".has-error");
  if (invalidInput) {
    invalidInput.scrollIntoView({ behavior: "smooth", block: "center" });
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
    ).style.background = marker.color;
  }
  const radios = addLocationControls.markerTypeRadioBtns;
  for (const radio of radios) {
    if (radio.value === marker?.type) {
      radio.checked = true;
    }
    radio.onchange = (e) => {
      const value = e.target.value;
      state.locationObj.marker.type = value;
      handleMarkerType(value);
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
    if (radio.value === price?.range) {
      radio.checked = true;
    }
    radio.onchange = (e) => {
      const value = e.target.value;
      state.locationObj.price.range = value;
    }
  }

  addLocationControls.selectPriceCurrency.onchange = (e) => {
    const value = e.target.value;
    console.log(value);
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
  const glyphIcon = element.querySelector(".glyph-icon");
  const defaultIcon = element.querySelector(".add-icon");

  if (type === "url") {
    glyphIcon.classList.add("hidden");
    defaultIcon.classList.add("hidden");
    imageIcon.classList.remove("hidden");
    imageIcon.src = cropImage(icon, {
      width: options.width? options.width : 16,
      height: options.height? options.height : 16,
    });
  } else if (type === "font") {
    imageIcon.classList.add("hidden");
    defaultIcon.classList.add("hidden");
    glyphIcon.classList.remove("hidden");
    glyphIcon.className = `glyph-icon ${icon}`;
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
    console.log(searchValue);
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
        subcategoriesContainer.style.display = "flex";
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
  state.selectedOpeningHours.days =  { ...state.selectedOpeningHours.days, ...openingHours.days };
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
        triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
      };
      addHoursBtn.onclick = (e) => {
        days[day].intervals?.push({ from: convertTimeToDate("08:00"), to: convertTimeToDate("20:00") });
        renderDayIntervals(days[day], dayIntervals);
        triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
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
    const deleteBtn = dayInterval.querySelector(".delete-interval-btn");

    const dayIntervalId = generateUUID();
    dayInterval.id = dayIntervalId;
    fromInput.value = convertDateToTime(interval.from);
    toInput.value = convertDateToTime(interval.to);

    if (intervalIndex === 0) {
      deleteBtn.classList.add('hidden');
    } else {
      deleteBtn.classList.remove('hidden');
    }

    fromInput.onchange = (e) => {
      console.log(new Date(e.target.valueAsDate));
      console.log(convertTimeToDate(e.target.value));
      interval.from = convertTimeToDate(e.target.value);
      triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    };
    toInput.onchange = (e) => {
      console.log(new Date(e.target.valueAsDate));
      console.log(convertTimeToDate(e.target.value));
      interval.to = convertTimeToDate(e.target.value);
      triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    };
    deleteBtn.onclick = (e) => {
      day.intervals = day.intervals.filter((elem, index) => index !== intervalIndex);
      dayInterval.remove();
      triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
    };

    dayIntervalsContainer.appendChild(dayInterval);
  });
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
  div.innerHTML = `<hr class="none"><h4>${ message? message : 'No Data' }.</h4>`;
  return div;
};

window.intiMap = () => {
  console.log("Map Ready");
  const map = new google.maps.Map(document.getElementById("location-map"), {
    center: { lat: -34.397, lng: 150.644 },
    zoom: 10,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
  });
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

  const currentPosition = {lat: state.locationObj.coordinates.lat, lng: state.locationObj.coordinates.lng}
  if (currentPosition.lat && currentPosition.lng) {
    const latlng  = new google.maps.LatLng(currentPosition.lat, currentPosition.lng);
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

const deleteLocation = (item, row, callback = () => {}) => {
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
          callback(item);
        });
      }
    }
  );
};

const handleLocationEmptyState = (isLoading) => {
  const emptyState = locationsSection.querySelector('#location-empty-list');
  if (isLoading) {
    emptyState.innerHTML = `<h4> Loading... </h4>`;
    emptyState.classList.remove('hidden');
  } else if (state.locations.length === 0) {
    emptyState.innerHTML = `<h4>No Locations Added</h4>`;
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }
};

let timeoutId;
window.searchLocations = (e) => {
  const searchValue = e.target.value;
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    const filter = {};
    if (searchValue) {
      state.filter["_buildfire.index.text"] = { $regex: searchValue, $options: "-i" };
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
  const  csv = jsonToCsv(templateData, {
    header
  });

  downloadCsv(csv, `${name? name : 'template'}.csv`);
};

window.downloadLocationTemplate = () =>  {
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

  return true;
  // return items.every((item, index, array) =>  item.title && item.address &&  item.lat && item.lng && item.description);
};

window.importLocations = () =>  {
  locationsSection.querySelector("#location-file-input").click();
  locationsSection.querySelector("#location-file-input").onchange = function (e) {
    readCSVFile(this.files[0], (err, result) => {
      if (!validateLocationCsv(result)) {
        return;
      }
      const locations = result.map((elem) => {
        delete elem.id;
        elem.images = elem.images?.split(',').filter((elem) => elem).map((imageUrl) => ({ id: generateUUID(), imageUrl }));
        elem.marker = { type: elem.markerType || 'pin', color: elem.markerColor || null, image: elem.markerImage || null };
        elem.settings = {
          showCategory: elem.showCategory || true,
          showOpeningHours: elem.showOpeningHours || false,
          showPriceRange: elem.showPriceRange || false,
          showStarRating: elem.showStarRating || false,
        };
        elem.coordinates = { lat: Number(elem.lat), lng: Number(elem.lng) };
        elem.price = { range: elem.priceRange || 0, currency: elem.priceCurrency || '$' };
        let categories = elem.categories ? elem.categories : "";
        categories = elem.categories?.split(',').filter((elem) => elem);
        const mainCategories = state.categories.filter((elem) => categories?.includes((elem).title)).map((elem) => elem.id);
        elem.categories = { main: mainCategories, subcategories: [] };
        elem.openingHours = { ...getDefaultOpeningHours(), timezone: null };
        elem.createdOn = new Date();
        elem.createdBy = authManager.currentUser;
        return new Location(elem).toJSON();
      });

      const dialogRef = showProgressDialog({
        title: 'Importing Locations',
        message: 'We’re importing your locations, please wait.'
      });
      LocationsController.bulkCreateLocation(locations).then((result) => {
        dialogRef.close();
        buildfire.dialog.toast({
          message: "Successfully imported locations",
          type: "success",
        });
        refreshLocations();
        triggerWidgetOnLocationsUpdate({});
      }).catch((err) => {
        dialogRef.close();
        console.error(err);
      });
    });
  };
};

window.exportLocations = () => {
  const data = state.locations.map(elem => ({
    ...elem, ...elem.coordinates, ...elem.settings,
    markerType: elem.marker.type,
    markerImage: elem.marker.image,
    markerColor: elem.marker.color,
    priceRange: elem.price.range,
    priceCurrency: elem.price.currency,
    categories: elem.categories.main.map(catId => state.categoriesLookup[catId]),
  }));
 downloadCsvTemplate(data, locationTemplateHeader, 'locations');
};

const showImportErrorMessage = ({ message }) => {
  buildfire.dialog.alert(
    {
      title: "Couldn't import locations",
      message,
    },
    (err, actionButton) => {}
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
  CategoriesController.searchCategories().then((categories) => {
    state.categories = categories;
    globalState.categories = categories;
    for (const category of state.categories) {
      state.categoriesLookup[category.id] = category;
    }
    callback();
  });
};

const copyLocationDeepling = (location, tr) => {
  generateDeeplinkUrl(location).then((result) => {
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

const createLocation = (location) => {
  return LocationsController.createLocation(location).then((res) => {
    refreshLocations();
    triggerWidgetOnLocationsUpdate({});
    cancelAddLocation();
    return true;
  }).catch(() => {
    addLocationControls.saveBtn.disabled = false;
  });
};

const updateLocation = (locationId, location) => {
  return LocationsController.updateLocation(locationId, location).then((res) => {
    refreshLocations();
    triggerWidgetOnLocationsUpdate({});
    cancelAddLocation();
    return true;
  }).catch(() => {
    addLocationControls.saveBtn.disabled = false;
  });
};

const triggerWidgetOnLocationsUpdate = ({ realtimeUpdate = false, isCancel = false }) => {
  if (syncTimeOut) clearTimeout(syncTimeOut);
  syncTimeOut = setTimeout(() => {
    let data = null;
    if (realtimeUpdate) {
      data = {
        title: addLocationControls.locationTitle.value,
        subtitle: addLocationControls.locationSubtitle.value,
        formattedAddress: addLocationControls.locationAddress.value,
        coordinates: state.locationObj.coordinates,
        categories: state.locationObj.categories,
        settings: state.locationObj.settings,
        images: state.locationObj.images,
        description: state.locationObj.description,
        actionItems: state.locationObj.actionItems,
        listImage: state.locationObj.listImage,
        rating: state.locationObj.rating,
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

// this called in content.js;
window.initLocations = () => {
  locationsTable = new SearchTableHelper(
    "locations-items",
    searchTableConfig
  );

  handleLocationEmptyState(true);
  loadCategories(() => {
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
  locationsTable.onCopyMouseOut = onCopyMouseOut;
  locationsTable.onLoadMore = loadMoreLocations;
};
