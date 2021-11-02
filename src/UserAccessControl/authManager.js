const authManager = {
  _currentUser: null,
  get currentUser() {
    return authManager._currentUser;
  },
  set currentUser(user) {
    authManager._currentUser = user;
    authManager.onUserChange(user);
  },
  enforceLogin(callback) {
    buildfire.auth.getCurrentUser((err, currentUser) => {
      if (!currentUser) {
        buildfire.auth.login({ allowCancel: false }, (err, user) => {
          if (!user) {
            authManager.enforceLogin(callback);
          } else {
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
  onUserChange() {
    console.warn("You must handle on user changed");
  }
};
buildfire.auth.onLogout(authManager.enforceLogin, true);

export default authManager;
