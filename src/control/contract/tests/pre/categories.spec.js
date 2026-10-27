// categories: every operation on categories and their subcategories, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
  if (buildfire.analytics && typeof buildfire.analytics.registerEvent === 'function') spyOn(buildfire.analytics, 'registerEvent');
};
const holding = (title) => jasmine.objectContaining({ result: jasmine.arrayContaining([jasmine.objectContaining({ data: jasmine.objectContaining({ title }) })]) });

// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Pre category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp }).then(() => call('createSubcategory', { categoryTitle: forTheApp, title: 'Pre gardens' }))
    : call('listCategories', { title: forTheApp }).then(({ result: [record] }) => record || Promise.reject(new Error(`no category titled "${forTheApp}": the control run makes it`))));
  return madeCategory;
};

contract.describe('listCategories', () => {
  beforeEach(quiet);

  it('finds a category by its title', async () => {
    await categoryForTheApp();
    expect(await call('listCategories', { title: forTheApp })).toEqual(holding(forTheApp));
  });

  it('shows a page of every category', async () => {
    await categoryForTheApp();
    expect(await call('listCategories', { page: 0 })).toEqual(jasmine.objectContaining({ result: jasmine.any(Array), totalRecord: jasmine.any(Number) }));
  });
});

contract.describe('createCategory', () => {
  beforeEach(quiet);

  it('adds a category from its title', async () => {
    expect(await call('createCategory', { title: `Pre category (${contract.host})` }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: `Pre category (${contract.host})` }));
  });

  it('adds a category with an icon picture', async () => {
    expect(await call('createCategory', { title: `Pre category with an icon (${contract.host})`, icon: ['https://example.com/pre-icon.png'] }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), iconUrl: 'https://example.com/pre-icon.png' }));
  });

  it('adds a category with a library icon', async () => {
    expect(await call('createCategory', { title: `Pre category with a library icon (${contract.host})`, iconClassName: 'glyphicon glyphicon-leaf' }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), iconClassName: 'glyphicon glyphicon-leaf' }));
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds several categories at once', async () => {
    const categories = [{ title: `Pre batch category one (${contract.host})` }, { title: `Pre batch category two (${contract.host})`, iconClassName: 'glyphicon glyphicon-star' }];
    expect(await call('createCategoriesAdvanced', { categories })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateCategory', () => {
  beforeEach(quiet);

  it('renames a category, naming it by its title', async () => {
    const title = `Pre category to rename (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('updateCategory', { title, newTitle: `Pre category renamed (${contract.host})` }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: `Pre category renamed (${contract.host})` }));
  });

  it('changes a category\'s icon', async () => {
    const title = `Pre category to re-icon (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('updateCategory', { title, newIcon: ['https://example.com/pre-new-icon.png'] })).toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
    expect(await call('updateCategory', { title, newIconClassName: 'glyphicon glyphicon-leaf' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(quiet);

  it('renames a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category to rename by id (${contract.host})` });
    expect(await call('updateCategoryAdvanced', { categoryId: id, newTitle: `Pre category renamed by id (${contract.host})`, newIconClassName: 'glyphicon glyphicon-leaf' }))
      .toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes several categories at once', async () => {
    const { categories } = await call('createCategoriesAdvanced', { categories: [{ title: `Pre categories to change one (${contract.host})` }, { title: `Pre categories to change two (${contract.host})` }] });
    expect(await call('updateCategoriesAdvanced', { categories: [
      { categoryId: categories[0].id, newTitle: `Pre categories changed one (${contract.host})` },
      { categoryId: categories[1].id, newIcon: ['https://example.com/pre-icon.png'] }
    ] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(quiet);

  it('removes a category by its title', async () => {
    const title = `Pre category to delete (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('deleteCategory', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category to delete by id (${contract.host})` });
    expect(await call('deleteCategoryAdvanced', { categoryId: id })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes several categories at once', async () => {
    const { categories } = await call('createCategoriesAdvanced', { categories: [{ title: `Pre categories to delete one (${contract.host})` }, { title: `Pre categories to delete two (${contract.host})` }] });
    expect(await call('deleteCategoriesAdvanced', { categories: categories.map((entry) => ({ categoryId: entry.id })) })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(quiet);

  it('adds a subcategory to a category named by its title', async () => {
    const categoryTitle = `Pre category with subcategories (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    expect(await call('createSubcategory', { categoryTitle, title: 'Pre gardens' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: 'Pre gardens' }));
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('adds a subcategory to a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category with a subcategory by id (${contract.host})` });
    expect(await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre museums' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), categoryId: id }));
  });
});

contract.describe('createSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds several subcategories at once', async () => {
    const { id } = await call('createCategory', { title: `Pre category with batch subcategories (${contract.host})` });
    expect(await call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: id, title: 'Pre one' }, { categoryId: id, title: 'Pre two' }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(quiet);

  it('renames a subcategory, naming both by their titles', async () => {
    const categoryTitle = `Pre category with a subcategory to rename (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    await call('createSubcategory', { categoryTitle, title: 'Pre old name' });
    expect(await call('updateSubcategory', { categoryTitle, title: 'Pre old name', newTitle: 'Pre new name' })).toEqual(jasmine.objectContaining({ title: 'Pre new name' }));
  });

  it("changes a subcategory's icon", async () => {
    const categoryTitle = `Pre category with a subcategory to re-icon (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    await call('createSubcategory', { categoryTitle, title: 'Pre iconed' });
    expect(await call('updateSubcategory', { categoryTitle, title: 'Pre iconed', newIcon: ['https://example.com/pre-sub.png'] })).toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
    expect(await call('updateSubcategory', { categoryTitle, title: 'Pre iconed', newIconClassName: 'glyphicon glyphicon-leaf' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('renames a subcategory by its ids', async () => {
    const { id } = await call('createCategory', { title: `Pre category with a subcategory to rename by id (${contract.host})` });
    const sub = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre old name' });
    expect(await call('updateSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id, newTitle: 'Pre new name', newIconClassName: 'glyphicon glyphicon-leaf' }))
      .toEqual(jasmine.objectContaining({ id: sub.id }));
  });
});

contract.describe('updateSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes several subcategories at once', async () => {
    const { id } = await call('createCategory', { title: `Pre category with batch changes (${contract.host})` });
    const one = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre one' });
    const two = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre two' });
    expect(await call('updateSubcategoriesAdvanced', { subcategories: [
      { categoryId: id, subcategoryId: one.id, newTitle: 'Pre uno' },
      { categoryId: id, subcategoryId: two.id, newIcon: ['https://example.com/pre-sub.png'] }
    ] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(quiet);

  it('removes a subcategory, naming both by their titles', async () => {
    const categoryTitle = `Pre category with a subcategory to delete (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    await call('createSubcategory', { categoryTitle, title: 'Pre going' });
    expect(await call('deleteSubcategory', { categoryTitle, title: 'Pre going' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: 'Pre going' }));
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes a subcategory by its ids', async () => {
    const { id } = await call('createCategory', { title: `Pre category with a subcategory to delete by id (${contract.host})` });
    const sub = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre going' });
    expect(await call('deleteSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id })).toEqual(jasmine.objectContaining({ id: sub.id }));
  });
});

contract.describe('deleteSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes several subcategories at once', async () => {
    const { id } = await call('createCategory', { title: `Pre category with batch deletes (${contract.host})` });
    const one = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre one' });
    const two = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre two' });
    expect(await call('deleteSubcategoriesAdvanced', { subcategories: [{ categoryId: id, subcategoryId: one.id }, { categoryId: id, subcategoryId: two.id }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(quiet);

  it('moves a subcategory, naming both by their titles', async () => {
    const categoryTitle = `Pre category to reorder (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    await call('createSubcategory', { categoryTitle, title: 'Pre first' });
    await call('createSubcategory', { categoryTitle, title: 'Pre second' });
    expect(await call('updateSubcategoryOrder', { categoryTitle, title: 'Pre second', position: 1 }))
      .toEqual(jasmine.objectContaining({ subcategories: [jasmine.objectContaining({ title: 'Pre second' }), jasmine.objectContaining({ title: 'Pre first' })] }));
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a subcategory by its ids', async () => {
    const { id } = await call('createCategory', { title: `Pre category to reorder by id (${contract.host})` });
    await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre first' });
    const second = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre second' });
    expect(await call('updateSubcategoryOrderAdvanced', { categoryId: id, subcategoryId: second.id, position: 1 }))
      .toEqual(jasmine.objectContaining({ categoryId: id }));
  });
});
