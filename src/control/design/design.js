/* eslint-disable no-use-before-define */
/* eslint-disable no-restricted-syntax */
// This is the entry point of your plugin's design control.
// Feel free to require any local or npm modules you've installed.
//
import buildfire from 'buildfire';
import Settings from '../../entities/Settings';
import authManager from '../../UserAccessControl/authManager';
import DesignController from "./design.controller";

const mainContainer = document.getElementById('main-container');
const emptyState = document.getElementById('empty-state');
const state = {
  settings: new Settings()
};

const render = () => {
  const listViewPositionRadios = document.querySelectorAll('input[name="listViewPosition"]');
  const defaultListViewStyleRadios = document.querySelectorAll('input[name="defaultListViewStyle"]');
  const defaultMapStyleRadios = document.querySelectorAll('input[name="defaultMapStyle"]');
  const defaultMapTypeRadios = document.querySelectorAll('input[name="defaultMapType"]');
  const mapPositionRadios = document.querySelectorAll('input[name="mapPosition"]');
  const enableMapTerrainViewBtn = document.querySelector('#enable-map-terrain-view-btn');
  const enableQuickFilterBtn = document.querySelector('#enable-quick-filter-btn');
  const allowMapStyleSelectionBtn = document.querySelector('#allow-map-style-selection-btn');
  const showCategoryOnLocDetailsBtn = document.querySelector('#show-category-on-loc-details-btn');

  for (const radio of listViewPositionRadios) {
    if (radio.value === state.settings.design?.listViewPosition) {
      radio.checked = true;
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      state.settings.design.listViewPosition = value;
      saveSettings();
    };
  }

  for (const radio of defaultListViewStyleRadios) {
    if (radio.value === state.settings.design?.listViewStyle) {
      radio.checked = true;
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      state.settings.design.listViewStyle = value;
      saveSettings();
    };
  }

  for (const radio of defaultMapStyleRadios) {
    if (radio.value === state.settings.design?.defaultMapStyle) {
      radio.checked = true;
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      state.settings.design.defaultMapStyle = value;
      saveSettings();
    };
  }

  for (const radio of defaultMapTypeRadios) {
    if (radio.value === state.settings.design?.defaultMapType) {
      radio.checked = true;
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      state.settings.design.defaultMapType = value;
      saveSettings();
    };
  }

  for (const radio of mapPositionRadios) {
    if (radio.value === state.settings.design?.detailsMapPosition) {
      radio.checked = true;
    }

    radio.onchange = (e) => {
      const { value } = e.target;
      state.settings.design.detailsMapPosition = value;
      saveSettings();
    };
  }

  enableMapTerrainViewBtn.checked = state.settings.design.enableMapTerrainView;
  enableMapTerrainViewBtn.onchange = (e) => {
    state.settings.design.enableMapTerrainView = e.target.checked;
    saveSettings();
  };

  enableQuickFilterBtn.checked = state.settings.design.enableCategoriesQuickFilter;
  enableQuickFilterBtn.onchange = (e) => {
    state.settings.design.enableCategoriesQuickFilter = e.target.checked;
    saveSettings();
  };

  allowMapStyleSelectionBtn.checked = state.settings.design.allowStyleSelection;
  allowMapStyleSelectionBtn.onchange = (e) => {
    state.settings.design.allowStyleSelection = e.target.checked;
    saveSettings();
  };

  showCategoryOnLocDetailsBtn.checked = state.settings.design.showDetailsCategory;
  showCategoryOnLocDetailsBtn.onchange = (e) => {
    state.settings.design.showDetailsCategory = e.target.checked;
    saveSettings();
  };
};

const saveSettings = () => {
  DesignController.saveSettings(state.settings)
    .then(triggerWidgetOnDesignUpdate).catch(console.error);
};

const getSettings = () => {
  showLoading();
  DesignController.getSettings().then((settings) => {
    state.settings = settings;
    render();
    hideLoading();
  }).catch(console.error);
};

const showLoading = () => {
  mainContainer.classList.add('hidden');
  emptyState.classList.remove('hidden');
};

const hideLoading = () => {
  emptyState.classList.add('hidden');
  mainContainer.classList.remove('hidden');
};

const triggerWidgetOnDesignUpdate = () => {
  buildfire.messaging.sendMessageToWidget({
    cmd: 'sync',
    scope: 'design'
  });
};

const init = () => {
  getSettings();
};

authManager.enforceLogin(init);
