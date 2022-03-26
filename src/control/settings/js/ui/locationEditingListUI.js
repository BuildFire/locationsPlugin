/* eslint-disable class-methods-use-this */

import SortableListUI from "./sortableList/sortableListUI";

class LocationEditingUI extends SortableListUI {
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
    const editorsContainer = document.createElement("div");
    const title = document.createElement("a");
    const subTitle = document.createElement("span");
    const editors = document.createElement("a");
    const tags = document.createElement("span");
    const deleteButton = document.createElement("span");
    const addUsersButton = document.createElement("button");
    const addUsersButtonSpan = document.createElement("span");
    const addTagsButton = document.createElement("button");
    const addTagsButtonSpan = document.createElement("span");

    // Add the required classes to the elements
    divRow.className = "d-item clearfix";
    moveHandle.className = "icon icon-menu cursor-grab";
    titleContainer.className = "title-container ellipsis";
    titleContainer.style = "max-width: calc(100% - 390px);";
    editorsContainer.className = "title-container ellipsis";
    editorsContainer.style = "min-width: 100px; max-width: 100px;";
    title.className = "title ellipsis item-title cursor-default pointer-events-none";
    subTitle.className = "ellipsis subTitle caption";
    editors.className = "title ellipsis item-title text-primary";
    tags.className = "ellipsis subTitle caption width-unset cursor-pointer";

    titleContainer.appendChild(title);
    titleContainer.appendChild(subTitle);

    editorsContainer.appendChild(editors);
    editorsContainer.appendChild(tags);

    addUsersButton.appendChild(addUsersButtonSpan);
    addTagsButton.appendChild(addTagsButtonSpan);

    deleteButton.className = "btn--icon icon icon-cross2";
    addUsersButton.className = "btn btn-default btn-sm margin-right-ten";
    addUsersButtonSpan.className = "text-success";
    addTagsButton.className = "btn btn-default btn-sm";
    addTagsButtonSpan.className = "text-success";

    // min-width 6rem
    title.innerHTML = item.title;
    subTitle.innerHTML = item.formattedAddress;
    editors.innerHTML = `${item.editingPermissions.editors.length} Editors`;
    tags.innerHTML = `${item.editingPermissions.tags.length} Tags`;
    addUsersButtonSpan.innerHTML = 'Add Users';
    addTagsButtonSpan.innerHTML = 'Add Tags';

    const mediaHolder = document.createElement("div");
    mediaHolder.className = "media-holder";

    const img = document.createElement("img");
    img.src = this._cropImage(item.listImage, {
      width: 40,
      height: 40,
    });
    mediaHolder.appendChild(img);

    divRow.appendChild(mediaHolder);
    divRow.appendChild(titleContainer);
    divRow.appendChild(editorsContainer);
    divRow.appendChild(addUsersButton);
    divRow.appendChild(addTagsButton);
    divRow.appendChild(deleteButton);

    addUsersButton.onclick = () => {
      this.onAddUsers(item, (err, updatedItem) => {
        if (updatedItem) {
          editors.innerHTML = `${updatedItem.editingPermissions.editors.length} Editors`;
        }
      });
    };

    addTagsButton.onclick = () => {
      this.onAddTags(item, (err, updatedItem) => {
        if (updatedItem) {
          tags.innerHTML = `${updatedItem.editingPermissions.tags.length} Tags`;
        }
      });
    };

    editors.onclick = (e) => {
      this.onUpdateItem(item, (err, updatedItem) => {
      });
    };
    tags.onclick = (e) => {
      this.onUpdateItem(item, (err, updatedItem) => {
      });
    };

    deleteButton.onclick = () => {
      let index = divRow.getAttribute("arrayIndex"); /// it may have bee reordered so get value of current property
      index = parseInt(index);
      let t = this;
      this.onDeleteItem(item, index, (confirmed) => {
        if (confirmed) {
          divRow.parentNode?.removeChild(divRow);
          t.reIndexRows();
        }
      });
      return false;
    };
  };
}

export default LocationEditingUI;
