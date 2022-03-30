export const getDisplayName = (user) => {
  let displayName;
  if (user.displayName) {
    displayName = user.displayName;
  } else if (user.firstName || user.lastName) {
    displayName = `${user.firstName} ${user.lastName}`;
  } else {
    displayName = user.username;
  }
  return displayName;
};
