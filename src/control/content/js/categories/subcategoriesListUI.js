/* eslint-disable class-methods-use-this */

import SortableListUI from "../sortableList/sortableListUI";

class SubcategoriesListUI extends SortableListUI {
  constructor(elementId) {
    super(elementId, { isDraggable: true });
  }

  // append new sortable item to the DOM
  _injectItemElements(item, index, divRow) {
    // eslint-disable-next-line no-throw-literal
    if (!item) throw "Missing Item";
    divRow.innerHTML = "";
    divRow.setAttribute("arrayIndex", index);

    // Create the required DOM elements
    const moveHandle = document.createElement("span");
    const title = document.createElement("a");
    const deleteButton = document.createElement("span");
    const editButton = document.createElement("span");

    // Add the required classes to the elements
    divRow.className = "d-item clearfix";
    moveHandle.className = "icon icon-menu cursor-grab";
    title.className = "title ellipsis item-title";

    deleteButton.className = "btn--icon icon icon-cross2";
    editButton.className = "btn--icon icon icon-pencil";
    title.innerHTML = item.title;

    // Append elements to the DOM
    divRow.appendChild(moveHandle);

    divRow.appendChild(title);
    divRow.appendChild(editButton);
    divRow.appendChild(deleteButton);

    title.onclick = () => {
      let index = divRow.getAttribute("arrayIndex"); /// it may have bee reordered so get value of current property
      index = parseInt(index);
      this.onItemClick(item, index, divRow);
      return false;
    };

    deleteButton.onclick = () => {
      let index = divRow.getAttribute("arrayIndex"); /// it may have bee reordered so get value of current property
      index = parseInt(index);
      let t = this;
      this.onDeleteItem(item, index, (confirmed) => {
        if (confirmed) {
          divRow.parentNode.removeChild(divRow);
          t.reIndexRows();
        }
      });
      return false;
    };
    editButton.onclick = () => {
      let index = divRow.getAttribute("arrayIndex"); /// it may have bee reordered so get value of current property
      index = parseInt(index);
      this.onUpdateItem(item, index, divRow);
      return false;
    };
  }
}

export default SubcategoriesListUI;
