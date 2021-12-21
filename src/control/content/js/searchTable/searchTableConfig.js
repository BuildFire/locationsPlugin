 const searchTableConfig = {
  options: {
    showEditButton: true,
    showDeleteButton: true,
  },
  columns: [
    {
      header: "",
      data: "",
      type: "image",
      width: "60px",
    },
    {
      header: "Name",
      data: "<span class='text-primary margin-bottom-five'>${data.title}</span><br><span class='text-muted text-small'>${data.address}</span>",
      type: "string",
      width: "150px",
      sortBy: "title",
    },
    {
      header: "Category",
      data: "<span class='text-primary margin-bottom-five'>${data.categoriesName? data.categoriesName : 'No categories'}</span><br><span class='text-muted text-small'>${data.categories.subcategories.length} Subcategories</span>",
      type: "string",
      width: "150px",
      sortBy: "",
    },
  ],
};

export default searchTableConfig;