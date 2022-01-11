
/**
 * Locations data access
 * @class
 */
export default class SearchEngine {
  /**
   * Insert a new data object
   * @param {string} tag
   * @param {string} key
   * @param {Object} data
   * @static
   * @return {promise} query result
   */
  static add(tag, key, data) {
    return new Promise((resolve, reject) => {
      buildfire.services.searchEngine.save({
        tag,
        key,
        data: { locationId: key },
        title: data.title,
        description: data.description ? data.description.replace(/(<([^>]+)>)/gi, "") : "",
        imageUrl: data.listImage,
        keywords: [data.address, data.formattedAddress, data.addressAlias, data.subtitle].join(',')
      }, (error, record) => {
        if (error) return reject(error);
        resolve(record);
      });
    });
  }

  /**
   * @param {string} tag
   * @param {object} params
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
   * @param {string} tag
   * @param {string} key
   * @param {Object} data
   * @returns {promise}
   */
  static update(tag, key, data) {
    return new Promise((resolve, reject) => {
      buildfire.services.searchEngine.save({
        tag,
        key,
        data: { locationId: key },
        title: data.title,
        description: data.description ? data.description.replace(/(<([^>]+)>)/gi, "") : "",
        imageUrl: data.listImage,
        keywords: [data.address, data.formattedAddress, data.addressAlias, data.subtitle].join(',')
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
