/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
import Location from '../../../../repository/Locations';
import Analytics from '../../../../utils/analytics';
import SearchEngine from '../../../../repository/searchEngine';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  createLocation(location) {
    location.createdOn = new Date();
    location.createdBy = authManager.currentUser;
    return Location.add(location.toJSON()).then((result) => {
      Analytics.registerEvent(`${result.title} - viewed`, `locations_${result.id}_viewed`, '');
      return SearchEngine.add(Location.TAG, result.id, result).then(() => result);
    });
  },
  bulkCreateLocation(locations) {
    return Location.bulkAdd(locations).then((insertedLocations) => {
      const newDataCount = insertedLocations.length;
      for (let skip = 0; skip < newDataCount; skip += 50) {
        this.searchLocations({ skip, limit: 50, sort: { "_buildfire.index.date1": -1 } }).then(({ result, totalRecord }) => {
          for (const location of result) {
            Analytics.registerEvent(`${location.title} - viewed`, `locations_${location.id}_viewed`, '');
            SearchEngine.add(Location.TAG, location.id, location).catch(console.error);
          }
        }).catch(console.error);
      }
      return insertedLocations;
    });
  },
  searchLocations(options = {}) {
    options.recordCount = true;
    return Location.search(options);
  },
  updateLocation(locationId, location) {
    location.lastUpdatedOn = new Date();
    location.lastUpdatedBy = authManager.currentUser;
    const promiseChain = [
      Location.update(locationId, location.toJSON()),
      SearchEngine.update(Location.TAG, locationId, location.toJSON())
    ];
    return Promise.all(promiseChain);
  },
  getPinnedLocation() {
    const options = {};
    options.sort = { "_buildfire.index.number1": 1 };

    options.filter = {
      "_buildfire.index.number1": { $in: [1, 2, 3] }
    };
    return this.searchLocations(options);
  },
  deleteLocation(locationId) {
    const promiseChain = [
      Location.delete(locationId),
      SearchEngine.delete(Location.TAG, locationId)
    ];
    return Promise.allSettled(promiseChain);
  }
};
