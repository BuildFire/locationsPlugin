/* eslint-disable max-len */
import state from "../../state";
import { isCameraControlVersion } from "../../../../shared/utils/mapUtils";

const convertMileToMeter = (distanceInMiles) => {
  if (typeof distanceInMiles === "number") {
    return distanceInMiles * 1609.34;
  }
  return 1;
};

window.initAreaRadiusMap = () => {
  let localAreaOptions = {};
  if (state.settings.introductoryListView.searchOptions && state.settings.introductoryListView.searchOptions.areaRadiusOptions) {
    localAreaOptions = state.settings.introductoryListView.searchOptions.areaRadiusOptions;
  }

  const areaAddressInput = document.getElementById("area-radius-address-input");
  const areaRadiusInput = document.getElementById("location-area-radius-input");

  const options = {
    center: { lat: 32.7182625, lng: -117.1601157 },
    zoom: 1,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
    mapId: "introMapContent",
  };
  if (isCameraControlVersion()) {
    options.cameraControl = true;
  } else {
    options.zoomControl = true;
  }

  const map = new google.maps.Map(document.getElementById("local-area-map"), options);
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
    // onBoundsChange function is set from index.js file
    state.maps.onBoundsChange();
  };

  autocomplete.bindTo("bounds", map);

  const marker = new google.maps.marker.AdvancedMarkerElement({
    map,
    gmpDraggable: true,
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
    marker.visible = false;
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

    marker.position = place.geometry.location ;
    circle.center = place.geometry.location ;
    marker.visible = true;
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
  });

  areaRadiusInput.addEventListener('input', (e) => {
    let newRadius = Number(e.target.value); // radius in mile
    if (newRadius > 200) {
      areaRadiusInput.value = 200;
      newRadius = 200;
    } else if (newRadius < 1) {
      areaRadiusInput.value = 1;
      newRadius = 1;
    }

    localAreaOptions.radius = newRadius;
    const radiusInMeter = convertMileToMeter(Number(newRadius));
    circle.setRadius(radiusInMeter);

    handleLocalMapOptionChanges();
  });

  if (localAreaOptions.lat && localAreaOptions.lng) {
    areaRadiusInput.value = localAreaOptions.radius;
    areaAddressInput.value = localAreaOptions.formattedLocation;

    const latlng = new google.maps.LatLng(localAreaOptions.lat, localAreaOptions.lng);
    marker.visible = true;
    marker.position = latlng;
    circle.setVisible(true);
    map.setCenter(latlng);
    circle.setCenter({ lat: localAreaOptions.lat, lng: localAreaOptions.lng });

    const radiusInMeter = convertMileToMeter(Number(localAreaOptions.radius || 1));
    circle.setRadius(radiusInMeter);
  }
};

const setGoogleMapsScript = (key) => {
  const docHead = document.getElementsByTagName("head");
  const googleMapsPlaces = document.getElementById("googleMapsPlaces");
  if (googleMapsPlaces) {
    document.head.removeChild(googleMapsPlaces);
  }

  const scriptEl = document.createElement("script");
  scriptEl.id = "googleMapsPlaces";
  scriptEl.src = `https://maps.googleapis.com/maps/api/js?v=weekly&key=${key}&callback=initAreaRadiusMap&libraries=places,marker`;
  docHead[0].appendChild(scriptEl);
};

const loadAreaRadiusMap = () => {
  const areaRadiusOptionsContainer = document.querySelector("#areaRadiusOptionsContainer");
  if (state.settings.introductoryListView.searchOptions && state.settings.introductoryListView.searchOptions.mode === "AreaRadius") {
    areaRadiusOptionsContainer?.classList?.remove('hidden');
  }
  buildfire.getContext((error, context) => {
    setGoogleMapsScript(context.apiKeys.googleMapKey);
  });
};

export default loadAreaRadiusMap;
