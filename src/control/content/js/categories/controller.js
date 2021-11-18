import Categories from '../../../../repository/Categories';

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
  deleteCategory(categoryId) {
    return Categories.delete(categoryId);
  }
};
