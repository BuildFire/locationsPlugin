import SortableListUI from "./sortableList/sortableListUI";
import BaseDropdown from "../../../../shared/baseDropdown";

class SubscriptionOptionsListUI extends SortableListUI {
  constructor(elementId, dropdownOptions, globalEntries) {
    super(elementId, { isDraggable: true, dropdownOptions, globalEntries, dropdowns : []});
  }

  init(items) {
    super.init(items);
  }

  _injectItemElements(item, index, divRow) {
    if (!item) throw "Missing Item";
    divRow.innerHTML = "";
    divRow.setAttribute("arrayIndex", index);

    divRow.className = "d-item clearfix";
    divRow.style.padding = "10px";

    // Drag handle
    const dragHandle = document.createElement("span");
    dragHandle.className = "icon icon-menu cursor-grab pull-left margin-zero padding-right-ten";
    dragHandle.style.marginTop = "10px";
    divRow.appendChild(dragHandle);

    // Main container
    const mainContainer = document.createElement("div");
    mainContainer.className = "pull-left";
    mainContainer.style.width = "calc(100% - 40px)";
    mainContainer.style.marginLeft = "10px";
    divRow.appendChild(mainContainer);

    // Grid container
    const flexContainer = document.createElement("div");
    flexContainer.style.display = "grid";
    flexContainer.style.gridTemplateColumns = "1fr 1fr 1fr";
    flexContainer.style.columnGap = "16px";
    flexContainer.style.rowGap = "8px";
    flexContainer.style.alignItems = "center";
    mainContainer.appendChild(flexContainer);

    // Subscription Name Input
    const nameCol = document.createElement("div");
    nameCol.style.minWidth = "80px";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "form-control";
    nameInput.placeholder = "Subscription Name";
    nameInput.maxLength = "15";
    nameInput.value = item.name || "";
    nameInput.oninput = (e) => {
      item.name = e.target.value;
      this.onUpdateItem(item, parseInt(divRow.getAttribute("arrayIndex"), 10), divRow);
    };
    nameCol.appendChild(nameInput);
    flexContainer.appendChild(nameCol);

    // Description Input
    const descCol = document.createElement("div");
    descCol.style.minWidth = "80px";
    const descInput = document.createElement("input");
    descInput.type = "text";
    descInput.className = "form-control";
    descInput.placeholder = "Description";
    descInput.value = item.description || "";
    descInput.oninput = (e) => {
      item.description = e.target.value;
      this.onUpdateItem(item, parseInt(divRow.getAttribute("arrayIndex"), 10), divRow);
    };
    descCol.appendChild(descInput);
    flexContainer.appendChild(descCol);

    // Type Dropdown container
    const typeDropdownContainer = document.createElement("div");
    typeDropdownContainer.style.flex = "1.5";
    typeDropdownContainer.style.minWidth = "80px";
    typeDropdownContainer.className = "type-dropdown-container";
    flexContainer.appendChild(typeDropdownContainer);

    const getFilteredDropdownItems = () => {
      const subscriptionOptions = this.options.globalEntries?.charging?.subscriptionOptions || [];
      const selectedIds = subscriptionOptions
        .filter((i) => i.subscriptionId)
        .map((i) => i.subscriptionId);

      return this.options.dropdownOptions
        .filter((option) => !selectedIds.includes(option.id) || option.id === item.subscriptionId)
        .map((option) => ({
          id: option.id,
          value: option.id,
          label: option.name,
        }));
    };

    const items = getFilteredDropdownItems();

    // Instantiate BaseDropdown
    const dropdownSubscriptions = new BaseDropdown(typeDropdownContainer, {
      items,
      selectedId: item.subscriptionId || item.type,
      handleSelect: (selected) => {
        const subscription = this.options.dropdownOptions.find((s) => s.id === selected.id);
        item.type = selected.id;
        item.subscriptionId = selected.id;
        if (subscription) {
          item.tag = subscription.tag || '';
        }
        this.onUpdateItem(item, parseInt(divRow.getAttribute("arrayIndex"), 10), divRow);
      }
    });

    // Delete Button
    const delCol = document.createElement("div");
    const deleteBtn = document.createElement("span");
    deleteBtn.className = "btn--icon icon icon-cross2 cursor-pointer delete-btn margin-left-ten";
    deleteBtn.onclick = () => {
      let currentIndex = divRow.getAttribute("arrayIndex");
      currentIndex = parseInt(currentIndex, 10);
      this.onDeleteItem(item, currentIndex, (confirmed) => {
        if (confirmed) {
          if (divRow && divRow.parentNode) {
            divRow.parentNode.removeChild(divRow);
          }
          this.reIndexRows();
        }
      });
      return false;
    };
    delCol.appendChild(deleteBtn);
    divRow.appendChild(delCol);

    this.options.dropdowns.push({ element: typeDropdownContainer, dropdown: dropdownSubscriptions, item });
  }

  refreshDropdownItems() {
    this.options.dropdowns.forEach(({ element, dropdown, item }) => {
      const subscriptionOptions = this.options.globalEntries?.charging?.subscriptionOptions || [];
      const selectedIds = subscriptionOptions
        .filter((i) => i.subscriptionId)
        .map((i) => i.subscriptionId);

      const filteredItems = this.options.dropdownOptions
        .filter((option) => !selectedIds.includes(option.id) || option.id === item.subscriptionId)
        .map((option) => ({
          id: option.id,
          value: option.id,
          label: option.name,
        }));

      dropdown.props.items = filteredItems;
      dropdown.render();
    });
  }
}

export default SubscriptionOptionsListUI;
