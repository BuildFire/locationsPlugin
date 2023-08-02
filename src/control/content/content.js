import buildfire from 'buildfire';
import authManager from '../../UserAccessControl/authManager';
import Analytics from '../../utils/analytics';
import { locationsAiSeeder } from './js/locations';

import './js/categories';
import './js/locations';
import './js/listView';
import contentController from './content.controller';
import state from './state';

const templates = {};

const createLoadingState = () => {
  const div = document.createElement("div");
  div.className = 'empty-state';
  div.innerHTML = `<h4>Loading...</h4>`;
  return div;
};

const validateGoogleApiKey = () => {
  const googleApiKeyMessage = document.getElementById('google-api-key-message');
  buildfire.getContext((error, context) => {
    if (!context.apiKeys.googleMapKey) {
      googleApiKeyMessage.classList.remove('hidden');
    } else {
      googleApiKeyMessage.classList.add('hidden');
    }
  });
};

/** template management start */
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
    if (callback) {
      callback();
    }
  });
};

const setActiveSidenavTab = (section) => {
  const sidenav = document.querySelector('#sidenav');
  for (const tab of sidenav.childNodes) {
    tab.querySelector('a').classList.remove('active');
  }

  sidenav.querySelector(`#${section}-tab`).firstChild.classList.add('active');
};

window.onSidenavChange = (section) => {
  switch (section) {
    case 'categories':
      setActiveSidenavTab(section);
      navigate('categories', () => {
        initCategories();
      });
      break;
    case 'locations':
      setActiveSidenavTab(section);
      navigate('locations', () => {
        initLocations();
      });
      break;
    case 'listView':
      setActiveSidenavTab(section);
      navigate('listView', () => {
        initListView();
      });
      break;
    default:
      setActiveSidenavTab(section);
      navigate('categories', () => {
        initCategories();
      });
  }
};

const getSettings = () => contentController.getSettings().then((settings) => {
  state.settings = settings;
}).catch(console.error);

const init = () => {
  locationsAiSeeder.init();
  validateGoogleApiKey();

  getSettings()
    .then(() => {
      onSidenavChange('locations');
      Analytics.init();
    });
};

authManager.enforceLogin(init);
