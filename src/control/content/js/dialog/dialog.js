export default class DialogComponent {
  constructor(id, templateId) {
    this.container = document.getElementById(id);
    if (!this.container) throw "Sub Page ID not found";
    if (!this.container.classList.contains("dialog-component")) throw "Sub Page doesnt have class [subPage]";

    const dialogBody = this.container.querySelector(".dialog-body");
    dialogBody.innerHTML = "";
    let template = document.getElementById(`${templateId}`);
    template = document.importNode(template.content, true);
    dialogBody.appendChild(template);

    const closeButton = this.container.querySelector(".close-modal");
    if (closeButton) {
      closeButton.onclick = (e) => {
        this.hideBackdrop();
        this.container.classList.remove("activeDialog");
        this.onClose(e);
      };
    }
  }

  show() {
    this.showBackdrop();
    this.container.classList.add("activeFull");
  }

  showDialog(options, saveCallback) {
    const btnSave = this.container.querySelector(".dialog-save-btn");
    btnSave.onclick = saveCallback;

    const btnCancelButton = this.container.querySelector(".dialog-cancel-btn");
    btnCancelButton.style.display = ''; //reset
    btnCancelButton.onclick = (e) => {
      this.close(e);
    };
    if (options) {
      if (options.title) {
        const h = this.container.querySelector(".dialog-header-text");
        h.innerHTML = options.title;
      }
      if (options.saveText) {
        btnSave.innerHTML = options.saveText;
      }

      if (options.hideDelete) {
        btnCancelButton.style.display = 'none';
      }
    }
    this.showBackdrop();
    this.container.classList.add("activeDialog");
  }

  close(e) {
    this.hideBackdrop();
    this.container.classList.remove("activeFull");
    this.container.classList.remove("activeDialog");
    this.onClose(e);
  }

  showBackdrop() {
    let backdrop = document.querySelector('#dialogBackdrop');
    if (backdrop) {
      return
    }
    backdrop = document.createElement('div');
    backdrop.setAttribute('id', 'dialogBackdrop');
    this.container.parentElement.appendChild(backdrop);
  }

  hideBackdrop() {
    const backdrop = document.querySelector('#dialogBackdrop');
    if (backdrop) {
      this.container.parentElement.removeChild(backdrop);
    }
  }

  onClose(event) {
    console.log('Dialog Closed');
  }
}