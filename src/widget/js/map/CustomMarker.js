export default (function () {
  function CustomMarker(location, map, onClick) {
    const { lat, lng } = location.coordinates;
    this.location = location;
    this.position = new google.maps.LatLng(lat, lng);
    this.draggable = false;
    this.map = map;
    this.onClick = onClick;
    this.setMap(map);
  }

  CustomMarker.prototype = new google.maps.OverlayView();

  CustomMarker.prototype.draw = function () {
    let div = this.div_;
    const panes = this.getPanes();
    let labelText = this.location.addressAlias || this.location.title;
    if (labelText.length > 13) labelText = labelText.slice(0, 10).concat('...');

    if (!div) {
      this.div_ = document.createElement('div');

      div = this.div_;
      // Create the DIV representing our CustomMarker
      div.classList.add('custom-marker');

      if (this.location.marker.type === 'image') {
        const imageContainer = document.createElement('div');
        const img = document.createElement('img');
        const label = document.createElement('label');
        img.src = this.location.marker.image;
        imageContainer.appendChild(img);
        label.textContent = labelText;
        div.appendChild(imageContainer);
        div.appendChild(label);
        imageContainer.classList.add('custom-marker__image');
        div.classList.add('custom-marker__container');
      } else {
        const svgns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgns, 'svg');
        const circle = document.createElementNS(svgns, 'circle');
        const label = document.createElementNS(svgns, 'text');

        circle.setAttributeNS(null, 'cx', '50%');
        circle.setAttributeNS(null, 'cy', 12.5);
        circle.setAttributeNS(null, 'r', 10);
        circle.setAttributeNS(null, 'stroke-width', 3);
        circle.setAttributeNS(null, 'stroke', '#efefef');
        circle.setAttributeNS(null, 'fill', this.location.marker.color?.color);
        label.setAttributeNS(null, 'text-anchor', 'middle');
        label.setAttributeNS(null, 'x', '50%');
        label.setAttributeNS(null, 'y', '40');
        label.setAttributeNS(null, 'text-anchor', 'middle');
        label.setAttributeNS(null, 'font-size', '14');
        label.textContent = labelText;
        svg.appendChild(circle);
        svg.appendChild(label);
        div.appendChild(svg);
        div.classList.add('custom-marker__circle');
      }
      panes.floatPane.appendChild(div);
      google.maps.event.addDomListener(div, 'click', () => {
        this.onClick(this.location);
      });
    }
    const point = this.getProjection().fromLatLngToDivPixel(this.position);
    if (point) {
      const southWest = this.map.getBounds().getSouthWest();
      const northEast = this.map.getBounds().getNorthEast();
      const sw = this.getProjection().fromLatLngToDivPixel(southWest);
      const ne = this.getProjection().fromLatLngToDivPixel(northEast);

      const mapWidth = ne.x - sw.x;
      const mapHeight = sw.y - ne.y;
      // factor depends on the marker size
      const widthRatio = 45 / mapWidth;
      const heightRatio = 45 / mapHeight;
      div.style.width = `${mapWidth * widthRatio}px`;
      div.style.height = `${mapHeight * heightRatio}px`;

      div.style.left = point.x + 'px';
      div.style.top = point.y + 'px';
    }

    this.getPanes().overlayMouseTarget.appendChild(div);

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
