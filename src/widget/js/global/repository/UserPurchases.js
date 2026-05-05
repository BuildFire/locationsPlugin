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
      buildfire.userData.get(UserPurchases.TAG, (error, result) => {
        if (error) return reject(error);
        resolve(result?.data || []);
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
      console.log(userPurchase,'userPurchaseuserPurchaseuserPurchase')
      buildfire.userData.save(userPurchase, UserPurchases.TAG, (error, result) => {
        if (error) return reject(error);
        resolve(new UserPurchase({ ...result.data, id: result.id }).toJSON());
      });
    });
  }
}
