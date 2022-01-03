
/**
 * Locations data access
 * @class
 */
export default class SearchEngine {

  /**
   * Insert a new data object
   * @param {object} data
   * @static
   * @return {promise} query result
   */
  static add(tag, data) {
    return new Promise((resolve, reject) => {
      buildfire.services.searchEngine.insert({
        tag,
        title: data.title,
        description: data.description,
        imageUrl: data.listImage,
        data
      }, (error, record) => {
        if (error) return reject(error);
        resolve(record);
      });
    });
  }

  /**
   * @param {object} options
   * @static
   * @return {promise} query result
   */
  static search(tag, params = {}) {
    return new Promise((resolve, reject) => {
      buildfire.services.searchEngine.search({
        tag,
        searchText: params.searchText,
        pageSize: params.pageSize || 50,
        pageIndex: params.pageIndex || 0,
      }, (error, response) => {
        if (error) return reject(error);
        resolve(response);
      });
    });
  }

  /**
   * @param {string} id
   * @param {Object} data
   * @returns {promise}
   */
  static update(tag, id, data) {
    return new Promise((resolve, reject) => {
      buildfire.services.searchEngine.update({
        id,
        tag,
        title: data.title,
        description: data.description,
        imageUrl: data.listImage,
        data
      }, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
  }

  /**
   *
   * @param {string} tag
   * @param {string} id
   * @static
   * @returns {promise}
   */
  static delete(tag, id) {
    return new Promise((resolve, reject) => {
      buildfire.services.searchEngine.delete({
        id,
        tag
      }, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });
    });
  }
}