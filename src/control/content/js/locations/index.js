/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
import buildfire from "buildfire";
import Location from "../../../../entities/Location";
import Category from "../../../../entities/Category";
import DataMocks from "../../../../DataMocks";
import SearchTableHelper from "../searchTable/searchTableHelper";
import searchTableConfig from "../searchTable/searchTableConfig";
import { generateUUID, createTemplate, getDefaultOpeningHours } from "../../utils/helpers";
import { downloadCsv, jsonToCsv, csvToJson } from "../../utils/csv.helper";
import DialogComponent from "../dialog/dialog";
import LocationImagesUI from "./locationImagesUI";


const sidenavContainer = document.querySelector("#sidenav-container");
const locationsSection = document.querySelector("#main");
const inputLocationForm = document.querySelector("#form-holder");

let addLocationControls = {};
let selectCategoryDialog = null;
let locationImagesUI = null;

const state = {
  categories: [],
  categoriesLookup: {},
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
  }
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
    locationAddress: inputLocationForm.querySelector("#location-address-input"),
    locationAddressError: inputLocationForm.querySelector("#location-address-error"),
    locationCustomName: inputLocationForm.querySelector("#location-custom-name-input"),
    locationCustomNameError: inputLocationForm.querySelector("#location-custom-name-error"),
    markerPinRadio: inputLocationForm.querySelector("#marker-pin-radio"),
    markerCircleRadio: inputLocationForm.querySelector("#marker-circle-radio"),
    markerImageRadio: inputLocationForm.querySelector("#marker-image-radio"),
    selectMarkerImageContainer: inputLocationForm.querySelector("#select-marker-image-container"),
    selectMarkerImageBtn: inputLocationForm.querySelector("#select-marker-image-btn"),
    selectMarkerColorContainer: inputLocationForm.querySelector("#select-marker-color-container"),
    selectMarkerColorBtn: inputLocationForm.querySelector("#select-marker-color-btn"),
    editCategoriesBtn: inputLocationForm.querySelector("#location-edit-categories-btn"),
    showCategoriesBtn: inputLocationForm.querySelector("#location-show-category-toggle"),
    categoriesContainer: inputLocationForm.querySelector("#location-categories-container"),
    categoriesCount: inputLocationForm.querySelector("#location-categories-count-txt"),
    categoriesList: inputLocationForm.querySelector("#location-categories-list"),
    showOpeningHoursBtn: inputLocationForm.querySelector("#location-show-opening-hours-btn"),
    openingHoursContainer: inputLocationForm.querySelector("#location-opening-hours-container"),
    showPriceRangeBtn: inputLocationForm.querySelector("#location-show-price-range-btn"),
    selectPriceCurrency: inputLocationForm.querySelector("#location-select-price-currency"),
    showStarRatingBtn: inputLocationForm.querySelector("#location-show-star-rating-btn"),
    listImageBtn: inputLocationForm.querySelector("#location-list-image"),
    addLocationImageBtn: inputLocationForm.querySelector("#location-add-images-btn"),
  };
};

window.cancelAddLocation = () => {
  sidenavContainer.style.display = "flex";
  inputLocationForm.innerHTML = "";
  inputLocationForm.style.display = "none";
  state.locationObj = new location();
  state.selectedLocationCategories = {main: [], subcategories: []};
};

window.addEditLocation = (location, callback = () => {}) => {
  renderAddLocationsPage();
  loadMap();

  if (!location) {
    state.locationObj = new Location();
  }

  renderCategoriesList(state.locationObj.categories);
  renderOpeningHours(state.locationObj.openingHours);

  locationImagesUI = new LocationImagesUI('location-image-items');

  tinymce.init({
    selector: "#location-description-wysiwyg",
  });

  addLocationControls.editCategoriesBtn.onclick = openSelectCategoriesDialog
  addLocationControls.showCategoriesBtn.onchange = (e) => {
    state.locationObj.settings.showCategory = e.target.checked;
  };

  addLocationControls.showOpeningHoursBtn.onchange = (e) => {
    state.locationObj.settings.showOpeningHours = e.target.checked;
  };

  addLocationControls.showPriceRangeBtn.onchange = (e) => {
    state.locationObj.settings.showPriceRange = e.target.checked;
  };

  addLocationControls.showStarRatingBtn.onchange = (e) => {
    state.locationObj.settings.showStarRating = e.target.checked;
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
    });
  }

  addLocationControls.addLocationImageBtn.onclick = () => {
    buildfire.imageLib.showDialog(
      { showIcons: false, multiSelection: true }, (err, result) => {
        if (err) return console.error(err);
        if (!result) {
          return null;
        }
        const { selectedFiles, selectedStockImages } = result;
        let locationImages = [];
        if (selectedFiles) {
          loadLocations.push( ...selectedFiles);
        } else if (selectedStockImages) {
          loadLocations.push( ...selectedStockImages);
        }
        
        state.locationObj.images.push( locationImages.map(imageUrl => ({id: generateUUID(), imageUrl})));

        locationImagesUI.init("location-image-items", state.locationObj.images);
    });
  }

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
  createSelectCategoryList(state.categories, categoriesListContainer, state.locationObj.categories);

  const dialogContent = document.createElement("div");

  dialogContent.appendChild(searchBox);
  dialogContent.appendChild(categoriesListContainer);

  const searchInput = dialogContent.querySelector('.search-input');

  searchInput.onkeyup = (e) => {
    const searchValue = e.target.value;
    console.log(searchValue);
    const data = state.categories.filter((elem) => elem.title.toLowerCase().includes(searchValue.toLowerCase()));
    createSelectCategoryList(data, categoriesListContainer, state.locationObj.categories);
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
      renderCategoriesList(state.locationObj.categories);
      selectCategoryDialog.close(e);
    }
  );
};

const createSelectCategoryList = (categories, categoriesContainer, selected) => {
  categoriesContainer.innerHTML = "";
  state.selectedLocationCategories = { ...state.locationObj.categories };

  if (categories.length === 0) {
    categoriesContainer.appendChild(createEmptyHolder('No Categories'));
    return;
  }
  // eslint-disable-next-line no-restricted-syntax
  for (const _category of categories) {
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

    const isCategorySelected = selected?.main.find((categoryId) => _category.id === categoryId);
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
      checkboxDiv.className = 'col-md-5  padding-zero margin-top-ten flex-row align-items-center ';
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

const renderCategoriesList = (locationCategories) => {
  addLocationControls.categoriesList.innerHTML = "";

  if (locationCategories?.main?.length === 0) {
    addLocationControls.categoriesCount.innerHTML = "";
    addLocationControls.categoriesList.innerHTML = `<div class="text-center"><h5>No Categories Selected!</h5></div>`;
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
       <h6 class="text-bold">${category.title}</h6>
       <span class="text-muted">${subcategories.map((elem) => elem.title).join(', ')}</span>
     </div>
    `;
    categoryListItem.innerHTML = itemContent;

    addLocationControls.categoriesList.appendChild(categoryListItem);
  }
};

const renderOpeningHours = (openingHours) => {
  const days = openingHours && Object.keys(openingHours?.days).length? openingHours?.days : state.selectedOpeningHours?.days;
  for (const day in days) {
    const openingHoursDayItem = createTemplate("openingHoursDayItemTemplate");
    const enableDayInput = openingHoursDayItem.querySelector(".enable-day-input");
    const enableDayLabel = openingHoursDayItem.querySelector(".enable-day-label");
    const dayIntervals = openingHoursDayItem.querySelector(".day-intervals");
    const addHoursBtn = openingHoursDayItem.querySelector(".add-hours-btn");
   

    openingHoursDayItem.id = day;
    enableDayInput.id = `enable-${day}-checkbox`;
    enableDayLabel.htmlFor = `enable-${day}-checkbox`;
    enableDayLabel.innerHTML = state.weekDays[day];

    enableDayInput.checked = !!days[day]?.active
    enableDayInput.onchange = (e) => {
      days[day].active = e.target.checked;
    };
    addHoursBtn.onclick = (e) => {
      days[day].intervals?.push({ from: "08:00", to: "20:00" });
      renderDayIntervals(days[day], dayIntervals);
    };
    
    renderDayIntervals(days[day], dayIntervals);

    addLocationControls.openingHoursContainer.appendChild(openingHoursDayItem);
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

    fromInput.value = interval.from;
    toInput.value = interval.to;

    if (intervalIndex === 0) {
      deleteBtn.classList.add('hidden');
    } else {
      deleteBtn.classList.remove('hidden');
    }

    fromInput.onchange = (e) => {
      interval.from = e.target.value
    };
    toInput.onchange = (e) => {
      interval.to = e.target.value
    };
    deleteBtn.onclick = (e) => {
      day.intervals = day.intervals.filter((elem, index) => index !== intervalIndex);
      dayInterval.remove();
    };

    dayIntervalsContainer.appendChild(dayInterval);
  });
};

const addLocationImages = () => {
  buildfire.imageLib.showDialog(
    { showIcons: false, multiSelection: true }, (err, result) => {
      if (err) return console.error(err);
      if (!result) {
        return null;
      }
      const { selectedFiles, selectedStockImages } = result;
    }
  );
}

const creatCheckboxElem = () => {
  const div = document.createElement("div");
  div.innerHTML = `<input type="checkbox" class="checkbox-input"/>
  <label for="checkbox1" class="checkbox-label ellipsis margin-bottom-zero margin-left-ten"></label>`;

  return div;
};

const createEmptyHolder = (message) => {
  const div = document.createElement("div");
  div.className = 'well text-center margin-top-fifteen';
  div.innerHTML = `<hr class="none"><h5>${ message? message : 'No Data' }!</h5>`;
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

    console.log(place.geometry.location.lat(), place.geometry.location.lng());
  });

  marker.addListener("dragend", (e) => {
    map.setCenter(e.latLng);
    geoCoder.geocode(
      { location: { lat: e.latLng.lat(), lng: e.latLng.lng() } },
      (results, status) => {
        console.log(results);
        console.log(status);
        if (status === "OK") {
          if (results[0]) {
            this.zoom = 12;
            this.address = results[0].formatted_address;
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
      console.log(key);
      const docHead = document.getElementsByTagName("head");
      const scriptEl = document.createElement("script");
      scriptEl.id = "googleScript";
      scriptEl.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=intiMap&libraries=places&v=weekly`;
      docHead[0].appendChild(scriptEl);
    }
    setGoogleMapsScript(context.apiKeys.googleMapKey);
  });
};

const loadLocations = () => {
  const searchTableHelper = new SearchTableHelper(
    "locations-items",
    "records",
    searchTableConfig
  );
  searchTableHelper.search();
};

// this called in content.js;
window.initLocations = () => {
  loadLocations();
  state.categories = DataMocks.generate("CATEGORY", 10);

  for (const category of state.categories) {
    state.categoriesLookup[category.id] = category;
  }
};