/* eslint-disable class-methods-use-this */

import SortableListUI from "./sortableList/sortableListUI";
import { getDisplayName } from '../util/helpers';

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
    title.className = "title ellipsis item-title text-primary pointer-events-none cursor-default";

    titleContainer.appendChild(title);

    deleteButton.className = "btn--icon icon icon-cross2";
    title.innerHTML = getDisplayName(item);

    const mediaHolder = document.createElement("div");
    mediaHolder.className = "media-holder";

    const img = document.createElement("img");
    img.src = item.imageUrl ? this._cropImage(item.imageUrl, {
      width: 40,
      height: 40,
    }) : '../assets/images/avatar-2.png';
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
