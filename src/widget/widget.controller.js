import Locations from '../repository/Locations';
import Categories from '../repository/Categories';
import Settings from '../repository/Settings';
// import Location from '../../entities/Location';
// import authManager from '../../UserAccessControl/authManager';
const DEFAULT_PAGE = 0;
const DEFAULT_PAGE_SIZE = 7;

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
      pageSize: DEFAULT_PAGE_SIZE,
      page: DEFAULT_PAGE,
      recordCount: true,
      sort: {
        title: -1
      },
      ...options
    };
    return Locations.search({ ...defaultOptions, ...options });
  },
  searchLocationsV2(pipelines = [], page = 0, pageSize = 50) {
    return Locations.aggregate(pipelines, page, pageSize);
  }
};
