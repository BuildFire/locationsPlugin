export const cleanPublicData = (ids, tag) => {
  setTimeout(() => {
    ids.forEach((id) => {
      buildfire.publicData.delete(id, tag, () => {});
    });
  }, 2000);
};

export const cleanDataStore = (tag) => {
  setTimeout(() => {
    buildfire.datastore.search({}, tag, (err, data) => {
      if (err) return;
      data.forEach((currentRecord) => buildfire.datastore.delete(currentRecord.id, tag, () => {}));
    });
  }, 2000);
};

export const getID = () => Math.random().toString(16).slice(2);

export const logError = (msg) => {
  buildfire.components.tester.log({ type: "error", log: msg });
  console.log(`%cTests ===> ${msg}`, "color:red;");
};

export const logInfo = (msg) => {
  buildfire.components.tester.log({ type: "info", log: msg });
  console.log(`%cTests ===> ${msg}`, "color:blue;");
};

export const logSuccess = (msg) => {
  buildfire.components.tester.log({ type: "success", log: msg });
  console.log(`%cTests ===> ${msg}`, "color:green;");
};

export const test = (title, runFn) => {
  try {
    runFn();
    logSuccess(title);
  } catch (error) {
    logError(title);
    logError(error);
  }
};

export const expect = (title, result) => {
  if (result) {
    logSuccess(title);
  } else {
    logError(title);
  }
};
