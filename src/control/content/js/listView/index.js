
const state = {
  isWysiwygInitialized: true,
};

const listViewSection = document.querySelector("#main");

const renderListViewWysiwyg = () => {
  tinymce.init({
    selector: "#listview-description-wysiwyg",
  });
};

window.onDescriptionChanged = () => {
  console.log('Hello');
}

window.initListView = () => {
  renderListViewWysiwyg();
};
