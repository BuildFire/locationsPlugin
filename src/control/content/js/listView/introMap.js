/* eslint-disable max-len */
import SettingsController from "./controller";
import state from "../../state";

window.initAreaRadiusMap = () => {
  let localAreaOptions = {
    formattedLocation: "Indianapolis, IN, USA",
    radius: 15,
    lat: 39.768403,
    lng: -86.158068
  };

  const areaAddressInput = document.getElementById("area-radius-address-input");
  const areaRadiusInput = document.getElementById("location-area-radius-input");

  const map = new google.maps.Map(document.getElementById("area-radius-location-map"), {
    center: { lat: localAreaOptions.lat, lng: localAreaOptions.lng },
    zoom: 10,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
  });
  state.map = map;

  const autocomplete = new google.maps.places.SearchBox(
    areaAddressInput,
    {
      types: ["address"],
    }
  );

  const geoCoder = new google.maps.Geocoder();
  const handleLocalMapOptionChanges = () => {
    state.settings.introductoryListView.searchOptions.areaRadiusOptions = localAreaOptions;
    SettingsController.saveSettingsWithDelay(state.settings);
  };

  autocomplete.bindTo("bounds", map);

  const marker = new google.maps.Marker({
    map,
    anchorPoint: new google.maps.Point(0, -29),
    draggable: true,
  });

  // Create the circle and add it to the map.
  const circle = new google.maps.Circle({
    map,
    strokeColor: '#D85646',
    strokeWeight: 2,
    fillColor: '#D85646',
    fillOpacity: 0.20,
  });

  autocomplete.addListener("places_changed", () => {
    marker.setVisible(false);
    const places = autocomplete.getPlaces();
    const place = places[0];

    if (!place || !place.geometry || !place.geometry) {
      return;
    }

    if (place.geometry.viewport) {
      map.fitBounds(place.geometry.viewport);
    } else {
      map.setCenter(place.geometry.location);
      map.fitBounds(circle.getBounds());
    }

    marker.setPosition(place.geometry.location);
    circle.setCenter(place.geometry.location);
    marker.setVisible(true);
  });

  marker.addListener("dragend", (e) => {
    circle.setCenter(e.latLng);
  });

  circle.addListener("center_changed", (e) => {
    map.setCenter(circle.getCenter());
    if (localAreaOptions.radius) {
      map.fitBounds(circle.getBounds());
    } else {
      map.setZoom(15);
    }

    const lat = circle.getCenter().lat();
    const lng = circle.getCenter().lng();

    geoCoder.geocode(
      { location: { lat, lng } },
      (results, status) => {
        if (status === "OK") {
          if (results[0]) {
            areaAddressInput.value = results[0].formatted_address;
            localAreaOptions.formattedLocation = results[0].formatted_address;
            localAreaOptions.lat = lat;
            localAreaOptions.lng = lng;

            handleLocalMapOptionChanges();
          } else {
            console.log("No results found");
          }
        } else {
          console.log("Geocoder failed due to: ", status);
        }
      }
    );
  });

  circle.addListener("radius_changed", (e) => {
    map.setCenter(circle.getCenter());
    if (localAreaOptions.radius) {
      map.fitBounds(circle.getBounds());
    } else {
      map.setZoom(15);
    }

    handleLocalMapOptionChanges();
  });

  areaRadiusInput.addEventListener('input', (e) => {
    let newRadius = Number(e.target.value); // radius in mile
    if (newRadius > 100) {
      areaRadiusInput.value = 100;
      newRadius = 100;
    } else if (newRadius < 1) {
      areaRadiusInput.value = 1;
      newRadius = 1;
    }

    localAreaOptions.radius = newRadius;
    const radiusInMeter = Number(newRadius * 1609.34); // convert miles to meter
    circle.setRadius(radiusInMeter);
  });

  if (state.settings.introductoryListView.searchOptions && state.settings.introductoryListView.searchOptions.areaRadiusOptions) {
    localAreaOptions = state.settings.introductoryListView.searchOptions.areaRadiusOptions;
  }

  if (localAreaOptions.lat && localAreaOptions.lng) {
    areaRadiusInput.value = localAreaOptions.radius;
    areaAddressInput.value = localAreaOptions.formattedLocation;

    const latlng = new google.maps.LatLng(localAreaOptions.lat, localAreaOptions.lng);
    marker.setVisible(true);
    marker.setPosition(latlng);
    circle.setVisible(true);
    circle.setCenter({ lat: localAreaOptions.lat, lng: localAreaOptions.lng });
    map.setCenter(latlng);

    // Radius in meters
    const radiusInMeter = Number(localAreaOptions.radius * 1609.34);
    circle.setRadius(radiusInMeter);
  }
};

const loadAreaRadiusMap = (data) => {
  const areaRadiusOptionsContainer = document.querySelector("#areaRadiusOptions-Container");
  if (state.settings.introductoryListView.searchOptions && state.settings.introductoryListView.searchOptions.mode === "AreaRadius") {
    areaRadiusOptionsContainer?.classList?.remove('hidden');
  }
  buildfire.getContext((error, context) => {
    function setGoogleMapsScript(key) {
      const docHead = document.getElementsByTagName("head");
      const mapScript = document.getElementById("googleScript");
      const scriptEl = document.createElement("script");
      scriptEl.id = "googleScript";
      scriptEl.src = `https://maps.googleapis.com/maps/api/js?key=${key}&callback=initAreaRadiusMap&libraries=places&v=weekly`;
      if (mapScript) {
        document.head.removeChild(mapScript);
      }
      docHead[0].appendChild(scriptEl);
    }

    setGoogleMapsScript(context.apiKeys.googleMapKey);
  });
};

export default loadAreaRadiusMap;
