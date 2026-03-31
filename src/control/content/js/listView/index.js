/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
import SettingsController from "./controller";
import LocationsController from "../locations/controller";
import { generateUUID } from "../../utils/helpers";
import PinnedLocationsList from "./pinnedLocationsList";
import Location from "../../../../entities/Location";
import loadAreaRadiusMap from "./introMap";
import state from "../../state";
import constants from "../../../../widget/js/constants";
import CpDropdown from "../../../../shared/CpDropdown";

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

window.onShowListViewChanged = (value) => {
  state.settings.introductoryListView.visibilityOptions.value = value;
  saveSettingsWithDelay();

  const introVisibilityTagsSelection = document.querySelector("#introVisibilityTagsSelection");
  if (value === constants.IntroViewVisibilityOptions.TAGS) {
    introVisibilityTagsSelection?.classList?.remove('hidden');
  } else {
    introVisibilityTagsSelection?.classList?.add('hidden');
  }
};

const onSortLocationsChanged = (sorting) => {
  if (!sorting) {
    return;
  }
  state.settings.introductoryListView.sorting = sorting.value;
  saveSettingsWithDelay();
};

const onShowLocationsModeChanged = (showMode) => {
  const areaRadiusOptionsContainer = document.querySelector("#areaRadiusOptionsContainer");
  if (showMode.value === constants.SearchLocationsModes.AreaRadius) {
    areaRadiusOptionsContainer?.classList?.remove('hidden');
  } else {
    areaRadiusOptionsContainer?.classList?.add('hidden');
  }
  const locationSourceNote = document.querySelector("#locationSourceNote");
  if (showMode.value === constants.SearchLocationsModes.MyLocations) {
    locationSourceNote?.classList?.remove('hidden');
  } else {
    locationSourceNote?.classList?.add('hidden');
  }

  if (state.settings.introductoryListView.searchOptions) {
    state.settings.introductoryListView.searchOptions.mode = showMode.value;
  } else {
    state.settings.introductoryListView.searchOptions = { mode: showMode.value };
  }

  saveSettingsWithDelay();
};

const initIntroDropDowns = () => {
  const sourceDropdown = new CpDropdown('#locationsSourceDropdown', {
    items: [
      { label: 'All Locations', value: constants.SearchLocationsModes.All, id: constants.SearchLocationsModes.All },
      { label: "User's Position", value: constants.SearchLocationsModes.UserPosition, id: constants.SearchLocationsModes.UserPosition },
      { label: 'Local Area', value: constants.SearchLocationsModes.AreaRadius, id: constants.SearchLocationsModes.AreaRadius },
      { label: 'My Locations', value: constants.SearchLocationsModes.MyLocations, id: constants.SearchLocationsModes.MyLocations }
    ],
    dropToTop: true,
    selectedId: state.settings.introductoryListView.searchOptions?.mode || constants.SearchLocationsModes.All,
    handleSelect: onShowLocationsModeChanged,
  });

  const sortDropdown = new CpDropdown('#sortLocationsDropdown', {
    items: [
      { label: 'Distance', value: constants.SortingOptions.Distance, id: constants.SortingOptions.Distance },
      { label: 'Alphabetical', value: constants.SortingOptions.Alphabetical, id: constants.SortingOptions.Alphabetical },
      { label: 'Newest', value: constants.SortingOptions.Newest, id: constants.SortingOptions.Newest }
    ],
    dropToTop: true,
    selectedId: state.settings.introductoryListView.sorting || constants.SortingOptions.Distance,
    handleSelect: onSortLocationsChanged,
  });
}

const patchListViewValues = () => {
  console.log(state.settings.introductoryListView.images);
  listViewImagesCarousel.loadItems(state.settings.introductoryListView.images);
  const sortRadioBtns = listViewSection.querySelectorAll('input[name="sortLocationBy"]');
  for (const radio of sortRadioBtns) {
    if (radio.value === state.settings.introductoryListView.sorting) {
      radio.checked = true;
    }
  }
  const searchOptionsRadioBtns = listViewSection.querySelectorAll('input[name="searchOptions"]');
  for (const radio of searchOptionsRadioBtns) {
    if (radio.value === state.settings.introductoryListView.searchOptions?.mode) {
      radio.checked = true;
    }
  }
  const introVisibilityRadioBtns = listViewSection.querySelectorAll('input[name="introVisibility"]');
  for (const radio of introVisibilityRadioBtns) {
    if (radio.value === state.settings.introductoryListView.visibilityOptions?.value) {
      radio.checked = true;
      if (radio.value === constants.IntroViewVisibilityOptions.TAGS) {
        const introVisibilityTagsSelection = document.querySelector("#introVisibilityTagsSelection");
        introVisibilityTagsSelection?.classList?.remove('hidden');
      }
    }
  }

  const userTagsInput = new buildfire.components.control.userTagsInput("#introVisibilityTagsSelection", {
    languageSettings: {
      placeholder: "User Tags"
    }
  });
  userTagsInput.onUpdate = (data) => {
    state.settings.introductoryListView.visibilityOptions.tags = data.tags;
    saveSettingsWithDelay();
  }
  userTagsInput.append(state.settings.introductoryListView.visibilityOptions.tags);

  initIntroDropDowns();
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
    loadAreaRadiusMap();
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
  state.maps.onBoundsChange = saveSettingsWithDelay;
  initListViewWysiwyg();
  getSettings();
  getPinnedLocations();
};
