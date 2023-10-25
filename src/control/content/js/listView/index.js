/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
import SettingsController from "./controller";
import LocationsController from "../locations/controller";
import Setting from "../../../../entities/Settings";
import { generateUUID } from "../../utils/helpers";
import PinnedLocationsList from "./pinnedLocationsList";
import Location from "../../../../entities/Location";
const state = {
  settings: new Setting(),
  pinnedLocations: [],
  isWysiwygInitialized: true,
};

const listViewSection = document.querySelector("#main");

let listViewImagesCarousel = null;
let pinnedLocationsList = null;

const initListViewWysiwyg = () => {
  tinymce.EditorManager.execCommand('mceRemoveEditor', true, 'listview-description-wysiwyg');

  tinymce.init({
    selector: "#listview-description-wysiwyg",
    init_instance_callback: (editor) => {
      if (state.settings.introductoryListView?.description) {
        tinymce.activeEditor?.setContent(state.settings.introductoryListView?.description);
      }
    },
    setup: (editor) => {
      console.log(editor.getContent());
      editor.on('keyup change', () => {
        state.settings.introductoryListView.description = tinymce.activeEditor?.getContent();
        saveSettingsWithDelay();
      });
    }
  });
};

window.onShowListViewChanged = (e) => {
  state.settings.showIntroductoryListView = e.target.checked;
  saveSettingsWithDelay();
};

window.onSortLocationsChanged = (sorting) => {
  if (!sorting) {
    return;
  }
  state.settings.introductoryListView.sorting = sorting;
  saveSettingsWithDelay();
};

window.onShowLocationsModeChanged = (showMode) => {
	if (!showMode) {
		return;
	}
	let areaRadiusOptionsContainer = document.querySelector("#areaRadiusOptions-Container");
	if(showMode=="AreaRadius"){
		areaRadiusOptionsContainer?.classList?.remove('hidden');
	}else{
		areaRadiusOptionsContainer?.classList?.add('hidden');
	}
}

window.initAreaRadiusMap = () => {
	console.log("Map Ready");
  const map = new google.maps.Map(document.getElementById("area-radius-location-map"), {
    center: { lat: 32.7182625, lng: -117.1601157 },
    zoom: 1,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
  });
  state.map = map;

  const autocomplete = new google.maps.places.SearchBox(
    document.getElementById("area-radius-address-input"),
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

  const currentPosition = {lat: 32.7182625, lng: -117.1601157}
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
			document.getElementById("area-radius-address-input").value = results[0].formatted_address;
            // state.locationObj.formattedAddress = results[0].formatted_address;
            // state.locationObj.coordinates.lat = e.latLng.lat();
            // state.locationObj.coordinates.lng = e.latLng.lng();
            // addLocationControls.locationAddress.value = results[0].formatted_address;
            // triggerWidgetOnLocationsUpdate({ realtimeUpdate: true });
          } else {
            console.log("No results found");
          }
        } else {
          console.log("Geocoder failed due to: " + status);
        }
      }
    );
  });

}

const loadAreaRadiusMap = () => {
	buildfire.getContext((error, context) => {
	  function setGoogleMapsScript(key) {
		const docHead = document.getElementsByTagName("head");
		const mapScript = document.getElementById("googleScript");
		const scriptEl = document.createElement("script");
		scriptEl.id = "googleScript";
		scriptEl.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initAreaRadiusMap&libraries=places&v=weekly`;
		if (mapScript) {
		  document.head.removeChild(mapScript);
		}
		docHead[0].appendChild(scriptEl);
	  }

	  setGoogleMapsScript(context.apiKeys.googleMapKey);
	});
  };

const patchListViewValues = () => {
  console.log(state.settings.introductoryListView.images);
  const showBtn = listViewSection.querySelector('#listview-show-introduction-btn');
  showBtn.checked = state.settings.showIntroductoryListView;
  listViewImagesCarousel.loadItems(state.settings.introductoryListView.images);
  const sortRadioBtns = listViewSection.querySelectorAll('input[name="sortLocationBy"]');
//   here to add stored show options to UI
  for (const radio of sortRadioBtns) {
    if (radio.value === state.settings.introductoryListView.sorting) {
      radio.checked = true;
    }
  }
};

const handlePinnedLocationEmptyState = (isLoading) => {
  const emptyState = listViewSection.querySelector('#pinned-location-empty-list');
  if (isLoading) {
    emptyState.innerHTML = `<h4> Loading... </h4>`;
    emptyState.classList.remove('hidden');
  } else if (state.pinnedLocations.length === 0) {
    emptyState.innerHTML = `<h4>You haven't pinned any locations yet</h4>`;
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }
};

let timeoutId;
const saveSettingsWithDelay = () => {
  clearTimeout(timeoutId);
  timeoutId = setTimeout(() => {
    saveSettings();
  }, 300);
};

const saveSettings = () => {
  SettingsController.saveSettings(state.settings).then(triggerWidgetOnListViewUpdate).catch(console.error);
};

const getPinnedLocations = () => {
  handlePinnedLocationEmptyState(true);
  LocationsController.getPinnedLocation().then(({result, recordCount}) => {
    state.pinnedLocations = result || [];
    state.recordCount = recordCount || 0;
    pinnedLocationsList.init(state.pinnedLocations);
    handlePinnedLocationEmptyState(false);
    console.log(result);
  });
};

const deletePinnedLocation = (item, index, callback) => {
  buildfire.notifications.confirm(
    {
      message: `Are you sure you want to delete the pin for this location?`,
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
        item.pinIndex = null;
        LocationsController.updateLocation(item.id, new Location(item))
          .then(() => {
            state.pinnedLocations = state.pinnedLocations.filter(elem => elem.id !== item.id);
            handlePinnedLocationEmptyState(false);
            triggerWidgetOnListViewUpdate();
            callback(item);
          })
          .catch(console.error);
      }
    }
  );
};

const getSettings = () => {
  SettingsController.getSettings().then((settings) => {
    state.settings = settings;
    patchListViewValues();
  }).catch(console.error);
};

const triggerWidgetOnListViewUpdate = () => {
  buildfire.messaging.sendMessageToWidget({
    cmd: 'sync',
    scope: 'intro'
  });
};

window.initListView = () => {
  pinnedLocationsList = new PinnedLocationsList('listview-pinned-location-items');
  listViewImagesCarousel = new buildfire.components.carousel.editor("#listview-carousel", []);

  listViewImagesCarousel.onAddItems = (items) => {
    state.settings.introductoryListView.images.push(...items.map((item) => ({ ...item, id: generateUUID() })));
    saveSettingsWithDelay();
  };
  listViewImagesCarousel.onItemChange = (item, index) => {
    const imageId = state.settings.introductoryListView.images[index]?.id;
    state.settings.introductoryListView.images[index] = { ...item, id: imageId };
    saveSettingsWithDelay();
  };
  listViewImagesCarousel.onDeleteItem = (item, index,) => {
    state.settings.introductoryListView.images = state.settings.introductoryListView.images.filter(
      (elem) => elem.id !== item.id
    );
    saveSettingsWithDelay();
  };
  listViewImagesCarousel.onOrderChange = (item, oldIndex, newIndex) => {
    const items = state.settings.introductoryListView.images;

    const tmp = items[oldIndex];

    if (oldIndex < newIndex) {
      for (let i = oldIndex + 1; i <= newIndex; i++) {
        items[i - 1] = items[i];
      }
    } else {
      for (let i = oldIndex - 1; i >= newIndex; i--) {
        items[i + 1] = items[i];
      }
    }
    items[newIndex] = tmp;

    state.settings.introductoryListView.images = items;
    saveSettingsWithDelay();
  };
  pinnedLocationsList.onDeleteItem = deletePinnedLocation;
  pinnedLocationsList.onOrderChange = (item, oldIndex, newIndex) => {
    state.pinnedLocations = pinnedLocationsList.items;
    const promiseChain = [];

    state.pinnedLocations.forEach((item, index) => {
      item.pinIndex = index + 1;
      promiseChain.push(LocationsController.updateLocation(item.id, new Location(item)));
    });

    Promise.all(promiseChain).then(() => {
      console.log('Successfully reordered pinned locations');
      triggerWidgetOnListViewUpdate();
    }).catch(console.error);
  };
  initListViewWysiwyg();
  getSettings();
  getPinnedLocations();
  loadAreaRadiusMap();
};
