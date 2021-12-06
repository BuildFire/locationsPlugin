import Categories from '../../../../repository/Categories';
import authManager from '../../../../UserAccessControl/authManager';

export default {
  createCategory(category) {
    return Categories.create(category);
  },
  searchCategories(options = {}) {
    return Categories.search(options);
  },
  updateCategory(categoryId, category) {
    return Categories.update(categoryId, category);
  },
  deleteCategory(categoryId, category) {
    category.deletedOn = new Date();
    category.deletedBy = authManager.currentUser;
    return Categories.delete(categoryId, category.toJSON());
  }
};
