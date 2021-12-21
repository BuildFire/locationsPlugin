import MarkerClusterer from './lib/markercluster';
import CustomMarker from './CustomMarker';

export default class Map {
  constructor(selector, options) {
    this.init(selector, options);
    this.initMarkerCluster();
    this.Marker = CustomMarker();
  }

  init(selector, userOptions) {
    const mapTypeId = google.maps.MapTypeId.ROADMAP;
    const zoomPosition = google.maps.ControlPosition.RIGHT_TOP;
    const options = {
      minZoom: 3,
      maxZoom: 19,
      zoom: 15,
      streetViewControl: false,
      fullscreenControl: false,
      mapTypeControl: false,
      gestureHandling: 'greedy',
      mapTypeId,
      zoomControlOptions: {
        position: zoomPosition
      },
      ...userOptions
    };
    this.map = new google.maps.Map(selector, options);
  }

  initMarkerCluster() {
    const clusterOptions = {
      gridSize: 53,
      styles: [
        {
          textColor: 'white',
          url: 'https://app.buildfire.com/app/media/google_marker_blue_icon2.png',
          height: 53,
          width: 53
        }
      ],
      maxZoom: 15
    };
    this.markerClusterer = new MarkerClusterer(this.map, [], clusterOptions);
  }

  addMarker(location, onClick) {
    if (!this.map) return;

    // const iconOptions = {
    //   url: 'https://app.buildfire.com/app/media/google_marker_red_icon.png',
    //   scaledSize: new google.maps.Size(20, 20),
    //   origin: new google.maps.Point(0, 0),
    //   anchor: new google.maps.Point(10, 10)
    // };
    // const marker = new google.maps.Marker({
    //   position: {lat: 37.77085, lng: -122.41356},
    //   markerData: location,
    //   map: this.map,
    //   icon: iconOptions
    // });
    //
    // marker.addListener('click', () => {
    //   onClick(location, marker);
    // });

    const marker = new this.Marker(
      location,
      'http://placekitten.com/90/90',
      this.map,
      onClick
    );

    if (this.markerClusterer) {
      this.markerClusterer.addMarker(marker);
    }
  }
}
