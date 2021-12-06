import Location from '../../../../repository/Locations';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  createLocation(location) {
    location.createdOn = new Date();
    location.createdBy = authManager.currentUser;
    return Location.add(location);
  },
  searchLocations(options = {}) {
    return Location.search(options);
  },
  updateLocation(locationId, location) {
    location.lastUpdatedOn = new Date();
    location.lastUpdatedBy = authManager.currentUser;
    return Location.update(locationId, location);
  },
  deleteLocation(locationId) {
    return Location.delete(locationId);
  }
};
