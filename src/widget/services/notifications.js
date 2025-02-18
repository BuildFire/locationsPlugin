/* eslint-disable arrow-body-style */
const subscribe = (groupName) => new Promise((resolve, reject) => {
  const options = {};
  if (groupName) {
    options.groupName = groupName;
  }
  buildfire.notifications.pushNotification.subscribe(options,
    (err, subscribed) => {
      if (err) return reject(err);

      resolve();
    });
});

const sendNotification = (notificationOptions) => {
  return new Promise((resolve, reject) => {
    buildfire.notifications.pushNotification.schedule(notificationOptions, (err, result) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

export default {
  subscribe,
  sendNotification,
};
