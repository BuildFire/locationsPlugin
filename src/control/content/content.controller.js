import Locations from '../../repository/Locations';
// import Location from '../../entities/Location';
// import authManager from '../../UserAccessControl/authManager';

export default {
  getLocation(id) {
    return Locations.getById(id);
  }
};
