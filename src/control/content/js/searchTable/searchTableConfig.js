 const searchTableConfig = {
  options: {
    showEditButton: true,
    showDeleteButton: true,
  },
  columns: [
    {
      header: "Name",
      data: "${data.title}",
      type: "string",
      width: "150px",
      sortBy: "title",
    },
    {
      header: "Category",
      data: "<h6 class='text-primary margin-bottom-five'>${data.categoriesName}</h6><span class='text-muted text-small'>${data.categories.subcategories.length} Subcategories</span>",
      type: "string",
      width: "150px",
      sortBy: "",
    },
  ],
};

export default searchTableConfig;