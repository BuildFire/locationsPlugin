/**
 * Locations data access
 * @class
 */
export default class Locations {
  /**
   * Locations key in publicData
   * @static
   */
  static TAG = 'locations';

  /**
   * retrieve a certain location data object
   * @param {string} id
   * @static
   * @return {promise} query result
   */
  static getById(id) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.getById(id, Locations.TAG, (error, record) => {
        if (error) return reject(error);
        resolve(record);
      });
    });
  }

  /**
   * Insert a new location data object
   * @param {object} data
   * @static
   * @return {promise} query result
   */
  static add(data) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.insert(data, Locations.TAG, (error, record) => {
        if (error) return reject(error);
        resolve(record);
      });
    });
  }

  /**
   * Get and pull a matching subset of the locations.
   * @param {object} options
   * @static
   * @return {promise} query result
   */
  static search(options) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.search(options, Locations.TAG, (error, records) => {
        if (error) return reject(error);
        resolve(records);
      });
    });
  }
}
