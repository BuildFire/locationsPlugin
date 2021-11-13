/* eslint-disable class-methods-use-this */
import buildfire from "buildfire";

export default class SortableList {
  constructor(element, items = []) {
    // sortableList requires Sortable.js
    if (typeof Sortable === "undefined")
      throw "please add Sortable first to use sortableList components";
    this.items = [];
    this.init(element);
    this.loadItems(items);
  }

  // will be called to initialize the setting in the constructor
  init(element) {
    if (typeof element === "string")
      this.element = document.getElement(element);
    else this.element = element;
    //this._renderTemplate();
    this.element.classList.add("draggable-list-view");
    // this._initEvents();
  }

  // this method allows you to replace the slider image or append to then if appendItems = true
  loadItems(items, appendItems) {
    if (items && items instanceof Array) {
      if (!appendItems && this.items.length !== 0) {
        // here we want to remove any existing items since the user of the component don't want to append items
        this._removeAll();
      }

      for (var i = 0; i < items.length; i++) {
        this.items.push(items[i]);
        let row = document.createElement("div");
        this.injectItemElements(items[i], this.items.length - 1, row);
        this.element.appendChild(row);
      }
    }
  }

  // allows you to append a single item or an array of items
  append(items) {
    if (!items) {
      return;
    }

    if (!(items instanceof Array) && typeof items === "object") {
      items = [items];
    }

    this.loadItems(items, true);
  }

  // remove all items in list
  clear() {
    this._removeAll();
  }

  // remove all the DOM element and empty the items array
  _removeAll() {
    this.items = [];
    this.element.innerHTML = "";
  }

  // append new sortable item to the DOM
  injectItemElements(item, index, divRow) {
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

    deleteButton.className = "btn btn--icon icon icon-cross2";
    editButton.className = "btn btn--icon icon icon-pencil3";
    title.innerHTML = item.title;

    /**
         * 
         *   <div class="button-switch">
                <input id="show1stAnswerInTitle" type="checkbox"
                    onclick="handleToggleChange('show1stAnswerInTitle', event.target.checked)" />
                <label for="show1stAnswerInTitle" class="label-success"></label>
            </div>
         */

    // Append elements to the DOM
    // divRow.appendChild(moveHandle);

    const mediaHolder = document.createElement("div");
    mediaHolder.className = "media-holder";

    if (item.icon) {
      const img = document.createElement("img");
      img.src = this._cropImage(item.icon, {
        width: 16,
        height: 16,
      });
      mediaHolder.appendChild(img);
    }

    divRow.appendChild(mediaHolder);

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

  // initialize the generic events
  _initEvents() {
    const me = this;
    let oldIndex = 0;

    // initialize the sort on the container of the items
    me.sortableList = Sortable.create(me.element, {
      animation: 150,
      onUpdate: (evt) => {
        let newIndex = me._getSortableItemIndex(evt.item);
        let tmp = me.items.splice(oldIndex, 1)[0];
        me.items.splice(newIndex, 0, tmp);
        me.reIndexRows();
        me.onOrderChange(tmp, oldIndex, newIndex);
      },
      onStart: (evt) => {
        oldIndex = me._getSortableItemIndex(evt.item);
      },
    });
  }

  reIndexRows() {
    let i = 0;
    this.element.childNodes.forEach((e) => {
      e.setAttribute("arrayIndex", i);
      i++;
    });
  }

  // get item index from the DOM sortable elements
  _getSortableItemIndex(item) {
    let index = 0;
    while ((item = item.previousSibling) != null) {
      index++;
    }
    return index;
  }

  _cropImage(url, options) {
    if (!url) {
      return "";
    }
    return buildfire.imageLib.cropImage(url, options);
  }

  /* This will be triggered when the order of items changes
	  Example: if you move the first item location to be the second this will return item object, 0, 1 */
  onOrderChange(item, oldIndex, newIndex) {
    console.warn("please handle onOrderChange", item, oldIndex, newIndex);
  }

  // This will be triggered when you delete an item
  onDeleteItem(item, index) {
    console.error("please handle onDeleteItem", item);
  }

  onUpdateItem(item, index, divRow) {
    console.error("please handle onUpdateItem", item);
  }

  // This will be triggered when you delete an item
  onItemClick(item, index, divRow) {
    console.error("please handle onItemClick", item);
  }

  onToggleChange(item, index, divRow) {
    console.error("please handle onToggleChange", item);
  }
}
