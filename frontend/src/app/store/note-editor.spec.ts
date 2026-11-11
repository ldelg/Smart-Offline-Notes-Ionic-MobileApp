import {
  editorTagsAfterAdd,
  editorTagsAfterRemove,
  noteEditorDirty,
} from './note-editor';

const saved = {
  title: 'Grocery list',
  body: 'Buy apples.\n\nWalk home.',
  tags: ['Home', 'Errands'],
};

describe('note editor dirty state', () => {
  it('is clean when the draft matches the saved note', () => {
    expect(noteEditorDirty(saved, { ...saved, tags: ['Errands', 'Home'] })).toBeFalse();
    expect(
      noteEditorDirty(saved, {
        title: '  Grocery list  ',
        body: 'Buy apples.\n\nWalk home.',
        tags: ['Home', 'Errands'],
      }),
    ).toBeFalse();
  });

  it('is dirty when the title or body changes, and clean again when reverted', () => {
    expect(noteEditorDirty(saved, { ...saved, title: 'Market list' })).toBeTrue();
    expect(noteEditorDirty(saved, { ...saved, body: 'Buy apples.' })).toBeTrue();
    expect(noteEditorDirty(saved, { ...saved, title: 'Market list' })).toBeTrue();
    expect(noteEditorDirty(saved, saved)).toBeFalse();
  });

  it('is dirty when tags change, and clean when they are put back', () => {
    const added = editorTagsAfterAdd(saved.tags, 'Work');
    expect(noteEditorDirty(saved, { ...saved, tags: added })).toBeTrue();
    const restored = editorTagsAfterRemove(added, 'Work');
    expect(noteEditorDirty(saved, { ...saved, tags: restored })).toBeFalse();

    const removed = editorTagsAfterRemove(saved.tags, 'Errands');
    expect(noteEditorDirty(saved, { ...saved, tags: removed })).toBeTrue();
    expect(editorTagsAfterAdd(saved.tags, '  home ')).toEqual(['Home', 'Errands']);
    expect(noteEditorDirty(saved, { ...saved, tags: ['home'] })).toBeTrue();
  });
});
