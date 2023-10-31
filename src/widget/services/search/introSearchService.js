/* eslint-disable max-len */
import { buildOpenNowCriteria, buildSearchCriteria } from "./shared";
import state from "../../js/state";
import WidgetController from "../../widget.controller";
import { convertMileToMeter } from "../../js/util/helpers";

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
    const radiusInMeter = convertMileToMeter(Number(radius));

    const $geoNear = {
      near: { type: "Point", coordinates: [lng, lat] },
      key: "_buildfire.geo",
      maxDistance: radiusInMeter,
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
	let getFromSearchEngine = false;
	let checkOtherLocations = false;

    const promiseChain = [
      WidgetController.searchLocationsV2(pipelines, state.searchCriteria.page)
    ];

    if (state.searchCriteria.searchValue && !state.searchableTitles.length) {
      getFromSearchEngine = true;
      promiseChain.push(WidgetController.getSearchEngineResults(state.searchCriteria.searchValue));
    }

    if (state.settings.introductoryListView.searchOptions?.mode === "All" && state.searchCriteria.page === 0 && !state.fetchingAllNearReached) {
      checkOtherLocations = true;
      const otherLocationsPipelines = this.setupOtherLocationsPipelines({});
      promiseChain.push(WidgetController.searchLocationsV2(otherLocationsPipelines, state.searchCriteria.page, 1));
    }

    return Promise.all(promiseChain)
      .then((result) => {
        const aggregateLocations = [...result[0]];
        let searchEngineLocations;
        let otherLocations;

        if (getFromSearchEngine && checkOtherLocations) {
          searchEngineLocations = [...result[1]];
          otherLocations = [...result[2]];
        } else if (getFromSearchEngine) {
          searchEngineLocations = [...result[1]];
        } else if (checkOtherLocations) {
          otherLocations = [...result[1]];
        }

        state.fetchingNextPage = false;
        state.fetchingEndReached = aggregateLocations.length < state.searchCriteria.pageSize && state.fetchingAllNearReached && state.settings.introductoryListView.searchOptions?.mode === "All";
        let printOtherLocationMessage;
        let printNearLocationMessage;

        if (aggregateLocations.length && otherLocations && otherLocations.length) {
          const filteredOtherLocations = otherLocations.filter((location) => !aggregateLocations.find((near) => near.id === location.id));
          if (filteredOtherLocations.length) {
            printNearLocationMessage = true;
          }
        }

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
          printNearLocationMessage
        });
      })
      .catch(console.error);
  },
};

export default IntroSearchService;
