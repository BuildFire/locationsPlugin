// categories: every operation on categories and their subcategories, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
// The plugin's refresh message and analytics registration get no answer here: spies stand in for them and only answer.
const quiet = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
  if (buildfire.analytics && buildfire.analytics.registerEvent) spyOn(buildfire.analytics, 'registerEvent');
};
// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Pre category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp, subcategories: 'Pre first sub, Pre second sub' })
    : call('searchCategories', { title: forTheApp }).then(({ result }) => result[0]
      || Promise.reject(new Error(`no category named "${forTheApp}": the control run makes it`))));
  return madeCategory;
};
const named = (title) => jasmine.objectContaining({ result: jasmine.arrayContaining([jasmine.objectContaining({ data: jasmine.objectContaining({ title }) })]) });

contract.describe('searchCategories', () => {
  beforeEach(quiet);

  it('finds a category by its name', async () => {
    await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp })).toEqual(named(forTheApp));
  });

  it('finds a category by its name, on the first page', async () => {
    await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp, page: 0 })).toEqual(named(forTheApp));
  });
});

contract.describe('createCategory', () => {
  beforeEach(quiet);

  it('adds a category from its name', async () => {
    const title = `Pre category (${contract.host})`;
    expect(await call('createCategory', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('adds a category with its picture and subcategories', async () => {
    const title = `Pre category with subcategories (${contract.host})`;
    expect(await call('createCategory', { title, icon: ['https://example.com/pre-icon.png'], subcategories: 'Pre pizza, Pre sushi' }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('adds a category with a library icon', async () => {
    const title = `Pre category with an icon (${contract.host})`;
    expect(await call('createCategory', { title, iconName: 'glyphicon glyphicon-cutlery' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds several categories at once', async () => {
    expect(await call('createCategoriesAdvanced', {
      categories: [{ title: `Pre batch category one (${contract.host})` }, { title: `Pre batch category two (${contract.host})`, icon: ['https://example.com/pre-icon.png'], subcategories: 'Pre inner' }]
    })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateCategory', () => {
  beforeEach(quiet);

  it('renames a category, naming it by its name', async () => {
    const title = `Pre category to rename (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('updateCategory', { title, newTitle: `Pre category renamed (${contract.host})` })).toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
  });

  it("changes a category's icons", async () => {
    const title = `Pre category to change (${contract.host})`;
    await call('createCategory', { title, iconName: 'glyphicon glyphicon-cutlery' });
    expect(await call('updateCategory', { title, newIcon: ['https://example.com/pre-new-icon.png'], newIconName: null })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(quiet);

  it('changes a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category to change by id (${contract.host})` });
    expect(await call('updateCategoryAdvanced', { categoryId: id, newIconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes several categories at once', async () => {
    const one = await call('createCategory', { title: `Pre batch category to change one (${contract.host})` });
    const two = await call('createCategory', { title: `Pre batch category to change two (${contract.host})` });
    expect(await call('updateCategoriesAdvanced', { categories: [{ categoryId: one.id, newIconName: 'glyphicon glyphicon-star' }, { categoryId: two.id, newTitle: `Pre batch category changed (${contract.host})` }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(quiet);

  it('removes a category by its name', async () => {
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
    const one = await call('createCategory', { title: `Pre batch category to delete one (${contract.host})` });
    const two = await call('createCategory', { title: `Pre batch category to delete two (${contract.host})` });
    expect(await call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: two.id }] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(quiet);

  it('adds a subcategory to a category named by its name', async () => {
    const category = `Pre parent category (${contract.host})`;
    await call('createCategory', { title: category });
    expect(await call('createSubcategory', { category, title: 'Pre child' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: 'Pre child' }));
  });

  it('adds a subcategory with a picture', async () => {
    const category = `Pre parent with a picture (${contract.host})`;
    await call('createCategory', { title: category });
    expect(await call('createSubcategory', { category, title: 'Pre child with a picture', icon: ['https://example.com/pre-sub.png'] }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: 'Pre child with a picture' }));
  });

  it('adds a subcategory with a library icon', async () => {
    const category = `Pre parent with an icon (${contract.host})`;
    await call('createCategory', { title: category });
    expect(await call('createSubcategory', { category, title: 'Pre child with an icon', iconName: 'glyphicon glyphicon-star' }))
      .toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: 'Pre child with an icon' }));
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it("adds a subcategory to a category by the category's id", async () => {
    const { id } = await call('createCategory', { title: `Pre parent by id (${contract.host})` });
    expect(await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre child by id' })).toEqual(jasmine.objectContaining({ title: 'Pre child by id', categoryId: id }));
  });
});

contract.describe('createSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds several subcategories at once', async () => {
    const { id } = await call('createCategory', { title: `Pre parent of a batch (${contract.host})` });
    expect(await call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: id, title: 'Pre batch child one' }, { categoryId: id, title: 'Pre batch child two', iconName: 'glyphicon glyphicon-star' }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(quiet);

  it('renames a subcategory, naming both by their names', async () => {
    const category = `Pre parent to rename in (${contract.host})`;
    await call('createCategory', { title: category, subcategories: 'Pre old child' });
    expect(await call('updateSubcategory', { category, title: 'Pre old child', newTitle: 'Pre new child' })).toEqual(jasmine.objectContaining({ title: 'Pre new child' }));
  });

  it("changes a subcategory's icons", async () => {
    const category = `Pre parent to change in (${contract.host})`;
    await call('createCategory', { title: category, subcategories: 'Pre plain child' });
    expect(await call('updateSubcategory', { category, title: 'Pre plain child', newIcon: ['https://example.com/pre-sub.png'], newIconName: null }))
      .toEqual(jasmine.objectContaining({ title: 'Pre plain child' }));
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('changes a subcategory by its ids', async () => {
    const category = await call('createCategory', { title: `Pre parent to change by id (${contract.host})`, subcategories: 'Pre child to change' });
    expect(await call('updateSubcategoryAdvanced', { categoryId: category.id, subcategoryId: category.subcategories[0].id, newTitle: 'Pre child changed' }))
      .toEqual(jasmine.objectContaining({ title: 'Pre child changed' }));
  });
});

contract.describe('updateSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes several subcategories at once', async () => {
    const category = await call('createCategory', { title: `Pre parent of a batch change (${contract.host})`, subcategories: 'Pre child a, Pre child b' });
    const [a, b] = category.subcategories;
    expect(await call('updateSubcategoriesAdvanced', {
      subcategories: [{ categoryId: category.id, subcategoryId: a.id, newTitle: 'Pre child a2' }, { categoryId: category.id, subcategoryId: b.id, newIconName: 'glyphicon glyphicon-star' }]
    })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(quiet);

  it('removes a subcategory, naming both by their names', async () => {
    const category = `Pre parent to delete from (${contract.host})`;
    await call('createCategory', { title: category, subcategories: 'Pre child to delete, Pre child to keep' });
    expect(await call('deleteSubcategory', { category, title: 'Pre child to delete' })).toEqual(jasmine.objectContaining({ title: 'Pre child to delete' }));
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes a subcategory by its ids', async () => {
    const category = await call('createCategory', { title: `Pre parent to delete from by id (${contract.host})`, subcategories: 'Pre child gone' });
    expect(await call('deleteSubcategoryAdvanced', { categoryId: category.id, subcategoryId: category.subcategories[0].id }))
      .toEqual(jasmine.objectContaining({ title: 'Pre child gone' }));
  });
});

contract.describe('deleteSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes several subcategories at once', async () => {
    const category = await call('createCategory', { title: `Pre parent of a batch delete (${contract.host})`, subcategories: 'Pre child x, Pre child y, Pre child z' });
    const [x, y] = category.subcategories;
    expect(await call('deleteSubcategoriesAdvanced', { subcategories: [{ categoryId: category.id, subcategoryId: x.id }, { categoryId: category.id, subcategoryId: y.id }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(quiet);

  it('moves a subcategory to the top of its category', async () => {
    const category = `Pre parent to reorder (${contract.host})`;
    await call('createCategory', { title: category, subcategories: 'Pre first, Pre second' });
    expect(await call('updateSubcategoryOrder', { category, title: 'Pre second', position: 1 })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: category }));
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a subcategory by its ids', async () => {
    const category = await call('createCategory', { title: `Pre parent to reorder by id (${contract.host})`, subcategories: 'Pre one, Pre two' });
    expect(await call('updateSubcategoryOrderAdvanced', { categoryId: category.id, subcategoryId: category.subcategories[1].id, position: 1 }))
      .toEqual(jasmine.objectContaining({ id: category.id }));
  });
});
