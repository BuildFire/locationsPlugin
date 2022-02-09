import MarkerClusterer from "./lib/markercluster";
import CustomMarker from "./CustomMarker";
import { cdnImage } from './util/helpers';

export default class Map {
  constructor(selector, options) {
    this.init(selector, options);
    this.initMarkerCluster();
    this.Marker = CustomMarker();
  }

  init(selector, userOptions) {
    const zoomPosition = google.maps.ControlPosition.RIGHT_TOP;
    const options = {
      minZoom: 3,
      maxZoom: 19,
      zoom: 10,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      gestureHandling: "greedy",
      zoomControlOptions: {
        position: zoomPosition,
      },
      ...userOptions,
    };
    this.map = new google.maps.Map(selector, options);
    google.maps.event.addListenerOnce(this.map, 'idle', this.attachMapListeners.bind(this));
  }

  attachMapListeners() {
    this.boundsChangedHandler = this.map.addListener("bounds_changed", this.onBoundsChange.bind(this));
    this.centerChangedHandler = this.map.addListener('idle', this.onMapIdle.bind(this));
  }

  detachMapListeners() {
    google.maps.event.removeListener(this.boundsChangedHandler);

    google.maps.event.removeListener(this.centerChangedHandler);
    console.log("DETACH LISTENERS");
  }

  initMarkerCluster() {
    const clusterOptions = {
      gridSize: 53,
      styles: [
        {
          textColor: 'white',
          url: cdnImage('https://app.buildfire.com/app/media/google_marker_blue_icon2.png'),
          height: 53,
          width: 53,
        },
      ],
      maxZoom: 15,
    };
    this.markerClusterer = new MarkerClusterer(this.map, [], clusterOptions);
  }

  addMarker(location, onClick) {
    if (!this.map) return;
    const { lat, lng } = location.coordinates;
    let marker;
    let labelText = location.addressAlias ?? location.title;
    if (labelText.length > 13) labelText = labelText.slice(0, 10).concat('...');

    if (
      (location.marker.type === "circle" && location.marker.color?.color) ||
      (location.marker.type === "image" && location.marker.image)
    ) {
      marker = new this.Marker(location, this.map, onClick);
    } else {
      marker = new google.maps.Marker({
        position: new google.maps.LatLng(lat, lng),
        markerData: location,
        map: this.map,
        label: {
          text: labelText,
          fontSize: '14px',
          className: 'marker-label'
        },
      });
      marker.addListener("click", () => {
        onClick(location, marker);
      });
    }

    if (this.markerClusterer) {
      this.markerClusterer.addMarker(marker);
    }
  }

  addUserPosition(coordinates) {
    if (!this.map) return;
    const { latitude, longitude } = coordinates;
    const iconOptions = {
      url: cdnImage('https://app.buildfire.com/app/media/google_marker_blue_icon.png'),
      scaledSize: new google.maps.Size(20, 20),
      origin: new google.maps.Point(0, 0),
      anchor: new google.maps.Point(10, 10),
    };

    new google.maps.Marker({
      position: new google.maps.LatLng(latitude, longitude),
      map: this.map,
      icon: iconOptions,
    });
  }

  updateOptions(userOptions) {
    const options = {
      mapTypeControl: false,
      ...userOptions,
    };
    this.map.setOptions(options);
  }

  center(position) {
    if (!position.lat || !position.lng) return;
    this.map.setCenter(position);
  }

  setZoom(zoom) {
    if (!zoom) {
      return;
    }
    this.map.setZoom(zoom);
  }

  getCenter() {
    return this.map.getCenter();
  }

  clearMarkers() {
    this.markerClusterer.clearMarkers(true);
  }

  onBoundsChange() {}

  initSearchAreaBtn(onClick) {
  // Set CSS for the control border.
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
    controlText.innerHTML = 'Find within this area';
    controlUI.appendChild(controlText);
    // Setup the click event listeners: simply set the map to Chicago.
    controlUI.addEventListener('click', onClick);
    controlUI.style.display = 'none';
    this.map.controls[google.maps.ControlPosition.TOP_CENTER].push(controlDiv);
  }

  get mapBounds() {
    let boundsFields;
    const mapBounds = this.map.getBounds()?.toJSON();
    if (mapBounds) {
      boundsFields = [
        [mapBounds.west, mapBounds.north],
        [mapBounds.east, mapBounds.north],
        [mapBounds.east, mapBounds.south],
        [mapBounds.west, mapBounds.south],
        [mapBounds.west, mapBounds.north],
      ];
    }
    return boundsFields;
  }

  onMapIdle() {}
}
