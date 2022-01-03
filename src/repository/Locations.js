import Location from "../entities/Location";

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
        resolve(new Location({ ...record.data, id: record.id }).toJSON());
      });
    });
  }

    /**
   * Insert bulk locations
   * @param {Location[]} locations
   * @static
   * @return {promise} query result
   */
     static bulkAdd(locations) {
      return new Promise((resolve, reject) => {
        buildfire.publicData.bulkInsert(locations, Locations.TAG, (error, record) => {
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
      buildfire.publicData.search(options, Locations.TAG, (error, response) => {
        if (error) return reject(error);
        response.result = response.result.map((c) => new Location({ ...c.data, id: c.id }).toJSON());
        resolve(response);
      });
    });
  }

  /**
   * Get and aggregate data.
   * @param {Array} pipelines stages
   * @param {number} skip
   * @param {number} limit
   * @static
   * @return {promise} query result
  */

  static aggregate(pipelines = [], page = 0, pageSize = 50) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.aggregate({
        pipelineStages: pipelines,
        page,
        pageSize
      },  Locations.TAG, (err, result) => {
        if (err) {
          return reject(err);
        }

        result = result.map((c) => new Location({ ...c.data, id: c._id }).toJSON());
        resolve(result);
      });
    });
  }

   /**
   * @param {string} locationId
   * @param {Location} location
   * @returns {promise}
   */
     static update(locationId, location) {
      return new Promise((resolve, reject) => {
        buildfire.publicData.update(locationId, location, Locations.TAG, (error, result) => {
          if (error) return reject(error);
          resolve(result);
        });
      });
    }

    /**
     *
     * @param {string} locationId
     * @static
     * @returns {promise}
     */
    static delete(locationId) {
      return new Promise((resolve, reject) => {
        buildfire.publicData.delete(locationId, Locations.TAG, (error, result) => {
          if (error) return reject(error);
          resolve(result);
        });
      });
    }
}
