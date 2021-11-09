import Locations from '../../repository/Locations';
import Categories from '../../repository/Categories';
// import Location from '../../entities/Location';
// import authManager from '../../UserAccessControl/authManager';

export default {
  getCategories(search, sort, page = 0, limit = 50) {
    const options = {
      sort: { title: 1 },
      page,
      pageSize: limit,
      recordCount: true
    };

    if (search) {
      options.filter = {
        title: {"$regex": search}
      }
    }

    return Categories.search(options);
  }
};
