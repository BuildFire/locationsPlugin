/* eslint-disable no-restricted-syntax */
import Categories from '../../../../repository/Categories';
import authManager from '../../../../UserAccessControl/authManager';
import Analytics from '../../../../utils/analytics';

export default {
  createCategory(category) {
    category.createdOn = new Date();
    category.createdBy = authManager.currentUser;
    return Categories.create(category.toJSON()).then((result) => {
      Analytics.registerEvent(`${result.title} (Category Selected)`, `categories_${result.id}_selected`, '');
      for (const sub of result.subcategories) {
        Analytics.registerEvent(`${sub.title} (Subcategory Selected)`, `subcategories_${sub.id}_selected`, '');
      }
      return result;
    });
  },
  bulkCreateCategories(categories) {
    return Categories.bulkCreate(categories);
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
