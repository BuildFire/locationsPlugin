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
}
