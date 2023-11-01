/* eslint-disable max-len */
import { buildOpenNowCriteria, buildSearchCriteria } from "./shared";
import state from "../../js/state";
import WidgetController from "../../widget.controller";

const IntroSearchService = {
  setupNearPipelines(query) {
    const pipelines = [];

    const $geoNear = {
      near: { type: "Point", coordinates: [state.currentLocation.lng, state.currentLocation.lat] },
      key: "_buildfire.geo",
      maxDistance: 100000,
      distanceField: "distance",
      query: { ...query }
    };
    pipelines.push({ $geoNear });

    if (state.searchCriteria.sort) {
      const $sort = {};
      $sort[state.introSort.sortBy] = state.introSort.order;
      pipelines.push({ $sort });
    }

    return pipelines;
  },

  setupAreaRadiusPipelines(query) {
    const pipelines = [];

    const lng = state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.lng || 1;
    const lat = state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.lat || 1;
    const radius = state.settings.introductoryListView.searchOptions?.areaRadiusOptions?.radius || 1;

    const $geoNear = {
      near: { type: "Point", coordinates: [state.currentLocation.lng, state.currentLocation.lat] },
      key: "_buildfire.geo",
      distanceField: "distance",
      query: { ...query }
    };
    const $match = {
      "_buildfire.geo": {
        $geoWithin: {
          $centerSphere: [[lng, lat], radius / 3963.2] // convert miles to radians
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

  setupOtherLocationsPipelines(query) {
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

  handleSearchModePipelines() {
    const query = buildSearchCriteria();
    let pipelines;

    if (state.settings.introductoryListView.searchOptions?.mode === "All") {
      if (!state.fetchingAllNearReached) {
        pipelines = this.setupNearPipelines(query);
      } else {
        pipelines = this.setupOtherLocationsPipelines(query);
      }
    } else if (state.settings.introductoryListView.searchOptions?.mode === "AreaRadius") {
      pipelines = this.setupAreaRadiusPipelines(query);
    } else {
      pipelines = this.setupNearPipelines(query);
    }

    return pipelines;
  },

  searchIntroLocations() {
    const pipelines = this.handleSearchModePipelines();

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
        let printOtherLocationMessage;

        if (aggregateLocations.length < state.searchCriteria.pageSize && !state.fetchingAllNearReached && state.settings.introductoryListView.searchOptions?.mode === "All") {
          state.fetchingAllNearReached = true;
          state.searchCriteria.page = 0;
          printOtherLocationMessage = true;
        } else {
          state.searchCriteria.page += 1;
        }

        return ({
          aggregateLocations,
          searchEngineLocations,
          printOtherLocationMessage,
        });
      })
      .catch(console.error);
  },
};

export default IntroSearchService;
