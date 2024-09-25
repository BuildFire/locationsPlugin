/* eslint-disable no-use-before-define */
/* eslint-disable no-restricted-syntax */
// This is the entry point of your plugin's settings control.
// Feel free to require any local or npm modules you've installed.
import buildfire from 'buildfire';
import Settings from '../../entities/Settings';
import authManager from '../../UserAccessControl/authManager';
import SettingsController from "./settings.controller";
import GlobalTagsListUI from './js/ui/globalTagsListUI';
import GlobalEditorsListUI from './js/ui/globalEditorsListUI';
import LocationEditingListUI from './js/ui/locationEditingListUI';
import DialogComponent from './js/ui/dialog/dialog';
import Locations from '../../repository/Locations';
import { getDisplayName } from './js/util/helpers';

const sidenavContainer = document.getElementById('sidenav-container');
const emptyState = document.getElementById('empty-state');

const templates = {};
const state = {
  settings: new Settings(),
  selectLocations: {
    locations: [],
    selected: [],
    filter: {},
    totalRecord: 0,
    pageIndex: 0,
    pageSize: 50,
    fetchingNextPage: false,
    fetchingEndReached: false,
  },
  editingLocations: {
    locations: [],
    filter: {},
    totalRecord: 0,
    pageIndex: 0,
    pageSize: 50,
    fetchingNextPage: false,
    fetchingEndReached: false,
  },
  dictionary: {
    hideSorting: "Hide User Controlled Sorting",
    allowSortByReverseAlphabetical: 'Allow Reverse Alphabetical Order',
    allowSortByNearest: 'Nearest to User Location',
    allowSortByPriceHighToLow: "Allow Price High to Low",
    allowSortByPriceLowToHigh: "Allow Price Low to High",
    allowSortByViews: "Allow by Views",
    allowSortByDate: "Allow by Date (New to old)",
    allowSortByRating: "Allow by Rating",
    allowFilterByArea: "Filter by Selected Area",
    hideOpeningHoursFilter: "Hide Opening Hours Filter",
    hidePriceFilter: "Hide Price Filter",
    allowFilterByLatest: "Filter by Latest",
    allowFilterByBookmarks: "Filter by Bookmarks",
    allowForLocations: "Allow Bookmark Location",
    allowForFilters: "Allow Bookmark Search"
  }
};

let globalTagsListUI = null;
let locationsEditorsListUI = null;
let locationEditingListUI = null;

const initChat = () => {
  const allowChat = document.querySelector('#allow-chat-btn');
  allowChat.checked = state.settings.chat.allowChat;
  allowChat.onchange = (e) => {
    state.settings.chat.allowChat = e.target.checked;
    saveSettingsWithDelay();
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
      const { value } = e.target;
      state.settings.sorting.defaultSorting = value;
      saveSettingsWithDelay();
    };
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

    if (key === 'allowSortByNearest') {
      handleDisableSortByNearest(state.settings.sorting[key]);
    }

    btn.onchange = (e) => {
      console.log(e.target.checked);
      state.settings.sorting[key] = e.target.checked;
      if (key === 'allowSortByNearest') {
        handleDisableSortByNearest(e.target.checked);
      }
      saveSettingsWithDelay();
    };

    sortingOptionsContainer.appendChild(switchBtn);
  }
};

const handleDisableSortByNearest = (allowSortByNearest) => {
  const distanceSortRadio = document.querySelector('#sorting-dist');
  const alphaSortRadio = document.querySelector('#sorting-alpha');

  if (!allowSortByNearest) {
    state.settings.sorting.defaultSorting = 'alphabetical';
    alphaSortRadio.checked = true;
    distanceSortRadio.disabled = true;
  } else {
    distanceSortRadio.disabled = false;
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
      saveSettingsWithDelay();
    };

    filterOptionsContainer.appendChild(switchBtn);
  }
};

const handleTagsEmptyState = () => {
  const emptyState = document.querySelector('#global-tags-empty-list');
  if (!state.settings.globalEditors.tags.length) {
    emptyState.innerHTML = `<h4>No Tags Found.</h4>`;
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }
};
const handleEditorsEmptyState = () => {
  const emptyState = document.querySelector('#global-editors-empty-list');
  if (!state.settings.globalEditors.users.length) {
    emptyState.innerHTML = `<h4>No Editors Found.</h4>`;
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }
};
const handleLocationsEditingEmptyState = () => {
  if (state.editingLocations.locations.length) return;
  const locationsContainer = document.querySelector('#location-editing-list');
  locationsContainer.innerHTML = '';
  locationsContainer.appendChild(createEmptyHolder('No Locations Found'));
};

const showLocationsEditingLoadingState = () => {
  const locationsContainer = document.querySelector('#location-editing-list');
  locationsContainer.innerHTML = '';
  locationsContainer.appendChild(createEmptyHolder('Loading..'));
};

const addGlobalTags = () => {
  buildfire.auth.showTagsSearchDialog(null, (err, result) => {
    if (err) return console.error(err);
    if (result) {
      const { globalEditors } = state.settings;
      globalEditors.tags = globalEditors.tags.concat(result.filter((t) => globalEditors.tags.findIndex((i) => i.id === t.id) < 0));
      saveSettingsWithDelay();
      handleTagsEmptyState();
      globalTagsListUI.init(globalEditors.tags);
    }
  });
};
const addGlobalEditors = () => {
  buildfire.auth.showUsersSearchDialog(null, (err, result) => {
    if (err) return console.log(err);

    if (result) {
      console.log("Selected users", result.users);
      const { globalEditors } = state.settings;
      globalEditors.users = globalEditors.users.concat(result.userIds.filter((t) => globalEditors.users.findIndex((i) => i === t) < 0));

      buildfire.auth.getUserProfiles({ userIds: globalEditors.users }, (err, _users) => {
        if (err) return console.error(err);
        if (globalEditors.users.length !== _users.length) console.warn('Not all users are retrieved');
        handleEditorsEmptyState();
        locationsEditorsListUI.init(_users);
      });
      saveSettingsWithDelay();
    }
  });
};

const addLocationTags = (location, callback) => {
  buildfire.auth.showTagsSearchDialog(null, (err, result) => {
    if (err) return console.error(err);
    if (result?.length) {
      const { tags } = location.editingPermissions;
      location.editingPermissions.tags = tags.concat(result.filter((item) => tags.findIndex((i) => i.id === item.id) < 0));

      const payload = {
        $set: {
          lastUpdatedOn: new Date(),
          editingPermissions: location.editingPermissions
        }
      };

      Locations
        .update(location.id, payload)
        .then((result) => {
          callback(null, { id: result.id, ...result.data });
        })
        .catch((err) => {
          console.error(err);
        });
    }
  });
};
const addLocationEditors = (location, callback) => {
  buildfire.auth.showUsersSearchDialog(null, (err, result) => {
    if (err) return console.log(err);

    if (result && result.userIds.length) {
      const { editors } = location.editingPermissions;
      location.editingPermissions.editors = editors.concat(result.userIds.filter((item) => editors.indexOf(item) < 0));

      const payload = {
        $set: {
          lastUpdatedOn: new Date(),
          editingPermissions: location.editingPermissions
        }
      };

      Locations
        .update(location.id, payload)
        .then((result) => {
          callback(null, { id: result.id, ...result.data });
        })
        .catch((err) => {
          console.error(err);
        });
    }
  });
};

const deleteGlobalEditor = (item, index, callback) => {
  buildfire.notifications.confirm(
    {
      title: 'Delete Global Editor',
      message: `Are you sure you want to delete ${getDisplayName(item)} global editor?`,
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
        const { globalEditors } = state.settings;
        globalEditors.users = globalEditors.users.filter((elem) => elem !== item._id);
        saveSettingsWithDelay();
        handleEditorsEmptyState();
        callback(item);
      }
    }
  );
};

const deleteGlobalTag = (item, index, callback) => {
  buildfire.notifications.confirm(
    {
      title: 'Delete Global Tag',
      message: `Are you sure you want to delete ${item.tagName} global tag?`,
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
        const { globalEditors } = state.settings;
        globalEditors.tags = globalEditors.tags.filter((elem) => elem.id !== item.id);
        saveSettingsWithDelay();
        handleTagsEmptyState();
        callback(item);
      }
    }
  );
};

const resetSelectLocations = () => {
  state.selectLocations.locations = [];
  state.selectLocations.selected = [];
  state.selectLocations.filter = {};
  state.selectLocations.totalRecord = 0;
  state.selectLocations.pageIndex = 0;
  state.selectLocations.fetchingNextPage = false;
  state.selectLocations.fetchingEndReached = false;
};

const resetEditingLocations = () => {
  state.editingLocations.locations = [];
  state.editingLocations.filter = {};
  state.editingLocations.totalRecord = 0;
  state.editingLocations.pageIndex = 0;
  state.editingLocations.fetchingNextPage = false;
  state.editingLocations.fetchingEndReached = false;
};

const searchLocations = (options = {}) => {
  options.recordCount = true;
  return Locations.search(options);
};

const removeAsEditingLocations = (location, index, callback) => {
  buildfire.notifications.confirm(
    {
      title: 'Remove Editing Permissions',
      message: `Are you sure you want to remove the editing permissions for this location?`,
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

        const payload = {
          $set: {
            lastUpdatedOn: new Date(),
            editingPermissions: {
              active: false,
              tags: [],
              editors: []
            }
          }
        };

        Locations
          .update(location.id, payload)
          .then((result) => {
            state.editingLocations.locations = state.editingLocations.locations.filter((item) => item.id !== result.id);
            handleLocationsEditingEmptyState();
            callback({ id: result.id, ...result.data });
          })
          .catch((err) => {
            console.error(err);
          });
      }
    }
  );
};

const selectAsEditingLocations = () => {
  if (!state.selectLocations.selected.length) return;

  showLocationsEditingLoadingState();

  const promiseChain = [];
  const { selectLocations } = state;

  selectLocations.selected.forEach((id) => {
    const location = selectLocations.locations.find((l) => l.id === id);
    location.editingPermissions.active = true;
    const payload = {
      $set: {
        lastUpdatedOn: new Date(),
        editingPermissions: location.editingPermissions
      }
    };

    promiseChain.push(Locations.update(id, payload));
  });

  Promise.all(promiseChain)
    .then((result) => {
      console.log('result after update: ', result.map((u) => ({ ...u.data, id: u.id })));
      state.editingLocations.locations = [...result.map((u) => ({ ...u.data, id: u.id })), ...state.editingLocations.locations];
      locationEditingListUI.init(state.editingLocations.locations);
    })
    .catch((err) => {
      console.error(err);
    });
};

const loadSelectLocations = () => {
  const { selectLocations } = state;
  const options = {
    sort: { "_buildfire.index.text": -1 },
    filter: {
      $or: [
        { editingPermissions: { $exists: false } },
        { 'editingPermissions.active': false }
      ]
    },
    page: selectLocations.pageIndex,
    pageSize: selectLocations.pageSize
  };

  if (Object.keys(selectLocations.filter).length > 0) {
    Object.assign(options.filter, selectLocations.filter);
  }

  searchLocations(options)
    .then(({ result, totalRecord }) => {
      selectLocations.locations = selectLocations.locations.concat(result || []);
      selectLocations.totalRecord = totalRecord || 0;
      selectLocations.fetchingNextPage = false;
      selectLocations.fetchingEndReached = selectLocations.locations.length >= totalRecord;
      renderSelectLocations();
    });
};

const loadMoreSelectLocations = () => {
  const { selectLocations } = state;
  if (selectLocations.fetchingNextPage || selectLocations.fetchingEndReached || !selectLocations.locations.length) return;
  selectLocations.fetchingNextPage = true;
  selectLocations.pageIndex += 1;
  loadSelectLocations();
};

const loadMoreEditingLocations = () => {
  const { editingLocations } = state;
  if (editingLocations.fetchingNextPage || editingLocations.fetchingEndReached || !editingLocations.locations.length) return;
  editingLocations.fetchingNextPage = true;
  editingLocations.pageIndex += 1;
  loadEditingLocations();
};

const loadEditingLocations = () => {
  const { editingLocations } = state;

  const options = {
    sort: { "_buildfire.index.text": -1 },
    filter: {
      'editingPermissions.active': true
    },
    page: editingLocations.pageIndex,
    pageSize: editingLocations.pageSize
  };

  if (Object.keys(editingLocations.filter).length > 0) {
    Object.assign(options.filter, editingLocations.filter);
  }

  searchLocations(options)
    .then(({ result, totalRecord }) => {
      editingLocations.locations = editingLocations.locations.concat(result || []);
      editingLocations.totalRecord = totalRecord || 0;
      editingLocations.fetchingNextPage = false;
      editingLocations.fetchingEndReached = editingLocations.locations.length >= totalRecord;
      locationEditingListUI.init(editingLocations.locations);
      handleLocationsEditingEmptyState();
    });
};

const cropImage = (url, options) => {
  if (!url) {
    return "";
  }
  return buildfire.imageLib.cropImage(url, options);
};

const createEmptyHolder = (message = 'No Data', classes = '') => {
  const div = document.createElement("div");
  let className = 'empty-state margin-top-fifteen';
  if (classes) className = className.concat(` ${classes}`);

  div.className = className;
  div.innerHTML = `<hr class="none"><h4>${message}.</h4>`;
  return div;
};

const createDialogLocationsList = (locations, locationsContainer) => {
  const { selectLocations } = state;

  locationsContainer.innerHTML = '';

  if (locations.length === 0) {
    locationsContainer.appendChild(createEmptyHolder('No Locations Found'));
    return;
  }
  // eslint-disable-next-line no-restricted-syntax
  for (let i = 0; i < locations.length; i++) {
    const _location = locations[i];
    const selectLocationItem = createTemplate("selectLocationItemTemplate");
    const categoryIcon = selectLocationItem.querySelector(".location-icon");
    const locationName = selectLocationItem.querySelector(".location-name");
    const locationAddress = selectLocationItem.querySelector(".location-address");
    const checkboxInput = selectLocationItem.querySelector('.checkbox-input');
    const checkboxLabel = selectLocationItem.querySelector('.checkbox-label');

    selectLocationItem.id = _location.id;

    const imageIcon = categoryIcon.querySelector(".image-icon");
    imageIcon.classList.remove("hidden");
    imageIcon.src = cropImage(_location.listImage, {
      width:  40,
      height: 40,
    });

    locationName.innerHTML = _location.title;
    locationAddress.innerHTML = _location.formattedAddress;

    checkboxInput.id = _location.id;
    checkboxLabel.htmlFor = _location.id;
    checkboxInput.onchange = (e) => {
      if (e.target.checked) {
        selectLocations.selected.push(e.target.id);
      } else {
        selectLocations.selected = selectLocations.selected.filter((locationId) => locationId !== e.target.id);
      }
    };
    locationsContainer.appendChild(selectLocationItem);
  }
};

const renderSelectLocations = () => {
  const { selectLocations } = state;
  const categoriesListContainer = document.querySelector('.select-locations-list');
  createDialogLocationsList(selectLocations.locations, categoriesListContainer);
};

const openSelectLocationsDialog = () => {
  const locationsListContainer = document.createElement("div");
  locationsListContainer.classList.add("select-locations-list");
  locationsListContainer.appendChild(createEmptyHolder('Loading...'));

  const searchBox = createTemplate('searchBoxTemplate');
  const dialogContent = document.createElement('div');
  dialogContent.appendChild(searchBox);
  dialogContent.appendChild(locationsListContainer);

  const selectLocationDialog = new DialogComponent("dialogComponent", dialogContent);
  selectLocationDialog.onScroll = (e) => {
    if (e.target.scrollTop + e.target.offsetHeight > locationsListContainer.offsetHeight) {
      loadMoreSelectLocations();
    }
  };

  let timeoutId;
  const searchInput = dialogContent.querySelector('.search-input');
  searchInput.onkeyup = (e) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const searchValue = e.target.value;
      locationsListContainer.innerHTML = '';
      locationsListContainer.appendChild(createEmptyHolder('Loading...'));
      resetSelectLocations();
      if (searchValue) {
        state.selectLocations.filter["_buildfire.index.text"] = { $regex: searchValue, $options: "i" };
      }
      loadSelectLocations();
    }, 300);
  };

  selectLocationDialog.showDialog(
    {
      title: 'Select Locations',
      saveText: 'Add Locations',
      hideDelete: false,
    },
    (e) => {
      e.preventDefault();
      selectAsEditingLocations();
      selectLocationDialog.close(e);
    }
  );

  resetSelectLocations();
  loadSelectLocations();
};

const openLocationPermsDialog = (location) => {
  let hasChanged = false;

  const handleLocationsTagsEmptyState = () => {
    if (!editingPermissions.tags.length) {
      locationTagsListContainer.appendChild(createEmptyHolder('No Tags Found', 'min-height-unset padding-2'));
    }
  };
  const handleLocationsEditorsEmptyState = () => {
    if (!editingPermissions.editors.length) {
      locationEditorsListContainer.innerHTML = '';
      locationEditorsListContainer.appendChild(createEmptyHolder('No Users Found', 'min-height-unset padding-2'));
    }
  };
  const deleteLocationTag = (item, index, callback) => {
    editingPermissions.tags = editingPermissions.tags.filter((elem) => elem.id !== item.id);
    hasChanged = true;
    handleLocationsTagsEmptyState();
    callback(item);
  };
  const deleteLocationEditor = (item, index, callback) => {
    editingPermissions.editors = editingPermissions.editors.filter((elem) => elem !== item._id);
    hasChanged = true;
    handleLocationsEditorsEmptyState();
    callback(item);
  };


  const locationTagsListContainer = document.createElement('div');
  const tagsContainerTitle = document.createElement('h5');

  locationTagsListContainer.id = 'location-tags-list';
  tagsContainerTitle.textContent = 'Location Editor Tags';

  const locationEditorsListContainer = document.createElement('div');
  const editorsContainerTitle = document.createElement('h5');

  editorsContainerTitle.textContent = 'Location Editors';
  locationEditorsListContainer.id = 'location-editors-list';
  locationEditorsListContainer.appendChild(createEmptyHolder('Loading..'));

  const infoNote = document.createElement('p');
  infoNote.className = 'info-note pre-line';
  infoNote.textContent = 'Users that have the tags included here will still be editors even if they haven\'t been specifically added.\n\nThe location editing permissions will be removed if all tags and editors are removed.';

  const dialogContent = document.createElement('div');
  dialogContent.appendChild(infoNote);
  dialogContent.appendChild(tagsContainerTitle);
  dialogContent.appendChild(locationTagsListContainer);
  dialogContent.appendChild(editorsContainerTitle);
  dialogContent.appendChild(locationEditorsListContainer);

  const selectLocationDialog = new DialogComponent("dialogComponent", dialogContent);

  const editingPermissions = JSON.parse(JSON.stringify(location.editingPermissions));
  if (editingPermissions.tags.length) {
    const locationTagsListUI = new GlobalTagsListUI('location-tags-list');
    locationTagsListUI.onDeleteItem = deleteLocationTag;
    locationTagsListUI.init(editingPermissions.tags);
  } else {
    handleLocationsTagsEmptyState();
  }

  if (editingPermissions.editors.length) {
    buildfire.auth.getUserProfiles({ userIds: editingPermissions.editors }, (err, users) => {
      if (err) return console.error(err);
      if (users.length !== editingPermissions.editors.length) console.error('Not all users are retrieved');
      const locationEditorsListUI = new GlobalEditorsListUI('location-editors-list');
      locationEditorsListUI.onDeleteItem = deleteLocationEditor;
      locationEditorsListUI.init(users);
    });
  } else {
    handleLocationsEditorsEmptyState();
  }

  selectLocationDialog.showDialog(
    {
      title: location.title,
      saveText: 'OK',
      hideDelete: false,
      primarySaveBtn: true
    },
    (e) => {
      e.preventDefault();
      selectLocationDialog.close(e);
      if (hasChanged) {
        showLocationsEditingLoadingState();
        const payload = {
          $set: {
            lastUpdatedOn: new Date(),
            editingPermissions
          }
        };

        Locations
          .update(location.id, payload)
          .then((result) => {
            const index = state.editingLocations.locations.findIndex((i) => i.id === result.id);
            state.editingLocations.locations[index] = { id: result.id, ...result.data };
            locationEditingListUI.init(state.editingLocations.locations);
          })
          .catch((err) => {
            console.error(err);
          });
      }
    }
  );
};
const initLocationEditing = () => {
  const enableLocationEditingBtn = document.querySelector('#enable-location-editing-btn');
  const addLocationsButton = document.querySelector('#addLocationsButton');
  const locationsListContainer = document.querySelector('#location-editing-list');
  const searchInput = document.querySelector('#location-editing-search-input');
  const defaultLocationsTimeRadios = document.querySelectorAll('input[name="defaultLocationTime"]');
  let timeoutId;


  for (const radio of defaultLocationsTimeRadios) {
    if (radio.value === state.settings.locationEditors.time) {
      radio.checked = true;
    }
    radio.onchange = (e) => {
      const { value } = e.target;
      state.settings.locationEditors.time = value;
      saveSettingsWithDelay();
    };
  }

  enableLocationEditingBtn.checked = state.settings.locationEditors.enabled;
  enableLocationEditingBtn.onchange = (e) => {
    state.settings.locationEditors.enabled = e.target.checked;
    saveSettingsWithDelay();
  };

  searchInput.onkeyup = (e) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const searchValue = e.target.value;
      resetEditingLocations();
      showLocationsEditingLoadingState();
      if (searchValue) {
        state.editingLocations.filter["_buildfire.index.text"] = { $regex: searchValue, $options: "i" };
      }
      loadEditingLocations();
    }, 300);
  };

  addLocationsButton.onclick = openSelectLocationsDialog;
  locationsListContainer.onscroll = (e) => {
    if (e.target.scrollTop + e.target.offsetHeight > locationsListContainer.offsetHeight) {
      loadMoreEditingLocations();
    }
  };

  locationEditingListUI = new LocationEditingListUI('location-editing-list');
  locationEditingListUI.onAddUsers = addLocationEditors;
  locationEditingListUI.onAddTags = addLocationTags;
  locationEditingListUI.onDeleteItem = removeAsEditingLocations;
  locationEditingListUI.onUpdateItem = openLocationPermsDialog;

  showLocationsEditingLoadingState();
  resetEditingLocations();
  loadEditingLocations();
};

const initGlobalEntries = () => {
  const allowPriceRangeCheckbox = document.querySelector('#allowAddingPriceRange');
  const allowOpenHoursCheckbox = document.querySelector('#allowAddingOpenHours');
  const allowNewEntriesRadios = document.querySelectorAll('input[name="allowNewEntries"]');
  const allowNewPhotosRadios = document.querySelectorAll('input[name="allowNewPhotos"]');
  const addLocationsTagsContainer = document.querySelector('#addingLocationsUserTags');
  const addPhotosTagsContainer = document.querySelector('#addingPhotosUserTags');

  const { globalEntries } = state.settings;
  const tagsInputManager = {
    init(element, tags) {
      const tagsInput = new buildfire.components.control.userTagsInput(`#${element.id}`, {
        languageSettings: {
          placeholder: 'User Tags',
        },
        settings:{
          allowUserInput: false,
        }
      });

      tagsInput.onUpdate = (data) => {
        if (data && data.tags) {
          tags.length = 0;
          tags.push(...data.tags.map((tag) => ({
            id: tag.id,
            tagName: tag.tagName,
            value: tag.value,
          })));
          saveSettingsWithDelay();
        }
      };
      tagsInput.set(tags);
    },
    clear(element) {
      element.innerHTML = '';
    }
  };

  for (const radio of allowNewEntriesRadios) {
    if (radio.value === globalEntries.locations.allowAdding) {
      radio.checked = true;
    }

    if (globalEntries.locations.allowAdding === 'limited') {
      tagsInputManager.init(
        addLocationsTagsContainer,
        globalEntries.locations.tags
      );
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      globalEntries.locations.allowAdding = value;

      tagsInputManager.clear(addLocationsTagsContainer);

      if (value === 'limited') {
        tagsInputManager.init(
          addLocationsTagsContainer,
          globalEntries.locations.tags
        );
      }
      saveSettingsWithDelay();
    };
  }

  for (const radio of allowNewPhotosRadios) {
    if (radio.value === globalEntries.photos.allowAdding) {
      radio.checked = true;
    }

    if (globalEntries.photos.allowAdding === 'limited') {
      tagsInputManager.init(
        addPhotosTagsContainer,
        globalEntries.photos.tags
      );
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      globalEntries.photos.allowAdding = value;

      tagsInputManager.clear(addPhotosTagsContainer);

      if (value === 'limited') {
        tagsInputManager.init(
          addPhotosTagsContainer,
          globalEntries.photos.tags
        );
      }

      saveSettingsWithDelay();
    };
  }

  allowPriceRangeCheckbox.checked = globalEntries.allowPriceRange;
  allowPriceRangeCheckbox.onchange = (e) => {
    globalEntries.allowPriceRange = e.target.checked;
    saveSettingsWithDelay();
  };

  allowOpenHoursCheckbox.checked = globalEntries.allowOpenHours;
  allowOpenHoursCheckbox.onchange = (e) => {
    globalEntries.allowOpenHours = e.target.checked;
    saveSettingsWithDelay();
  };
};

const initGlobalEditing = () => {
  const enableGlobalEditingBtn = document.querySelector('#enable-global-editing-btn');
  const addGlobalTagsButton = document.querySelector('#addGlobalTagsButton');
  const addGlobalEditorsButton = document.querySelector('#addGlobalEditorsButton');
  const allowLocationCreatorsCheckbox = document.querySelector('#allowLocationCreatorsToEdit');

  const { tags, users } = state.settings.globalEditors;
  const { globalEditors } = state.settings;

  allowLocationCreatorsCheckbox.checked = globalEditors.allowLocationCreatorsToEdit;
  allowLocationCreatorsCheckbox.onchange = (e) => {
    globalEditors.allowLocationCreatorsToEdit = e.target.checked;
    saveSettingsWithDelay();
  };

  addGlobalTagsButton.addEventListener('click', addGlobalTags);
  addGlobalEditorsButton.addEventListener('click', addGlobalEditors);
  enableGlobalEditingBtn.checked = state.settings.globalEditors.enabled;
  enableGlobalEditingBtn.onchange = (e) => {
    state.settings.globalEditors.enabled = e.target.checked;
    saveSettingsWithDelay();
  };

  globalTagsListUI = new GlobalTagsListUI('global-tags-list');
  globalTagsListUI.onDeleteItem = deleteGlobalTag;
  globalTagsListUI.init(tags);
  handleTagsEmptyState();

  locationsEditorsListUI = new GlobalEditorsListUI('global-editors-list');
  locationsEditorsListUI.onDeleteItem = deleteGlobalEditor;
  if (users.length) {
    buildfire.auth.getUserProfiles({ userIds: users }, (err, _users) => {
      if (err) return console.error(err);
      if (users.length !== _users.length) console.error('Not all users are retrieved');
      locationsEditorsListUI.init(_users);
    });
  }
  handleEditorsEmptyState();
};

const iniBookmarks = () => {
  const bookmarkSettings = new Settings().bookmarks;
  const bookmarkOptionsContainer = document.querySelector('#bookmarks-settings-container');
  const enableBookmarksBtn = document.querySelector('#enable-bookmarks-btn');
  bookmarkOptionsContainer.innerHTML = '';

  enableBookmarksBtn.checked = state.settings.bookmarks.enabled;
  enableBookmarksBtn.onchange = (e) => {
    state.settings.bookmarks.enabled = e.target.checked;
    saveSettingsWithDelay();
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
      saveSettingsWithDelay();
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
    saveSettingsWithDelay();
  };

  enableMapInitialAreaBtn.checked = state.settings.map?.initialArea;
  enableMapInitialAreaBtn.onchange = (e) => {
    state.settings.map.initialArea = e.target.checked;
    saveSettingsWithDelay();
  };

  // enableOfflineAreaSelectionBtn.checked = state.settings.map?.offlineAreaSelection;
  // enableOfflineAreaSelectionBtn.onchange = (e) => {
  //   state.settings.map.offlineAreaSelection = e.target.checked;
  //   saveSettingsWithDelay();
  // };

  // Distance Units Selection
  for (const radio of distanceUnitsRadios) {
    if (radio.value === state.settings.measurementUnit) {
      radio.checked = true;
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      state.settings.measurementUnit = value;
      saveSettingsWithDelay();
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

  if (state.settings.map.initialAreaDisplayAddress) {
    searchBoxElem.value = state.settings.map.initialAreaDisplayAddress;
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
    state.settings.map.initialAreaDisplayAddress = place.formatted_address;
    saveSettingsWithDelay();
  });

  marker.addListener("dragend", (e) => {
    map.setCenter(e.latLng);
    geoCoder.geocode(
      { location: { lat: e.latLng.lat(), lng: e.latLng.lng() } },
      (results, status) => {
        console.log(results);
        if (status === "OK") {
          if (results[0]) {
            state.settings.map.initialAreaDisplayAddress = results[0].formatted_address;
            state.settings.map.initialAreaCoordinates.lat = e.latLng.lat();
            state.settings.map.initialAreaCoordinates.lng = e.latLng.lng();
            searchBoxElem.value = results[0].formatted_address;
            saveSettingsWithDelay();
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
    // case 'chat':
    //   setActiveSidenavTab('chat');
    //   navigate('chat', () => {
    //     initChat()
    //   });
    //   break;
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
    case 'bookmarks':
      setActiveSidenavTab('bookmarks');
      navigate('bookmarks', () => {
        iniBookmarks();
      });
      break;
    case 'globalEntries':
      setActiveSidenavTab('global-entries');
      navigate('globalEntries', () => {
        initGlobalEntries();
      });
      break;
    case 'globalEditing':
      setActiveSidenavTab('global-editing');
      navigate('globalEditing', () => {
        initGlobalEditing();
      });
      break;
    case 'locationEditing':
      setActiveSidenavTab('location-editing');
      navigate('locationEditing', () => {
        initLocationEditing();
      });
      break;
    default:
      setActiveSidenavTab('sorting');
      navigate('sorting');
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
  SettingsController.saveSettings(state.settings)
    .then(triggerWidgetOnDesignUpdate).catch(console.error);
};

const getSettings = () => {
  showLoading();
  SettingsController.getSettings().then((settings) => {
    state.settings = settings;
    onSidenavChange('sorting');
    hideLoading();
  }).catch(console.error);
};

const showLoading = () => {
  sidenavContainer.classList.add('hidden');
  emptyState.classList.remove('hidden');
};

const hideLoading = () => {
  emptyState.classList.add('hidden');
  sidenavContainer.classList.remove('hidden');
};

const triggerWidgetOnDesignUpdate = () => {
  buildfire.messaging.sendMessageToWidget({
    cmd: 'sync',
    scope: 'settings'
  });
};

const init = () => {
  getSettings();
};

authManager.enforceLogin(init);
