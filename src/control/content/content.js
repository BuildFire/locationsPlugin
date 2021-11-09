// This is the entry point of your plugin's content control.
// Feel free to require any local or npm modules you've installed.
//
import buildfire from 'buildfire';
import ContentController from './content.controller';
import DataMocks from '../../DataMocks';


const templates = {};
console.log('Content Page');
/** template management start */
const fetchTemplate = (template, done) => {
  if (templates[template]) {
    console.warn(`template ${template} already exist.`);
    return;
  }

  const xhr = new XMLHttpRequest();
  xhr.onload = () => {
    const content = xhr.responseText;
    templates[template] = new DOMParser().parseFromString(content, 'text/html');
    done();
  };
  xhr.onerror = () => {
    console.error(`fetching template ${template} failed.`);
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
  document.querySelector(`#${template}`).appendChild(createTemplate);
};
/** template management end */

const init = () => {
  injectTemplate('categories');
};

fetchTemplate('categories', init);
