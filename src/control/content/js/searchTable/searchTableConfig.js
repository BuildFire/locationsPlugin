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
      data: "${data.address}",
      type: "string",
      width: "150px",
      sortBy: "",
    },
  ],
};

export default searchTableConfig;