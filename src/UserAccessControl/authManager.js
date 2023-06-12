const authManager = {
  _currentUser: null,
  get currentUser() {
    return authManager._currentUser;
  },
  set currentUser(user) {
    authManager._currentUser = user;
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
    buildfire.auth.onLogin((user) => {
      authManager.currentUser = user;
      window.location.reload();
    }, true);

    buildfire.auth.onLogout(() => {
      authManager.currentUser = null;
      window.location.reload();
    }, true);
  }
};
buildfire.auth.onLogout(authManager.enforceLogin, true);

export default authManager;
