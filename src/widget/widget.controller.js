import Locations from '../repository/Locations';
import Categories from '../repository/Categories';
import Settings from '../repository/Settings';
import searchEngine from '../repository/searchEngine';
import Location from '../repository/Locations';
// import Location from '../../entities/Location';
// import authManager from '../../UserAccessControl/authManager';
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
};
