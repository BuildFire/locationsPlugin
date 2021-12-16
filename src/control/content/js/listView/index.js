/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
/* eslint-disable no-use-before-define */
import ListViewImagesList from "./listViewImagesList";
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

let listViewImagesList = null;
let pinnedLocationsList = null;

const initListViewWysiwyg = () => {
  tinymce.EditorManager.execCommand('mceRemoveEditor', true, 'listview-description-wysiwyg');

  tinymce.init({
    selector: "#listview-description-wysiwyg",
    init_instance_callback: (editor) => {
      editor.on('keyup', onDescriptionChanged);
    }
  });

  let timeoutId;
  function onDescriptionChanged(e) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      state.settings.introductoryListView.description = tinymce.activeEditor.getContent();
      saveSettings();
    }, 300);
  }
};

window.onDescriptionChanged = () => {
  console.log('Hello');
};

window.onShowListViewChanged = (e) => {
  state.settings.showIntroductoryListView = e.target.checked;
  saveSettings();
};

window.addListViewImages = () => {
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
      state.settings.introductoryListView.images.push(...locationImages.map((imageUrl) => ({ id: generateUUID(), imageUrl, action: null })));
      listViewImagesList.init(state.settings.introductoryListView.images);
      saveSettings();
    }
  );
};

window.onSortLocationsChanged = (sorting) => {
  if (!sorting) {
    return;
  }
  state.settings.introductoryListView.sorting = sorting;
  saveSettings();
};

const patchListViewValues = () => {
  const showBtn = listViewSection.querySelector('#listview-show-introduction-btn');
  showBtn.checked = state.settings.showIntroductoryListView;
  listViewImagesList.init(state.settings.introductoryListView.images);
  tinymce.activeEditor.setContent(state.settings.introductoryListView.description);
  const sortRadioBtns = listViewSection.querySelectorAll('input[name="sortLocationBy"]');
  for (const radio of sortRadioBtns) {
    if (radio.value === state.settings.introductoryListView.sorting) {
      radio.checked = true;
    }
  }
};

const deleteListViewImage = (item, index, callback) => {
  buildfire.notifications.confirm(
    {
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
        state.settings.introductoryListView.images = state.settings.introductoryListView.images.filter(
          (elem) => elem.id !== item.id
        );
        saveSettings();
        callback(item);
      }
    }
  );
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

const saveSettings = () => {
  SettingsController.saveSettings(state.settings).then().catch(console.error);
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
            callback(item);
          })
          .catch(console.error)
      }
    }
  );
  
}

const getSettings = () => {
  SettingsController.getSettings().then((settings) => {
    state.settings = settings;
    patchListViewValues();
  }).catch(console.error);
};

window.initListView = () => {
  listViewImagesList = new ListViewImagesList('listview-image-carousel-items');
  pinnedLocationsList = new PinnedLocationsList('listview-pinned-location-items');

  listViewImagesList.onDeleteItem = deleteListViewImage;
  listViewImagesList.onOrderChange = () => {
    state.settings.introductoryListView.images = listViewImagesList.sortableList.items;
    saveSettings();
  };
  pinnedLocationsList.onDeleteItem = deletePinnedLocation;
  initListViewWysiwyg();
  getSettings();
  getPinnedLocations();
};
