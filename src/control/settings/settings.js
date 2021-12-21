/* eslint-disable no-use-before-define */
/* eslint-disable no-restricted-syntax */
// This is the entry point of your plugin's settings control.
// Feel free to require any local or npm modules you've installed.
import buildfire from 'buildfire';
import Settings from '../../entities/Settings';
import authManager from '../../UserAccessControl/authManager';
import SettingsController from "./settings.controller";


const templates = {};
const state = {
  settings: new Settings(),
  dictionary: {
    allowSortByReverseAlphabetical: 'Allow Reverse Alphabetical Order',
    allowSortByNearest: 'Nearest to User Location',
    allowSortByPriceHighToLow: "Allow Price High to Low",
    allowSortByPriceLowToHigh: "Allow Price Low to High",
    allowSortByViews: "Allow by Views",
    allowSortByDate: "Allow by Date (New to old)",
    allowSortByRating: "Allow by Rating",
    allowFilterByArea: "Filter by Selected Area",
    allowFilterByLatest: "Filter by Latest",
    allowFilterByBookmarks: "Filter by Top Bookmarked",
    allowForLocations: "Allow Bookmark Location",
    allowForFilters: "Allow Bookmark Search"
  }
};

const initChat = () => {
  const allowChat = document.querySelector('#allow-chat-btn');
  allowChat.checked = state.settings.chat.allowChat;
  allowChat.onchange = (e) => {
    state.settings.chat.allowChat = e.target.checked;
    saveSettings();
  };
};

const initSorting = () => {
  const sortingSettings = new Settings().sorting;
  const sortingOptionsContainer = document.querySelector('#sorting-settings-container');
  const defaultLocationsSortRadios = document.querySelectorAll('input[name="defaultLocationSort"]');
  sortingOptionsContainer.innerHTML = '';

  for (const radio of defaultLocationsSortRadios) {
    if (radio.value === state.settings.sorting?.defaultSorting) {
      radio.checked = true;
    }

    radio.onchange = (e) => {
      const value = e.target.value;
      state.settings.sorting.defaultSorting = value;
      saveSettings();
    }
  }

  for (const key of Object.keys(sortingSettings)) {
    if (typeof sortingSettings[key] !== 'boolean') {
      continue;
    }

    const switchBtn = createTemplate('switchBtnTemplate');
    const btnDesc = switchBtn.querySelector('.btn-description');
    const btn = switchBtn.querySelector('#switch-btn');
    const btnLabel = switchBtn.querySelector('.switch-btn-label');

    btnDesc.innerHTML = state.dictionary[key];
    btn.id = key;
    btnLabel.htmlFor = key;

    btn.checked = state.settings.sorting[key];
    btn.onchange = (e) => {
      console.log(e.target.checked);
      state.settings.sorting[key] = e.target.checked;
      saveSettings();
    };

    sortingOptionsContainer.appendChild(switchBtn);
  }
};

const initFiltering = () => {
  const filterSettings = new Settings().filter;
  const filterOptionsContainer = document.querySelector('#filtering-settings-container');

  filterOptionsContainer.innerHTML = '';
  for (const key of Object.keys(filterSettings)) {
    if (typeof filterSettings[key] !== 'boolean') {
      continue;
    }

    const switchBtn = createTemplate('switchBtnTemplate');
    const btnDesc = switchBtn.querySelector('.btn-description');
    const btn = switchBtn.querySelector('#switch-btn');
    const btnLabel = switchBtn.querySelector('.switch-btn-label');

    btnDesc.innerHTML = state.dictionary[key];
    btn.id = key;
    btnLabel.htmlFor = key;

    btn.checked = state.settings.filter[key];
    btn.onchange = (e) => {
      state.settings.filter[key] = e.target.checked;
      saveSettings();
    };

    filterOptionsContainer.appendChild(switchBtn);
  }
};

const iniBookmarks = () => {
  const bookmarkSettings = new Settings().bookmarks;
  const bookmarkOptionsContainer = document.querySelector('#bookmarks-settings-container');
  const enableBookmarksBtn = document.querySelector('#enable-bookmarks-btn');
  bookmarkOptionsContainer.innerHTML = '';

  enableBookmarksBtn.checked = state.settings.bookmarks.enabled;
  enableBookmarksBtn.onchange = (e) => {
    state.settings.bookmarks.enabled = e.target.checked;
    saveSettings();
  };

  for (const key of Object.keys(bookmarkSettings)) {
    if (typeof bookmarkSettings[key] !== 'boolean' || key === 'enabled') {
      continue;
    }

    const switchBtn = createTemplate('switchBtnTemplate');
    const btnDesc = switchBtn.querySelector('.btn-description');
    const btn = switchBtn.querySelector('#switch-btn');
    const btnLabel = switchBtn.querySelector('.switch-btn-label');

    btnDesc.innerHTML = state.dictionary[key];
    btn.id = key;
    btnLabel.htmlFor = key;
    btn.checked = state.settings.bookmarks[key];
    btn.onchange = (e) => {
      state.settings.bookmarks[key] = e.target.checked;
      saveSettings();
    };

    bookmarkOptionsContainer.appendChild(switchBtn);
  }
};

const initMap = () => {
  const distanceUnitsRadios = document.querySelectorAll('input[name="distanceUnits"]');
  const showPointsOfInterestBtn = document.querySelector('#show-points-of-interest');
  const enableMapInitialAreaBtn = document.querySelector('#enable-map-initial-area');
  // const enableOfflineAreaSelectionBtn = document.querySelector('#enable-offline-area-selection');

  showPointsOfInterestBtn.checked = state.settings.map?.showPointsOfInterest;
  showPointsOfInterestBtn.onchange = (e) => {
    state.settings.map.showPointsOfInterest = e.target.checked;
    saveSettings();
  };

  enableMapInitialAreaBtn.checked = state.settings.map?.initialArea;
  enableMapInitialAreaBtn.onchange = (e) => {
    state.settings.map.initialArea = e.target.checked;
    saveSettings();
  };

  // enableOfflineAreaSelectionBtn.checked = state.settings.map?.offlineAreaSelection;
  // enableOfflineAreaSelectionBtn.onchange = (e) => {
  //   state.settings.map.offlineAreaSelection = e.target.checked;
  //   saveSettings();
  // };

  // Distance Units Selection
  for (const radio of distanceUnitsRadios) {
    if (radio.value === state.settings.map?.distanceUnit) {
      radio.checked = true;
    }

    radio.onchange = (e) => {
      const value = e.target.value;
      state.settings.map.distanceUnit = value;
      saveSettings();
    };
  }

  // load map
  loadMap();
};

window.intiGoogleMap = () => {
  const searchBoxElem = document.querySelector('#initial-area-location-input');
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
    searchBoxElem,
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

  const currentPosition = {
    lat: state.settings.map.initialAreaCoordinates.lat,
    lng: state.settings.map.initialAreaCoordinates.lng
  };

  if (state.settings.map.initialAreaString) {
    searchBoxElem.value = state.settings.map.initialAreaString;
  }

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

    state.settings.map.initialAreaCoordinates.lat = place.geometry.location.lat();
    state.settings.map.initialAreaCoordinates.lng = place.geometry.location.lng();
    state.settings.map.initialAreaString = place.formatted_address;
    saveSettings();
  });

  marker.addListener("dragend", (e) => {
    map.setCenter(e.latLng);
    geoCoder.geocode(
      { location: { lat: e.latLng.lat(), lng: e.latLng.lng() } },
      (results, status) => {
        console.log(results);
        if (status === "OK") {
          if (results[0]) {
            state.settings.map.initialAreaString = results[0].formatted_address;
            state.settings.map.initialAreaCoordinates.lat = e.latLng.lat();
            state.settings.map.initialAreaCoordinates.lng = e.latLng.lng();
            searchBoxElem.value = results[0].formatted_address;
            saveSettings();
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
      scriptEl.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=intiGoogleMap&libraries=places&v=weekly`;
      if (mapScript) {
        document.head.removeChild(mapScript);
      }
      docHead[0].appendChild(scriptEl);
    }

    setGoogleMapsScript(context.apiKeys.googleMapKey);
  });
};

const createTemplate = (templateId) => {
  const template = document.getElementById(`${templateId}`);
  return document.importNode(template.content, true);
};

const createLoadingState = () => {
  const div = document.createElement("div");
  div.className = 'empty-state';
  div.innerHTML = `<h4>Loading...</h4>`;
  return div;
};

const fetchTemplate = (template, callback) => {
  if (templates[template]) {
    console.warn(`template ${template} already exist.`);
    callback(null, template);
    return;
  }

  // show loading state
  document.querySelector(`#main`).innerHTML = '';
  document.querySelector(`#main`).appendChild(createLoadingState());
  const xhr = new XMLHttpRequest();
  xhr.onload = () => {
    const content = xhr.responseText;
    templates[template] = new DOMParser().parseFromString(content, 'text/html');
    callback(null, template);
  };
  xhr.onerror = (err) => {
    console.error(`fetching template ${template} failed.`);
    callback(err, template);
  };
  xhr.open('GET', `./templates/${template}.html`);
  xhr.send(null);
};

const injectTemplate = (template) => {
  if (!templates[template]) {
    console.warn(`template ${template} not found.`);
    return;
  }
  const createTemplate = document.importNode(templates[template].querySelector('template').content, true);
  document.querySelector(`#main`).innerHTML = '';
  document.querySelector(`#main`).appendChild(createTemplate);
};
/** template management end */

const navigate = (template, callback) => {
  fetchTemplate(template, () =>  {
    injectTemplate(template);
    if (callback) callback();
  });
};

const setActiveSidenavTab = (section) => {
  const sidenav = document.querySelector('#sidenav');
  for (const tab of sidenav.childNodes) {
    tab.querySelector('a').classList.remove('active');
  };

  sidenav.querySelector(`#${section}-tab`).firstChild.classList.add('active');
};

window.onSidenavChange = (section) => {
  switch (section) {
    case 'chat':
      setActiveSidenavTab('chat');
      navigate('chat', () => {
        initChat()
      });
      break;
    case 'sorting':
      setActiveSidenavTab('sorting');
      navigate('sorting', () => {
        initSorting();
      });
      break;
    case 'filtering':
      setActiveSidenavTab('filtering');
      navigate('filtering', () => {
        initFiltering();
      });
      break;
    case 'map':
      setActiveSidenavTab('map');
      navigate('map', () => {
        initMap();
      });
      break;
    // case 'bookmarks':
    //   setActiveSidenavTab('bookmarks');
    //   navigate('bookmarks', () => {
    //     iniBookmarks();
    //   });
    //   break;
    default:
      setActiveSidenavTab('chat');
      navigate('chat');
  }
};

const saveSettings = () => {
  SettingsController.saveSettings(state.settings)
    .then(triggerWidgetOnDesignUpdate).catch(console.error);
};

const getSettings = () => {
  SettingsController.getSettings().then((settings) => {
    state.settings = settings;
    onSidenavChange('chat');
  }).catch(console.error);
};

const triggerWidgetOnDesignUpdate = () => {
  buildfire.messaging.sendMessageToWidget({
    cmd: "update_settings",
  });
};

const init = () => {
  getSettings();
};

authManager.enforceLogin(init);