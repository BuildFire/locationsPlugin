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
        SettingsController.saveSettingsWithDelay(state.settings);
      });
    }
  });
};

window.onShowListViewChanged = (e) => {
  state.settings.showIntroductoryListView = e.target.checked;
  SettingsController.saveSettingsWithDelay(state.settings);
};

window.onSortLocationsChanged = (sorting) => {
  if (!sorting) {
    return;
  }
  state.settings.introductoryListView.sorting = sorting;
  SettingsController.saveSettingsWithDelay(state.settings);
};

window.onShowLocationsModeChanged = (showMode) => {
  if (!showMode) {
    return;
  }

  const areaRadiusOptionsContainer = document.querySelector("#areaRadiusOptions-Container");
  if (showMode === "AreaRadius") {
    areaRadiusOptionsContainer?.classList?.remove('hidden');
  } else {
    areaRadiusOptionsContainer?.classList?.add('hidden');
  }

  if (state.settings.introductoryListView.searchOptions) {
    state.settings.introductoryListView.searchOptions.mode = showMode;
  } else {
    state.settings.introductoryListView.searchOptions = {
      mode: showMode,
      areaRadiusOptions: {}
    };
  }
  SettingsController.saveSettingsWithDelay(state.settings);
};

const patchListViewValues = () => {
  console.log(state.settings.introductoryListView.images);
  const showBtn = listViewSection.querySelector('#listview-show-introduction-btn');
  showBtn.checked = state.settings.showIntroductoryListView;
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
            SettingsController.triggerWidgetOnListViewUpdate();
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
    loadAreaRadiusMap(state);
  }).catch(console.error);
};

window.initListView = () => {
  pinnedLocationsList = new PinnedLocationsList('listview-pinned-location-items');
  listViewImagesCarousel = new buildfire.components.carousel.editor("#listview-carousel", []);

  listViewImagesCarousel.onAddItems = (items) => {
    state.settings.introductoryListView.images.push(...items.map((item) => ({ ...item, id: generateUUID() })));
    SettingsController.saveSettingsWithDelay(state.settings);
  };
  listViewImagesCarousel.onItemChange = (item, index) => {
    const imageId = state.settings.introductoryListView.images[index]?.id;
    state.settings.introductoryListView.images[index] = { ...item, id: imageId };
    SettingsController.saveSettingsWithDelay(state.settings);
  };
  listViewImagesCarousel.onDeleteItem = (item, index,) => {
    state.settings.introductoryListView.images = state.settings.introductoryListView.images.filter(
      (elem) => elem.id !== item.id
    );
    SettingsController.saveSettingsWithDelay(state.settings);
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
    SettingsController.saveSettingsWithDelay(state.settings);
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
      SettingsController.triggerWidgetOnListViewUpdate();
    }).catch(console.error);
  };
  initListViewWysiwyg();
  getSettings();
  getPinnedLocations();
};
