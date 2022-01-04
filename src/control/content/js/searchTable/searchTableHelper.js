/* eslint-disable class-methods-use-this */
import DataMocks from "../../../../DataMocks";
import buildfire from "buildfire";

export default class SearchTableHelper {
  constructor(tableId, config) {
    if (!config) throw "No config provided";
    if (!tableId) throw "No tableId provided";
    this.table = document.getElementById(tableId);
    if (!this.table) throw "Cant find table with ID that was provided";
    this.config = config;
    this.tag = null;
    this.items = [];
    this.sort = {};
    this.commands = {};
    this.init();
  }

  init() {
    this.table.innerHTML = "";
    this.renderHeader();
    this.renderBody();
  }

  renderHeader() {
    if (!this.config.columns) throw "No columns are indicated in the config";
    this.thead = this._create("thead", this.table);
    this.config.columns.forEach((colConfig) => {
      let classes = [];
      if (colConfig.type === "date") classes = ["text-center"];
      else if (colConfig.type === "number") classes = ["text-right"];
      else classes = ["text-left", "text-bold"];
      let th = this._create("th", this.thead, colConfig.header, classes);
      if (colConfig.sortBy) {
        const icon = this._create("span", th, "", [
          "icon",
          "icon-chevron-down",
        ]);
        const _t = this;
        th.addEventListener("click", () => {
          if (_t.sort[colConfig.sortBy] && _t.sort[colConfig.sortBy] > 0) {
            _t.sort = { [colConfig.sortBy]: -1 };
            icon.classList.remove("icon-chevron-up");
            icon.classList.add("icon-chevron-down");
          } else {
            // revert icon if previously sorted
            for (let i = 0; i < _t.thead.children.length; i++) {
              if (_t.thead.children[i].children[0]) {
                _t.thead.children[i].children[0].classList.remove(
                  "icon-chevron-up"
                );
                _t.thead.children[i].children[0].classList.add(
                  "icon-chevron-down"
                );
              }
            }
            _t.sort = { [colConfig.sortBy]: 1 };
            icon.classList.remove("icon-chevron-down");
            icon.classList.add("icon-chevron-up");
          }
          _t.onSort(_t.sort);
        });
      }
      if (colConfig.width) th.style.width = colConfig.width;
    });

    this._create("th", this.thead, "", ["actionsColumn"]);
  }

  renderBody() {
    this.tbody = this._create("tbody", this.table);
    this.tbody.onscroll = (e) => {
      if (this.tbody.scrollTop / this.tbody.scrollHeight > 0.9) this.onLoadMore();
    };
  }

  // eslint-disable-next-line class-methods-use-this
  _cropImage(url, options) {
    if (!url) {
      return "";
    }
    return buildfire.imageLib.cropImage(url, options);
  }

  search(filter) {
    this.tbody.innerHTML = "";
    this._create("tr", this.tbody, '<td colspan="99"> searching...</td>', [
      "loadingRow",
    ]);
    this.filter = filter;
    this._fetchPageOfData(this.filter, 0);
  }

  renderData(items, categories = []) {
    this.tbody.innerHTML = "";
    items.forEach((location) => {
      const selectedCategories = categories.filter((elem) =>
        location.categories.main.includes(elem.id)
      );
      location.categoriesName = selectedCategories
        .map((elem) => elem.title)
        .join(", ");
      this.renderRow(location);
    });
  }

  clearData() {
    this.tbody.innerHTML = "";
    this.items = [];
  }

  _fetchNextPage() {
    if (this.fetchingNextPage) return;
    this.fetchingNextPage = true;
    let t = this;
    this._fetchPageOfData(this.filter, this.pageIndex + 1, () => {
      t.fetchingNextPage = false;
    });
  }

  _fetchPageOfData(filter, pageIndex, callback) {
    if (pageIndex > 0 && this.endReached) return;
    let pageSize = 50;
    this.pageIndex = pageIndex;
    let options = {
      filter: filter,
      sort: this.sort,
      page: pageIndex,
      pageSize: pageSize,
    };

    const results = DataMocks.generate("LOCATION", 10);
    this.searchOptions = options;
    this.tbody.innerHTML = "";
    results.forEach((r) => this.renderRow(r));
  }

  _onCommand(obj, tr, command) {
    if (this.commands[command]) {
      this.commands[command](obj, tr);
    } else {
      console.log(`Command ${command} does not have any handler`);
    }
  }

  getImage(obj) {
    const div = document.createElement("div");
    if (obj.listImage) {
      const img = document.createElement("img");
      img.src = this._cropImage(obj.listImage, {
        width: 16,
        height: 16,
      });

      div.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "add-icon text-success";
      span.innerHTML = "+";
      div.appendChild(span);
    }

    return div.innerHTML;
  }

  renderRow(obj, tr) {
    if (tr) {
      // used to update a row
      tr.innerHTML = "";
    } else {
      tr = this._create("tr", this.tbody);
    }
    tr.setAttribute("objId", obj.id);
    this.config.columns.forEach((colConfig) => {
      let classes = [];
      if (colConfig.type === "date") classes = ["text-center"];
      else if (colConfig.type === "number") classes = ["text-right"];
      else classes = ["text-left"];
      let td;

      if (colConfig.type === "command") {
        td = this._create(
          "td",
          tr,
          `<button class="btn btn-link">${colConfig.text}</button>`,
          ["editColumn"]
        );
        td.onclick = (event) => {
          event.preventDefault();
          this._onCommand(obj, tr, colConfig.command);
        };
      } else if (colConfig.type === "image") {
        td = this._create(
          "td",
          tr,
          `<div class="icon-holder">${this.getImage(obj)}</div>`,
          ["imageColumn"]
        );
        td.onclick = () => {
          this.onImageClick(obj, tr);
        };
      } else {
        let output = "";
        try {
          // needed for the eval statement next
          let data = obj;
          output = eval("`" + colConfig.data + "`");
        } catch (error) {
          console.log(error);
        }
        td = this._create("td", tr, output, classes);
      }
      if (colConfig.width) td.style.width = colConfig.width;
    });

    const t = this;
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "flex-row justify-content-end";
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn btn--icon";
    copyBtn.innerHTML = `<span class="glyphicon glyphicon-link"></span>`;
    actionsDiv.appendChild(copyBtn);

    const editBtn = document.createElement("span");
    editBtn.className = "btn--icon icon icon-pencil3";
    actionsDiv.appendChild(editBtn);

    const deleteBtn = document.createElement("span");
    deleteBtn.className = "btn--icon icon icon-cross2";
    actionsDiv.appendChild(deleteBtn);

    copyBtn.onclick = () => {
      console.log('Hello');
      t.onCopy(obj, tr);
    };
    editBtn.onclick = () => {
      t.onEditRow(obj, tr);
    };
    deleteBtn.onclick = () => {
      t.onRowDeleted(obj, tr, () => {
        tr.classList.add("hidden");
      });
    };

    const actionsColumn = document.createElement("td");
    actionsColumn.className = "actionsColumn";
    actionsColumn.appendChild(actionsDiv);
    tr.appendChild(actionsColumn);

    // this._create(
    //   "td",
    //   tr,
    //   `<div class="flex-row justify-content-end">
    //     ${actionsDiv.innerHTML}
    //   </div>`,
    //   ["actionsColumn"]
    // );

    this.onRowAdded(obj, tr);
  }

  onSearchSet(options) {
    return options;
  }

  onRowAdded(obj, tr) {}

  onEditRow(obj, tr) {
    console.log("Edit row", obj);
  }

  onRowDeleted(obj, tr) {
    console.log("Record Delete", obj);
  }

  onSort(sort) {}

  onCopy(obj) {}

  onImageClick(obj, tr) {}

  onLoadMore() {}


  onCommand(command, cb) {
    this.commands[command] = cb;
  }


  _create(elementType, appendTo, innerHTML, classNameArray) {
    let e = document.createElement(elementType);
    if (innerHTML) e.innerHTML = innerHTML;
    if (Array.isArray(classNameArray))
      classNameArray.forEach((c) => e.classList.add(c));
    if (appendTo) appendTo.appendChild(e);
    return e;
  }
}
