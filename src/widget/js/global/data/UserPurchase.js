/**
 * UserPurchase data model
 * @class
 */
export default class UserPurchase {
  /**
   * @param {object} data
   * @constructor
   */
  constructor(data = {}) {
    this.purchase = data.purchase || []; // {productId, type:'subscription'}
  }

  toJSON() {
    return {
      purchase: this.purchase
    };
  }
}
