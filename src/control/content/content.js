// This is the entry point of your plugin's content control.
// Feel free to require any local or npm modules you've installed.
//
import buildfire from 'buildfire';
import ContentController from './content.controller';
import DataMocks from '../../DataMocks';
import sortableListUI from './components/sortableList/sortableListUI';


const templates = {};
console.log('Content Page');
/** template management start */
const fetchTemplate = (template, callback) => {
  if (templates[template]) {
    console.warn(`template ${template} already exist.`);
    callback(null, template);
    return;
  }

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
    sortableListUI.init('items', DataMocks.generate('CATEGORY', 10));
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
    default:
      navigate('categories');
      setActiveSidenavTab(section);
  }
};

const init = () => {
  navigate('categories');
};

init();
