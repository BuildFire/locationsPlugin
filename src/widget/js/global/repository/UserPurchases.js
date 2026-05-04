import UserPurchase from "../data/UserPurchase";
/**
 * UserPurchases data access
 * @class
 */
export default class UserPurchases {
  /**
   * UserPurchases key in publicData
   * @static
   */
  static TAG = 'UserPurchases';

  /**
   * retrieve UserPurchases data
   * @param {object} options
   * @static
   * @returns {promise} query result
   */
  static search(options = {}) {
    return new Promise((resolve, reject) => {
      buildfire.publicData.search(options, UserPurchases.TAG, (error, result) => {
        if (error) return reject(error);
        result = result.map((c) => new UserPurchase({ ...c.data, id: c.id }).toJSON());
        resolve(result);
      });
    });
  }

  /**
   *
   * @param {UserPurchase} userPurchase
   * @static
   * @returns {promise}
   */
  static save(userPurchase) {
    return new Promise((resolve, reject) => {
      userPurchase.createdOn = new Date();
      buildfire.userData.save(userPurchase, UserPurchases.TAG, (error, result) => {
        if (error) return reject(error);
        resolve(new UserPurchase({ ...result.data, id: result.id }).toJSON());
      });
    });
  }
}
