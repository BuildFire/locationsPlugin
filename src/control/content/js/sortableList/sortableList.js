/* eslint-disable class-methods-use-this */
import buildfire from "buildfire";

export default class SortableList {
  constructor(element, items = [], injectItemElements, options = {}) {
    // sortableList requires Sortable.js
    if (typeof Sortable === "undefined") {
      // eslint-disable-next-line no-throw-literal
      throw "please add Sortable first to use sortableList components";
    }

    this.injectItemElements = injectItemElements;
    this.items = [];
    this.options = options || {};
    this.init(element);
    this.loadItems(items);
  }

  // will be called to initialize the setting in the constructor
  init(element) {
    if (typeof element === "string") {
      this.element = document.getElement(element);
    } else {
      this.element = element;
    }

    this.element.classList.add("draggable-list-view");
    if (this.options.isDraggable) {
      this._initEvents();
    }
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
    // function passed by constructor;
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
