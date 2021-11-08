/**
 * Categories data access
 * @class
 */
export default class Categories {
  /**
   * Categories key in publicData
   * @static
   */
  static TAG = 'categories';

  /**
   * retrieve categories data with filter
   * @param {object} options
   * @static
   * @returns {promise} query result
   */
  static search(options) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.search(options, Categories.TAG, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
  }

  /**
   * 
   * @param {Category} category 
   * @static
   * @returns {promise}
   */
  static insert(category) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.insert(category, Categories.TAG, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
  }

  /**
   * 
   * @param {string} categoryId 
   * @param {Category} category 
   * @returns {promise}
   */
  static update(categoryId, category) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.update(categoryId, category, Categories.TAG, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
  }

  /**
   * 
   * @param {string} categoryId 
   * @static
   * @returns {promise}
   */
  static delete(categoryId) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.delete(categoryId, Categories.TAG, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
  }


}