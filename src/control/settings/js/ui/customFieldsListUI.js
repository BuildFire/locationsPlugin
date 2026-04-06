/* eslint-disable class-methods-use-this */

import SortableListUI from "./sortableList/sortableListUI";
import CpDropdown from "../../../../shared/CpDropdown";

class CustomFieldsListUI extends SortableListUI {
  constructor(elementId, dropdownOptions) {
    super(elementId, { isDraggable: true, dropdownOptions });
  }

  // append new sortable item to the DOM
  _injectItemElements(item, index, divRow) {
    if (!item) throw "Missing Item";
    divRow.innerHTML = "";
    divRow.setAttribute("arrayIndex", index);

    divRow.className = "d-item clearfix";
    divRow.style.padding = "10px";

    const uniqueId = item.id || Date.now() + index;

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
    flexContainer.style.gridTemplateRows = "1fr 1fr";
    flexContainer.style.columnGap = "16px";
    flexContainer.style.rowGap = "8px";
    flexContainer.style.alignItems = "center";
    mainContainer.appendChild(flexContainer);

    // Field Name Input
    const nameCol = document.createElement("div");
    nameCol.style.flex = "2";
    nameCol.style.minWidth = "150px";
    nameCol.style.gridColumn = "span 2";
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.className = "form-control label-input";
    labelInput.placeholder = "Field Name (Required)";
    labelInput.value = item.label || "";
    labelInput.oninput = (e) => {
      item.label = e.target.value;
      this.onUpdateItem(item, parseInt(divRow.getAttribute("arrayIndex"), 10), divRow);
    };
    nameCol.appendChild(labelInput);
    flexContainer.appendChild(nameCol);

    // Type Dropdown container
    const typeDropdownContainer = document.createElement("div");
    typeDropdownContainer.style.flex = "1.5";
    typeDropdownContainer.style.minWidth = "120px";
    typeDropdownContainer.className = "type-dropdown-container";
    flexContainer.appendChild(typeDropdownContainer);

    // Required Checkbox
    const reqCol = document.createElement("div");
    reqCol.style.display = "flex";
    reqCol.style.alignItems = "center";
    reqCol.style.gap = "10px";

    const reqCheckboxWrap = document.createElement("div");
    reqCheckboxWrap.className = "checkbox checkbox-primary no-label margin-zero";

    const reqCheckbox = document.createElement("input");
    reqCheckbox.type = "checkbox";
    reqCheckbox.id = `req_${uniqueId}`;
    reqCheckbox.className = "required-checkbox";
    reqCheckbox.checked = !!item.required;
    reqCheckbox.onchange = (e) => {
      item.required = e.target.checked;
      this.onUpdateItem(item, parseInt(divRow.getAttribute("arrayIndex"), 10), divRow);
    };

    const reqLabel = document.createElement("label");
    reqLabel.htmlFor = `req_${uniqueId}`;

    reqCheckboxWrap.appendChild(reqCheckbox);
    reqCheckboxWrap.appendChild(reqLabel);

    const reqSpan = document.createElement("span");
    reqSpan.innerHTML = `<label class="font-size-14 text--black margin-zero" for='req_${uniqueId}'>Required</label>`;

    reqCol.appendChild(reqCheckboxWrap);
    reqCol.appendChild(reqSpan);
    flexContainer.appendChild(reqCol);

    // Custom Label Checkbox
    const custCol = document.createElement("div");
    custCol.style.display = "flex";
    custCol.style.alignItems = "center";
    custCol.style.gap = "10px";
    custCol.style.gridColumn = "span 2";

    const custCheckboxWrap = document.createElement("div");
    custCheckboxWrap.className = "checkbox checkbox-primary no-label margin-zero";

    const custCheckbox = document.createElement("input");
    custCheckbox.type = "checkbox";
    custCheckbox.id = `cust_${uniqueId}`;
    custCheckbox.className = "custom-label-checkbox";
    custCheckbox.checked = !!item.enableCustomLabel;
    custCheckbox.onchange = (e) => {
      item.enableCustomLabel = e.target.checked;
      this.onUpdateItem(item, parseInt(divRow.getAttribute("arrayIndex"), 10), divRow);
    };

    const custLabel = document.createElement("label");
    custLabel.htmlFor = `cust_${uniqueId}`;

    custCheckboxWrap.appendChild(custCheckbox);
    custCheckboxWrap.appendChild(custLabel);

    const custSpan = document.createElement("span");
    custSpan.innerHTML = `<label class="font-size-14 text--black margin-zero" for='cust_${uniqueId}'>Allow Custom Label</label>`;

    custCol.appendChild(custCheckboxWrap);
    custCol.appendChild(custSpan);
    flexContainer.appendChild(custCol);

    // Delete Button
    const delCol = document.createElement("div");
    const deleteBtn = document.createElement("span");
    deleteBtn.className = "btn--icon icon icon-cross2 cursor-pointer delete-btn margin-left-ten";
    deleteBtn.onclick = () => {
      let currentIndex = divRow.getAttribute("arrayIndex");
      currentIndex = parseInt(currentIndex, 10);
      this.onDeleteItem(item, currentIndex, (confirmed) => {
        if (confirmed) {
          divRow.parentNode.removeChild(divRow);
          this.reIndexRows();
        }
      });
      return false;
    };
    delCol.appendChild(deleteBtn);
    divRow.appendChild(delCol);

    // Instantiate CpDropdown
    new CpDropdown(typeDropdownContainer, {
      items: this.options.dropdownOptions,
      selectedId: item.type,
      handleSelect: (selected) => {
        item.type = selected.id;
        this.onUpdateItem(item, parseInt(divRow.getAttribute("arrayIndex"), 10), divRow);
      }
    });
  }
}

export default CustomFieldsListUI;
