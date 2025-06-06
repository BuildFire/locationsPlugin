/* eslint-disable no-restricted-syntax */
/* eslint-disable no-use-before-define */
/* eslint-disable max-len */
/* eslint-disable prefer-destructuring */
import buildfire from "buildfire";
import CategoriesController from "./controller";
import CategoriesListUI from "./categoriesListUI";
import SubcategoriesListUI from "./subcategoriesListUI";
import DialogComponent from "../dialog/dialog";
import Category from "../../../../entities/Category";
import { generateUUID, createTemplate, handleInputError, showProgressDialog } from "../../utils/helpers";
import { downloadCsv, jsonToCsv, csvToJson, readCSVFile } from "../../utils/csv.helper";
import globalState from '../../state';
import authManager from '../../../../UserAccessControl/authManager';

const state = {
  categories: [],
  newCategory: null,
  breadcrumbs: [
    { title: "Categories", goBack: true },
  ]
};

const subcategoryTemplateHeader = {
  id: 'id',
  title: "title",
};

const categoriesTemplateHeader = {
  id: 'id',
  title: "title",
  iconUrl: "iconUrl",
  iconClassName: "iconClassName",
  subcategories: "subcategories",
  // quickAccess: "quickAccess",
  createdOn: "createdOn"
};

const breadcrumbsSelector = document.querySelector("#breadcrumbs");
const sidenavContainer = document.querySelector("#sidenav-container");
const categories = document.querySelector("#main");
const inputCategoryForm = document.querySelector("#form-holder");

let inputCategoryControls = {};
let inputSubcategoryDialog = null;
let categoriesListUI = null;
let subcategoriesListUI = null;

const renderAddCategoryPage = () => {
  sidenavContainer.style.display = "none";
  inputCategoryForm.appendChild(createTemplate("addCategoryTemplate"));
  inputCategoryForm.style.display = "block";

  inputCategoryControls = {
    formTitle: inputCategoryForm.querySelector('#category-form-title'),
    categoryIconBtn: inputCategoryForm.querySelector("#category-icon-btn"),
    categoryNameInput: inputCategoryForm.querySelector("#category-name-input"),
    categoryNameInputError: inputCategoryForm.querySelector("#category-name-error"),
    categorySave: inputCategoryForm.querySelector("#category-save-btn"),
    cancelButton: inputCategoryForm.querySelector("#category-cancel-btn"),
    subcategory: {
      addBtn: inputCategoryForm.querySelector("#subcategory-add-btn"),
      searchInput: inputCategoryForm.querySelector("#subcategory-search-input"),
      searchBtn: inputCategoryForm.querySelector("#subcategory-search-btn"),
      bulkActionBtn: inputCategoryForm.querySelector(
        "#subcategory-bulk-actions-btn"
      ),
      fileInput: inputCategoryForm.querySelector("#subcategory-file-input"),
      importBtn: inputCategoryForm.querySelector("#subcategory-import-btn"),
      exportBtn: inputCategoryForm.querySelector("#subcategory-export-btn"),
      downloadBtn: inputCategoryForm.querySelector("#subcategory-template-btn"),
      emptyState: inputCategoryForm.querySelector("#subcategory-empty-list"),
    },
  };
};

const renderBreadcrumbs = () => {
  breadcrumbsSelector.innerHTML = "";
  for (const breadcrumb of state.breadcrumbs) {
    const listItem = document.createElement('li');
    listItem.innerHTML = `<a>${breadcrumb.title}</a>`;
    listItem.onclick = () => {
      if (breadcrumb.goBack) {
        state.breadcrumbs.pop();
        breadcrumbsSelector.innerHTML = "";
        cancelAddCategory();
      }
    };
    breadcrumbsSelector.appendChild(listItem);
  }
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

  const imageIcon = inputCategoryControls.categoryIconBtn.querySelector(".image-icon");
  const listIcon = inputCategoryControls.categoryIconBtn.querySelector(".custom-icon-list");
  const defaultIcon = inputCategoryControls.categoryIconBtn.querySelector(".add-icon");

  if (type === "url") {
    listIcon.classList.add("hidden");
    defaultIcon.classList.add("hidden");
    imageIcon.classList.remove("hidden");
    imageIcon.src = cropImage(icon, {
      width: 40,
      height: 40,
    });
  } else if (type === "font") {
    imageIcon.classList.add("hidden");
    defaultIcon.classList.add("hidden");
    listIcon.classList.remove("hidden");
    listIcon.className = `custom-icon-list ${icon}`;
  }
};

window.addEditCategory = (category, callback = () => {}) => {
  renderAddCategoryPage();
  subcategoriesListUI = new SubcategoriesListUI('subcategory-items');

  // create category object
  let newCategory;
  if (!category) {
    inputCategoryControls.formTitle.innerHTML = "Add Category";
    state.breadcrumbs.push({ title: "Add Category" });
    newCategory = new Category();
  } else {
    inputCategoryControls.formTitle.innerHTML = "Edit Category";
    state.breadcrumbs.push({ title: "Edit Category" });
    newCategory = new Category(category);
    inputCategoryControls.categoryNameInput.value = newCategory.title;
    if (newCategory.iconUrl) {
      setCategoryIcon(newCategory.iconUrl, "url");
    } else if (newCategory.iconClassName) {
      setCategoryIcon(newCategory.iconClassName, "font");
    }
  }

  renderBreadcrumbs();

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
      { showIcons: true, multiSelection: false }, (err, result) => {
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

  inputCategoryControls.subcategory.searchInput.onkeyup = (e) => {
    const search = e.target.value;

    if (!search) {
      subcategoriesListUI.init(newCategory.subcategories);
      handleSubcategoriesEmptyState(newCategory, false);
      return;
    }
    const data = newCategory.subcategories.filter((elem) => elem.title.toLowerCase().includes(search.toLowerCase()));
    if (data.length === 0) {
      handleSubcategoriesEmptyState(newCategory, true);
    } else {
      handleSubcategoriesEmptyState(newCategory, false);
    }
    subcategoriesListUI.init(data);
  };

  inputCategoryControls.subcategory.downloadBtn.onclick = () => {
    const templateData = [{
      id: "",
      title: "",
    }];
    downloadCsvTemplate(templateData, subcategoryTemplateHeader);
  };

  inputCategoryControls.subcategory.importBtn.onclick = (e) => {
    e.preventDefault();
    inputCategoryControls.subcategory.fileInput.click();
    inputCategoryControls.subcategory.fileInput.onchange = function () {
      importSubcategories(newCategory, this.files[0], (subcategories) => {
        newCategory.subcategories.push(...subcategories);
        handleSubcategoriesEmptyState(newCategory);
        for (const subcategory of subcategories) {
          subcategoriesListUI.addItem(subcategory);
          newCategory.subcategories.push(subcategory);
        }
        inputCategoryControls.subcategory.fileInput.value = '';
      });
    };
  };

  inputCategoryControls.subcategory.exportBtn.onclick = () => {
    downloadCsvTemplate(newCategory.subcategories, subcategoryTemplateHeader, 'subcategories');
  };

  subcategoriesListUI.onUpdateItem = (item, index, divRow) => {
    addEditSubcategory(
      { category: newCategory, subcategory: item, action: "Edit" },
      (subcategory) => {
        subcategoriesListUI.updateItem(subcategory, index, divRow);
        newCategory.subcategories = newCategory.subcategories.map((_subcategory) => {
          if (_subcategory.id === subcategory.id) {
            return subcategory;
          }
          return _subcategory;
        });
      }
    );
  };

  subcategoriesListUI.onDeleteItem = (item, index, callback) => {
    buildfire.notifications.confirm(
      {
        title: "Delete Subcategory",
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
          handleSubcategoriesEmptyState(newCategory);
          callback(item);
        }
      }
    );
  };

  subcategoriesListUI.onOrderChange = (item, oldIndex, newIndex) => {
    const currentIndex = newCategory.subcategories.findIndex((subcategory) => subcategory.id === item.id);
    const sortedItem = newCategory.subcategories.splice(currentIndex, 1)[0];
    newCategory.subcategories.splice(newIndex, 0, sortedItem);
    console.log(newCategory);
  };

  subcategoriesListUI.onImageClick = (item, index, divRow) => {
    buildfire.imageLib.showDialog(
      { showIcons: true, multiSelection: false }, (err, result) => {
        if (err) return console.error(err);
        if (!result) {
          return null;
        }
        const { selectedFiles, selectedStockImages, selectedIcons } = result;
        if (selectedFiles && selectedFiles.length > 0) {
          item.iconUrl = selectedFiles[0];
          item.iconClassName = null;
        } else if (selectedStockImages && selectedStockImages.length > 0) {
          item.iconUrl = selectedStockImages[0];
          item.iconClassName = null;
        } else if (selectedIcons && selectedIcons.length > 0) {
          item.iconClassName = result.selectedIcons[0];
          item.iconUrl = null;
        }

        const subcategory = newCategory.subcategories.find(
          (elem) => elem.id === item.id
        );
        subcategory.iconUrl = item.iconUrl;
        subcategory.iconClassName = item.iconClassName;
        subcategoriesListUI.updateItem(subcategory, index, divRow);
      }
    );
  };

  inputCategoryControls.categorySave.onclick = () => {
    newCategory.title = inputCategoryControls.categoryNameInput.value;

    if (!categoryInputValidation(newCategory)) {
      return;
    }

    if (!category) {
      createCategory(newCategory);
    } else {
      updateCategory(category.id, newCategory, callback);
    }
  };

  inputCategoryControls.cancelButton.onclick  = cancelAddCategory;

  subcategoriesListUI.init(newCategory.subcategories);
  handleSubcategoriesEmptyState(newCategory);
};

const categoryInputValidation = (category) => {
  const { title } = category;
  let isValid = true;

  if (!title) {
    handleInputError(inputCategoryControls.categoryNameInputError, true);
    isValid = false;
  } else {
    handleInputError(inputCategoryControls.categoryNameInputError, false);
  }

  const invalidInput = document.querySelector(".has-error");
  if (invalidInput) {
    invalidInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return isValid;
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
          iconUrl: null,
          iconClassName: null
        };
        category.subcategories.push(subcategory);
      }
      subcategoryInput.value = "";
      inputSubcategoryDialog.close();
      handleSubcategoriesEmptyState(category);
      callback(subcategory);
    }
  );
};

const validateCsv = (items) => {
  if (!Array.isArray(items) || !items.length) {
    return false;
  }
  return items.every((item, index, array) =>  item.title);
};

const importSubcategories = (category, file, callback) => {
  if (!file) {
    return;
  }

  const fileReader = new FileReader();
  fileReader.onload = function() {
    console.log(fileReader.result);
    const rows = JSON.parse(csvToJson(fileReader.result));
    if (!validateCsv(rows)) {
      buildfire.dialog.alert({
        message: "Your file missing title for one row or more, please check and upload again.",
      });
      return;
    }

    const subcategories = rows.map((elem) =>  ({ id: generateUUID(), title: elem.title.trim() }));
    callback(subcategories);
  };

  fileReader.readAsText(file);
};

const downloadCsvTemplate = (templateData, header, name) => {
  const  csv = jsonToCsv(templateData, {
    header
  });

  downloadCsv(csv, `${name? name : 'template'}.csv`);
};

const cancelAddCategory = () => {
  sidenavContainer.style.display = "flex";
  inputCategoryForm.innerHTML = "";
  inputCategoryForm.style.display = "none";
  breadcrumbsSelector.innerHTML = "";
  state.breadcrumbs = [
    { title: "Categories", goBack: true },
  ];
};

window.searchCategories = () => {
  setTimeout(()=>{
    const searchElem = categories.querySelector('#category-search-input');
    if (!searchElem.value) {
      categoriesListUI.init(state.categories);
      handleCategoriesEmptyState(false, false);
      return;
    }
    const options = {
      filter: {
        $or: [{
            "$json.title": {
              $regex: searchElem.value.toLowerCase(),
              $options: "i",
            },
          },
        ],
      },
      sort: {title: 1}
    };
    options.filter["_buildfire.index.date1"] = { $type: 10 };
    CategoriesController.searchCategories(options).then((categories) => {
      const data = categories
      if (data && data.length === 0) {
        handleCategoriesEmptyState(false, true);
      } else {
        handleCategoriesEmptyState(false, false);
      }
      categoriesListUI.init(data);
    });
  },500)
};

window.openCategorySort = (e) => {
  e.stopPropagation();
  const sortDropdown = categories.querySelector('#category-sort-dropdown');
  const categoryDropdown = categories.querySelector('#category-bulk-dropdown');
  toggleDropdown(sortDropdown);
  toggleDropdown(categoryDropdown, true);
  document.body.onclick = () => {
    toggleDropdown(sortDropdown, true);
  };
};

window.sortCategories = (sort) => {
  const sortTextElem = categories.querySelector('#category-sort-txt');
  state.categories.sort((a, b) => {
    a = a.title.toLowerCase();
    b = b.title.toLowerCase();
    if (sort === 'Z-A') {
      return a === b ? 0 : b > a ? 1 : - 1;
    }
    return a === b ? 0 : a > b ? 1 : - 1;
  });
  sortTextElem.innerHTML = sort === 'Z-A' ? 'Z - A' : 'A - Z';
 buildfire.messaging.sendMessageToWidget({
  cmd: 'sort',
  scope: 'category',
  sortBy: sort === 'Z-A' ? 'Desc' : 'Asc'
});
  categoriesListUI.init(state.categories);
};

window.openCategoryBulkAction = (e) => {
  e.stopPropagation();
  const categoryDropdown = categories.querySelector('#category-bulk-dropdown');
  const sortDropdown = categories.querySelector('#category-sort-dropdown');
  toggleDropdown(categoryDropdown);
  toggleDropdown(sortDropdown, true);
  document.body.onclick = () => {
    toggleDropdown(categoryDropdown, true);
  };
};

window.importCategories = () => {
  const fileInput = categories.querySelector("#category-file-input");
  fileInput.click();
  fileInput.onchange = function (e) {
    readCSVFile(this.files[0], (err, result) => {
      if (!Array.isArray(result) || !result.length || !result.every((item) =>  item.title)) {
        buildfire.dialog.alert({
          message: "Your file missing title for one row or more, please check and upload again.",
        });
        return;
      }

      let categories = [];
      if(result.some((item) => item.categories)){//Places 2.0 file
        let categoriesLoaded = new Set();
        result.forEach((item) =>{
          let itemCategories = item.categories.split(",");
          if(itemCategories?.length > 0)
            itemCategories.forEach((cat)=> {
              if(cat?.length > 0)
                categoriesLoaded.add(cat.trim())
            });
        });
        categoriesLoaded.forEach((cat) => categories.push(new Category({title:cat,createdOn:new Date(),createdBy:authManager.sanitizedCurrentUser}).toJSON()));
      }else{
        categories = result.map((elem) => {
          delete elem.id;
          elem.title = elem?.title?.trim();
          elem.iconUrl = elem?.iconUrl?.trim();
          elem.iconClassName = elem?.iconClassName?.trim();
          elem.subcategories = elem.subcategories?.split(',').filter((elem) => elem).map((subTitle) => ({ id: generateUUID(), title: subTitle?.trim() }));
          elem.createdOn = new Date();
          elem.createdBy = authManager.sanitizedCurrentUser;
          return new Category(elem).toJSON();
        });
      }

      const dialogRef = showProgressDialog({
        title: 'Importing Categories',
        message: 'We’re importing your categories, please wait.'
      });
      CategoriesController.bulkCreateCategories(categories).then((result) => {
        dialogRef.close();
        fileInput.value = '';
        buildfire.dialog.toast({
          message: "Successfully imported categories",
          type: "success",
        });
        loadCategories();
        triggerWidgetOnCategoriesUpdate();
      }).catch((err) => {
        dialogRef.close();
        fileInput.value = '';
        console.error(err);
      });
    });
  };
};

window.exportCategories = () => {
  downloadCsvTemplate(state.categories, categoriesTemplateHeader, 'categories');
};

window.downloadCategoryTemplate = () => {
  const templateData = [{
    id: "",
    title: "",
    iconUrl: "",
    iconClassName: "",
    subcategories: "",
    createdOn: "",
  }];
  downloadCsvTemplate(templateData, categoriesTemplateHeader);
};

const handleCategoriesEmptyState = (isLoading, showEmptyState) => {
  const emptyState = categories.querySelector('#category-empty-list');
  if (isLoading) {
    emptyState.innerHTML = `<h4> Loading... </h4>`;
    emptyState.classList.remove('hidden');
  } else if (state.categories.length === 0 || showEmptyState) {
    emptyState.innerHTML = `<h4>No Categories Found.</h4>`;
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }
};

const handleSubcategoriesEmptyState = (category, showEmptyState) => {
  const emptyState = inputCategoryControls.subcategory.emptyState;
  if (category.subcategories.length === 0 || showEmptyState) {
    emptyState.innerHTML = `<h4>No Subcategories Found.</h4>`;
    emptyState.classList.remove('hidden');
  } else {
    emptyState.classList.add('hidden');
  }
};

var skipFilter = 0;
var isLoading = false;
const loadCategories = () => {
  skipFilter = 0;
  const options = {
    filter: {},
    skip: skipFilter,
    sort: {title: 1}
  };
  options.filter["_buildfire.index.date1"] = { $type: 10 };
  CategoriesController.searchCategories(options).then((categories) => {
    skipFilter += 1;
    state.categories = categories;
    globalState.categories = categories;
    categoriesListUI.init(categories);

    loadMoreCategories();
    handleCategoriesEmptyState(false);
  });
};

const loadMoreCategories = () => {
  var t = document.getElementById("items")
  t.onscroll = (e) => {
    if (t.scrollTop / t.scrollHeight > 0.6 && !isLoading) {
      isLoading = true;
      skipFilter += 1;
      const options = {
        filter: {},
        page: skipFilter,
        pageSize: 20,
        sort: {title: 1}
      };
      options.filter["_buildfire.index.date1"] = { $type: 10 };
      CategoriesController.searchCategories(options).then((categories) => {
        state.categories += categories;
        globalState.categories += categories;
        categoriesListUI.append(categories)
        isLoading = false;
      });
    }
  };
}

const deleteCategory = (item, index, callback) => {
  buildfire.notifications.confirm(
    {
      title: 'Delete Category',
      message: `Are you sure you want to delete ${item.title} category?`,
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
        CategoriesController.deleteCategory(item.id, new Category(item)).then(() => {
          state.categories = state.categories.filter((elem) => elem.id !== item.id);
          handleCategoriesEmptyState(false);
          triggerWidgetOnCategoriesUpdate();
          callback(item);
        });
      }
    }
  );
};

const updateCategoryImage = (item, index, divRow) => {
  buildfire.imageLib.showDialog(
    { showIcons: true, multiSelection: false }, (err, result) => {
      if (err) return console.error(err);
      if (!result) {
        return null;
      }
      const { selectedFiles, selectedStockImages, selectedIcons } = result;
      if (selectedFiles && selectedFiles.length > 0) {
        item.iconUrl = selectedFiles[0];
        item.iconClassName = null;
      } else if (selectedStockImages && selectedStockImages.length > 0) {
        item.iconUrl = selectedStockImages[0];
        item.iconClassName = null;
      } else if (selectedIcons && selectedIcons.length > 0) {
        item.iconClassName = result.selectedIcons[0];
        item.iconUrl = null;
      }

      const category = state.categories.find(
        (elem) => elem.id === item.id
      );
      category.iconUrl = item.iconUrl;
      category.iconClassName = item.iconClassName;
      updateCategory(category.id, new Category(category), (res) => {
        categoriesListUI.updateItem(category, index, divRow);
      });
    }
  );
};

const createCategory = (category) => {
  CategoriesController.createCategory(category).then((res) => {
    loadCategories();
    triggerWidgetOnCategoriesUpdate();
    cancelAddCategory();
  });
};

const updateCategory = (categoryId, category, callback) => {
  CategoriesController.updateCategory(categoryId, category).then((res) => {
    triggerWidgetOnCategoriesUpdate();
    if (callback) {
      callback(category.toJSON());
    }
  });
};

const triggerWidgetOnCategoriesUpdate = () => {
  buildfire.messaging.sendMessageToWidget({
    cmd: 'sync',
    scope: 'category'
  });
};

// this called in content.js;
window.initCategories = () => {
  categoriesListUI = new CategoriesListUI('items');
  categoriesListUI.onUpdateItem = (item, index, divRow) => {
    window.addEditCategory(item, (category) => {
      categoriesListUI.updateItem(category, index, divRow);
      cancelAddCategory();
    });
  };
  categoriesListUI.onDeleteItem = deleteCategory;
  categoriesListUI.onImageClick = updateCategoryImage;
  handleCategoriesEmptyState(true);
  loadCategories();
};
