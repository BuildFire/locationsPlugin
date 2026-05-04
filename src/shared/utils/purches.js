const Purchase = {

  getSubscriptions() {
    return new Promise((resolve, reject) => {
      buildfire.services.commerce.inAppPurchase.getSubscriptions((err, subscriptions) => {
        if (err) return reject(err);
        resolve(subscriptions);
        console.log('In app purchase subscriptions', subscriptions);
      });
    });
  }
};


export default Purchase;
