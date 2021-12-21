export default (function () {
  function CustomMarker(location, icon, map, onClick) {
    const { lat, lng } = location.coordinates;
    this.location = location;
    this.position = new google.maps.LatLng(lat, lng);
    this.draggable = false;
    this.icon = icon;
    this.map = map;
    this.onClick = onClick;

    this.setMap(map);
  }

  CustomMarker.prototype = new google.maps.OverlayView();

  CustomMarker.prototype.draw = function () {
    let div = this.div_;
    const panes = this.getPanes();
    if (!div) {
      this.div_ = document.createElement('div');
      const img = document.createElement('img');
      div = this.div_;
      // Create the DIV representing our CustomMarker
      div.className = 'custom-marker';
      img.src = this.icon;
      div.appendChild(img);
      panes.floatPane.appendChild(div);
      google.maps.event.addDomListener(div, "click", () => {
        this.onClick(this.location);
      });
    }

    this.getPanes().overlayMouseTarget.appendChild(div);

    const changeBound =  () => {
      // Position the overlay
      if (!this.getProjection()) {
        return;
      }
      const point = this.getProjection().fromLatLngToDivPixel(this.position);
      const sw = this.getProjection().fromLatLngToDivPixel(
        this.map.getBounds().getSouthWest()
      );
      const ne = this.getProjection().fromLatLngToDivPixel(
        this.map.getBounds().getNorthEast()
      );
      if (point) {
        div.style.left = `${point.x}px`;
        div.style.top = `${point.y}px`;
        let width = ne.x - sw.x;
        let height = sw.y - ne.y;
        const ratio1 = 45 / width;
        const ratio2 = 45 / height;
        height *= ratio2;    // Reset height to match scaled image
        width *= ratio1;
        div.style.width = `${width}px`;
        div.style.height = `${height}px`;
      }
    };
    changeBound();
    google.maps.event.addListener(this.map, 'idle', changeBound);
  };

  CustomMarker.prototype.remove = function () {
    if (this.div_) {
      this.div_.parentNode.removeChild(this.div_);
      this.div_ = null;
    }
  };

  CustomMarker.prototype.getPosition = function () {
    return this.position;
  };

  return CustomMarker;
});
