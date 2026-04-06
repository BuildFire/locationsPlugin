export default class CpDropdown {
    constructor(container, props) {
        this.container = typeof container === 'string' ? document.querySelector(container) : container;
        this.props = props || {};
        this.selectedItem = null;
        this.placeholder = this.props.placeholder || "";
        this.dropdownRef = null;
        this._handleDocumentClick = this._handleDocumentClick.bind(this);

        if (this.props.selectedId) {
            this.selectedItem = this.props.items.find(item => item.id == this.props.selectedId);
        } else {
            const defaultItem = this.props.items && this.props.items.find(item => !item.id);
            if (defaultItem) this.selectedItem = defaultItem;
            else this.selectedItem = null;
        }

        this.render();
        document.addEventListener('click', this._handleDocumentClick);
    }

    _handleDocumentClick(event) {
        if (this.dropdownRef && !this.dropdownRef.contains(event.target) && this.dropdownRef.classList.contains('open')) {
            this.hideDropdown();
        }
    }

    hideDropdown() {
        const dialogBody = document.querySelector('.dialog-body');
        if (dialogBody) dialogBody.style.overflowY = 'auto';
        if (this.dropdownRef) this.dropdownRef.classList.remove('open');
    }

    showDropdown() {
        const dialogBody = document.querySelector('.dialog-body');
        if (dialogBody) dialogBody.style.overflowY = 'unset';
        if (this.dropdownRef) this.dropdownRef.classList.add('open');
    }

    toggleCategoriesDropDown() {
        if (this.dropdownRef && this.dropdownRef.classList.contains('open')) {
            this.hideDropdown();
        } else {
            this.showDropdown();
        }
    }

    handleSelect(item) {
        if (this.props.handleSelect) {
            this.props.handleSelect(item);
        }
        this.hideDropdown();

        this.selectedItem = item;
        this.render();
    }

    render() {
        this.container.innerHTML = "";

        const wrapper = document.createElement('div');
        if (this.props.id) wrapper.id = this.props.id;
        wrapper.className = `row ${this.props.className ? this.props.className : ""}`;

        if (this.props.label) {
            const labelEl = document.createElement('label');
            labelEl.className = "col-md-4 pull-left";
            labelEl.innerHTML = `${this.props.label} ${this.props.required ? '<span class="required-label"></span>' : ''}`;
            wrapper.appendChild(labelEl);
        }

        const colDiv = document.createElement('div');
        colDiv.className = `${this.props.label ? "col-md-8" : "col-md-12"} pull-left`;

        const btnGroup = document.createElement('div');
        btnGroup.className = "btn-group w-100";
        this.dropdownRef = btnGroup;

        const button = document.createElement('button');
        button.type = "button";
        button.className = "btn btn-default dropdown-toggle text-left flex space-between";
        button.setAttribute("data-toggle", "dropdown");
        button.setAttribute("aria-haspopup", "true");
        button.setAttribute("aria-expanded", "false");

        if (!this.props.items || !this.props.items.length) {
            button.disabled = true;
        }

        button.onclick = () => this.toggleCategoriesDropDown();

        const ellipsisSpan = document.createElement('span');
        ellipsisSpan.className = "ellipsis";
        ellipsisSpan.textContent = (this.selectedItem && this.selectedItem.label) ? this.selectedItem.label : this.placeholder;

        const caretSpan = document.createElement('span');
        caretSpan.className = "caret pull-right";

        button.appendChild(ellipsisSpan);
        button.appendChild(caretSpan);

        btnGroup.appendChild(button);

        const ul = document.createElement('ul');
        ul.className = "dropdown-menu min-width-unset";
        if (this.props.dropToTop) {
            ul.classList.add('dropup');
        }
        ul.setAttribute("role", "menu");

        if (this.props.items && this.props.items.length) {
            this.props.items.forEach(item => {
                const li = document.createElement('li');
                li.onclick = () => this.handleSelect(item);
                const a = document.createElement('a');
                a.textContent = item.label;
                li.appendChild(a);
                ul.appendChild(li);
            });
        }

        btnGroup.appendChild(ul);
        colDiv.appendChild(btnGroup);
        wrapper.appendChild(colDiv);

        this.container.appendChild(wrapper);
    }

    destroy() {
        document.removeEventListener('click', this._handleDocumentClick);
        this.container.innerHTML = "";
    }
}