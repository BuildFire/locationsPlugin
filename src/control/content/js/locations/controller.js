import Location from '../../../../repository/Locations';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  createLocation(location) {
    location.createdOn = new Date();
    location.createdBy = authManager.currentUser;
    return Location.add(location.toJSON());
  },
  searchLocations(options = {}) {
    options.recordCount = true;
    return Location.search(options);
  },
  updateLocation(locationId, location) {
    location.lastUpdatedOn = new Date();
    location.lastUpdatedBy = authManager.currentUser;
    return Location.update(locationId, location.toJSON());
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
  deleteLocation(locationId) {
    return Location.delete(locationId);
  }
};
