import Locations from './js/global/repository/Locations';
import Categories from './js/global/repository/Categories';
import Settings from './js/global/repository/Settings';
import searchEngine from './js/global/repository/searchEngine';
import Location from './js/global/repository/Locations';
import { generateUUID } from './js/global/helpers';
import state from './js/state';
import Analytics from '../utils/analytics';
import DeepLink from '../utils/deeplink';
import SearchEngine from './js/global/repository/searchEngine';

const DEFAULT_PAGE = 0;

export default {
  getLocation(id) {
    return Locations.getById(id);
  },
  getAppSettings() {
    return Settings.get();
  },
  searchCategories(options = {}) {
    if (!options.filter) options.filter = {};
    options.filter['_buildfire.index.date1'] = { $type: 10 };
    return Categories.search(options);
  },
  searchLocations(options = {}) {
    const defaultOptions = {
      pageSize: 50,
      page: DEFAULT_PAGE,
      recordCount: true,
      ...options
    };
    return Locations.search(defaultOptions);
  },
  getSearchEngineResults(searchValue, page = 0, pageSize = 10) {
    return searchEngine.search(Locations.TAG, {
      searchText: searchValue,
      pageIndex: page,
      pageSize
    });
  },
  searchLocationsV2(pipelines = [], page = 0, pageSize = 50) {
    return Locations.aggregate(pipelines, page, pageSize);
  },
  getPinnedLocations() {
    const options = {};
    options.sort = { "_buildfire.index.number1": 1 };

    options.filter = {
      "_buildfire.index.number1": { $in: [1, 2, 3] }
    };
    return this.searchLocations(options);
  },
  updateLocationRating(locationId, summary) {
    const payload = {
      $set: {
        lastUpdatedOn: new Date(),
        rating: {
          total: summary.total,
          count: summary.count,
          average: (summary.total / summary.count)
        }
      }
    };
    return Location.update(locationId, payload);
  },
  updateLocation(id, payload) {
    return Location.update(id, payload);
  },
  createLocation(location) { // location should be a model
    location.clientId = generateUUID();
    location.createdOn = new Date();
    location.createdBy = state.sanitizedCurrentUser;
    return Location.add(location.toJSON()).then((result) => {
      if (buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
        buildfire.services.contract.events.send('locationCreated', {
          locationId: result.id,
          title: result.title,
          subtitle: result.subtitle || null,
          address: result.address,
          latitude: result.coordinates.lat,
          longitude: result.coordinates.lng,
          listImage: result.listImage,
          createdOn: result.createdOn ? new Date(result.createdOn).toISOString() : null,
          createdBy: result.createdBy ? { userId: result.createdBy._id || null, displayName: result.createdBy.displayName || null } : null
        });
      }
      Analytics.registerLocationViewedEvent(result.id, result.title);
      DeepLink.registerDeeplink(result);
      return SearchEngine.add(Location.TAG, result.id, result).then(() => result);
    });
  },
  deleteLocation(locationId) {
    const promiseChain = [
      Location.delete(locationId),
      DeepLink.unregisterDeeplink(locationId),
      SearchEngine.delete(Location.TAG, locationId)
    ];
    return Promise.allSettled(promiseChain).then((results) => {
      if (results[0].status === 'fulfilled' && buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
        buildfire.services.contract.events.send('locationDeleted', { locationId });
      }
      return results;
    });
  },
  subscribeToLocationUpdates(locationId, userId) {
    return Location.subscribeToLocationUpdates(locationId, userId);
  },
  unsubscribeFromLocationUpdates(locationId, userId) {
    return Location.unsubscribeFromLocationUpdates(locationId, userId);
  }
};
