import state from '../state';

const _getControlElement = () => document.querySelector('#findLocationsBtn');
const _getControlTextElement = () => document.querySelector('#findLocationsBtn div');

/**
 * ~ Edge handling~
 * When searching reset the button
 * Re-initialize after each search
 * */

/**
 * ~Label Visibility~
 *   should be changed to Find More and shown, when there is more locations can be fetched
 *   should be shown when there is more locations can be fetched (after search locations is triggered)
 *   should be hidden when there are no more locations can be fetched
 *   should be hidden during the fetch process
 * */

/**
 * ~Label Reset and make it hidden~
 *  when the viewport has changed
 *  when the zoom has changed
 *  when there are no more locations can be fetched
 * */

export default {
  setLabel(state) {
    const labelDiv = _getControlTextElement();
    switch (state) {
      case 'FIND_MORE':
        labelDiv.innerHTML = 'Find More';
        break;
      case 'FIND_IN_AREA':
        labelDiv.innerHTML = window.strings?.get('general.findWithinThisArea')?.v;
        break;
      default:
        labelDiv.innerHTML = window.strings?.get('general.findWithinThisArea')?.v;
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
