// This is the entry point of your plugin's content control.
// Feel free to require any local or npm modules you've installed.
//
import buildfire from 'buildfire';
import ContentController from './content.controller';
import DataMocks from '../../DataMocks';
import authManager from '../../UserAccessControl/authManager';

import './js/categories';
import './js/locations';
import './js/listView';


const templates = {};

const createLoadingState = () => {
  const div = document.createElement("div");
  div.className = 'well text-center';
  div.innerHTML = `<hr class="none"><h5>Loading...</h5>`;
  return div;
};

/** template management start */
const fetchTemplate = (template, callback) => {
  if (templates[template]) {
    console.warn(`template ${template} already exist.`);
    callback(null, template);
    return;
  }

  // show loading state
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

const navigate = (template) => {
  fetchTemplate(template, () =>  {
    injectTemplate(template);
    switch (template) {
      case 'categories':
        initCategories();
        break;
      case 'locations':
        initLocations();
        break;
      case 'listView':
        initListView();
        break;
      default:
    }
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
    case 'categories':
      navigate('categories');
      setActiveSidenavTab(section);
      break;
    case 'locations':
      navigate('locations');
      setActiveSidenavTab(section);
      break;
    case 'listView':
      navigate('listView');
      setActiveSidenavTab(section);
      break;
    default:
      navigate('categories');
      setActiveSidenavTab(section);
  }
};

const init = () => {
  onSidenavChange('categories');
};

authManager.enforceLogin(init);
