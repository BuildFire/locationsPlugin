import MarkerClusterer from './lib/markercluster';

export default class Map {
  constructor({ selector }) {
    this.init(selector);
    this.initMarkerCluster();
  }

  init(selector) {
    const mapTypeId = google.maps.MapTypeId.ROADMAP;
    const zoomPosition = google.maps.ControlPosition.RIGHT_TOP;

    const options = {
      minZoom: 3,
      maxZoom: 19,
      center: { lat: 38.70290288229097, lng: 35.52352225602528 },
      zoom: 15,
      streetViewControl: false,
      mapTypeControl: true,
      fullscreenControl: false,
      gestureHandling: 'greedy',
      mapTypeId,
      zoomControlOptions: {
        position: zoomPosition
      }
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

    const iconOptions = {
      url: 'https://app.buildfire.com/app/media/google_marker_red_icon.png',
      scaledSize: new google.maps.Size(20, 20),
      origin: new google.maps.Point(0, 0),
      anchor: new google.maps.Point(10, 10)
    };
    const marker = new google.maps.Marker({
      position: location.coordinates,
      markerData: location,
      map: this.map,
      icon: iconOptions
    });

    marker.addListener('click', () => {
      onClick(location, marker);
    });

    if (this.markerClusterer) {
      this.markerClusterer.addMarker(marker);
    }
  }
}
