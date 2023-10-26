/* eslint-disable max-len */
import WidgetController from '../widget.controller';
import Analytics from '../../utils/analytics';
import mapSearchControl from '../js/map/search-control';
import state from "../js/state";
import { openingNowDate, getCurrentDayName, } from '../../utils/datetime';
import mapView from "../js/views/mapView";

const locationsService = {
  clearLocations() {
    state.listLocations = [];
    state.searchCriteria.page = 0;
    state.searchCriteria.page2 = 0;
    state.fetchingNextPage = false;
    state.fetchingEndReached = false;
    state.fetchingAllNearReached = false;
    state.searchableTitles = [];
    state.nearestLocation = null;
    state.isMapIdle = false;
    if (state.maps.map) state.maps.map.clearMarkers();
  },

  triggerSearchOnMapIdle() {
    if (!state.isMapIdle) {
      setTimeout(() => {
        this.triggerSearchOnMapIdle();
      }, 300);
      return;
    }

    this.clearLocations();
    this.searchLocations().then((result) => {
      mapView.clearMapViewList();
      mapView.renderListingLocations(state.listLocations);
    });
  },

  calculateLocationDistance(address) {
    const { userPosition } = state;
    if (!userPosition) return null;

    const destination = { latitude: address.lat, longitude: address.lng };
    const distance = buildfire.geo.calculateDistance(userPosition, destination, { decimalPlaces: 5 });
    let result;
    if (distance < 0.2) {
      result = `${Math.round(distance * 5280).toLocaleString()} ${window.strings.get('general.distanceUnitFt').v}`;
    } else if (state.settings.measurementUnit === 'metric') {
      result = `${Math.round(distance * 1.60934).toLocaleString()} ${window.strings.get('general.distanceUnitKm').v}`;
    } else {
      result = `${Math.round(distance).toLocaleString()} ${window.strings.get('general.distanceUnitMi').v}`;
    }
    return result;
  },

  getCategoriesAndSubCategoriesByName(name) {
    name = name.toLowerCase();
    const subcategoryIds = [];
    const categoryIds = [];

    state.categories.forEach((category) => {
      if (name === category.title.toLowerCase()) {
        categoryIds.push(category.id);
      }

      category.subcategories.forEach((subcategory) => {
        if (name === subcategory.title.toLowerCase()) {
          subcategoryIds.push(subcategory.id);
        }
      });
    });

    return { subcategoryIds, categoryIds };
  },

  buildSearchCriteria() {
    const query = {};
    if (state.searchCriteria.searchValue && state.searchableTitles.length === 0) {
      const { subcategoryIds, categoryIds } = this.getCategoriesAndSubCategoriesByName(state.searchCriteria.searchValue);
      const array1Index = [...categoryIds.map((id) => `c_${id}`), ...subcategoryIds.map((id) => `s_${id}`)];
      query.$or = [
        { "_buildfire.index.text": { $regex: state.searchCriteria.searchValue.toLowerCase(), $options: "-i" } },
        { "_buildfire.index.array1.string1": { $in: array1Index } }
      ];
    }

    // categories & subcategories filter
    const categoryIds = [];
    const subcategoryIds = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const key in state.filterElements) {
      if (state.filterElements[key].checked) {
        categoryIds.push(key);
        const selectedSubcategories = state.filterElements[key].subcategories;
        subcategoryIds.push(...selectedSubcategories);
        const category = state.categories.find((elem) => elem.id === key);
        Analytics.categorySelected(category.id);
        const subcategories = category.subcategories.filter((elem) => selectedSubcategories.includes(elem.id));
        subcategories.forEach((subcategory) => {
          Analytics.subcategorySelected(subcategory.id);
        });
      }
    }
    if (categoryIds.length > 0
          || subcategoryIds.length > 0
          || state.searchCriteria.priceRange
          || state.searchableTitles.length > 0
          || state.searchCriteria.bookmarked) {
      let array1Index = [...categoryIds.map((id) => `c_${id}`), ...subcategoryIds.map((id) => `s_${id}`)];
      if (state.searchCriteria.priceRange) {
        array1Index.push(`pr_${state.searchCriteria.priceRange}`);
      }

      if (state.searchableTitles.length > 0) {
        array1Index.push(...state.searchableTitles.map((title) => `title_${title.toLowerCase()}`));
      }

      if (state.searchCriteria.bookmarked) {
        array1Index = [...array1Index, ...state.bookmarks.map((b) => `cid_${b.id}`)];
      }

      query["_buildfire.index.array1.string1"] = { $in: array1Index };
    }

    return query;
  },

  buildOpenNowCriteria() {
    const query = {};
    query[`openingHours.days.${getCurrentDayName()}.intervals`] = {
      $elemMatch: {
        from: { $lte: openingNowDate() },
        to: { $gt: openingNowDate() }
      }
    };
    query[`openingHours.days.${getCurrentDayName()}.active`] = true;
    return query;
  },

  handleSearchMode() {
    const query = this.buildSearchCriteria();
    const allIds = state.listLocations.map((location) => location._id);
    let $match;
    let $geoNear;

    if (state.searchCriteria.openingNow) {
      $match = this.buildOpenNowCriteria();
    }

    if (state.settings.introductoryListView.searchOptions?.mode === "All") {
      if (!state.fetchingAllNearReached) {
        $geoNear = {
          near: { type: "Point", coordinates: [state.currentLocation.lng, state.currentLocation.lat] },
          key: "_buildfire.geo",
          maxDistance: 100000,
          distanceField: "distance",
          query: { ...query }
        };
      } else if ($match) {
        $match = {
          ...query,
          ...$match,
          "_buildfire.index.string1": { $exists: true },
          _id: { $nin: allIds }
        };
      } else {
        $match = {
          ...query,
          "_buildfire.index.string1": { $exists: true },
          _id: { $nin: allIds }
        };
      }
    } else if (state.settings.introductoryListView.searchOptions?.mode === "AreaRadius") {
      state.fetchingAllNearReached = true;
      const lng = state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.lng || 1;
      const lat = state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.lat || 1;
      const radius = state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.radius || 1;
      const radiusInMeter = Number(radius * 1609.34); // convert radius from mile to meter

      $geoNear = {
        near: { type: "Point", coordinates: [lng, lat] },
        key: "_buildfire.geo",
        maxDistance: radiusInMeter,
        distanceField: "distance",
        query: { ...query }
      };
    } else {
      state.fetchingAllNearReached = true;
      $geoNear = {
        near: { type: "Point", coordinates: [state.currentLocation.lng, state.currentLocation.lat] },
        key: "_buildfire.geo",
        maxDistance: 100000,
        distanceField: "distance",
        query: { ...query }
      };
    }

    return {
      geoNear: $geoNear ? { $geoNear } : null,
      match: $match ? { $match } : null,
    };
  },

  searchIntroLocations() {
    const pipelines = [];
    const searchPipeline = this.handleSearchMode();

    if (searchPipeline.geoNear) {
      pipelines.push(searchPipeline.geoNear);
    }

    if (searchPipeline.match) {
      pipelines.push(searchPipeline.match);
    }

    const $sort = {};
    if (state.searchCriteria.sort) {
      $sort[state.introSort.sortBy] = state.introSort.order;
      pipelines.push({ $sort });
    }

    const promiseChain = [
      WidgetController.searchLocationsV2(pipelines, state.searchCriteria.page)
    ];

    if (state.searchCriteria.searchValue && !state.searchableTitles.length) {
      promiseChain.push(WidgetController.getSearchEngineResults(state.searchCriteria.searchValue));
    }

    return Promise.all(promiseChain)
      .then(([result, result2]) => {
        state.fetchingNextPage = false;
        state.fetchingEndReached = result.length < state.searchCriteria.pageSize && state.fetchingAllNearReached;

        if (result.length < state.searchCriteria.pageSize && !state.fetchingAllNearReached) {
          state.fetchingAllNearReached = true;
        }

        result = result.filter((elem1) => (
          !state.listLocations.find((elem) => elem?.id === elem1?.id)
        )).map((r) => ({ ...r, distance: this.calculateLocationDistance(r?.coordinates) }));

        state.listLocations = state.listLocations.concat(result);
        if (state.searchCriteria.searchValue && !state.listLocations.length && !state.searchableTitles.length) {
          const searchableTitles = result2?.hits?.hits?.map((elem) => elem._source.searchable.title);
          if (searchableTitles && searchableTitles.length > 0) {
            state.searchableTitles = searchableTitles;
            return this.searchLocations();
          }
        }
        return result;
      })
      .catch(console.error);
  },

  getNearestLocation() {
    const pipelines = [];
    const query = this.buildSearchCriteria();

    const $geoNear = {
      near: { type: "Point", coordinates: [state.currentLocation.lng, state.currentLocation.lat] },
      key: "_buildfire.geo",
      distanceField: "distance",
      query: { ...query },
    };

    pipelines.push({ $geoNear });

    if (state.searchCriteria.openingNow) {
      pipelines.push({ $match: this.buildOpenNowCriteria() });
    }

    const $sort = { distance: 1 };
    pipelines.push({ $sort });

    return WidgetController.searchLocationsV2(pipelines, 0, 1).then((results) => results[0]);
  },

  // get locations on map view
  searchLocations() {
    return new Promise((resolve, reject) => {
      const { showIntroductoryListView } = state.settings;
      const activeTemplate = getComputedStyle(document.querySelector('section#listing'), null).display !== 'none' ? 'listing' : 'intro';
      if (activeTemplate === 'intro' && showIntroductoryListView) {
        return resolve(this.searchIntroLocations());
      }

      const pipelines = [];
      const query = this.buildSearchCriteria();
      const { mapBounds } = state.maps.map;

      if (!mapBounds || !Array.isArray(mapBounds)) {
        return resolve([]);
      }

      mapSearchControl.resetState();
      const $match = { ...query };
      $match["_buildfire.geo"] = {
        $geoWithin: {
          $geometry: {
            type: "Polygon",
            coordinates: [mapBounds]
          }
        }
      };
      pipelines.push({ $match });

      if (state.searchCriteria.openingNow) {
        pipelines.push({ $match: this.buildOpenNowCriteria() });
      }

      const $sort = {};
      if (state.searchCriteria.sort) {
        if (state.searchCriteria.sort.sortBy === 'distance' && state.userPosition && state.userPosition.latitude && state.userPosition.longitude) {
          const centerMapPoint = state.maps.map.getCenter();
          const lat1 = Math.abs(state.currentLocation.lat);
          const lng1 = Math.abs(state.currentLocation.lng);
          const lat2 = Math.abs(centerMapPoint.lat());
          const lng2 = Math.abs(centerMapPoint.lng());
          if (Math.abs(lat1 - lat2) >= Math.abs(lng1 - lng2)) {
            const order = lat2 > lat1 ? 1 : -1;
            $sort['coordinates.lat'] = order;
          } else {
            const order = lng2 > lng1 ? 1 : -1;
            $sort['coordinates.lng'] = order;
          }
        } else {
          $sort[state.searchCriteria.sort.sortBy] = state.searchCriteria.sort.order;
        }
        pipelines.push({ $sort });
      }

      const promiseChain = [
        WidgetController.searchLocationsV2(pipelines, state.searchCriteria.page)
      ];

      if (state.searchCriteria.searchValue) {
        if (!state.searchableTitles.length) {
          promiseChain.push(
            WidgetController.getSearchEngineResults(state.searchCriteria.searchValue)
          );
        } else {
          promiseChain.push(new Promise((resolve) => { }));
        }

        if (!state.nearestLocation && state.checkNearLocation) {
          promiseChain.push(this.getNearestLocation());
        }
      }

      Promise.all(promiseChain)
        .then(([result, result2, nearestLocation]) => {
          state.fetchingNextPage = false;
          state.fetchingEndReached = result.length < state.searchCriteria.pageSize;

          result = result.filter((elem1) => (
            !state.listLocations.find((elem) => elem?.id === elem1?.id)
          )).map((r) => ({ ...r, distance: this.calculateLocationDistance(r?.coordinates) }));

          state.listLocations = state.listLocations.concat(result);
          if (state.searchCriteria.sort.sortBy === 'distance' && state.userPosition && state.userPosition.latitude && state.userPosition.longitude) {
            result.sort((a, b) => a.distance.split(" ")[0] - b.distance.split(" ")[0]);
            state.listLocations.sort((a, b) => a.distance.split(" ")[0] - b.distance.split(" ")[0]);
          }

          if (state.searchCriteria.searchValue
          && !state.listLocations.length
          && !state.nearestLocation
          && nearestLocation
          && state.checkNearLocation) {
            state.nearestLocation = nearestLocation;
            state.checkNearLocation = false;
            const latLng = new google.maps.LatLng(state.nearestLocation.coordinates.lat, state.nearestLocation.coordinates.lng);
            state.maps.map.center(latLng);
            state.maps.map.setZoom(10);
            this.triggerSearchOnMapIdle();
          } else if (state.searchCriteria.searchValue
            && !state.listLocations.length
            && !state.searchableTitles.length) {
            const searchableTitles = result2?.hits?.hits?.map((elem) => (elem._source.searchable.title));
            if (searchableTitles && searchableTitles.length > 0) {
              state.searchableTitles = searchableTitles;
              return this.searchLocations();
            }
          }

          mapSearchControl.refresh();

          // Render Map listLocations
          mapView.renderListingLocations(result);

          if (!state.fetchingEndReached && state.listLocations.length < 200) {
            state.searchCriteria.page += 1;
            return this.searchLocations();
          }

          return resolve(result);
        })
        .catch(reject);
    });
  },
};

export default locationsService;
