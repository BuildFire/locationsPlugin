/* eslint-disable prefer-destructuring */
import buildfire from "buildfire";
import DataMocks from "../../../../DataMocks";
import categoriesListUI from "./categoriesListUI";
import subcategoriesListUI from "./subcategoriesListUI";
import Category from '../../../../entities/Category';

const state = {
  newCategory: null
};

const sidenavContainer = document.querySelector("#sidenav-container");
const inputCategoryForm = document.querySelector("#input-category-form");
let inputCategoryControls = {};

const buildInputCategoryControls = () => {
  inputCategoryControls = {
    categoryIconBtn: inputCategoryForm.querySelector("#category-icon-btn"),
    categoryNameInput: inputCategoryForm.querySelector("#category-name-input"),
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

  const imageIcon = inputCategoryControls.categoryIconBtn.querySelector('.image-icon');
  const glyphIcon = inputCategoryControls.categoryIconBtn.querySelector('.glyph-icon');
  const defaultIcon = inputCategoryControls.categoryIconBtn.querySelector('.add-icon');

  if (type === 'url') {
    glyphIcon.classList.add('hidden');
    defaultIcon.classList.add('hidden');
    imageIcon.classList.remove('hidden');
    imageIcon.src = cropImage(icon, {
      width: 16,
      height: 16,
    });
  } else if (type === 'font') {
    imageIcon.classList.add('hidden');
    defaultIcon.classList.add('hidden');
    glyphIcon.classList.remove('hidden');
    glyphIcon.className = `glyph-icon ${icon}`;
  }
};

window.addCategory = () => {
  const addCategoryTemplate = document.querySelector("#addCategoryTemplate");
  sidenavContainer.style.display = "none";
  const createTemplate = document.importNode(addCategoryTemplate.content, true);
  inputCategoryForm.appendChild(createTemplate);
  inputCategoryForm.style.display = "block";
  buildInputCategoryControls();

  // create category object
  const newCategory = new Category();
  subcategoriesListUI.init('subcategory-items', newCategory.subcategories);

  inputCategoryForm.onclick = () => {
    toggleDropdown(inputCategoryControls.subcategory.bulkActionBtn.parentElement, true);
  };
  inputCategoryControls.subcategory.bulkActionBtn.onclick = (e) => {
    e.stopPropagation();
    toggleDropdown(inputCategoryControls.subcategory.bulkActionBtn.parentElement);
  };

  inputCategoryControls.categoryIconBtn.onclick = () => {
    buildfire.imageLib.showDialog({ showIcons: true, multiSelection: false }, (err, result) => {
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
        setCategoryIcon(newCategory.iconUrl, 'url');
      } else if (newCategory.iconClassName) {
        setCategoryIcon(newCategory.iconClassName, 'font');
      }
    });
  };

  inputCategoryControls.subcategory.addBtn.onclick = () => {};
  inputCategoryControls.subcategory.downloadBtn.onclick = () => {};
  inputCategoryControls.subcategory.importBtn.onclick = () => {};
  inputCategoryControls.subcategory.exportBtn.onclick = () => {};
  subcategoriesListUI.onUpdateItem = () => {};
  subcategoriesListUI.onDeleteItem = () => {};
  subcategoriesListUI.onOrderChange = () => {};
};

const createNewCategory = () => {};

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
