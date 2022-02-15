/* eslint-disable no-loop-func */
/* eslint-disable no-restricted-syntax */
import Categories from '../../../../repository/Categories';
import authManager from '../../../../UserAccessControl/authManager';
import Analytics from '../../../../utils/analytics';

export default {
  createCategory(category) {
    category.createdOn = new Date();
    category.createdBy = authManager.currentUser;
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
      const newDataCount = insertedCategories.data.length;
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
      return insertedCategories;
    });
  },
  searchCategories(options = {}) {
    return Categories.search(options);
  },
  updateCategory(categoryId, category) {
    category.lastUpdatedOn = new Date();
    category.lastUpdatedBy = authManager.currentUser;
    return Categories.update(categoryId, category.toJSON());
  },
  deleteCategory(categoryId, category) {
    category.deletedOn = new Date();
    category.deletedBy = authManager.currentUser;
    return Categories.delete(categoryId, category.toJSON());
  }
};
