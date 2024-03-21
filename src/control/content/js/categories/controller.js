/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-syntax */
import Categories from '../../../../repository/Categories';
import authManager from '../../../../UserAccessControl/authManager';
import Analytics from '../../../../utils/analytics';

export default {
  createCategory(category) {
    category.createdOn = new Date();
    category.createdBy = authManager.sanitizedCurrentUser;
    return Categories.create(category.toJSON()).then((result) => {
      Analytics.registerCategoryEvent(result.id, result.title);
      for (const sub of result.subcategories) {
        Analytics.registerSubcategoryEvent(sub.id, sub.title);
      }
      return result;
    });
  },
  bulkCreateCategories(categories) {
    return Categories.bulkCreate(categories).then((insertedCategories) => {
      this.registerCategoryAnalytics(insertedCategories.data.length)
      return insertedCategories;
    });
  },

  registerCategoryAnalytics(categories){
    const newDataCount = categories;
    for (let skip = 0; skip < newDataCount; skip += 50) {
      this.searchCategories({ skip, limit: 50, sort: { createdOn: -1 } })
        .then((result) => {
          for (const category of result) {
            Analytics.registerCategoryEvent(category.id, category.title);
            for (const sub of category.subcategories) {
              Analytics.registerSubcategoryEvent(sub.id, sub.title);
            }
          }
        }).catch(console.error);
    }
  },

  _bulkCreateCategories(categories) {
    return Categories.bulkCreate(categories)
  },
  searchCategories(options = {}) {
    return Categories.search(options);
  },
  getAllCategories(callback) {
    let searchOptions = {
        limit: 50,
        skip: 0,

    }, categories = [];

    const getCategoriesData = (callback) => {
        Categories.search(searchOptions).then(result => {
          if (result.length < searchOptions.limit) {
              categories = categories.concat(result);
              categories = categories.filter(x => x.deletedBy == null);
              return callback(categories);
          } else {
              searchOptions.skip = searchOptions.skip + searchOptions.limit;
              categories = categories.concat(result);
              return getCategoriesData(callback);
          }
        })
    }

    getCategoriesData(callback);

  },

  updateCategory(categoryId, category) {
    category.lastUpdatedOn = new Date();
    category.lastUpdatedBy = authManager.sanitizedCurrentUser;
    return Categories.update(categoryId, category.toJSON());
  },
  deleteCategory(categoryId, category) {
    category.deletedOn = new Date();
    category.deletedBy = authManager.sanitizedCurrentUser;
    return Categories.delete(categoryId, category.toJSON());
  }
};
