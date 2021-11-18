/* eslint-disable max-len */
/* eslint-disable prefer-destructuring */
import buildfire from "buildfire";
import DataMocks from "../../../../DataMocks";
import categoriesListUI from "./categoriesListUI";
import subcategoriesListUI from "./subcategoriesListUI";
import DialogComponent from "../dialog/dialog";
import Category from "../../../../entities/Category";
import { generateUUID, createTemplate } from "../../utils/helpers";

const state = {
  newCategory: null,
};

const sidenavContainer = document.querySelector("#sidenav-container");
const inputCategoryForm = document.querySelector("#input-category-form");
let inputCategoryControls = {};
let inputSubcategoryDialog = null;

const buildInputCategoryControls = () => {
  inputCategoryControls = {
    categoryIconBtn: inputCategoryForm.querySelector("#category-icon-btn"),
    categoryNameInput: inputCategoryForm.querySelector("#category-name-input"),
    categorySave: inputCategoryForm.querySelector("#category-save-btn"),
    subcategory: {
      addBtn: inputCategoryForm.querySelector("#subcategory-add-btn"),
      searchInput: inputCategoryForm.querySelector("#subcategory-search-input"),
      searchBtn: inputCategoryForm.querySelector("#subcategory-search-btn"),
      bulkActionBtn: inputCategoryForm.querySelector(
        "#subcategory-bulk-actions-btn"
      ),
      importBtn: inputCategoryForm.querySelector("#subcategory-import-btn"),
      exportBtn: inputCategoryForm.querySelector("#subcategory-export-btn"),
      downloadBtn: inputCategoryForm.querySelector("#subcategory-template-btn"),
    },
  };
};

const toggleDropdown = (dropdownElement, forceClose) => {
  if (!dropdownElement) {
    return;
  }
  if (dropdownElement.classList.contains("open") || forceClose) {
    dropdownElement.classList.remove("open");
  } else {
    dropdownElement.classList.add("open");
  }
};

const cropImage = (url, options) => {
  if (!url) {
    return "";
  }
  return buildfire.imageLib.cropImage(url, options);
};

const setCategoryIcon = (icon, type) => {
  if (!icon) {
    return;
  }

  const imageIcon =
    inputCategoryControls.categoryIconBtn.querySelector(".image-icon");
  const glyphIcon =
    inputCategoryControls.categoryIconBtn.querySelector(".glyph-icon");
  const defaultIcon =
    inputCategoryControls.categoryIconBtn.querySelector(".add-icon");

  if (type === "url") {
    glyphIcon.classList.add("hidden");
    defaultIcon.classList.add("hidden");
    imageIcon.classList.remove("hidden");
    imageIcon.src = cropImage(icon, {
      width: 16,
      height: 16,
    });
  } else if (type === "font") {
    imageIcon.classList.add("hidden");
    defaultIcon.classList.add("hidden");
    glyphIcon.classList.remove("hidden");
    glyphIcon.className = `glyph-icon ${icon}`;
  }
};

window.addCategory = () => {
  sidenavContainer.style.display = "none";
  inputCategoryForm.appendChild(createTemplate("addCategoryTemplate"));
  inputCategoryForm.style.display = "block";
  buildInputCategoryControls();

  // create category object
  const newCategory = new Category();
  inputSubcategoryDialog = new DialogComponent(
    "dialogComponent",
    "addSubcategoryTemplate"
  );

  inputCategoryForm.onclick = () => {
    toggleDropdown(
      inputCategoryControls.subcategory.bulkActionBtn.parentElement,
      true
    );
  };
  inputCategoryControls.subcategory.bulkActionBtn.onclick = (e) => {
    e.stopPropagation();
    toggleDropdown(
      inputCategoryControls.subcategory.bulkActionBtn.parentElement
    );
  };

  inputCategoryControls.categoryIconBtn.onclick = () => {
    buildfire.imageLib.showDialog(
      { showIcons: true, multiSelection: false },
      (err, result) => {
        if (err) return console.error(err);
        if (!result) {
          return null;
        }
        const { selectedFiles, selectedStockImages, selectedIcons } = result;
        if (selectedFiles && selectedFiles.length > 0) {
          newCategory.iconUrl = selectedFiles[0];
          newCategory.iconClassName = null;
        } else if (selectedStockImages && selectedStockImages.length > 0) {
          newCategory.iconUrl = selectedStockImages[0];
          newCategory.iconClassName = null;
        } else if (selectedIcons && selectedIcons.length > 0) {
          newCategory.iconClassName = result.selectedIcons[0];
          newCategory.iconUrl = null;
        }

        if (newCategory.iconUrl) {
          setCategoryIcon(newCategory.iconUrl, "url");
        } else if (newCategory.iconClassName) {
          setCategoryIcon(newCategory.iconClassName, "font");
        }
      }
    );
  };

  inputCategoryControls.subcategory.addBtn.onclick = () => {
    addEditSubcategory(
      { category: newCategory, action: "Add" },
      (subcategory) => {
        subcategoriesListUI.addItem(subcategory);
      }
    );
  };
  inputCategoryControls.subcategory.downloadBtn.onclick = () => {};
  inputCategoryControls.subcategory.importBtn.onclick = () => {};
  inputCategoryControls.subcategory.exportBtn.onclick = () => {};

  subcategoriesListUI.onUpdateItem = (item, index, divRow) => {
    addEditSubcategory(
      { category: newCategory, subcategory: item, action: "Edit" },
      (subcategory) => {
        subcategoriesListUI.updateItem(subcategory, index, divRow);
      }
    );
  };
  subcategoriesListUI.onDeleteItem = (item, index, callback) => {
    buildfire.notifications.confirm(
      {
        message: `Are you sure you want to delete ${item.title} subcategory?`,
        confirmButton: {
          text: "Delete",
          key: "y",
          type: "danger",
        },
        cancelButton: {
          text: "Cancel",
          key: "n",
          type: "default",
        },
      }, (e, data) => {
        if (e) console.error(e);
        if (data && data.selectedButton.key === "y") {
          newCategory.subcategories = newCategory.subcategories.filter((elem) => elem.id !== item.id);
          callback(item);
        }
      }
    );
  };
  subcategoriesListUI.onOrderChange = () => {
    newCategory.subcategories = subcategoriesListUI.sortableList.items;
    console.log(newCategory);
  };

  subcategoriesListUI.init("subcategory-items", newCategory.subcategories);
};

const addEditSubcategory = (
  { category, subcategory, action },
  callback = () => {}
) => {
  const dialogComponent = document.getElementById("dialogComponent");
  const subcategoryInput = dialogComponent.querySelector(
    "#subcategory-name-input"
  );
  const inputError = dialogComponent.querySelector(
    "#subcategory-name-input-error"
  );

  if (action === "Edit") {
    subcategoryInput.value = subcategory.title;
  }

  inputSubcategoryDialog.showDialog(
    {
      title: `${action === "Edit" ? "Edit" : "Add"} Subcategory`,
      saveText: "Save",
      hideDelete: false,
    },
    (e) => {
      e.preventDefault();

      if (!subcategoryInput.value) {
        inputError.classList.remove("hidden");
        return;
      }
      inputError.classList.add("hidden");

      if (action === "Edit") {
        subcategory = category.subcategories.find(
          (elem) => elem.id === subcategory.id
        );
        subcategory.title = subcategoryInput.value;
      } else {
        subcategory = {
          id: generateUUID(),
          title: subcategoryInput.value,
        };
        category.subcategories.push(subcategory);
      }
      subcategoryInput.value = "";
      inputSubcategoryDialog.close();
      callback(subcategory);
    }
  );
};

const createNewCategory = () => {};

const updateCategory = () => {};

window.cancelAddCategory = () => {
  sidenavContainer.style.display = "flex";
  inputCategoryForm.innerHTML = "";
  inputCategoryForm.style.display = "none";
};

const downloadSubcategoryTemplate = () => {};

const loadCategories = () => {};

// this called in content.js;
window.initCategories = () => {
  categoriesListUI.init("items", DataMocks.generate("CATEGORY", 10));
};
