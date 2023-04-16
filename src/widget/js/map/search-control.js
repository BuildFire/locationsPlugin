import state from '../state';

const _getControlElementContainer = () => document.querySelector('#custom-top-center');
const _getControlElement = () => document.querySelector('#findLocationsBtn');
const _getControlTextElement = () => document.querySelector('#findLocationsBtn div');

export default {
  setLabel(state) {
    const controlElementContainer = _getControlElementContainer();
    const controlTextElement = _getControlTextElement();

    switch (state) {
      case 'FIND_MORE':
        controlTextElement.innerHTML = 'Find More';
        controlElementContainer.classList.add('sm-label');
        break;
      case 'FIND_IN_AREA':
        controlTextElement.innerHTML = window.strings?.get('general.findWithinThisArea')?.v;
        controlElementContainer.classList.remove('sm-label');
        break;
      default:
        controlTextElement.innerHTML = window.strings?.get('general.findWithinThisArea')?.v;
        break;
    }
  },
  init(onClick) {
    const controlUI = document.createElement('div');
    const controlDiv = document.createElement('div');
    controlDiv.style.top = '5rem;';
    controlDiv.id = 'custom-top-center';
    controlUI.style.backgroundColor = 'rgb(0 0 0 / 60%)';
    controlUI.style.borderRadius = '20px';
    // controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
    controlUI.style.boxShadow = 'rgb(0 0 0 / 30%) 0px 1px 4px -1px';
    controlUI.style.cursor = 'pointer';
    controlUI.style.margin = '0 0 10px';
    controlUI.style.padding = '10px 17px';
    controlUI.style.height = 'auto';
    controlUI.style.textAlign = 'center';
    controlUI.style.textTransform = 'capitalize';
    controlUI.title = 'Click to find locations';
    controlUI.id = 'findLocationsBtn';
    controlDiv.appendChild(controlUI);

    // Set CSS for the control interior.
    const controlText = document.createElement('div');

    controlText.style.color = '#e3e3e3';
    controlText.style.fontFamily = 'Roboto,Arial,sans-serif';
    controlText.style.fontSize = '12px';
    controlText.style.fontWeight = 'bold';
    controlText.innerHTML = window.strings?.get('general.findWithinThisArea')?.v;
    controlUI.appendChild(controlText);
    // Setup the click event listeners: simply set the map to Chicago.
    controlUI.addEventListener('click', onClick);
    controlUI.style.display = 'none';
    console.log('state.maps.map: ', state.maps);
    console.log('state.maps.map: ', state.maps.map);
    state.maps.map.addControlToMap(controlDiv);
  },
  resetState() {
    this.hide();
    this.setLabel('FIND_IN_AREA');
  },
  show() {
    const element = _getControlElement();
    if (!element || !(element instanceof Element) || !element.style) {
      console.warn('No search control element');
    } else {
      element.style.display = 'block';
    }
  },
  hide() {
    const element = _getControlElement();
    if (!element || !(element instanceof Element) || !element.style) {
      console.warn('No search control element');
    } else {
      element.style.display = 'none';
    }
  },
  refresh() {
    state.viewportHasChanged = false;
    if (!state.fetchingEndReached) {
      this.setLabel('FIND_MORE');
      this.show();
    } else {
      this.setLabel('FIND_IN_AREA');
    }
  }
};
