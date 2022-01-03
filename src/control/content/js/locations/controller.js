import Location from '../../../../repository/Locations';
import SearchEngine from '../../../../repository/searchEngine';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  createLocation(location) {
    location.createdOn = new Date();
    location.createdBy = authManager.currentUser;
    return SearchEngine.add(Location.TAG, location.toJSON()).then((seResult) => {
      location.searchEngineRefId = seResult.id;
      return Location.add(location.toJSON());
    });
  },
  bulkCreateLocation(locations) {
    return Location.bulkAdd(locations);
  },
  searchLocations(options = {}) {
    options.recordCount = true;
    return Location.search(options);
  },
  updateLocation(locationId, location) {
    location.lastUpdatedOn = new Date();
    location.lastUpdatedBy = authManager.currentUser;
    const promiseChain = [
      Location.update(locationId, location.toJSON())
    ];
    if (location.searchEngineRefId) {
      promiseChain.push(SearchEngine.update(Location.TAG, location.searchEngineRefId, location.toJSON()));
    }
    return Promise.all(promiseChain);
  },
  getPinnedLocation() {
    const options = {};
    options.sort = { "_buildfire.index.number1": 1 };

    options.filter = {
      $or: [
      {"_buildfire.index.number1": 0},
      {"_buildfire.index.number1": 1},
      {"_buildfire.index.number1": 2},
    ]
  };
   return this.searchLocations(options)
  },
  deleteLocation(locationId, searchEngineRefId) {
    const promiseChain = [
      Location.delete(locationId)
    ];

    if (searchEngineRefId) {
      promiseChain.push(SearchEngine.delete(Location.TAG, searchEngineRefId));
    }
    return Promise.all(promiseChain);
  }
};
