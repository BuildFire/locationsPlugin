// categories: every operation on categories and their subcategories, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
// Calls nothing here answers: the plugin's own bookkeeping, which the manifest never mentions, so the spies only answer.
const quietSideEffects = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
  spyOn(buildfire.analytics, 'registerEvent');
};
const created = jasmine.objectContaining({ id: jasmine.any(String) });
// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Pre category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp })
    : call('searchCategories', { title: forTheApp }).then(({ result: [record] }) => record || Promise.reject(new Error(`no category titled "${forTheApp}": the control run makes it`))));
  return madeCategory;
};

contract.describe('searchCategories', () => {
  beforeEach(quietSideEffects);

  it('finds a category by its name', async () => {
    await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp })).toEqual(jasmine.objectContaining({
      result: jasmine.arrayContaining([jasmine.objectContaining({ id: jasmine.any(String), data: jasmine.objectContaining({ title: forTheApp }) })]),
      totalRecord: jasmine.any(Number)
    }));
  });

  it('shows the first page of categories', async () => {
    await categoryForTheApp();
    expect(await call('searchCategories', { page: 0 })).toEqual(jasmine.objectContaining({ result: jasmine.any(Array), totalRecord: jasmine.any(Number) }));
  });
});

contract.describe('createCategory', () => {
  beforeEach(quietSideEffects);

  it('adds a category from its name', async () => {
    const title = `Pre category (${contract.host})`;
    expect(await call('createCategory', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('adds a category with a picture', async () => {
    const title = `Pre category with a picture (${contract.host})`;
    expect(await call('createCategory', { title, icon: ['https://example.com/pre-icon.png'] })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('adds a category with a font icon', async () => {
    const title = `Pre category with a font icon (${contract.host})`;
    expect(await call('createCategory', { title, iconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(quietSideEffects);

  it('adds several categories at once', async () => {
    const categories = [
      { title: `Pre batch category one (${contract.host})` },
      { title: `Pre batch category two (${contract.host})`, icon: ['https://example.com/pre-batch.png'] },
      { title: `Pre batch category three (${contract.host})`, iconName: 'glyphicon glyphicon-star' }
    ];
    expect(await call('createCategoriesAdvanced', { categories })).toEqual(jasmine.objectContaining({ succeeded: 3 }));
  });
});

contract.describe('updateCategory', () => {
  beforeEach(quietSideEffects);

  it('renames a category, naming it by its name', async () => {
    const title = `Pre category to rename (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('updateCategory', { title, newTitle: `Pre category renamed (${contract.host})` })).toEqual(created);
  });

  it('changes a category and its icon', async () => {
    const title = `Pre category to change (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('updateCategory', { title, newTitle: `Pre category changed (${contract.host})`, newIcon: ['https://example.com/pre-new.png'] })).toEqual(created);
  });

  it('gives a category a font icon', async () => {
    const title = `Pre category to give a font icon (${contract.host})`;
    await call('createCategory', { title, icon: ['https://example.com/pre-old.png'] });
    expect(await call('updateCategory', { title, newIconName: 'glyphicon glyphicon-heart' })).toEqual(created);
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it('renames a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category to rename by id (${contract.host})` });
    expect(await call('updateCategoryAdvanced', { categoryId: id, newTitle: `Pre category renamed by id (${contract.host})` })).toEqual(created);
  });

  it('changes a category and its icon by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category to change by id (${contract.host})` });
    expect(await call('updateCategoryAdvanced', { categoryId: id, newIconName: 'glyphicon glyphicon-heart' })).toEqual(created);
    expect(await call('updateCategoryAdvanced', { categoryId: id, newTitle: `Pre category changed by id (${contract.host})`, newIcon: ['https://example.com/pre-id.png'] })).toEqual(created);
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(quietSideEffects);

  it('changes several categories at once', async () => {
    const one = await call('createCategory', { title: `Pre batch category to change one (${contract.host})` });
    const two = await call('createCategory', { title: `Pre batch category to change two (${contract.host})` });
    expect(await call('updateCategoriesAdvanced', {
      categories: [
        { categoryId: one.id, newTitle: `Pre batch category changed one (${contract.host})` },
        { categoryId: two.id, newIcon: ['https://example.com/pre-batch-new.png'] }
      ]
    })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(quietSideEffects);

  it('removes a category, naming it by its name', async () => {
    const title = `Pre category to remove (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('deleteCategory', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), deleted: true }));
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it('removes a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category to remove by id (${contract.host})` });
    expect(await call('deleteCategoryAdvanced', { categoryId: id })).toEqual(jasmine.objectContaining({ id, deleted: true }));
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(quietSideEffects);

  it('removes several categories at once', async () => {
    const one = await call('createCategory', { title: `Pre batch category to remove one (${contract.host})` });
    const two = await call('createCategory', { title: `Pre batch category to remove two (${contract.host})` });
    expect(await call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: two.id }] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(quietSideEffects);

  it('adds a subcategory to a category named by its name', async () => {
    const categoryTitle = `Pre category with a subcategory (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    expect(await call('createSubcategory', { categoryTitle, title: 'Pre subcategory' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: 'Pre subcategory' }));
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it('adds a subcategory to a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category with a subcategory by id (${contract.host})` });
    expect(await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre subcategory by id' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), categoryId: id }));
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(quietSideEffects);

  it('renames a subcategory', async () => {
    const categoryTitle = `Pre category with a subcategory to rename (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    await call('createSubcategory', { categoryTitle, title: 'Pre subcategory to rename' });
    expect(await call('updateSubcategory', { categoryTitle, title: 'Pre subcategory to rename', newTitle: 'Pre subcategory renamed' })).toEqual(created);
  });

  it('changes a subcategory and its icon', async () => {
    const categoryTitle = `Pre category with a subcategory to change (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    await call('createSubcategory', { categoryTitle, title: 'Pre subcategory to change' });
    expect(await call('updateSubcategory', { categoryTitle, title: 'Pre subcategory to change', newIconName: 'glyphicon glyphicon-star' })).toEqual(created);
    expect(await call('updateSubcategory', {
      categoryTitle, title: 'Pre subcategory to change', newTitle: 'Pre subcategory changed', newIcon: ['https://example.com/pre-sub.png']
    })).toEqual(created);
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it('changes a subcategory by its ids', async () => {
    const category = await call('createCategory', { title: `Pre category with a subcategory to change by id (${contract.host})` });
    const subcategory = await call('createSubcategoryAdvanced', { categoryId: category.id, title: 'Pre subcategory to change by id' });
    expect(await call('updateSubcategoryAdvanced', { categoryId: category.id, subcategoryId: subcategory.id, newTitle: 'Pre subcategory changed by id' })).toEqual(created);
    expect(await call('updateSubcategoryAdvanced', {
      categoryId: category.id, subcategoryId: subcategory.id, newIcon: ['https://example.com/pre-sub-id.png'], newTitle: 'Pre subcategory changed again by id'
    })).toEqual(created);
    expect(await call('updateSubcategoryAdvanced', { categoryId: category.id, subcategoryId: subcategory.id, newIconName: 'glyphicon glyphicon-heart' })).toEqual(created);
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(quietSideEffects);

  it('removes a subcategory', async () => {
    const categoryTitle = `Pre category with a subcategory to remove (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    await call('createSubcategory', { categoryTitle, title: 'Pre subcategory to remove' });
    await call('createSubcategory', { categoryTitle, title: 'Pre subcategory to keep' });
    expect(await call('deleteSubcategory', { categoryTitle, title: 'Pre subcategory to remove' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), deleted: true }));
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it('removes a subcategory by its ids', async () => {
    const category = await call('createCategory', { title: `Pre category with a subcategory to remove by id (${contract.host})` });
    const subcategory = await call('createSubcategoryAdvanced', { categoryId: category.id, title: 'Pre subcategory to remove by id' });
    expect(await call('deleteSubcategoryAdvanced', { categoryId: category.id, subcategoryId: subcategory.id })).toEqual(jasmine.objectContaining({ id: subcategory.id, deleted: true }));
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(quietSideEffects);

  it('moves a subcategory to the top of its category', async () => {
    const categoryTitle = `Pre category to reorder (${contract.host})`;
    await call('createCategory', { title: categoryTitle });
    await call('createSubcategory', { categoryTitle, title: 'Pre first' });
    await call('createSubcategory', { categoryTitle, title: 'Pre second' });
    expect(await call('updateSubcategoryOrder', { categoryTitle, title: 'Pre second', position: 1 })).toEqual(jasmine.objectContaining({
      categoryId: jasmine.any(String),
      subcategories: jasmine.arrayContaining([jasmine.objectContaining({ title: 'Pre second' })])
    }));
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(quietSideEffects);

  it('moves a subcategory by its ids', async () => {
    const category = await call('createCategory', { title: `Pre category to reorder by id (${contract.host})` });
    await call('createSubcategoryAdvanced', { categoryId: category.id, title: 'Pre first by id' });
    const second = await call('createSubcategoryAdvanced', { categoryId: category.id, title: 'Pre second by id' });
    expect(await call('updateSubcategoryOrderAdvanced', { categoryId: category.id, subcategoryId: second.id, position: 1 }))
      .toEqual(jasmine.objectContaining({ categoryId: category.id, subcategories: jasmine.any(Array) }));
  });
});
