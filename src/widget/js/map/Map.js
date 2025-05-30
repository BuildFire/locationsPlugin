import MarkerClusterer from './markercluster';
import CustomMarker from './CustomMarker';
import { cdnImage } from '../util/helpers';
import { isCameraControlVersion } from "../../../shared/utils/mapUtils";


export default class Map {
  constructor(selector, options) {
    this.init(selector, options);
    this.initMarkerCluster();
    this.Marker = CustomMarker();
    this.userPositionMarker = null;
    this.markers = [];
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
      mapId: buildfire.getContext().apiKeys.googleMapId || "bfMainViewMap",
    };
    if (isCameraControlVersion()) {
      document.querySelector('.map-center-btn').classList.add('left');
    }
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

  removeMarker(marker) {
    if (marker instanceof this.Marker) {
      marker.remove();
    } else {
      marker.setMap(null);
    }
    if (this.markerClusterer) {
      this.markerClusterer.removeMarker(marker);
    }
  }

  addMarker(location, onClick) {
    if (!this.map) return;

    const { lat, lng } = location.coordinates;
    let marker;
    let labelText = location.addressAlias || location.title;

    if (labelText.length > 13) labelText = labelText.slice(0, 10).concat('...');

    if (
      (location.marker.type === "circle" && location.marker.color?.color)
      || (location.marker.type === "image" && location.marker.image)
    ) {
      marker = new this.Marker(location, this.map, onClick);
    } else {
      const pinGlyph = new google.maps.marker.PinElement({});
      marker = new google.maps.marker.AdvancedMarkerElement({
        position: new google.maps.LatLng(lat, lng),
        map: this.map,
        content: pinGlyph.element,
      });
      marker.content.style.height = "40px";
      marker.content.innerHTML += `<div class="marker-label ellipsis" style="font-size: 16px;font-weight: bold;color:#fff;">${labelText}</div>`;
      marker.addListener("click", () => {
        onClick(location, marker);
      });
    }

    if (this.markers.length >= 200) {
      this.removeMarker(this.markers.shift());
    }

    if (this.markerClusterer) {
      this.markerClusterer.addMarker(marker);
    }

    this.markers.push(marker);
  }

  addUserPosition(coordinates) {
    if (!this.map) return;
    if (this.userPositionMarker) {
      this.userPositionMarker.marker = null;
    }
    const { latitude, longitude } = coordinates;
    const iconOption = cdnImage('https://app.buildfire.com/app/media/google_marker_blue_icon.png');

    const pinGlyph = new google.maps.marker.PinElement({});
    this.userPositionMarker = new google.maps.marker.AdvancedMarkerElement({
      position: new google.maps.LatLng(latitude, longitude),
      map: this.map,
      content: pinGlyph.element,
    });
    this.userPositionMarker.content.innerHTML = `<img src="${iconOption}" style="width: 20px;height: 20px;"/>`;
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

  addControlToMap(control) {
    this.map.controls[google.maps.ControlPosition.TOP_CENTER].push(control);
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

  get zoom() {
    return this.map.getZoom();
  }

  onMapIdle() {}
}
