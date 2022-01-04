import authManager from "../../UserAccessControl/authManager";
import CategoriesSpec from "./spec/categories.spec";
import LocationsSpec from "./spec/locations.spec";
import SettingsSpec from "./spec/settings.spec";

const init = () => {
  CategoriesSpec.run();
  LocationsSpec.run();
  SettingsSpec.run();
};

authManager.enforceLogin(init);
