import buildfire from 'buildfire';
import CategoriesTests from './categories.test';
import LocationsTests from './locations.test';
import SettingsTests from './settings.test';

function executeTests(user) {
  SettingsTests.run(user);
  CategoriesTests.run(user);
  setTimeout(() => {
    LocationsTests.run();
  }, 2000);
}

const runTests = () => {
  console.log("RUNNING TESTS");
  buildfire.auth.getCurrentUser((err, result) => {
    if (err) return err;
    if (result == null) {
      buildfire.auth.login({ allowCancel: false }, (err, result) => {
        if (err) return console.error(err);
        executeTests(result);
      });
    } else {
      executeTests(result);
    }
  });
};

export default runTests;
