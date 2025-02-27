const authManager = {
  _currentUser: null,
  get currentUser() {
    return authManager._currentUser;
  },
  set currentUser(user) {
    authManager._currentUser = user;
  },
  get sanitizedCurrentUser() {
    if (!this.currentUser) return null;
    const sanitizedUser = { ...this.currentUser };

    // the following will be stored in location createdBy
    if (typeof sanitizedUser._cpUser !== "undefined") {
      sanitizedUser.isCPUser = true;
    }

    // List of properties to remove
    const propertiesToRemove = [
      "email", "username", "accessToken", "accessTokenExpiresIn",
      "externalApps", "lastUsedIPAddress", "userToken", "loginProviderType",
      "failedAttemptCount", "_cpUser",
    ];

    propertiesToRemove.forEach((prop) => {
      if (sanitizedUser.hasOwnProperty(prop)) {
        delete sanitizedUser[prop];
      }
    });

    return sanitizedUser;
  },
  enforceLogin(callback) {
    buildfire.auth.getCurrentUser((err, currentUser) => {
      if (!currentUser) {
        buildfire.auth.login({ allowCancel: true }, (err, user) => {
          if (user) {
            authManager.currentUser = user;
            if (callback) callback();
          }
        });
      } else {
        authManager.currentUser = currentUser;
        if (callback) callback();
      }
    });
  },
  getCurrentUser(callback) {
    buildfire.auth.getCurrentUser((err, currentUser) => {
      if (currentUser) {
        authManager.currentUser = currentUser;
      }
      if (callback) callback();
    });
  },
  onUserChange(callback) {
    buildfire.auth.onLogin((user) => {
      authManager.currentUser = user;
      callback();
    }, true);

    buildfire.auth.onLogout(() => {
      authManager.currentUser = null;
      window.location.reload();
    }, true);
  },
  getUserProfile(userId) {
    return new Promise((resolve, reject) => {
      buildfire.auth.getUserProfile({ userId }, (err, user) => {
        if (err) return reject(err);
        resolve(user);
      });
    });
  }
};
buildfire.auth.onLogout(authManager.enforceLogin, true);

export default authManager;
