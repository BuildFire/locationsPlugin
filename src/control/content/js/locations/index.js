import buildfire from "buildfire";
import Location from "../../../../entities/Location";
import DataMocks from "../../../../DataMocks";
import SearchTableHelper from "../searchTable/searchTableHelper";
import searchTableConfig from "../searchTable/searchTableConfig";
import { generateUUID, createTemplate } from "../../utils/helpers";
import { downloadCsv, jsonToCsv, csvToJson} from "../../utils/csv.helper";

const sidenavContainer = document.querySelector("#sidenav-container");
const locationsSection = document.querySelector("#main");
const inputLocationForm = document.querySelector("#form-holder");

let AddLocationControls = {};

const renderAddLocationsPage = () => {
  sidenavContainer.style.display = "none";
  inputLocationForm.appendChild(createTemplate("addLocationTemplate"));
  inputLocationForm.style.display = "block";

  AddLocationControls = {
    categoryIconBtn: inputLocationForm.querySelector("#category-icon-btn"),
    categoryNameInput: inputLocationForm.querySelector("#category-name-input"),
    categoryNameInputError: inputLocationForm.querySelector(
      "#category-name-error"
    ),
    categorySave: inputLocationForm.querySelector("#category-save-btn"),
    subcategory: {
      addBtn: inputLocationForm.querySelector("#subcategory-add-btn"),
      searchInput: inputLocationForm.querySelector("#subcategory-search-input"),
      searchBtn: inputLocationForm.querySelector("#subcategory-search-btn"),
      bulkActionBtn: inputLocationForm.querySelector(
        "#subcategory-bulk-actions-btn"
      ),
      fileInput: inputLocationForm.querySelector("#file-input"),
      importBtn: inputLocationForm.querySelector("#subcategory-import-btn"),
      exportBtn: inputLocationForm.querySelector("#subcategory-export-btn"),
      downloadBtn: inputLocationForm.querySelector("#subcategory-template-btn"),
    },
  };
};

window.addEditLocation = (location, callback = () => {}) => {
  renderAddLocationsPage();
};

const loadLocations = () => {
  const searchTableHelper = new SearchTableHelper(
    "locations-items",
    "records",
    searchTableConfig
  );
  searchTableHelper.search();
};

// this called in content.js;
window.initLocations = () => {
  loadLocations();
};
