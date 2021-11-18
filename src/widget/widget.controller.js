import Locations from '../repository/Locations';
import Categories from '../repository/Categories';
// import Location from '../../entities/Location';
// import authManager from '../../UserAccessControl/authManager';

export default {
  getLocation(id) {
    return Locations.getById(id);
  },
  searchCategories(options = {}) {
    return Categories.search(options);
  },
  searchLocations(options = {}) {
    return Locations.search(options);
  }
};
