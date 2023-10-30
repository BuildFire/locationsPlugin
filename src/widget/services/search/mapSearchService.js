/* eslint-disable max-len */
import WidgetController from '../../widget.controller';
import mapSearchControl from '../../js/map/search-control';
import state from "../../js/state";
import { buildOpenNowCriteria, buildSearchCriteria } from './shared';

const MapSearchService = {

  _getNearestLocation() {
    const pipelines = [];
    const query = buildSearchCriteria();

    const $geoNear = {
      near: { type: "Point", coordinates: [state.currentLocation.lng, state.currentLocation.lat] },
      key: "_buildfire.geo",
      distanceField: "distance",
      query: { ...query },
    };

    pipelines.push({ $geoNear });

    if (state.searchCriteria.openingNow) {
      pipelines.push({ $match: buildOpenNowCriteria() });
    }

    const $sort = { distance: 1 };
    pipelines.push({ $sort });

    return WidgetController.searchLocationsV2(pipelines, 0, 1).then((results) => results[0]);
  },

  // get locations on map view
  searchLocations() {
    return new Promise((resolve, reject) => {
      const pipelines = [];
      const query = buildSearchCriteria();
      const { mapBounds } = state.maps.map;

      if (!mapBounds || !Array.isArray(mapBounds)) {
        return resolve({});
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
        pipelines.push({ $match: buildOpenNowCriteria() });
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
          promiseChain.push(this._getNearestLocation());
        }
      }

      // TODO: rename result variables
      Promise.all(promiseChain)
        .then(([result, result2, nearestLocation]) => {
          state.fetchingNextPage = false;
          state.fetchingEndReached = result.length < state.searchCriteria.pageSize;
          state.searchCriteria.page += 1;

          return resolve({ result, result2, nearestLocation });
        })
        .catch(console.error);
    });
  },
};

export default MapSearchService;
