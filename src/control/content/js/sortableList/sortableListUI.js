/* eslint-disable max-len */
/* eslint-disable class-methods-use-this */
import buildfire from "buildfire";
import SortableList from "./SortableList";

class SortableListUI {
  constructor(options = {}) {
    this.sortableList = null;
    this.container = null;
    this.tag = "";
    this.data = null;
    this.id = null;
    this.options = options;
  }

  get items() {
    return this.sortableList.items;
  }

  /*
	This method will call the datastore to pull a single object
	it needs to have an array property called `items` each item need {title, imgUrl}
  */
  init(elementId, items) {
    this.container = document.getElementById(elementId);
    this.container.innerHTML = "";
    this.render(items);
  }

  render(items) {
    this.sortableList = new SortableList(this.container, items || [], this._injectItemElements, this.options);

    this.sortableList.onItemClick = this.onItemClick;
    this.sortableList.onDeleteItem = this.onDeleteItem;
    this.sortableList.onUpdateItem = this.onUpdateItem;

    this.sortableList.onOrderChange = this.onOrderChange;
    this.sortableList.onToggleChange = this.onToggleChange;
  }

  // append new sortable item to the DOM
  _injectItemElements(item, index, divRow) {
    // function passed by constructor;
  }

  /**
   * Updates item in datastore and updates sortable list UI
   * @param {Object} item Item to be updated
   * @param {Number} index Array index of the item you are updating
   * @param {HTMLElement} divRow Html element (div) of the entire row that is being updated
   * @param {Function} callback Optional callback function
   */

  updateItem(item, index, divRow, callback) {
    this.sortableList.injectItemElements(item, index, divRow);
  }

  /**
   * This function adds item to datastore and updates sortable list UI
   * @param {Object} item Item to be added to datastore
   * @param {Function} callback Optional callback function
   */

  addItem(item, callback) {
    this.sortableList.append(item);
  }

  onItemClick(item, divRow) {}

  onUpdateItem(item, index, divRow) {
    console.log("onUpdateItem");
  }

  onDeleteItem(item, index, callback) {

  }

  onOrderChange(item, oldIndex, newIndex) {
    console.log("Order changed");
  }

  onToggleChange() {}
}

export default SortableListUI;
