/* eslint-disable class-methods-use-this */

import SortableListUI from "./sortableList/sortableListUI";

class CategoriesListUI extends SortableListUI {
  constructor(elementId) {
    super(elementId, { isDraggable: false });
  }

  // append new sortable item to the DOM
  _injectItemElements(item, index, divRow) {
    // eslint-disable-next-line no-throw-literal
    if (!item) throw "Missing Item";
    divRow.innerHTML = "";
    divRow.setAttribute("arrayIndex", index);

    // Create the required DOM elements
    const moveHandle = document.createElement("span");
    const titleContainer = document.createElement("div");
    const title = document.createElement("a");
    const deleteButton = document.createElement("span");

    // Add the required classes to the elements
    divRow.className = "d-item clearfix";
    moveHandle.className = "icon icon-menu cursor-grab";
    titleContainer.className = "title-container ellipsis";
    title.className = "title ellipsis item-title text-primary";

    titleContainer.appendChild(title);

    deleteButton.className = "btn--icon icon icon-cross2";
    title.innerHTML = item;

    // Append elements to the DOM
    // divRow.appendChild(moveHandle);

    const mediaHolder = document.createElement("div");
    mediaHolder.className = "media-holder";

    // if (item.imageUrl) {
    //   const img = document.createElement("img");
    //   img.src = this._cropImage(item.imageUrl, {
    //     width: 40,
    //     height: 40,
    //   });
    //   mediaHolder.appendChild(img);
    // }

    const img = document.createElement("img");
    img.src = 'https://alnnibitpo.cloudimg.io/v7/https:/s3-us-west-2.amazonaws.com/imageserver.prod/9e54f96e-67d8-11ea-91c9-06e43182e96c/acknowledgment.png';
    mediaHolder.appendChild(img);

    divRow.appendChild(mediaHolder);
    divRow.appendChild(titleContainer);
    divRow.appendChild(deleteButton);

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
  }
}

export default CategoriesListUI;
