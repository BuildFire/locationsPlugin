import Categories from '../../widget/js/global/repository/Categories';
import Settings from '../../widget/js/global/repository/Settings';

export default {
  getSettings() {
    return Settings.get();
  },
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
