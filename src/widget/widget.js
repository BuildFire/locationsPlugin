import buildfire from 'buildfire';
import WidgetController from './widget.controller';

const templates = {};

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
  injectTemplate('home');

  const carousel = new buildfire.components.carousel.view('.carousel');
  const carouselItems = [
    {
      iconUrl: "https://placeimg.com/800/400",
    },
    {
      iconUrl: "https://placeimg.com/800/400",
    },
    {
      iconUrl: "https://placeimg.com/800/400",
    },
  ];
  carousel.loadItems(carouselItems);
};

fetchTemplate('home', init);
