import Categories from '../../../../repository/Categories';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  createCategory(category) {
    category.createdOn = new Date();
    category.createdBy = authManager.currentUser;
    return Categories.create(category.toJSON());
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
