/* eslint-disable max-len */
import IntroSearchService from "../services/search/introSearchService";
import MapSearchService from "../services/search/mapSearchService";
import state from "./state";
import detailsView from "./views/detailsView";
import introView from "./views/introView";
import mapView from "./views/mapView";

class Views {
  constructor() {
    this.templates = {};
  }

  fetch(view) {
    return new Promise((resolve) => {
      if (this.templates[view]) {
        console.warn(`template ${view} already exist.`);
        return resolve();
      }

      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const content = xhr.responseText;
        this.templates[view] = new DOMParser().parseFromString(content, 'text/html');
        resolve(view);
      };
      xhr.onerror = () => {
        console.error(`fetching template ${view} failed.`);
      };
      xhr.open('GET', `./templates/${view}.html`);
      xhr.send(null);
    });
  }

  inject(view) {
    if (!this.templates[view]) {
      console.warn(`template ${view} not found.`);
      return;
    }
    const templateElement = document.querySelector(`#${view}`);
    const createTemplate = document.importNode(this.templates[view].querySelector('template').content, true);
    templateElement.innerHTML = '';
    templateElement.appendChild(createTemplate);
  }

  clear(view) {
    if (!this.templates[view]) {
      console.warn(`template ${view} not found.`);
      return;
    }
    document.querySelector(`section#${view}`).innerHTML = '';
  }

  // eslint-disable-next-line class-methods-use-this
  refreshCurrentView() {
    const activeSection = document.querySelector('section.active');
    const mapContainer = activeSection.querySelector('#listing');

    // eslint-disable-next-line default-case
    switch (activeSection.id) {
      case 'home':
        state.clearLocations();
        if (mapContainer && mapContainer.style.display === 'block') {
          mapView.clearMapViewList();
          MapSearchService.searchLocations().then((data) => mapView.handleMapSearchResponse(data));
        } else {
          introView.clearIntroViewList();
          IntroSearchService.searchIntroLocations().then((data) => introView.handleIntroSearchResponse(data));
        }
        break;
      case 'detail':
        detailsView.initLocationDetails();
        break;
    }
  }
}

export default new Views();
