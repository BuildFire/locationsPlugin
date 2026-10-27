/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-syntax */
import Categories from '../../../../widget/js/global/repository/Categories';
import authManager from '../../../../UserAccessControl/authManager';
import Analytics from '../../../../utils/analytics';

export default {
  createCategory(category) {
    category.createdOn = new Date();
    category.createdBy = authManager.sanitizedCurrentUser;
    return Categories.create(category.toJSON()).then((result) => {
      if (buildfire.services && buildfire.services.contract && buildfire.services.contract.events) {
        buildfire.services.contract.events.send('categoryCreated', {
          categoryId: result.id,
          title: result.title,
          iconUrl: result.iconUrl || null,
          subcategories: result.subcategories.map((sub) => sub.title),
          createdOn: result.createdOn ? new Date(result.createdOn).toISOString() : null,
          createdBy: result.createdBy ? { userId: result.createdBy._id || null, displayName: result.createdBy.displayName || null } : null
        });
      }
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
    const options = {
      limit: 50,
      skip: 0,
      filter: {},
      sort: { title: 1 }
    };
    let categories = [];

    options.filter["_buildfire.index.date1"] = { $type: 10 };

    const getCategoriesData = (callback) => {
        Categories.search(options).then((result) => {
          if (result.length < options.limit) {
              categories = categories.concat(result);
              return callback(categories);
          } else {
              options.skip = options.skip + options.limit;
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
