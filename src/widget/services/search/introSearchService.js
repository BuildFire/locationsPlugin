/* eslint-disable max-len */
import { buildOpenNowCriteria, buildSearchCriteria } from "./shared";
import state from "../../js/state";
import WidgetController from "../../widget.controller";

const IntroSearchService = {
  printOtherLocationMessage: false,
  _handleSearchMode() {
    const query = buildSearchCriteria();
    const existLocationStrings = state.listLocations.map((location) => location._buildfire.index.string1);
    let $match;
    let $geoNear;

    if (state.searchCriteria.openingNow) {
      $match = buildOpenNowCriteria();
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
          "_buildfire.index.string1": { $nin: existLocationStrings },
        };
      } else {
        $match = {
          ...query,
          "_buildfire.index.string1": { $nin: existLocationStrings },
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
    const searchPipeline = this._handleSearchMode();

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

    // TODO: rename result variables
    return Promise.all(promiseChain)
      .then(([result, result2]) => {
        state.fetchingNextPage = false;
        state.fetchingEndReached = result.length < state.searchCriteria.pageSize && state.fetchingAllNearReached;
        state.searchCriteria.page += 1;

        if (result.length < state.searchCriteria.pageSize && !state.fetchingAllNearReached) {
          state.fetchingAllNearReached = true;
          state.searchCriteria.page = 0;
          this.printOtherLocationMessage = true;
        }

        return ({ result, result2, printOtherLocationMessage: this.printOtherLocationMessage });
      })
      .catch(console.error);
  },
};

export default IntroSearchService;
