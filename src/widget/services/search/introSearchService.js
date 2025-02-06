/* eslint-disable max-len */
import { buildOpenNowCriteria, buildSearchCriteria } from "./shared";
import state from "../../js/state";
import WidgetController from "../../widget.controller";
import constants from "../../js/constants";

const IntroSearchService = {
  _getUserCoordinates() {
    const coordinates = [];
    if (state.userPosition && state.userPosition.latitude && state.userPosition.longitude) {
      coordinates.push(state.userPosition.longitude);
      coordinates.push(state.userPosition.latitude);
    } else {
      const defaultPosition = constants.getDefaultLocation();
      coordinates.push(defaultPosition.lng);
      coordinates.push(defaultPosition.lat);
    }

    return coordinates;
  },

  _setUpIntroGeoQuery(query) {
    const pipelines = [];
    let centerSphere, radius;

    if (state.settings.introductoryListView.searchOptions?.mode === constants.SearchLocationsModes.AreaRadius) {
      centerSphere = [
        state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.lng || 1,
        state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.lat || 1,
      ];
      const _radiusMiles = state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.radius || 1;
      radius = _radiusMiles / 3963.2; // convert miles to radians
    } else {
      centerSphere = IntroSearchService._getUserCoordinates();
      radius = 100 / 6378.1; // 100 km in radians
    }

    if (state.currentLocation) { // this is for user search by location name
      centerSphere = [state.currentLocation.lng, state.currentLocation.lat];
    }

    const $geoNear = { // near user position to calculate distance for each location
      near: { type: "Point", coordinates: IntroSearchService._getUserCoordinates() },
      key: "_buildfire.geo",
      distanceField: "distance",
      query: { ...query }
    };
    const $match = {
      "_buildfire.geo": {
        $geoWithin: { // find locations within a specific area
          $centerSphere: [centerSphere, radius]
        }
      }
    };
    pipelines.push({ $geoNear });
    pipelines.push({ $match });

    if (state.searchCriteria.sort) {
      const $sort = {};
      $sort[state.introSort.sortBy] = state.introSort.order;
      pipelines.push({ $sort });
    }
    return pipelines;
  },

  _setupOtherLocationsPipelines(query) {
    const pipelines = [];
    let $match = {};
    const $sort = {
      "_buildfire.index.text": 1
    };

    const existLocationStrings = state.listLocations.map((location) => location._buildfire.index.string1);

    if (state.searchCriteria.openingNow) {
      $match = buildOpenNowCriteria();
    }

    $match = {
      ...query,
      ...$match,
      "_buildfire.index.string1": { $nin: existLocationStrings },
    };

    pipelines.push({ $match });
    pipelines.push({ $sort });

    return pipelines;
  },

  _handleSearchModePipelines() {
    const query = buildSearchCriteria();
    let pipelines;

    if (state.settings.introductoryListView.searchOptions?.mode === constants.SearchLocationsModes.All && !state.currentLocation) {
      if (!state.fetchingAllNearReached) {
        pipelines = this._setUpIntroGeoQuery(query);
      } else {
        pipelines = this._setupOtherLocationsPipelines(query);
        state.searchCriteria.page = 0;
      }
    } else {
      // the default search mode is UserPosition
      state.fetchingAllNearReached = true;
      pipelines = this._setUpIntroGeoQuery(query);
    }

    return pipelines;
  },

  searchIntroLocations() {
    const pipelines = this._handleSearchModePipelines();

    const promiseChain = [
      WidgetController.searchLocationsV2(pipelines, state.searchCriteria.page)
    ];

    if (state.searchCriteria.searchValue && !state.searchableTitles.length) {
      promiseChain.push(WidgetController.getSearchEngineResults(state.searchCriteria.searchValue));
    }

    return Promise.all(promiseChain)
      .then(([aggregateLocations, searchEngineLocations]) => {
        state.fetchingNextPage = false;
        state.fetchingEndReached = aggregateLocations.length < state.searchCriteria.pageSize && state.fetchingAllNearReached;

        if (aggregateLocations.length < state.searchCriteria.pageSize && !state.fetchingAllNearReached && state.settings.introductoryListView.searchOptions?.mode === constants.SearchLocationsModes.All) {
          state.fetchingAllNearReached = true;
          state.searchCriteria.page = 0;
          state.printOtherLocationMessage = true;
        } else {
          state.searchCriteria.page += 1;
        }

        return ({
          aggregateLocations,
          searchEngineLocations,
        });
      })
      .catch(console.error);
  },
};

export default IntroSearchService;
