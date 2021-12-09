import Location from '../../../../repository/Locations';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  createLocation(location) {
    location.createdOn = new Date();
    location.createdBy = authManager.currentUser;
    return Location.add(location.toJSON());
  },
  searchLocations(options = {}) {
    const defaultOptions = {
      recordCount: true
    };
    return Location.search({ ...defaultOptions, ...options });
  },
  updateLocation(locationId, location) {
    location.lastUpdatedOn = new Date();
    location.lastUpdatedBy = authManager.currentUser;
    return Location.update(locationId, location.toJSON());
  },
  deleteLocation(locationId) {
    return Location.delete(locationId);
  }
};
