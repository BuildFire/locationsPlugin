const Purchase = {
  subscriptionList :[],

  getSubscriptions() {
    return new Promise((resolve, reject) => {
      if (this.subscriptionList.length > 0) {
        return resolve(this.subscriptionList);
      }
      buildfire.services.commerce.inAppPurchase.getSubscriptions((err, subscriptions) => {
        if (err) return reject(err);
        this.subscriptionList = subscriptions;
        resolve(subscriptions);
      });
    });
  },

  validateSubscription(productId) {
    return new Promise((resolve, reject) => {
      const options = { productId, type: 'subscriptions' };
      buildfire.services.commerce.inAppPurchase.checkIsPurchased(options, (err, isPurchased) => {
        if (err) return reject(err);
        resolve(isPurchased);
      });
    });
  },

  purchase(productId) {
    return new Promise((resolve, reject) => {
      buildfire.services.commerce.inAppPurchase.purchase(
        { productId, purchaseType: 'subscriptions' },
        (err, result) => {
          console.log(err,'err');
          if (err) return reject(err);
          resolve(result);
        }
      );
    });
  },

  onPurchaseResult(callback) {
    buildfire.services.commerce.inAppPurchase.onPurchaseResult((product) => {
      callback(product);
    });
  }
};

export default Purchase;
