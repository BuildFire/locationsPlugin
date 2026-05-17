/* eslint-disable class-methods-use-this */

import SortableListUI from "./sortableList/sortableListUI";
import BaseDropdown from "../../../../shared/baseDropdown";
import constants from "../../../../widget/js/global/constants";

const getTagDisplayName = (tag) => {
  if (typeof tag === "string") {
    return tag;
  }

  if (!tag || typeof tag !== "object") {
    return "";
  }

  return `<span>${tag.tagName || ""}</span>`;
};

const getVisibilityTooltip = (visibility) => {
  if (!visibility || visibility.value !== constants.CustomFieldVisibilityOptions.TAGS || !Array.isArray(visibility.tags)) {
    return "";
  }

  return visibility.tags
    .map(getTagDisplayName)
    .filter(Boolean)
    .join("<br/>");
};

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

    let visibilityLabel;
    if (item.visibility && item.visibility.value === constants.CustomFieldVisibilityOptions.ALL) {
      visibilityLabel = "All Users";
    } else {
      visibilityLabel = `${item.visibility.tags.length} Tag${item.visibility.tags.length !== 1 ? 's' : ''}`;
    }
    const visibilitySpan = document.createElement("span");
    visibilitySpan.classList.add('margin-left-auto');
    visibilitySpan.classList.add('flex');
    visibilitySpan.classList.add('cursor-pointer');
    const visibilityTooltip = getVisibilityTooltip(item.visibility);
    if (visibilityTooltip) {
      visibilitySpan.classList.add('bf-tooltip');
      visibilitySpan.classList.add('left-tooltip');
      visibilitySpan.classList.add('hidden-tooltip');
    }
    const visibilityIcon = document.createElement("span");
    visibilityIcon.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clip-path="url(#clip0_2765_14601)">
      <path d="M19.8718 10.167C19.8248 10.114 18.6898 8.86195 16.9158 7.59495C15.8688 6.84695 14.8158 6.25095 13.7858 5.82195C12.4808 5.27795 11.2068 5.00195 9.99976 5.00195C8.79276 5.00195 7.51876 5.27795 6.21376 5.82195C5.18376 6.25095 4.13076 6.84795 3.08376 7.59495C1.30976 8.86195 0.174762 10.115 0.127762 10.167C-0.0432383 10.357 -0.0432383 10.646 0.127762 10.836C0.174762 10.889 1.30976 12.141 3.08376 13.408C4.13076 14.156 5.18376 14.752 6.21376 15.181C7.51876 15.725 8.79276 16.001 9.99976 16.001C11.2068 16.001 12.4808 15.725 13.7858 15.181C14.8158 14.752 15.8688 14.155 16.9158 13.408C18.6898 12.141 19.8248 10.888 19.8718 10.836C20.0428 10.646 20.0428 10.357 19.8718 10.167ZM12.5738 6.43895C13.4808 7.20195 13.9998 8.31195 13.9998 9.50095C13.9998 11.707 12.2058 13.501 9.99976 13.501C7.79376 13.501 5.99976 11.707 5.99976 9.50095C5.99976 8.31295 6.51876 7.20195 7.42576 6.43895C8.24776 6.17095 9.11676 6.00095 9.99976 6.00095C10.8828 6.00095 11.7518 6.17095 12.5738 6.43895ZM16.3168 12.607C14.7838 13.699 12.4438 15.001 9.99976 15.001C7.55576 15.001 5.21576 13.699 3.68276 12.607C2.52576 11.783 1.64076 10.949 1.19376 10.501C1.64076 10.053 2.52576 9.21995 3.68276 8.39495C4.21276 8.01695 4.83876 7.61495 5.53276 7.24995C5.18576 7.93795 4.99976 8.70495 4.99976 9.50095C4.99976 12.258 7.24276 14.501 9.99976 14.501C12.7568 14.501 14.9998 12.258 14.9998 9.50095C14.9998 8.70495 14.8138 7.93795 14.4668 7.24995C15.1608 7.61495 15.7868 8.01795 16.3168 8.39495C17.4738 9.21895 18.3588 10.053 18.8058 10.501C18.3588 10.949 17.4738 11.782 16.3168 12.607Z" fill="#808080"/>
      </g>
      <defs>
      <clipPath id="clip0_2765_14601">
      <rect width="20" height="20" fill="white"/>
      </clipPath>
      </defs>
    </svg>`;
    const visibilityLabelSpan = document.createElement("span");
    visibilityLabelSpan.textContent = visibilityLabel;
    visibilityLabelSpan.className = "margin-left-five text-primary item-visibility-label";
    visibilitySpan.appendChild(visibilityIcon);
    visibilitySpan.appendChild(visibilityLabelSpan);

    if (visibilityTooltip) {
      const tooltipContent = document.createElement("span");
      tooltipContent.className = "tooltip-content right";
      tooltipContent.innerHTML = visibilityTooltip;
      visibilitySpan.appendChild(tooltipContent);
    }

    visibilitySpan.onclick = () => {
      this.onItemVisibilityClick(item);
    };

    custCol.appendChild(custCheckboxWrap);
    custCol.appendChild(custSpan);
    custCol.appendChild(visibilitySpan);

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

    // Instantiate BaseDropdown
    new BaseDropdown(typeDropdownContainer, {
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
